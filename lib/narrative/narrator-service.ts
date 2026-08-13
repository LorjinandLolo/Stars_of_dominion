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
import { memoryFor, EMPTY_MEMORY } from './memory-service';
import { loadPublishers, selectPublisher, stanceFor } from './press-voices';
import { careerOf } from './retrospective-service';
import type { ChronicleAttribution, ChronicleEventType } from './chronicle-types';
import type { NarratableEvent, NarrationRequest, ProseWriter } from './prose/prose-types';
import { TemplateWriter } from './prose/template-writer';


/**
 * Event types that are filed as something other than plain news. The kind is
 * what the history panel groups by, so it is the difference between an archive
 * players can browse and an undifferentiated wall of headlines.
 */
const ARTICLE_KIND: Record<string, string> = {
    investigation_published: 'investigation',
    scandal_confirmed: 'investigation',
    leader_died: 'obituary',
};

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

    // Pass one: look up what the chronicle remembers about each story. Done
    // before anything is written because context changes the running order —
    // a border clash between two powers with a feud is a bigger story than a
    // louder event nobody has any history with, and the front page is capped.
    const enriched = [];
    for (const group of coalesce(events)) {
        const lead = group.reduce((a, b) => (b.importance > a.importance ? b : a));
        let memory = EMPTY_MEMORY;
        try {
            memory = await memoryFor({
                eventIds: group.map(e => e.id),
                type: lead.type,
                actorIds: lead.actorIds,
                targetIds: lead.targetIds,
                location: lead.location,
                tick: lead.tick,
                attribution: lead.attribution,
                importance: lead.importance,
            });
        } catch (e: any) {
            // Memory is enrichment, not correctness: publish the news without it.
            console.warn(`[Narrator] Memory lookup failed for ${lead.id}:`, e.message);
        }
        enriched.push({
            group,
            lead,
            memory,
            effectiveImportance: Math.min(100, lead.importance + memory.importanceBonus),
        });
    }
    enriched.sort((a, b) => b.effectiveImportance - a.effectiveImportance || a.lead.tick - b.lead.tick);

    // Who is on the wire this pass. One read, cached, shared by every story.
    const publishers = await loadPublishers();

    // Pass two: write.
    for (const { group, lead, memory, effectiveImportance } of enriched) {
        const { visibleActors, speculative } = applyAttribution(lead);
        const publisher = selectPublisher(lead, publishers);
        const stance = stanceFor(lead, publisher);

        // A leader's death is written as a life. The chronicle keys events by
        // faction rather than by person, so "their career" is what the empire
        // did while they held office — which is how leaders are judged anyway.
        let career: string[] | undefined;
        if (lead.type === 'leader_died' && lead.actorIds[0]) {
            const years = Number(lead.facts.yearsInOffice ?? 0);
            // Four ticks to the day, and AGE_YEARS_PER_DAY = 0.5 in
            // lib/government/succession-service.ts — so one year in office is
            // two days of play, eight ticks. Getting this wrong silently
            // truncates the career and makes eventful reigns read as empty.
            const tenureTicks = Number.isFinite(years) && years > 0 ? years * 8 : 4 * 30;
            try {
                career = await careerOf({
                    factionId: lead.actorIds[0],
                    fromTick: lead.tick - tenureTicks,
                    toTick: lead.tick,
                    excludeEventIds: group.map(e => e.id),
                });
            } catch (e: any) {
                console.warn(`[Narrator] Career lookup failed for ${lead.id}:`, e.message);
            }
        }

        const request: NarrationRequest = { events: group, lead, visibleActors, speculative, day: lead.day, memory, stance, career };

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
                    publisherId: publisher.id,
                    kind: ARTICLE_KIND[lead.type] ?? 'news',
                    headline: result!.headline,
                    body: result!.body,
                    stance: JSON.stringify({
                        provider: result!.provider,
                        speculative,
                        namedActors: visibleActors,
                        attribution: lead.attribution,
                        effectiveImportance,
                        feud: memory.feud?.epithet ?? null,
                        citedPrecedents: memory.precedents.map(p => p.headline),
                        // Who said it and from what angle — the record a later
                        // contradiction or credibility collapse is judged against.
                        masthead: publisher.masthead,
                        publisherType: publisher.type,
                        slant: stance.slant,
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
