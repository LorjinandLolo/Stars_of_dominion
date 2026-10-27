// scripts/ping-probe.ts
// Does a relay ping land on every kind of system? Players reported pings on
// Rim Nodes and Corsair Dens that never finished. This pings a sample of each
// name family through the worker's own order handler, advances the clock one
// loop at a time with the per-cycle exploration step, and reports what lands,
// what is refused and why.
//
// Run:  npx tsx scripts/ping-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { executeOrder } from './game-loop';
import { advanceExplorationNow } from '../lib/time/tick-processor';
import config from '../lib/movement/movement-config.json';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    seedSimulation('ping');
    const quiet = quietConsole(() => true);
    const world: any = bootSoakWorld();
    const me = empireIds(world)[0];
    world.claimedFactionIds = [me];
    world.economy.factions.get(me).reserves.CREDITS = 10_000_000;
    const vis = world.movement.factionVisibility.get(me);
    const family = (name: string) => (name ?? '').replace(/\s*\d+$/, '');
    const unknown = [...world.movement.systems.values()].filter((s: any) => (vis[s.id]?.revealStage ?? 'unknown') === 'unknown');
    const pick = (f: string, n: number) => unknown.filter((s: any) => family(s.name) === f).slice(0, n);
    const sample = [...pick('Rim Node', 4), ...pick('Corsair Den', 4), ...pick('Westfold', 2), ...unknown.filter((s: any) => !/^(Rim Node|Corsair Den|Westfold)/.test(s.name)).slice(0, 2)];
    check('plant: a sample of every family, all unknown', sample.length >= 10, sample.map((s: any) => s.name).join(', '));

    const refused: string[] = [];
    for (const s of sample) {
        const before = world.economy.factions.get(me).lastOrderError?.id;
        executeOrder(world, 'EXPLORE_RELAY_PING', { targetSystemId: s.id }, me);
        const err = world.economy.factions.get(me).lastOrderError;
        if (err && err.id !== before) refused.push(`${s.name}: ${err.reason}`);
    }
    check('every ping is accepted', refused.length === 0, refused.join(' | '));
    const orders = world.movement.explorationOrders.filter((o: any) => o.factionId === me && o.mode === 'ping');
    check('one order per system', orders.length === sample.length, `${orders.length}/${sample.length}`);

    // Loop the worker's per-cycle step until due (15 sim seconds per loop).
    let loops = 0;
    while (loops < 10) {
        world.nowSeconds += 15; loops++;
        advanceExplorationNow(world);
        if (sample.every((s: any) => vis[s.id]?.revealStage === 'pinged')) break;
    }
    const missing = sample.filter((s: any) => vis[s.id]?.revealStage !== 'pinged').map((s: any) => `${s.name}=${vis[s.id]?.revealStage ?? 'unknown'}`);
    check('every ping lands within its 30 sim seconds (a few loops)', missing.length === 0 && loops <= Math.ceil(config.exploration.pingDurationSeconds / 15) + 1, missing.join(', ') || `${loops} loops`);
    check('no ping is left in flight', !world.movement.explorationOrders.some((o: any) => o.mode === 'ping' && o.factionId === me));
    // ── The live bug: the movement clock was frozen months behind the game clock ──
    const extra = unknown.find((s: any) => (vis[s.id]?.revealStage ?? 'unknown') === 'unknown' && !sample.includes(s));
    world.movement.nowSeconds = world.nowSeconds - 90 * 86400;
    executeOrder(world, 'EXPLORE_RELAY_PING', { targetSystemId: extra.id }, me);
    const stale = world.movement.explorationOrders.find((o: any) => o.targetSystemId === extra.id);
    check('plant: a ping stamped on a frozen clock', !!stale && Date.parse(stale.completesAt) / 1000 < world.nowSeconds - 86400);
    world.nowSeconds += 15;
    advanceExplorationNow(world);
    check('the exploration step puts the movement clock on the game clock', world.movement.nowSeconds === world.nowSeconds);
    check('…and the stuck ping lands on that same loop', vis[extra.id]?.revealStage === 'pinged', vis[extra.id]?.revealStage ?? 'unknown');
    const fresh = unknown.find((s: any) => (vis[s.id]?.revealStage ?? 'unknown') === 'unknown' && s.id !== extra.id && !sample.includes(s));
    executeOrder(world, 'EXPLORE_RELAY_PING', { targetSystemId: fresh.id }, me);
    const o2 = world.movement.explorationOrders.find((o: any) => o.targetSystemId === fresh.id);
    check('a ping issued after that is stamped on the game clock (so the countdown is true)', !!o2 && Date.parse(o2.completesAt) / 1000 === world.nowSeconds + config.exploration.pingDurationSeconds);

    check('a pinged Corsair Den shows its name and lanes', sample.filter((s: any) => /Corsair Den/.test(s.name)).every((s: any) => !!vis[s.id] && Array.isArray(vis[s.id].visibleTags)));

    quiet.restore();
    console.log('\nping probe\n' + results.join('\n'));
    console.log(failures ? `\n${failures} FAILED` : '\nall ok');
    process.exit(failures ? 1 : 0);
}

main().catch(e => {
    process.stderr.write(`ping probe crashed: ${e?.stack ?? e}\n`);
    if (results.length) process.stderr.write(results.join('\n') + '\n');
    process.exit(1);
});
