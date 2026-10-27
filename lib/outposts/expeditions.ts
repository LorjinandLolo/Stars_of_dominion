// lib/outposts/expeditions.ts
// Stars of Dominion — sending two people off the grid for a shift or two.
//
// The one proactive verb between crises. A crew of two leaves the domes to
// dig the ruins, prospect a vent, or walk the horizon; they are away (not
// working) until they return with salvage, a find on the map, a push to the
// current research, a wound, or not at all. The crew is picked for the job
// (a scholar for the ruins, a miner for the vent, a veteran for the horizon)
// and a fitting trait tilts the dice. Pure: the worker passes the same
// context the crises use (crises.ts CrisisContext).

import type { RNG } from '../trade-system/rng';
import type { Colonist, OutpostState, ColonistTrait } from './outpost-types';
import type { CrisisContext } from './crises';
import { log } from './outpost-sim';
import { killColonists, hurtColonist, listNames, roster } from './colonists';
import { crewVoice } from './voices';

export type ExpeditionKind = 'ruin' | 'vent' | 'horizon';

export interface Expedition {
    kind: ExpeditionKind;
    crewIds: string[];
    leftShift: number;
    returnShift: number;
    /** The cell the expedition is about (ruin or vent), if any. */
    cell?: number;
}

export const EXPEDITION_SHIFTS: Record<ExpeditionKind, number> = { ruin: 2, vent: 1, horizon: 2 };
export const EXPEDITION_CREW = 2;

export interface ExpeditionOption { kind: ExpeditionKind; label: string; detail: string; cell?: number; crew: Colonist[]; blocker?: string }

const PREFER: Record<ExpeditionKind, ColonistTrait> = { ruin: 'scholar', vent: 'miner', horizon: 'veteran' };

/** Who would go: the fitting trait first, then the fit. */
export function expeditionCrew(state: OutpostState, kind: ExpeditionKind): Colonist[] {
    const well = roster(state).filter(c => c.status === 'well');
    const lead = well.find(c => c.trait === PREFER[kind]);
    const crew = lead ? [lead] : [];
    for (const c of well) { if (crew.length >= EXPEDITION_CREW) break; if (!crew.includes(c)) crew.push(c); }
    return crew;
}

/** What can be sent now. Always the horizon; the ruins and a vent when the grid has them. */
export function expeditionOptions(state: OutpostState): ExpeditionOption[] {
    const out: ExpeditionOption[] = [];
    const blocker = state.expedition ? 'A crew is already out.' : state.colonists - EXPEDITION_CREW < 1 ? 'Not enough people to spare.' : undefined;
    const ruin = state.cells.findIndex(c => c.terrain === 'ruin' && !c.module);
    if (ruin >= 0) out.push({ kind: 'ruin', label: 'Dig the ruins', detail: `${EXPEDITION_SHIFTS.ruin} shifts. Salvage, or notes for your research. A scholar reads the stones.`, cell: ruin, crew: expeditionCrew(state, 'ruin'), blocker });
    const vent = state.cells.findIndex(c => c.terrain === 'vent' && !c.module);
    if (vent >= 0) out.push({ kind: 'vent', label: 'Prospect the vent', detail: `${EXPEDITION_SHIFTS.vent} shift. May turn a flat square into ore. A miner knows where to look.`, cell: vent, crew: expeditionCrew(state, 'vent'), blocker });
    out.push({ kind: 'horizon', label: 'Walk the horizon', detail: `${EXPEDITION_SHIFTS.horizon} shifts. Salvage from the plain, a ruin found, or nothing. A veteran brings everyone back.`, crew: expeditionCrew(state, 'horizon'), blocker });
    return out;
}

export interface ExpeditionResult { ok: boolean; message: string }

export function startExpedition(state: OutpostState, kind: ExpeditionKind): ExpeditionResult {
    const option = expeditionOptions(state).find(o => o.kind === kind);
    if (!option) return { ok: false, message: 'There is nowhere like that to go.' };
    if (option.blocker) return { ok: false, message: option.blocker };
    if (option.crew.length < EXPEDITION_CREW) return { ok: false, message: 'Two fit people are needed.' };
    for (const c of option.crew) { c.status = 'away'; c.sinceShift = state.shift; }
    state.expedition = { kind, crewIds: option.crew.map(c => c.id), leftShift: state.shift, returnShift: state.shift + EXPEDITION_SHIFTS[kind], cell: option.cell };
    log(state, `${listNames(option.crew.map(c => c.name))} set out: ${option.label.toLowerCase()}.`, 'neutral');
    return { ok: true, message: `${listNames(option.crew.map(c => c.name))} set out.` };
}

/** Each shift: a crew whose time is up comes back, one way or another. */
export function resolveExpedition(state: OutpostState, ctx: CrisisContext): string | null {
    const ex = state.expedition;
    if (!ex || state.shift < ex.returnShift) return null;
    delete state.expedition;
    const crew = roster(state).filter(c => ex.crewIds.includes(c.id));
    for (const c of crew) if (c.status === 'away') { c.status = 'well'; c.sinceShift = state.shift; }
    if (!crew.length) return null;
    const names = crew.map(c => c.name);
    const lead = crew.find(c => c.trait === PREFER[ex.kind]);
    const rng = ctx.rng;
    const roll = rng.next();

    // Misfortune first: a tenth of walks end badly, a twentieth with a veteran (or a scholar in the ruins, a miner at the vent).
    const danger = lead ? 0.05 : 0.1;
    if (roll < danger) {
        const victim = crew[rng.nextInt(0, crew.length - 1)];
        if (rng.check(0.5)) {
            const dead = killColonists(state, 1, ex.kind === 'ruin' ? 'lost in the ruins' : ex.kind === 'vent' ? 'fell at the vent' : 'did not come back from the horizon', rng, victim.trait);
            const line = `${listNames(dead)} did not come back. The others returned with nothing.`;
            log(state, line, 'bad');
            return line;
        }
        hurtColonist(state, victim);
        const line = `${victim.name} came back hurt. Nothing found.${crewVoice(crew.filter(c => c.id !== victim.id), 'expedition_hurt')}`;
        log(state, line, 'bad');
        return line;
    }

    const luck = roll - danger + (lead ? 0.15 : 0);
    if (ex.kind === 'ruin') {
        if (luck > 0.55) {
            const tech = ctx.researchBoost(ctx.experimentHours() * (lead ? 3 : 2));
            const line = tech ? `${listNames(names)} brought back notes from the ruins: ${tech} leapt ahead.` : `${listNames(names)} brought back curiosities from the ruins.`;
            const spoken = line + crewVoice(crew, 'expedition_ruin_notes');
            log(state, spoken, 'good');
            return spoken;
        }
        const credits = 200 + rng.nextInt(0, 4) * 100;
        ctx.charge({ CREDITS: -credits });
        const line = `${listNames(names)} dug ${credits} credits of salvage out of the ruins.${crewVoice(crew, 'expedition_ruin_salvage')}`;
        log(state, line, 'good');
        return line;
    }
    if (ex.kind === 'vent') {
        const flats = state.cells.map((c, i) => (c.terrain === 'flat' && !c.module ? i : -1)).filter(i => i >= 0);
        if (luck > 0.45 && flats.length) {
            const cell = flats[rng.nextInt(0, flats.length - 1)];
            state.cells[cell].terrain = 'ore';
            const line = `${listNames(names)} traced the vent to an ore seam. A square of the plain is ore now.${crewVoice(crew, 'expedition_vent_ore')}`;
            log(state, line, 'good');
            return line;
        }
        const line = `${listNames(names)} mapped the vent. Nothing worth digging.${crewVoice(crew, 'expedition_vent_dust')}`;
        log(state, line, 'neutral');
        return line;
    }
    // Horizon.
    if (luck > 0.7) {
        const flats = state.cells.map((c, i) => (c.terrain === 'flat' && !c.module ? i : -1)).filter(i => i >= 0);
        if (flats.length && !state.cells.some(c => c.terrain === 'ruin')) {
            const cell = flats[rng.nextInt(0, flats.length - 1)];
            state.cells[cell].terrain = 'ruin';
            const line = `${listNames(names)} found worked stone under the dust at the edge of the plain. Nobody here made it.${crewVoice(crew, 'expedition_found_ruin')}`;
            log(state, line, 'good');
            return line;
        }
    }
    if (luck > 0.35) {
        const credits = 100 + rng.nextInt(0, 3) * 100;
        ctx.charge({ CREDITS: -credits });
        const line = `${listNames(names)} came back with ${credits} credits of salvage from a wreck on the plain.`;
        log(state, line, 'good');
        return line;
    }
    const line = `${listNames(names)} walked the horizon and found dust.${crewVoice(crew, 'expedition_dust')}`;
    log(state, line, 'neutral');
    return line;
}
