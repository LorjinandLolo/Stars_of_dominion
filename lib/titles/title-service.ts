// lib/titles/title-service.ts
// Seasons & Titles — Phase 0: registry, append-only ledger, trigger buffer,
// milestone-first evaluation, defeat-status latch.
//
// Invariants (docs/season-title-system/README.md):
//   - The ledger is append-only; awards are never deleted.
//   - No code path here ends the game.
//   - Every transition emits exactly one event; steady state emits nothing.
//   - Timestamps are world.nowSeconds. No Date.now(), no Math.random().

import type { GameWorldState } from '../game-world-state';
import type { DefeatStatusLatch, TitleAward, TitleWorldState } from './types';
import { MILESTONE_FIRSTS, TITLE_CATALOG } from './catalog';
import { Resource } from '../trade-system/types';
import { fireNotification } from '../time/notification-hooks';
import { drainMetricCounters } from './metrics';
import { evaluateCrowns } from './crown-service';

// ─── State ────────────────────────────────────────────────────────────────────

export function emptyTitleState(): TitleWorldState {
    return {
        currentHolders: new Map(),
        ledger: [],
        challenges: new Map(),
        defeatStatuses: new Map(),
        seasonCounters: new Map(),
        crownTenure: new Map(),
    };
}

/** Initialize/normalize title state on any world (old snapshots lack it). */
export function ensureTitleState(world: GameWorldState): TitleWorldState {
    const w = world as GameWorldState & { titles?: TitleWorldState };
    if (!w.titles) w.titles = emptyTitleState();
    const t = w.titles;
    if (!(t.currentHolders instanceof Map)) t.currentHolders = new Map();
    if (!Array.isArray(t.ledger)) t.ledger = [];
    if (!(t.challenges instanceof Map)) t.challenges = new Map();
    if (!(t.defeatStatuses instanceof Map)) t.defeatStatuses = new Map();
    if (!(t.seasonCounters instanceof Map)) t.seasonCounters = new Map();
    if (!(t.crownTenure instanceof Map)) t.crownTenure = new Map();
    return t;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function hasTitle(world: GameWorldState, titleId: string, subjectId: string): boolean {
    const t = ensureTitleState(world);
    return t.ledger.some(a => a.titleId === titleId && a.subjectId === subjectId);
}

/** Any award of this title, to anyone, ever (uniqueness check). */
export function titleEverAwarded(world: GameWorldState, titleId: string): boolean {
    const t = ensureTitleState(world);
    return t.ledger.some(a => a.titleId === titleId);
}

export function titlesOf(world: GameWorldState, subjectId: string): TitleAward[] {
    const t = ensureTitleState(world);
    return t.ledger.filter(a => a.subjectId === subjectId);
}

// ─── Awarding ─────────────────────────────────────────────────────────────────

/**
 * Award an earned title. Dedup rules:
 *   - unknown titleId → no-op (warn)
 *   - 'unique' titles: one award galaxy-wide, ever
 *   - 'per_season' titles: one per subject per season
 *   - otherwise: once per subject
 * Returns the award if newly granted, null if deduplicated.
 */
export function awardTitle(
    world: GameWorldState,
    titleId: string,
    subjectId: string,
    opts: { seasonNumber?: number } = {}
): TitleAward | null {
    const def = TITLE_CATALOG[titleId];
    if (!def) {
        console.warn(`[Titles] Unknown titleId "${titleId}" — no award.`);
        return null;
    }
    const t = ensureTitleState(world);
    const seasonNumber = opts.seasonNumber ?? world.activeSeason?.seasonNumber ?? 0;

    if (def.uniqueness === 'unique') {
        if (titleEverAwarded(world, titleId)) return null;
    } else if (def.uniqueness === 'per_season') {
        const already = t.ledger.some(a =>
            a.titleId === titleId && a.subjectId === subjectId && a.seasonNumber === seasonNumber);
        if (already) return null;
    } else if (hasTitle(world, titleId, subjectId)) {
        return null;
    }

    const award: TitleAward = {
        titleId,
        subjectId,
        awardedAtSeconds: world.nowSeconds,
        seasonNumber,
        lostAtSeconds: null,
        ratified: def.kind === 'earned', // earned titles are permanent on award
    };
    t.ledger.push(award);

    const disgrace = def.valence === 'disgrace';
    fireNotification({
        id: def.uniqueness === 'per_season'
            ? `title-${titleId}-${subjectId}-s${seasonNumber}`
            : `title-${titleId}-${subjectId}`,
        factionId: 'all',
        category: 'system',
        priority: 'urgent',
        title: disgrace ? 'A NAME IS RECORDED'
            : def.uniqueness === 'unique' ? 'GALACTIC FIRST'
            : 'TITLE AWARDED',
        body: disgrace
            ? `${subjectId} will be remembered as "${def.name}": ${def.description}`
            : `${subjectId} has earned "${def.name}": ${def.description}`,
        createdAt: new Date(world.nowSeconds * 1000).toISOString(),
        read: false,
        linkToTab: 'dashboard',
        payload: { titleId, subjectId, seasonNumber, valence: def.valence ?? 'honour' },
    });

    return award;
}

// ─── Trigger buffer ───────────────────────────────────────────────────────────
// Mirrors the chronicle pattern (docs/narrative-system/README.md): systems call
// notifyTitleTrigger synchronously at their announcement sites; the tick drains
// the buffer. No I/O at the call site, no ordering dependency inside a tick.

interface PendingTrigger {
    triggerId: string;
    subjectId: string;
}

const _triggerBuffer: PendingTrigger[] = [];

/** Safe from any server-side context. A trigger nothing consumes is a no-op. */
export function notifyTitleTrigger(triggerId: string, subjectId: string): void {
    _triggerBuffer.push({ triggerId, subjectId });
}

/** Tick-time: award every catalog title whose triggerId matches a buffered event. */
export function drainTitleTriggers(world: GameWorldState): TitleAward[] {
    if (_triggerBuffer.length === 0) return [];
    const pending = _triggerBuffer.splice(0, _triggerBuffer.length);
    const awarded: TitleAward[] = [];
    for (const { triggerId, subjectId } of pending) {
        for (const def of Object.values(TITLE_CATALOG)) {
            if (def.triggerId !== triggerId) continue;
            const award = awardTitle(world, def.id, subjectId);
            if (award) awarded.push(award);
        }
    }
    return awarded;
}

// ─── Milestone firsts ─────────────────────────────────────────────────────────
// Threshold logic ported from MilestoneService.checkMilestones; the registry's
// uniqueness rule replaces the world.milestones map.

export function checkMilestoneFirsts(world: GameWorldState): TitleAward[] {
    const awarded: TitleAward[] = [];

    for (const factionId of world.economy.factions.keys()) {
        if (factionId === 'faction-pirates' || factionId === 'faction-neutral') continue;

        const techCount = world.tech.get(factionId)?.unlockedTechIds?.length || 0;
        const credits = world.economy.factions.get(factionId)?.reserves[Resource.CREDITS] || 0;
        const systems = Array.from(world.movement.systems.values())
            .filter(s => s.ownerFactionId === factionId).length;

        let maxFleetPower = 0;
        for (const fleet of world.movement.fleets.values()) {
            if (fleet.factionId === factionId) {
                const p = (fleet.basePower || 0) * (fleet.strength || 1);
                if (p > maxFleetPower) maxFleetPower = p;
            }
        }

        for (const def of MILESTONE_FIRSTS) {
            let achieved = false;
            if (def.type === 'systems' && systems >= def.threshold) achieved = true;
            if (def.type === 'credits' && credits >= def.threshold) achieved = true;
            if (def.type === 'tech' && techCount >= def.threshold) achieved = true;
            if (def.type === 'power' && maxFleetPower >= def.threshold) achieved = true;

            if (achieved) {
                const award = awardTitle(world, def.titleId, factionId);
                if (award) awarded.push(award);
            }
        }
    }

    return awarded;
}

// ─── Legacy migration ─────────────────────────────────────────────────────────

/**
 * Convert entries in the retired world.milestones map into ledger awards, then
 * clear the map. Original wall-clock unlockedAt is unrecoverable as sim time;
 * migrated awards are stamped with the current sim clock. Idempotent.
 */
export function migrateLegacyMilestones(world: GameWorldState): void {
    if (!(world.milestones instanceof Map) || world.milestones.size === 0) return;
    for (const def of MILESTONE_FIRSTS) {
        const legacy = world.milestones.get(def.legacyId);
        if (legacy) awardTitle(world, def.titleId, legacy.factionId);
    }
    world.milestones.clear();
}

// ─── Defeat-status latch ──────────────────────────────────────────────────────

/**
 * Record a faction's DefeatManager status. Returns true only on a *transition*
 * (including recovery to ALIVE) — the caller fires its one event then; repeat
 * statuses return false and must stay silent.
 */
export function latchDefeatStatus(
    world: GameWorldState,
    factionId: string,
    status: DefeatStatusLatch
): boolean {
    const t = ensureTitleState(world);
    const prev = t.defeatStatuses.get(factionId) ?? 'ALIVE';
    if (prev === status) return false;
    t.defeatStatuses.set(factionId, status);
    return true;
}

// ─── Tick entry point ─────────────────────────────────────────────────────────

/** Per-tick title work. Called from step20 in the tick processor. */
export function tickTitles(world: GameWorldState): void {
    ensureTitleState(world);
    migrateLegacyMilestones(world);
    // Counters first: a kill recorded this tick must be visible to the crown
    // that measures kills this tick.
    drainMetricCounters(world);
    drainTitleTriggers(world);
    checkMilestoneFirsts(world);
    evaluateCrowns(world);
}
