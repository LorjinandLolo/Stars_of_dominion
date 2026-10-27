// lib/goals/first-week-goals.ts
// Stars of Dominion — the first week, as six things to do, then three next steps.
//
// A new player does not need eighteen tutorial steps; they need to know the one
// thing that moves their empire forward next. Six goals, in order: warships,
// a first research choice, charts, a second world, a Spaceyard in orbit, and a
// first contact. Then three "next steps" that point at the systems the first
// week never touches: a policy (slots and political capital), ground troops
// (materiel and ammo), and a third world (the gate to every victory). Each has
// one line of hint, how long it takes in real time,
// something worth doing while it runs, and a deep link that opens the panel
// that does it. While the goal's work is under way the card counts it down
// (goalWait), so a player who just ordered warships knows they are coming.
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
    DEED_RESEARCH_STARTED,
    DEED_POLICIES_PROPOSED,
    DEED_TROOPS_RAISED,
} from '@/lib/tech/deed-metrics';
import { ORBITAL_STRUCTURE_BY_ID } from '@/data/orbital-structures';
import { baseBuildSeconds } from '@/lib/construction/build-time';
import { CIVILIAN_SHIPS } from '@/lib/combat/civilian-ships';
import { heldSystemCount } from '@/lib/government/admin-capacity';
import { formatSimAsClock } from '@/lib/time/galactic-time';
import { SIM_SECONDS_PER_REAL_SECOND } from '@/lib/time/time-config';

// Real-time figures for the "takes" lines, read from the catalogs so a tuning
// pass on build times cannot leave the goal card quoting old numbers.
// Whole minutes: "9m 58s" is false precision for an estimate.
function simClockOf(seconds: number): string {
    const minutes = Math.max(1, Math.round(seconds / SIM_SECONDS_PER_REAL_SECOND / 60));
    return minutes < 60 ? `${minutes} minutes` : formatSimAsClock(minutes * 60 * SIM_SECONDS_PER_REAL_SECOND);
}
const EXPLORER_TIME = simClockOf(CIVILIAN_SHIPS.explorer.buildSeconds);
const STATION_DEF = ORBITAL_STRUCTURE_BY_ID['space_station'];
const SPACEYARD_DEF = ORBITAL_STRUCTURE_BY_ID['spaceyard'];
const STATION_TIME = STATION_DEF ? simClockOf(baseBuildSeconds(STATION_DEF as any)) : 'a while';
const SPACEYARD_TIME = SPACEYARD_DEF ? simClockOf(baseBuildSeconds(SPACEYARD_DEF as any)) : 'a while longer';

export type GoalId =
    | 'commission_ships'
    | 'start_research'
    | 'survey_three'
    | 'settle_world'
    | 'build_shipyard'
    | 'reach_out'
    | 'enact_policy'
    | 'raise_troops'
    | 'found_outpost'
    | 'three_worlds';

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
    /** How long the work takes once ordered, in real time. */
    takes: string;
    /** Worth doing while it runs. Builds take real time; the player should not stare at a bar. */
    meanwhile: string;
    /** Metrics that count toward it; their sum is the progress. */
    metrics: string[];
    /** Progress read from the world instead of the deed ledger (a state, not a deed). */
    measure?: (world: WorldLike, factionId: string) => number;
    /** 'next' goals come after the first week; the card labels them "Next step". */
    phase?: 'next';
    target: number;
}

/** The order is the lesson: you cannot survey without ships, settle without charts. */
export const FIRST_WEEK_GOALS: readonly GoalDef[] = [
    {
        id: 'commission_ships',
        // Any ship counts (DEED_SHIPS_COMMISSIONED); the cheap, quick explorer is the one to suggest.
        title: 'Commission an exploration ship',
        hint: 'Open your capital, go to the Shipyard tab and lay down an Exploration Ship. It surveys twice as fast as a warship, from two jumps away.',
        takes: `About ${EXPLORER_TIME}`,
        meanwhile: 'Look around the map: your scanners have already found the systems next door.',
        metrics: [DEED_SHIPS_COMMISSIONED],
        target: 1,
    },
    {
        // RESEARCH unlocks with the first ship (dock-unlocks.ts). Until
        // then the research council keeps the slot busy, but never on a fork:
        // the player's order takes the council's slot over.
        id: 'start_research',
        title: 'Choose your first research',
        hint: 'Open Research: the card at the top names a good first project, press Start. Nothing early is permanent; the amber Fork cards stay shut until you finish that tree\'s tier I.',
        takes: 'Starts at once; a tier I project runs a few hours',
        meanwhile: 'Research runs on its own. When it finishes, your research council picks the next one unless you do.',
        metrics: [DEED_RESEARCH_STARTED],
        target: 1,
    },
    {
        id: 'survey_three',
        title: 'Survey three systems',
        hint: 'Send your exploration ship to a nearby system: it surveys the moment it arrives, for free. Only surveyed worlds can be settled.',
        takes: 'A few minutes per system, travel included',
        meanwhile: 'Open your capital and queue a building: they take 10 minutes to a few hours, so keep one going.',
        metrics: [DEED_SYSTEMS_SURVEYED],
        target: 3,
    },
    {
        id: 'settle_world',
        title: 'Settle a second world',
        hint: 'Pick a surveyed, unclaimed planet and settle it (20,000 credits). Your empire starts with one world; this is the second.',
        takes: 'Instant once you can pay',
        meanwhile: 'Short on credits? Taxes arrive every cycle (24 minutes); your daily brief shows the treasury.',
        metrics: [DEED_COLONIES_FOUNDED],
        target: 1,
    },
    {
        id: 'build_shipyard',
        // Not the ground "Orbital Shipyard" building every capital starts with:
        // the orbital LAYER's yard, which is what lays cruisers and up.
        title: 'Raise a Spaceyard in orbit',
        hint: 'Your ground yard lays corvettes and destroyers. A Spaceyard in orbit builds faster, repairs fleets, and is the first rung to the yards that lay cruisers. In your capital’s Orbital tab, build a Space Station first, then the Spaceyard.',
        takes: `Station ${STATION_TIME}, then the yard ${SPACEYARD_TIME}`,
        meanwhile: 'This is a check-back-later goal. Queue it, then go and meet your neighbours in Diplomacy.',
        metrics: [DEED_SHIPYARDS_BUILT],
        target: 1,
    },
    {
        id: 'reach_out',
        title: 'Reach out to a neighbour',
        hint: 'Send an envoy or sign a pact in Diplomacy. Nobody holds a galaxy alone.',
        takes: 'Instant',
        meanwhile: 'Your daily brief will tell you how they answer.',
        metrics: [DEED_TREATIES_SIGNED, DEED_ENVOYS_SENT],
        target: 1,
    },
    // ── Next steps: what the first week never touched ──
    {
        id: 'enact_policy',
        phase: 'next',
        title: 'Set your first policy',
        hint: 'In Empire → Government, enact a policy. You hold three policy slots, and each policy costs political capital, which grows with approval and legitimacy. Pick what your people want.',
        takes: 'Instant; a reform before the chamber waits for its vote',
        meanwhile: 'Approval moves slowly. Your daily brief shows where it is heading.',
        metrics: [DEED_POLICIES_PROPOSED],
        target: 1,
    },
    {
        id: 'raise_troops',
        phase: 'next',
        title: 'Raise ground troops',
        hint: 'Ships hold the sky; troops take and hold worlds. Select your capital, press UNITS on it and recruit infantry. Every army and ship costs Materiel and every attack spends Ammo: both sit in the top bar, refilled by your factories each cycle.',
        takes: 'Seconds to minutes per unit',
        meanwhile: 'A world falls when your troops hold its strongpoints and its capital, and only while your fleet holds the sky above it.',
        metrics: [DEED_TROOPS_RAISED],
        target: 1,
    },
    {
        // Outposts (lib/outposts): a builder ship spent on a world no colony
        // could take, run through its crises until it grows.
        id: 'found_outpost',
        phase: 'next',
        title: 'Found an outpost',
        hint: 'Lay down a Builder Ship at your shipyard, fly it to a surveyed system and spend it on an empty world (OUTPOST on the world). Dead rock works too.',
        takes: `About ${simClockOf(CIVILIAN_SHIPS.builder.buildSeconds)} for the ship, then the flight`,
        meanwhile: 'Outposts live in shifts of five minutes: open it from Economy → Outposts and answer its crises.',
        metrics: [],
        measure: (world, factionId) => mapValues(world?.construction?.planets).filter((p: any) => p?.ownerId === factionId && p?.outpost).length,
        target: 1,
    },
    {
        id: 'three_worlds',
        phase: 'next',
        title: 'Hold three star systems',
        hint: 'Enlightenment, the peaceful victory, needs colonies in at least three star systems (worlds in your home system count once); conquest needs most of the galaxy. Settle beyond home, then read your paths in Empire → Saga.',
        takes: 'As fast as your credits allow',
        meanwhile: 'Saga shows how close you are to each victory, and what your rivals are racing for.',
        metrics: [],
        // Star systems, as Enlightenment counts them (lib/government/admin-capacity.ts).
        measure: (world, factionId) => heldSystemCount(mapValues(world?.construction?.planets) as any, factionId),
        target: 3,
    },
];

/**
 * What rides the shard. Index of the goal being worked on; FIRST_WEEK_GOALS.length = all done.
 * The index is re-derived from completedAt on every read (goalStateOf), so a
 * goal inserted into the list later lands in front of records that already
 * passed its position instead of shifting them onto the wrong goal.
 */
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
    if (goal.measure) return goal.measure(world, factionId);
    return goal.metrics.reduce((sum, metric) => sum + getMetric(world as any, factionId, metric), 0);
}

function goalStateOf(world: WorldLike, factionId: string): GoalState {
    const stored = world?.firstWeekGoals?.get?.(factionId) ?? world?.firstWeekGoals?.[factionId];
    if (!stored) return emptyGoalState();
    const completedAt: GoalState['completedAt'] = { ...(stored.completedAt ?? {}) };
    // First goal without a completion stamp. A record from before stamps
    // existed has none at all; its stored index is all there is.
    const stamped = FIRST_WEEK_GOALS.findIndex(g => completedAt[g.id] === undefined);
    const index = Object.keys(completedAt).length
        ? (stamped === -1 ? FIRST_WEEK_GOALS.length : stamped)
        : Number(stored.index) || 0;
    return { index, completedAt };
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
            // Met before a goal was inserted in front of it: already announced.
            if (state.completedAt[goal.id] !== undefined) { state.index += 1; continue; }
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
    /** 1-based, for "Goal 2 of 6". */
    number: number;
    total: number;
    progress: number;
    deepLink: GoalDeepLink;
    /** The goal's work already under way, if any: what, and when it lands. */
    waiting: GoalWait | null;
}

export interface GoalWait {
    /** "Corvette commissioning", "Survey of Kepler-9". */
    label: string;
    /** Sim-clock second it finishes; the card counts down to it. */
    completesAt: number;
}

/**
 * The goal the player is on, with progress and a deep link resolved against
 * this world. Null when every goal is done. Reads the stored index, so the
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
        waiting: goalWait(world, factionId, goal.id),
    };
}

// ─── Work under way ───────────────────────────────────────────────────────────

function soonest(waits: GoalWait[]): GoalWait | null {
    let best: GoalWait | null = null;
    for (const w of waits) {
        if (!Number.isFinite(w.completesAt)) continue;
        if (!best || w.completesAt < best.completesAt) best = w;
    }
    return best;
}

function systemName(world: WorldLike, systemId: string | null | undefined): string {
    if (!systemId) return 'a system';
    const system = world?.movement?.systems?.get?.(systemId) ?? world?.movement?.systems?.[systemId];
    return system?.name ?? systemId;
}

/**
 * What the player has already set in motion toward this goal, soonest first.
 * Builds take real time (a corvette ~10 minutes, a Spaceyard hours), and a
 * goal card that keeps saying "commission your warships" after the order went
 * in reads as if the order was lost.
 */
export function goalWait(world: WorldLike, factionId: string, goalId: GoalId): GoalWait | null {
    const now = Number(world?.nowSeconds ?? 0);
    switch (goalId) {
        case 'commission_ships': {
            // Ship jobs carry a hull class; ground armies do not. A refit is not a new hull.
            const jobs = (world?.combat?.recruitmentJobs ?? []).filter((j: any) =>
                j?.factionId === factionId && j.classKey && !j.refitFrom);
            return soonest(jobs.map((j: any) => ({
                label: `${j.designName ?? j.classKey} commissioning`,
                completesAt: Number(j.completesAt),
            })));
        }
        case 'survey_three': {
            const surveys = (world?.movement?.explorationOrders ?? [])
                .filter((o: any) => o?.factionId === factionId && o.mode === 'survey')
                .map((o: any) => ({
                    label: `Survey of ${systemName(world, o.targetSystemId)}`,
                    completesAt: Date.parse(o.completesAt) / 1000,
                }));
            // A fleet still on its way, ETA as of this snapshot.
            const arrivals = mapValues(world?.movement?.fleets)
                .filter((f: any) => f?.factionId === factionId && f.destinationSystemId && Number(f.etaSeconds) > 0)
                .map((f: any) => ({
                    label: `${f.name ?? 'Fleet'} reaching ${systemName(world, f.destinationSystemId)}`,
                    completesAt: now + Number(f.etaSeconds),
                }));
            return soonest([...surveys, ...arrivals]);
        }
        case 'build_shipyard': {
            // The station is the first half of this goal, so it counts too.
            const waits: GoalWait[] = [];
            for (const planet of mapValues(world?.construction?.planets)) {
                if (planet?.ownerId !== factionId) continue;
                for (const order of planet.orbital?.buildQueue ?? []) {
                    const def = ORBITAL_STRUCTURE_BY_ID[order?.structureId];
                    if (def?.category !== 'shipyard' && def?.category !== 'station') continue;
                    waits.push({ label: `${def.name} in orbit`, completesAt: Number(order.completesAtSeconds) });
                }
            }
            return soonest(waits);
        }
        default:
            return null;
    }
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
    // An exploration ship surveys where it arrives (lib/exploration/
    // exploration-service.ts autoSurveyOnArrival), so the best suggestion is
    // the NEAREST system not yet surveyed, walked out from the capital by
    // hyperlane, and never a pirate haven: the first pick used to be whatever
    // charted system came first, and sent new explorers into a Corsair Den.
    const systems = world?.movement?.systems;
    const get = (id: string) => systems?.get?.(id) ?? systems?.[id];
    const dangerous = (id: string) => {
        const tags: string[] = [...(get(id)?.tags ?? []), ...(vis[id]?.visibleTags ?? [])];
        return tags.includes('corsair_den') || tags.includes('pirate_station');
    };
    const home = capitalPlanet(world, factionId).systemId;
    if (home && get(home)) {
        const seen = new Set<string>([home]);
        let frontier = [home];
        for (let hop = 0; hop < 6 && frontier.length; hop++) {
            const next: string[] = [];
            for (const id of frontier) {
                for (const n of get(id)?.hyperlaneNeighbors ?? []) {
                    if (seen.has(n)) continue;
                    seen.add(n);
                    next.push(n);
                }
            }
            const pick = next.filter(id => stageOf(vis[id]) !== 'surveyed' && !dangerous(id)).sort()[0];
            if (pick) return pick;
            frontier = next;
        }
    }
    for (const [systemId, entry] of Object.entries(vis)) {
        if (stageOf(entry) === 'scanned' && !dangerous(systemId)) return systemId;
    }
    for (const [systemId, entry] of Object.entries(vis)) {
        if (stageOf(entry) === 'pinged' && !dangerous(systemId)) return systemId;
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
        case 'start_research':
            return { tab: 'tech', label: 'Open Research' };
        case 'enact_policy':
            return { tab: 'government', label: 'Open Government' };
        case 'raise_troops': {
            const capital = capitalPlanet(world, factionId);
            return { tab: 'galaxy', selectSystemId: capital.systemId, label: 'Show me my capital' };
        }
        case 'three_worlds': {
            const systemId = settleTarget(world, factionId);
            return systemId
                ? { tab: 'galaxy', selectSystemId: systemId, label: 'Show me a world to settle' }
                : { tab: 'saga', label: 'Open Saga' };
        }
        case 'reach_out':
            return { tab: 'diplomacy', label: 'Open Diplomacy' };
        case 'found_outpost': {
            const capital = capitalPlanet(world, factionId);
            return { tab: 'galaxy', constructionPlanetId: capital.id, selectSystemId: capital.systemId, label: 'Open your shipyard' };
        }
    }
}
