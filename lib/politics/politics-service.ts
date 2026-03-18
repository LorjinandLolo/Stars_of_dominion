// lib/politics/politics-service.ts
// Pillar 5 — Internal Politics: expanded bloc drift, policy effects,
// crisis gating from multi-indicator checks.

import type { GameWorldState, SharedState } from '../game-world-state';
import type { EmpirePosture, InfluenceBloc } from '../movement/types';
import { clampShared, recomputeBlocSatisfaction } from '../game-world-state';
import { eventBus } from '../movement/event-bus';
import config from '../movement/movement-config.json';
import { policyRegistry, factionRegistry } from './registry';

const polCfg = config.politics;
const docCfg = config.doctrine;

// ─── Bloc drift sources ────────────────────────────────────────────────────────

/**
 * Expanded bloc drift: covers all spec-defined sources.
 * Call every major tick. Mutates blocs in-place.
 */
export function tickBlocDrift(
    factionId: string,
    world: GameWorldState,
    deltaSeconds: number
): void {
    const posture = world.movement.empirePostures.get(factionId);
    if (!posture) return;

    const hours = deltaSeconds / 3600;
    const src = polCfg.blocDriftSources;
    const shared = world.shared;

    for (const bloc of posture.blocs) {
        let delta = 0;

        switch (bloc.id) {
            case 'military':
                // Military bloc unhappy during long wars (warFatigue) + high logistics strain
                delta -= (shared.warFatigue / 100) * src.warDurationDriftPerDay / 24 * hours;

                // Ideological interaction: Military demands Order and Militarism
                if (posture.ideology.militarism_pacifism > 20) delta += 0.3 * hours;
                else if (posture.ideology.militarism_pacifism < -20) delta -= 0.5 * hours;

                if (posture.ideology.order_chaos > 20) delta += 0.2 * hours;
                break;

            case 'trade':
                // Trade bloc hurt by commodity scarcity and low trade efficiency
                if (shared.commodityAccess < 0.5) {
                    delta -= src.commodityScarcityDriftPerHour * (1 - shared.commodityAccess) * hours;
                }
                if (shared.tradeEfficiency < 0.7) {
                    delta -= src.commodityScarcityDriftPerHour * 0.5 * (1 - shared.tradeEfficiency) * hours;
                }
                // Good economic performance — recovery
                if (shared.tradeEfficiency > 0.85 && shared.commodityAccess > 0.8) {
                    delta += src.goodEconomicPerformanceRecoveryPerHour * hours;
                }

                // Ideological interaction: Trade favors Individualism and Progress
                if (posture.ideology.collectivism_individualism < -20) delta += 0.2 * hours;
                if (posture.ideology.tradition_progress < -20) delta += 0.1 * hours;
                break;

            case 'frontier':
                // Frontier bloc unhappy under high instability in unclaimed systems
                {
                    const avgInstability = computeAverageFrontierInstability(factionId, world);
                    if (avgInstability > 50) {
                        delta -= src.frontierInstabilityDriftPerHour * (avgInstability / 100) * hours;
                    }
                    // Commodity scarcity slows integration
                    if (shared.commodityAccess < config.economy.commodities.scarcityFrontierIntegrationPenalty) {
                        delta -= 0.3 * hours;
                    }
                }

                // Ideological interaction: Frontier likes Autonomy and Expansionism
                if (posture.ideology.centralization_autonomy < -20) delta += 0.2 * hours;
                if (posture.ideology.expansionism_isolationism > 20) delta += 0.2 * hours;
                if (posture.ideology.authoritarianism_liberty > 40) delta -= 0.3 * hours; // Hates Autocracy
                break;

            case 'science':
                // Science bloc relatively stable; hurt by Militarist posture (handled in doctrine), 
                // helped by good economy
                if (shared.tradeEfficiency > 0.8) delta += 0.2 * hours;

                // Ideological interaction: Science heavily favors Progress and Order
                if (posture.ideology.tradition_progress < -40) delta += 0.4 * hours;
                else if (posture.ideology.tradition_progress > 20) delta -= 0.5 * hours; // Tradition hurts Science
                break;
        }

        // Espionage pressure general drift (political subversion bleeds into all blocs)
        delta -= shared.espionagePressure * 0.5 * hours;

        // Apply and clamp
        bloc.satisfaction = clamp(bloc.satisfaction + delta * 10, 0, 100);
    }

    // Normalise influence shares (they should stay summing to 100)
    normalizeInfluence(posture.blocs);

    // Recompute aggregate
    recomputeBlocSatisfaction(world);

    // Crisis check
    checkAndEmitCrisis(factionId, posture, world);
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

    // 3. Espionage pressure
    if (shared.espionagePressure > 0.6) active.push('highEspionagePressure');

    // 4. Trade collapse
    if (shared.tradeEfficiency < 0.35) active.push('tradeCollapse');

    // 5. War fatigue
    if (shared.warFatigue > 60) active.push('warFatigue');

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
