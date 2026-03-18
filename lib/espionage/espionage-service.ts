// lib/espionage/espionage-service.ts
// Pillar 6 — Espionage & Subversion: operations, attribution, shadow economy.

import type {
    EspionageWorldState,
    EspionageOperation,
    OperationDomain,
    AttributionState,
    CounterIntelState,
    ShadowEconomyNode,
    RegionEscalation,
    AttributionRecord,
} from './espionage-types';
import type { GameWorldState } from '../game-world-state';
import { clampShared } from '../game-world-state';
import { eventBus } from '../movement/event-bus';
import config from '../movement/movement-config.json';
import { getDeepNetworkAttributionBonus, tickAgentNetworks } from './agent-service';

const espCfg = config.espionage;
const visCfg = config.visibility;

// ─── Operation lifecycle ───────────────────────────────────────────────────────

export interface LaunchResult {
    success: boolean;
    operation?: EspionageOperation;
    message: string;
}

/**
 * Launch a new espionage operation.
 * Validates investment level, computes duration, and queues for tick processing.
 */
export function launchOperation(
    actorFactionId: string,
    targetFactionId: string,
    targetRegionId: string,
    domain: OperationDomain,
    investmentLevel: number, // 0–1
    riskLevel: number,       // 0–1
    world: GameWorldState,
    unlockedTechIds: Set<string> = new Set()
): LaunchResult {
    // 0. Tech check
    if (domain === 'shadowEconomy' && !unlockedTechIds.has('dip_sha_1')) {
        return { success: false, message: 'Technology "Shadow Governance" required for this operation.' };
    }

    const now = world.nowSeconds;
    const domCfg = espCfg.domains[domain];
    const escalation = world.espionage.regionEscalation.get(targetRegionId);

    // Escalation check: if region recently saw many ops, raise risk
    const escalatedRisk = escalation
        ? Math.min(1, riskLevel + escalation.operationCount * espCfg.escalation.repeatOperationDetectionBonus)
        : riskLevel;

    const durationSeconds = domCfg.baseDurationHours * 3600 * (1 + (1 - investmentLevel));
    const id = `op-${actorFactionId}-${domain}-${Date.now()}`;

    const op: EspionageOperation = {
        id,
        actorFactionId,
        targetFactionId,
        targetRegionId,
        domain,
        investmentLevel,
        riskLevel: escalatedRisk,
        startedAt: toISO(now),
        completesAt: toISO(now + durationSeconds),
        status: 'active',
        attributionState: 'invisible',
    };

    world.espionage.operations.set(id, op);

    // Update escalation counter
    updateEscalation(targetRegionId, world.espionage, now);

    return { success: true, operation: op, message: `Operation ${id} launched` };
}

function updateEscalation(regionId: string, esp: EspionageWorldState, now: number): void {
    const existing = esp.regionEscalation.get(regionId);
    if (existing) {
        existing.operationCount++;
        existing.lastOperationAt = toISO(now);
    } else {
        esp.regionEscalation.set(regionId, {
            regionId,
            operationCount: 1,
            lastOperationAt: toISO(now),
        });
    }
}

// ─── Tick operations ──────────────────────────────────────────────────────────

/**
 * Advance all pending/active operations. Resolve those whose completesAt has passed.
 * Applies escalation tension and instability side-effects.
 */
export function tickOperations(
    world: GameWorldState,
    deltaSeconds: number
): void {
    const now = world.nowSeconds;
    const hours = deltaSeconds / 3600;

    // Cool down escalation counters
    for (const [regionId, esc] of world.espionage.regionEscalation) {
        const lastOpAt = fromISO(esc.lastOperationAt);
        const cooldownSeconds = espCfg.escalation.regionCooldownHours * 3600;
        if (now - lastOpAt > cooldownSeconds) {
            esc.operationCount = Math.max(0, esc.operationCount - 1);
        }
    }

    // Accumulate passive espionage pressure from active operations in each region
    const activePressure = new Map<string, number>();
    for (const op of world.espionage.operations.values()) {
        if (op.status !== 'active') continue;
        const existing = activePressure.get(op.targetRegionId) ?? 0;
        activePressure.set(op.targetRegionId, existing + op.investmentLevel * 0.05 * hours);
    }

    // Write global espionage pressure to shared state
    let totalPressure = 0;
    for (const v of activePressure.values()) totalPressure += v;
    world.shared.espionagePressure = clampShared(
        world.shared.espionagePressure + totalPressure - 0.01 * hours // slow passive decay
    );

    // Resolve completed operations
    for (const op of world.espionage.operations.values()) {
        if (op.status !== 'active') continue;
        const completesAt = fromISO(op.completesAt);
        if (now < completesAt) continue;

        resolveOperation(op, world);
    }

    // Phase 15: tick agent networks (build strength, decay, promote FoW levels)
    tickAgentNetworks(world, deltaSeconds);
}

function resolveOperation(op: EspionageOperation, world: GameWorldState): void {
    const domCfg = espCfg.domains[op.domain];
    const escalation = world.espionage.regionEscalation.get(op.targetRegionId);

    // Success check: base rate × investment modifier
    const successChance = domCfg.baseSuccessRate * (0.5 + op.investmentLevel * 0.5);
    const succeeded = Math.random() < successChance;

    op.succeeded = succeeded;
    op.status = succeeded ? 'resolved' : 'failed';

    // Attribution resolution
    const attribution = resolveAttribution(op, world);
    op.attributionState = attribution;

    // Record
    const record: AttributionRecord = {
        operationId: op.id,
        suspectedFactionId: op.actorFactionId,
        attributionState: attribution,
        probability: computeAttributionProbability(op, world),
        tensionApplied: attribution === 'exposed' ? espCfg.attribution.diplomaticPenaltyOnExpose :
            attribution === 'suspected' ? espCfg.attribution.tensionIncreaseOnSuspected : 0,
        resolvedAt: toISO(world.nowSeconds),
    };
    world.espionage.attributionRecords.push(record);

    if (succeeded) {
        applyOperationEffect(op, world);
        op.narrative = buildNarrative(op.domain, true, attribution);
    } else {
        op.narrative = buildNarrative(op.domain, false, attribution);
    }
}

function buildNarrative(domain: OperationDomain, success: boolean, attribution: AttributionState): string {
    const domLabel = { infrastructureSabotage: 'infrastructure sabotage', politicalSubversion: 'political subversion', shadowEconomy: 'shadow economy' }[domain];
    if (!success) return `${domLabel} operation failed attempt`;
    return attribution === 'invisible' ? `${domLabel} operation succeeded undetected` :
        attribution === 'suspected' ? `${domLabel} operation succeeded; origin suspected but unconfirmed` :
            `${domLabel} operation succeeded; actor exposed and diplomatic consequences applied`;
}

// ─── Attribution resolution ───────────────────────────────────────────────────

/**
 * Determine attribution state from a deterministic weighted formula.
 * No random-only detection: sensor strength, region stability, counter-intel,
 * and risk level all contribute.
 */
export function resolveAttribution(
    op: EspionageOperation,
    world: GameWorldState
): AttributionState {
    const prob = computeAttributionProbability(op, world);
    if (prob >= espCfg.attribution.exposedThreshold) return 'exposed';
    if (prob >= espCfg.attribution.suspectedThreshold) return 'suspected';
    return 'invisible';
}

export function computeAttributionProbability(
    op: EspionageOperation,
    world: GameWorldState
): number {
    const attr = espCfg.attribution;

    // Sensor strength at target region
    const targetSys = world.movement.systems.get(op.targetRegionId);
    const sensorStrength = targetSys
        ? Math.max(...world.movement.sensorSources
            .filter(s => s.systemId === op.targetRegionId)
            .map(s => s.detectionStrength), 0)
        : 0;

    // Region stability (high instability = harder to detect covert ops)
    const regionStability = targetSys ? 1 - targetSys.instability / 100 : 0.5;

    // Counter-intel investment by the target faction
    const ciState = world.espionage.counterIntel.get(op.targetFactionId);
    const ciLevel = ciState?.regionalInvestment.get(op.targetRegionId) ?? 0;

    // Escalation multiplier
    const escalation = world.espionage.regionEscalation.get(op.targetRegionId);
    const escalationMult = escalation && escalation.operationCount > 1
        ? attr.repeatedActivityMultiplier
        : 1.0;

    const rawScore = (
        sensorStrength * attr.sensorStrengthWeight +
        regionStability * attr.regionStabilityWeight +
        ciLevel * attr.counterIntelWeight +
        op.riskLevel * attr.operationRiskWeight
    ) * escalationMult;

    // Phase 15: if the TARGET faction has a deep intel network in this system,
    // they have better visibility — attribution probability rises by 20%
    const deepNetworkBonus = getDeepNetworkAttributionBonus(
        op.targetRegionId,
        op.targetFactionId,
        world
    );

    return Math.min(1, rawScore + deepNetworkBonus);
}

// ─── Apply operation effects ──────────────────────────────────────────────────

/**
 * Apply the domain-specific effect of a successful operation to the world state.
 */
export function applyOperationEffect(
    op: EspionageOperation,
    world: GameWorldState
): void {
    const domCfg = espCfg.domains[op.domain];
    const now = world.nowSeconds;

    switch (op.domain) {
        case 'infrastructureSabotage': {
            const effects = domCfg.effects as Record<string, number>;
            // Disrupt nearest trade segment in target region
            const seg = [...world.movement.tradeSegments.values()].find(
                s => s.fromSystemId === op.targetRegionId || s.toSystemId === op.targetRegionId
            );
            if (seg) {
                seg.status = 'disrupted';
                seg.isFlashing = true;
                seg.integrity = Math.max(0, seg.integrity - effects.tradeDisruptionIntensity);
            }
            // Gate destabilization
            const gate = [...world.movement.gates.values()].find(
                g => g.systemId === op.targetRegionId
            );
            if (gate && Math.random() < effects.gateDestabilizationRisk) {
                gate.state = 'unstable';
                gate.integrity = Math.max(0, gate.integrity - 0.2);
            }
            // Corridor sensor interference — emit event (separate UI layer picks up)
            eventBus.emit({
                type: 'infrastructureAttack',
                actionType: 'sabotageGate',
                targetId: op.targetRegionId,
                attackerFactionId: op.actorFactionId,
                severity: op.investmentLevel,
                timestamp: now,
            });
            break;
        }

        case 'politicalSubversion': {
            const effects = domCfg.effects as Record<string, number>;
            // Reduce bloc satisfaction in target faction
            const targetPosture = world.movement.empirePostures.get(op.targetFactionId);
            if (targetPosture) {
                for (const bloc of targetPosture.blocs) {
                    bloc.satisfaction = Math.max(0, bloc.satisfaction + effects.blocDissatisfactionDelta);
                }
            }
            // Frontier unrest drift
            for (const claim of world.movement.frontierClaims) {
                if (claim.factionId === op.targetFactionId) {
                    const sys = world.movement.systems.get(claim.systemId);
                    if (sys) sys.instability = Math.min(100, sys.instability + effects.frontierUnrestDrift * 10);
                }
            }
            // War fatigue drift
            world.shared.warFatigue = Math.min(100, world.shared.warFatigue + effects.warFatigueDrift * 10);
            break;
        }

        case 'shadowEconomy': {
            const effects = domCfg.effects as Record<string, number>;
            const expiresAt = toISO(now + 48 * 3600); // shadow nodes decay after 48h
            const node: ShadowEconomyNode = {
                systemId: op.targetRegionId,
                factionId: op.actorFactionId,
                piracyChancePerHour: effects.piracySpawnChance,
                smugglingCapacity: effects.smugglingRouteCapacity,
                insuranceCostInflation: effects.tradeInsuranceCostInflation,
                expiresAt,
            };
            world.espionage.shadowEconomyNodes.set(op.targetRegionId, node);
            // Insurance inflation hurts trade efficiency
            world.shared.tradeEfficiency = clampShared(
                world.shared.tradeEfficiency - effects.tradeInsuranceCostInflation * op.investmentLevel
            );
            break;
        }
    }

    // Apply attribution consequences
    if (op.attributionState === 'suspected') {
        // Diplomatic tension increase — emitted for UI layer
        world.shared.stability = clampShared(
            world.shared.stability - espCfg.attribution.tensionIncreaseOnSuspected / 100
        );
    }
    if (op.attributionState === 'exposed') {
        world.shared.stability = clampShared(
            world.shared.stability - espCfg.attribution.diplomaticPenaltyOnExpose / 100
        );
    }
}

// ─── Escalation effects ───────────────────────────────────────────────────────

/**
 * Get current espionage pressure for a specific region (0–1).
 */
export function getEspionagePressure(regionId: string, world: GameWorldState): number {
    const escalation = world.espionage.regionEscalation.get(regionId);
    if (!escalation) return 0;
    const baseFromCount = Math.min(1, escalation.operationCount * espCfg.escalation.repeatOperationDetectionBonus);
    const recencyBoost = world.nowSeconds - fromISO(escalation.lastOperationAt) < 3600 ? 0.1 : 0;
    return Math.min(1, baseFromCount + recencyBoost);
}

// ─── Tick shadow economy ──────────────────────────────────────────────────────

/**
 * Advance shadow economy nodes: expire old ones, apply ongoing piracy effects.
 */
export function tickShadowEconomy(world: GameWorldState, deltaSeconds: number): void {
    const now = world.nowSeconds;
    const hours = deltaSeconds / 3600;

    for (const [sysId, node] of world.espionage.shadowEconomyNodes) {
        if (fromISO(node.expiresAt) < now) {
            world.espionage.shadowEconomyNodes.delete(sysId);
            continue;
        }
        // Ongoing trade suppression from smuggling
        world.shared.tradeEfficiency = clampShared(
            world.shared.tradeEfficiency - node.smugglingCapacity * 0.002 * hours
        );
    }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function toISO(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toISOString();
}

function fromISO(iso: string): number {
    return new Date(iso).getTime() / 1000;
}
