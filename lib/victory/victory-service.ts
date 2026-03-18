// lib/victory/victory-service.ts
// Seasonal & Victory System — Conquest, Enlightenment, Post-Victory Transition,
// Territory Persistence.
//
// Design rules:
// - All pressure is drift-based (per deltaSeconds). No instant state changes.
// - Rebellion emerges from threshold crossings; this service only accumulates.
// - No snowball bonuses: all legacyBonuses are hard-capped in config.
// - Territory ownership is never automatically reset.

import type { GameWorldState } from '../game-world-state';
import { clampShared } from '../game-world-state';
import type {
    ConquestState,
    EnlightenmentProgress,
    PostVictoryTransition,
    TerritoryPersistenceRecord,
    VictoryState,
    VictoryType,
} from '../seasons/season-types';
import config from '../movement/movement-config.json';

const cfg = config.victory;

/** Lightweight structured event logger for the victory domain.
 *  Wire into the main EventBus union in a follow-up if needed. */
function victoryEmit(type: string, payload: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== 'production') {
        console.debug(`[victory] ${type}`, payload);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowISO(world: GameWorldState): string {
    return new Date(world.nowSeconds * 1000).toISOString();
}

function fromISO(iso: string): number {
    return new Date(iso).getTime() / 1000;
}

function clamp(v: number, lo = 0, hi = 1): number {
    return Math.max(lo, Math.min(hi, v));
}

/** Initialise a VictoryState if world doesn't have one. */
export function ensureVictoryState(world: GameWorldState): VictoryState {
    if (!world.victoryState) {
        world.victoryState = {
            conquest: null,
            enlightenmentProgress: new Map(),
            lastVictoryType: null,
            lastVictoryFactionId: null,
            lastVictoryAt: null,
        };
    }
    return world.victoryState;
}

/** Initialise an EnlightenmentProgress entry for a faction if absent. */
function ensureEnlightenmentProgress(factionId: string, world: GameWorldState): EnlightenmentProgress {
    const vs = ensureVictoryState(world);
    if (!vs.enlightenmentProgress.has(factionId)) {
        vs.enlightenmentProgress.set(factionId, {
            factionId,
            phase: 'inactive',
            qualifyingStartedAt: null,
            qualificationSecondsAccumulated: 0,
            transcendenceStartedAt: null,
            transcendenceInterrupted: false,
            structuralImpact: null,
            legacyBonuses: {},
        });
    }
    return vs.enlightenmentProgress.get(factionId)!;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONQUEST VICTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if any single faction owns every claimed system in the galaxy.
 * Returns the conquering factionId, or null if no conquest.
 *
 * "Owns" = system.ownerFactionId is set (unclaimed / null systems are ignored).
 */
export function checkConquestVictory(world: GameWorldState): string | null {
    const systems = [...world.movement.systems.values()];
    const owned = systems.filter(s => s.ownerFactionId != null);
    if (owned.length === 0) return null;

    const factionSet = new Set(owned.map(s => s.ownerFactionId!));
    if (factionSet.size === 1) {
        return [...factionSet][0];
    }
    return null;
}

/**
 * Declare conquest for factionId. Initialises or overwrites ConquestState.
 * Called once when checkConquestVictory first returns a value.
 */
export function declareConquest(factionId: string, world: GameWorldState): ConquestState {
    const vs = ensureVictoryState(world);
    const conquest: ConquestState = {
        factionId,
        declaredAt: nowISO(world),
        rebellionPressure: 0,
        flaggedAutonomousRegions: [],
        transitionStarted: false,
    };
    vs.conquest = conquest;
    vs.lastVictoryType = 'conquest';
    vs.lastVictoryFactionId = factionId;
    vs.lastVictoryAt = nowISO(world);

    victoryEmit('conquestDeclared', { factionId, at: conquest.declaredAt });
    return conquest;
}

/**
 * Apply drift-based post-conquest pressure to the hegemon empire.
 * Called every sim tick after conquest is declared. No scripted rebellion.
 * Presses: stability drift, trade strain, espionage pressure, bloc imbalance.
 */
export function applyConquestPressure(
    conquest: ConquestState,
    world: GameWorldState,
    deltaSeconds: number
): void {
    const cc = cfg.conquest;
    const hours = deltaSeconds / 3600;

    // 1. Stability drifts downward (empire-wide overextension)
    world.shared.stability = clampShared(
        world.shared.stability - cc.stabilityDriftBoostPerHour * hours
    );

    // 2. Espionage pressure rises (everyone targets the hegemon)
    world.shared.espionagePressure = clampShared(
        world.shared.espionagePressure + cc.espionagePressureBoostPerHour * hours
    );

    // 3. Trade efficiency falls under centralization strain
    world.shared.tradeEfficiency = clampShared(
        world.shared.tradeEfficiency * (1 - (cc.tradeStrainMultiplier - 1) * hours * 0.01)
    );

    // 4. Bloc imbalance drift (all blocs shift slightly toward dissatisfaction)
    for (const posture of world.movement.empirePostures.values()) {
        if (posture.factionId !== conquest.factionId) continue;
        for (const bloc of posture.blocs) {
            bloc.satisfaction = clamp(bloc.satisfaction - cc.blocImbalanceDriftPerHour * hours * 100);
        }
    }
}

/**
 * Accumulate rebellion pressure for the conquered empire over time.
 * Pressure feeds from instability indicators but does NOT itself trigger rebellion.
 * The existing isCrisisCondition gate in politics-service handles that.
 */
export function tickConquestRebellionRisk(
    factionId: string,
    world: GameWorldState,
    deltaSeconds: number
): void {
    const vs = world.victoryState;
    if (!vs?.conquest || vs.conquest.factionId !== factionId) return;

    const conquest = vs.conquest;
    const hours = deltaSeconds / 3600;

    // Accumulate pressure from active instability indicators
    let pressureGain = 0;

    // Frontier dissatisfaction
    const posture = world.movement.empirePostures.get(factionId);
    if (posture) {
        const frontierBloc = posture.blocs.find(b => b.id === 'frontier');
        if (frontierBloc && frontierBloc.satisfaction < 50) pressureGain += 0.003;

        const tradeBloc = posture.blocs.find(b => b.id === 'trade');
        if (tradeBloc && tradeBloc.satisfaction < 50) pressureGain += 0.002;
    }

    // Commodity shortage
    if (world.shared.commodityAccess < 0.4) pressureGain += 0.004;

    // Espionage amplification
    if (world.shared.espionagePressure > 0.6) pressureGain += 0.003;

    // Seasonal volatility
    const seasonPressure = world.shared.seasonalModifiers['stability'] ?? 0;
    pressureGain += seasonPressure * 0.002;

    conquest.rebellionPressure = clamp(conquest.rebellionPressure + pressureGain * hours);

    // Flag regions that cross autonomous threshold
    const pvCfg = cfg.postVictory;
    for (const [systemId, system] of world.movement.systems) {
        if (system.ownerFactionId !== factionId) continue;
        const instability = (system.instability ?? 0) / 100;
        if (
            instability >= pvCfg.autonomousRegionInstabilityThreshold &&
            !conquest.flaggedAutonomousRegions.includes(systemId)
        ) {
            conquest.flaggedAutonomousRegions.push(systemId);
            victoryEmit('autonomousRegionFlagged', { systemId, factionId });
        }
    }

    // Recovery: pressure slowly recedes if conditions improve
    if (pressureGain === 0) {
        conquest.rebellionPressure = clamp(conquest.rebellionPressure - 0.001 * hours);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENLIGHTENMENT VICTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if factionId currently passes all Enlightenment qualification thresholds.
 * Returns true only if ALL four categories pass simultaneously.
 */
export function checkEnlightenmentQualification(
    factionId: string,
    world: GameWorldState
): boolean {
    const th = cfg.enlightenment.thresholds;
    const s = world.shared;

    // Category 1 — Stability
    if (s.stability < th.stability) return false;

    // Category 2 — Bloc Balance: no bloc dominance, no critical bloc dissatisfaction
    const posture = world.movement.empirePostures.get(factionId);
    if (posture) {
        const totalInfluence = posture.blocs.reduce((sum, b) => sum + b.influence, 0);
        for (const bloc of posture.blocs) {
            const dominance = totalInfluence > 0 ? bloc.influence / totalInfluence : 0;
            if (dominance > th.maxBlocDominance) return false;
            if (bloc.satisfaction / 100 < th.minBlocSatisfaction) return false;
        }
    }

    // Category 3 — Economic Equilibrium
    if (s.tradeEfficiency < th.tradeEfficiency) return false;
    if (s.commodityAccess < th.commodityAccess) return false;
    if (s.blocSatisfaction < th.blocSatisfaction) return false;

    // Category 4 — Infrastructure Integrity
    if (s.infraIntegrity < th.infraIntegrity) return false;

    return true;
}

/**
 * Advance the Enlightenment qualification timer for a faction.
 * - If passing thresholds: accumulate time; transition to 'transcending' when full.
 * - If failing: reset accumulated time, drop back to 'inactive'.
 * Called every sim tick for factions the server is tracking.
 */
export function tickEnlightenmentProgress(
    factionId: string,
    world: GameWorldState,
    deltaSeconds: number
): void {
    const progress = ensureEnlightenmentProgress(factionId, world);
    if (progress.phase === 'complete') return;

    const ec = cfg.enlightenment;
    const qualDurationSeconds = ec.qualificationDurationDays * 86400;
    const transcendenceDurationSeconds = ec.transcendenceWindowDays * 86400;
    const passing = checkEnlightenmentQualification(factionId, world);

    if (progress.phase === 'inactive') {
        if (passing) {
            progress.phase = 'qualifying';
            progress.qualifyingStartedAt = nowISO(world);
            progress.qualificationSecondsAccumulated = 0;
            victoryEmit('enlightenmentQualificationStarted', { factionId });
        }
        return;
    }

    if (progress.phase === 'qualifying') {
        if (!passing) {
            // Threshold failure — reset timer
            progress.qualificationSecondsAccumulated = 0;
            progress.qualifyingStartedAt = null;
            progress.phase = 'inactive';
            victoryEmit('enlightenmentQualificationReset', { factionId, reason: 'threshold failure' });
            return;
        }
        progress.qualificationSecondsAccumulated += deltaSeconds;
        if (progress.qualificationSecondsAccumulated >= qualDurationSeconds) {
            startTranscendence(factionId, world, progress);
        }
        return;
    }

    if (progress.phase === 'transcending') {
        if (!passing) {
            // Destabilization during transcendence — reset to inactive
            resolveEnlightenmentFailure(factionId, world);
            return;
        }
        // Check window expiry
        const transcStarted = fromISO(progress.transcendenceStartedAt!);
        if (world.nowSeconds - transcStarted >= transcendenceDurationSeconds) {
            resolveEnlightenmentSuccess(factionId, world);
        }
    }
}

/**
 * Begin the timed Transcendence window for factionId.
 * Called internally once qualification duration is met.
 */
export function startTranscendence(
    factionId: string,
    world: GameWorldState,
    progress?: EnlightenmentProgress
): void {
    const p = progress ?? ensureEnlightenmentProgress(factionId, world);
    p.phase = 'transcending';
    p.transcendenceStartedAt = nowISO(world);
    p.transcendenceInterrupted = false;
    victoryEmit('enlightenmentTranscendenceStarted', { factionId });
}

/**
 * Resolve Enlightenment success:
 * 1. Apply one structural impact.
 * 2. Apply minor legacy bonuses to winning faction (capped by config).
 * 3. Apply cultural pressure drift to rival factions.
 * 4. Mark winning faction as prime espionage target next season.
 */
export function resolveEnlightenmentSuccess(
    factionId: string,
    world: GameWorldState
): void {
    const progress = ensureEnlightenmentProgress(factionId, world);
    const ec = cfg.enlightenment;
    const vs = ensureVictoryState(world);

    progress.phase = 'complete';

    // 1. Structural impact — pick deterministically from available types
    const impacts = ec.structuralImpactTypes;
    const impactIndex = world.nowSeconds % impacts.length;
    progress.structuralImpact = impacts[impactIndex];

    // 2. Legacy bonuses (capped, non-stacking)
    const bonusCap = config.seasons.rewards.permanentBonusCap / 100;
    progress.legacyBonuses['stabilityResistance'] = clamp(
        (progress.legacyBonuses['stabilityResistance'] ?? 0) + ec.legacyBonusStabilityResistance,
        0, bonusCap
    );
    progress.legacyBonuses['blocVolatilityReduction'] = clamp(
        (progress.legacyBonuses['blocVolatilityReduction'] ?? 0) + ec.legacyBonusBlocVolatilityReduction,
        0, bonusCap
    );

    // 3. Cultural pressure drift on all rival factions
    for (const [rivalId] of world.movement.empirePostures) {
        if (rivalId === factionId) continue;
        // If rival is already unstable (bloc satisfaction < 0.6), they feel it more
        const multiplier = world.shared.blocSatisfaction < 0.6 ? 1.5 : 1.0;
        world.shared.blocSatisfaction = clampShared(
            world.shared.blocSatisfaction - ec.culturalPressureDriftRate * multiplier
        );
    }

    // 4. Mark as prime espionage target (amplify pressure next season)
    world.shared.espionagePressure = clampShared(
        world.shared.espionagePressure + 0.15
    );

    // Update galaxy-wide victory record
    vs.lastVictoryType = 'enlightenment';
    vs.lastVictoryFactionId = factionId;
    vs.lastVictoryAt = nowISO(world);

    victoryEmit('enlightenmentVictory', {
        factionId,
        structuralImpact: progress.structuralImpact,
        legacyBonuses: progress.legacyBonuses as unknown as Record<string, unknown>,
    });
}

/**
 * Resolve Enlightenment failure (transcendence interrupted).
 * Resets to inactive; factionId must restart qualification.
 */
export function resolveEnlightenmentFailure(
    factionId: string,
    world: GameWorldState
): void {
    const progress = ensureEnlightenmentProgress(factionId, world);
    progress.phase = 'inactive';
    progress.transcendenceStartedAt = null;
    progress.transcendenceInterrupted = true;
    progress.qualificationSecondsAccumulated = 0;
    progress.qualifyingStartedAt = null;
    victoryEmit('enlightenmentTranscendenceInterrupted', { factionId });
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST-VICTORY TRANSITION (48-HOUR PHASE)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Begin the 48-hour post-victory transition phase.
 * Writes multipliers to PostVictoryTransition; does NOT hard-override SharedState.
 * Calling tick functions apply the actual pressure deltas.
 */
export function startPostVictoryTransition(
    victoryType: VictoryType,
    factionId: string,
    world: GameWorldState
): PostVictoryTransition {
    const pvCfg = cfg.postVictory;
    const durationSeconds = pvCfg.transitionDurationHours * 3600;
    const startAt = world.nowSeconds;

    const transition: PostVictoryTransition = {
        victoryType,
        triggeringFactionId: factionId,
        startedAt: nowISO(world),
        endsAt: new Date((startAt + durationSeconds) * 1000).toISOString(),
        resolved: false,
        multipliers: {
            instability: pvCfg.instabilityMultiplier,
            tradeVolatility: pvCfg.tradeVolatilityBoost,
            espionageActivity: pvCfg.espionageActivityBoost,
            blocSensitivity: pvCfg.blocSensitivityMultiplier,
            deepSpaceExpansion: pvCfg.deepSpaceExpansionBoost,
        },
    };

    world.postVictoryTransition = transition;
    victoryEmit('postVictoryTransitionStarted', { victoryType, factionId });
    return transition;
}

/**
 * Tick the active post-victory transition.
 * Applies amplified drift rates through SharedState.
 * Checks for expiry and triggers resolution.
 */
export function tickPostVictoryTransition(
    world: GameWorldState,
    deltaSeconds: number
): void {
    const transition = world.postVictoryTransition;
    if (!transition || transition.resolved) return;

    const m = transition.multipliers;
    const hours = deltaSeconds / 3600;

    // Instability multiplier → extra stability drain
    world.shared.stability = clampShared(
        world.shared.stability - 0.004 * (m.instability - 1) * hours
    );

    // Trade volatility boost → extra efficiency drain
    world.shared.tradeEfficiency = clampShared(
        world.shared.tradeEfficiency - 0.003 * m.tradeVolatility * hours
    );

    // Espionage activity boost → extra espionage pressure
    world.shared.espionagePressure = clampShared(
        world.shared.espionagePressure + 0.004 * m.espionageActivity * hours
    );

    // Bloc sensitivity → extra bloc dissatisfaction drift
    world.shared.blocSatisfaction = clampShared(
        world.shared.blocSatisfaction - 0.003 * (m.blocSensitivity - 1) * hours
    );

    // Check for expiry
    const endsAt = fromISO(transition.endsAt);
    if (world.nowSeconds >= endsAt) {
        resolvePostVictoryTransition(world);
    }
}

/**
 * Resolve the 48-hour transition:
 * 1. Recalibrate instability (no reset — just remove amplification).
 * 2. Evaluate regions that crossed instability thresholds → formalize autonomous pressure.
 * 3. Emit so season service can schedule/advance the next seasonal modifier.
 * 4. Mark transition as resolved.
 */
export function resolvePostVictoryTransition(world: GameWorldState): void {
    const transition = world.postVictoryTransition;
    if (!transition || transition.resolved) return;

    transition.resolved = true;

    // 1. Formalize autonomous regions
    evaluateAutonomousRegions(world);

    // 2. Notify season layer
    victoryEmit('postVictoryTransitionComplete', {
        victoryType: transition.victoryType,
        factionId: transition.triggeringFactionId,
        autonomousPressureRegions: (world.victoryState?.conquest?.flaggedAutonomousRegions ?? []) as unknown as Record<string, unknown>,
    });

    world.postVictoryTransition = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TERRITORY PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Snapshot current territory ownership and infra state at a season boundary.
 * Ownership is never auto-reset. This record becomes the historical reference.
 */
export function snapshotTerritoryAtSeasonEnd(
    seasonNumber: number,
    world: GameWorldState
): TerritoryPersistenceRecord {
    const territories: Record<string, string> = {};
    for (const [sysId, sys] of world.movement.systems) {
        if (sys.ownerFactionId) territories[sysId] = sys.ownerFactionId;
    }

    const infraIntegrity: Record<string, number> = {};
    for (const [segId, seg] of world.movement.tradeSegments) {
        infraIntegrity[segId] = seg.integrity;
    }

    const gateIntegrity: Record<string, number> = {};
    for (const [gateId, gate] of world.movement.gates) {
        gateIntegrity[gateId] = gate.integrity;
    }

    const autonomousPressureRegions =
        world.victoryState?.conquest?.flaggedAutonomousRegions.slice() ?? [];

    const record: TerritoryPersistenceRecord = {
        seasonNumber,
        snapshotAt: nowISO(world),
        territories,
        infraIntegrity,
        gateIntegrity,
        autonomousPressureRegions,
    };

    world.territoryHistory.push(record);
    victoryEmit('territorySnapped', { seasonNumber });
    return record;
}

/**
 * Apply cross-season infrastructure drift (NOT ownership reset).
 * Idle/disrupted segments decay at config rates. Max decay capped.
 */
export function applyTerritoryDrift(
    world: GameWorldState,
    deltaSeconds: number
): void {
    const tc = cfg.territoryPersistence;
    const days = deltaSeconds / 86400;

    // Trade segment decay
    for (const seg of world.movement.tradeSegments.values()) {
        if (seg.status === 'disrupted') {
            seg.integrity = clamp(
                seg.integrity - tc.routeDecayRatePerDayDisrupted * days,
                1 - tc.maxCrossSeasonDecay, 1
            );
        } else if (seg.status === 'active') {
            seg.integrity = clamp(
                seg.integrity - tc.infraDecayRatePerDayIdle * days,
                1 - tc.maxCrossSeasonDecay, 1
            );
        }
    }

    // Gate decay when below threshold
    for (const gate of world.movement.gates.values()) {
        if (gate.integrity < 0.7) {
            gate.integrity = clamp(
                gate.integrity - tc.gateDecayRatePerDayUnstable * days,
                1 - tc.maxCrossSeasonDecay, 1
            );
        }
    }
}

/**
 * Evaluate all systems for autonomous pressure formation.
 * Any system above the instability threshold gets flagged.
 * Flagging is informational only — it does NOT reassign ownership.
 */
export function evaluateAutonomousRegions(world: GameWorldState): void {
    const pvCfg = cfg.postVictory;
    const conquest = world.victoryState?.conquest;

    for (const [systemId, system] of world.movement.systems) {
        if (!system.ownerFactionId) continue;
        const instabilityNorm = (system.instability ?? 0) / 100;
        if (instabilityNorm >= pvCfg.autonomousRegionInstabilityThreshold) {
            if (
                conquest &&
                !conquest.flaggedAutonomousRegions.includes(systemId)
            ) {
                conquest.flaggedAutonomousRegions.push(systemId);
                victoryEmit('autonomousRegionFlagged', {
                    systemId,
                    factionId: system.ownerFactionId,
                });
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER TICK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Master victory tick. Call from main sim loop every tick.
 * - Detects and declares new victories.
 * - Advances conquest pressure & rebellion risk.
 * - Advances Enlightenment progress for all tracked factions.
 * - Ticks post-victory transition.
 */
export function tickVictory(world: GameWorldState, deltaSeconds: number): void {
    const vs = ensureVictoryState(world);

    // ── Conquest check ────────────────────────────────────────────────────────
    if (!vs.conquest) {
        const conqueror = checkConquestVictory(world);
        if (conqueror) {
            const conquest = declareConquest(conqueror, world);
            if (!conquest.transitionStarted) {
                conquest.transitionStarted = true;
                startPostVictoryTransition('conquest', conqueror, world);
            }
        }
    } else {
        applyConquestPressure(vs.conquest, world, deltaSeconds);
        tickConquestRebellionRisk(vs.conquest.factionId, world, deltaSeconds);
    }

    // ── Enlightenment check for all factions ──────────────────────────────────
    for (const factionId of world.movement.empirePostures.keys()) {
        tickEnlightenmentProgress(factionId, world, deltaSeconds);
    }

    // ── Post-victory transition ───────────────────────────────────────────────
    if (world.postVictoryTransition && !world.postVictoryTransition.resolved) {
        tickPostVictoryTransition(world, deltaSeconds);
    }
}
