// lib/goals/first-week-goals.ts
// Stars of Dominion — the first week, as five things to do.
//
// A new player does not need eighteen tutorial steps; they need to know the one
// thing that moves their empire forward next. Five goals, in order: warships,
// charts, a second world, a Spaceyard in orbit, and a first contact. Each
// has one line of hint and a deep link that opens the panel that does it.
//
// Completion is read from the deed ledger (lib/tech/deed-metrics.ts), the
// counters the simulation already bumps where each deed happens — never from
// "did the player click the button". The worker advances the record every
// cycle (tickFirstWeekGoals); the record rides the owner's shard. Everything
// else here is a pure read, safe in the client bundle: the brief's suggested
// move and the goal card both call currentGoal() on whatever world they hold.

import { getMetric } from '@/lib/tech/history-ledger';
import {
    DEED_SHIPS_COMMISSIONED,
    DEED_SYSTEMS_SURVEYED,
    DEED_COLONIES_FOUNDED,
    DEED_SHIPYARDS_BUILT,
    DEED_TREATIES_SIGNED,
    DEED_ENVOYS_SENT,
} from '@/lib/tech/deed-metrics';

export type GoalId =
    | 'commission_ships'
    | 'survey_three'
    | 'settle_world'
    | 'build_shipyard'
    | 'reach_out';

/** Where a goal's button takes the player. The client resolves it against its store. */
export interface GoalDeepLink {
    /** NavTab to show. 'galaxy' collapses every panel back to the map. */
    tab: string;
    /** Open this planet's build panel (commissioning, orbital structures). */
    constructionPlanetId?: string;
    /** Select this system on the map, so its context panel offers survey/settle. */
    selectSystemId?: string;
    /** Label for the button. */
    label: string;
}

export interface GoalDef {
    id: GoalId;
    title: string;
    /** One line: what to do, and where. */
    hint: string;
    /** Metrics that count toward it; their sum is the progress. */
    metrics: string[];
    target: number;
}

/** The order is the lesson: you cannot survey without ships, settle without charts. */
export const FIRST_WEEK_GOALS: readonly GoalDef[] = [
    {
        id: 'commission_ships',
        title: 'Commission your first warships',
        hint: 'Open your capital and commission a task force from Space Construction (build a Shipyard first if that tab is missing). Every survey, colony and defence starts with hulls.',
        metrics: [DEED_SHIPS_COMMISSIONED],
        target: 1,
    },
    {
        id: 'survey_three',
        title: 'Survey three systems',
        hint: 'Select a system you have scanned and send a fleet to survey it. Only surveyed worlds can be settled.',
        metrics: [DEED_SYSTEMS_SURVEYED],
        target: 3,
    },
    {
        id: 'settle_world',
        title: 'Settle a second world',
        hint: 'Pick a surveyed, unclaimed planet and settle it. Your empire starts with one world; this is the second.',
        metrics: [DEED_COLONIES_FOUNDED],
        target: 1,
    },
    {
        id: 'build_shipyard',
        // Not the ground "Orbital Shipyard" building every capital starts with:
        // the orbital LAYER's yard, which is what lays cruisers and up.
        title: 'Raise a Spaceyard in orbit',
        hint: 'Your ground yard lays corvettes; cruisers and bigger need a Spaceyard in orbit. Build one from your capital’s Orbital tab.',
        metrics: [DEED_SHIPYARDS_BUILT],
        target: 1,
    },
    {
        id: 'reach_out',
        title: 'Reach out to a neighbour',
        hint: 'Send an envoy or sign a pact in Diplomacy. Nobody holds a galaxy alone.',
        metrics: [DEED_TREATIES_SIGNED, DEED_ENVOYS_SENT],
        target: 1,
    },
];

/** What rides the shard. Index of the goal being worked on; FIRST_WEEK_GOALS.length = all done. */
export interface GoalState {
    index: number;
    /** Sim-clock second each goal was completed, for the record and the brief. */
    completedAt: Partial<Record<GoalId, number>>;
}

export function emptyGoalState(): GoalState {
    return { index: 0, completedAt: {} };
}

type WorldLike = Record<string, any>;

/** Progress toward one goal, straight from the deed ledger. */
export function goalProgress(world: WorldLike, factionId: string, goal: GoalDef): number {
    return goal.metrics.reduce((sum, metric) => sum + getMetric(world as any, factionId, metric), 0);
}

function goalStateOf(world: WorldLike, factionId: string): GoalState {
    const stored = world?.firstWeekGoals?.get?.(factionId) ?? world?.firstWeekGoals?.[factionId];
    return stored ? { index: Number(stored.index) || 0, completedAt: { ...(stored.completedAt ?? {}) } } : emptyGoalState();
}

export interface GoalAdvance {
    factionId: string;
    completed: GoalDef;
    next: GoalDef | null;
}

/**
 * Advance every human faction's goal record against its deed ledger. Called by
 * the worker every cycle; cheap (a handful of counter reads per player).
 *
 * Several goals can close in one call: an experienced player who has already
 * charted three systems passes straight through. They still read in order.
 */
export function tickFirstWeekGoals(world: WorldLike): GoalAdvance[] {
    const claimed: string[] = Array.isArray(world?.claimedFactionIds) ? world.claimedFactionIds : [];
    if (!claimed.length) return [];
    if (!(world.firstWeekGoals instanceof Map)) world.firstWeekGoals = new Map<string, GoalState>();

    const advances: GoalAdvance[] = [];
    for (const factionId of claimed) {
        const state = goalStateOf(world, factionId);
        let moved = false;
        while (state.index < FIRST_WEEK_GOALS.length) {
            const goal = FIRST_WEEK_GOALS[state.index];
            if (goalProgress(world, factionId, goal) < goal.target) break;
            state.completedAt[goal.id] = Number(world.nowSeconds ?? 0);
            state.index += 1;
            moved = true;
            advances.push({ factionId, completed: goal, next: FIRST_WEEK_GOALS[state.index] ?? null });
        }
        if (moved || !world.firstWeekGoals.has(factionId)) world.firstWeekGoals.set(factionId, state);
    }
    return advances;
}

/** Goals this faction has met, in order — the ones before its current index. */
export function completedGoals(world: WorldLike, factionId: string): GoalId[] {
    const state = goalStateOf(world, factionId);
    return FIRST_WEEK_GOALS.slice(0, Math.max(0, state.index)).map(g => g.id);
}

export interface CurrentGoal {
    goal: GoalDef;
    /** 1-based, for "Goal 2 of 5". */
    number: number;
    total: number;
    progress: number;
    deepLink: GoalDeepLink;
}

/**
 * The goal the player is on, with progress and a deep link resolved against
 * this world. Null when all five are done. Reads the stored index, so the
 * card and the brief move exactly when the worker says the goal moved.
 */
export function currentGoal(world: WorldLike, factionId: string): CurrentGoal | null {
    const state = goalStateOf(world, factionId);
    const goal = FIRST_WEEK_GOALS[state.index];
    if (!goal) return null;
    return {
        goal,
        number: state.index + 1,
        total: FIRST_WEEK_GOALS.length,
        progress: Math.min(goal.target, goalProgress(world, factionId, goal)),
        deepLink: deepLinkFor(world, factionId, goal.id),
    };
}

// ─── Deep links ───────────────────────────────────────────────────────────────

function mapValues(source: any): any[] {
    if (!source) return [];
    if (typeof source.values === 'function') return Array.from(source.values());
    if (Array.isArray(source)) return source;
    return Object.values(source);
}

/** The capital world and its system: the build panel needs both to open. */
function capitalPlanet(world: WorldLike, factionId: string): { id?: string; systemId?: string } {
    const faction = world?.economy?.factions?.get?.(factionId);
    const capitalSystem = faction?.capitalSystemId;
    const owned = mapValues(world?.construction?.planets).filter((p: any) => p?.ownerId === factionId);
    const planet = owned.find((p: any) => p.systemId === capitalSystem) ?? owned[0];
    return { id: planet?.id, systemId: planet?.systemId };
}

function visibilityOf(world: WorldLike, factionId: string): Record<string, any> {
    return world?.movement?.factionVisibility?.get?.(factionId)
        ?? world?.movement?.factionVisibility?.[factionId]
        ?? {};
}

function stageOf(entry: any): string | undefined {
    return typeof entry === 'string' ? entry : entry?.revealStage;
}

/** A system this faction has scanned but not surveyed — the next thing to chart. */
function surveyTarget(world: WorldLike, factionId: string): string | undefined {
    const vis = visibilityOf(world, factionId);
    for (const [systemId, entry] of Object.entries(vis)) {
        if (stageOf(entry) === 'scanned') return systemId;
    }
    for (const [systemId, entry] of Object.entries(vis)) {
        if (stageOf(entry) === 'pinged') return systemId;
    }
    return undefined;
}

/** A surveyed system with an unowned, settleable planet in it. */
function settleTarget(world: WorldLike, factionId: string): string | undefined {
    const vis = visibilityOf(world, factionId);
    for (const planet of mapValues(world?.construction?.planets)) {
        if (!planet || planet.ownerId) continue;
        if (!planet.tags?.includes?.('colonizable')) continue;
        if (stageOf(vis[planet.systemId]) === 'surveyed') return planet.systemId;
    }
    return undefined;
}

export function deepLinkFor(world: WorldLike, factionId: string, goalId: GoalId): GoalDeepLink {
    switch (goalId) {
        case 'commission_ships': {
            const capital = capitalPlanet(world, factionId);
            return { tab: 'galaxy', constructionPlanetId: capital.id, selectSystemId: capital.systemId, label: 'Open your capital' };
        }
        case 'survey_three': {
            const systemId = surveyTarget(world, factionId);
            return { tab: 'galaxy', selectSystemId: systemId, label: systemId ? 'Show me a system to survey' : 'Open the map' };
        }
        case 'settle_world': {
            const systemId = settleTarget(world, factionId);
            return { tab: 'galaxy', selectSystemId: systemId, label: systemId ? 'Show me a world to settle' : 'Open the map' };
        }
        case 'build_shipyard': {
            const capital = capitalPlanet(world, factionId);
            return { tab: 'galaxy', constructionPlanetId: capital.id, selectSystemId: capital.systemId, label: 'Open your capital' };
        }
        case 'reach_out':
            return { tab: 'diplomacy', label: 'Open Diplomacy' };
    }
}
