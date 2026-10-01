// lib/comeback/comeback-service.ts
// Stars of Dominion — the comeback path, on a real empire (casual-play Item 7,
// decision 4: comeback perks are for a player whose empire was destroyed and
// who takes a breakaway state — not for a late joiner).
//
// lib/comeback/data.ts and manager.ts were written long ago as a standalone
// model nobody called. This file is the bridge: it keeps one record per
// comeback empire on the world (`world.comeback`, carried by the owner's shard)
// and gives the two places that read a perk — the ambush opening round
// (lib/combat/combat-manager.ts) and trade under blockade
// (lib/economy/economy-service.ts) — one question each to ask.
//
// Only one defeat ever happens in this game: an empire holding no worlds
// (DefeatManager's ELIMINATED). That is a military defeat, so the path is
// Guerrilla Doctrine. The economic path in data.ts has no trigger here and is
// deliberately not reachable.

import type { DefeatType, PlayerComebackState } from '@/types/comeback';
import { COMEBACK_PATHS } from './data';
import { ComebackManager } from './manager';

export interface ComebackRecord extends PlayerComebackState {
    factionId: string;
    /** The empire that fell. */
    fromFactionId: string;
}

/** Adaptation earned per strategic tick survived (one tick = 24 real minutes). */
export const ADAPTATION_XP_PER_TICK = 5;

function ensure(world: any): Map<string, ComebackRecord> {
    if (!(world.comeback instanceof Map)) world.comeback = new Map();
    return world.comeback;
}

export function comebackOf(world: any, factionId: string): ComebackRecord | null {
    return world?.comeback instanceof Map ? (world.comeback.get(factionId) ?? null) : null;
}

export function hasPerk(world: any, factionId: string, perkId: string): boolean {
    return !!comebackOf(world, factionId)?.unlocked_perks.includes(perkId);
}

/** Open the path for a fallen player's new empire. Tier 1 is theirs at once. */
export function startComeback(
    world: any,
    factionId: string,
    fromFactionId: string,
    defeatType: DefeatType = 'MILITARY_DEFEAT',
): ComebackRecord | null {
    const path = ComebackManager.getAvailablePaths(defeatType)[0];
    if (!path) return null;
    const at = new Date(Number(world?.nowSeconds ?? 0) * 1000).toISOString();
    const base = ComebackManager.startPath({
        ...ComebackManager.initializeState(),
        active_defeats: [{ type: defeatType, triggered_at: at, severity: 4 }],
        history: [{ defeat_id: defeatType, timestamp: at }],
    }, path.id);
    const record: ComebackRecord = { ...base, factionId, fromFactionId };
    ensure(world).set(factionId, record);
    return record;
}

/**
 * Per strategic tick: every comeback empire still standing learns. Returns the
 * perks unlocked this tick, so the caller can tell the player.
 */
export function tickComeback(world: any): Array<{ factionId: string; perkIds: string[] }> {
    if (!(world?.comeback instanceof Map)) return [];
    const unlocked: Array<{ factionId: string; perkIds: string[] }> = [];
    for (const [factionId, record] of world.comeback as Map<string, ComebackRecord>) {
        // A comeback empire that has itself been destroyed stops learning.
        let holdsWorld = false;
        for (const planet of world.construction?.planets?.values?.() ?? []) {
            if (planet?.ownerId === factionId) { holdsWorld = true; break; }
        }
        if (!holdsWorld) continue;
        const next = ComebackManager.grantXp(record, ADAPTATION_XP_PER_TICK);
        const fresh = next.unlocked_perks.filter(p => !record.unlocked_perks.includes(p));
        world.comeback.set(factionId, { ...record, ...next });
        if (fresh.length) unlocked.push({ factionId, perkIds: fresh });
    }
    return unlocked;
}

export function perkName(perkId: string): string {
    for (const path of Object.values(COMEBACK_PATHS)) {
        const perk = path.perks.find(p => p.id === perkId);
        if (perk) return perk.name;
    }
    return perkId;
}

// ─── The two effects ──────────────────────────────────────────────────────────

/**
 * Shadow Strike: an ambush sprung from the belt by a comeback empire leaves
 * its victim at this extra organization factor (on top of the normal ambush
 * penalty) — the opening round lands twice as hard. 1 = no perk.
 */
export function ambushOrganizationBonus(world: any, ambusherFactionId: string): number {
    return hasPerk(world, ambusherFactionId, 'shadow_strike') ? 0.5 : 1;
}

/**
 * Cell Network: a blockade never closes a comeback empire's trade entirely.
 * The floor on trade throughput under blockade for this faction (0 = no perk).
 */
export function blockadeThroughputFloor(world: any, factionId: string | null | undefined): number {
    if (!factionId) return 0;
    const perk = COMEBACK_PATHS.GUERRILLA_DOCTRINE.perks.find(p => p.id === 'cell_network');
    return hasPerk(world, factionId, 'cell_network') ? Number(perk?.effect_config?.blockade_pierce ?? 0.2) : 0;
}
