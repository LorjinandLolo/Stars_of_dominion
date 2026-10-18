// lib/espionage/defence-sabotage.ts
// Stars of Dominion — knocking a world's defences out before the fleet
// arrives, and getting them back.
//
// Three sabotage operations (operation-catalog.ts) put defences in one
// system out of action for a while:
//
//   disable_orbital_defences  orbital defence structures go offline: the
//                             orbit falls faster and they add nothing to a
//                             space battle (slot state 'offline').
//   blind_shield              shield generators (surface) and orbital shields
//                             go dark: bombardment gets through, and the
//                             defender loses the shield strongpoint.
//   spike_guns                the surface Orbital Defense Platforms and an
//                             outpost's Defence Batteries are put out.
//
// Surface buildings are ruined with `sabotage.restoreAt` set, which every
// system already honours; orbital slots go 'offline'; outpost batteries are
// knocked out for shifts. They all come back by themselves when the time is
// up, or at once when the owner's counter-intelligence runs Restore
// Defences in that system (restoreSabotage).
//
// Pure apart from the world it is handed; no lib/db.

import type { GameWorldState } from '../game-world-state';
import { ORBITAL_STRUCTURE_BY_ID } from '../../data/orbital-structures';
import { SHIFT_SIM_SECONDS } from '../outposts/outpost-catalog';

export type DefenceSabotageKind = 'orbital' | 'shield' | 'guns';

/** Surface buildings each kind puts out. */
const SURFACE_TARGETS: Record<DefenceSabotageKind, string[]> = {
    orbital: [],
    shield: ['shield_generator'],
    guns: ['orbital_defense_platform'],
};
/**
 * Orbital structures each kind puts offline: the ones whose job is defence.
 * Trade, research and sensor stations carry a little defence too, but a
 * defence saboteur does not shut down a trade station.
 */
const ORBITAL_TARGETS: Record<DefenceSabotageKind, string[]> = {
    orbital: ['military_station', 'fortress_station', 'orbital_defense_network'],
    shield: ['shield_projector_array'],
    guns: [],
};
/** Outpost modules each kind knocks out. */
const OUTPOST_TARGETS: Record<DefenceSabotageKind, string[]> = {
    orbital: [],
    shield: [],
    guns: ['battery'],
};

export interface SabotageReport {
    planetId: string;
    planetName: string;
    /** Names of what went out, for notifications and the op narrative. */
    hit: string[];
}

/**
 * Put `kind` defences of `targetFactionId` in `systemId` out for
 * `durationSeconds`. Returns what was hit, per world (empty: nothing there).
 */
export function sabotageDefences(
    world: GameWorldState,
    targetFactionId: string,
    systemId: string,
    kind: DefenceSabotageKind,
    durationSeconds: number,
): SabotageReport[] {
    const until = world.nowSeconds + durationSeconds;
    const out: SabotageReport[] = [];
    for (const planet of world.construction.planets.values() as Iterable<any>) {
        if (planet.ownerId !== targetFactionId || planet.systemId !== systemId) continue;
        const hit: string[] = [];

        for (const tile of planet.tiles ?? []) {
            if (tile.constructionState !== 'active' || !SURFACE_TARGETS[kind].includes(tile.buildingId)) continue;
            tile.constructionState = 'ruined';
            tile.constructionCompleteAt = null;
            tile.sabotage = { restoreAt: until };
            hit.push(String(tile.buildingId).replace(/_/g, ' '));
        }

        for (const slot of planet.orbital?.slots ?? []) {
            if ((slot.state !== 'active' && slot.state !== 'damaged') || !slot.structureId) continue;
            if (!ORBITAL_TARGETS[kind].includes(slot.structureId)) continue;
            slot.stateBeforeOffline = slot.state;
            slot.state = 'offline';
            slot.offlineUntil = until;
            hit.push(ORBITAL_STRUCTURE_BY_ID[slot.structureId]?.name ?? slot.structureId);
        }

        const outpost = planet.outpost;
        if (outpost && OUTPOST_TARGETS[kind].length) {
            const shifts = Math.max(1, Math.ceil(durationSeconds / SHIFT_SIM_SECONDS));
            for (const cell of outpost.cells ?? []) {
                if (!OUTPOST_TARGETS[kind].includes(cell.module) || cell.buildDoneShift !== undefined) continue;
                cell.downUntilShift = Math.max(cell.downUntilShift ?? 0, outpost.shift + shifts);
                cell.sabotaged = true;
                hit.push('Defence Battery');
            }
        }
        if (hit.length) out.push({ planetId: planet.id, planetName: planet.name ?? planet.id, hit });
    }
    return out;
}

/** What is still out from sabotage, by system, for one empire's planets (client-safe: takes any planet list). */
export function sabotageBySystem(planets: Iterable<any>, factionId: string): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const planet of planets) {
        if (planet?.ownerId !== factionId) continue;
        const names: string[] = [];
        for (const tile of planet.tiles ?? []) if (tile.sabotage && tile.constructionState === 'ruined') names.push(String(tile.buildingId).replace(/_/g, ' '));
        for (const slot of planet.orbital?.slots ?? []) if (slot.state === 'offline') names.push(ORBITAL_STRUCTURE_BY_ID[slot.structureId]?.name ?? String(slot.structureId));
        for (const cell of planet.outpost?.cells ?? []) if (cell.sabotaged && (cell.downUntilShift ?? 0) > planet.outpost.shift) names.push('Defence Battery');
        if (names.length) out.set(planet.systemId, [...(out.get(planet.systemId) ?? []), ...names]);
    }
    return out;
}

/** Everything sabotaged in this empire's `systemId`, still out. */
export function sabotagedIn(world: GameWorldState, factionId: string, systemId: string): string[] {
    return sabotageBySystem(world.construction.planets.values(), factionId).get(systemId) ?? [];
}

/** Bring back whatever was sabotaged on one world (all of it, or only what is due). */
function restorePlanet(planet: any, nowSeconds: number, onlyDue: boolean): number {
    let n = 0;
    for (const tile of planet.tiles ?? []) {
        if (!tile.sabotage) continue;
        if (onlyDue && tile.sabotage.restoreAt > nowSeconds) continue;
        // Only what sabotage did: a building ruined in battle since stays ruined.
        if (tile.constructionState === 'ruined') { tile.constructionState = 'active'; n++; }
        delete tile.sabotage;
    }
    for (const slot of planet.orbital?.slots ?? []) {
        if (slot.state !== 'offline') continue;
        if (onlyDue && (slot.offlineUntil ?? 0) > nowSeconds) continue;
        slot.state = slot.stateBeforeOffline ?? 'active';
        delete slot.stateBeforeOffline;
        delete slot.offlineUntil;
        n++;
    }
    const outpost = planet.outpost;
    for (const cell of outpost?.cells ?? []) {
        if (!cell.sabotaged) continue;
        if (onlyDue && (cell.downUntilShift ?? 0) > outpost.shift) continue;
        if ((cell.downUntilShift ?? 0) > outpost.shift) n++;
        delete cell.downUntilShift;
        delete cell.sabotaged;
    }
    return n;
}

/** Counter-intelligence's Restore Defences: everything sabotaged in this system comes back now. */
export function restoreSabotage(world: GameWorldState, factionId: string, systemId: string): number {
    let n = 0;
    for (const planet of world.construction.planets.values() as Iterable<any>) {
        if (planet.ownerId === factionId && planet.systemId === systemId) n += restorePlanet(planet, world.nowSeconds, false);
    }
    return n;
}

/** Every worker cycle: sabotage whose time is up wears off by itself. */
export function tickSabotageRecovery(world: GameWorldState): void {
    for (const planet of world.construction.planets.values() as Iterable<any>) restorePlanet(planet, world.nowSeconds, true);
}
