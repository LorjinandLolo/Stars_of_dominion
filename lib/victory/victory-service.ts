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
import * as chronicle from '../narrative/chronicle';
import { prettifyFactionId } from '../narrative/naming';
import { formatSimDurationAsReal } from '../time/galactic-time';
import { empireBuildingState } from '../construction/construction-service';

const cfg = config.victory;

/** How long a transcending empire must stay whole, in real time ("1 day"); printed in notifications. */
export function enlightenmentWindowLabel(): string {
    return formatSimDurationAsReal(cfg.enlightenment.transcendenceWindowDays * 86400);
}

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
    const total = systems.length;
    const owned = systems.filter(s => s.ownerFactionId != null);
    if (owned.length === 0) return null;

    const factionSet = new Set(owned.map(s => s.ownerFactionId!));
    if (factionSet.size !== 1) return null;

    // Previously this returned a winner as soon as a single faction owned any system,
    // so early-game (one owned system, the rest neutral) triggered a spurious win that
    // ended everyone's session. Require the sole owner to control a dominant majority of
    // ALL systems before declaring conquest. (Threshold is tunable.)
    const DOMINANCE_THRESHOLD = 0.6;
    if (total > 0 && owned.length / total < DOMINANCE_THRESHOLD) return null;

    return [...factionSet][0];
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
            // bloc.satisfaction is on a 0-100 scale everywhere else; the local clamp()
            // defaults to [0,1], which crushed every hegemon bloc to <=1 the tick after
            // any conquest (instantly firing crisis indicators). Clamp on the 0-100 scale.
            bloc.satisfaction = clamp(bloc.satisfaction - cc.blocImbalanceDriftPerHour * hours * 100, 0, 100);
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
 * One Enlightenment condition, read off the empire itself. The Saga panel
 * renders these rows as they are, so the player sees exactly what the worker
 * tests — there is no second copy of the rule anywhere.
 */
export interface EnlightenmentCondition {
    id: 'approval' | 'legitimacy' | 'cohesion' | 'blocBalance' | 'blocContent' | 'worlds' | 'archive';
    label: string;
    /** Current reading; null when the empire has nothing to read (no government, no blocs). */
    value: number | null;
    target: number;
    /** 'min' = value must reach target; 'max' = value must stay at or under it. */
    bound: 'min' | 'max';
    /** 'state' rows carry their reading in `state` instead of a number. */
    unit: 'points' | 'percent' | 'count' | 'state';
    passing: boolean;
    /** For the Great Archive row: where the building stands. */
    state?: 'operational' | 'building' | 'ruined' | 'none';
}

/** The monument every transcending empire must keep standing (data/buildings.ts). */
export const ARCHIVE_BUILDING_ID = 'great_archive';

function ownedWorldCount(world: GameWorldState, factionId: string): number {
    let n = 0;
    for (const planet of (world as any).construction?.planets?.values?.() ?? []) {
        if (planet?.ownerId === factionId) n++;
    }
    return n;
}

/**
 * Read every Enlightenment condition for factionId.
 *
 * Until 2026-10 qualification read world.shared — one stability, one trade
 * efficiency, one infrastructure number for the whole galaxy. Every empire with
 * balanced blocs therefore qualified on the same tick, a rival's sabotage moved
 * your score as much as theirs, and no single empire could steer it. Everything
 * here is the empire's own: its government's standing, its worlds' cohesion,
 * its own interest groups.
 */
export function readEnlightenmentConditions(
    factionId: string,
    world: GameWorldState
): EnlightenmentCondition[] {
    const th = cfg.enlightenment.thresholds;
    const gov = world.government?.get?.(factionId);
    const blocs = world.movement.empirePostures.get(factionId)?.blocs ?? [];

    const totalInfluence = blocs.reduce((sum, b) => sum + b.influence, 0);
    const topShare = blocs.length > 0 && totalInfluence > 0
        ? Math.max(...blocs.map(b => b.influence / totalInfluence))
        : null;
    const leastContent = blocs.length > 0 ? Math.min(...blocs.map(b => b.satisfaction)) : null;
    const worlds = ownedWorldCount(world, factionId);

    const min = (value: number | null, target: number) => value !== null && value >= target;
    const rows: EnlightenmentCondition[] = [
        { id: 'approval', label: 'Approval', value: gov ? gov.approval : null, target: th.approval, bound: 'min', unit: 'points', passing: min(gov ? gov.approval : null, th.approval) },
        { id: 'legitimacy', label: 'Legitimacy', value: gov ? gov.legitimacy : null, target: th.legitimacy, bound: 'min', unit: 'points', passing: min(gov ? gov.legitimacy : null, th.legitimacy) },
        { id: 'cohesion', label: 'Empire cohesion', value: gov ? gov.cohesion : null, target: th.cohesion, bound: 'min', unit: 'points', passing: min(gov ? gov.cohesion : null, th.cohesion) },
        { id: 'blocBalance', label: 'Largest interest group', value: topShare, target: th.maxBlocDominance, bound: 'max', unit: 'percent', passing: topShare !== null && topShare <= th.maxBlocDominance },
        { id: 'blocContent', label: 'Least content interest group', value: leastContent, target: th.minBlocSatisfaction, bound: 'min', unit: 'points', passing: min(leastContent, th.minBlocSatisfaction) },
        { id: 'worlds', label: 'Worlds held', value: worlds, target: th.minWorlds, bound: 'min', unit: 'count', passing: worlds >= th.minWorlds },
    ];
    // The monument. Optional in config so a galaxy can switch it off; a
    // standing (operational) Archive is what counts — one under construction
    // or ruined by a saboteur does not.
    if (th.requireArchive) {
        const planets = (world as any).construction?.planets?.values?.() ?? [];
        const state = empireBuildingState(planets, factionId, ARCHIVE_BUILDING_ID);
        rows.push({ id: 'archive', label: 'Great Archive', value: null, target: 1, bound: 'min', unit: 'state', state, passing: state === 'operational' });
    }
    return rows;
}

/**
 * Check if factionId currently passes every Enlightenment condition. An empire
 * with no government or no interest groups cannot qualify — it has nothing for
 * the conditions to read.
 */
export function checkEnlightenmentQualification(
    factionId: string,
    world: GameWorldState
): boolean {
    return readEnlightenmentConditions(factionId, world).every(c => c.passing);
}

/**
 * What changed in the victory layer this tick. The tick processor turns these
 * into notifications; the chronicle entries are recorded here, at the moment
 * they happen.
 */
export type VictoryEvent =
    | { kind: 'conquest'; factionId: string }
    | { kind: 'enlightenment_transcending'; factionId: string }
    | { kind: 'enlightenment_interrupted'; factionId: string }
    | { kind: 'enlightenment_achieved'; factionId: string };

/**
 * Advance the Enlightenment clock for a faction. Called every strategic tick.
 *
 * - Qualifying: time passing every condition banks progress; time failing one
 *   drains it, `qualificationDecayRate` times as fast. Only an empty bank drops
 *   the empire to 'inactive'. (Until 2026-10 one failing tick zeroed it, so an
 *   empire hovering on a threshold flickered in and out a thousand times a
 *   season and never got anywhere.)
 * - Transcending: passing advances the window; failing builds strain instead,
 *   and strain eases off again while the empire holds. Strain reaching
 *   `transcendenceGraceDays` breaks the attempt — announced — and drops the
 *   empire back into qualifying with `interruptRetainFraction` of a full bank.
 */
export function tickEnlightenmentProgress(
    factionId: string,
    world: GameWorldState,
    deltaSeconds: number,
    events: VictoryEvent[] = []
): void {
    const progress = ensureEnlightenmentProgress(factionId, world);
    if (progress.phase === 'complete') return;

    const ec = cfg.enlightenment;
    const qualDurationSeconds = ec.qualificationDurationDays * 86400;
    const transcendenceDurationSeconds = ec.transcendenceWindowDays * 86400;
    const graceSeconds = ec.transcendenceGraceDays * 86400;
    const passing = checkEnlightenmentQualification(factionId, world);
    progress.failingNow = !passing;

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
            progress.qualificationSecondsAccumulated -= deltaSeconds * ec.qualificationDecayRate;
            if (progress.qualificationSecondsAccumulated <= 0) {
                progress.qualificationSecondsAccumulated = 0;
                progress.qualifyingStartedAt = null;
                progress.phase = 'inactive';
                victoryEmit('enlightenmentQualificationReset', { factionId, reason: 'bank drained' });
            }
            return;
        }
        progress.qualificationSecondsAccumulated += deltaSeconds;
        if (progress.qualificationSecondsAccumulated >= qualDurationSeconds) {
            startTranscendence(factionId, world, progress);
            events.push({ kind: 'enlightenment_transcending', factionId });
        }
        return;
    }

    if (progress.phase === 'transcending') {
        // Snapshots from before the window was banked carry only its start.
        if (typeof progress.transcendenceSecondsAccumulated !== 'number') {
            const started = progress.transcendenceStartedAt ? fromISO(progress.transcendenceStartedAt) : world.nowSeconds;
            progress.transcendenceSecondsAccumulated = Math.max(0, world.nowSeconds - started);
        }
        progress.strainSeconds = progress.strainSeconds ?? 0;

        if (!passing) {
            progress.strainSeconds += deltaSeconds;
            if (progress.strainSeconds >= graceSeconds) {
                resolveEnlightenmentFailure(factionId, world);
                events.push({ kind: 'enlightenment_interrupted', factionId });
            }
            return;
        }
        progress.strainSeconds = Math.max(0, progress.strainSeconds - deltaSeconds);
        progress.transcendenceSecondsAccumulated += deltaSeconds;
        if (progress.transcendenceSecondsAccumulated >= transcendenceDurationSeconds) {
            resolveEnlightenmentSuccess(factionId, world);
            events.push({ kind: 'enlightenment_achieved', factionId });
        }
    }
}

/** True while factionId is in its announced transcendence window. Rivals' services read this. */
export function isTranscending(world: GameWorldState, factionId: string): boolean {
    return world.victoryState?.enlightenmentProgress?.get?.(factionId)?.phase === 'transcending';
}

/**
 * Begin the timed Transcendence window for factionId.
 * Called internally once qualification duration is met. Qualifying is the
 * empire's own business; transcending is announced — the galaxy gets the
 * window to answer it.
 */
export function startTranscendence(
    factionId: string,
    world: GameWorldState,
    progress?: EnlightenmentProgress
): void {
    const p = progress ?? ensureEnlightenmentProgress(factionId, world);
    p.phase = 'transcending';
    p.transcendenceStartedAt = nowISO(world);
    p.transcendenceSecondsAccumulated = 0;
    p.strainSeconds = 0;
    p.transcendenceInterrupted = false;
    chronicle.record(world, {
        type: 'enlightenment_transcending',
        actorIds: [factionId],
        facts: { windowDays: cfg.enlightenment.transcendenceWindowDays },
        attribution: 'exposed',
    });
    victoryEmit('enlightenmentTranscendenceStarted', { factionId });
}

/**
 * Resolve Enlightenment success:
 * 1. The reward lands in the government's legacy — prestige, legitimacy,
 *    political capital, and permanent modifiers that getGovernmentModifiers
 *    already reads. It survives succession, like an ambition's.
 * 2. Cultural pressure: every rival's own interest groups lose satisfaction,
 *    more so where they were already restless.
 */
export function resolveEnlightenmentSuccess(
    factionId: string,
    world: GameWorldState
): void {
    const progress = ensureEnlightenmentProgress(factionId, world);
    const ec = cfg.enlightenment;
    const vs = ensureVictoryState(world);

    progress.phase = 'complete';
    progress.completedAt = nowISO(world);

    // 1. The reward. Until 2026-10 it was written to progress.legacyBonuses and
    //    a structuralImpact label, and nothing ever read either.
    const reward = ec.reward;
    const gov = world.government?.get?.(factionId);
    if (gov) {
        if (!gov.legacy) gov.legacy = { prestige: 0, completed: [], bonuses: {}, chronicle: [] };
        gov.legacy.prestige += reward.prestige;
        gov.legitimacy = Math.max(0, Math.min(100, gov.legitimacy + reward.legitimacy));
        gov.politicalCapital = Math.min(gov.politicalCapitalCap, gov.politicalCapital + reward.politicalCapital);
        for (const [key, value] of Object.entries(reward.bonus)) {
            gov.legacy.bonuses[key] = (gov.legacy.bonuses[key] ?? 0) + value;
        }
        gov.history?.push?.({ timestamp: world.nowSeconds, event: 'The empire achieved Transcendence.' });
    }
    // What was granted, for the Saga panel.
    progress.legacyBonuses = { ...reward.bonus };

    // 2. Cultural pressure on each rival's own interest groups. This used to
    //    subtract from the one galaxy-wide average once per rival, which hit
    //    the winner as hard as anyone.
    for (const [rivalId, posture] of world.movement.empirePostures) {
        if (rivalId === factionId || !Array.isArray(posture.blocs) || posture.blocs.length === 0) continue;
        const total = posture.blocs.reduce((s, b) => s + b.influence, 0);
        const mean = total > 0
            ? posture.blocs.reduce((s, b) => s + b.satisfaction * b.influence, 0) / total
            : 50;
        const hit = ec.culturalPressurePoints * (mean < 60 ? 1.5 : 1.0);
        for (const bloc of posture.blocs) {
            bloc.satisfaction = clamp(bloc.satisfaction - hit, 0, 100);
        }
    }

    // Update galaxy-wide victory record
    vs.lastVictoryType = 'enlightenment';
    vs.lastVictoryFactionId = factionId;
    vs.lastVictoryAt = nowISO(world);

    chronicle.record(world, {
        type: 'enlightenment_achieved',
        actorIds: [factionId],
        facts: { prestige: reward.prestige },
        attribution: 'exposed',
    });

    victoryEmit('enlightenmentVictory', {
        factionId,
        legacyBonuses: progress.legacyBonuses as unknown as Record<string, unknown>,
    });
}

/**
 * Resolve Enlightenment failure (transcendence broken). The empire falls back
 * into qualifying with part of a full bank — it has to earn the window again,
 * but not from nothing.
 */
export function resolveEnlightenmentFailure(
    factionId: string,
    world: GameWorldState
): void {
    const progress = ensureEnlightenmentProgress(factionId, world);
    const ec = cfg.enlightenment;
    const retained = ec.qualificationDurationDays * 86400 * ec.interruptRetainFraction;
    progress.phase = retained > 0 ? 'qualifying' : 'inactive';
    progress.transcendenceStartedAt = null;
    progress.transcendenceSecondsAccumulated = 0;
    progress.strainSeconds = 0;
    progress.transcendenceInterrupted = true;
    progress.qualificationSecondsAccumulated = retained;
    progress.qualifyingStartedAt = retained > 0 ? nowISO(world) : null;
    chronicle.record(world, {
        type: 'enlightenment_interrupted',
        actorIds: [factionId],
        attribution: 'exposed',
    });
    victoryEmit('enlightenmentTranscendenceInterrupted', { factionId });
}

/**
 * Everything the Saga panel shows about Enlightenment, for one empire. The
 * conditions come from the same reader the worker tests, and the rivals list
 * is public knowledge — transcending is announced to the galaxy.
 */
export interface EnlightenmentView {
    phase: EnlightenmentProgress['phase'];
    conditions: EnlightenmentCondition[];
    /** 0–1 through the current stage (qualifying or transcending); 0 otherwise. */
    stageProgress: number;
    /** Real time left in the current stage, if every condition holds; null when no stage is running. */
    stageRemaining: string | null;
    /** A condition failed on the last tick: qualifying is draining, transcending is straining. */
    slipping: boolean;
    /** 0–1 of the transcendence grace used up; the attempt breaks at 1. */
    strain: number;
    /** Real time of failing a transcending empire can absorb. */
    graceLength: string;
    /** How many times faster qualifying progress drains than it grows. */
    decayRate: number;
    /** Percent of a full qualifying bank kept when a transcendence breaks. */
    retainPercent: number;
    /** How long each stage lasts, in real time. */
    qualificationLength: string;
    transcendenceLength: string;
    /** The last transcendence attempt was broken. */
    interrupted: boolean;
    /** Other empires in their transcendence window right now (display names). */
    rivalsTranscending: string[];
    /** Other empires that have already achieved it (display names). */
    rivalsComplete: string[];
    /** Permanent modifiers granted on success, once complete. */
    granted: Record<string, number>;
}

export function buildEnlightenmentView(world: GameWorldState, factionId: string): EnlightenmentView {
    const ec = cfg.enlightenment;
    const qualSeconds = ec.qualificationDurationDays * 86400;
    const transSeconds = ec.transcendenceWindowDays * 86400;
    const all = world.victoryState?.enlightenmentProgress;
    const progress = all?.get?.(factionId);
    const phase = progress?.phase ?? 'inactive';

    let stageProgress = 0;
    let stageSecondsRemaining: number | null = null;
    if (phase === 'qualifying' && progress) {
        stageProgress = clamp(progress.qualificationSecondsAccumulated / qualSeconds);
        stageSecondsRemaining = Math.max(0, qualSeconds - progress.qualificationSecondsAccumulated);
    } else if (phase === 'transcending' && progress) {
        const held = typeof progress.transcendenceSecondsAccumulated === 'number'
            ? progress.transcendenceSecondsAccumulated
            : (progress.transcendenceStartedAt ? world.nowSeconds - fromISO(progress.transcendenceStartedAt) : 0);
        stageProgress = clamp(held / transSeconds);
        stageSecondsRemaining = Math.max(0, transSeconds - held);
    } else if (phase === 'complete') {
        stageProgress = 1;
    }

    const rivalsTranscending: string[] = [];
    const rivalsComplete: string[] = [];
    const nameOf = (id: string) => world.economy?.factions?.get?.(id)?.name || prettifyFactionId(id);
    for (const [id, p] of all?.entries?.() ?? []) {
        if (id === factionId) continue;
        if (p.phase === 'transcending') rivalsTranscending.push(nameOf(id));
        else if (p.phase === 'complete') rivalsComplete.push(nameOf(id));
    }

    return {
        phase,
        conditions: readEnlightenmentConditions(factionId, world),
        stageProgress,
        stageRemaining: stageSecondsRemaining === null ? null : formatSimDurationAsReal(stageSecondsRemaining),
        slipping: (phase === 'qualifying' || phase === 'transcending') && !!progress?.failingNow,
        strain: phase === 'transcending' ? clamp((progress?.strainSeconds ?? 0) / (ec.transcendenceGraceDays * 86400)) : 0,
        graceLength: formatSimDurationAsReal(ec.transcendenceGraceDays * 86400),
        decayRate: ec.qualificationDecayRate,
        retainPercent: Math.round(ec.interruptRetainFraction * 100),
        qualificationLength: formatSimDurationAsReal(qualSeconds),
        transcendenceLength: formatSimDurationAsReal(transSeconds),
        interrupted: !!progress?.transcendenceInterrupted,
        rivalsTranscending,
        rivalsComplete,
        granted: phase === 'complete' ? { ...(progress?.legacyBonuses ?? {}) } : {},
    };
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
export function tickVictory(world: GameWorldState, deltaSeconds: number): VictoryEvent[] {
    const vs = ensureVictoryState(world);
    const events: VictoryEvent[] = [];

    // ── Conquest check ────────────────────────────────────────────────────────
    if (!vs.conquest) {
        const conqueror = checkConquestVictory(world);
        if (conqueror) {
            const conquest = declareConquest(conqueror, world);
            events.push({ kind: 'conquest', factionId: conqueror });
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
        tickEnlightenmentProgress(factionId, world, deltaSeconds, events);
    }

    // ── Post-victory transition ───────────────────────────────────────────────
    if (world.postVictoryTransition && !world.postVictoryTransition.resolved) {
        tickPostVictoryTransition(world, deltaSeconds);
    }

    return events;
}
