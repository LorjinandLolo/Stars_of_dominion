// scripts/economy-pace-probe.ts
// How fast does an empire's treasury fill?
//
// Until 2026-10-06 the state's cut of production was taken AFTER the factories
// drew their inputs, so metals and chemicals were always already gone: every
// faction's metal reserve sat at its starting stock all season, anything that
// cost more could never be built, and the food tax alone paid ~2M credits per
// real day. The cut is now taken at extraction, and productionTaxRate is the
// pace dial (see lib/economy/economy-service.ts, collectFactionTaxes).
// A colony costs 1k metals and 20k credits; at this pace a fresh capital pays
// for one in about five real hours of income.
//
// A season of the real strategic tick, shaped like the playtest: ten empires
// claimed and left to their advisors (nobody spends, so their reserves show
// pure income), four run by the AI. Reports income per REAL day (15 sim days).
//
// Claimed empires never expand (their advisors do not colonise), so they show
// the one-world baseline; the AI empires expand and show what growth buys.
//
// Run:  npx tsx scripts/economy-pace-probe.ts            (a full season)
//       npx tsx scripts/economy-pace-probe.ts 300 b      (shorter, seed b)

import { SEASON_TICKS, bootSoakWorld, empireIds, quietConsole, seedSimulation, stepSoak } from './soak-harness';
import { drainBuffer } from '../lib/narrative/chronicle';

const ticks = Math.max(8, Number(process.argv[2]) || SEASON_TICKS);
const seed = process.argv[3] ?? 'a';
const HUMAN_SEATS = 10;
const TICKS_PER_SIM_DAY = 4;
const SIM_DAYS_PER_REAL_DAY = 15;
const KEYS = ['METALS', 'CHEMICALS', 'FOOD', 'ENERGY', 'CREDITS'] as const;

/**
 * What a fresh empire (its capital only, as every season starts) banks per real
 * day at the 0.005 rate, measured 2026-10-06. Each colony adds roughly as much.
 */
const EXPECTED = { METALS: 6400, CREDITS: 90000 };

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const fmt = (n: number) => Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`;

async function main() {
    seedSimulation(seed);
    const quiet = quietConsole();
    let world = bootSoakWorld();
    const ids = empireIds(world);
    const idle = ids.slice(0, HUMAN_SEATS);
    world.claimedFactionIds = [...idle];

    const start = new Map(ids.map(id => [id, { ...world.economy.factions.get(id).reserves }]));
    const piles = new Map<string, number>();

    for (let i = 1; i <= ticks; i++) {
        ({ world } = await stepSoak(world, i));
        drainBuffer();
    }
    for (const p of world.economy.planets.values() as Iterable<any>) {
        for (const k of ['ammo', 'military']) piles.set(k, (piles.get(k) ?? 0) + (p.stockpile?.[k] ?? 0));
    }
    quiet.restore();

    const realDays = ticks / TICKS_PER_SIM_DAY / SIM_DAYS_PER_REAL_DAY;
    console.log(`\nEconomy pace — ${ticks} ticks (${(ticks / TICKS_PER_SIM_DAY).toFixed(0)} sim days, ${realDays.toFixed(1)} real days), seed ${seed}`);
    console.log('Income per REAL day (idle = claimed, nothing spent; AI spends):\n');
    const perDay = new Map<string, Record<string, number>>();
    for (const id of ids) {
        const now = world.economy.factions.get(id).reserves;
        const s = start.get(id)!;
        const row: Record<string, number> = {};
        for (const k of KEYS) row[k] = ((now[k] ?? 0) - (s[k] ?? 0)) / realDays;
        perDay.set(id, row);
        const worlds = [...world.construction.planets.values()].filter((p: any) => p.ownerId === id).length;
        console.log(`${idle.includes(id) ? 'idle' : 'AI  '} ${id.padEnd(26)} ${worlds}w  ${KEYS.map(k => `${k.slice(0, 3)} ${fmt(row[k]).padStart(7)}`).join('  ')}`);
    }
    console.log(`\nManufactured stock piled on planets at the end: ${[...piles].map(([k, v]) => `${k} ${fmt(v)}`).join(', ')}`);

    const idleRows = idle.map(id => perDay.get(id)!);
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const metals = median(idleRows.map(r => r.METALS));
    const credits = median(idleRows.map(r => r.CREDITS));
    check('every idle empire banks metals', idleRows.every(r => r.METALS > 0),
        idle.filter((_, i) => idleRows[i].METALS <= 0).join(', '));
    check(`median idle metals within 2x of ~${fmt(EXPECTED.METALS)}/real day`,
        metals > EXPECTED.METALS / 2 && metals < EXPECTED.METALS * 2, fmt(metals));
    check(`median idle credits within 2x of ~${fmt(EXPECTED.CREDITS)}/real day`,
        credits > EXPECTED.CREDITS / 2 && credits < EXPECTED.CREDITS * 2, fmt(credits));
    check('a colony (1k metals, 20k credits) is under a real day of idle income',
        metals > 1000 && credits > 20000);

    console.log(`\n${results.join('\n')}`);
    console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
    process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
