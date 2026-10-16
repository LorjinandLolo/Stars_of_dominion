// lib/outposts/outpost-service.ts
// Stars of Dominion — the worker side of outposts (docs/outposts/README.md):
// running shifts on the sim clock, the world effects crises and functions
// have (reserves, research, prisoners, fleets, sight), the OUTPOST_ORDER ops,
// and growing into a colony. Worker-side: imports world services.

import type { GameWorldState } from '../game-world-state';
import type { CharterId, ModuleId, OutpostState } from './outpost-types';
import {
    MODULES, CHARTERS, TIERS, cellOpen, terrainOk, SHIFT_SIM_SECONDS, CLEAR_ROCK_COST, CLEAR_ROCK_SHIFTS,
    SUPPLY_DROP, CHARTER_BONUS, CHARTER_LOCK_SHIFTS, EXPERIMENT_SHARE, EXPERIMENT_MIN_HOURS,
    EXPERIMENT_COOLDOWN_SHIFTS, EXPERIMENT_ACCIDENT_CHANCE, SUBJECT_GAIN, SUBJECT_DEATH_SHARE,
    DEPOT_REPAIR_PER_SHIFT, START_COLONISTS,
} from './outpost-catalog';
import { createOutpostState } from './outpost-map';
import { computeBalance, countModules, log, moduleActive, runShift } from './outpost-sim';
import { expireCrises, openCrisisOfKind, resolveCrisis, rollCrisis, type CrisisContext } from './crises';
import { RNG, seedFromString } from '../trade-system/rng';
import { isAtWar, shiftRivalry } from '../diplomacy/offer-service';
import { isCivilianFleet } from '../combat/civilian-ships';
import { ensureLedger } from '../combat/siege/prisoners';
import { registry as techRegistry } from '../tech/engine';
import { fireNotification } from '../time/notification-hooks';

/** Catch-up cap: a worker that was down does not run a day of shifts in one cycle. */
const MAX_SHIFTS_PER_CYCLE = 3;
/** Re-landing colonists on an outpost that lost everyone. */
export const RESETTLE_COST: Record<string, number> = { CREDITS: 1000 };

type AnyPlanet = any;

function reservesOf(world: GameWorldState, factionId: string): Record<string, number> | undefined {
    return world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined;
}

/** Positive amounts are charged (all or nothing); negative ones are paid out. */
export function chargeReserves(world: GameWorldState, factionId: string, cost: Record<string, number>): boolean {
    const r = reservesOf(world, factionId);
    if (!r) return false;
    for (const [k, v] of Object.entries(cost)) if (v > 0 && (r[k] ?? 0) < v) return false;
    for (const [k, v] of Object.entries(cost)) r[k] = (r[k] ?? 0) - v;
    return true;
}

function shortfall(world: GameWorldState, factionId: string, cost: Record<string, number>): string | null {
    const r = reservesOf(world, factionId) ?? {};
    for (const [k, v] of Object.entries(cost)) {
        if (v > 0 && (r[k] ?? 0) < v) return `Needs ${v.toLocaleString()} ${k.toLowerCase()} (you have ${Math.floor(r[k] ?? 0).toLocaleString()}).`;
    }
    return null;
}

function notify(world: GameWorldState, factionId: string, id: string, title: string, body: string, priority: 'urgent' | 'normal' = 'normal', outpostPlanetId?: string): void {
    try {
        fireNotification({
            id, factionId, category: 'crisis', priority, title, body, createdAt: new Date(world.nowSeconds * 1000).toISOString(), read: false,
            linkToTab: 'outposts', payload: outpostPlanetId ? { outpostPlanetId } : undefined,
        } as any);
    } catch { /* probes run without the notification queue */ }
}

// ─── Prisoners held at an outpost ────────────────────────────────────────────

function heldGroups(world: GameWorldState, state: OutpostState): any[] {
    const ledger = ensureLedger((world as any).combat ?? ((world as any).combat = { recruitmentJobs: [] }));
    const ids = new Set(state.prisonerGroupIds);
    const groups = ledger.groups.filter((g: any) => ids.has(g.id) && !g.resolved && g.count > 0);
    state.prisonerGroupIds = groups.map((g: any) => g.id);
    return groups;
}

export function prisonersHeld(world: GameWorldState, state: OutpostState): number {
    return heldGroups(world, state).reduce((s, g) => s + g.count, 0);
}

// ─── Research ────────────────────────────────────────────────────────────────

function currentProject(world: GameWorldState, factionId: string): { slot: any; tech: any } | null {
    const tech = (world as any).tech?.get?.(factionId);
    const slot = tech?.activeSlots?.find((s: any) => s.techId && s.status === 'researching');
    if (!slot) return null;
    const def = techRegistry.get(slot.techId);
    return def ? { slot, tech: def } : null;
}

function experimentHours(world: GameWorldState, factionId: string, state: OutpostState): number {
    const p = currentProject(world, factionId);
    if (!p) return 0;
    return Math.max(EXPERIMENT_MIN_HOURS, (p.tech.researchCost ?? 0) * EXPERIMENT_SHARE) * (state.charter === 'research' ? CHARTER_BONUS : 1);
}

// ─── Context for crises ──────────────────────────────────────────────────────

function enemiesNear(world: GameWorldState, factionId: string, systemId: string): boolean {
    const near = new Set([systemId, ...(world.movement.systems.get(systemId)?.hyperlaneNeighbors ?? [])]);
    for (const f of world.movement.fleets.values()) {
        if (f.factionId === factionId || !f.currentSystemId || !near.has(f.currentSystemId)) continue;
        if (isCivilianFleet(f) || !(f.basePower > 0)) continue;
        if (f.factionId === 'faction-pirates' || isAtWar(world, f.factionId, factionId)) return true;
    }
    return false;
}

function contextFor(world: GameWorldState, planet: AnyPlanet, state: OutpostState): CrisisContext {
    const owner = planet.ownerId as string;
    return {
        rng: new RNG(seedFromString(`${planet.id}|outpost|${state.shift}|${state.crises.length}`)),
        hasGovernor: !!planet.governorId,
        charge: cost => chargeReserves(world, owner, cost),
        prisoners: prisonersHeld(world, state),
        losePrisoners: (share, how) => {
            let total = 0;
            for (const g of heldGroups(world, state)) {
                const n = Math.ceil(g.count * share);
                if (n <= 0) continue;
                g.count -= n;
                total += n;
                if (how === 'killed') shiftRivalry(world, owner, g.ownerEmpireId, 4, 'prisoners_killed', `${n} prisoners died at ${planet.name}`);
            }
            heldGroups(world, state);
            return total;
        },
        researchBoost: hours => {
            const p = currentProject(world, owner);
            if (!p || hours <= 0) return null;
            p.slot.progressHours = (p.slot.progressHours ?? 0) + hours;
            return p.tech.name ?? p.tech.id;
        },
        experimentHours: () => experimentHours(world, owner, state),
        raidersNear: enemiesNear(world, owner, planet.systemId),
    };
}

/** An enemy army is on this world's ground. */
export function outpostBesieged(planet: AnyPlanet): boolean {
    const s = planet?.siege;
    return !!s && !!s.attackerEmpireId && s.attackerEmpireId !== planet.ownerId && !s.winner;
}

function balanceCtx(world: GameWorldState, planet: AnyPlanet, state: OutpostState) {
    return {
        rareWorld: (planet.tags ?? []).some((t: string) => /rare/.test(t)),
        prisoners: prisonersHeld(world, state),
        besieged: outpostBesieged(planet),
    };
}

// ─── Every worker cycle ──────────────────────────────────────────────────────

/** Give every outpost-tagged world its state (outposts founded before this shipped). */
export function ensureOutposts(world: GameWorldState): void {
    for (const planet of world.construction.planets.values() as Iterable<AnyPlanet>) {
        if (!planet.outpost && planet.ownerId && (planet.tags ?? []).includes('outpost')) {
            planet.outpost = createOutpostState(planet, world.nowSeconds);
        }
    }
}

export function tickOutposts(world: GameWorldState): void {
    ensureOutposts(world);
    for (const planet of world.construction.planets.values() as Iterable<AnyPlanet>) {
        const state: OutpostState | undefined = planet.outpost;
        if (!state || !planet.ownerId) continue;
        let n = 0;
        while (world.nowSeconds >= state.nextShiftAt && n < MAX_SHIFTS_PER_CYCLE) {
            n++;
            state.nextShiftAt += SHIFT_SIM_SECONDS;
            runOneShift(world, planet, state);
        }
        if (world.nowSeconds >= state.nextShiftAt) state.nextShiftAt = world.nowSeconds + SHIFT_SIM_SECONDS;
    }
}

function runOneShift(world: GameWorldState, planet: AnyPlanet, state: OutpostState): void {
    const owner = planet.ownerId as string;
    if (state.graduated) {
        // No more crises or survival: the old modules just work.
        state.shift += 1;
        const balance = computeBalance(state, balanceCtx(world, planet, state));
        let held = Object.values(state.warehouse).reduce((s, n) => s + n, 0);
        for (const [k, v] of Object.entries(balance.output)) {
            const fits = Math.max(0, Math.min(v, balance.storage - held));
            if (fits > 0) { state.warehouse[k] = (state.warehouse[k] ?? 0) + fits; held += fits; }
        }
        runFunctions(world, planet, state);
        return;
    }
    if (state.colonists <= 0) { state.shift += 1; return; } // derelict until resettled
    const ctx = contextFor(world, planet, state);
    expireCrises(state, ctx);
    const bctx = balanceCtx(world, planet, state);
    if (bctx.besieged && !state.log.some(l => l.shift === state.shift && /siege/.test(l.text))) {
        log(state, 'Enemy troops are on the ground. Nobody lands; everyone waits.', 'bad');
    }
    const result = runShift(state, bctx);
    runFunctions(world, planet, state);
    const crisis = rollCrisis(state, contextFor(world, planet, state));
    if (crisis) notify(world, owner, `outpost-${planet.id}-${crisis.id}`, `${planet.name}: ${crisis.title}`, `${crisis.text} Answer within ${crisis.deadlineShift - state.shift} shifts or the crew decides.`, 'normal', planet.id);
    planet.population = Math.max(1, Math.round(state.colonists / 10)); // in millions; keeps the world's card honest
    if (result.abandoned || state.colonists <= 0) {
        state.colonists = 0;
        state.crises = [];
        log(state, 'Nobody is left. The domes stand empty.', 'bad');
        notify(world, owner, `outpost-lost-${planet.id}-${state.shift}`, `${planet.name} is empty`, 'The last colonists are gone. Land a new crew to restart it.', 'urgent', planet.id);
    }
}

/** What the outpost does for the empire each shift: depot repairs. */
function runFunctions(world: GameWorldState, planet: AnyPlanet, state: OutpostState): void {
    const depots = countModules(state, 'fuel_depot');
    if (depots > 0 && state.colonists > 0) {
        const repair = DEPOT_REPAIR_PER_SHIFT * depots * (state.charter === 'depot' ? 2 : 1);
        for (const f of world.movement.fleets.values()) {
            if (f.factionId !== planet.ownerId || f.currentSystemId !== planet.systemId || f.destinationSystemId) continue;
            f.strength = Math.min(1, (f.strength ?? 1) + repair);
            if (f.doctrine) f.doctrine.supplyLevel = 1;
        }
    }
}

/** Systems an empire's outpost sensor masts can see (refreshDockedCivilians folds them into its sight). */
export function outpostSightSystems(world: GameWorldState, factionId: string): Set<string> {
    const out = new Set<string>();
    for (const planet of world.construction.planets.values() as Iterable<AnyPlanet>) {
        const state: OutpostState | undefined = planet.outpost;
        if (!state || planet.ownerId !== factionId || state.colonists <= 0 && !state.graduated) continue;
        if (countModules(state, 'sensor_mast') === 0) continue;
        const hops = state.charter === 'listening' ? 2 : 1;
        let frontier = [planet.systemId as string];
        out.add(planet.systemId);
        for (let h = 0; h < hops; h++) {
            const next: string[] = [];
            for (const s of frontier) for (const nb of world.movement.systems.get(s)?.hyperlaneNeighbors ?? []) if (!out.has(nb)) { out.add(nb); next.push(nb); }
            frontier = next;
        }
    }
    return out;
}

// ─── Every strategic cycle ───────────────────────────────────────────────────

/** Warehouses ship their contents to the owner's reserves. */
export function shipOutpostWarehouses(world: GameWorldState): void {
    for (const planet of world.construction.planets.values() as Iterable<AnyPlanet>) {
        const state: OutpostState | undefined = planet.outpost;
        if (!state || !planet.ownerId) continue;
        const r = reservesOf(world, planet.ownerId);
        if (!r) continue;
        const parts: string[] = [];
        for (const [k, v] of Object.entries(state.warehouse)) {
            if (!(v > 0)) continue;
            r[k] = (r[k] ?? 0) + v;
            state.stats.shipped[k] = (state.stats.shipped[k] ?? 0) + v;
            parts.push(`${Math.round(v)} ${k.toLowerCase()}`);
        }
        state.warehouse = {};
        if (parts.length) log(state, `Shipped to the empire: ${parts.join(', ')}.`, 'good');
    }
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export type OutpostOp =
    | { op: 'build'; cell: number; module: ModuleId }
    | { op: 'clear'; cell: number }
    | { op: 'toggle'; cell: number }
    | { op: 'demolish'; cell: number }
    | { op: 'resolve'; crisisId: string; option: string }
    | { op: 'charter'; charter: CharterId }
    | { op: 'advance' }
    | { op: 'supply' }
    | { op: 'resettle' }
    | { op: 'experiment'; subjects: 'volunteers' | 'prisoners' }
    | { op: 'transfer_prisoners'; groupId: string }
    | { op: 'labour'; on: boolean };

export interface OpResult { ok: boolean; reason?: string }
const fail = (reason: string): OpResult => ({ ok: false, reason });

export function outpostOrder(world: GameWorldState, factionId: string, planetId: string, order: OutpostOp): OpResult {
    const planet: AnyPlanet = world.construction.planets.get(planetId);
    if (!planet || planet.ownerId !== factionId) return fail('That outpost is not yours.');
    ensureOutposts(world);
    const state: OutpostState | undefined = planet.outpost;
    if (!state) return fail(`${planet?.name ?? 'That world'} is not an outpost.`);
    const frozen = state.graduated && !['charter', 'labour', 'experiment', 'transfer_prisoners'].includes(order.op);
    if (frozen) return fail(`${planet.name} is a colony now: build on its surface.`);
    if (state.colonists <= 0 && order.op !== 'resettle') return fail(`${planet.name} is empty. Land a new crew first.`);

    const cellAt = (i: number) => (Number.isInteger(i) && i >= 0 && i < state.cells.length ? state.cells[i] : null);

    switch (order.op) {
        case 'build': {
            const cell = cellAt(order.cell);
            const def = MODULES[order.module];
            if (!cell || !def || def.fixed) return fail('Nothing like that can be built.');
            if (!cellOpen(order.cell, state.tier)) return fail('That ground opens when the outpost grows.');
            if (cell.module) return fail('Something already stands there.');
            if (cell.clearingUntilShift !== undefined) return fail('Crews are still clearing that ground.');
            if (cell.terrain === 'rock' && def.id !== 'bunker') return fail('Clear the rock first.');
            if (!terrainOk(def.id, cell.terrain === 'rock' ? 'rock' : cell.terrain)) return fail(`${def.name} cannot stand on ${cell.terrain}.`);
            if ((def.minTier ?? 1) > state.tier) return fail(`${def.name} needs a ${TIERS[def.minTier!].name.toLowerCase()}.`);
            const short = shortfall(world, factionId, def.cost);
            if (short) return fail(short);
            chargeReserves(world, factionId, def.cost);
            cell.module = def.id;
            cell.buildDoneShift = state.shift + def.buildShifts;
            log(state, `Work began on a ${def.name}.`, 'neutral');
            return { ok: true };
        }
        case 'clear': {
            const cell = cellAt(order.cell);
            if (!cell || cell.terrain !== 'rock' || cell.module) return fail('There is no rock to clear there.');
            if (!cellOpen(order.cell, state.tier)) return fail('That ground opens when the outpost grows.');
            if (cell.clearingUntilShift !== undefined) return fail('Already being cleared.');
            const short = shortfall(world, factionId, CLEAR_ROCK_COST);
            if (short) return fail(short);
            chargeReserves(world, factionId, CLEAR_ROCK_COST);
            cell.clearingUntilShift = state.shift + CLEAR_ROCK_SHIFTS;
            return { ok: true };
        }
        case 'toggle': {
            const cell = cellAt(order.cell);
            if (!cell?.module || cell.module === 'hub') return fail('Nothing there to switch.');
            if (cell.off) delete cell.off; else cell.off = true;
            return { ok: true };
        }
        case 'demolish': {
            const cell = cellAt(order.cell);
            if (!cell?.module || cell.module === 'hub') return fail('Nothing there to tear down.');
            log(state, `${MODULES[cell.module].name} was torn down.`, 'neutral');
            delete cell.module; delete cell.off; delete cell.downUntilShift; delete cell.buildDoneShift;
            return { ok: true };
        }
        case 'resolve': {
            const ok = resolveCrisis(state, contextFor(world, planet, state), order.crisisId, order.option);
            return ok ? { ok: true } : fail('That crisis is over, or that is not an answer to it.');
        }
        case 'charter': {
            if (!CHARTERS[order.charter]) return fail('Unknown charter.');
            if (state.charter === order.charter) return { ok: true };
            if (state.shift - state.charterSetShift < CHARTER_LOCK_SHIFTS && state.shift > 0) {
                return fail(`The charter was changed recently; it can change again in ${CHARTER_LOCK_SHIFTS - (state.shift - state.charterSetShift)} shifts.`);
            }
            state.charter = order.charter;
            state.charterSetShift = state.shift;
            log(state, `New charter: ${CHARTERS[order.charter].name}.`, 'neutral');
            return { ok: true };
        }
        case 'advance': return advance(world, planet, state);
        case 'supply': {
            if (outpostBesieged(planet)) return fail('Enemy troops hold the ground around the landing site: no supply ship will come down.');
            const cost = Object.fromEntries(Object.entries(SUPPLY_DROP.cost).map(([k, v]) => [k, countModules(state, 'dock') > 0 ? v : v * 2]));
            const short = shortfall(world, factionId, cost);
            if (short) return fail(short);
            chargeReserves(world, factionId, cost);
            state.food += SUPPLY_DROP.food;
            log(state, `A supply drop landed: ${SUPPLY_DROP.food} food.`, 'good');
            return { ok: true };
        }
        case 'resettle': {
            if (state.colonists > 0) return fail('The outpost still has its crew.');
            const short = shortfall(world, factionId, RESETTLE_COST);
            if (short) return fail(short);
            chargeReserves(world, factionId, RESETTLE_COST);
            state.colonists = START_COLONISTS;
            state.food = Math.max(state.food, 8);
            state.air = Math.max(state.air, 6);
            state.morale = 50;
            log(state, 'A new crew landed to restart the outpost.', 'good');
            return { ok: true };
        }
        case 'experiment': {
            const balance = computeBalance(state, balanceCtx(world, planet, state));
            const labs = state.cells.filter((c, i) => c.module === 'test_lab' && balance.running.includes(i)).length;
            if (!labs) return fail('A staffed, powered test lab is needed.');
            if (state.shift < state.experimentReadyShift) return fail(`The lab is still writing up the last run (${state.experimentReadyShift - state.shift} shifts).`);
            const project = currentProject(world, factionId);
            if (!project) return fail('There is no research under way to test for.');
            const ctx = contextFor(world, planet, state);
            let hours = experimentHours(world, factionId, state) * labs;
            if (order.subjects === 'prisoners') {
                if (ctx.prisoners <= 0) return fail('There are no prisoners here.');
                hours *= SUBJECT_GAIN;
                const dead = ctx.losePrisoners(SUBJECT_DEATH_SHARE, 'killed');
                log(state, `Prisoners were used as test subjects. ${dead} did not survive.`, 'bad');
            }
            ctx.researchBoost(hours);
            state.experimentReadyShift = state.shift + EXPERIMENT_COOLDOWN_SHIFTS;
            state.stats.experiments += 1;
            log(state, `The lab ran an experiment: ${project.tech.name ?? project.tech.id} +${hours.toFixed(1)} hours.`, 'good');
            if (ctx.rng.check(EXPERIMENT_ACCIDENT_CHANCE)) openCrisisOfKind(state, ctx, 'lab_accident');
            return { ok: true };
        }
        case 'transfer_prisoners': {
            const ledger = ensureLedger((world as any).combat ?? ((world as any).combat = { recruitmentJobs: [] }));
            const group = ledger.groups.find((g: any) => g.id === order.groupId);
            if (!group || group.captorEmpireId !== factionId || group.resolved || !(group.count > 0)) return fail('Those prisoners are not in your hands.');
            if (state.prisonerGroupIds.includes(group.id)) return { ok: true };
            if (!state.cells.some((c, i) => c.module === 'dock' && moduleActive(state, i))) return fail('Prisoner transports need a working landing dock.');
            const balance = computeBalance(state, balanceCtx(world, planet, state));
            const held = prisonersHeld(world, state);
            if (held + group.count > balance.prisonCapacity) return fail(`The cell blocks hold ${balance.prisonCapacity}; ${held} are already here and ${group.count} more would not fit.`);
            // Off any other outpost's books.
            for (const p of world.construction.planets.values() as Iterable<AnyPlanet>) {
                if (p.outpost?.prisonerGroupIds?.includes(group.id)) p.outpost.prisonerGroupIds = p.outpost.prisonerGroupIds.filter((id: string) => id !== group.id);
            }
            group.planetId = planet.id;
            group.planetName = planet.name;
            state.prisonerGroupIds.push(group.id);
            log(state, `${group.count} prisoners arrived under guard.`, 'neutral');
            return { ok: true };
        }
        case 'labour': {
            state.prisonLabour = !!order.on;
            log(state, order.on ? 'The prisoners were put to work in the extractors.' : 'Prison labour was stopped.', 'neutral');
            return { ok: true };
        }
    }
    return fail('Unknown outpost order.');
}

/** What still stands between this outpost and its next tier, as player-facing lines (empty = ready). */
export function advanceBlockers(state: OutpostState, reserves: Record<string, number> | undefined, besieged = false): string[] {
    const next = TIERS[state.tier].next;
    if (!next) return ['Already a colony.'];
    const out: string[] = [];
    if (state.colonists < next.colonists) out.push(`${next.colonists} colonists (${state.colonists} now)`);
    if (state.morale < next.morale) out.push(`morale ${next.morale} (${state.morale} now)`);
    for (const m of next.modules) if (countModules(state, m, false) === 0) out.push(`a ${MODULES[m].name}`);
    if (besieged) out.push('the siege lifted');
    for (const [k, v] of Object.entries(next.cost)) if ((reserves?.[k] ?? 0) < v) out.push(`${v.toLocaleString()} ${k.toLowerCase()}`);
    return out;
}

function advance(world: GameWorldState, planet: AnyPlanet, state: OutpostState): OpResult {
    const next = TIERS[state.tier].next;
    if (!next) return fail('Already a colony.');
    const blockers = advanceBlockers(state, reservesOf(world, planet.ownerId), outpostBesieged(planet));
    if (blockers.length) return fail(`Not yet. Still needs: ${blockers.join(', ')}.`);
    chargeReserves(world, planet.ownerId, next.cost);
    state.tier = (state.tier + 1) as 1 | 2 | 3;
    if (state.tier === 2) {
        log(state, `${planet.name} is a settlement now. The whole plain is open to build on.`, 'good');
        return { ok: true };
    }
    graduate(world, planet, state);
    return { ok: true };
}

/**
 * Settlement → colony: the world takes up the 64-district surface like any
 * colony; the grid freezes, its functions (mines, prison, lab, mast, depot)
 * keep running, its crises end.
 */
export function graduate(world: GameWorldState, planet: AnyPlanet, state: OutpostState): void {
    state.graduated = true;
    state.crises = [];
    const tags: string[] = planet.tags ?? (planet.tags = []);
    const wasDead = tags.includes('dead_matter');
    // In place: the economy record shares this array.
    for (const t of ['outpost', 'dead_matter']) { const i = tags.indexOf(t); if (i >= 0) tags.splice(i, 1); }
    if (!tags.includes('colony')) tags.push('colony');
    if (wasDead && !tags.includes('domed')) tags.push('domed');
    planet.population = Math.max(10, Math.round(state.colonists / 3));
    planet.popCapacity = 50;
    const eco = world.economy.planets.get(planet.id);
    if (eco) { eco.demographics.population = planet.population; eco.demographics.housingCapacity = 50; }
    log(state, `${planet.name} is a colony. ${wasDead ? 'Under the domes, a' : 'A'} city begins.`, 'good');
    notify(world, planet.ownerId, `outpost-colony-${planet.id}`, `${planet.name} is a colony`, 'The outpost has grown into a full colony. Its surface is open for districts, and its old modules keep working.', 'normal', planet.id);
}

/** Building on the 64-district surface waits until the outpost is a colony. */
export function surfaceLocked(planet: AnyPlanet): boolean {
    return !!planet?.outpost && !planet.outpost.graduated;
}

// ─── War ─────────────────────────────────────────────────────────────────────

/** Built bunkers: each one digs the defenders in (fortificationLevelFor) and shelters colonists. */
export function outpostBunkers(planet: AnyPlanet): number {
    const state: OutpostState | undefined = planet?.outpost;
    if (!state) return 0;
    return state.cells.filter(c => c.module === 'bunker' && c.buildDoneShift === undefined).length;
}

/**
 * Shells landing on an outpost: modules are knocked out or wrecked and
 * colonists die, unless there is a bunker to shelter in (then the modules
 * still take it, but nobody dies and nothing is flattened).
 */
export function outpostBombarded(world: GameWorldState, planet: AnyPlanet, attackerId: string): void {
    const state: OutpostState | undefined = planet?.outpost;
    if (!state || state.graduated || state.colonists <= 0) return;
    const rng = new RNG(seedFromString(`${planet.id}|bombard|${world.nowSeconds}`));
    const sheltered = outpostBunkers(planet) > 0;
    const targets = state.cells.map((c, i) => (c.module && c.module !== 'hub' && c.module !== 'bunker' ? i : -1)).filter(i => i >= 0);
    const hits = Math.min(targets.length, sheltered ? 1 : 2);
    const names: string[] = [];
    for (let h = 0; h < hits; h++) {
        const pick = targets.splice(rng.nextInt(0, targets.length - 1), 1)[0];
        const cell = state.cells[pick];
        names.push(MODULES[cell.module!].name);
        if (!sheltered && rng.check(0.4)) {
            delete cell.module; delete cell.off; delete cell.downUntilShift; delete cell.buildDoneShift;
        } else {
            cell.downUntilShift = Math.max(cell.downUntilShift ?? 0, state.shift + 3);
        }
    }
    const dead = sheltered ? 0 : Math.min(state.colonists, 1 + Math.floor(state.colonists * 0.1));
    state.colonists -= dead;
    state.stats.deaths += dead;
    state.effects.push({ kind: 'morale', value: -10, untilShift: state.shift + 3 });
    const what = names.length ? `${names.join(' and ')} hit` : 'the domes rattled';
    log(state, sheltered ? `Bombardment: everyone was in the bunker. ${what}.` : `Bombardment: ${what}, ${dead} dead.`, 'bad');
    notify(world, planet.ownerId, `outpost-bombard-${planet.id}-${world.nowSeconds}`, `${planet.name} under bombardment`,
        sheltered ? `The colonists sheltered in the bunker. ${what}.` : `${what}. ${dead} colonist${dead === 1 ? '' : 's'} killed. A bunker would have sheltered them.`, 'urgent', planet.id);
    void attackerId;
}

/**
 * The world changed hands (capturePlanet). The new owner inherits the domes
 * and whoever stayed; open crises end with the old administration; the
 * charter goes back to settlement; prisoners held here are freed if they are
 * the conqueror's own people, and change keepers otherwise.
 */
export function outpostCaptured(world: GameWorldState, planet: AnyPlanet, previousOwnerId: string, attackerId: string): void {
    const state: OutpostState | undefined = planet?.outpost;
    if (!state) return;
    const ledger = ensureLedger((world as any).combat ?? ((world as any).combat = { recruitmentJobs: [] }));
    let freed = 0, kept = 0;
    for (const g of ledger.groups as any[]) {
        if (!state.prisonerGroupIds.includes(g.id) || g.resolved || !(g.count > 0)) continue;
        if (g.ownerEmpireId === attackerId) { freed += g.count; g.resolved = 'freed'; }
        else { kept += g.count; g.captorEmpireId = attackerId; }
    }
    state.prisonerGroupIds = state.prisonerGroupIds.filter(id => {
        const g: any = ledger.groups.find((x: any) => x.id === id);
        return g && !g.resolved && g.count > 0;
    });
    state.crises = [];
    state.prisonLabour = false;
    state.charter = 'settlement';
    state.charterSetShift = state.shift;
    if (!state.graduated) {
        const fled = Math.floor(state.colonists * 0.3);
        state.colonists -= fled;
        state.morale = Math.min(state.morale, 30);
        log(state, `The outpost changed hands. ${fled} colonist${fled === 1 ? '' : 's'} fled with the old administration.`, 'bad');
    }
    const prisonerNote = freed ? ` ${freed} of your own people were freed from its cells.` : kept ? ` ${kept} prisoners there are now yours to keep.` : '';
    notify(world, attackerId, `outpost-taken-${planet.id}-${world.nowSeconds}`, `${planet.name} outpost taken`, `The outpost and its modules are yours now.${prisonerNote}`, 'normal', planet.id);
    notify(world, previousOwnerId, `outpost-lost-war-${planet.id}-${world.nowSeconds}`, `${planet.name} outpost lost`, `The outpost fell with the world${freed ? `, and the ${freed} prisoners held there went free` : ''}.`, 'urgent');
}
