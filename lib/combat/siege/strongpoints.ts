// lib/combat/siege/strongpoints.ts
//
// The districts worth holding. A planetary battle is not sixty-four equal
// squares: it is the capital, the passes, the shield generator, the barracks
// that keep feeding men into the line. Each strongpoint has a live effect
// while its side holds it — the shield blocks orbital fire and lets friendly
// transports land under it, the barracks is where recruits muster, the
// fortress and the passes are where men dig in deepest — and loses that
// effect the moment the enemy takes it, which is what makes them objectives.
//
// Pure. The worker recomputes the list every cycle from the surface and the
// planet's tiles (ruins and captures both change it) and stores it on
// DistrictWarState.strongpoints for the client.

import type { PlanetSurface, SurfaceSector } from '../../planet-surface/types';
import { computeSectorOccupancy } from '../../planet-surface/occupancy';
import { BUILDINGS } from '../../../data/buildings';
import type { DistrictController, DistrictWarState } from './siege-types';
import { controllerOf, CAPITAL_SECTOR } from './district-front';

export type StrongpointKind =
    | 'capital'
    | 'chokepoint'
    | 'shield'
    | 'barracks'
    | 'airbase'
    | 'orbital_defense'
    | 'hall'
    | 'fortress'
    | 'bunker';

export interface Strongpoint {
    sectorIndex: number;
    kind: StrongpointKind;
    /** The building that makes it one; absent for the capital and terrain chokepoints. */
    buildingId?: string;
    tileId?: string;
    holder: DistrictController;
    /** False once the building is ruined (or still under construction). */
    active: boolean;
}

/** Buildings that turn their district into a strongpoint. */
export const STRONGPOINT_BUILDINGS: Record<string, StrongpointKind> = {
    shield_generator: 'shield',
    barracks: 'barracks',
    tank_foundry: 'barracks',
    airbase: 'airbase',
    orbital_defense_platform: 'orbital_defense',
    hall_of_triumphs: 'hall',
    fortress: 'fortress',
    munitions_bunker: 'bunker',
};

/** Extra entrenchment cap a held strongpoint gives its own district. */
export const STRONGPOINT_ENTRENCHMENT: Record<StrongpointKind, number> = {
    fortress: 30,
    chokepoint: 10,
    capital: 10,
    bunker: 10,
    shield: 5,
    barracks: 5,
    airbase: 5,
    orbital_defense: 5,
    hall: 5,
};
/** A fortress also hardens the districts around it. */
export const FORTRESS_NEIGHBOUR_ENTRENCHMENT = 15;

/** Defender morale never falls below this while a Hall of Triumphs stands. */
export const DEFENDER_MORALE_FLOOR_HALL = 35;

/**
 * Militia levy: while the defender holds an active barracks or fortress the
 * population keeps sending men. Per strongpoint per cycle, capped per cycle
 * and per siege. Weak troops (UNIT_POWER 0.6) — but a line that is still
 * being fed is a line that can wait for the fleet.
 */
export const LEVY_PER_CYCLE = 50;
export const LEVY_MAX_PER_CYCLE = 150;
export const LEVY_MAX_TOTAL = 3000;
export const LEVY_KINDS: StrongpointKind[] = ['barracks', 'fortress'];

/**
 * Cycles the invader must hold a shield or fortress district before the
 * sappers finish and the building is ruined. One is not enough: a fast
 * counter-attack saves it.
 */
export const SAPPER_CYCLES = 2;
export const SAPPER_KINDS: StrongpointKind[] = ['shield', 'fortress'];

/** Where a strongpoint's effects apply: when its holder is this side and it is not ruined. */
export const heldBy = (points: Strongpoint[], kind: StrongpointKind, side: DistrictController): boolean =>
    points.some(p => p.kind === kind && p.holder === side && p.active);

/** Sector indexes of a side's active strongpoints of the given kinds. */
export const strongpointSectors = (points: Strongpoint[], side: DistrictController, kinds?: StrongpointKind[]): number[] =>
    points.filter(p => p.holder === side && p.active && (!kinds || kinds.includes(p.kind))).map(p => p.sectorIndex);

/**
 * The strongpoints on this world right now: the capital, every terrain
 * chokepoint, and every district whose building is in STRONGPOINT_BUILDINGS.
 * A district can carry a building AND be a chokepoint; both entries are kept
 * because their effects stack.
 */
export function computeStrongpoints(
    surface: PlanetSurface,
    planet: { tiles?: any[]; buildQueue?: any[] },
    war: Pick<DistrictWarState, 'control'>,
): Strongpoint[] {
    const out: Strongpoint[] = [];
    const holderOf = (idx: number) => controllerOf(war as DistrictWarState, idx);

    const capital = surface.sectors[CAPITAL_SECTOR];
    if (capital && capital.terrain !== 'ocean') {
        out.push({ sectorIndex: CAPITAL_SECTOR, kind: 'capital', holder: holderOf(CAPITAL_SECTOR), active: true });
    }
    for (const s of surface.sectors) {
        if (s.chokepoint && s.terrain !== 'ocean') {
            out.push({ sectorIndex: s.index, kind: 'chokepoint', holder: holderOf(s.index), active: true });
        }
    }
    const occupancy = computeSectorOccupancy(planet as any, surface);
    for (const [sectorIndex, occ] of occupancy) {
        const kind = STRONGPOINT_BUILDINGS[occ.buildingId];
        if (!kind) continue;
        if (occ.optimistic) continue;
        out.push({
            sectorIndex,
            kind,
            buildingId: occ.buildingId,
            tileId: occ.tileId,
            holder: holderOf(sectorIndex),
            active: occ.state === 'active',
        });
    }
    return out.sort((a, b) => a.sectorIndex - b.sectorIndex);
}

/**
 * Entrenchment cap bonus per district from the strongpoints a side holds.
 * Only ACTIVE strongpoints count, and only for the side that holds them —
 * an invader standing in a captured fortress has its works facing the wrong
 * way (district-battle already keeps 40% of the entrenchment on capture).
 */
export function entrenchmentBonus(
    surface: PlanetSurface,
    points: Strongpoint[],
): Record<number, number> {
    const bonus: Record<number, number> = {};
    const add = (idx: number, n: number) => { bonus[idx] = (bonus[idx] ?? 0) + n; };
    for (const p of points) {
        if (!p.active) continue;
        add(p.sectorIndex, STRONGPOINT_ENTRENCHMENT[p.kind]);
        if (p.kind === 'fortress') {
            const sec: SurfaceSector | undefined = surface.sectors[p.sectorIndex];
            for (const n of sec?.neighbors ?? []) add(n, FORTRESS_NEIGHBOUR_ENTRENCHMENT);
        }
    }
    return bonus;
}

/**
 * The planet's fortification level, 0-10: the sum of its active buildings'
 * `fortification` effects plus one per active orbital defence platform or
 * shield generator. Replaces the hardcoded 2 every garrison used to carry.
 */
export function fortificationLevelFor(planet: { tiles?: any[] }): number {
    let level = 0;
    for (const t of planet.tiles ?? []) {
        if (!t?.buildingId || t.constructionState !== 'active') continue;
        const def = BUILDINGS.find(b => b.id === t.buildingId);
        if (!def) continue;
        for (const e of def.effects ?? []) {
            if (e.type === 'fortification') level += Number(e.value) || 0;
        }
        if (t.buildingId === 'orbital_defense_platform' || t.buildingId === 'shield_generator') level += 1;
    }
    // An outpost's bunkers dig its defenders in (lib/outposts): depth, not men.
    for (const c of (planet as any).outpost?.cells ?? []) {
        if (c?.module === 'bunker' && c.buildDoneShift === undefined) level += 2;
    }
    return Math.max(0, Math.min(10, Math.round(level)));
}
