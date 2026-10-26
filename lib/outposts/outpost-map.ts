// lib/outposts/outpost-map.ts
// Stars of Dominion — an outpost's 5×5 ground, generated from the planet id
// (same id, same ground) and leaning on what kind of world it is. Pure.

import { RNG, seedFromString } from '../trade-system/rng';
import type { CellTerrain, CharterId, OutpostCell, OutpostState } from './outpost-types';
import { CELL_COUNT, CENTER_CELL, SHIFT_SIM_SECONDS, START_COLONISTS, START_FOOD, AIR_RESERVE_MAX } from './outpost-catalog';
import { ensureRoster, listNames, TRAIT_LABEL } from './colonists';

type Weights = Record<Exclude<CellTerrain, 'ruin'>, number>;

function weightsFor(planetType: string | undefined, tags: readonly string[]): Weights {
    const w: Weights = { flat: 10, ore: 3, ice: 2, vent: 1, rock: 3 };
    if (tags.includes('dead_matter')) { w.rock += 3; w.ore += 3; w.flat -= 2; }
    if (planetType === 'arctic' || planetType === 'ocean' || tags.includes('ice')) { w.ice += 5; w.ore -= 1; }
    if (planetType === 'desert' || planetType === 'tomb') { w.ore += 3; w.ice = Math.max(0, w.ice - 2); }
    if (tags.includes('volcanic') || tags.includes('geothermal')) w.vent += 4;
    if (tags.includes('rare_minerals') || tags.includes('rare')) w.ore += 2;
    return w;
}

function pick(rng: RNG, w: Weights): CellTerrain {
    const entries = Object.entries(w).filter(([, n]) => n > 0) as Array<[CellTerrain, number]>;
    const total = entries.reduce((s, [, n]) => s + n, 0);
    let roll = rng.next() * total;
    for (const [t, n] of entries) { roll -= n; if (roll < 0) return t; }
    return 'flat';
}

/** The ground alone: same planet id and kind, same 25 cells. */
export function generateOutpostGround(planetId: string, planetType: string | undefined, tags: readonly string[]): CellTerrain[] {
    const rng = new RNG(seedFromString(`${planetId}|outpost-ground`));
    const w = weightsFor(planetType, tags);
    const cells: CellTerrain[] = [];
    for (let i = 0; i < CELL_COUNT; i++) cells.push(pick(rng, w));
    // The hub stands on flat ground, and so does one cell beside it.
    cells[CENTER_CELL] = 'flat';
    cells[CENTER_CELL - 1] = 'flat';
    // Somewhere out on the edge, maybe, something older than you.
    if (rng.check(0.35)) {
        const edge = [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24];
        cells[edge[rng.nextInt(0, edge.length - 1)]] = 'ruin';
    }
    const ring = [6, 7, 8, 11, 13, 16, 17, 18];
    // Room for the first essentials: at least five flat cells in the first ring
    // (rock goes first, then whatever is most common).
    for (const want of ['rock', 'ore', 'ice', 'vent'] as CellTerrain[]) {
        for (const i of ring) {
            if (ring.filter(j => cells[j] === 'flat').length >= 5) break;
            if (cells[i] === want) cells[i] = 'flat';
        }
    }
    // Every outpost has something to dig within reach of the first ring.
    // Without taking one of those five flats.
    if (!ring.some(i => cells[i] === 'ore' || cells[i] === 'ice' || cells[i] === 'vent')) {
        const flats = ring.filter(i => cells[i] === 'flat');
        const spare = ring.filter(i => cells[i] !== 'flat').concat(flats.slice(5));
        if (spare.length) cells[spare[rng.nextInt(0, spare.length - 1)]] = tags.includes('dead_matter') ? 'ore' : 'ice';
    }
    return cells;
}

export function createOutpostState(
    planet: { id: string; planetType?: string; tags?: string[] },
    nowSeconds: number,
    charter: CharterId = 'settlement',
): OutpostState {
    const ground = generateOutpostGround(planet.id, planet.planetType, planet.tags ?? []);
    const cells: OutpostCell[] = ground.map(terrain => ({ terrain }));
    cells[CENTER_CELL].module = 'hub';
    const state: OutpostState = {
        version: 1,
        tier: 1,
        charter,
        charterSetShift: 0,
        cells,
        colonists: START_COLONISTS,
        food: START_FOOD,
        air: AIR_RESERVE_MAX,
        morale: 60,
        warehouse: {},
        shift: 0,
        nextShiftAt: nowSeconds + SHIFT_SIM_SECONDS,
        crises: [],
        effects: [],
        log: [],
        prisonerGroupIds: [],
        experimentReadyShift: 0,
        stats: { shipped: {}, experiments: 0, deaths: 0, crisesFaced: 0 },
        roster: [],
        graves: [],
        scars: [],
    };
    // The landing crew, by name (lib/outposts/colonists.ts).
    const crew = ensureRoster(state);
    state.log.push({ shift: 0, text: `The landing crew is down: ${listNames(crew.map(c => `${c.name} (${TRAIT_LABEL[c.trait].toLowerCase()})`))}. One dome, food for a dozen shifts.`, tone: 'neutral' });
    return state;
}
