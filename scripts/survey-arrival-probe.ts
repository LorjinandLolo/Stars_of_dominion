// scripts/survey-arrival-probe.ts
// Players pinged and nothing happened, and sent the exploration ship and still
// had to find a button. Two fixes, checked here:
//  1. exploration orders resolve on the worker's own loop
//     (advanceExplorationNow), not only at the 24-minute strategic tick;
//  2. an exploration ship at rest in an unsurveyed system surveys it for free.
//
// Run:  npx tsx scripts/survey-arrival-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { advanceExplorationNow } from '../lib/time/tick-processor';
import { autoSurveyOnArrival, issueRelayPing } from '../lib/exploration/exploration-service';
import { EXPLORER_TIME_FACTOR } from '../lib/combat/civilian-ships';
import config from '../lib/movement/movement-config.json';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    seedSimulation('survey-arrival');
    const quiet = quietConsole(() => true);
    const world: any = bootSoakWorld();
    const me = empireIds(world)[0];
    const capital = world.economy.factions.get(me).capitalSystemId;
    const vis = world.movement.factionVisibility.get(me) ?? {};
    world.movement.factionVisibility.set(me, vis);
    const stage = (sys: string) => vis[sys]?.revealStage ?? 'unknown';
    const neighbours: string[] = world.movement.systems.get(capital)?.hyperlaneNeighbors ?? [];
    const target = neighbours.find(n => stage(n) !== 'surveyed') ?? neighbours[0];
    check('plant: an unsurveyed neighbour', !!target && stage(target) !== 'surveyed', `${target} ${stage(target)}`);
    world.movement.explorationOrders = [];

    // ── 1. A relay ping lands on the next loop, not 24 minutes later ────────
    const far = [...world.movement.systems.keys()].find((id: string) => id !== capital && id !== target && stage(id) === 'unknown');
    issueRelayPing(me, far, capital, 250, world.movement);
    world.nowSeconds += config.exploration.pingDurationSeconds; world.movement.nowSeconds = world.nowSeconds;
    advanceExplorationNow(world);
    check('a ping is pinged one loop after it is due', stage(far) === 'pinged', stage(far));

    // ── 2. An exploration ship at rest surveys where it is ──────────────────
    const fleet = {
        id: 'probe-explorer', name: 'Probe Explorer', factionId: me, currentSystemId: target,
        destinationSystemId: null, plannedPath: [], basePower: 0, strength: 1, composition: { explorer: 1 },
    };
    world.movement.fleets.set(fleet.id, fleet);
    const moving = { ...fleet, id: 'probe-moving', destinationSystemId: capital, plannedPath: [capital] };
    world.movement.fleets.set(moving.id, moving);
    const warship = { ...fleet, id: 'probe-warship', composition: { destroyer: 2 } };
    world.movement.fleets.set(warship.id, warship);

    const started = autoSurveyOnArrival(world.movement);
    check('the explorer at rest starts a survey of its own system', started.length === 1 && started[0].fleetId === fleet.id && started[0].mode === 'survey' && started[0].targetSystemId === target,
        started.map(o => `${o.fleetId}:${o.mode}`).join(','));
    check('a moving explorer and a warship do not', !started.some(o => o.fleetId === moving.id || o.fleetId === warship.id));
    check('it runs at the explorer speed', Date.parse(started[0].completesAt) / 1000 - world.nowSeconds === Math.round(config.exploration.surveyDurationSeconds * EXPLORER_TIME_FACTOR));
    check('nothing doubles up on the next loop', autoSurveyOnArrival(world.movement).length === 0 && world.movement.explorationOrders.filter((o: any) => o.targetSystemId === target).length === 1);
    const credits = world.economy.factions.get(me).reserves.CREDITS;
    world.nowSeconds += config.exploration.surveyDurationSeconds; world.movement.nowSeconds = world.nowSeconds;
    advanceExplorationNow(world);
    check('the survey lands on the loop it is due', stage(target) === 'surveyed', stage(target));
    // An anomaly on a first survey may PAY credits; the survey itself must never charge.
    check('and it cost nothing', world.economy.factions.get(me).reserves.CREDITS >= credits, `${credits} -> ${world.economy.factions.get(me).reserves.CREDITS}`);
    check('a surveyed system is not surveyed again', autoSurveyOnArrival(world.movement).every(o => o.targetSystemId !== target));

    quiet.restore();
    console.log('\nsurvey on arrival probe\n' + results.join('\n'));
    console.log(failures ? `\n${failures} FAILED` : '\nall ok');
    process.exit(failures ? 1 : 0);
}

main().catch(e => {
    process.stderr.write(`survey probe crashed: ${e?.stack ?? e}\n`);
    if (results.length) process.stderr.write(results.join('\n') + '\n');
    process.exit(1);
});
