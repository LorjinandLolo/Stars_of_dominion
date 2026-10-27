// lib/leadership/cast.ts
// Stars of Dominion — the named cabinet (docs/writing/named-cabinet.md).
//
// The leader generator makes a thousand ministers and produces nobody. The
// cast is a finite pool of WRITTEN people — a name, a past, a want, their own
// lines — drawn one per seat into a claimed empire the first time a human
// holds it. They sit in ordinary Leader records with ordinary numbers, so
// every system that reads a minister (advice, plots, drift, the crisis
// window, dismissal, resignation, the brief) keeps working untouched; the
// character layer is `characterId` on the leader and this file saying who
// that is. The pool is finite on purpose: when a written minister leaves,
// the engine's generated people fill the chair, and the player feels the
// difference. AI empires nobody looks at get the engine from the start.
//
// Deterministic: the draw walks the pool in file order per portfolio and
// claimed factions in sorted order, so a replayed load draws the same people.
// Never displaces a human minister (a FactionSeat holder).

import type { GameWorldState } from '../game-world-state';
import type { Leader } from './types';
import { generateLeader } from './leader-generator';
import { CABINET_PORTFOLIOS, type CabinetPortfolio } from '../government/types';
import castData from '../../data/leaders/cabinet-cast.json';

export interface CabinetCharacter {
    id: string;
    name: string;
    portfolio: CabinetPortfolio;
    /** Civilization ids this person will serve, or 'any'. */
    fits: string[];
    /** Civilization ids they refuse. */
    refuses?: string[];
    /** Art slot. */
    portrait: string;
    age: number;
    /** A BACKGROUNDS id (lib/leadership/character.ts), so bios and seat fit still work. */
    background: string;
    /** STARTING numbers; the engine drifts them after that. */
    numbers: { loyalty: number; competence: number; corruption: number; ambitionDrive: number; politicalSkill: number };
    bio: string;
    want: string;
    fear: string;
    /** hook → register → sentences; tried before the office persona's lines. */
    lines: Record<string, Partial<Record<'loyal' | 'cooling' | 'brutus' | 'venal', string[]>>>;
}

export const CAST: readonly CabinetCharacter[] = (castData as unknown as { characters: CabinetCharacter[] }).characters;
const BY_ID = new Map(CAST.map(c => [c.id, c]));

/** The written person behind a leader, if there is one. */
export function characterOf(leader: Pick<Leader, 'characterId'> | undefined | null): CabinetCharacter | undefined {
    return leader?.characterId ? BY_ID.get(leader.characterId) : undefined;
}

export function characterById(id: string): CabinetCharacter | undefined {
    return BY_ID.get(id);
}

/** Who has been drawn where; lives on the world (shared, public by name and office). */
export interface CastState {
    /** characterId → factionId. */
    drawn: Record<string, string>;
    /** Factions that have had their draw, whatever it yielded. */
    factions: Record<string, true>;
}

export function castState(world: GameWorldState): CastState {
    const w = world as any;
    if (!w.cast || typeof w.cast !== 'object') w.cast = { drawn: {}, factions: {} };
    w.cast.drawn ??= {};
    w.cast.factions ??= {};
    return w.cast as CastState;
}

function civilizationOf(world: GameWorldState, factionId: string): string | undefined {
    return (world.economy?.factions?.get?.(factionId) as any)?.civilizationId;
}

function serves(c: CabinetCharacter, civ: string | undefined): boolean {
    if (civ && c.refuses?.includes(civ)) return false;
    return c.fits.includes('any') || (!!civ && c.fits.includes(civ));
}

/** The next undrawn character written for this seat who will serve this court. */
export function nextCharacterFor(world: GameWorldState, factionId: string, portfolio: CabinetPortfolio): CabinetCharacter | undefined {
    const state = castState(world);
    const civ = civilizationOf(world, factionId);
    return CAST.find(c => c.portfolio === portfolio && !state.drawn[c.id] && serves(c, civ));
}

/** Build the leader record a character sits in. Ordinary fields from the generator, the written ones over them. */
export function leaderForCharacter(world: GameWorldState, factionId: string, c: CabinetCharacter, governmentTags: string[] = []): Leader {
    const leader = generateLeader({ factionId, role: 'Minister', seed: `cast-${c.id}`, nowSeconds: world.nowSeconds, governmentTags, age: c.age });
    leader.name = c.name;
    leader.age = c.age;
    leader.background = c.background;
    leader.loyalty = c.numbers.loyalty;
    leader.competence = c.numbers.competence;
    leader.corruption = c.numbers.corruption;
    leader.ambitionDrive = c.numbers.ambitionDrive;
    leader.politicalSkill = c.numbers.politicalSkill;
    leader.characterId = c.id;
    leader.portfolio = c.portfolio;
    leader.status = 'active';
    return leader;
}

export interface CastDrawReport {
    factionId: string;
    /** Seats that got a written person, with who stood aside. */
    seated: Array<{ portfolio: CabinetPortfolio; characterId: string; displacedLeaderId?: string }>;
}

/**
 * Draw the faction's cast: one written character per portfolio where the
 * pool has one, replacing the generated minister (who retires, no grudge:
 * they were never dismissed). Runs once per
 * faction, the first time it is claimed. A human minister's seat is never
 * touched. Idempotent.
 */
export function drawCast(world: GameWorldState, factionId: string): CastDrawReport {
    const report: CastDrawReport = { factionId, seated: [] };
    const state = castState(world);
    if (state.factions[factionId]) return report;
    const gov: any = (world.government as Map<string, any> | undefined)?.get?.(factionId);
    if (!gov || !(world.leadership?.leaders instanceof Map)) return report;
    state.factions[factionId] = true;

    for (const portfolio of CABINET_PORTFOLIOS) {
        const currentId: string | undefined = gov.cabinet?.[portfolio];
        const current = currentId ? world.leadership.leaders.get(currentId) : undefined;
        if (current?.seatId) continue; // a friend holds this chair
        const c = nextCharacterFor(world, factionId, portfolio);
        if (!c) continue;

        const leader = leaderForCharacter(world, factionId, c, gov.tags ?? []);
        leader.history.push({ timestamp: world.nowSeconds, description: `Appointed Minister of ${portfolio}.` });
        world.leadership.leaders.set(leader.id, leader);
        gov.cabinet ??= {};
        gov.cabinet[portfolio] = leader.id;
        state.drawn[c.id] = factionId;

        // The generated minister retires with a line in their history: no
        // grudge (they were never dismissed), and no crowding the recruitment
        // pool with people the engine will regenerate anyway.
        if (current && current.status === 'active') {
            current.portfolio = undefined;
            current.status = 'retired';
            current.leftOfficeAtSeconds = world.nowSeconds;
            current.history.push({ timestamp: world.nowSeconds, description: `Stood aside for ${c.name}.` });
        }
        report.seated.push({ portfolio, characterId: c.id, displacedLeaderId: current?.id });
    }
    return report;
}

/** Every claimed faction that has not had its draw yet, in sorted order (the first to claim gets the written people). */
export function drawCastForClaimed(world: GameWorldState): CastDrawReport[] {
    const claimed: string[] = Array.isArray((world as any).claimedFactionIds) ? (world as any).claimedFactionIds : [];
    const out: CastDrawReport[] = [];
    for (const factionId of [...claimed].sort()) {
        const r = drawCast(world, factionId);
        if (r.seated.length) out.push(r);
    }
    return out;
}
