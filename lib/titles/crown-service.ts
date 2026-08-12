// lib/titles/crown-service.ts
// Seasons & Titles — Phase 2: the contested crowns.
//
// One evaluation per tick per crown. A crown changes hands only when a
// challenger has beaten the holder by the margin for `challengeDwell`
// consecutive evaluations — without that hysteresis, two factions trading 1%
// leads swap a crown every tick and the gazette becomes noise.
//
// Holding a crown grants cosmetics only (invariant 3). Prestige lands when the
// season closer ratifies the hold.

import type { GameWorldState } from '../game-world-state';
import type { TitleAward, TitleDefinition } from './types';
import { TITLE_CATALOG, TRIGGER } from './catalog';
import { METRICS, type MetricScores } from './metrics';
import { ensureTitleState, notifyTitleTrigger } from './title-service';
import { fireNotification } from '../time/notification-hooks';

const DEFAULT_MARGIN = 0.10;
const DEFAULT_DWELL = 3;
/** Seasons a holder must have defended a crown for its loss to be a Regicide. */
const REGICIDE_TENURE = 2;

export interface CrownStanding {
    titleId: string;
    name: string;
    holderId: string | null;
    holderScore: number;
    /** Held since this sim-clock second (null when vacant). */
    heldSinceSeconds: number | null;
    /** Consecutive season closes this holder has ratified. */
    tenure: number;
    challengerId: string | null;
    challengerScore: number;
    /** Evaluations the challenger has sustained the margin, of challengeDwell. */
    dwellCount: number;
    dwellRequired: number;
    /** Every scored subject, best first. */
    leaderboard: Array<{ subjectId: string; score: number }>;
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

/** All held titles in the catalog, with their metric resolved. */
function heldTitles(): TitleDefinition[] {
    return Object.values(TITLE_CATALOG).filter(d => d.kind === 'held' && d.metricId);
}

function bestTwo(scores: MetricScores, floor: number): Array<{ subjectId: string; score: number }> {
    return [...scores.entries()]
        .filter(([, score]) => score >= floor)
        // Ties break on subject id so a restart cannot reshuffle a crown.
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([subjectId, score]) => ({ subjectId, score }));
}

/**
 * Evaluate every crown once. Returns the crowns that changed hands this tick.
 */
export function evaluateCrowns(world: GameWorldState): TitleAward[] {
    const t = ensureTitleState(world);
    const changed: TitleAward[] = [];

    for (const def of heldTitles()) {
        const metric = METRICS[def.metricId!];
        if (!metric) {
            console.warn(`[Crowns] "${def.id}" names unknown metric "${def.metricId}".`);
            continue;
        }

        // One malformed metric must never take the strategic tick down with it;
        // an unscored crown simply stands as it is this tick.
        let ranked: Array<{ subjectId: string; score: number }>;
        try {
            ranked = bestTwo(metric.evaluate(world), metric.floor ?? 0);
        } catch (e) {
            console.error(`[Crowns] metric "${metric.id}" failed:`, e);
            continue;
        }

        const leader = ranked[0] ?? null;
        const holder = t.currentHolders.get(def.id) ?? null;

        // Vacant crown: the leader takes it immediately. Nothing to contest.
        if (!holder) {
            if (leader) {
                const award = claim(world, def, leader.subjectId, null);
                changed.push(award);
            }
            t.challenges.delete(def.id);
            continue;
        }

        // A holder who no longer scores at all loses the crown outright — the
        // faction that was Warden of the Gates does not keep it after losing
        // every gate.
        const holderEntry = ranked.find(r => r.subjectId === holder.subjectId) ?? null;
        if (!holderEntry) {
            if (leader && leader.subjectId !== holder.subjectId) {
                changed.push(claim(world, def, leader.subjectId, holder));
            } else {
                vacate(world, def, holder);
                changed.push(holder);
            }
            t.challenges.delete(def.id);
            continue;
        }

        if (!leader || leader.subjectId === holder.subjectId) {
            t.challenges.delete(def.id); // holder is still on top
            continue;
        }

        // Contested: the challenger must clear the margin, and keep clearing it.
        const margin = def.challengeMargin ?? DEFAULT_MARGIN;
        const dwellRequired = def.challengeDwell ?? DEFAULT_DWELL;
        const clears = leader.score > holderEntry.score * (1 + margin);

        if (!clears) {
            t.challenges.delete(def.id);
            continue;
        }

        const progress = t.challenges.get(def.id);
        // A different challenger restarts the count: the crown answers to one
        // sustained rival, not to a rotating cast of near-misses.
        const dwellCount = progress && progress.challengerId === leader.subjectId
            ? progress.dwellCount + 1
            : 1;

        if (dwellCount >= dwellRequired) {
            changed.push(claim(world, def, leader.subjectId, holder));
            t.challenges.delete(def.id);
        } else {
            t.challenges.set(def.id, { challengerId: leader.subjectId, dwellCount });
        }
    }

    return changed;
}

// ─── Transfer ─────────────────────────────────────────────────────────────────

/** Close out a hold in the ledger. The award object itself is never deleted. */
function vacate(world: GameWorldState, def: TitleDefinition, holder: TitleAward): void {
    const t = ensureTitleState(world);
    holder.lostAtSeconds = world.nowSeconds;
    t.currentHolders.delete(def.id);
    t.crownTenure.delete(`${def.id}|${holder.subjectId}`);

    fireNotification({
        id: `crown-lost-${def.id}-${holder.subjectId}-${world.nowSeconds}`,
        factionId: 'all',
        category: 'system',
        priority: 'normal',
        title: 'A CROWN FALLS',
        body: `${holder.subjectId} no longer holds "${def.name}".`,
        createdAt: new Date(world.nowSeconds * 1000).toISOString(),
        read: false,
        linkToTab: 'dashboard',
        payload: { titleId: def.id, formerHolderId: holder.subjectId },
    });
}

function claim(
    world: GameWorldState,
    def: TitleDefinition,
    subjectId: string,
    previous: TitleAward | null
): TitleAward {
    const t = ensureTitleState(world);

    if (previous) {
        previous.lostAtSeconds = world.nowSeconds;
        // Taking a crown off someone who had defended it across seasons is its
        // own achievement — the longer it was held, the richer taking it is.
        const tenureKey = `${def.id}|${previous.subjectId}`;
        if ((t.crownTenure.get(tenureKey) ?? 0) >= REGICIDE_TENURE) {
            notifyTitleTrigger(TRIGGER.CROWN_TAKEN_FROM_LONG_HOLDER, subjectId);
        }
        t.crownTenure.delete(tenureKey);
    }

    const award: TitleAward = {
        titleId: def.id,
        subjectId,
        awardedAtSeconds: world.nowSeconds,
        seasonNumber: world.activeSeason?.seasonNumber ?? 0,
        lostAtSeconds: null,
        ratified: false,
    };
    t.currentHolders.set(def.id, award);
    // The ledger records the hold as it happens; ratification at season close
    // marks it permanent. Both are append-only.
    t.ledger.push(award);

    fireNotification({
        id: `crown-${def.id}-${subjectId}-${world.nowSeconds}`,
        factionId: 'all',
        category: 'system',
        priority: 'urgent',
        title: previous ? 'A CROWN CHANGES HANDS' : 'A CROWN IS CLAIMED',
        body: previous
            ? `${subjectId} has taken "${def.name}" from ${previous.subjectId}.`
            : `${subjectId} claims "${def.name}": ${def.description}`,
        createdAt: new Date(world.nowSeconds * 1000).toISOString(),
        read: false,
        linkToTab: 'dashboard',
        payload: {
            titleId: def.id,
            subjectId,
            formerHolderId: previous?.subjectId ?? null,
            badge: def.cosmetic?.badge ?? null,
            masthead: def.cosmetic?.mastheadLine ?? null,
        },
    });

    return award;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Who holds what right now. */
export function crownsHeldBy(world: GameWorldState, subjectId: string): TitleDefinition[] {
    const t = ensureTitleState(world);
    const held: TitleDefinition[] = [];
    for (const award of t.currentHolders.values()) {
        if (award.subjectId !== subjectId) continue;
        const def = TITLE_CATALOG[award.titleId];
        if (def) held.push(def);
    }
    return held;
}

/**
 * Full standings for the UI — every crown, its holder, and the rival closing in.
 * The ending phase of a season is where this earns its keep.
 */
export function crownStandings(world: GameWorldState): CrownStanding[] {
    const t = ensureTitleState(world);
    const standings: CrownStanding[] = [];

    for (const def of heldTitles()) {
        const metric = METRICS[def.metricId!];
        if (!metric) continue;
        let ranked: Array<{ subjectId: string; score: number }> = [];
        try {
            ranked = bestTwo(metric.evaluate(world), metric.floor ?? 0);
        } catch (e) {
            console.error(`[Crowns] metric "${metric.id}" failed:`, e);
        }
        const holder = t.currentHolders.get(def.id) ?? null;
        const progress = t.challenges.get(def.id) ?? null;
        const scoreOf = (id: string | null) =>
            id ? ranked.find(r => r.subjectId === id)?.score ?? 0 : 0;

        standings.push({
            titleId: def.id,
            name: def.name,
            holderId: holder?.subjectId ?? null,
            holderScore: scoreOf(holder?.subjectId ?? null),
            heldSinceSeconds: holder?.awardedAtSeconds ?? null,
            tenure: holder ? t.crownTenure.get(`${def.id}|${holder.subjectId}`) ?? 0 : 0,
            challengerId: progress?.challengerId ?? null,
            challengerScore: scoreOf(progress?.challengerId ?? null),
            dwellCount: progress?.dwellCount ?? 0,
            dwellRequired: def.challengeDwell ?? DEFAULT_DWELL,
            leaderboard: ranked,
        });
    }

    return standings;
}

/** Crown count per subject — the season's headline scoreboard. */
export function crownCounts(world: GameWorldState): Map<string, number> {
    const counts = new Map<string, number>();
    for (const award of ensureTitleState(world).currentHolders.values()) {
        counts.set(award.subjectId, (counts.get(award.subjectId) ?? 0) + 1);
    }
    return counts;
}
