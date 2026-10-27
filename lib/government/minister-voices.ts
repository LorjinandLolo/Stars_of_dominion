// lib/government/minister-voices.ts
// Stars of Dominion — how a minister talks.
//
// Names are generated, so the personality lives in the office: whoever holds
// Defence talks like the Admiralty. Each portfolio has lines per HOOK (what
// just happened or is being proposed) in four REGISTERS picked from the
// minister's own numbers — loyal, cooling, Brutus (disloyal or plotting),
// venal (corrupt, any loyalty). The full sheet with personas and voice rules
// is docs/writing/character-lines.md; this file is the subset that has a
// code hook today. Pure and client-safe: callers pass the minister and a
// seed, nothing here reads the world.
//
// Consumers: generateCabinetAdvice (the cabinet debate card), the advisor
// desk (proposal detail in the brief), the brief's advisor ledger (what the
// minister says when you answered or did not).

import type { CabinetPortfolio } from './types';
import castData from '../../data/leaders/cabinet-cast.json';
import officeVoices from '../../data/leaders/office-voices.json';

export type Register = 'loyal' | 'cooling' | 'brutus' | 'venal';

/** Loyalty below this reads as Brutus; from here to LOYAL_FROM as cooling. */
export const BRUTUS_BELOW = 35;
export const LOYAL_FROM = 60;
/** Corruption from here reads as venal, whatever the loyalty. */
export const VENAL_FROM = 50;

export interface MinisterLike {
    name: string;
    loyalty?: number;
    corruption?: number;
    ambitionDrive?: number;
    /** A written character (lib/leadership/cast.ts): their own lines are tried first. */
    characterId?: string;
}

/** The register a minister speaks in; `plotting` forces Brutus. */
export function registerOf(m: MinisterLike | undefined, plotting = false): Register {
    if (!m) return 'loyal';
    if ((m.corruption ?? 0) >= VENAL_FROM) return 'venal';
    if (plotting || (m.loyalty ?? 50) < BRUTUS_BELOW) return 'brutus';
    if ((m.loyalty ?? 50) < LOYAL_FROM) return 'cooling';
    return 'loyal';
}

export type Hook =
    | 'appointed' | 'idle_peace' | 'idle_war' | 'routine'
    | 'war_proposal' | 'battle_group' | 'peace_proposal'
    | 'battle_won' | 'battle_lost' | 'fleet_destroyed' | 'siege_defending' | 'siege_attacking' | 'capital_captured'
    | 'dismissed' | 'resigned' | 'lapsed' | 'declined' | 'approved'
    | 'overextended' | 'reserves_low' | 'loan' | 'sanctions_on_us' | 'sanctions_by_us' | 'subsidy' | 'strike'
    | 'research_choice' | 'rival_transcending' | 'our_transcending' | 'tech_gate' | 'lab_accident' | 'ruins'
    | 'op_exposed_ours' | 'op_exposed_theirs' | 'agent_captured' | 'loyalty_report' | 'foreign_tie' | 'crackdown' | 'crisis_window' | 'case_opened' | 'networks_inside'
    | 'approval_falling' | 'cohesion_falling' | 'secession' | 'press_campaign' | 'riot'
    | 'offer_accept' | 'offer_refuse' | 'envoy' | 'treaty_signed' | 'treaty_broken_them' | 'treaty_broken_us' | 'breakaway' | 'gambit'
    | 'morning' | 'seat_silent';

type Lines = Partial<Record<Register, string[]>>;
type Sheet = Partial<Record<Hook, Lines>>;

/**
 * The office voices, one per portfolio, in data/leaders/office-voices.json: the
 * Admiralty writes dispatches, the Treasury memoranda, the Academy papers, the
 * Desk insinuations, the Home Office speeches and the Foreign Office toasts.
 * A generated minister speaks in the voice of the office they hold.
 */
export const MINISTER_LINES = officeVoices as unknown as Record<CabinetPortfolio, Sheet>;

/** The written characters' own lines, by character id: hook → register → sentences. */
const CHARACTER_LINES: Record<string, Record<string, Partial<Record<Register, string[]>>>> = Object.fromEntries(
    ((castData as unknown as { characters: Array<{ id: string; lines: Record<string, Partial<Record<Register, string[]>>> }> }).characters).map(c => [c.id, c.lines]),
);

export type Vars = Partial<Record<'target' | 'world' | 'portfolio', string>>;

function fill(line: string, vars: Vars): string {
    const out = line.replace(/\{(target|world|portfolio)\}/g, (_, k: keyof Vars) => vars[k] ?? (k === 'target' ? 'them' : k === 'world' ? 'the world' : 'that office'));
    // A fallback at the start of a sentence still starts the sentence.
    return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Deterministic pick: the same seed gives the same line, so a card does not flicker between syncs. */
function pick<T>(arr: T[], seed: number): T {
    const n = arr.length;
    const i = Math.abs(Math.floor(seed)) % n;
    return arr[i];
}

/**
 * A line for this office, hook and register, with placeholders filled.
 * Falls back to the loyal register when the sheet has nothing for the
 * register (a venal Treasury still answers a strike), and to '' when the
 * hook has no lines for this office at all.
 */
export function ministerLine(portfolio: CabinetPortfolio, hook: Hook, register: Register, vars: Vars = {}, seed = 0, characterId?: string): string {
    // A written person speaks in their own words where they have them; the
    // office persona covers the hooks they do not.
    const own = characterId ? CHARACTER_LINES[characterId]?.[hook] : undefined;
    const ownPool = own ? (own[register]?.length ? own[register] : own.loyal) ?? [] : [];
    if (ownPool.length) return fill(pick(ownPool, seed), vars);
    const lines = MINISTER_LINES[portfolio]?.[hook];
    if (!lines) return '';
    const pool = (lines[register]?.length ? lines[register] : lines.loyal) ?? [];
    if (!pool.length) return '';
    return fill(pick(pool, seed), vars);
}

/** ` Name: “line”` for appending to a card, or '' when the minister has nothing to say. */
export function ministerSays(m: MinisterLike | undefined, portfolio: CabinetPortfolio, hook: Hook, vars: Vars = {}, seed = 0, plotting = false): string {
    if (!m) return '';
    const line = ministerLine(portfolio, hook, registerOf(m, plotting), vars, seed, m.characterId);
    return line ? ` ${m.name}: “${line}”` : '';
}

/** A small stable hash for seeds built from ids. */
export function seedOf(...parts: Array<string | number>): number {
    let h = 2166136261;
    for (const p of parts) for (const ch of String(p)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
