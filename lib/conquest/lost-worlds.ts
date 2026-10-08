/**
 * lib/conquest/lost-worlds.ts
 * Which worlds each empire has lost, and for how long that is remembered
 * (Item 14a). Planets carry only their current owner; this ledger keeps who
 * held a world before, so a fallen empire's people know where they belong.
 *
 * The memory fades. Constantinople, Alexandria, Lugdunum and Londinium were
 * conquered places before they were the Roman Empire: after LOST_WORLD_MEMORY
 * a conquered world is simply part of the empire that holds it. A world won
 * back by the empire that lost it clears the record at once.
 *
 * Detection is a diff of planet owners once a strategic tick, so it catches
 * every way a world changes hands (conquest, secession, a rogue company,
 * cession) without hooks in each of them. Plain data, no imports: safe for
 * the worker, probes and the page alike.
 */

/** How long a lost world is remembered, in sim seconds (about eight real days, a third of a season). */
export const LOST_WORLD_MEMORY_SECONDS = 120 * 86400;

export interface LostWorld {
    planetId: string;
    systemId: string;
    /** The empire that lost it. */
    lostBy: string;
    /** Who held it right after. */
    takenBy: string;
    lostAtSeconds: number;
}

export interface LostWorldLedger {
    /** planetId → owner when last looked at. */
    lastOwners: Record<string, string>;
    /** `${planetId}|${lostBy}` → the record. */
    lost: Record<string, LostWorld>;
}

function ledgerOf(world: any): LostWorldLedger {
    const l = world.lostWorlds;
    if (l && typeof l === 'object' && l.lastOwners && l.lost) return l;
    world.lostWorlds = { lastOwners: {}, lost: {} };
    return world.lostWorlds;
}

function planetsOf(world: any): any[] {
    const p = world?.construction?.planets;
    return p && typeof p.values === 'function' ? [...p.values()] : [];
}

/**
 * Look at every world's owner and record the ones that changed hands since
 * last time; forget what has faded. The first call only takes a baseline.
 * Returns the losses recorded this call.
 */
export function tickLostWorlds(world: any): LostWorld[] {
    const ledger = ledgerOf(world);
    const now = Number(world.nowSeconds ?? 0);
    const firstLook = Object.keys(ledger.lastOwners).length === 0;
    const recorded: LostWorld[] = [];

    for (const planet of planetsOf(world)) {
        const owner: string | null = planet?.ownerId ?? null;
        const before = ledger.lastOwners[planet.id] ?? null;
        if (owner) ledger.lastOwners[planet.id] = owner;
        else delete ledger.lastOwners[planet.id];
        if (firstLook || !before || before === owner) continue;

        // Won back: the old owner's claim is settled.
        if (owner) delete ledger.lost[`${planet.id}|${owner}`];
        // Abandoned worlds (no new owner) are not conquests.
        if (!owner) continue;
        const record: LostWorld = { planetId: planet.id, systemId: planet.systemId, lostBy: before, takenBy: owner, lostAtSeconds: now };
        ledger.lost[`${planet.id}|${before}`] = record;
        recorded.push(record);
    }

    for (const [key, r] of Object.entries(ledger.lost)) {
        if (now - r.lostAtSeconds > LOST_WORLD_MEMORY_SECONDS) delete ledger.lost[key];
    }
    return recorded;
}

/** Worlds this empire lost that still remember it, newest first. */
export function rememberedLossesOf(world: any, factionId: string): LostWorld[] {
    const ledger = ledgerOf(world);
    const now = Number(world.nowSeconds ?? 0);
    return Object.values(ledger.lost)
        .filter(r => r.lostBy === factionId && now - r.lostAtSeconds <= LOST_WORLD_MEMORY_SECONDS)
        .sort((a, b) => b.lostAtSeconds - a.lostAtSeconds);
}
