// scripts/reserve-probe.ts
// A world's reserve through the real order handlers: new ships wait in orbit and
// new troops in the garrison, both limited by what the world has built; Muster
// splits a named task force off the reserve and boards troops onto it; standing
// down folds units back. See lib/military/reserve.ts.
//
// Run:  npx tsx scripts/reserve-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { executeOrder } from './game-loop';
import { RecruitmentService } from '../lib/combat/recruitment-service';
import { reserveFleets, shipCapacity, shipsHeld, troopCapacity, troopsHeld, BASE_TROOP_CAPACITY, TROOPS_PER_BUILDING } from '../lib/military/reserve';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    seedSimulation('reserve');
    const realLog = console.log;
    quietConsole();
    const world: any = bootSoakWorld();
    const human = empireIds(world)[0];
    world.claimedFactionIds = [human];

    const planet: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === human);
    const reserves = world.economy.factions.get(human).reserves;
    for (const k of Object.keys(reserves)) reserves[k] = 10_000_000;
    planet.orbital = planet.orbital ?? { slots: [] };
    planet.tiles = planet.tiles ?? [];
    planet.tiles.push({ buildingId: 'barracks', constructionState: 'active' }, { buildingId: 'fleet_drydock', constructionState: 'active' });

    const cap = shipCapacity(planet, world.nowSeconds);
    const jobs = () => world.combat?.recruitmentJobs ?? [];
    const fleets = () => [...world.movement.fleets.values()] as any[];
    const finishJobs = () => {
        for (const j of jobs()) j.completesAt = world.nowSeconds - 1;
        RecruitmentService.tick(world);
    };

    // ── Ships ────────────────────────────────────────────────────────────────
    check('a yard gives ship room', cap > 0, `capacity ${cap}`);
    const build = () => executeOrder(world, 'MIL_BUILD_FLEET', { planetId: planet.id, systemId: planet.systemId, reserve: true, recruitUnitType: 'CORVETTE' }, human);
    build();
    build(); // a double click must not make a second reserve
    let reserve: any[] = reserveFleets(fleets(), planet, human);
    check('two commissions, one reserve fleet', reserve.length === 1, `${reserve.length}`);
    check('reserve is named for its world', reserve[0]?.name === `${planet.name} Reserve`, reserve[0]?.name);
    check('both ships are on order for it', shipsHeld(fleets(), jobs(), planet, human) === 2);
    finishJobs();
    check('ships arrive in the reserve', (reserve[0]?.composition?.corvette ?? 0) === 2, JSON.stringify(reserve[0]?.composition));

    for (let i = 0; i < cap + 2; i++) {
        executeOrder(world, 'MIL_RECRUIT_FORMATION_UNIT', { formationId: reserve[0].id, isFleet: true, unitType: 'CORVETTE', count: 1 }, human);
    }
    check('the reserve stops at capacity', shipsHeld(fleets(), jobs(), planet, human) === cap, `${shipsHeld(fleets(), jobs(), planet, human)} of ${cap}`);
    finishJobs();

    // ── Troops ───────────────────────────────────────────────────────────────
    const troopRoom = troopCapacity(planet);
    check('a barracks adds troop room', troopRoom >= BASE_TROOP_CAPACITY + TROOPS_PER_BUILDING.barracks, `${troopRoom}`);
    planet.garrison = undefined;
    for (let i = 0; i < Math.ceil(troopRoom / 10) + 3; i++) {
        executeOrder(world, 'PLANET_RECRUIT_UNITS', { planetId: planet.id, unitType: 'INFANTRY', count: 10 }, human);
    }
    check('recruits stop at capacity', troopsHeld(planet, jobs()) <= troopRoom, `${troopsHeld(planet, jobs())} of ${troopRoom}`);
    finishJobs();
    const inGarrison = planet.garrison?.unitComposition?.INFANTRY ?? 0;
    check('troops arrive in the garrison', inGarrison >= 100, `${inGarrison}`);

    // ── Muster: a named task force with troops aboard ────────────────────────
    const newId = `fleet-${human}-muster`;
    const before = reserve[0].composition.corvette;
    executeOrder(world, 'MIL_SPLIT_FLEET', { fleetId: reserve[0].id, composition: { corvette: 2 }, name: 'First Strike', newFleetId: newId }, human);
    const tf: any = world.movement.fleets.get(newId);
    check('split made the named task force at the id asked for', tf?.name === 'First Strike');
    check('a task force is not a reserve', tf && !tf.reserveOf);
    check('the reserve lost those ships', reserve[0].composition.corvette === before - 2);

    executeOrder(world, 'MIL_MUSTER_ARMY', { planetId: planet.id, composition: { INFANTRY: 60 }, name: 'First Strike Army', embarkFleetId: newId }, human);
    const army: any = [...world.movement.armies.values()].find((a: any) => a.name === 'First Strike Army');
    check('troops left the garrison', planet.garrison.unitComposition.INFANTRY === inGarrison - 60, `${planet.garrison.unitComposition.INFANTRY}`);
    check('garrison total follows', planet.garrison.garrisonTroops === inGarrison - 60, `${planet.garrison.garrisonTroops}`);
    check('the army is aboard', army?.transportFleetId === newId && tf.transportedArmyIds.includes(army.id) && army.currentPlanetId === null);
    check('the army has real power', (army?.basePower ?? 0) > 0, `${army?.basePower}`);

    executeOrder(world, 'MIL_MUSTER_ARMY', { planetId: planet.id, composition: { INFANTRY: 40 }, name: 'Home Guard' }, human);
    const guard: any = [...world.movement.armies.values()].find((a: any) => a.name === 'Home Guard');
    check('with no carrier the army stays on the ground', guard?.currentPlanetId === planet.id && !guard.transportFleetId);
    executeOrder(world, 'MIL_MUSTER_ARMY', { planetId: planet.id, composition: { INFANTRY: 1_000_000 }, name: 'Too Many' }, human);
    const after: any = [...world.movement.armies.values()].find((a: any) => a.name === 'Too Many');
    check('muster takes only what is there', (after?.composition?.INFANTRY ?? 0) === inGarrison - 100, `${after?.composition?.INFANTRY}`);
    executeOrder(world, 'MIL_STAND_DOWN_ARMY', { armyId: after.id }, human);
    executeOrder(world, 'MIL_STAND_DOWN_ARMY', { armyId: guard.id }, human);
    check('standing down folds armies back', planet.garrison.unitComposition.INFANTRY === inGarrison - 60 && !world.movement.armies.has(guard.id), `${planet.garrison.unitComposition.INFANTRY}`);

    planet.siege = { attackerEmpireId: 'x', defenderEmpireId: human };
    executeOrder(world, 'MIL_MUSTER_ARMY', { planetId: planet.id, composition: { INFANTRY: 10 }, name: 'Besieged' }, human);
    check('no muster under siege', ![...world.movement.armies.values()].some((a: any) => a.name === 'Besieged'));
    planet.siege = undefined;

    // ── The reserve in and out ───────────────────────────────────────────────
    executeOrder(world, 'MIL_MERGE_FLEETS', { sourceFleetId: newId, targetFleetId: reserve[0].id }, human);
    check('a task force stands down into the reserve', !world.movement.fleets.has(newId) && reserve[0].composition.corvette === before);
    check('the merged fleet is still the reserve', reserve[0].reserveOf === planet.id);
    executeOrder(world, 'MIL_SET_RESERVE', { fleetId: reserve[0].id, name: 'Whole Fleet' }, human);
    check('mustering every ship releases the fleet, renamed', !reserve[0].reserveOf && reserve[0].name === 'Whole Fleet');
    check('and the world has no reserve', reserveFleets(fleets(), planet, human).length === 0);
    executeOrder(world, 'MIL_SET_RESERVE', { fleetId: reserve[0].id, planetId: planet.id }, human);
    check('a task force can become the reserve', reserveFleets(fleets(), planet, human).length === 1);
    const gone = reserve[0];
    gone.destinationSystemId = 'elsewhere';
    check('a reserve that left stops counting', reserveFleets(fleets(), planet, human).length === 0);

    console.log = realLog;
    console.log(results.join('\n'));
    console.log(`\n${results.length - failures} passed, ${failures} failed.`);
    process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
