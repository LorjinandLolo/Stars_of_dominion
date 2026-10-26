// lib/outposts/adjacency.ts
// Stars of Dominion — what stands next to what (docs/outposts/README.md).
//
// Placement is a puzzle once neighbours matter: hydroponics by the ice, the
// commons among the domes, the warehouse by the extractors, a reactor away
// from where people sleep, a bunker over the modules it shelters. Every rule
// is one row here; the simulation (outpost-sim.ts) applies the flows, the
// crises (crises.ts) honour the bunker, and the screen explains a cell by
// the same table. Pure.

import type { CellTerrain, ModuleId, OutpostState } from './outpost-types';
import { neighborsOf } from './outpost-catalog';

export type AdjacencyEffect =
    | { kind: 'air'; value: number }
    | { kind: 'food'; value: number }
    | { kind: 'power'; value: number }
    | { kind: 'morale'; value: number }
    /** Multiplier on this extractor's yield. */
    | { kind: 'output'; value: number }
    /** Multiplier on this lab's experiment hours. */
    | { kind: 'experiment'; value: number }
    /** Meteors and raiders pick something else. */
    | { kind: 'shield' };

export interface AdjacencyRule {
    module: ModuleId;
    /** A module id or a terrain next door. */
    beside: ModuleId | CellTerrain;
    effect: AdjacencyEffect;
    /** How many such neighbours count (default 1). */
    max?: number;
    text: string;
}

export const ADJACENCY: AdjacencyRule[] = [
    { module: 'life_support', beside: 'ice', effect: { kind: 'air', value: 1 }, text: '+1 air from the ice next door' },
    { module: 'hydroponics', beside: 'ice', effect: { kind: 'food', value: 1 }, text: '+1 food from the ice next door' },
    { module: 'hydroponics', beside: 'solar', effect: { kind: 'food', value: 1 }, text: '+1 food in the array’s light' },
    { module: 'geothermal', beside: 'vent', effect: { kind: 'power', value: 1 }, text: '+1 power from a second vent' },
    { module: 'commons', beside: 'habitat', effect: { kind: 'morale', value: 2 }, max: 2, text: '+2 morale per dome beside it (two at most)' },
    { module: 'medbay', beside: 'commons', effect: { kind: 'morale', value: 2 }, text: '+2 morale: care within reach' },
    { module: 'habitat', beside: 'reactor', effect: { kind: 'morale', value: -3 }, text: '−3 morale: nobody sleeps well beside a reactor' },
    { module: 'mine', beside: 'warehouse', effect: { kind: 'output', value: 0.15 }, text: '+15% yield: the warehouse is next door' },
    { module: 'test_lab', beside: 'ruin', effect: { kind: 'experiment', value: 0.5 }, text: '+50% experiment hours beside the ruins' },
    { module: 'bunker', beside: 'bunker', effect: { kind: 'shield' }, text: 'shelters its four neighbours from meteors and raiders' },
];

const SHIELDED_BY_BUNKER: AdjacencyRule = ADJACENCY.find(r => r.effect.kind === 'shield')!;

function built(state: OutpostState, i: number): boolean {
    const c = state.cells[i];
    return !!c?.module && !(c.buildDoneShift !== undefined && c.buildDoneShift > state.shift) && !((c.downUntilShift ?? 0) > state.shift) && !c.off;
}

/** The rules that apply to `module` standing on `cell`, each with how many neighbours match. */
export function adjacencyAt(state: OutpostState, cell: number, module?: ModuleId): Array<{ rule: AdjacencyRule; count: number }> {
    const id = module ?? state.cells[cell]?.module;
    if (!id) return [];
    const out: Array<{ rule: AdjacencyRule; count: number }> = [];
    for (const rule of ADJACENCY) {
        if (rule.module !== id || rule.effect.kind === 'shield') continue;
        let count = 0;
        for (const n of neighborsOf(cell)) {
            const nc = state.cells[n];
            if (!nc) continue;
            if (nc.terrain === rule.beside && !nc.module) count++;
            else if (nc.module === rule.beside && built(state, n)) count++;
        }
        count = Math.min(count, rule.max ?? 1);
        if (count > 0) out.push({ rule, count });
    }
    return out;
}

/** Sum of one effect kind for the module on this cell. */
export function adjacencyValue(state: OutpostState, cell: number, kind: Exclude<AdjacencyEffect['kind'], 'shield'>, module?: ModuleId): number {
    let v = 0;
    for (const { rule, count } of adjacencyAt(state, cell, module)) {
        if (rule.effect.kind === kind) v += (rule.effect as { value: number }).value * count;
    }
    return v;
}

/** A built bunker next door: meteors and raiders look elsewhere. */
export function shieldedByBunker(state: OutpostState, cell: number): boolean {
    return neighborsOf(cell).some(n => state.cells[n]?.module === 'bunker' && built(state, n));
}

/** What `module` would gain on `cell` right now — for the build list. */
export function adjacencyHints(state: OutpostState, cell: number, module: ModuleId): string[] {
    return adjacencyAt(state, cell, module).map(({ rule, count }) => count > 1 ? `${rule.text} (×${count})` : rule.text);
}

export { SHIELDED_BY_BUNKER };
