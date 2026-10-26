// lib/outposts/colonists.ts
// Stars of Dominion — the people of an outpost, by name.
//
// `state.colonists` is a number the shift balances; this file keeps a roster
// beside it so a crisis can say "Okafor is trapped in the vent" and a death
// is a grave with a name. Every colonist has one trait that a crisis may
// care about (a medic in the fever, an engineer at the breach, a veteran
// when the raiders come, a drunk near the reactor) and a status: the hurt
// and the sick do not work until they heal (faster with a medbay).
//
// Pure. Names and traits come from a seeded RNG so the same outpost on the
// same shift always gets the same people; the roster is reconciled to the
// count after every shift, so old saves without a roster simply grow one.

import type { Colonist, ColonistStatus, ColonistTrait, OutpostState } from './outpost-types';
import { RNG, seedFromString } from '../trade-system/rng';
import { log, countModules } from './outpost-sim';

const GIVEN = ['Okafor', 'Ines', 'Tomasz', 'Yuki', 'Ada', 'Marcus', 'Sana', 'Ruben', 'Ling', 'Petra', 'Dario', 'Nkechi', 'Halvar', 'Mira', 'Jonas', 'Amara', 'Elif', 'Bram', 'Ngozi', 'Otto', 'Leila', 'Kwame', 'Sigrid', 'Rafael', 'Hana', 'Tariq', 'Vera', 'Idris', 'Noor', 'Cas'];
const FAMILY = ['Voss', 'Achebe', 'Lindqvist', 'Okonkwo', 'Petrov', 'Sato', 'Haddad', 'Nakamura', 'Quintero', 'Mbeki', 'Castellan', 'Thorne', 'Ferreira', 'Kaine', 'Solari', 'Otieno', 'Brandt', 'Ishikawa', 'Dubois', 'Varga', 'Ojo', 'Reyes', 'Halloran', 'Mendes', 'Zhou'];

export const TRAITS: ColonistTrait[] = ['medic', 'engineer', 'miner', 'botanist', 'veteran', 'zealot', 'drunk', 'scholar'];

export const TRAIT_LABEL: Record<ColonistTrait, string> = {
    medic: 'Medic', engineer: 'Engineer', miner: 'Miner', botanist: 'Botanist', veteran: 'Veteran', zealot: 'Zealot', drunk: 'Drunk', scholar: 'Scholar',
};

export const TRAIT_BLURB: Record<ColonistTrait, string> = {
    medic: 'Treats a fever like a medbay would, and the sick heal faster.',
    engineer: 'Comes back from a breach; patches a reactor with less risk.',
    miner: 'Finds the rich seams, and digs them harder.',
    botanist: 'Stretches the stores when a shipment is late.',
    veteran: 'Keeps the raiders fooled, holds a riot, stops a saboteur.',
    zealot: 'Keeps spirits up; nobody petitions to go home while they preach.',
    drunk: 'Accidents happen around them.',
    scholar: 'Pushes an experiment through more often than not.',
};

/** Heal times in shifts, with and without a medbay or a medic. */
const HEAL_HURT = 2;
const HEAL_SICK = 3;
const GRAVES_KEEP = 20;

function rngFor(state: OutpostState, salt: string): RNG {
    return new RNG(seedFromString(`outpost-people|${state.shift}|${state.colonists}|${salt}`));
}

export function roster(state: OutpostState): Colonist[] {
    return state.roster ?? [];
}

export function newColonist(state: OutpostState, rng: RNG, ordinal: number): Colonist {
    const given = GIVEN[rng.nextInt(0, GIVEN.length - 1)];
    const family = FAMILY[rng.nextInt(0, FAMILY.length - 1)];
    const taken = new Set(roster(state).map(c => c.name));
    let name = `${given} ${family}`;
    for (let i = 2; taken.has(name) && i < 10; i++) name = `${given} ${family} ${['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][i - 2]}`;
    // Drunks and zealots are rarer than hands.
    const pool: ColonistTrait[] = ['medic', 'engineer', 'engineer', 'miner', 'miner', 'miner', 'botanist', 'botanist', 'veteran', 'zealot', 'drunk', 'scholar'];
    return {
        id: `c-${state.shift}-${ordinal}-${rng.nextInt(1000, 9999)}`,
        name, trait: pool[rng.nextInt(0, pool.length - 1)],
        status: 'well', sinceShift: state.shift, arrivedShift: state.shift,
    };
}

/**
 * Make the roster match the count. New people are named; when the count
 * fell without a named death (old saves, numbers-only paths), the most
 * recent arrivals are the ones who are not there. Returns the arrivals.
 */
export function ensureRoster(state: OutpostState): Colonist[] {
    if (!state.roster) state.roster = [];
    if (!state.graves) state.graves = [];
    if (!state.scars) state.scars = [];
    const list = state.roster;
    const added: Colonist[] = [];
    const rng = rngFor(state, 'arrivals');
    while (list.length < state.colonists) { const c = newColonist(state, rng, list.length); list.push(c); added.push(c); }
    while (list.length > state.colonists) list.pop();
    return added;
}

export function fit(state: OutpostState): number {
    return roster(state).filter(c => c.status === 'well').length;
}

export function unfit(state: OutpostState): Colonist[] {
    return roster(state).filter(c => c.status !== 'well');
}

export function withTrait(state: OutpostState, trait: ColonistTrait, wellOnly = true): Colonist | undefined {
    return roster(state).find(c => c.trait === trait && (!wellOnly || c.status === 'well'));
}

export function hasTrait(state: OutpostState, trait: ColonistTrait, wellOnly = true): boolean {
    return !!withTrait(state, trait, wellOnly);
}

/** Someone to put in harm's way: a specific trait first, else the fit, else anyone. */
export function pickColonist(state: OutpostState, rng: RNG, prefer?: ColonistTrait, exclude: string[] = []): Colonist | undefined {
    const people = roster(state).filter(c => !exclude.includes(c.id));
    if (!people.length) return undefined;
    if (prefer) { const t = people.find(c => c.trait === prefer && c.status === 'well'); if (t) return t; }
    const well = people.filter(c => c.status === 'well');
    const from = well.length ? well : people;
    return from[rng.nextInt(0, from.length - 1)];
}

/**
 * Deaths, by name. Takes the count down, writes the graves, and returns the
 * names for the log. The hurt and the sick die first — a wound untreated is
 * how an outpost loses people — then whoever `prefer` names, then anyone.
 */
export function killColonists(state: OutpostState, n: number, how: string, rng?: RNG, prefer?: ColonistTrait): string[] {
    ensureRoster(state);
    const dice = rng ?? rngFor(state, `deaths|${how}`);
    const names: string[] = [];
    for (let i = 0; i < n && state.colonists > 0; i++) {
        const list = state.roster!;
        let victim = list.find(c => c.status !== 'well');
        if (!victim && prefer) victim = list.find(c => c.trait === prefer);
        if (!victim) victim = list[dice.nextInt(0, list.length - 1)];
        if (!victim) break;
        list.splice(list.indexOf(victim), 1);
        state.colonists -= 1;
        state.stats.deaths += 1;
        state.graves!.push({ name: victim.name, shift: state.shift, how });
        if (state.graves!.length > GRAVES_KEEP) state.graves!.splice(0, state.graves!.length - GRAVES_KEEP);
        names.push(victim.name);
    }
    return names;
}

/** Departures, by name: the last to arrive is the first to leave. */
export function leaveColonists(state: OutpostState, n: number): string[] {
    ensureRoster(state);
    const names: string[] = [];
    for (let i = 0; i < n && state.colonists > 1; i++) {
        const list = state.roster!;
        const leaver = [...list].sort((a, b) => b.arrivedShift - a.arrivedShift)[0];
        if (!leaver) break;
        list.splice(list.indexOf(leaver), 1);
        state.colonists -= 1;
        names.push(leaver.name);
    }
    return names;
}

export function hurtColonist(state: OutpostState, c: Colonist, status: ColonistStatus = 'hurt'): void {
    if (c.status === 'well' || status === 'sick') { c.status = status; c.sinceShift = state.shift; }
}

/** Each shift: the hurt and the sick mend, faster with a medbay or a medic. */
export function healRoster(state: OutpostState): string[] {
    const healed: string[] = [];
    const medbay = countModules(state, 'medbay') > 0;
    const medic = hasTrait(state, 'medic');
    for (const c of roster(state)) {
        if (c.status === 'well' || c.status === 'away') continue;
        const base = c.status === 'hurt' ? HEAL_HURT : HEAL_SICK;
        const need = medbay ? 1 : medic ? Math.max(1, base - 1) : base;
        if (state.shift - c.sinceShift >= need) { c.status = 'well'; c.sinceShift = state.shift; healed.push(c.name); }
    }
    return healed;
}

/** "Okafor Voss, Ines Achebe and Tomasz Sato" */
export function listNames(names: string[]): string {
    if (names.length <= 1) return names[0] ?? 'nobody';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function noteDeaths(state: OutpostState, names: string[], how: string): void {
    if (!names.length) return;
    log(state, `${listNames(names)} ${names.length === 1 ? 'died' : 'died'}: ${how}.`, 'bad');
}
