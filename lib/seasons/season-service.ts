// lib/seasons/season-service.ts
// Pillar 7 — Seasonal Macro Shifts: scheduling, activation, tick, rewards.

import type {
    ActiveSeason,
    SeasonModifier,
    SeasonModifierType,
    SeasonPhase,
    SeasonRecord,
    SeasonFactionRecord,
    SeasonReward,
} from './season-types';
import type { GameWorldState } from '../game-world-state';
import { applySeasonalPressure, clampShared } from '../game-world-state';
import config from '../movement/movement-config.json';

const seasonCfg = config.seasons;

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Schedule the next season: pick 2–3 modifiers from the pool and announce.
 * Returns the new ActiveSeason (not yet effective — in 'announced' phase).
 */
export function scheduleNextSeason(
    seasonNumber: number,
    world: GameWorldState
): ActiveSeason {
    const now = world.nowSeconds;
    const pool = seasonCfg.modifierPool as Array<{ id: string; label: string; pressureRate: number; affectedVariable: string }>;

    // Pick 2–3 non-duplicate modifiers
    const count = 2 + Math.floor(Math.random() * (seasonCfg.maxActiveModifiers - 1));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
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

    if (season.phase === 'ending' && now >= endsAt) {
        endSeason(world);
    }
}

// ─── End-of-season ────────────────────────────────────────────────────────────

/**
 * End the current season: compute recognition, award titles/prestige,
 * clear seasonal modifiers, and archive the season.
 */
export function endSeason(world: GameWorldState): SeasonRecord | null {
    const season = world.activeSeason;
    if (!season) return null;

    season.phase = 'complete';

    // Compute recognition for each faction
    const outcomes: Record<string, SeasonFactionRecord> = {};
    for (const [factionId, record] of season.factionRecognition) {
        const reward = computeReward(factionId, season, world);
        record.earnedTitles = reward.title ? [reward.title] : [];
        record.prestige += reward.prestige;
        record.bonusesApplied = reward.bonus ? [reward.bonus] : [];
        outcomes[factionId] = record;
    }

    // Build narrative
    const modifierNames = season.modifiers.map(m => m.label).join(', ');
    const narrative = `Season ${season.seasonNumber} was defined by: ${modifierNames}. The galaxy endures.`;

    const record: SeasonRecord = {
        id: season.id,
        seasonNumber: season.seasonNumber,
        modifiers: season.modifiers,
        completedAt: toISO(world.nowSeconds),
        factionOutcomes: outcomes,
        narrative,
    };

    world.seasonHistory.push(record);
    world.activeSeason = null;

    // Clear seasonal modifiers from shared state
    world.shared.seasonalModifiers = {};
    world.shared.seasonDayElapsed = 0;

    return record;
}

function computeReward(
    factionId: string,
    season: ActiveSeason,
    world: GameWorldState
): SeasonReward {
    const rewardCfg = seasonCfg.rewards;
    const posture = world.movement.empirePostures.get(factionId);
    const shared = world.shared;

    // Score based on performance under the season's modifiers
    let score = 0;
    for (const mod of season.modifiers) {
        // If the faction maintained their variable above 0.6 despite pressure, award points
        const current = (shared as unknown as Record<string, unknown>)[mod.affectedVariable];
        if (typeof current === 'number' && current >= 0.6) score++;
    }

    // Choose title based on score threshold
    const titleIndex = Math.min(score, rewardCfg.titles.length - 1);
    const title = score >= 1 ? rewardCfg.titles[titleIndex] : '';
    const prestige = score * rewardCfg.prestigePerTitle;
    const bonus = score >= 2 ? `+${score}% trade efficiency next season` : '';

    return { title, prestige, bonus };
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

function toISO(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toISOString();
}

function fromISO(iso: string): number {
    return new Date(iso).getTime() / 1000;
}
