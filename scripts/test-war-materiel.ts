// scripts/test-war-materiel.ts
// Factory output has a use (2026-10-12): the state procures a share of each
// tick's ammo and military goods into AMMO and MATERIEL reserves; ships and
// armies cost materiel in proportion to their metals; every empire starts with
// some of each so the prices are enforced from the first economy tick.
// Run: npx tsx scripts/test-war-materiel.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { tickProduction, collectFactionTaxes } from '../lib/economy/economy-service';
import { RecruitmentService } from '../lib/combat/recruitment-service';
import { summarizeDesign, defaultDesignFor } from '../lib/combat/ship-registry';
import { warfleetQuote } from '../lib/ai/war-ai';
import { ACTION_DEFINITIONS } from '../lib/actions/registry';
import {
    AMMO, MATERIEL, PROCUREMENT_SHARE, STARTING_AMMO, STARTING_MATERIEL, materielFor,
} from '../lib/economy/procurement';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const quiet = console.log;
console.log = () => {};
const world = getGameWorldState() as any;
console.log = quiet;
const FACTION = 'faction-aurelian';
const reserves = world.economy.factions.get(FACTION).reserves as Record<string, number>;

console.log('\nWar materiel');

test('an empire with no war reserves is given its starting stock on the first economy tick', () => {
    delete reserves[AMMO];
    delete reserves[MATERIEL];
    collectFactionTaxes(world.economy, 3600);
    assert.strictEqual(reserves[AMMO], STARTING_AMMO);
    assert.strictEqual(reserves[MATERIEL], STARTING_MATERIEL);
});

test('the state procures a share of the ammo and military goods its factories make', () => {
    const planet = [...world.economy.planets.values()].find((p: any) => p.factionId === FACTION)!;
    // Plenty of inputs so the chains run at full rate.
    for (const k of ['metals', 'chemicals', 'energy', 'food']) planet.stockpile[k] = 1e7;
    const ammo0 = reserves[AMMO];
    const mat0 = reserves[MATERIEL];
    const pile0 = { ammo: planet.stockpile.ammo ?? 0, military: planet.stockpile.military ?? 0 };
    tickProduction(planet, 3600, world);
    const madeAmmo = (planet.currentRates.ammo ?? 0) * 3600;
    const madeMil = (planet.currentRates.military ?? 0) * 3600;
    assert.ok(madeAmmo > 0 && madeMil > 0, `factories ran: ammo ${madeAmmo}, military ${madeMil}`);
    collectFactionTaxes(world.economy, 3600);
    assert.ok(Math.abs((reserves[AMMO] - ammo0) - madeAmmo * PROCUREMENT_SHARE) < 1e-6, 'ammo procured');
    assert.ok(Math.abs((reserves[MATERIEL] - mat0) - madeMil * PROCUREMENT_SHARE) < 1e-6, 'materiel procured');
    assert.ok(Math.abs((planet.stockpile.ammo - pile0.ammo) - madeAmmo * (1 - PROCUREMENT_SHARE)) < 1e-6, 'the rest stays on the planet');
});

test('a ship costs materiel in proportion to its metals, everywhere it is priced', () => {
    const corvette = summarizeDesign(defaultDesignFor('corvette')!, null);
    assert.strictEqual(corvette.cost.MATERIEL, materielFor(corvette.cost.METALS));
    assert.strictEqual(materielFor(300), 30);
    const unit = RecruitmentService.unitCost('CRUISER');
    assert.strictEqual(unit.MATERIEL, materielFor(unit.METALS));
    const quote = warfleetQuote({ corvette: 2 });
    assert.strictEqual(quote.cost.MATERIEL, 2 * materielFor(RecruitmentService.unitCost('CORVETTE').METALS));
});

test('attacks, bombardments and invasions are priced in ammo', () => {
    for (const id of ['MIL_ATTACK_FLEET', 'MIL_BOMBARD_PLANET', 'MIL_INVASION_PLANET']) {
        assert.ok(((ACTION_DEFINITIONS as any)[id]?.cost?.ammo ?? 0) > 0, `${id} has an ammo price`);
    }
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
