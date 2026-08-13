// lib/narrative/retrospective-service.ts — history written at a distance.
//
// The narrator reports; this reports on the reporting. Once a chapter of the
// galaxy's history has closed, a retrospective names it and says what it was
// about. This is the cheapest feature per unit of "I lived through a historical
// period" in the whole design, because everything it needs is already recorded.
//
// Era names are cached the only way this system caches anything: the
// retrospective article IS the era record. Its `stance` carries the era's tick
// range, so a later pass recognises an era it has already named and leaves it
// alone. No table, nothing to keep in sync, and the name is as durable as the
// article players read.
//
// Worker-side only.

import { prisma } from '../db';
import { segmentEras } from './memory-service';
import { prettifyFactionId } from './naming';

/** An era needs this many pivotal events before it is worth naming — one big
 *  battle is not a chapter of history. */
const MIN_PIVOTS_FOR_ERA = 2;

/** An era is only closed once nothing pivotal has happened for this long.
 *  Four ticks to the day, so roughly a fortnight of quiet. */
const ERA_CLOSED_AFTER_TICKS = 4 * 14;

interface EraDraft {
    startTick: number;
    endTick: number;
    pivotalEventIds: string[];
}

function parseArray(raw: string): string[] {
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

function parseObject(raw: string | null): Record<string, any> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * Name an era after what defined it.
 *
 * Deterministic, from the record: the war that dominated it, the empire that
 * fell during it, the power that did the most. Ages are named in hindsight by
 * what people remember, and what the galaxy remembers is the loudest thing that
 * happened.
 */
function nameEra(events: { type: string; actorNames: string; facts: string }[]): string {
    const types = events.map(e => e.type);
    const primaryActor = (() => {
        const counts = new Map<string, number>();
        for (const e of events) {
            for (const name of parseArray(e.actorNames)) counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        return top && top[1] >= 2 ? top[0] : null;
    })();

    if (types.includes('empire_eliminated')) return 'the Age of Extinction';
    if (types.includes('civil_war_started')) return 'the Years of Division';
    if (types.includes('capital_captured') && primaryActor) return `the ${primaryActor} Ascendancy`;
    if (types.includes('war_declared') && types.includes('war_ended')) return 'the Long Contest';
    if (types.includes('government_changed') || types.includes('coup_attempted')) return 'the Unquiet Peace';
    if (types.every(t => !['war_declared', 'capital_captured', 'civil_war_started'].includes(t))) return 'the Quiet Years';
    if (primaryActor) return `the ${primaryActor} Era`;
    return 'the Unnamed Age';
}

function describeEvent(type: string, facts: Record<string, any>, actorNames: string[], targetNames: string[]): string {
    const who = actorNames[0] ?? 'an unnamed power';
    const whom = targetNames[0] ?? '';
    const place = facts.planetName ?? facts.systemName ?? '';

    switch (type) {
        case 'capital_captured': return `${who} took ${place || 'the capital'} from ${whom || 'its holders'}`;
        case 'empire_eliminated': return `${whom || who} ceased to exist as a state`;
        case 'civil_war_started': return `${whom || who} split in two`;
        case 'war_declared': return `${who} went to war with ${whom || 'a neighbour'}`;
        case 'war_ended': return `the war between ${actorNames.join(' and ') || 'the belligerents'} ended`;
        case 'government_changed': return `${who} changed hands at the top`;
        case 'secession_declared': return `worlds under ${who} demanded independence`;
        default: return `${type.replace(/_/g, ' ')} involving ${who}`;
    }
}

/**
 * Write retrospectives for any era that has closed and not yet been named.
 *
 * Safe to call every narrator pass: an era already covered is recognised by its
 * start tick and skipped, so this does nothing on almost every call.
 *
 * @returns how many retrospectives were written.
 */
export async function writeRetrospectives(currentTick?: number): Promise<number> {
    const latest = currentTick ?? (
        await prisma.chronicleEvent.findFirst({ orderBy: { tick: 'desc' }, select: { tick: true } })
    )?.tick ?? 0;
    if (latest === 0) return 0;

    const eras = await segmentEras();
    if (eras.length === 0) return 0;

    // Only closed eras get written up. The present is not history yet.
    const closed = eras.filter((e: EraDraft) =>
        e.pivotalEventIds.length >= MIN_PIVOTS_FOR_ERA &&
        latest - e.endTick >= ERA_CLOSED_AFTER_TICKS);
    if (closed.length === 0) return 0;

    const existing = await prisma.narrativeArticle.findMany({
        where: { kind: 'retrospective' },
        select: { stance: true },
    });
    const alreadyNamed = new Set(
        existing.map(a => parseObject(a.stance).eraStartTick).filter(t => typeof t === 'number'),
    );

    let written = 0;
    for (const era of closed) {
        if (alreadyNamed.has(era.startTick)) continue;

        const events = await prisma.chronicleEvent.findMany({
            where: { id: { in: era.pivotalEventIds } },
            orderBy: { tick: 'asc' },
            select: { id: true, type: true, facts: true, actorNames: true, targetNames: true, day: true, tick: true },
        });
        if (events.length === 0) continue;

        const name = nameEra(events);
        const beats = events.slice(0, 5).map(e =>
            describeEvent(e.type, parseObject(e.facts), parseArray(e.actorNames), parseArray(e.targetNames)),
        );

        const body =
            `Historians have begun calling the period between tick ${era.startTick} and tick ${era.endTick} ` +
            `${name}. ${events.length} event${events.length === 1 ? '' : 's'} of the first rank fell inside it: ` +
            `${beats.join('; ')}.\n\n` +
            `What follows an age is rarely what its participants expected, and the powers who shaped this one ` +
            `are not necessarily the ones who will be remembered for it.`;

        await prisma.narrativeArticle.create({
            data: {
                eventIds: JSON.stringify(era.pivotalEventIds),
                publisherId: 'galactic_wire',
                kind: 'retrospective',
                headline: `RETROSPECTIVE: ${name}`,
                body,
                stance: JSON.stringify({
                    eraName: name,
                    eraStartTick: era.startTick,
                    eraEndTick: era.endTick,
                    pivotCount: events.length,
                    provider: 'template',
                }),
                day: events[events.length - 1].day,
            },
        });
        written++;
    }

    return written;
}

/**
 * The named eras, newest first, for the history panel.
 *
 * Reads the retrospectives rather than recomputing, so the names players have
 * already seen are the names they keep seeing.
 */
export async function listEras(): Promise<{ name: string; startTick: number; endTick: number; pivotCount: number }[]> {
    const rows = await prisma.narrativeArticle.findMany({
        where: { kind: 'retrospective' },
        orderBy: { day: 'desc' },
        select: { stance: true },
    });
    return rows
        .map(r => parseObject(r.stance))
        .filter(s => typeof s.eraStartTick === 'number' && s.eraName)
        .map(s => ({
            name: s.eraName as string,
            startTick: s.eraStartTick as number,
            endTick: s.eraEndTick as number,
            pivotCount: s.pivotCount as number,
        }));
}

/**
 * A leader's record, assembled for their obituary.
 *
 * The chronicle keys events by faction rather than by person, so a career is
 * "what this empire did while they held office" — which is, in fairness, how
 * leaders are actually judged.
 */
export async function careerOf(input: {
    factionId: string;
    fromTick: number;
    toTick: number;
    /** The obituary's own event. Dying is not an achievement. */
    excludeEventIds?: string[];
}): Promise<string[]> {
    const events = await prisma.chronicleEvent.findMany({
        where: {
            tick: { gte: input.fromTick, lte: input.toTick },
            importance: { gte: 55 },
            id: input.excludeEventIds?.length ? { notIn: input.excludeEventIds } : undefined,
            // Comings and goings at the top are not what a tenure is judged on.
            type: { notIn: ['leader_died', 'leader_rose'] },
            OR: [
                { actorIds: { contains: `"${input.factionId}"` } },
                { targetIds: { contains: `"${input.factionId}"` } },
            ],
        },
        orderBy: { importance: 'desc' },
        take: 4,
        select: { type: true, facts: true, actorNames: true, targetNames: true },
    });

    return events.map(e =>
        describeEvent(e.type, parseObject(e.facts), parseArray(e.actorNames), parseArray(e.targetNames)),
    );
}
