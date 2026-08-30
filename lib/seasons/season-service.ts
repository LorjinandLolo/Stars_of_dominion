// lib/seasons/season-service.ts
// Pillar 7 — Seasonal Macro Shifts: scheduling, activation, tick, rewards.

import type {
    ActiveSeason,
    SeasonModifier,
    SeasonModifierType,
    SeasonRecord,
    SeasonFactionRecord,
} from './season-types';
import type { GameWorldState, SharedState } from '../game-world-state';
import { applySeasonalPressure, clampShared } from '../game-world-state';
import config from '../movement/movement-config.json';
import { registry } from '../tech/engine';
import { RNG, seedFromString } from '../trade-system/rng';
import { rankFactions, isRankedFaction } from './prestige';
import { awardTitle, ensureTitleState, notifyTitleTrigger } from '../titles/title-service';
import { resetSeasonCounters } from '../titles/metrics';
import { SEASON_ENDURANCE_TITLES, SEASON_RANK_TITLES, TITLE_CATALOG, TRIGGER } from '../titles/catalog';

/** Consecutive ratified seasons that make a hold a Dynasty. */
const DYNASTY_SEASONS = 3;
import { snapshotTerritoryAtSeasonEnd } from '../victory/victory-service';
import { fireNotification } from '../time/notification-hooks';

const seasonCfg = config.seasons;

/**
 * Authored season names. Season 1 is the galaxy's founding era; later numbers
 * fall through to plain "Season N" until someone names them. The retrospective
 * service may still coin a different name for a CLOSED era — this is the name
 * the season carries while it runs.
 */
const SEASON_NAMES: Record<number, string> = {
    1: 'The Beginning',
};

export function seasonNameFor(seasonNumber: number): string {
    return SEASON_NAMES[seasonNumber] ?? `Season ${seasonNumber}`;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Schedule the next season: pick 2–3 modifiers from the pool and announce.
 * Returns the new ActiveSeason (not yet effective — in 'announced' phase).
 *
 * Selection is seeded on the season number alone, so a worker restart mid-season
 * reschedules the identical season and galaxy history stays replayable.
 */
export function scheduleNextSeason(
    seasonNumber: number,
    world: GameWorldState
): ActiveSeason {
    const now = world.nowSeconds;
    const pool = seasonCfg.modifierPool as Array<{ id: string; label: string; pressureRate: number; affectedVariable: string }>;
    const rng = new RNG(seedFromString(`season|modifiers|${seasonNumber}`));

    // Pick 2–3 non-duplicate modifiers
    const count = rng.nextInt(2, seasonCfg.maxActiveModifiers);
    const shuffled = rng.shuffle([...pool]);
    const selected: SeasonModifier[] = shuffled.slice(0, count).map(m => ({
        id: m.id as SeasonModifierType,
        label: m.label,
        pressureRate: m.pressureRate,
        affectedVariable: m.affectedVariable,
        description: `Applies ${Math.round(m.pressureRate * 100)}% pressure to ${m.affectedVariable} over the season.`,
    }));

    const announcementLeadSeconds = seasonCfg.announcementLeadDays * 86400;
    const durationSeconds = seasonCfg.durationDays * 86400;

    const season: ActiveSeason = {
        id: `season-${seasonNumber}`,
        seasonNumber,
        name: seasonNameFor(seasonNumber),
        phase: 'announced',
        modifiers: selected,
        announcedAt: toISO(now),
        activatesAt: toISO(now + announcementLeadSeconds),
        endsAt: toISO(now + announcementLeadSeconds + durationSeconds),
        factionRecognition: new Map(),
    };

    return season;
}

// ─── Activation ───────────────────────────────────────────────────────────────

/**
 * Activate a season when its activatesAt time has passed.
 * Writes modifier rates into world.shared.seasonalModifiers.
 */
export function activateSeason(season: ActiveSeason, world: GameWorldState): void {
    season.phase = 'active';

    const modifiers: Partial<Record<string, number>> = {};
    for (const mod of season.modifiers) {
        modifiers[mod.affectedVariable] = mod.pressureRate;
    }
    world.shared.seasonalModifiers = modifiers as GameWorldState['shared']['seasonalModifiers'];

    // Initialize recognition for all factions
    for (const factionId of world.movement.empirePostures.keys()) {
        if (!season.factionRecognition.has(factionId)) {
            season.factionRecognition.set(factionId, {
                factionId,
                earnedTitles: [],
                prestige: 0,
                bonusesApplied: [],
            });
        }
    }
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

/**
 * Advance the active season by deltaSeconds.
 * Applies seasonal pressure to shared state and updates phase.
 */
export function tickSeasonModifiers(
    world: GameWorldState,
    deltaSeconds: number
): void {
    // A world with no season in flight starts one. Without this the whole
    // pillar stays dormant in production — which is exactly what it did before
    // phase 1: schedule and tick were only ever reached from debug endpoints.
    if (!world.activeSeason) {
        const lastNumber = world.seasonHistory.length > 0
            ? world.seasonHistory[world.seasonHistory.length - 1].seasonNumber
            : 0;
        world.activeSeason = scheduleNextSeason(lastNumber + 1, world);
        console.log(`[Seasons] Season ${lastNumber + 1} ("${seasonNameFor(lastNumber + 1)}") announced.`);
    }

    const season = world.activeSeason;
    if (!season || season.phase === 'complete') return;

    const now = world.nowSeconds;
    const activatesAt = fromISO(season.activatesAt);
    const endsAt = fromISO(season.endsAt);
    const durationSeconds = seasonCfg.durationDays * 86400;

    // Phase transitions
    if (season.phase === 'announced' && now >= activatesAt) {
        activateSeason(season, world);
    }

    if (season.phase === 'active') {
        // Advance day counter
        world.shared.seasonDayElapsed = (now - activatesAt) / 86400;

        // Apply pressure (non-destructive — rates from config, not hard overrides)
        applySeasonalPressure(world, deltaSeconds, durationSeconds);

        // Transition to 'ending' in last 20%
        const progress = (now - activatesAt) / durationSeconds;
        if (progress >= 0.8) season.phase = 'ending';
    }

    // Close on the clock. A season that was already past its end when the world
    // loaded closes from any phase, not just 'ending'.
    if (now >= endsAt) {
        endSeason(world);
    }
}

// ─── End-of-season ────────────────────────────────────────────────────────────

/**
 * The one and only season closer. Everything that ends a season goes through
 * here — the tick, the debug endpoint, an admin action. Two competing closers
 * used to exist (this one scored modifier endurance, MilestoneService scored
 * prestige rank); they are merged, and both scores now have a job:
 *
 *   1. ratify every held crown into the permanent record
 *   2. rank by prestige — top three take the season rank titles
 *   3. award endurance titles for weathering the season's own modifiers
 *   4. write legacy bonuses (capped, replaced, never compounded)
 *   5. archive to seasonHistory + hallOfFame, snapshot territory
 *   6. clear modifiers and schedule the next season — no dead air
 */
export function endSeason(world: GameWorldState): SeasonRecord | null {
    const season = world.activeSeason;
    if (!season) return null;

    season.phase = 'complete';
    const seasonNumber = season.seasonNumber;

    const outcomes: Record<string, SeasonFactionRecord> = {};
    const outcomeFor = (factionId: string): SeasonFactionRecord => {
        let rec = outcomes[factionId];
        if (!rec) {
            rec = season.factionRecognition.get(factionId)
                ?? { factionId, earnedTitles: [], prestige: 0, bonusesApplied: [] };
            rec.earnedTitles = [];
            rec.bonusesApplied = [];
            outcomes[factionId] = rec;
        }
        return rec;
    };

    // 1. Ratify crowns. A crown held at the bell becomes a permanent line in the
    //    ledger; the crown itself carries over and its holder starts the next
    //    season defending. (Phase 2 fills currentHolders; the loop is inert
    //    until then, which is the point — the closer never needs revisiting.)
    const titles = ensureTitleState(world);
    const ratifiedCrowns: string[] = [];
    for (const award of titles.currentHolders.values()) {
        const def = TITLE_CATALOG[award.titleId];
        if (!def) continue;
        award.ratified = true;
        titles.ledger.push({
            titleId: award.titleId,
            subjectId: award.subjectId,
            awardedAtSeconds: world.nowSeconds,
            seasonNumber,
            lostAtSeconds: null,
            ratified: true,
        });
        ratifiedCrowns.push(`${def.name} — ${award.subjectId}`);

        // Tenure: consecutive closes with the crown still in hand. Three running
        // is a Dynasty; taking a crown off a two-season holder is a Regicide.
        const tenureKey = `${def.id}|${award.subjectId}`;
        const tenure = (titles.crownTenure.get(tenureKey) ?? 0) + 1;
        titles.crownTenure.set(tenureKey, tenure);
        if (tenure >= DYNASTY_SEASONS) {
            notifyTitleTrigger(TRIGGER.CROWN_HELD_THREE_SEASONS, award.subjectId);
        }

        if (isRankedFaction(award.subjectId)) {
            const rec = outcomeFor(award.subjectId);
            rec.earnedTitles.push(`${def.name}, Season ${seasonNumber}`);
            rec.prestige += def.prestige;
        }
    }
    // Challenge progress does not survive the boundary; crowns do.
    titles.challenges.clear();
    // The villain crown's window is the season, so its tally resets here.
    resetSeasonCounters(world);

    // 2. Rank. The crown count is the headline; prestige fills the table below.
    const rankings = rankFactions(world);
    rankings.forEach(({ factionId, prestige }, index) => {
        const rec = outcomeFor(factionId);
        rec.prestige += prestige;
        const rankTitleId = SEASON_RANK_TITLES[index];
        if (!rankTitleId) return;
        const award = awardTitle(world, rankTitleId, factionId, { seasonNumber });
        if (award) rec.earnedTitles.push(TITLE_CATALOG[rankTitleId].name);
    });

    // 3. Endurance — held the line under this season's specific pressures.
    for (const { factionId } of rankings) {
        const weathered = countModifiersWeathered(factionId, season, world);
        if (weathered < 1) continue;
        const titleId = SEASON_ENDURANCE_TITLES[Math.min(weathered, SEASON_ENDURANCE_TITLES.length) - 1];
        const award = awardTitle(world, titleId, factionId, { seasonNumber });
        if (award) outcomeFor(factionId).earnedTitles.push(TITLE_CATALOG[titleId].name);
    }

    // 4. Legacy bonuses. Replaced wholesale each season, never accumulated, and
    //    capped — a title must never be the reason its holder keeps winning.
    world.legacyPrestigeBonuses.clear();
    rankings.slice(0, SEASON_RANK_TITLES.length).forEach(({ factionId }, index) => {
        const bonuses = legacyBonusForRank(index);
        if (!bonuses) return;
        world.legacyPrestigeBonuses.set(factionId, bonuses);
        outcomeFor(factionId).bonusesApplied = Object.entries(bonuses)
            .map(([k, v]) => `${k} ×${v.toFixed(2)}`);
    });

    // 5. Archive.
    const modifierNames = season.modifiers.map(m => m.label).join(', ');
    const leader = rankings[0]?.factionId;
    const narrative = ratifiedCrowns.length > 0
        ? `Season ${seasonNumber} was defined by ${modifierNames}. Crowns ratified: ${ratifiedCrowns.join('; ')}.`
        : `Season ${seasonNumber} was defined by ${modifierNames}. ${leader ?? 'No one'} ended it on top.`;

    const record: SeasonRecord = {
        id: season.id,
        seasonNumber,
        modifiers: season.modifiers,
        completedAt: toISO(world.nowSeconds),
        factionOutcomes: outcomes,
        narrative,
    };

    world.seasonHistory.push(record);
    world.hallOfFame.push(record);
    try {
        snapshotTerritoryAtSeasonEnd(seasonNumber, world);
    } catch (e) {
        console.error('[Seasons] territory snapshot failed:', e);
    }

    // 6. Clear pressure and open the next season immediately.
    world.shared.seasonalModifiers = {};
    world.shared.seasonDayElapsed = 0;
    world.activeSeason = scheduleNextSeason(seasonNumber + 1, world);

    fireNotification({
        id: `season-end-${season.id}`,
        factionId: 'all',
        category: 'system',
        priority: 'urgent',
        title: `SEASON ${seasonNumber} — ${seasonNameFor(seasonNumber).toUpperCase()} — CONCLUDED`,
        body: narrative,
        createdAt: toISO(world.nowSeconds),
        read: false,
        linkToTab: 'dashboard',
        payload: { seasonNumber, nextSeason: seasonNumber + 1 },
    });

    console.log(`[Seasons] Season ${seasonNumber} closed; season ${seasonNumber + 1} announced.`);
    return record;
}

/** Legacy bonus by finishing position. Magnitudes stay inside the config cap. */
function legacyBonusForRank(index: number): Record<string, number> | null {
    const cap = seasonCfg.rewards.permanentBonusCap / 100;
    const table: Array<Record<string, number>> = [
        { credit_mult: 1 + Math.min(0.10, cap), tech_mult: 1 + Math.min(0.15, cap) },
        { credit_mult: 1 + Math.min(0.05, cap), tech_mult: 1 + Math.min(0.10, cap) },
        { tech_mult: 1 + Math.min(0.05, cap) },
    ];
    return table[index] ?? null;
}

/**
 * How many of the season's own pressures a faction held the line against.
 * Shared-state scalars are galactic, so this reads the same for everyone; the
 * per-faction half is technology identity — a specialized empire weathered the
 * season by being built for it.
 */
function countModifiersWeathered(
    factionId: string,
    season: ActiveSeason,
    world: GameWorldState
): number {
    let score = 0;
    for (const mod of season.modifiers) {
        const current = (world.shared as unknown as Record<string, unknown>)[mod.affectedVariable];
        if (typeof current === 'number' && current >= 0.6) score++;
    }

    const techState = world.tech.get(factionId);
    if (techState) {
        const tagCounts: Record<string, number> = {};
        for (const id of techState.unlockedTechIds) {
            const tech = registry.get(id);
            tech?.seasonScoreTags?.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }
        for (const count of Object.values(tagCounts)) {
            if (count >= 10) score++;
        }
    }

    return score;
}

// ─── Query ────────────────────────────────────────────────────────────────────

/**
 * Get currently-active modifier list for UI overlay.
 */
export function getActiveModifiers(world: GameWorldState): SeasonModifier[] {
    if (!world.activeSeason) return [];
    if (world.activeSeason.phase === 'announced' || world.activeSeason.phase === 'complete') return [];
    return world.activeSeason.modifiers;
}

/**
 * Get countdown in seconds until the next season activates (or 0 if already active).
 */
export function getSeasonCountdown(world: GameWorldState): number {
    if (!world.activeSeason) return 0;
    if (world.activeSeason.phase !== 'announced') return 0;
    return Math.max(0, fromISO(world.activeSeason.activatesAt) - world.nowSeconds);
}

/**
 * Get per-faction recognition snapshot for the current season (UI).
 */
export function getFactionRecognition(
    factionId: string,
    world: GameWorldState
): SeasonFactionRecord | null {
    return world.activeSeason?.factionRecognition.get(factionId) ?? null;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function toISO(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toISOString();
}

export function fromISO(iso: string): number {
    return new Date(iso).getTime() / 1000;
}
