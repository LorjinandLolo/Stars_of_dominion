// lib/politics/debate-types.ts
// Standing political debates — the catalog and the pure math.
//
// The support system charges the player at the moment THEY act. This is the
// other half of the arena: the galaxy acts, and a question lands on the
// government's table with the blocs already taking sides. Doing nothing is a
// choice, and it costs.
//
// The loop each question closes:
//   event → question opens → blocs position (existing stance math) → leader
//   resolves or stalls → satisfaction AND INFLUENCE shift → future support
//   rolls are weighted differently.
//
// PURE MODULE, like support-service: no world imports, no fs, no db. The
// client renders questions and forecasts resolutions through these same
// functions, so the panel can never disagree with the worker about what a
// choice will cost. All mutation lives in debate-service.ts (worker-side).

import {
    computeSupportFromStances,
    type BlocSupportInput,
    type SupportBand,
    type BlocSupportResult,
    type SupportContext,
} from './support-service';

export type DebateKind =
    | 'war_declared_on_us'
    | 'territory_lost'
    | 'espionage_exposed_on_us'
    | 'treaty_broken_on_us';

export interface DebateResolution {
    id: string;
    label: string;
    /** One sentence of what choosing this means, shown on the button. */
    description: string;
    /**
     * How each bloc reads this resolution, -1..1 — same vocabulary as
     * BLOC_STANCES so the two systems stay one political model. Blocs absent
     * from the row are neutral.
     */
    stances: Record<string, number>;
    /** Political capital price. The cheap option is rarely the good one. */
    politicalCapitalCost: number;
    /** Applied to gov.legitimacy on resolution. */
    legitimacyDelta: number;
    /** Applied to gov.coupPressure — suppression breeds plotters. */
    coupPressureDelta?: number;
}

export interface DebateSpec {
    kind: DebateKind;
    /** Headline template; {aggressor} and {place} fill from facts. */
    title: string;
    prompt: string;
    /** Strategic ticks before the question resolves itself as 'ignored'. */
    deadlineTicks: number;
    resolutions: DebateResolution[];
}

/**
 * An open question on one government's table.
 *
 * Plain JSON riding EmpirePosture.openQuestions — postures survive both the
 * authoritative save and the client snapshot untouched (cleanWorldForSave
 * never clears them), so this needs zero persistence edits. Absolute
 * timestamps, never countdowns, per the codebase-wide rule.
 */
export interface PoliticalQuestion {
    id: string;
    kind: DebateKind;
    openedAtSeconds: number;
    deadlineAtSeconds: number;
    /** Display facts: aggressor name, place name — resolved at open time. */
    facts: Record<string, string>;
    /** The faction that caused the question, when one did. For the record. */
    aggressorFactionId?: string;
    status: 'open';
}

const TICK_SECONDS = 6 * 60 * 60;

/**
 * The catalog. Three resolutions per question, deliberately: a hawkish, a
 * dovish and an institutional answer, so every bloc has somewhere to stand and
 * no choice is free. Numbers use the nine registry bloc ids.
 */
export const DEBATE_CATALOG: Record<DebateKind, DebateSpec> = {
    war_declared_on_us: {
        kind: 'war_declared_on_us',
        title: 'War: {aggressor} has attacked us',
        prompt: 'The empire is at war by someone else\'s choice. The chamber demands a doctrine.',
        deadlineTicks: 32,
        resolutions: [
            {
                id: 'total_mobilization',
                label: 'Total mobilization',
                description: 'Everything for the front. The generals get their war.',
                stances: { military: 0.9, frontier: 0.4, religious: 0.2, trade: -0.6, workers: -0.5, science: -0.4, environmentalists: -0.7, colonists: -0.2, alien_minorities: -0.4 },
                politicalCapitalCost: 6,
                legitimacyDelta: 2,
            },
            {
                id: 'measured_response',
                label: 'Measured response',
                description: 'Defend what is ours, escalate nothing. Nobody is thrilled; nobody revolts.',
                stances: { military: -0.2, trade: 0.3, workers: 0.2, science: 0.2, frontier: 0.1, colonists: 0.2 },
                politicalCapitalCost: 3,
                legitimacyDelta: 1,
            },
            {
                id: 'sue_for_terms',
                label: 'Seek terms',
                description: 'Open a channel before the dying starts in earnest. The hawks will not forgive it.',
                stances: { military: -0.8, frontier: -0.4, trade: 0.7, workers: 0.6, environmentalists: 0.8, science: 0.4, alien_minorities: 0.5, religious: -0.1 },
                politicalCapitalCost: 4,
                legitimacyDelta: -3,
            },
        ],
    },
    territory_lost: {
        kind: 'territory_lost',
        title: 'The fall of {place}',
        prompt: 'A world has been taken from us. Someone must answer for it — or the nation must be rallied past it.',
        deadlineTicks: 24,
        resolutions: [
            {
                id: 'rally_the_nation',
                label: 'Rally the nation',
                description: 'No scapegoats. Grief becomes resolve, and the government owns the loss.',
                stances: { military: 0.3, workers: 0.3, colonists: 0.4, frontier: 0.3, religious: 0.4, trade: 0.1 },
                politicalCapitalCost: 5,
                legitimacyDelta: 3,
            },
            {
                id: 'blame_the_command',
                label: 'Blame the command',
                description: 'The generals failed. Saying so aloud is cheap, and the army will remember it.',
                stances: { military: -0.9, trade: 0.3, workers: 0.2, science: 0.2, environmentalists: 0.2 },
                politicalCapitalCost: 1,
                legitimacyDelta: 1,
                coupPressureDelta: 6,
            },
            {
                id: 'purge_commanders',
                label: 'Purge the commanders',
                description: 'Courts-martial, cashiering, examples made. Order through fear.',
                stances: { military: -0.6, religious: 0.2, frontier: -0.2, alien_minorities: -0.3, workers: -0.2 },
                politicalCapitalCost: 12,
                legitimacyDelta: 4,
                coupPressureDelta: 10,
            },
        ],
    },
    espionage_exposed_on_us: {
        kind: 'espionage_exposed_on_us',
        title: 'Spies of {aggressor} caught in our halls',
        prompt: 'A foreign operation has been exposed on our soil. The chamber wants to know what the answer is.',
        deadlineTicks: 20,
        resolutions: [
            {
                id: 'demand_reckoning',
                label: 'Demand a reckoning',
                description: 'Public accusation, sanctions on the table. Escalation with an audience.',
                stances: { military: 0.6, religious: 0.3, frontier: 0.2, trade: -0.4, science: -0.2, alien_minorities: -0.3 },
                politicalCapitalCost: 4,
                legitimacyDelta: 2,
            },
            {
                id: 'quiet_expulsion',
                label: 'Quiet expulsion',
                description: 'Put the agents on a shuttle and say nothing. Business continues.',
                stances: { trade: 0.6, science: 0.3, workers: 0.2, military: -0.4, religious: -0.2 },
                politicalCapitalCost: 2,
                legitimacyDelta: -1,
            },
            {
                id: 'internal_crackdown',
                label: 'Internal crackdown',
                description: 'Sweep our own institutions. Security bought with suspicion.',
                stances: { military: 0.4, religious: 0.2, science: -0.5, alien_minorities: -0.8, workers: -0.3, trade: -0.2 },
                politicalCapitalCost: 8,
                legitimacyDelta: 1,
                coupPressureDelta: -4,
            },
        ],
    },
    treaty_broken_on_us: {
        kind: 'treaty_broken_on_us',
        title: '{aggressor} has torn up our accord',
        prompt: 'Ink we trusted is ash. The chamber argues over what our signature is worth.',
        deadlineTicks: 20,
        resolutions: [
            {
                id: 'answer_betrayal',
                label: 'Answer the betrayal',
                description: 'Sanctions, posturing, and a grudge made policy.',
                stances: { military: 0.5, religious: 0.4, frontier: 0.2, trade: -0.5, workers: -0.2, environmentalists: -0.3 },
                politicalCapitalCost: 5,
                legitimacyDelta: 2,
            },
            {
                id: 'write_it_off',
                label: 'Write it off',
                description: 'Paper was always paper. Trade with whoever still signs.',
                stances: { trade: 0.7, workers: 0.3, science: 0.2, military: -0.5, religious: -0.4, frontier: -0.2 },
                politicalCapitalCost: 2,
                legitimacyDelta: -2,
            },
        ],
    },
};

export interface ResolutionForecast {
    resolutionId: string;
    total: number;
    band: SupportBand;
    blocs: BlocSupportResult[];
}

/**
 * How the blocs would take each way out of a question. Pure — the client calls
 * this with politicsState.blocs to paint the buttons, the worker calls it with
 * the live posture to apply the consequences. Same numbers on both ends.
 */
export function forecastResolutions(
    question: Pick<PoliticalQuestion, 'kind'>,
    blocs: BlocSupportInput[],
    ctx: SupportContext,
): ResolutionForecast[] {
    const spec = DEBATE_CATALOG[question.kind];
    if (!spec) return [];
    return spec.resolutions.map(resolution => {
        const { total, band, blocs: results } = computeSupportFromStances(blocs, resolution.stances, ctx);
        return { resolutionId: resolution.id, total, band, blocs: results };
    });
}

/** Fill a spec's title from a question's facts. */
export function debateTitle(question: PoliticalQuestion): string {
    const spec = DEBATE_CATALOG[question.kind];
    if (!spec) return question.kind;
    return spec.title
        .replace('{aggressor}', question.facts.aggressor ?? 'an unknown power')
        .replace('{place}', question.facts.place ?? 'a world');
}

/** Deadline expressed in strategic ticks remaining. */
export function ticksRemaining(question: PoliticalQuestion, nowSeconds: number): number {
    return Math.max(0, Math.ceil((question.deadlineAtSeconds - nowSeconds) / TICK_SECONDS));
}
