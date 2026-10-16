// lib/ai/outpost-ai.ts
// Stars of Dominion — AI empires use the outposts players do
// (docs/outposts/README.md). Two halves:
//
//   tickAIOutposts            each strategic cycle: lay down a builder ship,
//                             fly it to an empty surveyed world near home that
//                             colonisation skips (dead rock first), plant an
//                             outpost there. At most MAX_AI_OUTPOSTS growing.
//   tickAIOutpostManagement   each worker cycle, at most one action per shift
//                             per outpost: build what it is short of, buy food
//                             when it is starving, grow when it can, resettle
//                             it when it empties. Crises are left to the
//                             steward (the crew or the world's governor),
//                             exactly as for a player who does not answer.
//
// Same claimedFactionIds convention as every other AI service: no list,
// nobody is AI. Deterministic: sorted ids, no randomness.

import type { GameWorldState } from '../game-world-state';
import type { ModuleId, OutpostState } from '../outposts/outpost-types';
import { MODULES, TIERS, cellOpen, terrainOk } from '../outposts/outpost-catalog';
import { computeBalance } from '../outposts/outpost-sim';
import { outpostOrder, prisonersHeld } from '../outposts/outpost-service';
import { CIVILIAN_SHIPS, OUTPOST_COST, civilianCount } from '../combat/civilian-ships';
import { foundOutpost } from '../combat/civilian-service';
import { systemYardFor } from '../combat/shipyard-gate';
import { issueMoveOrder } from '../movement/movement-service';

/** Outposts an AI runs at once, before it lets them grow into colonies. */
export const MAX_AI_OUTPOSTS = 2;
/** How far from home (hyperlane jumps) an AI plants one. */
const MAX_JUMPS = 4;
/** Reserves kept in hand beyond the price: expansion never drains the war chest. */
const HEADROOM = 2;

function aiFactions(world: GameWorldState): string[] {
    const claimedList = (world as any).claimedFactionIds;
    if (!Array.isArray(claimedList)) return [];
    const claimed = new Set<string>(claimedList);
    return [...world.economy.factions.keys()]
        .filter(id => !claimed.has(id) && id !== 'faction-pirates' && id !== 'faction-neutral')
        .sort();
}

function reservesOf(world: GameWorldState, factionId: string): Record<string, number> | undefined {
    return world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined;
}

function canAfford(r: Record<string, number> | undefined, cost: Record<string, number>, headroom = 1): boolean {
    return !!r && Object.entries(cost).every(([k, v]) => (r[k] ?? 0) >= v * headroom);
}

const isUnowned = (owner: string | null | undefined) => !owner || owner === 'faction-neutral';

/** Systems within MAX_JUMPS of `from`, with their distance. */
function jumpsFrom(world: GameWorldState, from: string): Map<string, number> {
    const dist = new Map<string, number>([[from, 0]]);
    let frontier = [from];
    for (let d = 1; d <= MAX_JUMPS; d++) {
        const next: string[] = [];
        for (const s of frontier) {
            for (const n of [...(world.movement.systems.get(s)?.hyperlaneNeighbors ?? [])].sort()) {
                if (dist.has(n)) continue;
                dist.set(n, d);
                next.push(n);
            }
        }
        frontier = next;
    }
    return dist;
}

/**
 * Where an AI plants its next outpost: an unowned world in a system it has
 * surveyed, near home. Worlds colonisation will not take (dead matter, not
 * colonizable) come first; that is what outposts are for.
 */
export function aiOutpostTarget(world: GameWorldState, factionId: string, homeSystemId: string): any | null {
    const vis = world.movement.factionVisibility.get(factionId) ?? {};
    const dist = jumpsFrom(world, homeSystemId);
    const candidates = [...world.construction.planets.values()]
        .filter((p: any) => isUnowned(p.ownerId) && dist.has(p.systemId) && vis[p.systemId]?.revealStage === 'surveyed' && !p.siege)
        .map((p: any) => ({
            p,
            score: dist.get(p.systemId)! * 10 + ((p.tags ?? []).includes('dead_matter') || !(p.tags ?? []).includes('colonizable') ? 0 : 5),
        }))
        .sort((a, b) => a.score - b.score || a.p.id.localeCompare(b.p.id));
    return candidates[0]?.p ?? null;
}

function makeBuilderFleet(world: GameWorldState, factionId: string, systemId: string, planetId: string): any {
    const fleetId = `fleet-${factionId}-builder-ai-${world.nowSeconds}`;
    const fleet: any = {
        id: fleetId, factionId, name: 'Builder', currentSystemId: systemId, arrivedAtSeconds: world.nowSeconds,
        orbitingPlanetId: planetId, destinationSystemId: null, activeLayer: null, transitProgress: 0, etaSeconds: 0,
        plannedPath: [], orders: [],
        doctrine: { type: 'Defensive', deviationFromPosture: 0, preferredLayers: ['hyperlane', 'gate'], retreatThreshold: 1, logisticsStrain: 0, moraleDrift: 0, supplyLevel: 1.0 },
        postureId: 'Expansionist', strength: 1.0, basePower: 0, composition: { builder: 1 },
        hyperdriveProfile: {
            hyperlane: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
            trade: { speedMultiplier: 1.2, detectabilityMultiplier: 1.5, supplyStrainMultiplier: 1.0 },
            corridor: { speedMultiplier: 2.0, detectabilityMultiplier: 0.5, supplyStrainMultiplier: 1.0 },
        },
        isDetectable: true, transportedArmyIds: [],
    };
    world.movement.fleets.set(fleetId, fleet);
    return fleet;
}

/** Each strategic cycle: grow the outpost count toward MAX_AI_OUTPOSTS, one step at a time. */
export function tickAIOutposts(world: GameWorldState): void {
    for (const factionId of aiFactions(world)) {
        const faction: any = world.economy.factions.get(factionId);
        const home: string | undefined = faction?.capitalSystemId;
        if (!home || !world.movement.systems.has(home)) continue;
        const growing = [...world.construction.planets.values()].filter((p: any) => p.ownerId === factionId && p.outpost && !p.outpost.graduated).length;
        if (growing >= MAX_AI_OUTPOSTS) continue;
        const r = reservesOf(world, factionId);

        const builder: any = [...world.movement.fleets.values()]
            .filter((f: any) => f.factionId === factionId && civilianCount(f.composition, 'builder') > 0)
            .sort((a: any, b: any) => a.id.localeCompare(b.id))[0];

        if (!builder) {
            // Lay one down at the capital yard, paying what a player pays.
            const price = CIVILIAN_SHIPS.builder.cost;
            const total = { CREDITS: (price.CREDITS ?? 0) + (OUTPOST_COST.CREDITS ?? 0), METALS: price.METALS ?? 0 };
            if (!canAfford(r, total, HEADROOM)) continue;
            if (!aiOutpostTarget(world, factionId, home)) continue;
            if (systemYardFor(world.construction.planets.values(), factionId, home, world.nowSeconds).tier < 1) continue;
            const capitalPlanet: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === factionId && p.systemId === home);
            for (const [k, v] of Object.entries(price)) r![k] = (r![k] ?? 0) - v;
            makeBuilderFleet(world, factionId, home, capitalPlanet?.id ?? null);
            console.log(`[AI Outposts] ${factionId} commissioned a builder ship at ${home}.`);
            continue;
        }
        if (builder.destinationSystemId || !builder.currentSystemId) continue; // under way

        const target = aiOutpostTarget(world, factionId, home);
        if (!target) continue;
        if (builder.currentSystemId === target.systemId) {
            if (!canAfford(r, OUTPOST_COST)) continue;
            const charter = (target.tags ?? []).includes('dead_matter') ? 'mining' : 'settlement';
            const result = foundOutpost(world, factionId, builder.id, target.id, charter);
            if (result.ok) console.log(`[AI Outposts] ${factionId} planted an outpost on ${target.name}.`);
            continue;
        }
        try {
            const moved: any = issueMoveOrder(builder, target.systemId, 'hyperlane', world.movement);
            moved.arrivalOrbitPlanetId = target.id;
            world.movement.fleets.set(builder.id, moved);
        } catch (e: any) {
            console.warn(`[AI Outposts] ${factionId} builder could not sail to ${target.systemId}: ${e.message}`);
        }
    }
}

// ─── Running an outpost ──────────────────────────────────────────────────────

/** The first open, empty cell this module can stand on, or -1. */
function spotFor(state: OutpostState, m: ModuleId): number {
    return state.cells.findIndex((c, i) => cellOpen(i, state.tier) && !c.module && c.clearingUntilShift === undefined
        && (c.terrain === 'rock' ? m === 'bunker' : terrainOk(m, c.terrain)));
}

function rockToClear(state: OutpostState): number {
    return state.cells.findIndex((c, i) => cellOpen(i, state.tier) && c.terrain === 'rock' && !c.module && c.clearingUntilShift === undefined);
}

/** What this outpost should build next, in the order a careful player would. */
export function aiNextModule(state: OutpostState, prisoners = 0): ModuleId | null {
    const b = computeBalance(state, { prisoners });
    const has = (m: ModuleId) => state.cells.some(c => c.module === m);
    const want: ModuleId[] = [];
    if (b.foodMade < b.foodUsed + 1) want.push('hydroponics');
    if (b.airMade < b.airUsed + 1) want.push('life_support');
    if (b.powerMade - b.powerUsed < 1) want.push('solar', 'geothermal');
    for (const m of TIERS[state.tier].next?.modules ?? []) if (!has(m)) want.push(m);
    if (state.colonists >= b.housing - 1) want.push('habitat');
    if (state.morale < 62 && state.cells.filter(c => c.module === 'commons').length < 2) want.push('commons');
    if (!has('warehouse')) want.push('warehouse');
    if (!has('mine')) want.push('mine');
    if (state.tier >= 2 && !has('bunker')) want.push('bunker');
    for (const m of want) if (spotFor(state, m) >= 0) return m;
    return null;
}

/**
 * Each worker cycle, at most one action per outpost per shift. Uses the
 * player's own order path (outpostOrder), so it pays, waits and is refused
 * exactly as a player would be.
 */
export function tickAIOutpostManagement(world: GameWorldState): void {
    const ai = new Set(aiFactions(world));
    if (!ai.size) return;
    for (const planet of world.construction.planets.values() as Iterable<any>) {
        const state: OutpostState | undefined = planet.outpost;
        if (!state || !ai.has(planet.ownerId) || state.graduated) continue;
        const marks = state as OutpostState & { aiActedShift?: number };
        if (marks.aiActedShift === state.shift) continue;
        marks.aiActedShift = state.shift;
        const owner: string = planet.ownerId;
        const act = (op: any) => outpostOrder(world, owner, planet.id, op).ok;

        if (state.colonists <= 0) { act({ op: 'resettle' }); continue; }
        const b = computeBalance(state, { prisoners: prisonersHeld(world, state) });
        if (state.food < 4 && b.foodMade < b.foodUsed && act({ op: 'supply' })) continue;
        if (act({ op: 'advance' })) continue;
        const r = reservesOf(world, owner);
        const m = aiNextModule(state, prisonersHeld(world, state));
        if (m) {
            if (canAfford(r, MODULES[m].cost, HEADROOM)) act({ op: 'build', cell: spotFor(state, m), module: m });
            continue;
        }
        const rock = rockToClear(state);
        if (rock >= 0) act({ op: 'clear', cell: rock });
    }
}
