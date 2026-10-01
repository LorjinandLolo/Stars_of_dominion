// lib/politics/politics-service.ts
// Pillar 5 — Internal Politics: bloc satisfaction, policy effects,
// crisis gating from multi-indicator checks.

import type { GameWorldState, SharedState } from '../game-world-state';
import type { EmpirePosture, InfluenceBloc } from '../movement/types';
import { recomputeBlocSatisfaction } from '../game-world-state';
import { eventBus } from '../movement/event-bus';
import config from '../movement/movement-config.json';
import { policyRegistry, factionRegistry } from './registry';
import { espionagePressureOn } from '../espionage/pressure';

const polCfg = config.politics;
const docCfg = config.doctrine;
const drift = polCfg.blocDrift;

// ─── Bloc satisfaction ─────────────────────────────────────────────────────────
//
// A bloc's satisfaction is a stock that moves toward a TARGET — the same shape
// planetary cohesion has (lib/government/cohesion-service.ts). The target is a
// neutral baseline plus a list of named, signed drivers measured in points of
// satisfaction: how well the government's ideology suits the bloc, what the
// empire's circumstances are doing to it, and how hard foreign services are
// working on it. Each tick the bloc closes part of the gap.
//
// It used to integrate rates instead: every driver added so-many points per
// hour, forever, with next to nothing pulling the other way. Any driver that
// stayed on, however small, walked its bloc to 0 or to 100 and left it there.
// One of them — galaxy-wide espionage pressure, which sat at its maximum from
// the day AI empires began spying on each other — took thirty points a tick off
// every bloc of every empire. Approval was zero across the whole galaxy, so
// political capital stopped accruing, legitimacy drained, and governments fell
// in the order their officers lost patience. A target cannot do that: a driver
// that stays on moves the bloc to a new level and holds it there.
//
// Everything that reads the state of the empire reads THIS empire's — its own
// war fatigue, its own stability, the operations aimed at it — never the
// galaxy-wide scalars in `world.shared`, which describe nobody in particular.

/** One named reason a bloc is where it is, in points of satisfaction. */
export interface BlocDriver {
    id: string;
    label: string;
    points: number;
}

/** Where a bloc is heading, and why. */
export interface BlocOutlook {
    /** 0–100. The satisfaction the bloc would settle at if nothing changed. */
    target: number;
    /** Largest effect first. */
    drivers: BlocDriver[];
}

/** The parts of an empire's situation its blocs react to. */
interface EmpireCircumstances {
    /** 0–100. This empire's own war exhaustion. */
    warFatigue: number;
    /** 0–1. This empire's own stability. */
    stability: number;
    /** 0–1. Covert pressure on this empire: operations aimed at it, plus ambient. */
    espionage: number;
    /** 0–100. Mean instability across this empire's frontier claims. */
    frontierInstability: number;
    /** Sanctions regimes in force against this empire. */
    embargoedBy: number;
    /** Sanctions regimes this empire is enforcing on others. */
    embargoesEnforced: number;
}

/**
 * This empire's circumstances. War fatigue and stability have been per-faction
 * since Government Phase 6.1 (tickCohesion writes them); the galaxy-wide values
 * are only the fallback for worlds with no government state, which is tests.
 */
function circumstancesOf(world: GameWorldState, factionId: string): EmpireCircumstances {
    const gov = world.government?.get?.(factionId);
    const shared = world.shared;
    return {
        warFatigue: gov ? gov.warFatigue : shared.warFatigue,
        stability: gov ? gov.stability / 100 : shared.stability,
        espionage: espionagePressureOn(world, factionId),
        frontierInstability: computeAverageFrontierInstability(factionId, world),
        ...sanctionsTouching(world, factionId),
    };
}

/**
 * Embargoes this empire is under and is enforcing. Read straight off the
 * diplomacy state rather than through the sanctions service, which imports
 * half of diplomacy; the record shape is { imposerId, targetId }.
 */
function sanctionsTouching(world: GameWorldState, factionId: string): { embargoedBy: number; embargoesEnforced: number } {
    const sanctions = (world as any).diplomacy?.sanctions;
    let embargoedBy = 0;
    let embargoesEnforced = 0;
    if (sanctions instanceof Map) {
        for (const record of sanctions.values()) {
            if (record?.targetId === factionId) embargoedBy++;
            if (record?.imposerId === factionId) embargoesEnforced++;
        }
    }
    return { embargoedBy, embargoesEnforced };
}

/**
 * Everything pulling on one bloc. Pure read: the tick applies exactly what
 * this returns, so a panel that shows these drivers shows the truth.
 */
export function computeBlocOutlook(
    bloc: InfluenceBloc,
    posture: EmpirePosture,
    world: GameWorldState,
    factionId: string,
    circumstances: EmpireCircumstances = circumstancesOf(world, factionId)
): BlocOutlook {
    const shared = world.shared;
    const drivers: BlocDriver[] = [];
    const push = (id: string, label: string, points: number) => {
        if (Math.abs(points) < 0.05) return;
        drivers.push({ id, label, points });
    };

    // ── How well the government's ideology suits the bloc ────────────────────
    // Data-driven for every bloc (data/blocs/*.json, copied onto the bloc at
    // bootstrap): each axis the bloc cares about, times how far the government
    // sits along it.
    let fit = 0;
    for (const [axis, weight] of Object.entries(bloc.ideologyAffinity ?? {})) {
        const value = (posture.ideology as unknown as Record<string, number> | undefined)?.[axis];
        if (typeof value !== 'number') continue;
        fit += weight * (value / 100);
    }
    push('ideology', fit >= 0 ? 'The government thinks as they do' : 'The government thinks otherwise', fit * drift.ideologyPoints);

    // ── The signals its definition says it watches ───────────────────────────
    for (const [key, weight] of Object.entries(bloc.signals ?? {})) {
        const signal = readSignal(key, shared, circumstances);
        if (!signal) continue;
        push(`signal:${key}`, signal.label, weight * signal.magnitude * drift.signalPoints);
    }

    // ── What the original four react to that no definition expresses ─────────
    switch (bloc.id) {
        case 'military':
            // A long war wears out the people fighting it.
            push('war', `War exhaustion at ${Math.round(circumstances.warFatigue)}`,
                -(circumstances.warFatigue / 100) * drift.warExhaustionPoints);
            break;

        case 'trade':
            if (shared.commodityAccess < 0.5) {
                push('scarcity', 'Shelves are empty', -(1 - shared.commodityAccess) * drift.scarcityPoints);
            }
            if (shared.tradeEfficiency < 0.7) {
                push('congestion', 'The lanes are choked', -(1 - shared.tradeEfficiency) * drift.tradeCongestionPoints);
            }
            if (shared.tradeEfficiency > 0.85 && shared.commodityAccess > 0.8) {
                push('boom', 'Trade is flowing', drift.boomPoints);
            }
            // Embargoes, in both directions. The sanctions tick used to take
            // these straight off satisfaction every tick — invisibly, and with
            // no bottom: an empire embargoed by most of the galaxy had its
            // merchants at zero by the fourth day while every driver on show
            // said trade was flowing. Same coalition arithmetic as the
            // treasury drain (one sanctioner is the baseline, each further one
            // adds half), with ONE ceiling shared by both directions: once most
            // ports are closed, one more closing changes little — whoever
            // closed it. (Capped separately, an empire embargoed by everyone
            // and embargoing everyone back lost eighty points and its
            // merchants were at zero again.)
            {
                const weight = circumstances.embargoedBy > 0 ? 1 + 0.5 * (circumstances.embargoedBy - 1) : 0;
                const embargoed = Math.min(drift.embargoMaxPoints, weight * drift.embargoPoints);
                const enforcing = Math.min(drift.embargoMaxPoints - embargoed,
                    circumstances.embargoesEnforced * drift.embargoCostPoints);
                push('embargoed',
                    circumstances.embargoedBy === 1 ? 'Under embargo by one power' : `Under embargo by ${circumstances.embargoedBy} powers`,
                    -embargoed);
                push('enforcing',
                    circumstances.embargoesEnforced === 1 ? 'Enforcing an embargo' : `Enforcing ${circumstances.embargoesEnforced} embargoes`,
                    -enforcing);
            }
            break;

        case 'frontier':
            if (circumstances.frontierInstability > 50) {
                push('frontier_unrest', `Frontier claims in turmoil (${Math.round(circumstances.frontierInstability)})`,
                    -(circumstances.frontierInstability / 100) * drift.frontierInstabilityPoints);
            }
            if (shared.commodityAccess < config.economy.commodities.scarcityFrontierIntegrationPenalty) {
                push('scarcity', 'Nothing reaches the border worlds', -drift.frontierScarcityPoints);
            }
            break;

        case 'science':
            if (shared.tradeEfficiency > 0.8) push('economy', 'A healthy economy funds the academies', drift.scienceEconomyPoints);
            break;
    }

    // ── Foreign hands ────────────────────────────────────────────────────────
    // Subversion bleeds into every bloc — of the empire it is aimed at.
    push('espionage', 'Foreign services are working on them', -circumstances.espionage * drift.espionagePoints);

    drivers.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    const target = clamp(drift.baseline + drivers.reduce((sum, d) => sum + d.points, 0), 0, 100);
    return { target, drivers };
}

/**
 * Move every bloc of one empire toward its target. Call every strategic tick.
 *
 * The step is exponential in the time elapsed, so one six-hour tick and six
 * one-hour ticks land in the same place, and a bloc never overshoots.
 */
export function tickBlocDrift(
    factionId: string,
    world: GameWorldState,
    deltaSeconds: number
): void {
    const posture = world.movement.empirePostures.get(factionId);
    if (!posture) return;

    const hours = deltaSeconds / 3600;
    const closed = 1 - Math.exp(-hours / drift.responseHours);
    const circumstances = circumstancesOf(world, factionId);

    for (const bloc of posture.blocs) {
        const { target } = computeBlocOutlook(bloc, posture, world, factionId, circumstances);
        const gap = target - bloc.satisfaction;
        bloc.satisfaction = clamp(bloc.satisfaction + gap * closed, 0, 100);
        bloc.target = target;
        bloc.trend = Math.abs(gap) < 1 ? 0 : Math.sign(gap);
    }

    // Normalise influence shares (they should stay summing to 100)
    normalizeInfluence(posture.blocs);

    // Recompute aggregate
    recomputeBlocSatisfaction(world);

    // Crisis check
    checkAndEmitCrisis(factionId, posture, world);
}

/**
 * Turn a signal named in a bloc definition into a signed "how good is this"
 * magnitude and a sentence. Stability, war fatigue and espionage are read for
 * the empire itself; the economy's scalars are galaxy-wide because the economy
 * computes them that way.
 */
function readSignal(
    key: string,
    shared: SharedState,
    circumstances: EmpireCircumstances
): { magnitude: number; label: string } | null {
    switch (key) {
        case 'stability':
            return { magnitude: circumstances.stability - drift.signalBaseline, label: `Stability at ${Math.round(circumstances.stability * 100)}` };
        case 'tradeEfficiency':
            return { magnitude: shared.tradeEfficiency - drift.signalBaseline, label: 'The state of trade' };
        case 'commodityAccess':
            return { magnitude: shared.commodityAccess - drift.signalBaseline, label: 'What reaches the shelves' };
        case 'infraIntegrity':
            return { magnitude: shared.infraIntegrity - drift.signalBaseline, label: 'The state of the lanes and gates' };
        case 'espionagePressure':
            return { magnitude: circumstances.espionage, label: 'Foreign interference' };
        case 'warFatigue':
            return { magnitude: circumstances.warFatigue / 100, label: `War exhaustion at ${Math.round(circumstances.warFatigue)}` };
        // 'blocSatisfaction' was once a signal: the galaxy's average mood
        // feeding each bloc's own. That is a feedback loop, not a cause.
        default:
            return null;
    }
}

function computeAverageFrontierInstability(factionId: string, world: GameWorldState): number {
    const claims = world.movement.frontierClaims.filter(c => c.factionId === factionId);
    if (claims.length === 0) return 0;
    const instabilities = claims.map(c => {
        const sys = world.movement.systems.get(c.systemId);
        return sys?.instability ?? 0;
    });
    return instabilities.reduce((a, b) => a + b, 0) / instabilities.length;
}

function normalizeInfluence(blocs: InfluenceBloc[]): void {
    const total = blocs.reduce((s, b) => s + b.influence, 0);
    if (total <= 0) return;
    for (const bloc of blocs) {
        bloc.influence = (bloc.influence / total) * 100;
    }
}

// ─── Policy effects ───────────────────────────────────────────────────────────

export interface PolicyEffect {
    blocId: string;
    satisfactionDelta: number;
    flexReductionApplied: boolean;
    doctrineSwitchSlowdown: number; // multiplier on posture switch duration
}

/**
 * Apply a policy effect to a faction's posture blocs.
 * High-influence blocs constrict flexibility and slow doctrine switching.
 */
export function applyPolicyEffect(
    factionId: string,
    policyId: string,
    world: GameWorldState
): PolicyEffect[] {
    const posture = world.movement.empirePostures.get(factionId);
    if (!posture) return [];

    const pfl = polCfg.policyFlexReduction;
    const results: PolicyEffect[] = [];

    for (const bloc of posture.blocs) {
        const highInfluence = bloc.influence >= pfl.highInfluenceThreshold;
        const alignedPolicy = isPolicyAlignedToBloc(policyId, bloc.id, posture);

        let satisfactionDelta = 0;
        if (alignedPolicy) satisfactionDelta += docCfg.doctrineDeviationFriction * 10;
        else satisfactionDelta -= 2;

        bloc.satisfaction = clamp(bloc.satisfaction + satisfactionDelta, 0, 100);

        const slowdown = highInfluence && !alignedPolicy
            ? pfl.doctrineSwitchSlowdownMultiplier
            : 1.0;

        results.push({
            blocId: bloc.id,
            satisfactionDelta,
            flexReductionApplied: highInfluence,
            doctrineSwitchSlowdown: slowdown,
        });
    }

    return results;
}

function isPolicyAlignedToBloc(policyId: string, blocId: string, posture: EmpirePosture): boolean {
    const policy = policyRegistry.get(policyId);

    // Fallback block if JSON definition doesn't exist yet
    if (!policy) {
        const alignments: Record<string, string[]> = {
            'militarize': ['military'],
            'open_trade': ['trade', 'frontier'],
            'research_push': ['science'],
            'expand_frontier': ['frontier'],
            'consolidate': ['trade', 'science'],
            'pacify': ['science', 'frontier'],
        };
        return (alignments[policyId] ?? []).includes(blocId);
    }

    const blocDef = factionRegistry.get(blocId);

    // Check if bloc natively favors it
    if (blocDef && blocDef.favored_policies.includes(policyId)) return true;

    // Check support_tags vs bloc tags
    if (blocDef && policy.support_tags.some(t => blocDef.tags.includes(t))) return true;

    // Check oppose_tags vs bloc tags
    if (blocDef && policy.oppose_tags.some(t => blocDef.tags.includes(t))) return false;

    // Check society and government tags alignment against this policy support_tags
    if (posture.society_tags && policy.support_tags.some(t => posture.society_tags!.includes(t))) return true;
    if (posture.government_tags && policy.support_tags.some(t => posture.government_tags!.includes(t))) return true;

    return false;
}

// ─── Crisis gating ────────────────────────────────────────────────────────────

export interface BlocReport {
    factionId: string;
    blocs: Array<{
        id: string;
        name: string;
        influence: number;
        satisfaction: number;
        trend: number;
        isCrisisContributor: boolean;
    }>;
    crisisConditionMet: boolean;
    activeIndicators: string[];
}

/**
 * Get current bloc report for UI display.
 */
export function getBlocReport(factionId: string, world: GameWorldState): BlocReport {
    const posture = world.movement.empirePostures.get(factionId);
    if (!posture) {
        return { factionId, blocs: [], crisisConditionMet: false, activeIndicators: [] };
    }
    const { indicators, activeIndicators } = evaluateCrisisIndicators(factionId, posture, world);

    return {
        factionId,
        blocs: posture.blocs.map(b => ({
            id: b.id,
            name: b.name,
            influence: b.influence,
            satisfaction: b.satisfaction,
            trend: b.trend,
            isCrisisContributor: b.satisfaction < docCfg.blocMinSatisfactionForCrisis,
        })),
        crisisConditionMet: indicators >= polCfg.crisisGating.minIndicatorsRequired,
        activeIndicators,
    };
}

/**
 * Crisis only triggers when multiple indicators are simultaneously active.
 * Single low bloc satisfaction alone is NOT sufficient.
 */
export function isCrisisCondition(factionId: string, world: GameWorldState): boolean {
    const posture = world.movement.empirePostures.get(factionId);
    if (!posture) return false;
    const { indicators } = evaluateCrisisIndicators(factionId, posture, world);
    return indicators >= polCfg.crisisGating.minIndicatorsRequired;
}

function evaluateCrisisIndicators(
    factionId: string,
    posture: EmpirePosture,
    world: GameWorldState
): { indicators: number; activeIndicators: string[] } {
    const shared = world.shared;
    const active: string[] = [];

    // 1. Low bloc satisfaction
    const unhappyBlocs = posture.blocs.filter(b => b.satisfaction < docCfg.blocMinSatisfactionForCrisis);
    if (unhappyBlocs.length >= 1) active.push('lowBlocSatisfaction');

    // 2. High instability in owned systems
    const ownedSystems = [...world.movement.systems.values()].filter(s => s.ownerFactionId === factionId);
    const avgInstability = ownedSystems.length > 0
        ? ownedSystems.reduce((s, sys) => s + sys.instability, 0) / ownedSystems.length
        : 0;
    if (avgInstability > 65) active.push('highInstability');

    // 3. Espionage pressure — on this empire: what is aimed at it, plus ambient.
    if (espionagePressureOn(world, factionId) > 0.6) active.push('highEspionagePressure');

    // 4. Trade collapse
    if (shared.tradeEfficiency < 0.35) active.push('tradeCollapse');

    // 5. War fatigue — this empire's own wars (per-faction since Phase 6.1).
    const warFatigue = world.government?.get?.(factionId)?.warFatigue ?? shared.warFatigue;
    if (warFatigue > 60) active.push('warFatigue');

    return { indicators: active.length, activeIndicators: active };
}

function checkAndEmitCrisis(
    factionId: string,
    posture: EmpirePosture,
    world: GameWorldState
): void {
    const cond = isCrisisCondition(factionId, world);
    if (!cond) return;

    const unhappyBlocs = posture.blocs
        .filter(b => b.satisfaction < docCfg.blocMinSatisfactionForCrisis)
        .map(b => b.id);

    eventBus.emit({
        type: 'blocSatisfactionCrisis',
        factionId,
        affectedBlocIds: unhappyBlocs,
        timestamp: world.nowSeconds,
    });
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 100): number {
    return Math.max(lo, Math.min(hi, v));
}
