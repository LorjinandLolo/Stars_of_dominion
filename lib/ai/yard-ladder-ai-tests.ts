// lib/ai/yard-ladder-ai-tests.ts
// npx tsx lib/ai/yard-ladder-ai-tests.ts
//
// An AI faction climbs Space Station → Spaceyard → (infrastructure) →
// Advanced Spaceyard → Capital Spaceyard at its capital, paying the catalog
// price with headroom, one step per tick.

import { tickAIYardLadder, chooseYardStep, YARD_LADDER_HEADROOM } from './yard-ladder-ai';
import { ORBITAL_STRUCTURE_BY_ID } from '../../data/orbital-structures';
import { orbitalStructureCharge, computeOrbitalRatings } from '../orbital/orbital-service';
import { ensureInfrastructureNetwork, recomputeInfrastructureLevel } from '../infrastructure/infrastructure-service';
import { INFRASTRUCTURE_TRACK_IDS } from '../infrastructure/infrastructure-types';

const F = 'faction-ai-test';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

function makeWorld(reserves: Record<string, number>) {
    const planet: any = {
        id: 'p1', name: 'Home', ownerId: F, systemId: 'sys-1', planetType: 'capital',
        infrastructureLevel: 2, stability: 90, specialization: null, tiles: [], buildQueue: [], maxTiles: 12,
    };
    const world: any = {
        nowSeconds: 1000,
        economy: {
            factions: new Map([[F, { id: F, name: 'Test AI', capitalSystemId: 'sys-1', reserves }]]),
            planets: new Map([['p1', { planetId: 'p1', stockpile: { metals: 50000, chemicals: 50000, food: 5000, energy: 5000 } }]]),
        },
        construction: { planets: new Map([['p1', planet]]) },
        tech: new Map(),
        movement: { systems: new Map(), fleets: new Map() },
    };
    return { world, planet };
}

/** Finish whatever is in the orbital queue, as the construction tick would. */
function completeOrbital(planet: any) {
    for (const order of planet.orbital.buildQueue) {
        const slot = planet.orbital.slots.find((s: any) => s.slotId === order.slotId);
        slot.structureId = order.structureId; slot.state = 'active'; slot.integrity = 100;
    }
    planet.orbital.buildQueue = [];
}

/** Finish every running infrastructure upgrade and recompute the derived level. */
function completeInfrastructure(planet: any) {
    const network = ensureInfrastructureNetwork(planet);
    for (const id of INFRASTRUCTURE_TRACK_IDS) {
        const track = network.tracks[id];
        if (track.upgrade) { track.level = track.upgrade.targetLevel; track.upgrade = null; }
    }
    recomputeInfrastructureLevel(planet);
}

console.log('\n1. The ladder, rung by rung');
{
    const { world, planet } = makeWorld({ CREDITS: 100_000, METALS: 20_000, CHEMICALS: 8_000, FOOD: 5_000, ENERGY: 5_000 });
    const before = { ...world.economy.factions.get(F).reserves };
    const first = tickAIYardLadder(world, F);
    check('first step is the Space Station', first?.kind === 'orbital' && first.structureId === 'space_station', JSON.stringify(first));
    const stationCharge = orbitalStructureCharge(ORBITAL_STRUCTURE_BY_ID['space_station']);
    const r = world.economy.factions.get(F).reserves;
    check('it paid the catalog price', r.METALS === before.METALS - stationCharge.METALS && r.CREDITS === before.CREDITS - stationCharge.CREDITS && r.CHEMICALS === before.CHEMICALS - stationCharge.CHEMICALS);
    check('the order carries what was paid', JSON.stringify(planet.orbital.buildQueue[0]?.paid) === JSON.stringify(stationCharge));
    check('nothing more while the station is building', tickAIYardLadder(world, F) === null);

    completeOrbital(planet);
    const second = tickAIYardLadder(world, F);
    check('then the Spaceyard', second?.kind === 'orbital' && second.structureId === 'spaceyard', JSON.stringify(second));
    completeOrbital(planet);
    check('yard tier 1 stands', computeOrbitalRatings(planet, world.nowSeconds).shipyardTier === 1);

    // Advanced Spaceyard needs infrastructure 3: the AI raises tracks first.
    const third = tickAIYardLadder(world, F);
    check('the next rung is blocked by the ground, so infrastructure rises', third?.kind === 'infrastructure', JSON.stringify(third));
    check('one track at a time', tickAIYardLadder(world, F) === null);
    let step: any = null;
    let guard = 0;
    while (guard++ < 12) {
        completeInfrastructure(planet);
        step = tickAIYardLadder(world, F);
        if (step?.kind === 'orbital') break;
    }
    check('once the ground allows it, the Advanced Spaceyard goes down', step?.kind === 'orbital' && step.structureId === 'advanced_spaceyard', `${JSON.stringify(step)} after ${guard} ticks, infra ${planet.infrastructureLevel}`);
    completeOrbital(planet);
    check('yard tier 2 stands', computeOrbitalRatings(planet, world.nowSeconds).shipyardTier === 2);

    guard = 0; step = null;
    while (guard++ < 16) {
        completeInfrastructure(planet);
        step = tickAIYardLadder(world, F);
        if (step?.kind === 'orbital') break;
    }
    check('and finally the Capital Spaceyard', step?.kind === 'orbital' && step.structureId === 'capital_spaceyard', `${JSON.stringify(step)} infra ${planet.infrastructureLevel}`);
    completeOrbital(planet);
    check('yard tier 3 stands and the ladder stops', computeOrbitalRatings(planet, world.nowSeconds).shipyardTier === 3 && tickAIYardLadder(world, F) === null);
}

console.log('\n2. Money and headroom');
{
    const { world } = makeWorld({ CREDITS: 100, METALS: 100, CHEMICALS: 100, FOOD: 100, ENERGY: 100 });
    check('a poor faction builds nothing', tickAIYardLadder(world, F) === null);
    const charge = orbitalStructureCharge(ORBITAL_STRUCTURE_BY_ID['space_station']);
    const exact = makeWorld({ CREDITS: charge.CREDITS, METALS: charge.METALS, CHEMICALS: charge.CHEMICALS, FOOD: charge.FOOD, ENERGY: 0 });
    check(`exactly the price is not enough (headroom ${YARD_LADDER_HEADROOM}×)`, tickAIYardLadder(exact.world, F) === null);
    const enough = makeWorld({ CREDITS: charge.CREDITS * 2, METALS: charge.METALS * 2, CHEMICALS: charge.CHEMICALS * 2, FOOD: charge.FOOD * 2, ENERGY: 0 });
    check('double the price is', tickAIYardLadder(enough.world, F)?.kind === 'orbital');
    const { world: noCap } = makeWorld({ CREDITS: 100_000, METALS: 20_000, CHEMICALS: 8_000 });
    noCap.economy.factions.get(F).capitalSystemId = undefined;
    check('no capital, no ladder', tickAIYardLadder(noCap, F) === null);
}

console.log('\n3. The decision is pure');
{
    const { world, planet } = makeWorld({ CREDITS: 100_000, METALS: 20_000, CHEMICALS: 8_000, FOOD: 5_000, ENERGY: 5_000 });
    const s1 = chooseYardStep(planet, world.economy.factions.get(F).reserves, { metals: 0, chemicals: 0, food: 0, energy: 0 }, new Set(), world.nowSeconds);
    check('chooseYardStep alone changes nothing', s1?.kind === 'orbital' && planet.orbital.buildQueue.length === 0 && world.economy.factions.get(F).reserves.METALS === 20_000);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
