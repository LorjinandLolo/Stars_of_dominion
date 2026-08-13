// lib/narrative/narrator-service.ts — the historian.
//
// Reads committed chronicle rows, writes articles, and touches nothing else.
// See docs/narrative-system/README.md, Invariants:
//   * It never writes anything the simulation reads (write set: NarrativeArticle,
//     Gazette, narratedAt markers).
//   * It never holds a reference to mutable world state — its whole input is
//     rows already saved by the worker.
//   * Marking and writing happen in one transaction, so it can die at any point
//     and resume without duplicating or losing an article.
//   * The prose layer only ever sees attribution-filtered facts: a hidden actor
//     is not passed to the writer at all, so it cannot leak.

import { prisma } from '../db';
import { NARRATION_THRESHOLD } from './chronicle-types';
import { prettifyFactionId } from './naming';
import type { ChronicleAttribution, ChronicleEventType } from './chronicle-types';
import type { NarratableEvent, NarrationRequest, ProseWriter } from './prose/prose-types';
import { TemplateWriter } from './prose/template-writer';

/** Phase 1 publishes under one galactic wire service. Per-publisher voices
 *  (state media, pirate press, independents) arrive in phase 3. */
export const DEFAULT_PUBLISHER_ID = 'galactic-wire';

export interface NarrateOptions {
    /** Events scoring below this are memory only, never prose. */
    threshold?: number;
    /** Maximum articles to produce in one pass. */
    limit?: number;
    /** Defaults to the template writer; phase 3 passes an LLM-backed one. */
    writer?: ProseWriter;
    /** Front-page cap per day — the archive keeps everything regardless. */
    frontPagePerDay?: number;
}

export interface NarrateSummary {
    articles: number;
    eventsCovered: number;
    frontPage: number;
}

function parseJsonArray(raw: string): string[] {
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

function parseFacts(raw: string): Record<string, string | number | boolean | null> {
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function decode(row: {
    id: string; tick: number; day: number; type: string; importance: number;
    actorIds: string; targetIds: string; actorNames: string; targetNames: string;
    location: string | null; facts: string; attribution: string;
}): NarratableEvent {
    return {
        id: row.id,
        tick: row.tick,
        day: row.day,
        type: row.type as ChronicleEventType,
        importance: row.importance,
        actorIds: parseJsonArray(row.actorIds),
        actorNames: parseJsonArray(row.actorNames),
        targetIds: parseJsonArray(row.targetIds),
        targetNames: parseJsonArray(row.targetNames),
        location: row.location,
        facts: parseFacts(row.facts),
        attribution: row.attribution as ChronicleAttribution,
    };
}

/**
 * Decide who the press may name.
 *
 * 'exposed'   — the galaxy knows; print the names.
 * 'suspected:<id>' — a name is being whispered. Print it, flagged as speculation.
 *                    The suspected id need not be the real actor; when it is not,
 *                    the press is being played, which is the intended outcome.
 * 'invisible' — no name reaches the writer at all.
 */
function applyAttribution(lead: NarratableEvent): { visibleActors: string[]; speculative: boolean } {
    const attribution = lead.attribution ?? 'exposed';

    if (attribution === 'invisible') return { visibleActors: [], speculative: false };

    if (attribution.startsWith('suspected:')) {
        const suspectedId = attribution.slice('suspected:'.length);
        const index = lead.actorIds.indexOf(suspectedId);
        // When the suspect is not among the actors, an innocent party is being
        // blamed and no recorded name exists for them — print a readable form of
        // the id rather than leaking `faction-covenant` into the newspaper.
        const name = index >= 0 ? lead.actorNames[index] : prettifyFactionId(suspectedId);
        return { visibleActors: name ? [name] : [], speculative: true };
    }

    return { visibleActors: lead.actorNames, speculative: false };
}

/**
 * Group events into articles. Rows sharing a coalesceKey become one story;
 * everything else stands alone. Grouping is confined to a single pass, so a
 * bombardment campaign spread over hours yields one article per pass rather
 * than one forever — which is the right granularity for a daily paper.
 */
function coalesce(events: NarratableEvent[]): NarratableEvent[][] {
    const groups = new Map<string, NarratableEvent[]>();
    const singles: NarratableEvent[][] = [];

    for (const event of events) {
        const key = (event.facts.__coalesceKey as string) ?? null;
        if (!key) { singles.push([event]); continue; }
        const bucket = groups.get(key);
        if (bucket) bucket.push(event); else groups.set(key, [event]);
    }

    return [...groups.values(), ...singles];
}

/**
 * Write prose for every unnarrated event above the threshold.
 *
 * Safe to call repeatedly: the queue is `narratedAt IS NULL`, and each article
 * is inserted in the same transaction that marks its events, so a crash mid-run
 * leaves the remainder to the next pass and never double-publishes.
 */
export async function narrateOnce(options: NarrateOptions = {}): Promise<NarrateSummary> {
    const threshold = options.threshold ?? NARRATION_THRESHOLD;
    const limit = options.limit ?? 25;
    const writer = options.writer ?? new TemplateWriter();
    const frontPagePerDay = options.frontPagePerDay ?? 6;

    const rows = await prisma.chronicleEvent.findMany({
        where: { narratedAt: null, importance: { gte: threshold } },
        orderBy: [{ importance: 'desc' }, { tick: 'asc' }],
        take: limit,
    });
    if (rows.length === 0) return { articles: 0, eventsCovered: 0, frontPage: 0 };

    // coalesceKey is a column, but the decoded event carries it through facts so
    // the prose layer never has to know about the storage shape.
    const events = rows.map((row, i) => {
        const decoded = decode(row);
        if (rows[i].coalesceKey) decoded.facts.__coalesceKey = rows[i].coalesceKey;
        return decoded;
    });

    let articles = 0;
    let eventsCovered = 0;
    let frontPage = 0;

    for (const group of coalesce(events)) {
        // The loudest event in the group is the one the article is about.
        const lead = group.reduce((a, b) => (b.importance > a.importance ? b : a));
        const { visibleActors, speculative } = applyAttribution(lead);

        const request: NarrationRequest = { events: group, lead, visibleActors, speculative, day: lead.day };

        let result;
        try {
            result = await writer.write(request);
        } catch (e: any) {
            // One unwritable story must not stall the queue behind it. Leaving
            // narratedAt null means the next pass tries again.
            console.error(`[Narrator] Failed to write ${lead.type} (${lead.id}):`, e.message);
            continue;
        }

        // The front page is capped per day; the archive is not. Counting existing
        // rows keeps the cap honest across restarts.
        const alreadyOnFrontPage = await prisma.gazette.count({ where: { day: lead.day } });
        const promote = alreadyOnFrontPage < frontPagePerDay;
        const ids = group.map(e => e.id);

        await prisma.$transaction(async (tx) => {
            await tx.narrativeArticle.create({
                data: {
                    eventIds: JSON.stringify(ids),
                    publisherId: DEFAULT_PUBLISHER_ID,
                    kind: 'news',
                    headline: result!.headline,
                    body: result!.body,
                    stance: JSON.stringify({
                        provider: result!.provider,
                        speculative,
                        namedActors: visibleActors,
                        attribution: lead.attribution,
                    }),
                    day: lead.day,
                },
            });

            if (promote) {
                await tx.gazette.create({
                    data: {
                        day: lead.day,
                        headline: result!.headline,
                        lede: result!.lede,
                        tone: result!.tone,
                    },
                });
            }

            // Marking inside the transaction is what makes this idempotent.
            await tx.chronicleEvent.updateMany({
                where: { id: { in: ids } },
                data: { narratedAt: new Date() },
            });
        });

        articles++;
        eventsCovered += ids.length;
        if (promote) frontPage++;
    }

    return { articles, eventsCovered, frontPage };
}

/**
 * Retire events that scored too low to ever be narrated, so the queue query
 * stays small. They keep their row — feuds and precedent are counted from the
 * chronicle, and a skirmish nobody reported still happened.
 */
export async function retireUnnarratableEvents(threshold = NARRATION_THRESHOLD): Promise<number> {
    const result = await prisma.chronicleEvent.updateMany({
        where: { narratedAt: null, importance: { lt: threshold } },
        data: { narratedAt: new Date() },
    });
    return result.count;
}
