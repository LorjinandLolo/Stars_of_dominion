/**
 * lib/fallen/crew-service.ts
 * Item 14d: the crew lives and dies. Server-only.
 *
 *   Fates     a job step can wound, capture or kill whoever handles a skill on
 *             it. Death is permanent: nothing in the game brings a companion
 *             back, and the dead are remembered on the memorial and in the
 *             press. Sacrifice choices say what they may cost before they are
 *             taken (lib/fallen/jobs.ts JobChoice.risk).
 *   Capture   a captured companion is a real prisoner of the conqueror: on its
 *             books, and under interrogation every strategic tick. Someone who
 *             breaks names the cell: the conqueror finds it, knows where to
 *             look next time it cracks down, and the testimony goes onto its
 *             files. A prison break (the detention job) brings them home.
 *   Betrayal  a companion whose loyalty runs out may turn, in secret, even
 *             from the leader: the jobs they go on go worse, the conqueror
 *             knows where to look, and one day they are found out and gone.
 *   Threads   a companion's own business is settled by the right job; it
 *             binds them closer than anything else.
 */

import type { GameWorldState } from '../game-world-state';
import { HOMEGROWN, noteForSeat, type Companion, type JobRun, type RebelCell } from '../rebellion/rebellion-types';
import { revealCell } from '../rebellion/cell-service';
import { ensureCases, INFORMANT_WINDOW_SECONDS } from '../espionage/case-board';
import { getOrCreateFactionIntel } from '../espionage/faction-intel';
import { fireNotification } from '../time/notification-hooks';
import { labelFor } from '../time/notification-names';
import * as chronicle from '../narrative/chronicle';
import type { FateKind, JobEnd } from './jobs';

/** A wound keeps a companion off jobs for three sim days (about five real hours). */
export const WOUND_SECONDS = 3 * 86400;
/** Chance per strategic tick a prisoner breaks, before their loyalty and bond hold them. */
export const BREAK_BASE_CHANCE = 0.15;
/** Below this loyalty a companion may turn. */
export const TURN_LOYALTY = 30;
export const TURN_CHANCE = 0.03;
/** A traitor on a job: the conqueror knew we were coming. */
export const TRAITOR_PENALTY = 0.15;
/** Chance a traitor on a job is found out when it ends. */
export const DISCOVERY_CHANCE = 0.25;
/** The forged identity's one walk-in. */
export const IDENTITY_BONUS = 0.25;
export const THREAD_BOND = 15;
export const THREAD_LOYALTY = 10;

const NON_PLAYABLE = new Set(['faction-pirates', 'faction-neutral']);
function isPlayerRun(world: GameWorldState, factionId: string): boolean {
    if (NON_PLAYABLE.has(factionId)) return false;
    const claimed = (world as any).claimedFactionIds;
    return Array.isArray(claimed) && claimed.includes(factionId);
}

function planetName(world: GameWorldState, planetId: string | null | undefined): string {
    return String((world.construction?.planets?.get?.(planetId ?? '') as any)?.name ?? 'the hideout world');
}

function notifySeat(world: GameWorldState, cell: RebelCell, title: string, body: string): void {
    noteForSeat(cell, world.nowSeconds, body);
    if (!cell.seat) return;
    try {
        fireNotification({
            id: `crew-${cell.id}-${world.nowSeconds}-${title}`, factionId: cell.seat.factionId, category: 'espionage', priority: 'urgent',
            title, body, createdAt: new Date(world.nowSeconds * 1000).toISOString(), read: false, linkToTab: 'intelligence',
        });
    } catch { /* tests */ }
}

function living(cell: RebelCell): Companion[] {
    return (cell.exile?.crew ?? []).filter(c => c.status !== 'dead' && c.status !== 'gone');
}

// ─── Fates ───────────────────────────────────────────────────────────────────

export function applyFate(world: GameWorldState, cell: RebelCell, c: Companion, kind: FateKind, where: string, how: string): void {
    if (c.status === 'dead' || c.status === 'gone') return;
    if (kind === 'wound') {
        c.status = 'wounded';
        c.woundedUntilSeconds = world.nowSeconds + WOUND_SECONDS;
    } else if (kind === 'capture') {
        captureCompanion(world, cell, c, where);
    } else {
        killCompanion(world, cell, c, how);
    }
}

export function woundCompanion(world: GameWorldState, c: Companion): void {
    c.status = 'wounded';
    c.woundedUntilSeconds = world.nowSeconds + WOUND_SECONDS;
}

/**
 * Taken by the conqueror: on its books as a prisoner (they say they serve the
 * old empire, which is the truth), and the cell they came from is no secret
 * any more.
 */
export function captureCompanion(world: GameWorldState, cell: RebelCell, c: Companion, where: string): void {
    const host = cell.hostFactionId;
    c.status = 'captured';
    c.capturedAtSeconds = world.nowSeconds;
    c.broke = false;
    const intel = getOrCreateFactionIntel(world, host);
    const list = (intel.prisoners ??= []);
    if (!list.some(p => p.agentId === c.id)) {
        list.push({ agentId: c.id, codename: c.name, species: c.species, claimedEmployerId: cell.exile?.fromFactionId ?? HOMEGROWN, takenAt: world.nowSeconds, systemId: cell.systemId });
        if (list.length > 20) list.splice(0, list.length - 20);
    }
    revealCell(cell, host);
    if (isPlayerRun(world, host)) {
        try {
            fireNotification({
                id: `prisoner-${c.id}-${world.nowSeconds}`, factionId: host, category: 'espionage', priority: 'normal',
                title: 'A REBEL TAKEN', body: `Security at ${where} took ${c.name}, one of ${cell.name}. Interrogation has begun.`,
                createdAt: new Date(world.nowSeconds * 1000).toISOString(), read: false, linkToTab: 'intelligence',
            });
        } catch { /* tests */ }
    }
    notifySeat(world, cell, 'TAKEN', `${c.name} was taken at ${where}. ${labelFor(host)} has them now, and will make them talk if it can.`);
}

/** Dead. Permanent: no path in the game brings a companion back. */
export function killCompanion(world: GameWorldState, cell: RebelCell, c: Companion, how: string): void {
    c.status = 'dead';
    c.diedAtSeconds = world.nowSeconds;
    c.epitaph = how;
    (cell.exile!.memorial ??= []).push({ name: c.name, role: c.role, diedAtSeconds: world.nowSeconds, epitaph: how });
    // Grief binds the rest closer to the leader, and costs some of them their nerve.
    for (const o of living(cell)) {
        if (o.id === c.id) continue;
        o.bond = Math.min(100, o.bond + 2);
        o.loyalty = Math.max(0, o.loyalty - 4);
    }
    chronicle.record(world, {
        type: 'rebel_killed',
        actorIds: [],
        targetIds: [cell.hostFactionId],
        location: cell.systemId,
        attribution: 'invisible',
        facts: { planetName: planetName(world, cell.planetId), cause: cell.cause },
    });
    notifySeat(world, cell, 'LOST', `${c.name} is dead. ${how}`);
}

// ─── Prisons ─────────────────────────────────────────────────────────────────

/** A prisoner breaks: the conqueror finds the cell, and the testimony goes on its files. */
export function breakPrisoner(world: GameWorldState, cell: RebelCell, c: Companion): void {
    const host = cell.hostFactionId;
    c.broke = true;
    revealCell(cell, host);
    cell.informedUntilSeconds = world.nowSeconds + INFORMANT_WINDOW_SECONDS;
    cell.safeHouse.concealment = Math.max(0.1, cell.safeHouse.concealment - 0.2);
    const text = `${c.name}, one of ${cell.name} taken in our custody, has talked: they meet on ${planetName(world, cell.planetId)}, and fight for ${cell.exile?.fromName ?? 'a cause of their own'}. Nobody pays them.`;
    let filed = false;
    for (const kase of ensureCases(world).values()) {
        if (kase.cellId !== cell.id || kase.status !== 'open' || kase.ownerFactionId !== host) continue;
        (kase.pendingClues ??= []).unshift({
            id: `clue-prisoner-${c.id}-${world.nowSeconds}`, source: 'interrogation', tag: 'testimony', text,
            pointsAt: [HOMEGROWN], weights: { [HOMEGROWN]: 0.6 }, arrivedAt: 0,
        });
        kase.nextClueAt = Math.min(kase.nextClueAt, world.nowSeconds);
        filed = true;
    }
    if (!filed && isPlayerRun(world, host)) {
        try {
            fireNotification({
                id: `prisoner-talks-${c.id}-${world.nowSeconds}`, factionId: host, category: 'espionage', priority: 'urgent',
                title: 'A PRISONER TALKS', body: text, createdAt: new Date(world.nowSeconds * 1000).toISOString(), read: false, linkToTab: 'intelligence',
            });
        } catch { /* tests */ }
    }
    notifySeat(world, cell, 'SOMEONE HAS TALKED', `${c.name} broke under interrogation. ${labelFor(host)} knows where we meet.`);
}

/** A prison break brings home every companion the conqueror holds. Returns their names. */
export function rescueCaptured(world: GameWorldState, cell: RebelCell): string[] {
    const intel = world.espionage.factionIntel.get(cell.hostFactionId);
    const freed: string[] = [];
    for (const c of cell.exile?.crew ?? []) {
        if (c.status !== 'captured') continue;
        c.status = 'wounded';
        c.woundedUntilSeconds = world.nowSeconds + WOUND_SECONDS;
        c.capturedAtSeconds = null;
        c.bond = Math.min(100, c.bond + 10);
        if (intel?.prisoners) intel.prisoners = intel.prisoners.filter(p => p.agentId !== c.id);
        freed.push(c.name);
    }
    return freed;
}

// ─── The strategic tick ──────────────────────────────────────────────────────

/** Wounds heal, prisoners are questioned, and loyalty that has run out may turn. */
export function tickCrew(world: GameWorldState, cell: RebelCell, rand: () => number = Math.random): void {
    if (!cell.exile) return;
    const now = world.nowSeconds;
    for (const c of cell.exile.crew) {
        if (c.status === 'wounded' && (c.woundedUntilSeconds ?? 0) <= now) {
            c.status = 'free';
            c.woundedUntilSeconds = null;
            noteForSeat(cell, now, `${c.name} is on their feet again.`);
        }
        if (c.status === 'captured' && !c.broke) {
            const hold = (1 - c.loyalty / 150) * (1 - c.bond / 200);
            if (rand() < BREAK_BASE_CHANCE * hold) breakPrisoner(world, cell, c);
        }
        if (c.status === 'free' && !c.turned && c.loyalty < TURN_LOYALTY) {
            const pull = c.threadId === 'writes' ? 2 : 1;
            if (rand() < TURN_CHANCE * pull) c.turned = true;
        }
        // A traitor keeps their handler informed.
        if (c.turned && c.status === 'free') {
            revealCell(cell, cell.hostFactionId);
            cell.informedUntilSeconds = Math.max(cell.informedUntilSeconds ?? 0, now + 86400);
        }
    }
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

/** What a thread needs: a job of this kind, ending well, with them on it. */
export const THREAD_RESOLUTION: Record<string, { jobs: string[]; text: string }> = {
    sister: { jobs: ['detention'], text: '{name} found their sister among the freed, thin and alive.' },
    debt: { jobs: ['payroll', 'vault'], text: '{name} paid the smuggler off out of the take. One less person who knows where we meet.' },
    oath: { jobs: ['broadcast'], text: '{name} read the old oath on every screen on the world. They kept it, this time.' },
    believer: { jobs: ['broadcast'], text: '{name} heard the city answer the broadcast, and believes it more than ever.' },
    codes: { jobs: ['cutter'], text: '{name}\'s old archive codes opened the ship\'s locks like a key. Nobody will pay for them now.' },
    child: { jobs: ['detention', 'vault'], text: 'Afterwards, {name} told you about their child. It was the first time.' },
};

/** Everything that happens to the crew when a job ends. Returns lines for the story. */
export function crewAfterJob(world: GameWorldState, cell: RebelCell, run: JobRun, end: JobEnd, rand: () => number = Math.random): string[] {
    const lines: string[] = [];
    const crew = (cell.exile?.crew ?? []).filter(c => run.crewIds.includes(c.id));
    const worked = end !== 'failure';
    for (const c of crew) {
        if (c.status === 'dead' || c.status === 'gone') continue;
        c.loyalty = Math.max(0, Math.min(100, c.loyalty + (worked ? 3 : -5)));
    }
    // A prison break brings our own people home too.
    if (worked && run.jobId === 'detention') {
        const freed = rescueCaptured(world, cell);
        if (freed.length) lines.push(`Among those who walked out: ${freed.join(' and ')}. They are home.`);
    }
    // Unfinished business, settled.
    if (worked) {
        for (const c of crew) {
            const r = c.threadId ? THREAD_RESOLUTION[c.threadId] : undefined;
            if (!r || c.threadResolved || c.status === 'dead' || !r.jobs.includes(run.jobId)) continue;
            c.threadResolved = true;
            c.bond = Math.min(100, c.bond + THREAD_BOND);
            c.loyalty = Math.min(100, c.loyalty + THREAD_LOYALTY);
            if (c.threadId === 'debt') cell.treasury = Math.max(0, (cell.treasury ?? 0) - 500);
            lines.push(r.text.replace('{name}', c.name));
        }
    }
    // A traitor on the job may be found out.
    for (const c of crew) {
        if (!c.turned || c.status !== 'free') continue;
        if (rand() < DISCOVERY_CHANCE) {
            c.status = 'gone';
            lines.push(`${c.name} was seen meeting an officer of ${cell.exile?.conquerorName ?? labelFor(cell.hostFactionId)}. By the time you went looking for them, they were gone.`);
            noteForSeat(cell, world.nowSeconds, `${c.name} betrayed us, and is gone.`);
        }
    }
    return lines;
}

/** Check modifiers from who is on the job: a traitor, a forged identity. */
export function crewCheckModifier(crew: Companion[], skill: string, consume: boolean): number {
    let mod = 0;
    if (crew.some(c => c.turned && c.status === 'free')) mod -= TRAITOR_PENALTY;
    if (skill === 'infiltration') {
        const forger = crew.find(c => c.threadId === 'identity' && !c.identityUsed && c.status === 'free');
        if (forger) {
            mod += IDENTITY_BONUS;
            if (consume) forger.identityUsed = true;
        }
    }
    return mod;
}

/** The crew as the leader may see it: never who has turned. */
export function crewForLeader(crew: Companion[]): Companion[] {
    return crew.map(c => {
        const { turned, ...rest } = c;
        void turned;
        return rest;
    });
}
