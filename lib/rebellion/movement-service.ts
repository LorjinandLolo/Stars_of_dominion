/**
 * lib/rebellion/movement-service.ts
 * Rebel cells, phase 13c: from a cell to a movement to a state.
 *
 *   A cell that lives long enough and grows strong enough stops hiding. It
 *   comes into the open as a secession crisis on its world, through the
 *   government system's own openCrisis, so everything that already answers a
 *   crisis (concessions, suppression, the deadline, escalation, fission into a
 *   breakaway state, recognition, reconquest) answers this one too.
 *   (Item 13, decision 7.)
 *
 *   Settled  the concessions took the heart out of it: the cell shrinks and
 *            must wait again before it can rise.
 *   Suppressed  crushed.
 *   Escalated  the crisis names a breakaway state; when fission makes it, the
 *            cell has risen and is over as a cell. Its sponsors are told.
 *
 * Who paid the cell never goes onto the crisis record: crises ride the shared
 * snapshot, and only sponsors the host has exposed are written there.
 *
 * Server-only: imports the government services, which reach `fs`.
 */

import type { GameWorldState } from '../game-world-state';
import type { SecessionCrisis } from '../government/secession-types';
import type { RebelCell } from './rebellion-types';
import { openCrisis } from '../government/secession-service';
import { fissionEmpire } from '../government/civil-war-service';
import { BREAKAWAY_PREFIX } from '../breakaway/breakaway-rules';
import { takeBreakaway } from '../breakaway/breakaway-service';
import { unitConfigFor } from '../combat/ship-registry';
import { endCell, ensureRebellion, revealCell } from './cell-service';
import { activeSponsorshipsOf } from './sponsor-service';
import { fireNotification } from '../time/notification-hooks';
import { labelFor } from '../time/notification-names';

/** A cell must have lived this long (sim seconds) before it can rise. */
export const MOVEMENT_MIN_AGE_SECONDS = 30 * 86400;
/** After a crisis that ended without a state, the wait before the cell can rise again; and the gap between risings in one empire. */
export const MOVEMENT_RESETTLE_SECONDS = 60 * 86400;
/** …and be this strong. */
export const MOVEMENT_MIN_STRENGTH = 50;
/** What a settled crisis costs the cell: the concessions took its reasons. */
export const SETTLED_STRENGTH_LOSS = 40;

const NON_PLAYABLE = new Set(['faction-pirates', 'faction-neutral']);
function isPlayerRun(world: GameWorldState, factionId: string): boolean {
    if (NON_PLAYABLE.has(factionId)) return false;
    const claimed = (world as any).claimedFactionIds;
    return Array.isArray(claimed) && claimed.includes(factionId);
}

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function crises(world: GameWorldState): Map<string, SecessionCrisis> {
    if (!(world.secessionCrises instanceof Map)) world.secessionCrises = new Map();
    return world.secessionCrises;
}

/** Can this cell come into the open now? */
export function movementReady(cell: RebelCell, now: number): boolean {
    if (cell.status !== 'active' || cell.crisisId) return false;
    if (cell.strength < MOVEMENT_MIN_STRENGTH) return false;
    if (now - cell.formedAtSeconds < MOVEMENT_MIN_AGE_SECONDS) return false;
    return cell.lastCrisisEndedAtSeconds == null || now - cell.lastCrisisEndedAtSeconds >= MOVEMENT_RESETTLE_SECONDS;
}

/**
 * May this empire face a new rising? Not while a cell of its is in the open,
 * and not within MOVEMENT_RESETTLE_SECONDS of the last one: risings take turns.
 */
export function hostReadyForMovement(world: GameWorldState, hostId: string, now: number): boolean {
    for (const c of ensureRebellion(world).cells.values()) {
        if (c.hostFactionId !== hostId) continue;
        if (c.status === 'active' && c.crisisId) return false;
        if (c.movementAtSeconds != null && now - c.movementAtSeconds < MOVEMENT_RESETTLE_SECONDS) return false;
    }
    return true;
}

function notify(world: GameWorldState, factionId: string, id: string, title: string, body: string, priority: 'urgent' | 'normal' = 'normal'): void {
    if (!isPlayerRun(world, factionId)) return;
    try {
        fireNotification({
            id: `${id}-${world.nowSeconds}`, factionId, category: 'espionage', priority, title, body,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(), read: false, linkToTab: 'intelligence',
        });
    } catch { /* notification queue absent in tests */ }
}

/** A breakaway id for this system nobody uses yet. Mirrors breakaway-service's. */
function freshRebelId(world: GameWorldState, systemId: string): string {
    let id = `${BREAKAWAY_PREFIX}${systemId}`;
    let n = 2;
    while (world.economy.factions.has(id) || [...crises(world).values()].some(c => c.rebelFactionId === id)) {
        id = `${BREAKAWAY_PREFIX}${systemId}-${n++}`;
    }
    return id;
}

/** Bring a cell into the open as a secession crisis on its world. */
export function riseAsMovement(world: GameWorldState, cell: RebelCell): SecessionCrisis | null {
    const planet: any = world.construction?.planets?.get?.(cell.planetId);
    if (!planet || planet.ownerId !== cell.hostFactionId) return null;
    const now = world.nowSeconds;

    // A world already in a crisis: the cell joins that one rather than opening its own.
    const existing = [...crises(world).values()].find(c => c.status === 'open' && c.planetIds.includes(cell.planetId));
    // A crisis already promised to another person's state cannot be ours too.
    if (cell.seat && existing?.rebelFactionId && existing.rebelFactionId !== cell.seat.factionId) return null;
    const crisis = existing ?? openCrisis(world, cell.hostFactionId, [cell.planetId], {
        name: `The ${planet.name} Rising`,
        leaderName: cap(cell.name),
        causes: [`${cell.name}, a cell for ${cell.cause}, came out of hiding`],
    });
    if (!crisis) return null;

    (crisis as any).cellId ??= cell.id;
    // A led cell's state is the one its leader already holds a claim on (13d):
    // pinned now, before escalation can name another.
    if (cell.seat && !crisis.rebelFactionId) crisis.rebelFactionId = cell.seat.factionId;
    const exposed = activeSponsorshipsOf(world, cell.id).filter(s => s.exposedAtSeconds).map(s => s.sponsorFactionId);
    if (exposed.length) crisis.exposedSponsors = [...new Set([...(crisis.exposedSponsors ?? []), ...exposed])];

    cell.crisisId = crisis.id;
    cell.movementAtSeconds = now;
    revealCell(cell, cell.hostFactionId);
    for (const s of activeSponsorshipsOf(world, cell.id)) {
        notify(world, s.sponsorFactionId, `movement-open-${s.id}`, 'OUR MOVEMENT IS IN THE OPEN',
            `${cap(cell.name)} has come out of hiding on ${planet.name}: ${labelFor(cell.hostFactionId)} faces a secession crisis there.`);
    }
    return crisis;
}

export interface MovementTick {
    rose: RebelCell[];
    settled: RebelCell[];
    crushed: RebelCell[];
    states: RebelCell[];
}

/**
 * One strategic tick: ready cells rise; cells in the open follow their crisis.
 * Runs after tickSecession and tickCivilWar in the same strategic tick, so a
 * crisis outcome is read the tick it happens or the next.
 */
export function tickMovements(world: GameWorldState): MovementTick {
    const out: MovementTick = { rose: [], settled: [], crushed: [], states: [] };
    const now = world.nowSeconds;
    for (const cell of ensureRebellion(world).cells.values()) {
        if (cell.status !== 'active') continue;
        if (!cell.crisisId) {
            // A cell a person leads comes into the open when they declare (13d).
            if (cell.seat) continue;
            if (movementReady(cell, now) && hostReadyForMovement(world, cell.hostFactionId, now) && riseAsMovement(world, cell)) out.rose.push(cell);
            continue;
        }
        const crisis = crises(world).get(cell.crisisId);
        if (!crisis) { cell.crisisId = null; cell.lastCrisisEndedAtSeconds = now; continue; }

        if (crisis.status === 'settled') {
            cell.strength = Math.max(0, cell.strength - SETTLED_STRENGTH_LOSS);
            cell.crisisId = null;
            cell.lastCrisisEndedAtSeconds = now;
            if (cell.strength <= 0) endCell(cell, 'dissolved', now);
            out.settled.push(cell);
        } else if (crisis.status === 'suppressed') {
            endCell(cell, 'crushed', now);
            out.crushed.push(cell);
        } else if (crisis.status === 'escalated') {
            // A movement does not stop at self-government in all but name: it names a state.
            if (!crisis.rebelFactionId) crisis.rebelFactionId = freshRebelId(world, cell.systemId);
            if (world.economy.factions.has(crisis.rebelFactionId)) {
                becomeState(world, cell, crisis.rebelFactionId);
                out.states.push(cell);
            }
        }
    }
    return out;
}

/** The movement has a state: the cell is over, and its sponsors hear what they built. */
function becomeState(world: GameWorldState, cell: RebelCell, rebelFactionId: string): void {
    const now = world.nowSeconds;
    const sponsors = activeSponsorshipsOf(world, cell.id);
    endCell(cell, 'risen', now);
    cell.breakawayFactionId = rebelFactionId;
    // The person who led it from hiding leads the state (13d): same account,
    // same claim, now with worlds, a fleet and a war chest.
    if (cell.seat && cell.seat.factionId === rebelFactionId) handOverSeat(world, cell, rebelFactionId);
    for (const s of sponsors) {
        s.endedAtSeconds = now;
        s.endReason = 'cell_ended';
        notify(world, s.sponsorFactionId, `movement-state-${s.id}`, 'OUR MOVEMENT IS A STATE',
            `${cap(cell.name)} has broken ${labelFor(cell.hostFactionId)}'s hold: ${(world.economy.factions.get(rebelFactionId) as any)?.name ?? labelFor(rebelFactionId)} is its own state now.`, 'urgent');
    }
}

/**
 * A late joiner asks for a seat (Item 13, decision 8, as built in 13c): a
 * living movement in an AI empire rises now, as their breakaway state. Returns
 * the new state's id, or null when there is no movement to take.
 */
export function riseMovementForPlayer(world: GameWorldState, humanFactionIds: Iterable<string>): { factionId: string; name?: string } | null {
    const humans = new Set(humanFactionIds);
    const candidates = [...ensureRebellion(world).cells.values()]
        .filter(c => c.status === 'active' && c.crisisId && !c.seat && !humans.has(c.hostFactionId))
        .map(c => ({ cell: c, crisis: crises(world).get(c.crisisId!) }))
        .filter((x): x is { cell: RebelCell; crisis: SecessionCrisis } => !!x.crisis && x.crisis.status === 'open')
        .sort((a, b) => b.cell.strength - a.cell.strength);
    for (const { cell, crisis } of candidates) {
        crisis.status = 'escalated';
        crisis.escalatedAtSeconds = world.nowSeconds;
        crisis.resolvedAtSeconds = world.nowSeconds;
        crisis.outcome = 'a movement came out of hiding and declared a state';
        crisis.rebelFactionId ??= freshRebelId(world, cell.systemId);
        const fission = fissionEmpire(world, crisis.id);
        if (!fission.ok || !fission.rebelFactionId) { crisis.status = 'open'; continue; }
        becomeState(world, cell, fission.rebelFactionId);
        return { factionId: fission.rebelFactionId, name: fission.rebelName };
    }
    return null;
}

/** The cell's leader becomes the state's: the AI never speaks for it, and it is readied like any taken breakaway. */
function handOverSeat(world: GameWorldState, cell: RebelCell, rebelFactionId: string): void {
    const claimed: string[] = Array.isArray((world as any).claimedFactionIds) ? (world as any).claimedFactionIds : [];
    if (!claimed.includes(rebelFactionId)) (world as any).claimedFactionIds = [...claimed, rebelFactionId];
    // A fallen empire's leader (Item 14) brings the comeback perks their defeat earned.
    takeBreakaway(world, rebelFactionId, cell.exile
        ? { fromFactionId: cell.exile.fromFactionId, eliminated: true }
        : { fromFactionId: null, eliminated: false });
    launchHiddenDock(world, cell, rebelFactionId);
    cell.seat = null;
    cell.seatView = null;
}

/**
 * Item 14c: the ships the exiles stole come out of hiding as the new state's
 * second squadron, at its capital. Built from the state's militia record (the
 * shape every fleet needs), with its own composition and power.
 */
function launchHiddenDock(world: GameWorldState, cell: RebelCell, rebelFactionId: string): void {
    const dock = cell.exile?.dock ?? [];
    if (dock.length === 0) return;
    const template: any = [...world.movement.fleets.values()].find((f: any) => f.factionId === rebelFactionId);
    if (!template) return;
    const composition: Record<string, number> = {};
    let power = 10;
    for (const ship of dock) {
        composition[ship.shipClass] = (composition[ship.shipClass] ?? 0) + 1;
        power += unitConfigFor(ship.shipClass)?.power ?? 10;
    }
    const id = `fleet-${rebelFactionId}-hidden-dock`;
    world.movement.fleets.set(id, {
        ...JSON.parse(JSON.stringify(template)),
        id, name: 'The Hidden Dock', composition, basePower: power, strength: 1.0, orders: [], plannedPath: [],
    });
    cell.exile!.dock = [];
}
