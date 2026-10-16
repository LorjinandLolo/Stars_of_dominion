// lib/outposts/outpost-advice.ts
// Stars of Dominion — what an outpost should do next, in words. Pure and
// client-safe. The outpost screen's advisor shows it; the AI (lib/ai/
// outpost-ai.ts) builds from the same nextModuleFor, so the advice a player
// reads is what a careful player would do.

import type { ModuleId, OutpostBalance, OutpostState } from './outpost-types';
import { MODULES, TIERS, BASE_REQUIREMENTS, cellOpen, terrainOk } from './outpost-catalog';
import { computeBalance } from './outpost-sim';

/** The first open, empty cell this module can stand on, or -1. */
export function spotFor(state: OutpostState, m: ModuleId): number {
    return state.cells.findIndex((c, i) => cellOpen(i, state.tier) && !c.module && c.clearingUntilShift === undefined
        && (c.terrain === 'rock' ? m === 'bunker' || m === 'battery' : terrainOk(m, c.terrain)));
}

interface Want { module: ModuleId; why: string }

/** What to build next, with the reason, in the order a careful player would. */
export function wantedModules(state: OutpostState, b: OutpostBalance): Want[] {
    const has = (m: ModuleId) => state.cells.some(c => c.module === m);
    const want: Want[] = [];
    if (b.foodMade < b.foodUsed + 1) want.push({ module: 'hydroponics', why: 'Food is not keeping up with the mouths to feed.' });
    if (b.airMade < b.airUsed + 1) want.push({ module: 'life_support', why: 'Air is not keeping up; when the reserve runs out, people die.' });
    if (b.powerMade - b.powerUsed < 1) {
        want.push({ module: 'solar', why: 'Every module needs power, and there is none to spare.' });
        want.push({ module: 'geothermal', why: 'Every module needs power, and there is none to spare.' });
    }
    const next = state.base ? undefined : TIERS[state.tier].next;
    for (const m of next?.modules ?? []) if (!has(m)) want.push({ module: m, why: `Growing needs a ${MODULES[m].name}.` });
    if (state.colonists >= b.housing - 1) want.push({ module: 'habitat', why: 'The domes are full; nobody new can come until there is room.' });
    if (state.morale < 62 && state.cells.filter(c => c.module === 'commons').length < 2) want.push({ module: 'commons', why: 'Morale decides whether people come or leave; a commons raises it.' });
    if (!has('warehouse')) want.push({ module: 'warehouse', why: 'Without a warehouse, nothing you dig is kept.' });
    if (!has('mine')) want.push({ module: 'mine', why: 'An extractor on ore, ice or a vent is where the outpost pays its way.' });
    if (state.tier >= 2 && !has('bunker')) want.push({ module: 'bunker', why: 'A bunker shelters everyone from meteors, raiders and bombardment.' });
    if (state.base) {
        if (!has('barracks_module')) want.push({ module: 'barracks_module', why: 'A base without barracks has no garrison.' });
        if (!has('battery')) want.push({ module: 'battery', why: 'Batteries make the base far harder to take.' });
        if (!has('drydock')) want.push({ module: 'drydock', why: 'A drydock lets you lay warships here, at the front.' });
    }
    return want;
}

/** What this outpost should build next, if there is room for it. */
export function nextModuleFor(state: OutpostState, prisoners = 0): ModuleId | null {
    const b = computeBalance(state, { prisoners });
    for (const w of wantedModules(state, b)) if (spotFor(state, w.module) >= 0) return w.module;
    return null;
}

export interface OutpostAdvice {
    title: string;
    text: string;
    tone: 'urgent' | 'normal' | 'good';
    /** A module worth building now, and where (cell index). */
    build?: { module: ModuleId; cell: number };
}

/** One line of advice for the outpost screen: the most pressing thing first. */
export function outpostAdvice(state: OutpostState, b: OutpostBalance, ctx: { besieged?: boolean; reserves?: Record<string, number> } = {}): OutpostAdvice {
    if (state.graduated) return { title: 'A colony now', text: 'Build on its surface from the planet’s Build panel. The old modules here keep working.', tone: 'good' };
    if (state.colonists <= 0) return { title: 'Nobody is left', text: 'Land a new crew to restart the outpost.', tone: 'urgent' };
    if (state.crises.length) return { title: 'Answer the crisis', text: 'Pick one of its answers above. Say nothing and the crew picks the passive one when time runs out.', tone: 'urgent' };
    if (ctx.besieged) return { title: 'Hold on', text: 'Enemy troops are on the ground. Nobody arrives and no supply lands until the siege lifts. Bunkers keep your people alive under bombardment.', tone: 'urgent' };
    if (b.airMade < b.airUsed && state.air <= 6) return { title: 'Air is running out', text: 'Build Life Support, or switch off a module to free power for it. Ice next to it adds air.', tone: 'urgent', build: buildable(state, 'life_support') };
    if (b.foodMade < b.foodUsed && state.food <= 8) return { title: 'Food is running out', text: 'Build Hydroponics, or buy a supply drop under Orders.', tone: 'urgent', build: buildable(state, 'hydroponics') };
    if (b.idle.some(x => x.reason === 'power')) return { title: 'Modules are dark', text: 'There is not enough power for everything. Build a Solar Array (or a Geothermal Tap on a vent), or switch something off.', tone: 'urgent', build: buildable(state, 'solar') ?? buildable(state, 'geothermal') };
    if (b.idle.some(x => x.reason === 'workers')) return { title: 'Not enough hands', text: 'Some modules have no crew. Build a Habitat Dome so more colonists can come, or switch a module off.', tone: 'normal', build: buildable(state, 'habitat') };

    const ready = growthReady(state, ctx.reserves);
    if (ready) return { title: ready, text: 'Everything it needs is in place. Grow it from the panel below the orders.', tone: 'good' };

    for (const w of wantedModules(state, b)) {
        const cell = spotFor(state, w.module);
        if (cell >= 0) return { title: `Build a ${MODULES[w.module].name}`, text: w.why, tone: 'normal', build: { module: w.module, cell } };
    }
    if (state.cells.some((c, i) => cellOpen(i, state.tier) && c.terrain === 'rock' && !c.module)) {
        return { title: 'Make room', text: 'The good ground is used. Clear a rock field (200 metals, one shift) to build on it.', tone: 'normal' };
    }
    return { title: 'Steady', text: 'Nothing urgent. Keep the warehouse emptying, keep morale up, and answer crises as they come.', tone: 'good' };
}

function buildable(state: OutpostState, m: ModuleId): { module: ModuleId; cell: number } | undefined {
    const cell = spotFor(state, m);
    return cell >= 0 ? { module: m, cell } : undefined;
}

function growthReady(state: OutpostState, reserves: Record<string, number> | undefined): string | null {
    if (state.base) return null;
    const check = (req: { colonists: number; morale: number; modules: ModuleId[]; cost: Record<string, number> }) =>
        state.colonists >= req.colonists && state.morale >= req.morale
        && req.modules.every(m => state.cells.some(c => c.module === m && c.buildDoneShift === undefined))
        && Object.entries(req.cost).every(([k, v]) => (reserves?.[k] ?? 0) >= v);
    const next = TIERS[state.tier].next;
    if (state.tier === 2 && check(BASE_REQUIREMENTS) && next && check(next)) return 'Ready to grow: colony or military base';
    if (next && check(next)) return state.tier === 1 ? 'Ready to become a settlement' : 'Ready to become a colony';
    if (state.tier === 2 && check(BASE_REQUIREMENTS)) return 'Ready to become a military base';
    return null;
}
