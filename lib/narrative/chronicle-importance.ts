// lib/narrative/chronicle-importance.ts — how loudly history shouts.
//
// A pure function of (type, facts). No world state, no I/O, no randomness:
// the same event always scores the same, which is what makes the gazette
// reproducible and the scoring testable. Context modifiers that need the
// chronicle (feuds, reversals, galactic firsts) are applied later by the
// narrator, never here.
//
// Bands (see docs/narrative-system/README.md):
//   90-100  the galaxy reorganizes around it
//   70-89   an era-defining act
//   40-69   real news
//   15-39   local news — narrated only on a quiet day
//    0-14   memory only; feeds feud counts, never becomes prose

import type { ChronicleEventType, ChronicleFacts } from './chronicle-types';

/** Base score per event type. Exhaustive by construction — the Record type
 *  forces a new ChronicleEventType to be given a score here. */
const BASE_IMPORTANCE: Record<ChronicleEventType, number> = {
    // War & combat
    war_declared: 82,
    war_ended: 80,
    battle_resolved: 45,
    system_captured: 58,
    capital_captured: 95,
    siege_started: 50,
    planet_bombarded: 62,
    fleet_destroyed: 40,
    // Diplomacy
    treaty_signed: 44,
    treaty_broken: 74,
    alliance_formed: 60,
    alliance_dissolved: 58,
    tribute_imposed: 52,
    council_vote: 38,
    // Espionage
    operation_resolved: 20,
    operation_exposed: 66,
    agent_captured: 42,
    // Press. Publication is the moment a secret becomes a public fact; the
    // scandal that follows is what it costs.
    investigation_published: 64,
    scandal_confirmed: 76,
    // Politics & government
    leader_rose: 40,
    leader_died: 55,
    coup_attempted: 78,
    government_changed: 72,
    secession_declared: 84,
    civil_war_started: 92,
    defiance_event: 34,
    // Economy
    trade_route_opened: 16,
    trade_route_lost: 24,
    economic_crisis: 56,
    blockade_started: 46,
    // Piracy
    pirate_raid: 22,
    pirate_state_recognized: 76,
    // World & meta
    empire_eliminated: 98,
    colony_founded: 26,
    season_milestone: 50,
};

/** Read a numeric fact, tolerating the string-typed JSON values facts allow. */
function num(facts: ChronicleFacts, key: string): number | null {
    const v = facts[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const parsed = Number(v);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

/**
 * Fact-driven adjustments. Deliberately few: scale of loss, whether a capital
 * or homeworld was involved, and whether a covert act stayed covert. Anything
 * needing history belongs in the narrator's context pass, not here.
 */
function factModifier(type: ChronicleEventType, facts: ChronicleFacts): number {
    let mod = 0;

    // Blood raises the volume of any violent event.
    const casualties = num(facts, 'casualties') ?? num(facts, 'losses');
    if (casualties !== null) {
        if (casualties >= 100_000) mod += 20;
        else if (casualties >= 10_000) mod += 12;
        else if (casualties >= 1_000) mod += 6;
    }

    // Anything touching a capital or homeworld is bigger than the same act
    // committed on a frontier rock.
    if (facts.isCapital === true || facts.isHomeworld === true) mod += 15;

    // A failed operation is gossip; a successful one that got caught is a scandal.
    if (type === 'operation_resolved' && facts.succeeded === false) mod -= 8;

    // Wars that end in surrender or annexation outrank negotiated ceasefires.
    if (type === 'war_ended') {
        if (facts.outcome === 'annexation' || facts.outcome === 'surrender') mod += 10;
        if (facts.outcome === 'white_peace') mod -= 10;
    }

    // Decisive battles read differently from indecisive ones.
    if (type === 'battle_resolved' && facts.decisive === true) mod += 12;

    return mod;
}

/** Final 0-100 score for an event. */
export function scoreImportance(
    type: ChronicleEventType,
    facts: ChronicleFacts = {},
): number {
    const base = BASE_IMPORTANCE[type];
    // Unknown types would score NaN and silently poison the queue ordering.
    if (base === undefined) return 10;
    const raw = base + factModifier(type, facts);
    return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Exposed for tests and for tooling that wants the table without scoring. */
export function baseImportanceOf(type: ChronicleEventType): number {
    return BASE_IMPORTANCE[type] ?? 10;
}
