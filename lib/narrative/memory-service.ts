// lib/narrative/memory-service.ts — the galaxy's long memory.
//
// Everything here is DERIVED from the chronicle by query. There is no authored
// state to keep in sync: a feud is a count of hostile events between two
// factions, a precedent is a prior article about the same actors or place, an
// era is a gap between the loudest events in history. That is deliberate — see
// docs/narrative-system/README.md, "Memory is a query, not a context window".
//
// The one rule that shapes all of it: **memory obeys attribution**. The galaxy
// cannot remember a grudge it was never able to attribute, so an operation the
// press could not pin on anyone builds no feud. Deniability protects you from
// history, not just from today's headline.
//
// Worker-side only (imports the database). The narrator is its only caller.

import { prisma } from '../db';
import { prettifyFactionId } from './naming';
import type { ChronicleEventType } from './chronicle-types';

/** Acts that make enemies. Economic and internal events are excluded: a coup is
 *  a story, but it is not a grievance between two powers. */
const HOSTILE_TYPES: ChronicleEventType[] = [
    'war_declared',
    'treaty_broken',
    'battle_resolved',
    'system_captured',
    'capital_captured',
    'planet_bombarded',
    'fleet_destroyed',
    'siege_started',
    'blockade_started',
    'tribute_imposed',
    'operation_exposed',
    'agent_captured',
    'civil_war_started',
];

/** Hostile events within this many ticks count toward a live feud. Four ticks
 *  to the game day, so this is roughly a season of grievances. */
const FEUD_WINDOW_TICKS = 4 * 90;

/** Below this, two powers have merely clashed; at or above it, they have a feud. */
const FEUD_THRESHOLD = 3;

/** A feud with no qualifying event for this long goes quiet. */
const DORMANCY_TICKS = 4 * 60;

/** Importance an event must reach to be worth citing as precedent. */
const PRECEDENT_IMPORTANCE = 70;

export interface FeudSummary {
    factionAId: string;
    factionBId: string;
    epithet: string;
    eventCount: number;
    startedTick: number;
    status: string;
    /** Short, already-written descriptions of the events that define it. */
    highlights: string[];
}

export interface PrecedentSummary {
    headline: string;
    day: number;
}

/** What the narrator knows about an event beyond the event itself. */
export interface EventMemory {
    feud: FeudSummary | null;
    precedents: PrecedentSummary[];
    /** No event of this type has ever been recorded in this galaxy before. */
    isGalacticFirst: boolean;
    /** This reverses an earlier event — a system retaken, a war restarted. */
    isReversal: boolean;
    /** How much these facts add to the event's importance, 0-25. */
    importanceBonus: number;
}

export const EMPTY_MEMORY: EventMemory = {
    feud: null,
    precedents: [],
    isGalacticFirst: false,
    isReversal: false,
    importanceBonus: 0,
};

/** Feud rows are keyed by an ordered pair so (A,B) and (B,A) are one feud. */
function orderPair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
}

/**
 * Can the galaxy pin this event on its actor?
 *
 * 'exposed' — yes. 'suspected:<id>' — the public believes so, which is enough
 * to sour a relationship. 'invisible' — no, and the grudge never forms.
 */
function isPubliclyAttributed(attribution: string): boolean {
    return attribution === 'exposed' || attribution.startsWith('suspected:');
}

/** A plain-language line for a feud highlight or precedent fallback. */
function describe(type: string, facts: Record<string, unknown>, tick: number): string {
    const place = (facts.planetName ?? facts.systemName ?? '') as string;
    const label = type.replace(/_/g, ' ');
    return place ? `${label} at ${place} (tick ${tick})` : `${label} (tick ${tick})`;
}

function parseArray(raw: string): string[] {
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

function parseObject(raw: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * Name a feud, once, from the events that made it.
 *
 * Phase 2 names deterministically from the record — the place the trouble keeps
 * happening, or the act that started it. A model-written epithet can replace
 * this in phase 3; because the name is cached on the row, it will not churn.
 */
function coinEpithet(
    nameA: string,
    nameB: string,
    events: { type: string; facts: Record<string, unknown> }[],
): string {
    // A place that keeps appearing is what people actually name these things after.
    const places = new Map<string, number>();
    for (const e of events) {
        const place = (e.facts.planetName ?? e.facts.systemName ?? '') as string;
        if (place) places.set(place, (places.get(place) ?? 0) + 1);
    }
    const [contested, count] = [...places.entries()].sort((x, y) => y[1] - x[1])[0] ?? ['', 0];
    if (contested && count >= 2) return `the ${contested} Question`;

    if (events.some(e => e.type === 'treaty_broken')) return `the Broken Compact`;
    if (events.some(e => e.type === 'capital_captured')) return `the War of the Fallen Capital`;
    if (events.some(e => e.type === 'operation_exposed')) return `the Shadow Quarrel`;

    return `the ${nameA}–${nameB} Rivalry`;
}

/**
 * Recompute feuds from the chronicle.
 *
 * Cheap enough to run every narrator pass: one indexed query over recent
 * hostile events, then one upsert per pair that crosses the threshold. Rows are
 * derived, so a wiped feuds table simply rebuilds itself.
 *
 * @returns how many feuds are currently active.
 */
export async function deriveFeuds(currentTick?: number): Promise<number> {
    const latest = currentTick ?? (
        await prisma.chronicleEvent.findFirst({ orderBy: { tick: 'desc' }, select: { tick: true } })
    )?.tick ?? 0;
    if (latest === 0) return 0;

    const events = await prisma.chronicleEvent.findMany({
        where: { type: { in: HOSTILE_TYPES }, tick: { gte: latest - FEUD_WINDOW_TICKS } },
        orderBy: { tick: 'asc' },
        select: { id: true, tick: true, type: true, facts: true, actorIds: true, targetIds: true, actorNames: true, targetNames: true, attribution: true, importance: true },
    });

    interface Tally {
        ids: string[];
        firstTick: number;
        lastTick: number;
        nameA: string;
        nameB: string;
        top: { id: string; importance: number; type: string; facts: Record<string, unknown>; tick: number }[];
    }
    const pairs = new Map<string, Tally>();

    for (const e of events) {
        if (!isPubliclyAttributed(e.attribution)) continue;

        const actors = parseArray(e.actorIds);
        const targets = parseArray(e.targetIds);
        const actorNames = parseArray(e.actorNames);
        const targetNames = parseArray(e.targetNames);
        if (actors.length === 0 || targets.length === 0) continue;

        for (let i = 0; i < actors.length; i++) {
            for (let j = 0; j < targets.length; j++) {
                if (actors[i] === targets[j]) continue;
                const [a, b] = orderPair(actors[i], targets[j]);
                const key = `${a}|${b}`;
                const facts = parseObject(e.facts);
                const existing = pairs.get(key);
                const entry = { id: e.id, importance: e.importance, type: e.type, facts, tick: e.tick };

                if (existing) {
                    existing.ids.push(e.id);
                    existing.lastTick = e.tick;
                    existing.top.push(entry);
                } else {
                    pairs.set(key, {
                        ids: [e.id],
                        firstTick: e.tick,
                        lastTick: e.tick,
                        nameA: a === actors[i] ? (actorNames[i] ?? prettifyFactionId(a)) : (targetNames[j] ?? prettifyFactionId(a)),
                        nameB: b === targets[j] ? (targetNames[j] ?? prettifyFactionId(b)) : (actorNames[i] ?? prettifyFactionId(b)),
                        top: [entry],
                    });
                }
            }
        }
    }

    let active = 0;
    for (const [key, tally] of pairs) {
        if (tally.ids.length < FEUD_THRESHOLD) continue;
        const [factionAId, factionBId] = key.split('|');

        const top = tally.top
            .sort((x, y) => y.importance - x.importance)
            .slice(0, 5);
        const status = latest - tally.lastTick > DORMANCY_TICKS ? 'dormant' : 'active';
        if (status === 'active') active++;

        const existing = await prisma.feud.findUnique({ where: { factionAId_factionBId: { factionAId, factionBId } } });
        await prisma.feud.upsert({
            where: { factionAId_factionBId: { factionAId, factionBId } },
            update: {
                status,
                lastEventAt: tally.lastTick,
                eventCount: tally.ids.length,
                topEventIds: JSON.stringify(top.map(t => t.id)),
                // The name is coined once and kept: a feud that keeps being
                // renamed is not a thing anyone remembers.
                epithet: existing?.epithet ?? coinEpithet(tally.nameA, tally.nameB, top),
            },
            create: {
                factionAId,
                factionBId,
                status,
                startedTick: tally.firstTick,
                lastEventAt: tally.lastTick,
                eventCount: tally.ids.length,
                topEventIds: JSON.stringify(top.map(t => t.id)),
                epithet: coinEpithet(tally.nameA, tally.nameB, top),
            },
        });
    }

    return active;
}

/** The feud between two factions, if the galaxy has noticed one. */
export async function feudBetween(a: string, b: string): Promise<FeudSummary | null> {
    if (!a || !b || a === b) return null;
    const [factionAId, factionBId] = orderPair(a, b);
    const row = await prisma.feud.findUnique({ where: { factionAId_factionBId: { factionAId, factionBId } } });
    if (!row || row.status === 'ended') return null;

    const ids = parseArray(row.topEventIds);
    const events = ids.length
        ? await prisma.chronicleEvent.findMany({
            where: { id: { in: ids } },
            orderBy: { importance: 'desc' },
            select: { type: true, facts: true, tick: true },
            take: 3,
        })
        : [];

    return {
        factionAId: row.factionAId,
        factionBId: row.factionBId,
        epithet: row.epithet ?? 'an old rivalry',
        eventCount: row.eventCount,
        startedTick: row.startedTick,
        status: row.status,
        highlights: events.map(e => describe(e.type, parseObject(e.facts), e.tick)),
    };
}

/**
 * Prior coverage of the same actors or the same place.
 *
 * Returns already-written headlines rather than raw events, so continuity comes
 * from what the paper actually printed — the phrasing a later article echoes is
 * the phrasing readers saw.
 */
export async function precedentFor(input: {
    excludeEventIds: string[];
    actorIds: string[];
    location: string | null;
    beforeTick: number;
}): Promise<PrecedentSummary[]> {
    const { excludeEventIds, actorIds, location, beforeTick } = input;

    // Chronicle JSON is stored as text, so actor matching is a substring test on
    // the quoted id — exact enough, since ids are unique tokens.
    const actorFilters = actorIds.map(id => ({ actorIds: { contains: `"${id}"` } }));
    const or: any[] = [...actorFilters];
    if (location) or.push({ location });
    if (or.length === 0) return [];

    const priorEvents = await prisma.chronicleEvent.findMany({
        where: {
            id: { notIn: excludeEventIds },
            tick: { lt: beforeTick },
            importance: { gte: PRECEDENT_IMPORTANCE },
            narratedAt: { not: null },
            OR: or,
        },
        orderBy: [{ importance: 'desc' }, { tick: 'desc' }],
        take: 6,
        select: { id: true },
    });
    if (priorEvents.length === 0) return [];

    // Articles reference their events as a JSON array of ids; same substring
    // trick, one query for the batch.
    const articles = await prisma.narrativeArticle.findMany({
        where: { OR: priorEvents.map(e => ({ eventIds: { contains: `"${e.id}"` } })) },
        orderBy: { day: 'desc' },
        take: 3,
        select: { headline: true, day: true },
    });

    return articles.map(a => ({ headline: a.headline, day: a.day }));
}

/**
 * Assemble everything the chronicle knows that bears on this event, and score
 * how much that context raises its importance.
 *
 * These modifiers live here rather than in chronicle-importance.ts on purpose:
 * that function must stay pure and I/O-free so emission never touches the
 * database mid-tick. Context that requires history belongs to the narrator.
 */
export async function memoryFor(input: {
    eventIds: string[];
    type: string;
    actorIds: string[];
    targetIds: string[];
    location: string | null;
    tick: number;
    attribution: string;
    /** The event's own score. Only notable events can be "the first of their
     *  kind" — every galaxy has a first skirmish, and nobody remembers it. */
    importance?: number;
}): Promise<EventMemory> {
    const { eventIds, type, actorIds, targetIds, location, tick, attribution } = input;
    const importance = input.importance ?? 0;

    const [feud, precedents, firstOfType, reversal] = await Promise.all([
        // A feud only colours the story if the galaxy can attribute this act.
        isPubliclyAttributed(attribution) && actorIds[0] && targetIds[0]
            ? feudBetween(actorIds[0], targetIds[0])
            : Promise.resolve(null),

        precedentFor({ excludeEventIds: eventIds, actorIds, location, beforeTick: tick }),

        prisma.chronicleEvent.count({ where: { type, tick: { lt: tick } } }),

        // A reversal: the same place changed hands before this. "Retaken" is a
        // different story from "taken".
        location
            ? prisma.chronicleEvent.count({
                where: {
                    location,
                    tick: { lt: tick },
                    type: { in: ['system_captured', 'capital_captured', 'battle_resolved'] },
                },
            })
            : Promise.resolve(0),
    ]);

    // "Nothing of the kind has ever happened" is only worth printing about an
    // event that matters. Otherwise the first of every routine type claims it.
    const isGalacticFirst = firstOfType === 0 && importance >= PRECEDENT_IMPORTANCE;
    const isReversal = reversal > 0;

    let importanceBonus = 0;
    if (feud && feud.status === 'active') importanceBonus += 10;
    if (isReversal) importanceBonus += 5;
    if (isGalacticFirst) importanceBonus += 10;
    if (precedents.length >= 2) importanceBonus += 2;

    return {
        feud,
        precedents,
        isGalacticFirst,
        isReversal,
        importanceBonus: Math.min(25, importanceBonus),
    };
}

/**
 * Split history into eras at the quiet stretches between its loudest moments.
 *
 * Derived, not stored: eras are presentational, and a stored table would only
 * be another thing to keep in sync. Retrospectives in phase 4 read this.
 */
export async function segmentEras(minImportance = 90): Promise<{ startTick: number; endTick: number; pivotalEventIds: string[] }[]> {
    const pivots = await prisma.chronicleEvent.findMany({
        where: { importance: { gte: minImportance } },
        orderBy: { tick: 'asc' },
        select: { id: true, tick: true },
    });
    if (pivots.length === 0) return [];

    // A gap longer than this between pivotal events closes the chapter.
    const GAP = 4 * 45;
    const eras: { startTick: number; endTick: number; pivotalEventIds: string[] }[] = [];
    let current = { startTick: pivots[0].tick, endTick: pivots[0].tick, pivotalEventIds: [pivots[0].id] };

    for (const pivot of pivots.slice(1)) {
        if (pivot.tick - current.endTick > GAP) {
            eras.push(current);
            current = { startTick: pivot.tick, endTick: pivot.tick, pivotalEventIds: [pivot.id] };
        } else {
            current.endTick = pivot.tick;
            current.pivotalEventIds.push(pivot.id);
        }
    }
    eras.push(current);
    return eras;
}
