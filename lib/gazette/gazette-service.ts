// lib/gazette/gazette-service.ts
// Stars of Dominion — the public gazette, the database side.
//
// Server only (imports lib/db). Reads published articles, the three chronicle
// columns that decide who each is publicly about, and — from the shared
// session snapshot — the season and the empires' names. The shaping, and the
// rule for what may be shown, is lib/gazette/public-gazette.ts.
//
// Nothing here reads a faction shard: the public page is built only from what
// every signed-in client is already sent, and from what the narrator printed.

import { cache } from 'react';
import { prisma } from '@/lib/db';
import { LOBBY_FACTIONS } from '@/data/factions/lobby-factions';
import {
    seasonLine,
    shapePublicArticles,
    type PublicArticle,
    type SeasonLine,
} from './public-gazette';

const SESSION_DOC_ID = 'default-session';
/** Real days of news the public page carries. */
export const GAZETTE_DAYS = 7;
const MAX_ARTICLES = 120;

export interface PublicWorldFacts {
    season: SeasonLine;
    /** factionId → empire name, for every empire the galaxy has a name for. */
    factionNames: Record<string, string>;
}

// The snapshot is over a megabyte and the page is open to the internet: read
// and parse it at most once a minute, whoever is asking.
const FACTS_TTL_MS = 60_000;
let cachedFacts: { at: number; facts: PublicWorldFacts } | null = null;

/** Season and empire names — all of it already public to every player. */
export async function loadPublicWorldFacts(now: number = Date.now()): Promise<PublicWorldFacts> {
    if (cachedFacts && now - cachedFacts.at < FACTS_TTL_MS) return cachedFacts.facts;

    const factionNames: Record<string, string> = Object.fromEntries(LOBBY_FACTIONS.map(f => [f.id, f.name]));
    let season = seasonLine(null);
    try {
        const doc = await prisma.multiplayerSession.findUnique({
            where: { id: SESSION_DOC_ID },
            select: { snapshot: true },
        });
        if (doc?.snapshot) {
            // Plain JSON.parse: only three top-level fields are read, none of
            // them a Map, so the world does not need rebuilding.
            const raw = JSON.parse(doc.snapshot);
            season = seasonLine({ nowSeconds: raw?.nowSeconds, activeSeason: raw?.activeSeason });
            const live = raw?.factionNames;
            if (live && typeof live === 'object') {
                for (const [id, name] of Object.entries(live)) {
                    if (typeof name === 'string' && name) factionNames[id] = name;
                }
            }
        }
    } catch (e) {
        // No snapshot, or an unreadable one: the page still has its articles.
        console.warn('[Gazette] could not read the session snapshot:', e);
    }

    const facts = { season, factionNames };
    cachedFacts = { at: now, facts };
    return facts;
}

/**
 * The last week of published articles, shaped for the public page. Wrapped in
 * React's per-request cache: a page and its generateMetadata both ask, and
 * that should be one pair of queries, not two.
 */
export const loadPublicArticles = cache(async (): Promise<PublicArticle[]> => {
    const since = new Date(Date.now() - GAZETTE_DAYS * 24 * 3600 * 1000);
    const articles = await prisma.narrativeArticle.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: MAX_ARTICLES,
        select: { id: true, kind: true, headline: true, body: true, day: true, stance: true, eventIds: true, createdAt: true },
    });

    const eventIds = new Set<string>();
    for (const article of articles) {
        try {
            const ids = JSON.parse(article.eventIds);
            if (Array.isArray(ids)) for (const id of ids) eventIds.add(String(id));
        } catch { /* an article with unreadable event ids simply has no subjects */ }
    }
    const events = eventIds.size === 0 ? [] : await prisma.chronicleEvent.findMany({
        where: { id: { in: [...eventIds] } },
        select: { id: true, actorIds: true, targetIds: true, attribution: true },
    });

    const { factionNames } = await loadPublicWorldFacts();
    return shapePublicArticles(articles, events, factionNames);
});
