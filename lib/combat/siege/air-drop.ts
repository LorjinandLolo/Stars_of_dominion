// lib/combat/siege/air-drop.ts
// Stars of Dominion — vertical envelopment.
//
// Infantry and armour come ashore at the beachhead and fight their way in.
// Airborne and Special Ops do not have to: from a fleet over a world under
// siege, they can be dropped onto ANY district, behind the line, onto the
// shield generator, the gun platform, the barracks or the capital itself.
// They land where the enemy is, so they fight the moment the next cycle
// resolves, and an objective they hold long enough falls (sappers ruin a
// shield or fortress after SAPPER_CYCLES; the capital falls after
// CAPITAL_FALL_CYCLES). The guns below put flak on the drop like any other
// landing (lib/combat/surface-guns.ts).
//
// The order is MIL_AIR_DROP (scripts/game-loop.ts). Pure; client-safe.

import type { PlanetSurface } from '../../planet-surface/types';
import type { DistrictWarState } from './siege-types';
import type { Strongpoint, StrongpointKind } from './strongpoints';
import { isPassable, controllerOf } from './district-front';

/** The only troops that can be dropped behind the line. */
export const AIR_DROP_UNITS = ['AIRBORNE', 'SPECIAL_OPS'] as const;

/** Every Airborne and Special Ops soldier aboard this army. */
export function airDropForce(army: { composition?: Record<string, number> } | null | undefined): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of AIR_DROP_UNITS) {
        const n = Math.max(0, Math.floor(Number(army?.composition?.[t]) || 0));
        if (n > 0) out[t] = n;
    }
    return out;
}

export const airDropMen = (force: Record<string, number>) => Object.values(force).reduce((s, n) => s + n, 0);

/** Strongpoints worth dropping on, most valuable first. */
const DROP_PRIORITY: StrongpointKind[] = ['shield', 'orbital_defense', 'capital', 'fortress', 'barracks', 'airbase', 'bunker', 'hall'];

export const DROP_LABEL: Partial<Record<StrongpointKind, string>> = {
    shield: 'Shield generator', orbital_defense: 'Gun platform', capital: 'Capital', fortress: 'Fortress',
    barracks: 'Barracks', airbase: 'Airbase', bunker: 'Munitions bunker', hall: 'Hall of Triumphs',
};

/** The defender's live strongpoints an air drop can go for (passable ground the defender holds). */
export function airDropTargets(surface: PlanetSurface, war: DistrictWarState): Strongpoint[] {
    const seen = new Set<number>();
    return (war.strongpoints ?? [])
        .filter(p => p.active && p.holder === 'defender' && DROP_PRIORITY.includes(p.kind))
        .filter(p => isPassable(surface.sectors[p.sectorIndex]) && controllerOf(war, p.sectorIndex) === 'defender')
        .sort((a, b) => DROP_PRIORITY.indexOf(a.kind) - DROP_PRIORITY.indexOf(b.kind))
        .filter(p => !seen.has(p.sectorIndex) && (seen.add(p.sectorIndex), true));
}

/** Whether a drop can land on this district at all: any land, not open sea. */
export function canDropOn(surface: PlanetSurface, sectorIndex: number): boolean {
    const s = surface.sectors[sectorIndex];
    return !!s && isPassable(s);
}
