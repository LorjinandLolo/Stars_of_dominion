/**
 * lib/rebellion/underground-service.ts
 * Rebel cells, phase 13d: a person leads a movement from hiding.
 *
 *   The seat  a late joiner takes a cell before it has a planet to call a
 *             state. Their claim is on the breakaway state the movement will
 *             become (an id with UNDERGROUND_PREFIX), which does not exist yet:
 *             no worlds, no fleet, no empire shell. They see only what the cell
 *             sees (seatView), and give the cell's orders: strike, lie low,
 *             send a sponsor's money back, declare.
 *   Secrecy   the host must never learn the cell is led by a person. The seat
 *             and its view ride the host's shard (cells live there) and are
 *             scrubbed from the host's wire; the claim is kept out of every
 *             roster and out of the worker's list of human empires until the
 *             state exists, so nothing downstream treats it as one.
 *   The end   when fission makes the state, it is made under the seat's own id
 *             (movement-service pins the crisis to it), so the same account
 *             leads it with no second claim. movement-service hands it over.
 *
 * Server-only: reaches the government services through sponsor/movement.
 */

import type { GameWorldState } from '../game-world-state';
import {
    HELD_ACT_COOLDOWN_SECONDS, UNDERGROUND_PREFIX, isUndergroundSeatId, noteForSeat,
    type CellActKind, type CellSeatView, type RebelCell,
} from './rebellion-types';
import { ensureRebellion, formCell, grievanceOf } from './cell-service';
import {
    ACT_MIN_STRENGTH, activeSponsorshipsOf, canAssassinate, commitAct, endSponsorship, sponsorPrisoners,
} from './sponsor-service';
import { hostReadyForMovement, movementReady, riseAsMovement, MOVEMENT_MIN_AGE_SECONDS, MOVEMENT_MIN_STRENGTH } from './movement-service';
import { fireNotification } from '../time/notification-hooks';
import { buyGear, chooseInJob, jobBoard, jobView, planView, setPlan, startJob, startRecon, tickRecon } from '../fallen/job-service';
import { crewForLeader, tickCrew } from '../fallen/crew-service';
import { labelFor } from '../time/notification-names';

/**
 * Grievance a world needs before the game forms a cell there for a newcomer:
 * none. A newcomer never waits on luck (Item 7, decision 1); a quiet world just
 * makes for a slow start, and a led cell does not fade (cell-service LED_MIN_GROWTH).
 */
export const SEAT_FORM_MIN_GRIEVANCE = 0;
/** Strength a cell formed for a newcomer starts with. */
export const SEAT_FORM_STRENGTH = 15;

const NON_PLAYABLE = new Set(['faction-pirates', 'faction-neutral']);

export type SeatResult = { ok: true; message: string } | { ok: false; message: string };

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

/** The seat id for a cell: a breakaway id, recognisable as underground. */
export function seatIdFor(cell: RebelCell): string {
    return `${UNDERGROUND_PREFIX}${cell.id.replace(/[^a-zA-Z0-9-]/g, '').slice(-24)}`;
}

/** The cell this seat leads, if it still leads one. */
export function heldCellOf(world: GameWorldState, factionId: string): RebelCell | undefined {
    if (!isUndergroundSeatId(factionId)) return undefined;
    for (const c of ensureRebellion(world).cells.values()) if (c.seat?.factionId === factionId) return c;
    return undefined;
}

/** Note something in the cell's own record, for its leader. */
export function seatLog(cell: RebelCell, at: number, text: string): void {
    noteForSeat(cell, at, text);
}

function notifySeat(world: GameWorldState, cell: RebelCell, title: string, body: string): void {
    if (!cell.seat) return;
    seatLog(cell, world.nowSeconds, body);
    try {
        fireNotification({
            id: `seat-${cell.id}-${world.nowSeconds}-${title}`, factionId: cell.seat.factionId, category: 'espionage', priority: 'normal',
            title, body, createdAt: new Date(world.nowSeconds * 1000).toISOString(), read: false, linkToTab: 'intelligence',
        });
    } catch { /* notification queue absent in tests */ }
}

// ─── Taking a seat ───────────────────────────────────────────────────────────

/**
 * The cell a newcomer is given: the strongest unled cell, in an AI empire if
 * any has one, or else a new cell on the angriest world (again AI first).
 * A human's empire is the fallback, not excluded: a late joiner arrives when
 * every empire is taken, and a movement inside a friend's empire is the whole
 * Andor game. Unlike a breakaway handed over at once (13c), it starts small
 * and hidden, and the host can hunt it.
 */
export function pickCellForSeat(world: GameWorldState, humanFactionIds: Iterable<string>, rand: () => number = Math.random): RebelCell | null {
    const humans = new Set(humanFactionIds);
    const aiFirst = (host: string) => (humans.has(host) ? 1 : 0);
    const free = [...ensureRebellion(world).cells.values()]
        .filter(c => c.status === 'active' && !c.seat && !NON_PLAYABLE.has(c.hostFactionId) && !isUndergroundSeatId(c.hostFactionId))
        .sort((a, b) => aiFirst(a.hostFactionId) - aiFirst(b.hostFactionId) || b.strength - a.strength);
    if (free[0]) return free[0];

    const worlds = [...((world.construction?.planets?.values?.() ?? []) as Iterable<any>)]
        .filter(p => p.ownerId && !NON_PLAYABLE.has(p.ownerId) && world.economy?.factions?.has?.(p.ownerId))
        .filter(p => ![...ensureRebellion(world).cells.values()].some(c => c.status === 'active' && c.planetId === p.id))
        .map(p => ({ p, g: grievanceOf(world, p) }))
        .filter(x => x.g.score >= SEAT_FORM_MIN_GRIEVANCE)
        .sort((a, b) => aiFirst(a.p.ownerId) - aiFirst(b.p.ownerId) || b.g.score - a.g.score);
    const site = worlds[0];
    if (!site) return null;
    const cell = formCell(world, site.p, site.g, rand);
    cell.strength = Math.max(cell.strength, SEAT_FORM_STRENGTH);
    return cell;
}

/** Put a person at the head of a cell. The worker writes the claim first. */
export function seatCell(world: GameWorldState, cell: RebelCell, factionId: string, displayName: string): SeatResult {
    if (cell.status !== 'active') return { ok: false, message: 'That cell is gone.' };
    if (cell.seat) return { ok: false, message: 'Someone already leads that cell.' };
    if (!isUndergroundSeatId(factionId)) return { ok: false, message: 'Not an underground seat.' };
    cell.seat = { factionId, displayName, takenAtSeconds: world.nowSeconds };
    cell.lyingLow = false;
    refreshSeatView(world, cell);
    notifySeat(world, cell, 'YOU LEAD A MOVEMENT',
        `${cap(cell.name)}, on ${planetName(world, cell)} under ${labelFor(cell.hostFactionId)}: about ${cell.members} people, for ${cell.cause}. Nobody outside the cell knows who leads it. Keep it that way until it is strong enough to stand in the open.`);
    return { ok: true, message: `You lead ${cell.name}.` };
}

/** The claims table changed: cells whose leader let go of the seat are on their own again. */
export function releaseOrphanSeats(world: GameWorldState, claimedIds: Iterable<string>): number {
    const held = new Set(claimedIds);
    let released = 0;
    for (const c of ensureRebellion(world).cells.values()) {
        if (c.seat && !held.has(c.seat.factionId)) { c.seat = null; c.seatView = null; c.lyingLow = false; released++; }
    }
    return released;
}

// ─── What the leader may do ──────────────────────────────────────────────────

const ACT_ORDER: CellActKind[] = ['propaganda', 'heist', 'sabotage', 'prison_break', 'assassination'];

/** Why the cell cannot strike this way now, or null. Shared by the order and the view. */
export function actBlocker(world: GameWorldState, cell: RebelCell, act: CellActKind): string | null {
    if (cell.status !== 'active') return 'The cell is gone.';
    if (cell.strength < ACT_MIN_STRENGTH) return `The cell needs strength ${ACT_MIN_STRENGTH} to strike.`;
    if ((cell.nextActAtSeconds ?? 0) > world.nowSeconds) return 'The cell is still lying low after its last strike.';
    const sponsors = activeSponsorshipsOf(world, cell.id);
    if (act === 'prison_break' && sponsorPrisoners(world, cell, sponsors).length === 0) return 'Nobody we could break out is held here.';
    if (act === 'assassination' && !canAssassinate(world, cell, sponsors)) return 'The governor is beyond us: we need more strength, or weapons.';
    return null;
}

export function orderCellAct(world: GameWorldState, factionId: string, act: string, rand: () => number = Math.random): SeatResult {
    const cell = heldCellOf(world, factionId);
    if (!cell) return { ok: false, message: 'You lead no cell.' };
    if (!ACT_ORDER.includes(act as CellActKind)) return { ok: false, message: 'Unknown act.' };
    const why = actBlocker(world, cell, act as CellActKind);
    if (why) return { ok: false, message: why };
    commitAct(world, cell, act as CellActKind, activeSponsorshipsOf(world, cell.id), rand);
    cell.lyingLow = false;
    cell.nextActAtSeconds = world.nowSeconds + HELD_ACT_COOLDOWN_SECONDS;
    seatLog(cell, world.nowSeconds, `We struck: ${act.replace('_', ' ')}. ${labelFor(cell.hostFactionId)} knows we exist now, if it did not before.`);
    refreshSeatView(world, cell);
    return { ok: true, message: 'Done. Word of it is already spreading.' };
}

export function setLyingLow(world: GameWorldState, factionId: string, on: boolean): SeatResult {
    const cell = heldCellOf(world, factionId);
    if (!cell) return { ok: false, message: 'You lead no cell.' };
    cell.lyingLow = !!on;
    seatLog(cell, world.nowSeconds, on ? 'We go quiet: no strikes, cover rebuilt, slower recruiting.' : 'We are active again.');
    refreshSeatView(world, cell);
    return { ok: true, message: on ? 'The cell lies low.' : 'The cell is active.' };
}

/** Send a sponsor's money back. The sponsor learns only that it was refused. */
export function refuseSponsor(world: GameWorldState, factionId: string, sponsorshipId: string): SeatResult {
    const cell = heldCellOf(world, factionId);
    if (!cell) return { ok: false, message: 'You lead no cell.' };
    const s = activeSponsorshipsOf(world, cell.id).find(x => x.id === sponsorshipId);
    if (!s) return { ok: false, message: 'No such money is coming to us.' };
    endSponsorship(world, s, 'refused');
    try {
        fireNotification({
            id: `csp-refused-${s.id}`, factionId: s.sponsorFactionId, category: 'espionage', priority: 'normal',
            title: 'SPONSORSHIP REFUSED', body: `${cap(cell.name)} sent our money back. They want nothing from us.`,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(), read: false, linkToTab: 'intelligence',
        });
    } catch { /* tests */ }
    seatLog(cell, world.nowSeconds, 'We sent a sponsor\'s money back.');
    refreshSeatView(world, cell);
    return { ok: true, message: 'The money goes back. So does whatever they wanted for it.' };
}

/** Why the movement cannot come into the open now, or null. */
export function declareBlocker(world: GameWorldState, cell: RebelCell): string | null {
    const now = world.nowSeconds;
    if (cell.crisisId) return 'We are already in the open.';
    if (cell.strength < MOVEMENT_MIN_STRENGTH) return `The movement needs strength ${MOVEMENT_MIN_STRENGTH} to stand in the open.`;
    if (now - cell.formedAtSeconds < MOVEMENT_MIN_AGE_SECONDS) return 'Too young: a movement needs about a month underground before people will follow it into the open.';
    if (!movementReady(cell, now)) return 'Too soon after the last time we came out.';
    if (!hostReadyForMovement(world, cell.hostFactionId, now)) return `${labelFor(cell.hostFactionId)} is facing another rising; wait for it to end.`;
    return null;
}

export function declareMovement(world: GameWorldState, factionId: string): SeatResult {
    const cell = heldCellOf(world, factionId);
    if (!cell) return { ok: false, message: 'You lead no cell.' };
    const why = declareBlocker(world, cell);
    if (why) return { ok: false, message: why };
    const crisis = riseAsMovement(world, cell);
    if (!crisis) return { ok: false, message: 'The world would not rise with us.' };
    cell.lyingLow = false;
    seatLog(cell, world.nowSeconds, `We are in the open: ${crisis.name}. ${labelFor(cell.hostFactionId)} must answer us. If it does not settle or crush us, we become a state.`);
    refreshSeatView(world, cell);
    return { ok: true, message: `${crisis.name}: the world has heard us.` };
}

// ─── What the leader sees ────────────────────────────────────────────────────

function planetName(world: GameWorldState, cell: RebelCell): string {
    return String((world.construction?.planets?.get?.(cell.planetId) as any)?.name ?? 'an unknown world');
}

/** The cell as its leader sees it: its own state, its own money, and nothing of the host's files. */
export function refreshSeatView(world: GameWorldState, cell: RebelCell): void {
    if (!cell.seat) { cell.seatView = null; return; }
    const sponsors = activeSponsorshipsOf(world, cell.id);
    const crisis: any = cell.crisisId ? world.secessionCrises?.get?.(cell.crisisId) : null;
    const previousLog = cell.seatView?.log ?? (cell as any).pendingSeatLog ?? [];
    delete (cell as any).pendingSeatLog;
    const view: CellSeatView = {
        asOfSeconds: world.nowSeconds,
        cellId: cell.id,
        status: cell.status,
        name: cell.name,
        cause: cell.cause,
        planetName: planetName(world, cell),
        hostName: labelFor(cell.hostFactionId),
        strength: Math.round(cell.strength),
        members: cell.members,
        treasury: Math.round(cell.treasury ?? 0),
        concealment: Math.round(cell.safeHouse.concealment * 100) / 100,
        found: cell.safeHouse.knownToFactionIds.includes(cell.hostFactionId),
        lyingLow: !!cell.lyingLow,
        acts: cell.actsCommitted ?? 0,
        nextActAtSeconds: cell.nextActAtSeconds ?? null,
        actsOpen: ACT_ORDER.map(act => {
            const why = cell.lyingLow ? 'We are lying low.' : actBlocker(world, cell, act);
            return { act, open: !why, why };
        }),
        sponsors: sponsors.map(s => ({
            sponsorshipId: s.id,
            sponsorName: s.cutout ? null : labelFor(s.sponsorFactionId),
            armed: s.armed,
            since: s.startedAtSeconds,
        })),
        inTheOpen: !!cell.crisisId,
        crisisName: crisis?.name ?? null,
        declare: (() => { const why = declareBlocker(world, cell); return { open: !why, why }; })(),
        log: previousLog,
        // 14d: the leader never sees who has turned.
        exile: cell.exile ? { ...cell.exile, crew: crewForLeader(cell.exile.crew) } : null,
        job: jobView(world, cell),
        jobs: jobBoard(world, cell),
        plan: planView(world, cell),
    };
    cell.seatView = view;
}

/** Refresh every led cell's view. The worker calls this each strategic tick. */
export function refreshSeatViews(world: GameWorldState): void {
    for (const c of ensureRebellion(world).cells.values()) {
        if (!c.seat) continue;
        // 14d: wounds heal, prisoners are questioned, loyalty may turn.
        tickCrew(world, c);
        // 14c: a watch that has run its time reports back.
        const report = tickRecon(world, c);
        if (report) notifySeat(world, c, 'THE WATCHER IS BACK', report);
        refreshSeatView(world, c);
    }
}

// ─── Item 14c: planning ──────────────────────────────────────────────────────

function withCell(world: GameWorldState, factionId: string, fn: (cell: RebelCell) => SeatResult): SeatResult {
    const cell = heldCellOf(world, factionId);
    if (!cell) return { ok: false, message: 'You lead no cell.' };
    const r = fn(cell);
    refreshSeatView(world, cell);
    return r;
}

/** Plan a job: target, approach, who goes, who does what. */
export function orderPlan(world: GameWorldState, factionId: string, payload: any): SeatResult {
    return withCell(world, factionId, cell => setPlan(world, cell, payload ?? {}));
}

/** Send someone to watch the planned job's target. */
export function orderRecon(world: GameWorldState, factionId: string, companionId: unknown): SeatResult {
    return withCell(world, factionId, cell => startRecon(world, cell, companionId));
}

/** Buy gear for the planned job. */
export function orderGear(world: GameWorldState, factionId: string, gearId: unknown): SeatResult {
    return withCell(world, factionId, cell => buyGear(world, cell, gearId));
}

// ─── Item 14b: jobs ──────────────────────────────────────────────────────────

/** Start a job with the chosen crew. Only a fallen empire's crew takes jobs. */
export function orderJobStart(world: GameWorldState, factionId: string, jobId: unknown, crewIds: unknown): SeatResult {
    const cell = heldCellOf(world, factionId);
    if (!cell) return { ok: false, message: 'You lead no cell.' };
    const r = startJob(world, cell, String(jobId ?? ''), crewIds);
    refreshSeatView(world, cell);
    return r;
}

/** One choice in the job under way. The page sends the choice id and nothing else. */
export function orderJobChoice(world: GameWorldState, factionId: string, choiceId: unknown): SeatResult {
    const cell = heldCellOf(world, factionId);
    if (!cell) return { ok: false, message: 'You lead no cell.' };
    const r = chooseInJob(world, cell, choiceId);
    if (r.ok && cell.job && cell.job.status !== 'running') seatLog(cell, world.nowSeconds, r.message);
    refreshSeatView(world, cell);
    return r;
}
