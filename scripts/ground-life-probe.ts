// scripts/ground-life-probe.ts
// Does a ground war feel like a war? AI against AI on real empire pairs,
// through the worker's own handlers, measuring what the ground-war refine was
// for: how long a planet holds, how often something actually happens in a
// cycle (fights, districts changing hands, friction, decisions), and whether
// numbers still decide it. The pacing targets live in the checks at the end.
//
// Run:  npx tsx scripts/ground-life-probe.ts [runsPerScenario=4]

import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import { executeOrder, processSieges } from './game-loop';
import { aiCommandGroundWars } from '../lib/ai/war-ai';
import { registerActOfWar } from '../lib/diplomacy/offer-service';
import { pacing } from '../lib/combat/siege/siege-pacing';
import type { Formation } from '../lib/combat/siege/formations';
import { fogView, stripGroundSecrets } from '../lib/combat/siege/ground-fog';
import { generateSurface } from '../lib/planet-surface/generator';
import { legalMoves } from '../lib/combat/siege/formations';
import { roadLinkKeys } from '../lib/planet-surface/roads';

const RUNS = Number(process.argv[2] ?? 4);
const MAX_CYCLES = 72; // six real hours

let failures = 0;
const say = (line: string) => process.stdout.write(line + '\n');
const check = (label: string, ok: boolean, detail = '') => {
    if (!ok) failures++;
    say(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

pacing.cycleLengthTicks = 4;
const world: any = bootSoakWorld();
const ids = empireIds(world);
const quiet = quietConsole(() => false);
world.claimedFactionIds = []; // everyone is AI-run

const mkFleet = (id: string, factionId: string, systemId: string, power: number, armyIds: string[]) => {
    const template: any = [...world.movement.fleets.values()].find((f: any) => f.factionId === factionId);
    const fleet: any = {
        ...(template ?? { activeLayer: null, transitProgress: 0, etaSeconds: 0, plannedPath: [], orders: [], doctrine: 'balanced', postureId: 'balanced' }),
        id, factionId, name: id, currentSystemId: systemId, destinationSystemId: null, orbitingPlanetId: null,
        strength: 1, basePower: power, composition: { cruiser: Math.max(1, Math.round(power / 45)) }, transportedArmyIds: armyIds,
    };
    delete fleet.aiMission;
    world.movement.fleets.set(id, fleet);
    return fleet;
};
const mkArmy = (id: string, factionId: string, composition: Record<string, number>, at: { planetId: string | null; systemId: string; fleetId: string | null }) => {
    if (!world.movement.armies) world.movement.armies = new Map();
    world.movement.armies.set(id, {
        id, factionId, name: id, currentPlanetId: at.planetId, currentSystemId: at.systemId, transportFleetId: at.fleetId,
        composition: { ...composition }, stance: 'fortified', strength: 1, basePower: 100, supplyLevel: 1, morale: 100,
    });
};

interface Run {
    pair: string;
    cycles: number;
    outcome: 'held' | 'lost' | 'fighting';
    foughtCycles: number;
    /** Cycles where anything happened: a fight, a district changing hands, friction, a call-in. */
    eventful: number;
    fights: number;
    swings: number;
    events: number;
    moments: number;
    callIns: number;
    veterans: number;
    /** Road links the world had, and how many times someone blew them. */
    roads: number;
    demolitions: number;
}

/**
 * A commander's answer to a moment, sent the way the decision card sends it
 * (MIL_GROUND_MOMENT through executeOrder), and what the next cycle did with it.
 */
const momentOrder: { sent?: string; label?: string; applied?: string[]; refusal?: string } = {};

function invade(A: string, B: string, scale: number, tag: string): Run | null {
    const planet: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === B && !p.siege && !p.probeUsed);
    if (!planet) return null;
    planet.probeUsed = true;
    for (const [id, f] of [...world.movement.fleets.entries()] as Array<[string, any]>) {
        if (f.factionId === B && f.currentSystemId === planet.systemId && !id.startsWith('life-')) f.currentSystemId = 'probe-elsewhere';
    }
    planet.garrison = undefined;
    registerActOfWar(world, A, B);
    const army = { INFANTRY: Math.round(2600 * scale), ARMOR: Math.round(400 * scale), ARTILLERY: Math.round(250 * scale), AIRBORNE: Math.round(150 * scale) };
    const fleet = mkFleet(`life-fleet-${tag}`, A, planet.systemId, 400, [`life-army-${tag}`]);
    mkArmy(`life-army-${tag}`, A, army, { planetId: null, systemId: planet.systemId, fleetId: fleet.id });
    mkArmy(`life-home-${tag}`, B, { INFANTRY: 2600, ANTI_ARMOR: 400, ARTILLERY: 250, MILITIA: 150 }, { planetId: planet.id, systemId: planet.systemId, fleetId: null });
    for (let i = 0; i < 120 && !planet.siege; i++) {
        executeOrder(world, 'MIL_INVASION_PLANET', { fleetId: fleet.id, planetId: planet.id, systemId: planet.systemId }, A);
    }
    const siege: any = planet.siege;
    if (!siege?.districts) return null;

    const run: Run = { pair: `${A.replace('faction-', '')}→${B.replace('faction-', '')}`, cycles: 0, outcome: 'fighting',
        foughtCycles: 0, eventful: 0, fights: 0, swings: 0, events: 0, moments: 0, callIns: 0, veterans: 0, roads: 0, demolitions: 0 };
    const tick = () => { aiCommandGroundWars(world); processSieges(world); world.nowSeconds += 75; };
    let control = JSON.stringify(siege.districts.control);
    for (let c = 0; c < MAX_CYCLES && planet.siege; c++) {
        const before = siege.cycleCount;
        const callInsBefore = run.callIns;
        // Once per probe: answer an open moment with a choice that is not its default.
        if (!momentOrder.sent) {
            const m = (siege.districts.moments ?? []).find((x: any) => !x.resolved && x.choices.some((c: any) => c.id !== x.defaultChoice));
            if (m) {
                const choice = m.choices.find((c: any) => c.id !== m.defaultChoice);
                const who = m.side === 'attacker' ? siege.attackerEmpireId : siege.defenderEmpireId;
                aiCommandGroundWars(world); // the AI answers first; the order must still stand
                executeOrder(world, 'MIL_GROUND_MOMENT', { planetId: planet.id, momentId: m.id, choiceId: choice.id }, who);
                momentOrder.sent = m.chosen === choice.id ? m.id : undefined;
                momentOrder.label = choice.label;
                momentOrder.refusal = world.economy.factions.get(who)?.lastOrderError?.reason;
                if (momentOrder.sent) momentOrder.applied = undefined;
            }
        }
        while (siege.cycleCount === before && planet.siege) {
            const was = (siege.districts.callIns ?? []).length;
            tick();
            if (siege.cycleCount === before) run.callIns += Math.max(0, (siege.districts.callIns ?? []).length - was);
        }
        const war = siege.districts;
        const report = war.lastReport;
        if (momentOrder.sent && !momentOrder.applied) momentOrder.applied = (report?.events ?? []).filter((e: any) => e.kind === 'decision').map((e: any) => e.text);
        run.cycles = siege.cycleCount;
        if (report?.districts?.length) { run.foughtCycles++; run.fights += report.districts.length; }
        run.events += report?.events?.length ?? 0;
        run.moments += (war.moments ?? []).length;
        if (process.env.LIFE_TRACE) {
            const men = (side: string) => (war.formations ?? []).filter((f: any) => f.side === side).reduce((a: number, f: any) => a + f.strength, 0);
            const held = Object.values(war.control).filter(v => v === 'attacker').length;
            say(`    c${siege.cycleCount} A${men('attacker')} D${men('defender')} held${held} cap${war.capitalHeldCycles ?? 0} orbit:${siege.orbit?.holder} bomb:${siege.bombardment?.killed ?? 0} fights:${report?.districts?.length ?? 0} | ${(siege.battleLog ?? []).filter((e: any) => e.cycle === siege.cycleCount).map((e: any) => e.message).join(' / ').slice(0, process.env.LIFE_TRACE === '2' ? 3000 : 150)}`);
        }
        const now = JSON.stringify(war.control);
        if (now !== control) run.swings++;
        if (report?.districts?.length || now !== control || report?.events?.length || run.callIns > callInsBefore) run.eventful++;
        control = now;
    }
    const forms: Formation[] = siege.districts?.formations ?? [];
    run.veterans = forms.filter(f => (f.xp ?? 0) >= 3).length;
    run.roads = (siege.districts?.roads ?? []).length + Object.keys(siege.districts?.roadsCut ?? {}).length;
    run.demolitions = siege.battleLog.filter((e: any) => /Engineers blow the roads/.test(e.message)).length;
    run.outcome = planet.siege ? 'fighting' : planet.ownerId === B ? 'held' : 'lost';
    planet.siege = null;
    planet.ownerId = B;
    return run;
}

function scenario(label: string, scale: number): Run[] {
    say(`\n${label}`);
    const runs: Run[] = [];
    for (let i = 0; runs.length < RUNS && i < ids.length * 2; i++) {
        const A = ids[i % ids.length];
        const B = ids[(i + 3) % ids.length];
        if (A === B) continue;
        const r = invade(A, B, scale, `${label.slice(0, 3)}-${i}`);
        if (!r) continue;
        runs.push(r);
        say(`  ${r.pair.padEnd(34)} ${r.outcome.padEnd(8)} ${String(r.cycles).padStart(3)} cycles (${(r.cycles / 12).toFixed(1)} h) · fought ${r.foughtCycles}/${r.cycles} · ${r.fights} fights · ${r.swings} swings · ${r.events} friction · ${r.moments} moments · ${r.callIns} call-ins · ${r.veterans} veteran pieces · ${r.roads} roads, ${r.demolitions} blown`);
    }
    return runs;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

const equal = scenario('Equal forces, invader holds the orbit', 1);
const big = scenario('1.5× invader, invader holds the orbit', 1.5);
quiet.restore();

say('\nChecks');
const eqCycles = median(equal.map(r => r.cycles));
// No strongpoints here: ground-war-probe holds the fortified case to two hours.
check('an equal invasion of an unfortified world lasts an hour and a half (median)', eqCycles >= 18, `${eqCycles} cycles`);
check('and ends in a decision or a long grind, not a stalemate on day one', equal.every(r => r.fights > 0));
const total = Math.max(1, equal.reduce((s, r) => s + r.cycles, 0));
const share = equal.reduce((s, r) => s + r.eventful, 0) / total;
check('something happens most cycles (a fight, ground changing hands, friction, a call-in)', share >= 0.7, `${Math.round(share * 100)}% of cycles`);
// Per war, not pooled: one six-hour grind under bombardment (a quagmire,
// which is allowed) would otherwise outweigh every war that was fought.
const fightShare = equal.reduce((s, r) => s + r.foughtCycles, 0) / total;
const fightMedian = median(equal.map(r => r.foughtCycles / Math.max(1, r.cycles)));
check('and in the typical war a fight in at least a quarter of them', fightMedian >= 0.25, `median ${Math.round(fightMedian * 100)}% (pooled ${Math.round(fightShare * 100)}%)`);
check('the line moves back and forth', median(equal.map(r => r.swings)) >= 4, `median ${median(equal.map(r => r.swings))} swings`);
check('friction happens', equal.every(r => r.events > 0));
check('commanders get decisions', equal.some(r => r.moments > 0));
check('formations become veterans', equal.some(r => r.veterans > 0));
check('an answer to a moment is taken (MIL_GROUND_MOMENT)', !!momentOrder.sent, momentOrder.refusal ?? momentOrder.label ?? 'no moment came up');
check('and applied at the next cycle instead of the default', (momentOrder.applied ?? []).some(t => t.includes(`${momentOrder.label} —`)), (momentOrder.applied ?? []).join(' / ').slice(0, 200));
check('the worlds have roads on the war board', [...equal, ...big].some(r => r.roads > 0));
check('defenders blow roads in front of enemy armour', [...equal, ...big].some(r => r.demolitions > 0));
const lostEq = equal.filter(r => r.outcome === 'lost').length / Math.max(1, equal.length);
const lostBig = big.filter(r => r.outcome === 'lost').length / Math.max(1, big.length);
// With five runs a side, one lucky defence swings the win rate by 20 points;
// the median time to fall is the steadier measure of what numbers buy.
say(`  (worlds taken: equal ${Math.round(lostEq * 100)}%, 1.5x ${Math.round(lostBig * 100)}%)`);
check('numbers still decide it: a bigger invasion takes a world faster (median)', median(big.filter(r => r.outcome === 'lost').map(r => r.cycles)) <= (median(equal.filter(r => r.outcome === 'lost').map(r => r.cycles)) || Infinity), `${median(big.filter(r => r.outcome === 'lost').map(r => r.cycles))} vs ${median(equal.filter(r => r.outcome === 'lost').map(r => r.cycles))} cycles`);
// Thrown back = the defender won; a war still being fought at six hours is neither.
const heldEq = equal.filter(r => r.outcome === 'held').length / Math.max(1, equal.length);
const heldBig = big.filter(r => r.outcome === 'held').length / Math.max(1, big.length);
check('and a bigger invasion is not thrown back more often than an equal one, give or take one run', heldBig <= heldEq + 1 / Math.max(1, big.length) + 1e-9, `${Math.round(heldBig * 100)}% vs ${Math.round(heldEq * 100)}%`);

// Fog: the shared snapshot carries no pieces, each side only sees what it can.
{
    const p: any = [...world.construction.planets.values()].find((x: any) => x.probeUsed);
    const surface = generateSurface(p.id, p.planetType, p.tags);
    const near = surface.sectors[5].neighbors.find(n => n !== 0) ?? surface.sectors[5].neighbors[0];
    const war: any = { control: { 5: 'attacker' }, landingZones: [5], contested: [], entrenchment: {},
        formations: [
            { id: 'a1', side: 'attacker', unitType: 'INFANTRY', strength: 500, sectorIndex: 5, supply: 100 },
            { id: 'd-near', side: 'defender', unitType: 'INFANTRY', strength: 412, sectorIndex: near, supply: 100 },
            { id: 'd-far', side: 'defender', unitType: 'INFANTRY', strength: 400, sectorIndex: 0, supply: 100 },
        ] };
    const view = fogView(surface, war, 'attacker', 3, 'none');
    const seen = (view.formations ?? []).map((f: any) => f.id);
    check('fog: you see the enemy next to you', seen.includes('d-near'));
    check('fog: and not the enemy beyond your sight', !seen.includes('d-far') || view.visible.includes(0));
    const est = (view.formations ?? []).find((f: any) => f.id === 'd-near');
    check('fog: their numbers are an estimate', !!est && est.strength % 25 === 0, `${est?.strength}`);
    check('fog: holding the orbit shows everything', (fogView(surface, war, 'attacker', 3, 'attacker').formations ?? []).some((f: any) => f.id === 'd-far'));
    const tree: any = { construction: { planets: { __map__: true, data: { [p.id]: { ...p, siege: { attackerEmpireId: 'x', defenderEmpireId: 'y', districts: war } } } } } };
    stripGroundSecrets(tree);
    check('fog: the shared snapshot has no formations', !tree.construction.planets.data[p.id].siege.districts.formations);

    // Roads: a tank on a road goes further than off it.
    const developed = surface.sectors.filter(sec => sec.ring >= 3 && sec.terrain !== 'ocean').map(sec => sec.index);
    const roads = roadLinkKeys(surface, developed);
    const onRoad = Number(roads[Math.floor(roads.length / 2)].split('-')[0]);
    const tank: any = { id: 't', side: 'defender', unitType: 'ARMOR', strength: 300, sectorIndex: onRoad, supply: 100 };
    const board: any = { control: {}, landingZones: [], contested: [], entrenchment: {}, formations: [tank] };
    const offRoad = legalMoves(surface, board, tank).length;
    const withRoads = legalMoves(surface, { ...board, roads }, tank).length;
    check('roads: armour on a road reaches further', withRoads > offRoad, `${offRoad} → ${withRoads} districts`);
}

say(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(0);
