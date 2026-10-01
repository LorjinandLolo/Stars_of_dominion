// lib/politics/debate-service.ts
// Standing political debates — the mutations. WORKER-SIDE.
//
// Three writers into the political model, all through existing state:
//   - satisfaction shifts on the blocs (the mood, as evaluateSupportAndApply
//     already does for actions);
//   - INFLUENCE shifts on the blocs (the power — the field computeActionSupport
//     has weighted by since it was written, and which nothing ever changed
//     until now: winning a debate makes a bloc's voice permanently louder);
//   - legitimacy / political capital / coup pressure on the government.
//
// Questions ride EmpirePosture.openQuestions: postures survive both saves and
// are never cleared by cleanWorldForSave, so there are ZERO persistence edits.
// ensureEmpirePostures back-fills the array for old snapshots.

import type { GameWorldState } from '@/lib/game-world-state';
import type { InfluenceBloc } from '@/lib/movement/types';
import { isDelegated } from '@/lib/delegation/delegation-service';
import { atLeastAGalacticDay, GALACTIC_DAY_SIM_SECONDS } from '@/lib/time/time-config';
import {
    DEBATE_CATALOG,
    debateTitle,
    forecastResolutions,
    type DebateKind,
    type PoliticalQuestion,
} from './debate-types';
import { getPublicTrust } from '@/lib/press-system/integration';
import { record as recordChronicle } from '@/lib/narrative/chronicle';
import { bumpMetric } from '@/lib/tech/history-ledger';

const TICK_SECONDS = 6 * 60 * 60;

/** Influence points that change hands when a question resolves. */
const INFLUENCE_STAKE = 6;
/** No bloc is ever ground to silence — a floor keeps politics plural. */
const INFLUENCE_FLOOR = 3;
/** Satisfaction swing at full stance alignment. */
const SATISFACTION_SWING = 7;
/** Per-tick satisfaction bleed on the most invested blocs while a question festers. */
const FESTER_BLEED = 0.35;
/** What ignoring a question outright costs the government. */
const IGNORED_LEGITIMACY_LOSS = 4;
/**
 * How long the chamber considers a question settled: the same question about
 * the same aggressor is not put to it again inside one Galactic Day.
 */
const REOPEN_COOLDOWN_SECONDS = GALACTIC_DAY_SIM_SECONDS;

export const DEBATES_OPENED_METRIC = 'pol.debatesOpened';
export const DEBATES_RESOLVED_METRIC = 'pol.debatesResolved';
export const DEBATES_IGNORED_METRIC = 'pol.debatesIgnored';

function postureOf(world: GameWorldState, factionId: string) {
    return world.movement?.empirePostures?.get?.(factionId);
}

function govOf(world: GameWorldState, factionId: string) {
    return (world as any).government?.get?.(factionId);
}

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

/** Re-normalize influence to a 100 total without letting anyone vanish. */
function normalizeInfluence(blocs: InfluenceBloc[]): void {
    for (const b of blocs) b.influence = Math.max(INFLUENCE_FLOOR, b.influence);
    const total = blocs.reduce((s, b) => s + b.influence, 0) || 1;
    for (const b of blocs) b.influence = (b.influence / total) * 100;
}

/**
 * Open a question on a government's table.
 *
 * Idempotent per (kind, aggressor) while one is already open — a war produces
 * one mobilization debate, not one per skirmish. Factions without politics
 * (no posture, no blocs) never get questions; there is nobody to argue.
 */
export function openDebate(
    world: GameWorldState,
    factionId: string,
    kind: DebateKind,
    facts: Record<string, string>,
    aggressorFactionId?: string,
): PoliticalQuestion | null {
    const posture = postureOf(world, factionId);
    if (!posture?.blocs?.length) return null;
    const spec = DEBATE_CATALOG[kind];
    if (!spec) return null;

    const open: PoliticalQuestion[] = (posture as any).openQuestions ?? ((posture as any).openQuestions = []);
    if (open.some(q => q.kind === kind && q.aggressorFactionId === aggressorFactionId)) return null;

    const now = world.nowSeconds ?? 0;
    // ...and not again the moment it closes. A chamber that has just answered
    // "what do we do about their spies" does not reconvene for the next agent
    // caught the following morning: it is the same affair. Without this, an
    // empire whose government answers promptly (every AI, every delegated
    // cabinet) reopened the question on the very next exposure — the most
    // spied-on empire held 130 votes on it in 300 ticks, each one moving
    // satisfaction, influence and legitimacy the same way, until the losing
    // blocs were at zero and the winners owned the chamber.
    const settledAt = settledQuestionsOf(posture)[questionKey(kind, aggressorFactionId)];
    if (typeof settledAt === 'number' && now - settledAt < REOPEN_COOLDOWN_SECONDS) return null;
    const question: PoliticalQuestion = {
        id: `debate-${factionId}-${kind}-${now}`,
        kind,
        openedAtSeconds: now,
        // The catalog's 20-32 ticks is 8-13 real hours; a chamber waits at
        // least one Galactic Day for a player who checks in once a day.
        deadlineAtSeconds: now + atLeastAGalacticDay(spec.deadlineTicks * TICK_SECONDS),
        facts,
        aggressorFactionId,
        status: 'open',
    };
    open.push(question);
    bumpMetric(world as any, factionId, DEBATES_OPENED_METRIC, 1);
    console.log(`[Politics] ${factionId}: debate opens — ${debateTitle(question)}`);
    return question;
}

function questionKey(kind: string, aggressorFactionId?: string): string {
    return `${kind}|${aggressorFactionId ?? ''}`;
}

/** When each (question, aggressor) was last closed. Rides the posture, like the questions. */
function settledQuestionsOf(posture: any): Record<string, number> {
    if (!posture.settledQuestions || typeof posture.settledQuestions !== 'object') posture.settledQuestions = {};
    return posture.settledQuestions;
}

/** Note that a question has left the table, however it left. */
function markSettled(world: GameWorldState, posture: any, question: PoliticalQuestion): void {
    const settled = settledQuestionsOf(posture);
    const now = world.nowSeconds ?? 0;
    settled[questionKey(question.kind, question.aggressorFactionId)] = now;
    // Keep the record from growing for ever: anything past its cooldown is moot.
    for (const [key, at] of Object.entries(settled)) {
        if (now - at >= REOPEN_COOLDOWN_SECONDS) delete settled[key];
    }
}

export function openQuestionsOf(world: GameWorldState, factionId: string): PoliticalQuestion[] {
    const posture = postureOf(world, factionId) as any;
    return posture?.openQuestions ?? [];
}

export interface ResolveResult {
    ok: boolean;
    reason?: string;
    band?: string;
}

/**
 * The leader picks an answer. Never refused for being unpopular — the whole
 * design is that you may force anything through and pay — but refused when the
 * treasury of political capital genuinely cannot cover it.
 */
export function resolveDebate(
    world: GameWorldState,
    factionId: string,
    questionId: string,
    resolutionId: string,
): ResolveResult {
    const posture = postureOf(world, factionId) as any;
    const open: PoliticalQuestion[] = posture?.openQuestions ?? [];
    const question = open.find(q => q.id === questionId);
    if (!question) return { ok: false, reason: 'No such question is before the chamber.' };

    const spec = DEBATE_CATALOG[question.kind];
    const resolution = spec?.resolutions.find(r => r.id === resolutionId);
    if (!resolution) return { ok: false, reason: 'That is not one of the answers on the table.' };

    const gov = govOf(world, factionId);
    if (gov && (gov.politicalCapital ?? 0) < resolution.politicalCapitalCost) {
        return { ok: false, reason: `Costs ${resolution.politicalCapitalCost} political capital; the treasury holds ${Math.round(gov.politicalCapital ?? 0)}.` };
    }

    // How the chamber takes it — same engine the client used to paint the button.
    const forecast = forecastResolutions(question, posture.blocs, {
        warFatigue: (world as any).shared?.warFatigue ?? 0,
        rivalryScore: 20,
        publicTrust: safeTrust(world, factionId),
    }).find(f => f.resolutionId === resolutionId);

    // The mood: supporters warm, opponents sour — scaled by conviction.
    for (const bloc of posture.blocs as InfluenceBloc[]) {
        const stance = resolution.stances[bloc.id] ?? 0;
        if (stance !== 0) bloc.satisfaction = clamp100(bloc.satisfaction + stance * SATISFACTION_SWING);
    }

    // The power. Blocs that got their way grow louder; blocs that were
    // overridden lose standing. This is the arc's point: computeActionSupport
    // has weighted by influence since it was written — this is the first thing
    // in the game that MOVES it, so ignoring a lobby repeatedly genuinely
    // reshapes every future support roll.
    const winners = (posture.blocs as InfluenceBloc[]).filter(b => (resolution.stances[b.id] ?? 0) > 0);
    const losers = (posture.blocs as InfluenceBloc[]).filter(b => (resolution.stances[b.id] ?? 0) < 0);
    //
    // The winners gain what the losers actually give up, and a loser cannot
    // give up what it no longer has: nothing is taken below the floor. The
    // stake used to be credited to the winners in full whatever the losers had
    // left, so a question asked over and over and answered the same way kept
    // inflating the same blocs after the others had hit the floor — and
    // renormalising then squeezed every NEUTRAL bloc down to the floor too.
    if (winners.length && losers.length) {
        const asked = INFLUENCE_STAKE / losers.length;
        let taken = 0;
        for (const b of losers) {
            const given = Math.min(asked, Math.max(0, b.influence - INFLUENCE_FLOOR));
            b.influence -= given;
            taken += given;
        }
        for (const b of winners) b.influence += taken / winners.length;
        normalizeInfluence(posture.blocs);
    }

    // The state.
    if (gov) {
        gov.politicalCapital = Math.max(0, (gov.politicalCapital ?? 0) - resolution.politicalCapitalCost);
        gov.legitimacy = clamp100((gov.legitimacy ?? 50) + resolution.legitimacyDelta);
        if (resolution.coupPressureDelta) {
            gov.coupPressure = clamp100((gov.coupPressure ?? 0) + resolution.coupPressureDelta);
        }
    }

    posture.openQuestions = open.filter(q => q.id !== questionId);
    markSettled(world, posture, question);
    bumpMetric(world as any, factionId, DEBATES_RESOLVED_METRIC, 1);

    // The record. council_vote is a declared chronicle type with no emitter
    // until now — the gazette can finally cover politics.
    recordChronicle(world, {
        type: 'council_vote',
        actorIds: [factionId],
        targetIds: question.aggressorFactionId ? [question.aggressorFactionId] : [],
        facts: {
            question: debateTitle(question),
            resolution: resolution.label,
            support: forecast?.total ?? 50,
            band: forecast?.band ?? 'divided',
        },
    });

    console.log(`[Politics] ${factionId}: "${debateTitle(question)}" resolved — ${resolution.label} (${forecast?.band ?? '?'}, ${forecast?.total ?? '?'}%)`);
    return { ok: true, band: forecast?.band };
}

function safeTrust(world: GameWorldState, factionId: string): number {
    try { return getPublicTrust(world, factionId); } catch { return 60; }
}

/**
 * One strategic tick of every open question everywhere.
 *
 * Festering: the blocs with the strongest feelings about an unresolved
 * question bleed satisfaction while it sits — agitation, not apathy. At the
 * deadline the question resolves itself as IGNORED: every invested bloc sours,
 * the single most invested bloc gains influence (nothing recruits like a
 * government that will not answer you), and legitimacy takes the hit.
 *
 * AI empires resolve their questions the tick after they open, choosing the
 * highest-support answer — a functioning consensus politician. Personality-
 * driven AI politics is a later pass; an AI that never answers would just
 * bleed forever, which is worse than a boring answer.
 */
export function tickDebates(world: GameWorldState): void {
    const postures = world.movement?.empirePostures;
    if (!postures?.size) return;
    const now = world.nowSeconds ?? 0;
    const claimed: string[] = Array.isArray((world as any).claimedFactionIds) ? (world as any).claimedFactionIds : [];

    for (const factionId of [...postures.keys()].sort()) {
        const posture = postures.get(factionId) as any;
        const open: PoliticalQuestion[] = posture?.openQuestions;
        if (!open?.length) continue;

        for (const question of [...open]) {
            const spec = DEBATE_CATALOG[question.kind];
            if (!spec) { posture.openQuestions = open.filter(q => q !== question); continue; }

            // AI empires answer promptly and by consensus — and so does a human
            // empire whose government is delegated. Same branch on purpose:
            // "my cabinet handled it" and "an AI handled it" are the same
            // politics, and a second code path would drift from this one.
            const answeredByStaff = !claimed.includes(factionId)
                || isDelegated(world as any, factionId, 'government');
            if (answeredByStaff && now >= question.openedAtSeconds + TICK_SECONDS) {
                const forecasts = forecastResolutions(question, posture.blocs, {
                    warFatigue: (world as any).shared?.warFatigue ?? 0,
                    rivalryScore: 20,
                    publicTrust: safeTrust(world, factionId),
                });
                // Best answer the chamber can actually pay for. Ranking by
                // support alone picked resolutions the treasury could not
                // afford: resolveDebate refused them, nothing was logged, and
                // the question sat there until the deadline punished it.
                const capital = govOf(world, factionId)?.politicalCapital ?? 0;
                const ranked = forecasts.slice().sort((a, b) => b.total - a.total);
                const costOf = (resolutionId: string) =>
                    spec.resolutions.find(r => r.id === resolutionId)?.politicalCapitalCost ?? 0;
                const best = ranked.find(f => costOf(f.resolutionId) <= capital)
                    ?? ranked.slice().sort((a, b) => costOf(a.resolutionId) - costOf(b.resolutionId))[0];
                if (best && costOf(best.resolutionId) <= capital) {
                    resolveDebate(world, factionId, question.id, best.resolutionId);
                    continue;
                }
            }

            // Deadline: the question dies in committee, and everyone noticed.
            if (now >= question.deadlineAtSeconds) {
                // Unless the chamber was never waiting on an absent player: a
                // delegated government answered, or tried to. Inaction is only
                // punished when the player kept the lever (Item 2 of the
                // casual-play spec). Close it quietly.
                if (claimed.includes(factionId) && isDelegated(world as any, factionId, 'government')) {
                    posture.openQuestions = (posture.openQuestions as PoliticalQuestion[]).filter(q => q.id !== question.id);
                    markSettled(world, posture, question);
                    continue;
                }
                const invested = (posture.blocs as InfluenceBloc[])
                    .map(b => ({ b, weight: Math.max(...spec.resolutions.map(r => Math.abs(r.stances[b.id] ?? 0))) }))
                    .filter(x => x.weight > 0)
                    .sort((a, x) => x.weight - a.weight);
                for (const { b, weight } of invested) {
                    b.satisfaction = clamp100(b.satisfaction - 5 * weight);
                }
                if (invested[0]) {
                    invested[0].b.influence += 4;
                    normalizeInfluence(posture.blocs);
                }
                const gov = govOf(world, factionId);
                if (gov) gov.legitimacy = clamp100((gov.legitimacy ?? 50) - IGNORED_LEGITIMACY_LOSS);

                posture.openQuestions = (posture.openQuestions as PoliticalQuestion[]).filter(q => q.id !== question.id);
                markSettled(world, posture, question);
                bumpMetric(world as any, factionId, DEBATES_IGNORED_METRIC, 1);
                recordChronicle(world, {
                    type: 'council_vote',
                    actorIds: [factionId],
                    facts: { question: debateTitle(question), resolution: 'No answer — the question died in committee', support: 0, band: 'ignored' },
                });
                console.log(`[Politics] ${factionId}: "${debateTitle(question)}" IGNORED — the chamber remembers.`);
                continue;
            }

            // Fester: the two most invested blocs agitate.
            const invested = (posture.blocs as InfluenceBloc[])
                .map(b => ({ b, weight: Math.max(...spec.resolutions.map(r => Math.abs(r.stances[b.id] ?? 0))) }))
                .filter(x => x.weight > 0)
                .sort((a, x) => x.weight - a.weight)
                .slice(0, 2);
            for (const { b } of invested) {
                b.satisfaction = clamp100(b.satisfaction - FESTER_BLEED);
            }
        }
    }
}
