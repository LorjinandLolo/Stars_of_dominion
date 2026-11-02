// scripts/start-probe.ts
// The first day: every empire gets an exploration ship, a builder and three quick
// buildings, once; a human claiming a played-over empire is topped up once; the
// fourth building takes its normal time; Crash Program runs one project at four
// times the pace, for credits, one at a time.
//
// Run:  npx tsx scripts/start-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { executeOrder } from './game-loop';
import { grantStarterKits } from '../lib/start/starter-kit';
import { civilianCount } from '../lib/combat/civilian-ships';
import { startConstruction } from '../lib/construction/construction-service';
import { baseBuildSeconds, QUICK_BUILD_SECONDS, QUICK_BUILDS } from '../lib/construction/build-time';
import { BUILDINGS } from '../data/buildings';
import { TechEngine, registry } from '../lib/tech/engine';
import { crashCost, CRASH_SPEED } from '../lib/tech/crash-program';
import '../lib/tech/techData';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    seedSimulation('start');
    const realLog = console.log;
    quietConsole();
    const world: any = bootSoakWorld();
    const [human, ai] = empireIds(world);
    world.claimedFactionIds = [];

    const fleets = () => [...world.movement.fleets.values()] as any[];
    const ships = (id: string, ship: string) => fleets().filter(f => f.factionId === id).reduce((n, f) => n + civilianCount(f.composition, ship as any), 0);
    const capital = (id: string) => ([...world.construction.planets.values()] as any[])
        .filter(p => p.ownerId === id && p.systemId === world.economy.factions.get(id).capitalSystemId)
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];

    const first = grantStarterKits(world);
    check('every empire with a capital gets a kit', first.includes(human) && first.includes(ai), `${first.length}`);
    check('an exploration ship', ships(ai, 'explorer') === 1, `${ships(ai, 'explorer')}`);
    check('a builder', ships(ai, 'builder') === 1, `${ships(ai, 'builder')}`);
    check('it waits at the capital', fleets().find(f => f.id === `fleet-${ai}-starter-builder`)?.currentSystemId === capital(ai).systemId);
    check('three quick builds', capital(ai).quickBuildsLeft === QUICK_BUILDS);
    check('a second pass grants nothing', grantStarterKits(world).length === 0);

    // The AI spends its builder, then a human takes the empire over.
    world.movement.fleets.delete(`fleet-${ai}-starter-builder`);
    capital(ai).quickBuildsLeft = 0;
    check('AI spending its kit earns no new one', grantStarterKits(world).length === 0);
    world.claimedFactionIds = [ai, human];
    const claimed = grantStarterKits(world);
    check('claims top up once each', claimed.length === 2, claimed.join(','));
    check('the claimer has a builder again', ships(ai, 'builder') === 1);
    check('no doubled explorer', ships(ai, 'explorer') === 1);
    check('and quick builds again', capital(ai).quickBuildsLeft === QUICK_BUILDS);
    check('claims do not repeat', grantStarterKits(world).length === 0);

    // Three quick buildings, then normal time.
    const planet = capital(human);
    planet.buildQueue = [];
    const def = BUILDINGS.find(b => b.id === 'barracks')!;
    const normal = baseBuildSeconds(def);
    const site = (i: number) => { const tileId = `probe-${i}`; planet.tiles.push({ tileId, constructionState: 'empty', buildingId: null }); return tileId; };
    planet.dockedCivilians = { builders: 3 };
    const now = world.nowSeconds;
    for (let i = 0; i < QUICK_BUILDS; i++) startConstruction(planet, site(i), def.id, now, world);
    const quick = planet.buildQueue.map((o: any) => o.completesAtSeconds - now);
    check('first three land within two minutes', quick.length === 3 && quick.every((s: number) => s <= QUICK_BUILD_SECONDS), quick.join(','));
    check('quick builds are spent', planet.quickBuildsLeft === 0);
    startConstruction(planet, site(9), def.id, now, world);
    const fourth = planet.buildQueue[planet.buildQueue.length - 1];
    check('the fourth is not quick', fourth.queued || fourth.completesAtSeconds - now > QUICK_BUILD_SECONDS, `normal ${normal}`);

    // Crash program.
    const tech = registry.getAll().find(t => !t.prerequisites?.length)!;
    const reserves = world.economy.factions.get(human).reserves;
    let state = world.tech.get(human) ?? TechEngine.initPlayerState(human);
    world.tech.set(human, state);
    executeOrder(world, 'TECH_START_RESEARCH', { techId: tech.id }, human);
    state = world.tech.get(human);
    const slot: any = state.activeSlots.find((s: any) => s.techId === tech.id);
    check('research started', !!slot);
    const key = Object.keys(reserves).find(k => k.toLowerCase() === 'credits')!;
    reserves[key] = 1_000_000;
    const before = reserves[key];
    executeOrder(world, 'TECH_CRASH_PROGRAM', { techId: tech.id }, human);
    check('the slot goes on crash', slot.crash === true);
    check('the price is charged', before - reserves[key] === crashCost(tech.researchCost, 0, slot.ticksRequired), `${before - reserves[key]}`);
    const spent = reserves[key];
    executeOrder(world, 'TECH_CRASH_PROGRAM', { techId: tech.id }, human);
    check('one crash at a time, nothing charged twice', reserves[key] === spent);
    check('half done costs half', crashCost(100, 5, 10) === crashCost(100, 0, 10) / 2);
    check(`speed is ×${CRASH_SPEED}`, CRASH_SPEED === 4);

    console.log = realLog;
    console.log(results.join('\n'));
    console.log(`\n${results.length - failures} passed, ${failures} failed.`);
    process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
