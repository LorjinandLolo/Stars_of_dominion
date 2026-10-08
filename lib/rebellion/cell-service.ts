/**
 * lib/rebellion/cell-service.ts
 * Rebel cells, phase 13a: the oppression loop.
 *
 *   grievance  = unrest on the world, how unhappy its most unhappy bloc is,
 *                and how oppressive its government is known to be;
 *   a cell     forms where grievance stays high, grows while it does, shrinks
 *                when the world is content, and dies quietly when it shrinks
 *                to nothing;
 *   a crackdown hits every cell on a world and finds some of them, and costs
 *                the government oppression and the world unrest, which is
 *                grievance, which recruits. The trap is the design: every win
 *                costs the next one (Item 13, decision 5).
 *
 * Acts and sponsors live in sponsor-service (13b); movements, which turn a
 * long-lived cell into a secession crisis, in movement-service (13c). An
 * informant inside a cell (a case-file lead) tells the next crackdown on its
 * world where to look.
 */

import type { GameWorldState } from '../game-world-state';
import { CRACKDOWN_CAPITAL, noteForSeat, type Crackdown, type RebelCell, type RebellionState } from './rebellion-types';
import { ReputationService } from '../reputation/reputation-service';
import { fireNotification } from '../time/notification-hooks';
import * as chronicle from '../narrative/chronicle';

// ─── Tuning (per strategic tick: 6 sim hours) ────────────────────────────────

/** Grievance at which cells can form. A peaceful season peaks near 30 (scripts soak, 2026-10-07): cells need real unhappiness. */
export const FORM_THRESHOLD = 35;
/** Chance per tick of a cell forming, at grievance 100 (scales linearly from the threshold). */
export const FORM_CHANCE_AT_MAX = 0.03;
/** Grievance at which an existing cell neither grows nor shrinks. */
export const GROWTH_BASELINE = 30;
/** Strength gained (or lost) per tick per point of grievance above (or below) the baseline. */
export const GROWTH_PER_POINT = 0.05;
/** Strength a led cell gains per tick at least, while active (13d): about 0.6 a sim day. */
export const LED_MIN_GROWTH = 0.15;
/** A cell's hideout gets harder to find while left alone, up to this. */
export const MAX_CONCEALMENT = 0.95;
export const CONCEALMENT_RECOVERY_PER_TICK = 0.01;
/** Ended cells are dropped this long after they end (sim seconds). */
export const CELL_PRUNE_AFTER_SECONDS = 30 * 86400;

/** Crackdowns. */
export const CRACKDOWN_COOLDOWN_SECONDS = 10 * 86400;
export const CRACKDOWN_HIT_FOUND = 35;
export const CRACKDOWN_HIT_UNFOUND = 15;
export const CRACKDOWN_OPPRESSION = 6;
export const CRACKDOWN_UNREST = 5;
/** Extra hit on a cell an informant has given away (13c). */
export const CRACKDOWN_HIT_INFORMED = 15;

const NON_PLAYABLE = new Set(['faction-pirates', 'faction-neutral']);

function isPlayerRun(world: GameWorldState, factionId: string): boolean {
    if (NON_PLAYABLE.has(factionId)) return false;
    const claimed = (world as any).claimedFactionIds;
    return !Array.isArray(claimed) || claimed.includes(factionId);
}

export function ensureRebellion(world: GameWorldState): RebellionState {
    const w = world as any;
    if (!w.rebellion) w.rebellion = {};
    if (!(w.rebellion.cells instanceof Map)) w.rebellion.cells = new Map();
    if (!(w.rebellion.crackdowns instanceof Map)) w.rebellion.crackdowns = new Map();
    return w.rebellion as RebellionState;
}

// ─── Grievance ───────────────────────────────────────────────────────────────

export interface Grievance {
    score: number;
    blocId: string | null;
    blocName: string | null;
}

/**
 * How aggrieved one world is, 0–100: half its unrest, three tenths its most
 * dissatisfied bloc, a fifth its government's reputation for oppression.
 */
export function grievanceOf(world: GameWorldState, planet: any): Grievance {
    const host = planet?.ownerId;
    const unrest = Math.max(0, Math.min(100, Number(planet?.unrest ?? 0)));
    const blocs: any[] = (world as any).movement?.empirePostures?.get?.(host)?.blocs ?? [];
    const worst = blocs.reduce((w: any, b: any) => (!w || b.satisfaction < w.satisfaction ? b : w), null);
    const dissatisfaction = worst ? Math.max(0, 100 - Number(worst.satisfaction ?? 50)) : 50;
    const oppression = Math.max(0, Math.min(100, Number((world as any).reputation?.get?.(host)?.scores?.oppression ?? 0)));
    const score = 0.5 * unrest + 0.3 * dissatisfaction + 0.2 * oppression;
    return { score: Math.round(score * 10) / 10, blocId: worst?.id ?? null, blocName: worst?.name ?? null };
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

const ADJECTIVES = ['Free', 'Red', 'Silent', 'Broken', 'Last', 'Long', 'Iron', 'Ashen', 'Unbowed', 'Hidden'];
const NOUNS = ['Hand', 'Dawn', 'Chain', 'Lantern', 'Tide', 'Spark', 'Oath', 'Root', 'Banner', 'Choir'];

function cellName(planetName: string, rand: () => number): string {
    const a = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)];
    const n = NOUNS[Math.floor(rand() * NOUNS.length)];
    return rand() < 0.5 ? `the ${a} ${n}` : `the ${planetName} ${a} ${n}`;
}

export function membersFor(strength: number): number {
    return 3 + Math.floor(Math.max(0, strength) / 8);
}

function activeCellOn(rebellion: RebellionState, planetId: string): RebelCell | undefined {
    for (const c of rebellion.cells.values()) if (c.planetId === planetId && c.status === 'active') return c;
    return undefined;
}

export function formCell(world: GameWorldState, planet: any, grievance: Grievance, rand: () => number = Math.random): RebelCell {
    const rebellion = ensureRebellion(world);
    const now = world.nowSeconds;
    const id = `cell-${planet.id}-${now}-${Math.floor(rand() * 1e6).toString(36)}`;
    const cell: RebelCell = {
        id,
        name: cellName(planet.name ?? 'Unknown', rand),
        planetId: planet.id,
        systemId: planet.systemId,
        hostFactionId: planet.ownerId,
        causeBlocId: grievance.blocId,
        cause: grievance.blocName ? `the ${grievance.blocName.toLowerCase()} of ${planet.name}` : `the people of ${planet.name}`,
        strength: 5,
        members: membersFor(5),
        grievance: grievance.score,
        safeHouse: {
            id: `${id}-safehouse`,
            organizationId: id,
            kind: 'safe_house',
            systemId: planet.systemId,
            planetId: planet.id,
            concealment: 0.8,
            integrity: 1,
            berths: 0,
            storedLoot: 0,
            knownToFactionIds: [],
            establishedAtSeconds: now,
            readyAtSeconds: now,
        },
        status: 'active',
        formedAtSeconds: now,
        endedAtSeconds: null,
        crackdownsSurvived: 0,
    };
    rebellion.cells.set(id, cell);
    return cell;
}

/** Did this world leave `oldHost` for `newHost` through a secession crisis (a breakaway state)? Plain data, no government import. */
function liberatedFrom(world: GameWorldState, planetId: string, oldHost: string, newHost: string): boolean {
    for (const c of (world.secessionCrises?.values?.() ?? []) as Iterable<any>) {
        if (c.factionId === oldHost && c.rebelFactionId === newHost && Array.isArray(c.planetIds) && c.planetIds.includes(planetId)) return true;
    }
    return false;
}

export function endCell(cell: RebelCell, status: 'dissolved' | 'crushed' | 'risen', now: number): void {
    if (status !== 'risen') noteForSeat(cell, now, status === 'crushed' ? 'The movement is broken. Those who are left have scattered.' : 'The movement has melted away: nobody comes to the meetings any more.');
    cell.status = status;
    cell.strength = 0;
    cell.members = 0;
    cell.endedAtSeconds = now;
}

/**
 * One strategic tick of the oppression loop: cells form, grow, shrink, die.
 * Returns the cells that formed, for logs and probes.
 */
export function tickRebellion(world: GameWorldState, rand: () => number = Math.random): RebelCell[] {
    const rebellion = ensureRebellion(world);
    const now = world.nowSeconds;
    const formed: RebelCell[] = [];

    for (const planet of (world.construction?.planets?.values?.() ?? []) as Iterable<any>) {
        const host = planet?.ownerId;
        if (!host || NON_PLAYABLE.has(host) || !world.economy?.factions?.has?.(host)) continue;
        const g = grievanceOf(world, planet);
        const cell = activeCellOn(rebellion, planet.id);

        if (!cell) {
            if (g.score < FORM_THRESHOLD) continue;
            const chance = FORM_CHANCE_AT_MAX * (g.score - FORM_THRESHOLD) / (100 - FORM_THRESHOLD);
            if (rand() < chance) formed.push(formCell(world, planet, g, rand));
            continue;
        }

        // The world changed hands. If it left its old owner in a secession, the
        // cell got what it fought for and stands down (13c). Under a conqueror
        // it fights on, against the new owner.
        if (cell.hostFactionId !== host) {
            if (liberatedFrom(world, planet.id, cell.hostFactionId, host)) { endCell(cell, 'dissolved', now); continue; }
            cell.hostFactionId = host;
        }
        cell.grievance = g.score;
        // Lying low (13d): half the growth, three times the recovery of cover.
        let growth = (g.score - GROWTH_BASELINE) * GROWTH_PER_POINT;
        // A cell with a leader (13d) does not fade on a quiet world: they keep
        // organising, slowly, unless they have told it to go quiet.
        if (cell.seat && !cell.lyingLow) growth = Math.max(growth, LED_MIN_GROWTH);
        if (cell.seat && cell.lyingLow) growth = Math.max(growth, 0);
        cell.strength = Math.max(0, Math.min(100, cell.strength + (cell.lyingLow && growth > 0 ? growth / 2 : growth)));
        cell.members = membersFor(cell.strength);
        cell.safeHouse.concealment = Math.min(MAX_CONCEALMENT, cell.safeHouse.concealment + CONCEALMENT_RECOVERY_PER_TICK * (cell.lyingLow ? 3 : 1));
        if (cell.strength <= 0) endCell(cell, 'dissolved', now);
    }

    for (const [id, cell] of rebellion.cells) {
        // A broken cell with a leader stays until they let it go (13d), so they can read what happened.
        if (cell.status !== 'active' && !cell.seat && cell.endedAtSeconds != null && now - cell.endedAtSeconds > CELL_PRUNE_AFTER_SECONDS) {
            rebellion.cells.delete(id);
        }
    }
    return formed;
}

// ─── Being found ─────────────────────────────────────────────────────────────

/** Mark a cell as known to a faction. Returns true when it was news. */
export function revealCell(cell: RebelCell, factionId: string): boolean {
    if (cell.safeHouse.knownToFactionIds.includes(factionId)) return false;
    cell.safeHouse.knownToFactionIds.push(factionId);
    return true;
}

export function isCellKnownTo(cell: RebelCell, factionId: string): boolean {
    return cell.safeHouse.knownToFactionIds.includes(factionId);
}

/**
 * A Counter-Intel Sweep in a system also looks for cells on its worlds.
 * Chance to find each one rises with the sweep's outcome and falls with the
 * cell's concealment. Returns the cells newly found.
 */
export function revealCellsBySweep(world: GameWorldState, sweeperId: string, systemId: string, mult: number, rand: () => number = Math.random): RebelCell[] {
    if (mult <= 0) return [];
    const found: RebelCell[] = [];
    for (const cell of ensureRebellion(world).cells.values()) {
        if (cell.status !== 'active' || cell.systemId !== systemId || cell.hostFactionId !== sweeperId) continue;
        if (rand() < Math.min(0.95, (1 - cell.safeHouse.concealment) + 0.3 * mult)) {
            if (revealCell(cell, sweeperId)) { found.push(cell); noteForSeat(cell, world.nowSeconds, 'A counter-intelligence sweep found our safe house. They know we exist.'); }
            cell.safeHouse.concealment = Math.max(0.2, cell.safeHouse.concealment - 0.2);
        }
    }
    return found;
}

// ─── Crackdowns ──────────────────────────────────────────────────────────────

export type CrackdownResult = { ok: true; message: string; crackdown: Crackdown } | { ok: false; message: string };

/**
 * A security crackdown on one of our worlds. It hits every cell there, hard
 * on the ones it finds and glancingly on the ones it does not, and it costs:
 * the government's reputation for oppression rises and the world's unrest
 * with it, both of which feed grievance.
 */
export function crackdown(world: GameWorldState, factionId: string, planetId: string, rand: () => number = Math.random): CrackdownResult {
    const planet: any = world.construction?.planets?.get?.(planetId);
    if (!planet || planet.ownerId !== factionId) return { ok: false, message: 'You can only crack down on your own worlds.' };
    const rebellion = ensureRebellion(world);
    const now = world.nowSeconds;
    const last = rebellion.crackdowns.get(planetId);
    if (last && now < last.untilSeconds) return { ok: false, message: `${planet.name} is still under the last crackdown.` };

    let hit = 0;
    let found = 0;
    for (const cell of rebellion.cells.values()) {
        if (cell.status !== 'active' || cell.planetId !== planetId) continue;
        hit++;
        const known = isCellKnownTo(cell, factionId);
        const informed = (cell.informedUntilSeconds ?? 0) > now;
        const caught = known || informed || rand() < 1 - cell.safeHouse.concealment * 0.6;
        if (caught && revealCell(cell, factionId)) found++;
        cell.strength = Math.max(0, cell.strength - (caught ? CRACKDOWN_HIT_FOUND : CRACKDOWN_HIT_UNFOUND) - (informed ? CRACKDOWN_HIT_INFORMED : 0));
        cell.members = membersFor(cell.strength);
        cell.crackdownsSurvived++;
        if (caught) cell.safeHouse.concealment = Math.max(0.2, cell.safeHouse.concealment * 0.5);
        noteForSeat(cell, now, caught
            ? `A crackdown on ${planet.name} found us. Members taken, the safe house burned.`
            : `Security swept ${planet.name}. They missed us, but people we knew were taken.`);
        if (cell.strength <= 0) endCell(cell, 'crushed', now);
    }

    // The price, paid whether or not anything was found.
    try { ReputationService.updateScore(world, factionId, { oppression: CRACKDOWN_OPPRESSION }, 'security_crackdown'); } catch { /* no ledger */ }
    planet.unrest = Math.min(100, Number(planet.unrest ?? 0) + CRACKDOWN_UNREST);

    const record: Crackdown = {
        planetId, hostFactionId: factionId, startedAtSeconds: now,
        untilSeconds: now + CRACKDOWN_COOLDOWN_SECONDS, cellsHit: hit, cellsFound: found,
    };
    rebellion.crackdowns.set(planetId, record);
    // Arrests on a world are public: the press reports the crackdown, never what it found.
    chronicle.record(world, {
        type: 'crackdown',
        actorIds: [factionId],
        targetIds: [],
        location: planet.systemId,
        facts: { planetName: String(planet.name ?? 'a world'), cellsHit: hit },
    });

    const message = hit === 0
        ? `Security swept ${planet.name} and found nobody. The people of ${planet.name} will remember it anyway.`
        : `Security swept ${planet.name}: ${hit} cell${hit === 1 ? '' : 's'} hit${found ? `, ${found} newly identified` : ''}. Arrests made, and resentment with them.`;
    if (isPlayerRun(world, factionId)) {
        fireNotification({
            id: `crackdown-${planetId}-${now}`, factionId, category: 'politics', priority: 'normal',
            title: `CRACKDOWN ON ${String(planet.name ?? 'A WORLD').toUpperCase()}`,
            body: message,
            createdAt: new Date(now * 1000).toISOString(), read: false, linkToTab: 'intelligence',
        });
    }
    return { ok: true, message, crackdown: record };
}

/** Cells on a faction's worlds that its security service knows of. */
export function knownCellsFor(world: GameWorldState, factionId: string): RebelCell[] {
    return [...ensureRebellion(world).cells.values()].filter(c => c.hostFactionId === factionId && isCellKnownTo(c, factionId));
}


export { CRACKDOWN_CAPITAL };

/** Why a crackdown cannot go ahead, or null. Checked before anything is charged. */
export function crackdownBlocker(world: GameWorldState, factionId: string, planetId: string): string | null {
    const planet: any = world.construction?.planets?.get?.(planetId);
    if (!planet || planet.ownerId !== factionId) return 'You can only crack down on your own worlds.';
    const last = ensureRebellion(world).crackdowns.get(planetId);
    if (last && world.nowSeconds < last.untilSeconds) return `${planet.name} is still under the last crackdown.`;
    return null;
}
