// lib/economy/building-output.ts
// What a world's finished buildings add to its extraction rates.
//
// data/buildings.ts gives resource buildings effects like
// { type: 'metals_output', value: 20 }. For their whole life those numbers fed
// only recalculatePlanetStats, which nothing in the production tick reads — a
// metal mine changed no planet's metals rate at all. They are read here as
// PERCENT OF A STANDARD WORLD'S BASE RATE (the same convention as the biosphere
// table): a metal mine (20) adds 20% of baseRates.metals, a gas giant harvester
// (200) adds twice baseRates.energy. planetBaseRates adds the result to
// base × planet-type multiplier, so a mine on a poor world is still worth a
// mine, and everything downstream (biosphere, grid, focus, tech) scales it.
//
// Two bonuses on top of a building's own value:
//  - the district bonus recalculatePlanetStats already applied (getDistrictBonus:
//    +15% for a resource building on an industrial district, …);
//  - a surface deposit under the building's sector (lib/planet-surface,
//    carveFeatures): a mine on an ore seam, a reactor on a geothermal vent,
//    a farm on fertile soil yields DEPOSIT_BONUS more of the matching output.
//
// Stacking saturates per resource (SATURATION) so a world tiled with mines
// approaches, but never passes, that many percent — it cannot explode.

import { BUILDINGS } from '../../data/buildings';
import type { BuildingDefinition, Planet } from '../construction/construction-types';
import { getDistrictBonus } from '../construction/recalculation';
import { generateSurface } from '../planet-surface/generator';
import { computeSectorOccupancy } from '../planet-surface/occupancy';
import type { DepositKind } from '../planet-surface/types';
import type { ResourceBundle } from './economy-types';

/** Building effect type → the economy resource it raises. Manpower has no extraction rate. */
const OUTPUT_EFFECTS: Record<string, keyof ResourceBundle> = {
    metals_output: 'metals',
    chemicals_output: 'chemicals',
    food_output: 'food',
    energy_output: 'energy',
    research_output: 'research',
};

/** Which outputs each deposit kind boosts when a building working it sits on top. */
export const DEPOSIT_OUTPUTS: Record<DepositKind, Array<keyof ResourceBundle>> = {
    ore: ['metals'],
    rare_minerals: ['metals', 'rare'],
    geothermal: ['energy'],
    ice: ['chemicals', 'food'],
    fertile: ['food'],
    relic: ['research'],
};

/** A matching deposit adds half again to the building's output of that resource. */
export const DEPOSIT_BONUS = 0.5;

/** Ceiling, in percent of base rate, that one resource's building bonus approaches. */
export const SATURATION = 300;

const BY_ID = new Map<string, BuildingDefinition>(BUILDINGS.map(b => [b.id, b]));

/** Raw stacked percentages per resource, before saturation. */
export function rawBuildingPercents(planet: Planet): ResourceBundle {
    const result: ResourceBundle = {};
    const tiles = Array.isArray(planet.tiles) ? planet.tiles : [];
    if (!tiles.some(t => t.constructionState === 'active' && t.buildingId)) return result;

    const tags = planet.tags ?? [];
    const surface = generateSurface(planet.id, planet.planetType, tags);
    const sectorOfTile = new Map<string, number>();
    for (const occ of computeSectorOccupancy(planet, surface).values()) {
        if (occ.tileId) sectorOfTile.set(occ.tileId, occ.sectorIndex);
    }

    for (const tile of tiles) {
        if (tile.constructionState !== 'active' || !tile.buildingId) continue;
        const def = BY_ID.get(tile.buildingId);
        if (!def) continue;
        if (def.tagRequirements?.length && !def.tagRequirements.every(req => tags.includes(req))) continue;

        const districtMult = 1 + getDistrictBonus(tile, def);
        const sector = sectorOfTile.get(tile.tileId);
        const deposit = sector !== undefined ? surface.sectors[sector]?.deposit : undefined;
        const depositKeys = deposit ? DEPOSIT_OUTPUTS[deposit] : [];

        for (const effect of def.effects) {
            const key = OUTPUT_EFFECTS[effect.type];
            if (!key || !(effect.value > 0)) continue;
            const value = effect.value * districtMult;
            const onDeposit = depositKeys.includes(key);
            result[key] = (result[key] ?? 0) + value * (onDeposit ? 1 + DEPOSIT_BONUS : 1);
            // Rare minerals: the seam also yields a trickle of rare at the same bonus share.
            if (onDeposit && deposit === 'rare_minerals' && key === 'metals') {
                result.rare = (result.rare ?? 0) + value * DEPOSIT_BONUS;
            }
        }
    }
    return result;
}

/** Saturating stack: linear for one or two buildings, approaching SATURATION. */
export function saturate(percent: number): number {
    return percent <= 0 ? 0 : SATURATION * (1 - Math.exp(-percent / SATURATION));
}

/**
 * Percent of baseRates each resource gains from this world's buildings. Read by
 * planetBaseRates in economy-service.
 */
export function buildingOutputPercents(planet: Planet | undefined): ResourceBundle {
    if (!planet) return {};
    const raw = rawBuildingPercents(planet);
    const result: ResourceBundle = {};
    for (const [k, v] of Object.entries(raw)) result[k as keyof ResourceBundle] = saturate(v ?? 0);
    return result;
}
