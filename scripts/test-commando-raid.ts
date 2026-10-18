// scripts/test-commando-raid.ts
// Commandos knock out one installation before the main assault
// (lib/combat/commando-raid.ts, MIL_COMMANDO_RAID in scripts/game-loop.ts):
// who can raid, the odds, what a success knocks out, what a failure costs,
// the cooldown, and that counter-intelligence still restores it.
// Run: npx tsx scripts/test-commando-raid.ts

import assert from 'assert';
import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import { executeOrder } from './game-loop';
import { commandoRaid, raidChance, raidersOf, RAID_MAX_MEN, RAID_MIN_CHANCE, RAID_MAX_CHANCE, RAID_COOLDOWN_SECONDS } from '../lib/combat/commando-raid';
import { restoreSabotage } from '../lib/espionage/defence-sabotage';
import { ensureLedger } from '../lib/combat/siege/prisoners';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const quiet = quietConsole();
const world: any = bootSoakWorld();
quiet.restore();
const silently = <T>(fn: () => T): T => { const q = quietConsole(); try { return fn(); } finally { q.restore(); } };
const [A, B] = empireIds(world);
const lastError = (f: string) => world.economy.factions.get(f).lastOrderError?.reason ?? '';
if (!world.movement.armies) world.movement.armies = new Map();

const target: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === B);
const sys = target.systemId;
const atWar = { on: true };
const isAtWar = () => atWar.on;
const setWar = (on: boolean) => {
    atWar.on = on;
    const key = world.rivalries.has(`rivalry-${A}-${B}`) ? `rivalry-${A}-${B}` : `rivalry-${B}-${A}`;
    world.rivalries.set(key, { ...(world.rivalries.get(key) ?? {}), empireAId: A, empireBId: B, escalationLevel: on ? 9 : 0 });
};
setWar(true);

function fortify(garrison: number) {
    target.garrison = { ...(target.garrison ?? {}), garrisonTroops: garrison, ownerEmpireId: B };
    target.tiles = (target.tiles ?? []).filter((t: any) => !String(t.tileId).startsWith('test-'));
    target.tiles.push(
        { tileId: 'test-shield', buildingId: 'shield_generator', constructionState: 'active', sectorIndex: 40 },
        { tileId: 'test-guns', buildingId: 'orbital_defense_platform', constructionState: 'active', sectorIndex: 41 },
    );
    target.orbital = { slots: [{ slotId: 's1', structureId: 'orbital_defense_network', state: 'active', completesAt: null, integrity: 100 }], buildQueue: [] };
}

let n = 0;
/** A fleet parked over the target carrying one army. */
function raidingParty(composition: Record<string, number>): { fleet: any; army: any } {
    n++;
    const fleet: any = { id: `fleet-raid-${n}`, factionId: A, name: `Raiders ${n}`, currentSystemId: sys, destinationSystemId: null, composition: { destroyer: 2 }, basePower: 60, strength: 1, transportedArmyIds: [] };
    const army: any = { id: `army-raid-${n}`, factionId: A, name: `Commando ${n}`, currentPlanetId: null, currentSystemId: sys, transportFleetId: fleet.id, composition: { ...composition }, strength: 1, morale: 80 };
    fleet.transportedArmyIds.push(army.id);
    world.movement.fleets.set(fleet.id, fleet);
    world.movement.armies.set(army.id, army);
    return { fleet, army };
}

test('only Special Ops and Airborne raid, and no more than the cap', () => {
    assert.deepStrictEqual(raidersOf({ composition: { INFANTRY: 500 } }), {});
    const r = raidersOf({ composition: { SPECIAL_OPS: 250, AIRBORNE: 200, INFANTRY: 900 } });
    assert.strictEqual(r.SPECIAL_OPS, 250);
    assert.strictEqual((r.SPECIAL_OPS ?? 0) + (r.AIRBORNE ?? 0), RAID_MAX_MEN);
});

test('the odds: better troops raise them, a bigger garrison lowers them, always within the band', () => {
    fortify(200);
    const small = raidChance({ AIRBORNE: 50 }, target);
    const elite = raidChance({ SPECIAL_OPS: 200 }, target);
    assert.ok(elite > small, `${elite} > ${small}`);
    fortify(20000);
    assert.strictEqual(raidChance({ AIRBORNE: 10 }, target), RAID_MIN_CHANCE);
    fortify(0);
    assert.ok(raidChance({ SPECIAL_OPS: 300 }, target) <= RAID_MAX_CHANCE);
});

test('a raid is refused without raiders, in peace, or from a fleet still moving', () => {
    fortify(200);
    const { fleet } = raidingParty({ INFANTRY: 400 });
    assert.ok(!commandoRaid(world, A, fleet.id, target.id, 'shield', isAtWar).ok);
    const p = raidingParty({ SPECIAL_OPS: 100 });
    setWar(false);
    assert.match(commandoRaid(world, A, p.fleet.id, target.id, 'shield', isAtWar).reason ?? '', /not at war/);
    setWar(true);
    p.fleet.destinationSystemId = 'elsewhere';
    assert.match(commandoRaid(world, A, p.fleet.id, target.id, 'shield', isAtWar).reason ?? '', /parked/);
});

/** Run raids with fresh parties until one comes out the way we want. */
function raidUntil(want: boolean, target_: 'shield' | 'guns' | 'uplink', comp: Record<string, number>) {
    for (let i = 0; i < 60; i++) {
        fortify(200);
        const party = raidingParty(comp);
        world.nowSeconds += 1;
        const r = commandoRaid(world, A, party.fleet.id, target.id, target_, isAtWar);
        assert.ok(r.ok, r.reason);
        if (r.success === want) return { r, ...party };
    }
    throw new Error(`no ${want ? 'successful' : 'failed'} raid in 60 tries`);
}

test('a successful raid knocks the shield out and costs some raiders, none captured', () => {
    const { r, army } = raidUntil(true, 'shield', { SPECIAL_OPS: 200 });
    assert.strictEqual(target.tiles.find((t: any) => t.tileId === 'test-shield').constructionState, 'ruined');
    assert.ok((r.lost ?? 0) > 0 && (r.lost ?? 0) < 200, `lost ${r.lost}`);
    assert.strictEqual(r.captured, 0);
    assert.strictEqual(army.composition.SPECIAL_OPS, 200 - r.lost!);
});

test('the uplink raid takes the orbital defences offline; the guns raid spikes the platforms', () => {
    raidUntil(true, 'uplink', { SPECIAL_OPS: 200 });
    assert.strictEqual(target.orbital.slots[0].state, 'offline');
    raidUntil(true, 'guns', { SPECIAL_OPS: 200 });
    assert.strictEqual(target.tiles.find((t: any) => t.tileId === 'test-guns').constructionState, 'ruined');
});

test('a failed raid leaves the target standing; the survivors are taken prisoner', () => {
    const before = ensureLedger(world.combat).groups.length;
    const { r, fleet } = raidUntil(false, 'shield', { AIRBORNE: 40, INFANTRY: 100 });
    assert.strictEqual(target.tiles.find((t: any) => t.tileId === 'test-shield').constructionState, 'active');
    assert.ok((r.captured ?? 0) > 0);
    const pow = ensureLedger(world.combat).groups.slice(before);
    assert.ok(pow.some(g => g.captorEmpireId === B && g.ownerEmpireId === A && g.unitType === 'AIRBORNE'));
    const army = world.movement.armies.get(fleet.transportedArmyIds[0]);
    assert.strictEqual(army.composition.AIRBORNE, undefined, 'the raiders are gone');
    assert.strictEqual(army.composition.INFANTRY, 100, 'the infantry stayed aboard');
});

test('an army wiped out on a raid leaves the fleet', () => {
    const { fleet, army } = raidUntil(false, 'guns', { AIRBORNE: 30 });
    assert.ok(!world.movement.armies.has(army.id));
    assert.ok(!fleet.transportedArmyIds.includes(army.id));
});

test('the same force cannot raid again until it has recovered', () => {
    fortify(200);
    const { fleet } = raidingParty({ SPECIAL_OPS: 300 });
    const first = commandoRaid(world, A, fleet.id, target.id, 'shield', isAtWar);
    assert.ok(first.ok);
    if (!world.movement.armies.has(fleet.transportedArmyIds[0])) return;
    assert.match(commandoRaid(world, A, fleet.id, target.id, 'shield', isAtWar).reason ?? '', /recovering/);
    world.nowSeconds += RAID_COOLDOWN_SECONDS + 1;
    assert.ok(commandoRaid(world, A, fleet.id, target.id, 'shield', isAtWar).ok);
});

test('counter-intelligence restores what the raiders knocked out', () => {
    raidUntil(true, 'shield', { SPECIAL_OPS: 200 });
    restoreSabotage(world, B, sys);
    assert.strictEqual(target.tiles.find((t: any) => t.tileId === 'test-shield').constructionState, 'active');
});

test('through the worker: MIL_COMMANDO_RAID runs, and is refused cleanly in peace', () => {
    fortify(200);
    const { fleet } = raidingParty({ SPECIAL_OPS: 150 });
    setWar(false);
    silently(() => executeOrder(world, 'MIL_COMMANDO_RAID', { fleetId: fleet.id, planetId: target.id, target: 'guns' }, A));
    assert.match(lastError(A), /not at war/);
    setWar(true);
    const before = world.movement.armies.get(fleet.transportedArmyIds[0]).composition.SPECIAL_OPS;
    silently(() => executeOrder(world, 'MIL_COMMANDO_RAID', { fleetId: fleet.id, planetId: target.id, target: 'guns' }, A));
    const army = world.movement.armies.get(fleet.transportedArmyIds[0]);
    assert.ok(!army || army.composition.SPECIAL_OPS < before, 'the raid happened');
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
