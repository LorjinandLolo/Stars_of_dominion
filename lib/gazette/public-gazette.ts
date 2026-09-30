// lib/gazette/public-gazette.ts
// Stars of Dominion — the public gazette (casual-play spec Item 6d).
//
// /gazette is open to anyone with the link: no account, no session. So
// everything it shows is decided here, by pure functions over rows the caller
// has already read, and the rule is the narrator's own — the press may name an
// event's targets, and its actors only as far as the galaxy knows them
// (lib/narrative/narrator-service.ts, applyAttribution):
//
//   'exposed'          the actors are named
//   'suspected:<id>'   that one name is whispered — right or wrong
//   'invisible'        no actor is named at all
//
// The chronicle's `actorIds` column is who REALLY acted. It never leaves this
// module: a covert operation must not show up on its author's page just
// because the database knows who did it.
//
// No imports from lib/db. lib/gazette/gazette-service.ts does the reading.

import { GALACTIC_DAY_SIM_SECONDS } from '@/lib/time/time-config';

/** A NarrativeArticle row as the DB stores it (JSON-bearing columns are strings). */
export interface GazetteArticleRow {
    id: string;
    kind: string;
    headline: string;
    body: string;
    day: number;
    stance: string | null;
    eventIds: string;
    createdAt: Date | string;
}

/** The three columns of a ChronicleEvent that decide who an article is about. */
export interface GazetteEventRow {
    id: string;
    actorIds: string;
    targetIds: string;
    attribution: string;
}

/** An article as the public page shows it. */
export interface PublicArticle {
    id: string;
    kind: string;
    headline: string;
    body: string;
    /** Sim day the story happened on. */
    day: number;
    /** The outlet that printed it, when recorded. */
    masthead: string | null;
    /** True when the paper is naming a suspect, not a culprit. */
    speculative: boolean;
    /** ISO timestamp, real clock. */
    at: string;
    /** Faction ids the press names in connection with this story. */
    subjects: string[];
}

function parseArray(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw !== 'string' || !raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

function parseObject(raw: unknown): Record<string, any> {
    if (typeof raw !== 'string' || !raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

/** Who the galaxy connects with one event: its targets, and its actors as far as attribution allows. */
export function publicSubjectsOf(event: GazetteEventRow): string[] {
    const subjects = new Set<string>(parseArray(event.targetIds));
    const attribution = event.attribution || 'exposed';
    if (attribution === 'exposed') {
        for (const id of parseArray(event.actorIds)) subjects.add(id);
    } else if (attribution.startsWith('suspected:')) {
        const suspect = attribution.slice('suspected:'.length);
        if (suspect) subjects.add(suspect);
    }
    // 'invisible', or anything unrecognised: targets only.
    return [...subjects];
}

/** Anything shaped like a faction id: `faction-infernoids`, `rebel-faction-midrim-106`. */
const ID_SHAPE = /\b(?:rebel-)?faction-[a-z0-9][a-z0-9_-]*\b/gi;

/**
 * Older prose sometimes printed a raw id where a name belonged ("sanctions
 * imposed by faction-infernoids"). A reader with no account should never meet
 * one: known ids become the empire's name, unknown ones a readable form of the
 * slug. Whole tokens only, and empire names only — never who plays them.
 */
export function nameFactionIds(text: string, names: Readonly<Record<string, string>>): string {
    if (!text) return text;
    return text.replace(ID_SHAPE, match => {
        const known = names[match] ?? names[match.toLowerCase()];
        if (known) return known;
        const rebel = /^rebel-faction-(.+)$/i.exec(match);
        const core = rebel ? rebel[1] : match.replace(/^faction-/i, '');
        const words = core.split(/[-_]/).filter(Boolean)
            .map(w => (/^\d+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
            .join(' ');
        if (!words) return match;
        return rebel ? `${words} Rebels` : words;
    });
}

/**
 * Articles shaped for the public page, newest first. Events not handed over
 * contribute no subjects. With `names`, raw faction ids in the prose are
 * replaced by empire names.
 */
export function shapePublicArticles(
    articles: readonly GazetteArticleRow[],
    events: readonly GazetteEventRow[],
    names: Readonly<Record<string, string>> = {},
): PublicArticle[] {
    const byId = new Map(events.map(e => [e.id, e]));
    const shaped = articles.map((article): PublicArticle => {
        const subjects = new Set<string>();
        for (const eventId of parseArray(article.eventIds)) {
            const event = byId.get(eventId);
            if (event) for (const id of publicSubjectsOf(event)) subjects.add(id);
        }
        const stance = parseObject(article.stance);
        const at = article.createdAt instanceof Date ? article.createdAt : new Date(article.createdAt);
        return {
            id: article.id,
            kind: article.kind,
            headline: nameFactionIds(article.headline, names),
            body: nameFactionIds(article.body, names),
            day: article.day,
            masthead: typeof stance.masthead === 'string' ? stance.masthead : null,
            speculative: stance.speculative === true,
            at: Number.isNaN(at.getTime()) ? new Date(0).toISOString() : at.toISOString(),
            subjects: [...subjects],
        };
    });
    return shaped.sort((a, b) => b.at.localeCompare(a.at));
}

/** One empire's headlines: the stories the press connects with it. */
export function articlesAbout(articles: readonly PublicArticle[], factionId: string): PublicArticle[] {
    return articles.filter(a => a.subjects.includes(factionId));
}

export interface GazetteDay {
    /** YYYY-MM-DD, UTC. */
    date: string;
    /** "Wednesday 30 September". */
    label: string;
    articles: PublicArticle[];
}

/** Articles under the real calendar day they were printed on (UTC — the page has no viewer). */
export function groupByDate(articles: readonly PublicArticle[]): GazetteDay[] {
    const days = new Map<string, PublicArticle[]>();
    for (const article of articles) {
        const date = article.at.slice(0, 10);
        const list = days.get(date) ?? [];
        list.push(article);
        days.set(date, list);
    }
    return [...days.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, list]) => ({
            date,
            label: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
            }),
            articles: list,
        }));
}

// ─── The season line ──────────────────────────────────────────────────────────

export interface SeasonLine {
    /** "The Beginning", or "Season 2" when the season was never named. */
    name: string;
    number: number;
    /** Galactic Day of the season, counted from 1. Null before it has started. */
    day: number | null;
}

/**
 * The season's name and which Galactic Day of it this is. A Galactic Day is 24
 * real hours (lib/time/time-config.ts), so "day 12" means the season has been
 * running for twelve of the reader's own days.
 */
export function seasonLine(world: { nowSeconds?: number; activeSeason?: any } | null | undefined): SeasonLine {
    const now = Number(world?.nowSeconds ?? 0);
    const season = world?.activeSeason ?? null;
    if (!season) {
        return { name: 'Season 1', number: 1, day: Math.floor(now / GALACTIC_DAY_SIM_SECONDS) + 1 };
    }
    const number = Number(season.seasonNumber ?? 1) || 1;
    const name = typeof season.name === 'string' && season.name ? season.name : `Season ${number}`;
    const startsAt = new Date(season.activatesAt).getTime() / 1000;
    if (!Number.isFinite(startsAt) || now < startsAt) return { name, number, day: null };
    return { name, number, day: Math.floor((now - startsAt) / GALACTIC_DAY_SIM_SECONDS) + 1 };
}

/** "The Beginning, day 12" / "The Beginning (not yet begun)". */
export function seasonLabel(season: SeasonLine): string {
    return season.day === null ? `${season.name} (not yet begun)` : `${season.name}, day ${season.day}`;
}

// ─── The share card ───────────────────────────────────────────────────────────

/**
 * What "Share today" copies. Every field is something the public gazette
 * already prints: the season, the day, an empire's name, a published headline
 * and a link. No positions, no numbers, nothing from a shard.
 */
export interface ShareCard {
    season: string;
    empireName: string;
    /** The newest published headline the press connects with the empire. Null on a quiet week. */
    headline: string | null;
    /** Path of the empire's public page; the client adds its own origin. */
    path: string;
}

export function buildShareCard(input: {
    factionId: string;
    empireName: string;
    season: SeasonLine;
    /** Public articles, as shapePublicArticles returns them. */
    articles: readonly PublicArticle[];
}): ShareCard {
    const own = articlesAbout(input.articles, input.factionId);
    return {
        season: seasonLabel(input.season),
        empireName: input.empireName,
        headline: own[0]?.headline ?? null,
        path: `/gazette/${encodeURIComponent(input.factionId)}`,
    };
}

/** The card as plain text, ready for a chat window. */
export function shareCardText(card: ShareCard, origin: string): string {
    const base = origin.replace(/\/+$/, '');
    return [
        `Stars of Dominion · ${card.season}`,
        card.headline
            ? `${card.empireName}: “${card.headline}”`
            : `${card.empireName}: a quiet day. Nothing made the papers.`,
        `${base}${card.path}`,
    ].join('\n');
}
