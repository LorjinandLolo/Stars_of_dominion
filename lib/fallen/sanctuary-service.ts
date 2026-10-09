/**
 * lib/fallen/sanctuary-service.ts
 * Item 14f: a friend who still holds an empire shelters a fallen government,
 * as Canada sheltered the Dutch royal family. Server-only.
 *
 *   Asking    the exile asks a player's empire (never an AI: shelter is a
 *             friend's choice). The host answers on its diplomacy page: openly,
 *             quietly, or no. An unanswered request lapses.
 *   Shelter   the government in exile sits on the host's capital world. The
 *             people resting there (not out on a job or a watch) heal twice as
 *             fast and cannot be taken by the conqueror's sweeps or
 *             crackdowns; recruits come easier; but everyone travels, so
 *             watches and the wait between jobs take longer.
 *   Open      a public stance: nothing to find, but the conqueror's rivalry
 *             with the host rises at once and the press reports it.
 *   Quiet     a secret: evidence builds as with covert sponsorship (faster
 *             with every job run from there), and exposure costs more than the
 *             open stance would have.
 *   Demand    once the conqueror knows, it can demand the exile be handed
 *             over (an AI conqueror always does, and again after a while). The
 *             host answers: refuse and the rivalry rises; hand them over and
 *             the people sheltering there go to the conqueror's prisons.
 *             Unanswered, a demand counts as refused.
 *   After     a movement that wins its state starts on good terms with the
 *             empire that sheltered it.
 */

import type { GameWorldState } from '../game-world-state';
import {
    SANCTUARY_DEMAND_COOLDOWN_SECONDS, inSanctuary, isUndergroundSeatId, noteForSeat, sanctuaryKnown,
    type Companion, type RebelCell, type Sanctuary,
} from '../rebellion/rebellion-types';
import { ensureRebellion } from '../rebellion/cell-service';
import { shiftRivalry } from '../diplomacy/offer-service';
import { fireNotification } from '../time/notification-hooks';
import { labelFor } from '../time/notification-names';
import * as chronicle from '../narrative/chronicle';
import { busyIds } from './fellows-service';
import { captureCompanion } from './crew-service';

export type SanctuaryResult = { ok: true; message: string } | { ok: false; message: string };

/** Watches and the wait between jobs take this much longer from sanctuary. */
export const SANCTUARY_STAGING = 1.5;
/** Evidence a quiet sanctuary leaks per strategic tick (about 21 sim days to exposure), and per job run from it. */
export const QUIET_EVIDENCE_PER_TICK = 0.01;
export const QUIET_EVIDENCE_PER_JOB = 0.05;
export const QUIET_EXPOSED_AT = 0.85;
/** Rivalry with the conqueror: an open stance at once; a quiet one found out costs more. */
export const OPEN_RIVALRY = 12;
export const EXPOSED_RIVALRY = 20;
export const REFUSE_RIVALRY = 10;
/** Handing them over buys a little peace. */
export const HANDOVER_RIVALRY = -5;
/** A new state's rivalry with the empire that sheltered it falls by this. */
export const SHELTERED_RELATIONS = -30;
export const ANSWER_WINDOW_SECONDS = 5 * 86400;
export const DEMAND_WINDOW_SECONDS = 5 * 86400;
export const DEMAND_COOLDOWN_SECONDS = SANCTUARY_DEMAND_COOLDOWN_SECONDS;

const NON_PLAYABLE = new Set(['faction-pirates', 'faction-neutral']);

function claimed(world: GameWorldState): string[] {
    const c = (world as any).claimedFactionIds;
    return Array.isArray(c) ? c : [];
}

function isPlayerRun(world: GameWorldState, factionId: string): boolean {
    return !NON_PLAYABLE.has(factionId) && claimed(world).includes(factionId);
}

function holdsAWorld(world: GameWorldState, factionId: string): boolean {
    for (const p of (world.construction?.planets?.values?.() ?? []) as Iterable<any>) if (p.ownerId === factionId) return true;
    return false;
}

function notify(world: GameWorldState, factionId: string, id: string, title: string, body: string, priority: 'normal' | 'urgent' = 'normal'): void {
    if (!isPlayerRun(world, factionId)) return;
    try {
        fireNotification({
            id: `sanct-${id}-${world.nowSeconds}`, factionId, category: 'diplomacy', priority,
            title, body, createdAt: new Date(world.nowSeconds * 1000).toISOString(), read: false, linkToTab: 'diplomacy',
        });
    } catch { /* tests */ }
}

function seatNote(world: GameWorldState, cell: RebelCell, title: string, body: string): void {
    noteForSeat(cell, world.nowSeconds, body);
    if (!cell.seat) return;
    try {
        fireNotification({
            id: `sanct-seat-${cell.id}-${world.nowSeconds}-${title}`, factionId: cell.seat.factionId, category: 'espionage', priority: 'normal',
            title, body, createdAt: new Date(world.nowSeconds * 1000).toISOString(), read: false, linkToTab: 'intelligence',
        });
    } catch { /* tests */ }
}

/** "the exiled government of Aglate": what the world calls them. */
export function exileName(cell: RebelCell): string {
    return `the exiled government of ${cell.exile?.fromName ?? 'a fallen empire'}`;
}

function capitalOf(world: GameWorldState, factionId: string): string | null {
    const sysId = (world.economy?.factions?.get?.(factionId) as any)?.capitalSystemId ?? null;
    let best: any = null;
    for (const p of (world.construction?.planets?.values?.() ?? []) as Iterable<any>) {
        if (p.ownerId !== factionId) continue;
        if (sysId && p.systemId === sysId) return p.id;
        if (!best || Number(p.population ?? 0) > Number(best.population ?? 0)) best = p;
    }
    return best?.id ?? null;
}

/** Find a sanctuary by id, with the exile cell it belongs to. */
export function findSanctuary(world: GameWorldState, id: string): { cell: RebelCell; s: Sanctuary } | null {
    for (const cell of ensureRebellion(world).cells.values()) {
        const s = cell.exile?.sanctuary;
        if (s && s.id === id) return { cell, s };
    }
    return null;
}

/** Empires still standing, held by a person, that an exile could ask. */
export function shelterCandidates(world: GameWorldState, cell: RebelCell): { factionId: string; name: string }[] {
    if (!cell.exile) return [];
    return claimed(world)
        .filter(id => !NON_PLAYABLE.has(id) && !isUndergroundSeatId(id))
        .filter(id => id !== cell.hostFactionId && id !== cell.exile!.conquerorId && id !== cell.exile!.fromFactionId)
        .filter(id => world.economy?.factions?.has?.(id) && holdsAWorld(world, id))
        .map(id => ({ factionId: id, name: labelFor(id) }));
}

/** Those resting in sanctuary: neither out on a job nor on a watch, and not lost. */
export function restingCompanions(world: GameWorldState, cell: RebelCell): Companion[] {
    const busy = busyIds(world, cell);
    return (cell.exile?.crew ?? []).filter(c => (c.status === 'free' || c.status === 'wounded') && !busy.has(c.id));
}

function end(s: Sanctuary, status: Sanctuary['status'], now: number): void {
    s.status = status;
    s.endedAtSeconds = now;
    s.demand = null;
}

// ─── The exile's side ────────────────────────────────────────────────────────

export function askSanctuary(world: GameWorldState, cell: RebelCell, factionId: unknown): SanctuaryResult {
    if (!cell.exile) return { ok: false, message: 'Only a fallen government can ask for sanctuary.' };
    const cur = cell.exile.sanctuary;
    if (cur && (cur.status === 'asked' || cur.status === 'given')) return { ok: false, message: cur.status === 'given' ? 'We have shelter already.' : 'We are waiting on an answer already.' };
    const host = String(factionId ?? '');
    if (!shelterCandidates(world, cell).some(c => c.factionId === host)) return { ok: false, message: 'They cannot shelter us.' };
    const now = world.nowSeconds;
    cell.exile.sanctuary = {
        id: `sanct-${cell.id.replace(/[^a-zA-Z0-9-]/g, '').slice(-24)}-${now}`,
        hostFactionId: host, hostName: labelFor(host), planetId: null, mode: null, status: 'asked', askedAtSeconds: now,
        evidence: 0, demandsRefused: 0,
    };
    notify(world, host, `ask-${cell.id}`, 'A FALLEN GOVERNMENT ASKS FOR SHELTER',
        `${cell.seat?.displayName ?? 'A fallen leader'}, of ${exileName(cell)}, asks us for sanctuary from ${labelFor(cell.hostFactionId)}. We can take them in openly, quietly, or not at all.`, 'urgent');
    noteForSeat(cell, now, `We have asked ${labelFor(host)} for sanctuary.`);
    return { ok: true, message: `Word has gone to ${labelFor(host)}.` };
}

/** Leave sanctuary (or withdraw the request). */
export function leaveSanctuary(world: GameWorldState, cell: RebelCell): SanctuaryResult {
    const s = cell.exile?.sanctuary;
    if (!s || (s.status !== 'asked' && s.status !== 'given')) return { ok: false, message: 'We have no shelter to leave.' };
    const was = s.status;
    end(s, 'ended', world.nowSeconds);
    if (was === 'given') notify(world, s.hostFactionId, `left-${cell.id}`, 'THE EXILES HAVE GONE', `${cap(exileName(cell))} has left our protection.`);
    noteForSeat(cell, world.nowSeconds, was === 'given' ? `We have left ${labelFor(s.hostFactionId)}'s protection.` : 'We withdrew our request for sanctuary.');
    return { ok: true, message: was === 'given' ? 'We are on our own again.' : 'Request withdrawn.' };
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

// ─── The host's side ─────────────────────────────────────────────────────────

/**
 * The host answers a request ('open', 'quiet', 'refuse'), ends a shelter
 * ('end'), or answers the conqueror's demand ('refuse_demand', 'hand_over').
 */
export function answerSanctuary(world: GameWorldState, hostId: string, sanctuaryId: unknown, answer: unknown): SanctuaryResult {
    const found = findSanctuary(world, String(sanctuaryId ?? ''));
    if (!found || found.s.hostFactionId !== hostId) return { ok: false, message: 'No such request.' };
    const { cell, s } = found;
    const now = world.nowSeconds;
    const conqueror = cell.hostFactionId;
    const a = String(answer ?? '');

    if (a === 'open' || a === 'quiet' || a === 'refuse') {
        if (s.status !== 'asked') return { ok: false, message: 'That has been answered.' };
        if (a === 'refuse') {
            end(s, 'refused', now);
            seatNote(world, cell, 'NO SHELTER', `${labelFor(hostId)} will not take us in.`);
            return { ok: true, message: 'Refused.' };
        }
        s.status = 'given';
        s.mode = a;
        s.sinceSeconds = now;
        s.planetId = capitalOf(world, hostId);
        const where = String((world.construction?.planets?.get?.(s.planetId ?? '') as any)?.name ?? 'the capital');
        s.planetName = where;
        if (a === 'open') {
            try { shiftRivalry(world, conqueror, hostId, OPEN_RIVALRY, 'sanctuary_given', exileName(cell)); } catch { /* minimal worlds */ }
            recordChronicle(world, cell, s, 'given');
            notify(world, conqueror, `open-${s.id}`, 'SANCTUARY FOR OUR ENEMIES',
                `${labelFor(hostId)} has openly taken in ${exileName(cell)}, on ${where}.`, 'urgent');
        }
        seatNote(world, cell, 'SANCTUARY', a === 'open'
            ? `${labelFor(hostId)} takes us in, openly: the government in exile sits on ${where}. ${labelFor(conqueror)} knows, and will not like it.`
            : `${labelFor(hostId)} takes us in, quietly: the government in exile sits on ${where}. Nobody must know.`);
        return { ok: true, message: a === 'open' ? `${cap(exileName(cell))} is under our protection, openly.` : `${cap(exileName(cell))} is under our protection. Quietly.` };
    }

    if (a === 'end') {
        if (s.status !== 'given') return { ok: false, message: 'We are not sheltering them.' };
        end(s, 'ended', now);
        seatNote(world, cell, 'SHELTER WITHDRAWN', `${labelFor(hostId)} has asked us to leave. We are on our own again.`);
        return { ok: true, message: 'They have been asked to leave.' };
    }

    if (a === 'refuse_demand' || a === 'hand_over') {
        if (s.status !== 'given' || !s.demand) return { ok: false, message: 'Nobody is demanding anything.' };
        if (a === 'refuse_demand') { refuseDemand(world, cell, s); return { ok: true, message: 'We refuse to hand them over.' }; }
        handOver(world, cell, s);
        return { ok: true, message: 'They have been handed over.' };
    }
    return { ok: false, message: 'Unknown answer.' };
}

function refuseDemand(world: GameWorldState, cell: RebelCell, s: Sanctuary): void {
    const conqueror = cell.hostFactionId;
    s.demand = null;
    s.lastDemandAtSeconds = world.nowSeconds;
    s.demandsRefused++;
    try { shiftRivalry(world, conqueror, s.hostFactionId, REFUSE_RIVALRY, 'sanctuary_refused', exileName(cell)); } catch { /* minimal worlds */ }
    recordChronicle(world, cell, s, 'refused');
    notify(world, conqueror, `refused-${s.id}`, 'DEMAND REFUSED', `${labelFor(s.hostFactionId)} refuses to hand over ${exileName(cell)}.`);
    seatNote(world, cell, 'THEY STOOD BY US', `${labelFor(conqueror)} demanded we be handed over. ${labelFor(s.hostFactionId)} said no.`);
}

/** Handed over: the people resting in sanctuary go to the conqueror's prisons. */
function handOver(world: GameWorldState, cell: RebelCell, s: Sanctuary): void {
    const conqueror = cell.hostFactionId;
    const taken: string[] = [];
    for (const c of restingCompanions(world, cell)) {
        captureCompanion(world, cell, c, 'the border');
        taken.push(c.name);
    }
    end(s, 'handed_over', world.nowSeconds);
    try { shiftRivalry(world, conqueror, s.hostFactionId, HANDOVER_RIVALRY, 'sanctuary_handed_over', exileName(cell)); } catch { /* minimal worlds */ }
    recordChronicle(world, cell, s, 'handed_over');
    notify(world, conqueror, `handed-${s.id}`, 'THE EXILES HANDED OVER',
        `${labelFor(s.hostFactionId)} has handed over ${exileName(cell)}${taken.length ? `: ${taken.length} of them are in our custody` : ''}.`, 'urgent');
    seatNote(world, cell, 'BETRAYED', taken.length
        ? `${labelFor(s.hostFactionId)} handed us over. ${taken.join(', ')} ${taken.length === 1 ? 'is' : 'are'} in ${labelFor(conqueror)}'s hands now.`
        : `${labelFor(s.hostFactionId)} handed us over. Nobody was there for them to take, this time.`);
}

// ─── The conqueror's side ────────────────────────────────────────────────────

export function demandBlocker(world: GameWorldState, cell: RebelCell, s: Sanctuary): string | null {
    if (!sanctuaryKnown(s)) return 'We know of no shelter.';
    if (s.demand) return 'Our demand is waiting on their answer.';
    if (s.lastDemandAtSeconds != null && world.nowSeconds - s.lastDemandAtSeconds < DEMAND_COOLDOWN_SECONDS) return 'Too soon after the last demand.';
    return null;
}

export function demandHandover(world: GameWorldState, conquerorId: string, sanctuaryId: unknown): SanctuaryResult {
    const found = findSanctuary(world, String(sanctuaryId ?? ''));
    if (!found || found.cell.hostFactionId !== conquerorId) return { ok: false, message: 'No such shelter.' };
    const why = demandBlocker(world, found.cell, found.s);
    if (why) return { ok: false, message: why };
    makeDemand(world, found.cell, found.s);
    return { ok: true, message: `Demand sent to ${labelFor(found.s.hostFactionId)}.` };
}

function makeDemand(world: GameWorldState, cell: RebelCell, s: Sanctuary): void {
    const now = world.nowSeconds;
    s.demand = { atSeconds: now, untilSeconds: now + DEMAND_WINDOW_SECONDS };
    s.lastDemandAtSeconds = now;
    notify(world, s.hostFactionId, `demand-${s.id}`, 'HAND THEM OVER',
        `${labelFor(cell.hostFactionId)} demands we hand over ${exileName(cell)}. Refuse, and our relations suffer; hand them over, and those sheltering with us go to its prisons.`, 'urgent');
    seatNote(world, cell, 'A DEMAND', `${labelFor(cell.hostFactionId)} demands ${labelFor(s.hostFactionId)} hand us over.`);
}

// ─── The strategic tick ──────────────────────────────────────────────────────

/** Requests lapse, quiet shelters leak, the conqueror demands, demands run out. */
export function tickSanctuary(world: GameWorldState, cell: RebelCell): void {
    const s = cell.exile?.sanctuary;
    if (!s || (s.status !== 'asked' && s.status !== 'given')) return;
    const now = world.nowSeconds;
    // The host fell, or is the conqueror now.
    if (!world.economy?.factions?.has?.(s.hostFactionId) || !holdsAWorld(world, s.hostFactionId) || s.hostFactionId === cell.hostFactionId) {
        end(s, 'ended', now);
        seatNote(world, cell, 'SHELTER LOST', `${labelFor(s.hostFactionId)} can shelter nobody any more.`);
        return;
    }
    if (s.status === 'asked') {
        if (now - s.askedAtSeconds > ANSWER_WINDOW_SECONDS) {
            end(s, 'refused', now);
            seatNote(world, cell, 'NO ANSWER', `${labelFor(s.hostFactionId)} never answered. We take that as a no.`);
        }
        return;
    }
    if (s.mode === 'quiet' && !s.exposedAtSeconds) addEvidence(world, cell, s, QUIET_EVIDENCE_PER_TICK);
    if (s.demand && now >= s.demand.untilSeconds) { refuseDemand(world, cell, s); return; }
    // An AI conqueror always demands, and asks again after a while.
    if (!isPlayerRun(world, cell.hostFactionId) && !demandBlocker(world, cell, s)) makeDemand(world, cell, s);
}

/** A job run from sanctuary means people crossing a border: a quiet shelter leaks. */
export function jobTravelEvidence(world: GameWorldState, cell: RebelCell): void {
    const s = cell.exile?.sanctuary;
    if (inSanctuary(cell) && s?.mode === 'quiet' && !s.exposedAtSeconds) addEvidence(world, cell, s, QUIET_EVIDENCE_PER_JOB);
}

function addEvidence(world: GameWorldState, cell: RebelCell, s: Sanctuary, amount: number): void {
    s.evidence = Math.min(1, s.evidence + amount);
    if (s.evidence < QUIET_EXPOSED_AT || s.exposedAtSeconds) return;
    s.exposedAtSeconds = world.nowSeconds;
    const conqueror = cell.hostFactionId;
    try { shiftRivalry(world, conqueror, s.hostFactionId, EXPOSED_RIVALRY, 'sanctuary_exposed', exileName(cell)); } catch { /* minimal worlds */ }
    recordChronicle(world, cell, s, 'exposed');
    notify(world, conqueror, `exposed-${s.id}`, 'A SECRET SHELTER', `${labelFor(s.hostFactionId)} has been secretly sheltering ${exileName(cell)}. We have the proof.`, 'urgent');
    notify(world, s.hostFactionId, `exposed-host-${s.id}`, 'OUR SECRET IS OUT', `${labelFor(conqueror)} has proof we shelter ${exileName(cell)}.`, 'urgent');
    seatNote(world, cell, 'FOUND OUT', `${labelFor(conqueror)} has learned that ${labelFor(s.hostFactionId)} shelters us.`);
}

function recordChronicle(world: GameWorldState, cell: RebelCell, s: Sanctuary, phase: 'given' | 'exposed' | 'refused' | 'handed_over'): void {
    chronicle.record(world, {
        type: 'sanctuary',
        actorIds: [s.hostFactionId],
        targetIds: [cell.hostFactionId],
        // Where they shelter, never where the movement hides.
        location: (world.construction?.planets?.get?.(s.planetId ?? '') as any)?.systemId ?? undefined,
        attribution: 'exposed',
        facts: { phase, exileName: exileName(cell), fromName: cell.exile?.fromName ?? 'a fallen empire' },
    });
}

/** A movement that wins its state starts on good terms with the empire that sheltered it. */
export function welcomeNewState(world: GameWorldState, cell: RebelCell, newFactionId: string): void {
    const s = cell.exile?.sanctuary;
    if (!s || s.status !== 'given') return;
    try { shiftRivalry(world, newFactionId, s.hostFactionId, SHELTERED_RELATIONS, 'sheltered_us', 'sanctuary in exile'); } catch { /* minimal worlds */ }
    end(s, 'ended', world.nowSeconds);
    notify(world, s.hostFactionId, `won-${s.id}`, 'THE EXILES WENT HOME', `The people we sheltered have their own state now. They will remember who took them in.`);
}
