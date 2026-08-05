// lib/espionage/espionage-service.ts
// Pillar 6 — Espionage & Subversion: operations, attribution, shadow economy.

import type {
    EspionageWorldState,
    EspionageOperation,
    OperationDomain,
    AttributionState,
    ShadowEconomyNode,
    RegionEscalation,
    AttributionRecord,
} from './espionage-types';
import type { GameWorldState } from '../game-world-state';
import { clampShared } from '../game-world-state';
import { eventBus } from '../movement/event-bus';
import config from '../movement/movement-config.json';
import { getDeepNetworkAttributionBonus, tickAgentNetworks } from './agent-service';
import { OPERATION_CATALOG_BY_ID, domainForCategory } from './operation-catalog';
import type { OperationDefinition, OperationRisk } from './operation-catalog';
import { getOrCreateFactionIntel, updateInfiltration } from './faction-intel';
import { canLaunchCategory, stageInfo } from './network-stages';
import { generateReportForOperation, pruneExpiredReports } from './intel-reports';
import { triggerCrisis } from '../crisis-manager';
import { pushWorldStory, adjustPublicTrust } from '../press-system/integration';
import { StorySource, StoryTruth } from '../press-system/types';
import { shiftRivalry } from '../diplomacy/offer-service';
// Government Phase 5: political warfare reaches the rival's institutions.
import { CABINET_PORTFOLIOS } from '../government/types';
import { getMinister } from '../government/cabinet-service';
import { resolveSuccession } from '../government/succession-service';
import { recordPoliticalEvent } from '../government/ideology-drift';

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

/** Bridge catalog risk tiers onto the legacy 0–1 riskLevel scale. */
const RISK_LEVEL_VALUES: Record<OperationRisk, number> = {
    low: 0.25,
    medium: 0.5,
    high: 0.75,
    extreme: 1.0,
};

/**
 * Launch a catalog-defined covert operation (consolidated path).
 * Costs Intel from the actor's FactionIntelState and occupies operation
 * capacity until resolution. Resolution happens in tickOperations.
 */
export function launchCatalogOperation(
    actorFactionId: string,
    targetFactionId: string,
    targetRegionId: string,
    definitionId: string,
    world: GameWorldState
): LaunchResult {
    const def = OPERATION_CATALOG_BY_ID.get(definitionId);
    if (!def) return { success: false, message: `Unknown operation definition: ${definitionId}` };

    const intel = getOrCreateFactionIntel(world, actorFactionId);

    // Network stage gate: advanced categories need deeper infiltration.
    const infiltration = intel.infiltrationLevels[targetFactionId] ?? 0;
    const gate = canLaunchCategory(infiltration, def.category);
    if (!gate.allowed) {
        return {
            success: false,
            message: `${def.name} requires a ${stageInfo(gate.requiredStage).label} network (current: ${stageInfo(gate.currentStage).label}).`,
        };
    }

    if (intel.usedAgentCapacity >= intel.agentCapacity) {
        return { success: false, message: 'Maximum operation capacity reached.' };
    }
    if (intel.intelPoints < def.intelCost) {
        return { success: false, message: 'Insufficient Intel.' };
    }

    intel.intelPoints -= def.intelCost;
    intel.usedAgentCapacity += 1;

    const now = world.nowSeconds;
    const durationHours = def.durationHoursMin + Math.random() * (def.durationHoursMax - def.durationHoursMin);
    const id = `op-${actorFactionId}-${def.id}-${Date.now()}`;

    const op: EspionageOperation = {
        id,
        actorFactionId,
        targetFactionId,
        targetRegionId,
        domain: domainForCategory(def.category),
        definitionId: def.id,
        investmentLevel: 0.5,
        riskLevel: RISK_LEVEL_VALUES[def.risk],
        startedAt: toISO(now),
        completesAt: toISO(now + durationHours * 3600),
        status: 'active',
        attributionState: 'invisible',
    };

    world.espionage.operations.set(id, op);
    updateEscalation(targetRegionId, world.espionage, now);

    return { success: true, operation: op, message: `Operation ${def.name} launched.` };
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

    // Prune long-resolved operations. Operations persist (global snapshot +
    // faction shards), so without this the map grows for the life of a season.
    const PRUNE_AFTER_SECONDS = 72 * 3600;
    for (const [id, op] of world.espionage.operations) {
        if (op.status === 'active' || op.status === 'pending') continue;
        if (now - fromISO(op.completesAt) > PRUNE_AFTER_SECONDS) {
            world.espionage.operations.delete(id);
        }
    }

    // Stale intelligence ages out.
    pruneExpiredReports(world);

    // Phase 15: tick agent networks (build strength, decay, promote FoW levels)
    tickAgentNetworks(world, deltaSeconds);
}

function resolveOperation(op: EspionageOperation, world: GameWorldState): void {
    // Consolidated path: catalog-defined ops resolve on catalog numbers.
    if (op.definitionId) {
        const def = OPERATION_CATALOG_BY_ID.get(op.definitionId);
        if (def) {
            resolveCatalogOperation(op, def, world);
            return;
        }
    }

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

// ─── Catalog operation resolution (consolidated path) ─────────────────────────

type CatalogOutcome = 'critical_success' | 'success' | 'partial_success' | 'failure' | 'exposed_failure' | 'backfire';

function catalogSucceeded(outcome: CatalogOutcome): boolean {
    return outcome === 'critical_success' || outcome === 'success' || outcome === 'partial_success';
}

function computeCatalogSuccessChance(def: OperationDefinition, actorId: string, targetId: string, world: GameWorldState): number {
    const actorIntel = world.espionage.factionIntel.get(actorId);
    const targetIntel = world.espionage.factionIntel.get(targetId);

    const infiltration = actorIntel?.infiltrationLevels[targetId] ?? 0;
    const infiltrationBonus = infiltration / 200; // max +0.5 at 100 infiltration

    const counterIntelPenalty = (targetIntel?.counterIntelStrength ?? 0) / 200;
    const securityPenalty = (targetIntel?.internalSecurity ?? 0) / 200;

    const chance = def.baseSuccessChance + infiltrationBonus - counterIntelPenalty - securityPenalty;
    return Math.max(0.05, Math.min(0.95, chance));
}

function computeCatalogExposureChance(def: OperationDefinition, targetId: string, world: GameWorldState): number {
    const targetIntel = world.espionage.factionIntel.get(targetId);
    let chance = def.baseExposureChance + (targetIntel?.surveillanceStrength ?? 0) / 100;

    if (def.risk === 'extreme') chance += 0.3;
    if (def.risk === 'high') chance += 0.15;
    if (def.risk === 'low') chance -= 0.05;

    return Math.max(0.02, Math.min(0.90, chance));
}

function resolveCatalogOperation(op: EspionageOperation, def: OperationDefinition, world: GameWorldState): void {
    const successChance = computeCatalogSuccessChance(def, op.actorFactionId, op.targetFactionId, world);
    const exposureChance = computeCatalogExposureChance(def, op.targetFactionId, world);

    const roll = Math.random();
    let outcome: CatalogOutcome = 'failure';
    if (roll < successChance / 4) outcome = 'critical_success';
    else if (roll < successChance) outcome = 'success';
    else if (roll < successChance * 1.3) outcome = 'partial_success';

    const exposed = Math.random() < exposureChance;
    if (!catalogSucceeded(outcome) && exposed) outcome = 'exposed_failure';
    else if (roll > 0.95 && exposed) outcome = 'backfire';

    op.succeeded = catalogSucceeded(outcome);
    op.status = op.succeeded ? 'resolved' : 'failed';

    // Exposure roll decides 'exposed'; otherwise the deterministic attribution
    // formula grades invisible vs suspected.
    op.attributionState = exposed
        ? 'exposed'
        : (resolveAttribution(op, world) === 'invisible' ? 'invisible' : 'suspected');

    world.espionage.attributionRecords.push({
        operationId: op.id,
        suspectedFactionId: op.actorFactionId,
        attributionState: op.attributionState,
        probability: exposed ? 1 : computeAttributionProbability(op, world),
        tensionApplied: op.attributionState === 'exposed' ? espCfg.attribution.diplomaticPenaltyOnExpose :
            op.attributionState === 'suspected' ? espCfg.attribution.tensionIncreaseOnSuspected : 0,
        resolvedAt: toISO(world.nowSeconds),
    });

    if (op.succeeded) {
        applyCatalogEffects(op, def, outcome, world);
        updateInfiltration(world, op.actorFactionId, op.targetFactionId, 5);
        // Intelligence product: imperfect report delivered to the actor.
        generateReportForOperation(op, def, outcome, world);
    }
    if (exposed || outcome === 'backfire') {
        world.shared.stability = clampShared(world.shared.stability - 0.05);
        updateInfiltration(world, op.actorFactionId, op.targetFactionId, -15);
    }

    // Release operation capacity
    const intel = world.espionage.factionIntel.get(op.actorFactionId);
    if (intel) intel.usedAgentCapacity = Math.max(0, intel.usedAgentCapacity - 1);

    op.narrative = `${def.name}: ${outcome.replace(/_/g, ' ')}${exposed ? ' (exposed)' : ''}`;

    eventBus.emit({
        type: 'intelligenceOperationResolve',
        opId: op.id,
        outcome,
        exposed,
    });
}

/** Raw goods that espionage can siphon or spoil. */
const SIPHONABLE: Array<'metals' | 'chemicals' | 'food' | 'energy' | 'rare'> =
    ['metals', 'chemicals', 'food', 'energy', 'rare'];

function applyCatalogEffects(op: EspionageOperation, def: OperationDefinition, outcome: CatalogOutcome, world: GameWorldState): void {
    const mult = outcome === 'critical_success' ? 1.5 : outcome === 'partial_success' ? 0.5 : 1.0;

    // Target-side lookups shared by the economic effects.
    const targetEcoPlanets = [...world.economy.planets.values()]
        .filter(p => p.factionId === op.targetFactionId);
    const regionPlanet = targetEcoPlanets.find(p => p.systemId === op.targetRegionId) ?? targetEcoPlanets[0];
    const actorPlanet = [...world.economy.planets.values()].find(p => p.factionId === op.actorFactionId);
    const targetReserves = world.economy.factions.get(op.targetFactionId)?.reserves as Record<string, number> | undefined;
    const targetRoutes = [...(world.economy.tradeRoutes?.values() ?? [])].filter(r => {
        const agr = world.economy.tradeAgreements?.get(r.agreementId);
        return !!agr && (agr.aFactionId === op.targetFactionId || agr.bFactionId === op.targetFactionId);
    });

    // Political warfare lands on the rival's government, not its infrastructure
    // (Government Phase 5). Absent for factions with no government state.
    const targetGov = (world as any).government?.get?.(op.targetFactionId);
    const targetPosture = world.movement.empirePostures.get(op.targetFactionId);

    // Running covert operations at all hardens the actor's own politics.
    try {
        recordPoliticalEvent(world, op.actorFactionId, 'covert_operation', mult);
    } catch { /* posture absent on minimal worlds */ }

    for (const effect of def.effects) {
        if (targetGov) {
            if (effect.type === 'election_swing') {
                targetGov.electionInterference = Math.min(60, (targetGov.electionInterference ?? 0) + effect.value * mult);
            }
            if (effect.type === 'approval_damage') {
                for (const bloc of targetPosture?.blocs ?? []) {
                    bloc.satisfaction = Math.max(0, bloc.satisfaction - effect.value * mult * 0.4);
                }
                adjustPublicTrust(world, op.targetFactionId, -effect.value * mult * 0.3);
            }
            if (effect.type === 'coup_pressure') {
                targetGov.coupPressure = Math.min(100, (targetGov.coupPressure ?? 0) + effect.value * mult);
            }
            if (effect.type === 'minister_compromise') {
                // The most ambitious minister is the cheapest to turn.
                const ministers = CABINET_PORTFOLIOS
                    .map(p => getMinister(world, op.targetFactionId, p))
                    .filter((m): m is NonNullable<typeof m> => Boolean(m));
                const mark = ministers.sort((a, b) => (b.ambitionDrive ?? 50) - (a.ambitionDrive ?? 50))[0];
                if (mark) {
                    mark.loyalty = Math.max(0, mark.loyalty - effect.value * mult);
                    mark.corruption = Math.min(100, (mark.corruption ?? 0) + effect.value * mult * 0.5);
                }
            }
            if (effect.type === 'head_of_state_assassination') {
                try {
                    resolveSuccession(world, op.targetFactionId, 'death');
                    targetGov.legitimacy = Math.max(0, targetGov.legitimacy - 10);
                } catch { /* no head of state seated */ }
            }
        }

        if (effect.type === 'instability_increase') {
            const sys = world.movement.systems.get(op.targetRegionId);
            if (sys) sys.instability = Math.min(100, sys.instability + effect.value * mult);
        }
        if (effect.type === 'research_boost') {
            const attackerTech = world.tech.get(op.actorFactionId);
            if (attackerTech) attackerTech.researchPoints += effect.value * mult;
        }

        // ── Economic effects (previously inert strings) ──────────────────────
        if (effect.type === 'resource_siphon' && regionPlanet) {
            // Covert piracy: a cut of the target's stockpiles is diverted to
            // the actor's nearest holdings (fenced if no planet to receive it).
            for (const res of SIPHONABLE) {
                const taken = (regionPlanet.stockpile[res] ?? 0) * effect.value * mult;
                if (taken <= 0) continue;
                regionPlanet.stockpile[res] = (regionPlanet.stockpile[res] ?? 0) - taken;
                if (actorPlanet) {
                    actorPlanet.stockpile[res] = (actorPlanet.stockpile[res] ?? 0) + taken;
                }
            }
        }
        if (effect.type === 'trade_efficiency_debuff') {
            // The target's convoys become soft targets: piracy risk ratchets on
            // every route they are a party to, and their core region strains.
            for (const route of targetRoutes) {
                route.piracyRisk = Math.min(0.95, route.piracyRisk + effect.value * mult);
            }
            const collapse = world.economy.collapseStates.get(`region-${op.targetFactionId}`);
            if (collapse) collapse.pressure = Math.min(1, collapse.pressure + effect.value * mult * 0.5);
        }
        if (effect.type === 'inflation_spike' && targetReserves) {
            // Currency manipulation: the target's credit reserves lose real value.
            targetReserves['CREDITS'] = (targetReserves['CREDITS'] ?? 0) * (1 - effect.value * mult);
        }
        if (effect.type === 'market_inefficiency') {
            // Market rumours: artificial demand distortion on the galactic
            // exchange — prices spike on the next pricing passes via the EMA.
            for (const market of world.economy.markets.values()) {
                market.demand += market.demand * effect.value * mult;
            }
        }
        if (effect.type === 'ammo_shortage') {
            // Sabotaged ammunition stores across the target's worlds.
            for (const p of targetEcoPlanets) {
                p.stockpile.ammo = (p.stockpile.ammo ?? 0) * (1 - effect.value * mult);
            }
        }
        if (effect.type === 'disable_building') {
            // Ruin an active military/industrial installation in the target
            // system. Stays offline until the owner pays for repairs
            // (PLANET_REPAIR_BUILDING) — the repair bill IS the cost penalty,
            // so 'repair_cost_penalty' needs no separate mechanic.
            const constrPlanets = [...world.construction.planets.values()]
                .filter(p => p.ownerId === op.targetFactionId)
                .sort((a, b) =>
                    (a.systemId === op.targetRegionId ? 0 : 1) - (b.systemId === op.targetRegionId ? 0 : 1));
            for (const planet of constrPlanets) {
                const tile = planet.tiles.find(t => t.constructionState === 'active' && t.buildingId &&
                    /shipyard|factory|plant|mine/.test(t.buildingId))
                    ?? planet.tiles.find(t => t.constructionState === 'active' && t.buildingId);
                if (tile) {
                    tile.constructionState = 'ruined';
                    tile.constructionCompleteAt = null;
                    console.log(`[ESPIONAGE] Sabotage ruined ${tile.buildingId} on ${planet.id}`);
                    break;
                }
            }
        }
    }

    // Crisis triggers fire-and-forget: tickOperations is sync, and the legacy
    // step15 never awaited these either.
    if (def.crisisTriggers && outcome !== 'partial_success') {
        for (const trigger of def.crisisTriggers) {
            triggerCrisis(
                'sabotage',
                op.actorFactionId,
                op.targetFactionId,
                op.targetRegionId,
                trigger.type,
                { title: trigger.title, description: trigger.description, severity: trigger.severity * mult }
            ).catch(e => console.error(`[ESPIONAGE] Failed to trigger crisis: ${e}`));
        }
    }
}

// ─── Per-faction intel resource tick ──────────────────────────────────────────

/**
 * Passive Intel generation for every faction (1.5/hour, capped at 1000).
 * Ensures each economy faction has a FactionIntelState so AI and players
 * accumulate the resource without an explicit bootstrap step.
 */
/** Infiltration lost per hour with no reinforcement (~0.7/day). Networks need maintenance. */
const INFILTRATION_DECAY_PER_HOUR = 0.03;

export function tickFactionIntel(world: GameWorldState, deltaSeconds: number): void {
    const hours = deltaSeconds / 3600;
    for (const factionId of world.economy.factions.keys()) {
        if (factionId === 'faction-pirates' || factionId === 'faction-neutral') continue;
        const intel = getOrCreateFactionIntel(world, factionId);
        intel.intelPoints = Math.min(1000, intel.intelPoints + 1.5 * hours);

        // Idle decay — deployed agents (tickAgentNetworks) and successful ops
        // outpace this; abandoned networks slowly regress through the stages.
        for (const [targetId, level] of Object.entries(intel.infiltrationLevels)) {
            if (level <= 0) continue;
            intel.infiltrationLevels[targetId] = Math.max(0, level - INFILTRATION_DECAY_PER_HOUR * hours);
        }
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
    const ciState = world.espionage.factionIntel.get(op.targetFactionId);
    const ciLevel = ciState?.regionalCounterIntel[op.targetRegionId] ?? 0;

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
        // Phase 4: an exposed operation is a diplomatic incident, not just a
        // stability dent — the victim's pressure spikes and the galaxy reads
        // about it (the ESPIONAGE_LEAK source finally has a producer).
        try {
            if (op.targetFactionId && op.targetFactionId !== op.actorFactionId) {
                shiftRivalry(world, op.targetFactionId, op.actorFactionId, 10, 'spy_exposed', op.domain);
            }
            pushWorldStory(world, {
                targetEmpireId: op.actorFactionId,
                subject: `Covert ${op.domain} operation exposed`,
                magnitude: 40 + Math.round(op.investmentLevel * 30),
                source: StorySource.ESPIONAGE_LEAK,
                truth: StoryTruth.TRUE,
            });
        } catch (e) {
            console.error('[Espionage] Exposure fallout failed:', e);
        }
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
