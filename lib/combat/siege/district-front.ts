// lib/combat/siege/district-front.ts
//
// The ground war, laid out on the planet's 64-district surface board.
// Pure functions over the deterministic surface (lib/planet-surface) plus the
// siege's district control map — the worker owns the mutations, the client
// re-derives the same front line for display.

import type { PlanetSurface, SurfaceSector, TerrainType } from '../../planet-surface/types';
import type { DistrictWarState, DistrictController, GroundSiegeState } from './siege-types';

/** The capital district — losing it is losing the war. */
export const CAPITAL_SECTOR = 0;

/** Terrain an invasion cannot land on or fight through conventionally. */
const IMPASSABLE: TerrainType[] = ['ocean'];

/** How hard a district is to take, before entrenchment. */
const TERRAIN_DEFENSE: Record<TerrainType, number> = {
    mountains: 1.9,
    volcanic: 1.7,
    urban: 1.8,   // urban warfare grinds attackers down
    jungle: 1.5,
    forest: 1.35,
    frozen: 1.25,
    toxic: 1.3,
    ruins: 1.2,
    desert: 1.0,
    plains: 0.9,  // open ground favours the attacker
    ocean: 99,
};

export const isPassable = (s: SurfaceSector) => !IMPASSABLE.includes(s.terrain);

/** Symmetric adjacency over the surface's nearest-neighbour graph. */
export function buildAdjacency(surface: PlanetSurface): number[][] {
    const adj: Set<number>[] = surface.sectors.map(() => new Set<number>());
    for (const sec of surface.sectors) {
        for (const n of sec.neighbors) {
            adj[sec.index].add(n);
            adj[n].add(sec.index);
        }
    }
    return adj.map(s => Array.from(s));
}

export const controllerOf = (war: DistrictWarState, idx: number): DistrictController =>
    war.control[idx] ?? 'defender';

/**
 * Chooses the beachhead. Conventional landings come down on the outer rings,
 * on open ground, away from the capital's guns — unless the attacker names a
 * sector (a deliberate deep drop next to an objective).
 */
export function selectLandingZones(
    surface: PlanetSurface,
    preferred?: number | null,
    count = 2,
): number[] {
    const candidates = surface.sectors.filter(isPassable);
    if (!candidates.length) return [];

    if (Number.isInteger(preferred as number)) {
        const want = surface.sectors[preferred as number];
        if (want && isPassable(want)) {
            const extra = candidates
                .filter(s => s.index !== want.index && want.neighbors.includes(s.index))
                .slice(0, Math.max(0, count - 1))
                .map(s => s.index);
            return [want.index, ...extra];
        }
    }

    // Score: outer rings are reachable from orbit, open terrain is landable,
    // chokepoints and the capital's neighbourhood are murder to drop into.
    const scored = candidates
        .map(s => ({
            index: s.index,
            score:
                s.ring * 1.6
                - TERRAIN_DEFENSE[s.terrain] * 2
                - (s.chokepoint ? 3 : 0)
                + (s.terrain === 'plains' || s.terrain === 'desert' ? 1.5 : 0),
        }))
        .sort((a, b) => b.score - a.score);

    const picked: number[] = [];
    for (const c of scored) {
        if (picked.length >= count) break;
        // Keep the beachhead contiguous-ish: first pick is free, later picks
        // must touch an existing landing zone.
        if (!picked.length || picked.some(p => surface.sectors[p].neighbors.includes(c.index)
            || surface.sectors[c.index].neighbors.includes(p))) {
            picked.push(c.index);
        }
    }
    return picked.length ? picked : [scored[0].index];
}

/** Fresh district war state for a new invasion. */
export function initDistrictWar(
    surface: PlanetSurface,
    fortificationLevel: number,
    preferredLanding?: number | null,
): DistrictWarState {
    const landingZones = selectLandingZones(surface, preferredLanding);
    const control: Record<number, DistrictController> = {};
    for (const lz of landingZones) control[lz] = 'attacker';

    // Entrenchment: terrain hardness plus the planet's fortification level,
    // concentrated toward the core where the defences were built.
    const entrenchment: Record<number, number> = {};
    for (const s of surface.sectors) {
        if (!isPassable(s)) continue;
        const coreness = 1 - s.ring / 7; // 1 at the capital, 0 at the rim
        entrenchment[s.index] = Math.round(
            Math.min(100,
                TERRAIN_DEFENSE[s.terrain] * 18
                + coreness * 25
                + fortificationLevel * 4
                + (s.chokepoint ? 15 : 0)
            )
        );
    }

    return { control, landingZones, contested: [], entrenchment };
}

/**
 * The front line: defender-held districts that touch attacker-held ground.
 * These are where a cycle's fighting resolves.
 */
export function computeFront(surface: PlanetSurface, war: DistrictWarState, adj?: number[][]): number[] {
    const adjacency = adj ?? buildAdjacency(surface);
    const front: number[] = [];
    for (const sec of surface.sectors) {
        if (!isPassable(sec)) continue;
        if (controllerOf(war, sec.index) !== 'defender') continue;
        if (adjacency[sec.index].some(n => controllerOf(war, n) === 'attacker')) {
            front.push(sec.index);
        }
    }
    return front;
}

/** Districts the attacker holds that touch defender ground — his exposed edge. */
export function computeAttackerEdge(surface: PlanetSurface, war: DistrictWarState, adj?: number[][]): number[] {
    const adjacency = adj ?? buildAdjacency(surface);
    return surface.sectors
        .filter(s => isPassable(s)
            && controllerOf(war, s.index) === 'attacker'
            && adjacency[s.index].some(n => controllerOf(war, n) === 'defender' && isPassable(surface.sectors[n])))
        .map(s => s.index);
}

export interface FrontResolution {
    captured: number[];
    liberated: number[];
    log: string[];
}

/**
 * Advances the front after a tactical cycle. `swing` is the cycle's outcome:
 * positive = the attacker won ground, negative = the defender pushed back.
 * Magnitude scales how many districts change hands.
 */
export function advanceFront(
    surface: PlanetSurface,
    war: DistrictWarState,
    swing: number,
    rng: () => number,
): FrontResolution {
    const adjacency = buildAdjacency(surface);
    const captured: number[] = [];
    const liberated: number[] = [];
    const log: string[] = [];

    const front = computeFront(surface, war, adjacency);
    war.contested = front;

    if (!front.length) return { captured, liberated, log };

    if (swing > 0) {
        // Sustained assault suppresses the defence: every cycle under attack
        // grinds a district's entrenchment down, which is what eventually
        // cracks a mountain line instead of stalling against it forever.
        for (const idx of front) {
            const pressure = adjacency[idx].filter(n => controllerOf(war, n) === 'attacker').length;
            const cur = war.entrenchment[idx] ?? 0;
            war.entrenchment[idx] = Math.max(0, cur - swing * (5 + pressure * 3));
        }

        // The softest defended districts on the front fall first.
        const pushes = Math.max(1, Math.min(front.length, Math.round(swing * 3)));
        const ranked = front
            .map(idx => {
                const sec = surface.sectors[idx];
                const resist = TERRAIN_DEFENSE[sec.terrain] * 20 + (war.entrenchment[idx] ?? 0);
                // Supported attacks: more adjacent attacker districts = more pressure.
                const pressure = adjacency[idx].filter(n => controllerOf(war, n) === 'attacker').length;
                // Momentum: a decisive cycle carries the line forward.
                const momentum = swing * 70;
                return { idx, weight: pressure * 25 + momentum - resist + rng() * 20 };
            })
            .sort((a, b) => b.weight - a.weight);

        for (const cand of ranked.slice(0, pushes)) {
            if (cand.weight <= 0) continue; // resistance held
            war.control[cand.idx] = 'attacker';
            captured.push(cand.idx);
        }
        if (captured.length) {
            log.push(`Front advances: ${captured.length} district${captured.length > 1 ? 's' : ''} overrun.`);
        } else {
            log.push('The assault breaks against dug-in defenders — no ground taken.');
        }
    } else if (swing < 0) {
        // A defender who is winning digs back in.
        for (const idx of front) {
            const cur = war.entrenchment[idx] ?? 0;
            war.entrenchment[idx] = Math.min(100, cur + (-swing) * 4);
        }
        // Defender counterattacks: retake the attacker's least-supported ground,
        // but never the landing zones themselves while the beachhead holds.
        const edge = computeAttackerEdge(surface, war, adjacency)
            .filter(idx => !war.landingZones.includes(idx));
        const pushes = Math.max(1, Math.min(edge.length, Math.round(-swing * 2)));
        const ranked = edge
            .map(idx => {
                const support = adjacency[idx].filter(n => controllerOf(war, n) === 'attacker').length;
                return { idx, weight: -support * 20 + (war.entrenchment[idx] ?? 0) * 0.3 + rng() * 20 };
            })
            .sort((a, b) => b.weight - a.weight);

        for (const cand of ranked.slice(0, pushes)) {
            delete war.control[cand.idx];
            liberated.push(cand.idx);
        }
        if (liberated.length) {
            log.push(`Counterattack retakes ${liberated.length} district${liberated.length > 1 ? 's' : ''}.`);
        }
    }

    war.contested = computeFront(surface, war, adjacency);
    return { captured, liberated, log };
}

/** Share of the passable surface the attacker holds, 0-100. */
export function occupationShare(surface: PlanetSurface, war: DistrictWarState): number {
    const land = surface.sectors.filter(isPassable);
    if (!land.length) return 0;
    const held = land.filter(s => controllerOf(war, s.index) === 'attacker').length;
    return Math.round((held / land.length) * 100);
}

/** The capital has fallen — the government's last district is taken. */
export const capitalTaken = (war: DistrictWarState) =>
    controllerOf(war, CAPITAL_SECTOR) === 'attacker';

/**
 * Terrain-weighted defensive bonus for the districts currently under attack.
 * A defender holding mountain passes fights above his weight; one caught on
 * open plains does not.
 */
export function frontDefenseMultiplier(surface: PlanetSurface, war: DistrictWarState): number {
    const front = war.contested.length ? war.contested : computeFront(surface, war);
    if (!front.length) return 1;
    let total = 0;
    for (const idx of front) {
        const sec = surface.sectors[idx];
        total += TERRAIN_DEFENSE[sec.terrain] * (1 + (war.entrenchment[idx] ?? 0) / 200);
    }
    return total / front.length;
}

/** Sector indexes the given siege state marks as attacker-held (client helper). */
export function attackerDistricts(siege: GroundSiegeState): number[] {
    const war = siege.districts;
    if (!war) return [];
    return Object.entries(war.control)
        .filter(([, c]) => c === 'attacker')
        .map(([k]) => Number(k));
}
