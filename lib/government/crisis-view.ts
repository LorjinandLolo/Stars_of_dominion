// lib/government/crisis-view.ts
// Stars of Dominion — the coup crisis, as plain data (client-safe).
//
// When a plot strikes (lib/government/plots.ts) the empire enters a crisis
// window: a few sim days in which every actor of the state — ministers,
// governors, admirals, the officer corps — stands with the ruler, with the
// plotter, or undecided, and both players spend what they have to move them.
// The window is PUBLIC: the whole galaxy sees an empire fighting itself, so
// the record rides the shared snapshot. The rules of the window live here,
// pure, so the panel and the worker (crisis.ts) agree.
//
// Resolution, at the deadline or earlier when it is beyond doubt:
//  - the ruler holds       → the plotter is exiled, the plot's network purged;
//  - the plotter wins      → the throne changes hands, the ruler falls;
//  - neither (stalemate)   → civil war: the worlds whose governors sided with
//                            the plotter break away under them.

export type CrisisSide = 'ruler' | 'plotter' | 'undecided';
export type CrisisOutcome = 'ruler_holds' | 'plotter_wins' | 'civil_war';

export interface CrisisActor {
    id: string;
    name: string;
    kind: 'minister' | 'governor' | 'admiral' | 'officers' | 'human';
    /** How much this actor weighs in the balance (the officer corps weighs most). */
    weight: number;
    side: CrisisSide;
    /** A governor's world, an admiral's fleet: what follows them. */
    holds?: string;
    /** A human minister's seat id: they pick their own side (CRISIS_SIDE). */
    humanSeatId?: string;
    /** Secured or arrested this crisis: cannot be moved again. */
    locked?: boolean;
}

export interface CoupCrisis {
    id: string;
    factionId: string;
    plotId: string;
    plotterSeatId: string;
    plotterLeaderId: string;
    plotterName: string;
    rulerName: string;
    openedAtSeconds: number;
    deadlineSeconds: number;
    actors: CrisisActor[];
    /** Who holds the capital's garrison and palace. */
    capitalHeldBy: 'ruler' | 'plotter';
    /** The ruler took the throne to the fleet once: the deadline moved and the capital fell. */
    rulerFled: boolean;
    /** The plotter's favours: one per conspirator at the strike, spent securing actors. */
    favours: number;
    log: Array<{ atSeconds: number; text: string }>;
    status: 'open' | 'resolved';
    outcome?: CrisisOutcome;
    resolvedAtSeconds?: number;
}

/** The window: three sim days, plus two if the ruler flees. */
export const CRISIS_WINDOW_SECONDS = 3 * 86400;
export const FLEE_EXTENSION_SECONDS = 2 * 86400;
/** Share of the weight that settles it before the deadline, with the capital. */
export const DECISIVE_SHARE = 0.65;
/** Political capital the ruler pays to secure an undecided actor, or to arrest. */
export const SECURE_COST_PC = 10;
export const ARREST_COST_PC = 15;
/** Chance an arrest sticks; a failed one hardens the actor and costs legitimacy. */
export const ARREST_CHANCE = 0.6;
export const ARREST_FAIL_LEGITIMACY = 3;
/** Weights by kind. */
export const WEIGHT: Record<CrisisActor['kind'], number> = { minister: 1, governor: 1, admiral: 2, officers: 3, human: 1 };

export interface CrisisTally { ruler: number; plotter: number; undecided: number; total: number; rulerShare: number; plotterShare: number }

export function tally(crisis: CoupCrisis): CrisisTally {
    let ruler = 0, plotter = 0, undecided = 0;
    for (const a of crisis.actors) {
        if (a.side === 'ruler') ruler += a.weight;
        else if (a.side === 'plotter') plotter += a.weight;
        else undecided += a.weight;
    }
    const total = Math.max(1, ruler + plotter + undecided);
    return { ruler, plotter, undecided, total, rulerShare: ruler / total, plotterShare: plotter / total };
}

/** Settled beyond doubt before the deadline? */
export function decisiveSide(crisis: CoupCrisis): 'ruler' | 'plotter' | null {
    const t = tally(crisis);
    if (crisis.capitalHeldBy === 'ruler' && t.rulerShare >= DECISIVE_SHARE) return 'ruler';
    if (crisis.capitalHeldBy === 'plotter' && t.plotterShare >= DECISIVE_SHARE) return 'plotter';
    return null;
}

/** What the deadline says: the side with the capital AND the larger weight; otherwise nobody. */
export function deadlineOutcome(crisis: CoupCrisis): CrisisOutcome {
    const t = tally(crisis);
    if (crisis.capitalHeldBy === 'ruler' && t.ruler >= t.plotter) return 'ruler_holds';
    if (crisis.capitalHeldBy === 'plotter' && t.plotter > t.ruler) return 'plotter_wins';
    return 'civil_war';
}

/** May the plotter take the capital? Only with the larger weight in hand. */
export function canSeizeCapital(crisis: CoupCrisis): boolean {
    const t = tally(crisis);
    return crisis.capitalHeldBy === 'ruler' && t.plotter > t.ruler;
}

export function openCrisisOf(crises: Iterable<CoupCrisis> | undefined, factionId: string): CoupCrisis | undefined {
    for (const c of crises ?? []) if (c.factionId === factionId && c.status === 'open') return c;
    return undefined;
}
