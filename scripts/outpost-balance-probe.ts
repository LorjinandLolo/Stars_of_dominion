// scripts/outpost-balance-probe.ts
// How an outpost plays with a simple builder and nobody answering crises
// (the crew's fallback picks them). Prints shifts to settlement and colony,
// deaths and crises over many seeds. Run: npx tsx scripts/outpost-balance-probe.ts
import { createOutpostState } from '../lib/outposts/outpost-map';
import { runShift, computeBalance } from '../lib/outposts/outpost-sim';
import { rollCrisis, expireCrises, resolveCrisis } from '../lib/outposts/crises';
const ATTENTIVE = process.argv.includes('--attentive');
import { MODULES, TIERS, cellOpen, terrainOk } from '../lib/outposts/outpost-catalog';
import { RNG } from '../lib/trade-system/rng';
import type { ModuleId, OutpostState } from '../lib/outposts/outpost-types';

function place(s: OutpostState, m: ModuleId): boolean {
    const i = s.cells.findIndex((c, j) => cellOpen(j, s.tier) && !c.module && terrainOk(m, c.terrain));
    if (i < 0) {
        // Clear a rock field for next time.
        const r = s.cells.findIndex((c, j) => cellOpen(j, s.tier) && c.terrain === 'rock' && !c.module && c.clearingUntilShift === undefined);
        if (r >= 0) s.cells[r].clearingUntilShift = s.shift + 1;
        return false;
    }
    s.cells[i].module = m; s.cells[i].buildDoneShift = s.shift + MODULES[m].buildShifts;
    return true;
}
function bot(s: OutpostState) {
    const b = computeBalance(s);
    const has = (m: ModuleId) => s.cells.some(c => c.module === m);
    for (const m of TIERS[s.tier].next?.modules ?? []) if (!has(m) && place(s, m)) return;
    if (b.powerMade - b.powerUsed < 1) { if (place(s, 'solar') || place(s, 'geothermal')) return; }
    if (b.foodMade < b.foodUsed + 1) { if (place(s, 'hydroponics')) return; }
    if (b.airMade < b.airUsed + 1) { if (place(s, 'life_support')) return; }
    if (b.powerMade - b.powerUsed < 2) { if (place(s, 'solar') || place(s, 'geothermal')) return; }
    if (s.tier >= 2 && s.cells.filter(c => c.module === 'commons').length < 2 && s.morale < 62) { if (place(s, 'commons')) return; }
    if (s.colonists >= b.housing - 1) { if (place(s, 'habitat')) return; }
    if (s.tier >= 2 && !has('dock')) { if (place(s, 'dock')) return; }
    if (s.tier >= 2 && !has('warehouse')) { if (place(s, 'warehouse')) return; }
}
const seeds = 40;
const toSettle: number[] = [], toColony: number[] = [], deaths: number[] = [], crises: number[] = [];
let lost = 0;
for (let k = 0; k < seeds; k++) {
    const s = createOutpostState({ id: `probe-${k}`, planetType: k % 3 ? 'standard' : 'desert', tags: k % 4 ? [] : ['dead_matter'] }, 0);
    let settled = -1, colony = -1;
    for (let t = 0; t < 200 && colony < 0; t++) {
        bot(s);
        const ctx: any = { rng: new RNG(k * 1000 + t), hasGovernor: false, charge: () => true, prisoners: 0, losePrisoners: () => 0, researchBoost: () => null, experimentHours: () => 1, raidersNear: false };
        // An attentive player answers at once with the sensible choice; an absent one never does.
        if (ATTENTIVE) for (const c of [...s.crises]) resolveCrisis(s, ctx, c.id, c.steward);
        expireCrises(s, ctx);
        runShift(s);
        rollCrisis(s, ctx);
        if (s.colonists <= 0) { lost++; break; }
        const next = TIERS[s.tier].next;
        if (next && s.colonists >= next.colonists && s.morale >= next.morale && next.modules.every(m => s.cells.some(c => c.module === m)) ) {
            if (s.tier === 1) { s.tier = 2; settled = s.shift; } else { colony = s.shift; }
        }
    }
    if (process.argv.includes('--why') && colony < 0) { const b = computeBalance(s); console.log(k, 'tier', s.tier, 'col', s.colonists + '/' + b.housing, 'mor', s.morale + '->' + b.moraleTarget, 'food', b.foodMade + '-' + b.foodUsed, 'air', b.airMade + '-' + b.airUsed, 'pw', b.powerUsed + '/' + b.powerMade, 'idle', b.idle.length, 'empty', s.cells.filter((c, i) => !c.module && cellOpen(i, s.tier)).map(c => c.terrain).join(','), s.cells.filter(c => c.module).map(c => c.module).join(',')); }
    toSettle.push(settled); toColony.push(colony); deaths.push(s.stats.deaths); crises.push(s.stats.crisesFaced);
}
const med = (a: number[]) => { const v = a.filter(x => x >= 0).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : -1; };
console.log(`seeds ${seeds}, lost ${lost}`);
console.log(`settlement: median shift ${med(toSettle)} (${toSettle.filter(x => x >= 0).length} reached)  = ${med(toSettle) * 5} real min`);
console.log(`colony:     median shift ${med(toColony)} (${toColony.filter(x => x >= 0).length} reached)  = ${(med(toColony) * 5 / 60).toFixed(1)} real h`);
console.log(`deaths median ${med(deaths)}, crises median ${med(crises)}`);
