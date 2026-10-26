// lib/outposts/outpost-sim.ts
// Stars of Dominion — one outpost shift (docs/outposts/README.md). Pure:
// `computeBalance` is what the screen shows and `runShift` is what the worker
// runs; both read only the outpost state and the small context passed in.

import type { ModuleId, OutpostBalance, OutpostState } from './outpost-types';
import {
    MODULES, cellOpen, neighborsOf, mineYield, COLONISTS_PER_UNIT, AIR_RESERVE_MAX, CHARTER_BONUS,
    PRISON_LABOUR_METALS, LOG_KEEP,
} from './outpost-catalog';
import { ensureRoster, healRoster, killColonists, leaveColonists, listNames, TRAIT_LABEL } from './colonists';

export interface BalanceContext {
    /** The world carries rare minerals: ore yields rares too. */
    rareWorld?: boolean;
    /** Prisoners held here right now. */
    prisoners?: number;
    /** An enemy army is on the ground: nobody comes, morale sinks. */
    besieged?: boolean;
}

/** Built, open, not switched off, not knocked out. */
export function moduleActive(state: OutpostState, index: number): boolean {
    const cell = state.cells[index];
    if (!cell?.module) return false;
    if (cell.buildDoneShift !== undefined && cell.buildDoneShift > state.shift) return false;
    if (cell.off) return false;
    if ((cell.downUntilShift ?? 0) > state.shift) return false;
    return cellOpen(index, state.tier);
}

export function moduleBuilt(state: OutpostState, index: number): boolean {
    const cell = state.cells[index];
    return !!cell?.module && !(cell.buildDoneShift !== undefined && cell.buildDoneShift > state.shift);
}

export function countModules(state: OutpostState, id: ModuleId, activeOnly = true): number {
    let n = 0;
    state.cells.forEach((c, i) => {
        if (c.module === id && (activeOnly ? moduleActive(state, i) : moduleBuilt(state, i))) n++;
    });
    return n;
}

function effectSum(state: OutpostState, kind: string): number {
    return state.effects.filter(e => e.kind === kind && e.untilShift > state.shift).reduce((s, e) => s + e.value, 0);
}

function hasEffect(state: OutpostState, kind: string): boolean {
    return state.effects.some(e => e.kind === kind && e.untilShift > state.shift);
}

export function computeBalance(state: OutpostState, ctx: BalanceContext = {}): OutpostBalance {
    const prisoners = ctx.prisoners ?? 0;
    const candidates = state.cells
        .map((c, i) => ({ i, def: c.module ? MODULES[c.module] : null }))
        .filter(x => x.def && moduleActive(state, x.i))
        .sort((a, b) => a.def!.priority - b.def!.priority || a.i - b.i);

    // Workers first, in priority order. The hurt and the sick do not work
    // (colonists.ts); a roster-less save counts everyone.
    const unfitCount = state.roster ? state.roster.filter(c => c.status !== 'well').length : 0;
    let workersFree = Math.max(0, state.colonists - unfitCount);
    let workersNeeded = 0;
    const staffed: typeof candidates = [];
    const idle: OutpostBalance['idle'] = [];
    for (const x of candidates) {
        workersNeeded += x.def!.workers;
        if (x.def!.workers > workersFree) { idle.push({ cell: x.i, reason: 'workers' }); continue; }
        workersFree -= x.def!.workers;
        staffed.push(x);
    }

    // Then power: staffed generators make it, consumers take it in priority order.
    const solarFactor = hasEffect(state, 'solar_down') ? 0.4 : 1;
    let powerMade = 0;
    for (const x of staffed) {
        if (x.def!.power > 0) powerMade += x.def!.id === 'solar' ? x.def!.power * solarFactor : x.def!.power;
    }
    let powerUsed = 0;
    const running: number[] = [];
    for (const x of staffed) {
        const draw = Math.max(0, -x.def!.power);
        if (draw > 0 && powerUsed + draw > powerMade + 1e-9) { idle.push({ cell: x.i, reason: 'power' }); continue; }
        powerUsed += draw;
        running.push(x.i);
    }
    const runs = (id: ModuleId) => running.filter(i => state.cells[i].module === id);

    let airMade = 0, foodMade = 0, storage = 0, prisonCapacity = 0;
    for (const i of running) {
        const def = MODULES[state.cells[i].module!];
        airMade += def.air ?? 0;
        if (def.id === 'life_support' && neighborsOf(i).some(n => state.cells[n].terrain === 'ice')) airMade += 1;
        foodMade += def.food ?? 0;
        storage += def.storage ?? 0;
        prisonCapacity += (def.prison ?? 0) * (state.charter === 'prison' && def.prison ? CHARTER_BONUS : 1);
    }
    prisonCapacity = Math.floor(prisonCapacity);

    // Housing stands whether or not the dome is powered (a cold dome costs morale).
    let housing = 0;
    let coldDomes = 0;
    state.cells.forEach((c, i) => {
        if (!c.module || !moduleBuilt(state, i) || !cellOpen(i, state.tier) || (c.downUntilShift ?? 0) > state.shift) return;
        housing += MODULES[c.module].housing ?? 0;
        if (c.module === 'habitat' && !running.includes(i)) coldDomes++;
    });

    const airUsed = Math.ceil(state.colonists / COLONISTS_PER_UNIT) + effectSum(state, 'air_leak');
    const foodUsed = Math.ceil(state.colonists / COLONISTS_PER_UNIT) + Math.ceil(prisoners / 10);

    // Output needs somewhere to go: a working warehouse.
    const output: Record<string, number> = {};
    if (runs('warehouse').length > 0) {
        if (!hasEffect(state, 'mines_down')) {
            const mult = (state.charter === 'mining' ? CHARTER_BONUS : 1) * (1 + effectSum(state, 'output_boost'));
            for (const i of runs('mine')) {
                for (const [k, v] of Object.entries(mineYield(state.cells[i].terrain, !!ctx.rareWorld))) {
                    output[k] = (output[k] ?? 0) + v * mult;
                }
            }
        }
        if (state.prisonLabour && prisoners > 0 && runs('cell_block').length > 0) {
            const mult = state.charter === 'prison' ? CHARTER_BONUS : 1;
            output.METALS = (output.METALS ?? 0) + prisoners * PRISON_LABOUR_METALS * mult;
        }
    }
    for (const k of Object.keys(output)) output[k] = Math.round(output[k]);

    let moraleTarget = 50
        + 8 * runs('commons').length
        + 5 * runs('command_post').length
        + (state.charter === 'settlement' ? 5 : 0)
        - (state.colonists > housing ? 12 : 0)
        - 5 * coldDomes
        - 3 * idle.filter(x => x.reason === 'power').length
        - (state.air <= 0 ? 20 : 0)
        - (state.food <= 0 ? 15 : 0)
        - (state.prisonLabour ? 4 : 0)
        - (ctx.besieged ? 15 : 0)
        + effectSum(state, 'morale');
    moraleTarget = Math.max(0, Math.min(100, moraleTarget));

    return {
        powerMade: Math.round(powerMade * 10) / 10, powerUsed,
        airMade, airUsed, foodMade, foodUsed,
        housing, workersNeeded, workersFree,
        running, idle, storage, prisonCapacity, output, moraleTarget,
    };
}

export function log(state: OutpostState, text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
    state.log.unshift({ shift: state.shift, text, tone });
    if (state.log.length > LOG_KEEP) state.log.length = LOG_KEEP;
}

export interface ShiftResult {
    balance: OutpostBalance;
    deaths: number;
    arrivals: number;
    departures: number;
    /** Nobody left: the outpost is lost. */
    abandoned: boolean;
}

/**
 * Advance one shift: construction, air, food, output into the warehouse,
 * morale, arrivals and departures. Crises are the caller's (crises.ts).
 */
export function runShift(state: OutpostState, ctx: BalanceContext = {}): ShiftResult {
    state.shift += 1;

    state.cells.forEach(cell => {
        if (cell.buildDoneShift !== undefined && cell.buildDoneShift <= state.shift) {
            delete cell.buildDoneShift;
            log(state, `${MODULES[cell.module!].name} is up and running.`, 'good');
        }
        if (cell.clearingUntilShift !== undefined && cell.clearingUntilShift <= state.shift) {
            delete cell.clearingUntilShift;
            cell.terrain = 'flat';
            log(state, 'Crews cleared a rock field.', 'neutral');
        }
        if (cell.downUntilShift !== undefined && cell.downUntilShift <= state.shift) delete cell.downUntilShift;
    });
    state.effects = state.effects.filter(e => e.untilShift > state.shift);

    // Scars fade with time (crises.ts); the hurt and the sick mend (colonists.ts).
    if (state.scars) state.scars = state.scars.filter(s => s.untilShift > state.shift);
    ensureRoster(state);
    for (const name of healRoster(state)) log(state, `${name} is back on their feet.`, 'good');

    const balance = computeBalance(state, ctx);
    let deaths = 0, arrivals = 0, departures = 0;

    // Air.
    state.air += balance.airMade - balance.airUsed;
    if (state.air > AIR_RESERVE_MAX) state.air = AIR_RESERVE_MAX;
    if (state.air < 0) {
        const lost = Math.min(state.colonists, Math.ceil(-state.air));
        state.air = 0;
        const names = killColonists(state, lost, 'suffocated when the air ran out');
        deaths += names.length;
        log(state, `The air ran out in the outer domes. ${listNames(names)} ${names.length === 1 ? 'is' : 'are'} dead.`, 'bad');
    } else if (balance.airMade < balance.airUsed) {
        log(state, `Air reserve falling: ${state.air} left.`, 'bad');
    }

    // Food.
    state.food += balance.foodMade - balance.foodUsed;
    if (state.food < 0) {
        state.food = 0;
        if (state.colonists > 0) {
            const names = killColonists(state, 1, 'starved');
            deaths += names.length;
            log(state, `The stores are empty. ${listNames(names)} starved.`, 'bad');
        }
    }

    // Output into the warehouse, up to its capacity.
    let held = Object.values(state.warehouse).reduce((s, n) => s + n, 0);
    for (const [k, v] of Object.entries(balance.output)) {
        const fits = Math.max(0, Math.min(v, balance.storage - held));
        if (fits > 0) { state.warehouse[k] = (state.warehouse[k] ?? 0) + fits; held += fits; }
    }
    if (Object.keys(balance.output).length && held >= balance.storage) log(state, 'The warehouse is full; output is piling up outside.', 'bad');

    // Morale drifts to its target.
    const target = computeBalance(state, ctx).moraleTarget;
    const step = Math.max(-6, Math.min(5, target - state.morale));
    state.morale = Math.max(0, Math.min(100, Math.round(state.morale + step)));

    // People leave a miserable outpost, and come to a good one.
    if (state.morale < 25 && state.colonists > 0) {
        if (state.colonists === 1) {
            departures = 1;
            state.colonists = 0;
            if (state.roster) state.roster.length = 0;
            log(state, 'The last colonist took the supply shuttle home.', 'bad');
        } else {
            const names = leaveColonists(state, 1);
            departures = names.length;
            log(state, `${listNames(names)} took the supply shuttle home and did not come back.`, 'bad');
        }
    } else if (!ctx.besieged && state.colonists < balance.housing && state.food > 0 && state.air > 0 && state.morale >= 40) {
        arrivals = 1
            + (countModules(state, 'dock') > 0 ? 1 : 0)
            + (countModules(state, 'medbay') > 0 ? 1 : 0)
            + (state.charter === 'settlement' ? 1 : 0);
        arrivals = Math.min(arrivals, balance.housing - state.colonists);
        state.colonists += arrivals;
        const named = ensureRoster(state);
        if (arrivals > 0) log(state, `${listNames(named.map(c => `${c.name} (${TRAIT_LABEL[c.trait].toLowerCase()})`))} arrived.`, 'good');
    }

    // killColonists already counted its own; the count must match the names.
    ensureRoster(state);
    return { balance, deaths, arrivals, departures, abandoned: state.colonists <= 0 };
}
