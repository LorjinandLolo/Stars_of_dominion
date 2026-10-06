/**
 * lib/espionage/agent-service.ts
 * Phase 15 — Espionage Agency: Agent lifecycle & Intel Network simulation.
 *
 * All functions are pure and deterministic on top of GameWorldState.
 * No random() calls except in generateRecruitPool (acceptable for variety).
 */

import {
    SpyAgent,
    AgentTraitId,
    AgentCandidate,
    IntelNetwork,
    NetworkPenetrationLevel,
    VisibilityLevel,
    AgentStatus,
    recruitCostForTraits,
} from './agent-types';
import type { GameWorldState } from '../game-world-state';
import { updateInfiltration } from './faction-intel';

// ─── Configuration ────────────────────────────────────────────────────────────

const NETWORK_BUILD_RATE_PER_HOUR = 0.03;     // strength gained per agent per hour
const NETWORK_DECAY_RATE_PER_HOUR = 0.01;     // strength lost per hour with no agents
// Empire-level infiltration gained per hour from an active network in a system
// owned by another faction, scaled by network strength (~1–3/day). This is the
// main path up the network stages (Recon Cell → ... → Shadow Government).
const INFILTRATION_GROWTH_PER_HOUR = 0.12;
const COVER_DECAY_PER_OP = 0.10;              // cover drops 10% each op
const LOYALTY_DECAY_RATE_PER_HOUR = 0.0005;  // slow passive decay in hostile systems
const AGENT_COOLDOWN_HOURS = 12;             // hours after an op before agent is available
const RECRUIT_POOL_SIZE = 3;

// Penetration level thresholds
const PENETRATION_THRESHOLDS: Record<NetworkPenetrationLevel, number> = {
    none: 0,
    rumor: 0.25,
    confirmed: 0.50,
    deep: 0.80,
};

// ─── Recruit Pool ─────────────────────────────────────────────────────────────

const CODENAMES = [
    'Viper', 'Wraith', 'Phantom', 'Jackal', 'Cipher', 'Raven', 'Shade',
    'Specter', 'Mirage', 'Eclipse', 'Dagger', 'Tempest', 'Lynx', 'Falcon', 'Obsidian',
];
const NAMES = [
    'Ara Vasquez', 'Dex Okafor', 'Sienna Lark', 'Milo Chen', 'Petra Roth',
    'Tariq Nour', 'Lena Voss', 'Kalen Drake', 'Naya Solis', 'Ivar Strand',
];
const ALL_TRAIT_IDS: AgentTraitId[] = [
    'ghost', 'brutal', 'seducer', 'economist', 'double_agent', 'veteran', 'compromised'
];

/**
 * Generate a pool of recruitment candidates for a faction to choose from.
 * Uses Math.random() — call this only when the player opens the recruitment tab,
 * not on every tick, to keep the simulation deterministic.
 */
export function generateRecruitPool(factionId: string, nowSeconds: number): AgentCandidate[] {
    const candidates: AgentCandidate[] = [];

    for (let i = 0; i < RECRUIT_POOL_SIZE; i++) {
        const nameIdx = Math.floor(Math.random() * NAMES.length);
        const codenameIdx = Math.floor(Math.random() * CODENAMES.length);

        // Each candidate gets 1–3 random traits (no repeats)
        const shuffled = [...ALL_TRAIT_IDS].sort(() => Math.random() - 0.5);
        const traitCount = 1 + Math.floor(Math.random() * 3); // 1, 2, or 3
        const traitIds = shuffled.slice(0, traitCount) as AgentTraitId[];

        // Cost scales with number of desirable traits (shared with the worker,
        // which re-prices every recruit order from its traits).
        const cost = recruitCostForTraits(traitIds);

        candidates.push({
            id: `candidate-${factionId}-${nowSeconds}-${i}`,
            name: NAMES[nameIdx],
            codename: CODENAMES[codenameIdx],
            traitIds,
            recruitmentCost: cost,
            expiresInDays: 7,
        });
    }

    return candidates;
}

// ─── Agent Lifecycle ──────────────────────────────────────────────────────────

/**
 * Formally recruit a candidate, turning them into a full SpyAgent.
 * Deducts recruitment cost from world state (caller's responsibility to budget-check first).
 */
export function recruitAgent(
    candidate: AgentCandidate,
    ownerFactionId: string,
    nowSeconds: number,
    world: GameWorldState
): SpyAgent {
    const agent: SpyAgent = {
        id: `agent-${candidate.codename.toLowerCase().replace(' ', '-')}-${nowSeconds}`,
        name: candidate.name,
        codename: candidate.codename,
        ownerFactionId,
        traitIds: candidate.traitIds,
        experienceLevel: 5, // fresh recruit starts with minimal XP
        status: 'available',
        deployedToSystemId: null,
        coverStrength: 1.0,
        loyaltyRating: 0.95, // new agents start very loyal
        cooldownUntil: null,
        operationsRun: 0,
        lastOperationAt: null,
    };

    world.espionage.agents.set(agent.id, agent);
    return agent;
}

/**
 * Deploy an agent to a system to begin building an Intel Network there.
 * Creates a new IntelNetwork if none exists; adds agent to existing one.
 */
export function deployAgent(
    agent: SpyAgent,
    systemId: string,
    world: GameWorldState
): { ok: boolean; message: string } {
    // Deploying means one thing: build a network in a system. It used to take
    // a "domain" too, which was stored on the agent and read by nothing.
    if (agent.status !== 'available') {
        return { ok: false, message: `${agent.codename} is not available (${agent.status.replace('_', ' ')}).` };
    }
    if (!world.movement?.systems?.get?.(systemId)) {
        return { ok: false, message: 'That system is not on the map.' };
    }

    agent.status = 'deployed';
    agent.deployedToSystemId = systemId;

    // Create or update the Intel Network for this system
    const networkKey = `${agent.ownerFactionId}:${systemId}`;
    let network = world.espionage.intelNetworks.get(networkKey);

    if (!network) {
        network = {
            id: networkKey,
            ownerFactionId: agent.ownerFactionId,
            systemId,
            strength: 0.05, // small bootstrap from the agent's arrival
            penetrationLevel: 'none',
            agentIds: [],
            activeUntil: world.nowSeconds + 30 * 24 * 3600, // 30-day window
        };
        world.espionage.intelNetworks.set(networkKey, network);
    }

    if (!network.agentIds.includes(agent.id)) {
        network.agentIds.push(agent.id);
    }
    // Refresh the network's active window
    network.activeUntil = world.nowSeconds + 30 * 24 * 3600;
    return { ok: true, message: `${agent.codename} deployed.` };
}

/**
 * Recall an agent from the field. They go on cooldown briefly.
 * The network remains but starts decaying if they were the last agent.
 */
export function recallAgent(agent: SpyAgent, world: GameWorldState): void {
    if (agent.status !== 'deployed') return;

    const networkKey = `${agent.ownerFactionId}:${agent.deployedToSystemId}`;
    const network = world.espionage.intelNetworks.get(networkKey);
    if (network) {
        network.agentIds = network.agentIds.filter(id => id !== agent.id);
    }

    agent.status = 'on_cooldown';
    agent.cooldownUntil = world.nowSeconds + AGENT_COOLDOWN_HOURS * 3600;
    agent.deployedToSystemId = null;
}

/**
 * Burn an agent (cover blown). The associated network collapses immediately.
 */
export function burnAgent(agent: SpyAgent, world: GameWorldState): void {
    agent.status = 'burned';
    agent.coverStrength = 0;

    if (agent.deployedToSystemId) {
        const networkKey = `${agent.ownerFactionId}:${agent.deployedToSystemId}`;
        const network = world.espionage.intelNetworks.get(networkKey);
        if (network) {
            network.agentIds = network.agentIds.filter(id => id !== agent.id);
            // Collapse the network strength if this was the only agent
            if (network.agentIds.length === 0) {
                network.strength = Math.max(0, network.strength - 0.40);
                recomputePenetrationLevel(network);
            }
        }
    }

    agent.deployedToSystemId = null;
}

/** Extra cover an agent loses when the operation they ran is exposed. */
export const EXPOSED_COVER_LOSS = 0.25;

/**
 * Apply XP and cover degradation to an agent after an operation resolves.
 * Called from catalog resolution (resolveCatalogOperation) for the agent the
 * operation named.
 */
export function applyAgentOpConsequences(
    agent: SpyAgent,
    succeeded: boolean,
    riskLevel: number,
    nowSeconds: number,
    world: GameWorldState,
    exposed = false
): void {
    agent.operationsRun += 1;
    agent.lastOperationAt = nowSeconds;

    // Cover degrades proportional to risk, and badly when the job was blown.
    const coverLoss = COVER_DECAY_PER_OP * (0.5 + riskLevel * 0.5) + (exposed ? EXPOSED_COVER_LOSS : 0);
    agent.coverStrength = Math.max(0, agent.coverStrength - coverLoss);

    // Gain XP (more for success, some for failure — learning experience)
    const baseXP = succeeded ? 8 : 3;
    const xpMult = agent.traitIds.includes('veteran') ? 1.5 : 1.0;
    agent.experienceLevel = Math.min(100, agent.experienceLevel + baseXP * xpMult);

    // If cover has collapsed, agent is burned
    if (agent.coverStrength <= 0) {
        burnAgent(agent, world);
    } else {
        // Brief cooldown after any op
        agent.status = 'on_cooldown';
        agent.cooldownUntil = nowSeconds + AGENT_COOLDOWN_HOURS * 3600;
        agent.deployedToSystemId = agent.deployedToSystemId; // stays linked while cooling
    }
}

// ─── Network Tick ─────────────────────────────────────────────────────────────

/**
 * Advance all Intel Networks and agent states.
 * Call once per sim tick from the espionage tick orchestrator.
 */
export function tickAgentNetworks(world: GameWorldState, deltaSeconds: number): void {
    const now = world.nowSeconds;
    const hours = deltaSeconds / 3600;

    // Operations an agent may be tied up in. Resolution normally frees the
    // agent; this catches an operation that vanished without resolving (a
    // pruned or hand-edited snapshot), so nobody is stuck "on operation".
    const liveOpAgents = new Set<string>();
    for (const op of world.espionage.operations.values()) {
        if (op.agentId && (op.status === 'active' || op.status === 'pending')) liveOpAgents.add(op.agentId);
    }

    // 1. Release agents from cooldown
    for (const agent of world.espionage.agents.values()) {
        if (agent.status === 'on_operation' && !liveOpAgents.has(agent.id)) {
            agent.status = 'available';
        }
        if (agent.status === 'on_cooldown' && agent.cooldownUntil !== null && now >= agent.cooldownUntil) {
            agent.status = 'available';
            agent.cooldownUntil = null;
        }

        // Slow loyalty decay while deployed in any hostile system
        if (agent.status === 'deployed') {
            agent.loyaltyRating = Math.max(0, agent.loyaltyRating - LOYALTY_DECAY_RATE_PER_HOUR * hours);
        }
    }

    // 2. Tick Intel Networks
    for (const [key, network] of world.espionage.intelNetworks) {
        const hasActiveAgents = network.agentIds.length > 0;

        if (hasActiveAgents) {
            // Verify agents are still actually deployed (might have been burned/recalled)
            network.agentIds = network.agentIds.filter(id => {
                const a = world.espionage.agents.get(id);
                return a && (a.status === 'deployed' || a.status === 'on_cooldown');
            });

            const verifiedAgents = network.agentIds.length;
            if (verifiedAgents > 0) {
                // Each active agent contributes to the network's growth
                const growthRate = verifiedAgents * NETWORK_BUILD_RATE_PER_HOUR * hours;
                network.strength = Math.min(1.0, network.strength + growthRate);
                network.activeUntil = now + 30 * 24 * 3600; // refresh window

                // Staffed network on foreign soil feeds empire-level infiltration
                // against the system's owner.
                const ownerId = world.movement.systems.get(network.systemId)?.ownerFactionId;
                if (ownerId && ownerId !== network.ownerFactionId) {
                    updateInfiltration(
                        world,
                        network.ownerFactionId,
                        ownerId,
                        INFILTRATION_GROWTH_PER_HOUR * network.strength * hours
                    );
                }
            } else {
                // All agents gone — start decaying
                decayNetwork(network, hours);
            }
        } else {
            // No agents assigned
            if (now > network.activeUntil) {
                // Past the grace period — decay
                decayNetwork(network, hours);
            }
        }

        // Remove fully collapsed networks to save memory
        if (network.strength <= 0) {
            world.espionage.intelNetworks.delete(key);
            continue;
        }

        recomputePenetrationLevel(network);
    }
}

// ─── Fog of War ───────────────────────────────────────────────────────────────

/**
 * Determine what an observing faction can see in a given system.
 * This is the core Fog of War gate — used by the Galactic Map renderer
 * and the espionage attribution engine.
 */
export function getSystemVisibility(
    systemId: string,
    observingFactionId: string,
    world: GameWorldState
): VisibilityLevel {
    // If the faction owns the system, full transparency always
    const system = world.movement.systems.get(systemId);
    if (system?.ownerFactionId === observingFactionId) return 'transparent';

    const networkKey = `${observingFactionId}:${systemId}`;
    const network = world.espionage.intelNetworks.get(networkKey);

    if (!network || network.penetrationLevel === 'none') return 'dark';
    if (network.penetrationLevel === 'rumor') return 'rumor';
    if (network.penetrationLevel === 'confirmed') return 'confirmed';
    return 'transparent'; // 'deep' network = fully transparent
}

/**
 * Compute the bonus attribution probability modifier applied when an
 * enemy faction has a deep intel network in the target system.
 * Integrated into `computeAttributionProbability` in espionage-service.ts.
 */
export function getDeepNetworkAttributionBonus(
    systemId: string,
    targetFactionId: string,
    world: GameWorldState
): number {
    // Find any network in this system owned by the TARGET faction (they have eyes here)
    for (const network of world.espionage.intelNetworks.values()) {
        if (network.systemId === systemId &&
            network.ownerFactionId === targetFactionId &&
            network.penetrationLevel === 'deep') {
            return 0.20; // +20% attribution probability when target has deep intel here
        }
    }
    return 0;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function decayNetwork(network: IntelNetwork, hours: number): void {
    network.strength = Math.max(0, network.strength - NETWORK_DECAY_RATE_PER_HOUR * hours);
}

function recomputePenetrationLevel(network: IntelNetwork): void {
    if (network.strength >= PENETRATION_THRESHOLDS.deep) {
        network.penetrationLevel = 'deep';
    } else if (network.strength >= PENETRATION_THRESHOLDS.confirmed) {
        network.penetrationLevel = 'confirmed';
    } else if (network.strength >= PENETRATION_THRESHOLDS.rumor) {
        network.penetrationLevel = 'rumor';
    } else {
        network.penetrationLevel = 'none';
    }
}

/**
 * Knock a network back (a counter-intelligence sweep found it). Returns the
 * strength removed. The network keeps its agents; item 12a decides whether a
 * sweep can also take them.
 */
export function weakenNetwork(network: IntelNetwork, amount: number): number {
    const before = network.strength;
    network.strength = Math.max(0, network.strength - amount);
    recomputePenetrationLevel(network);
    return before - network.strength;
}
