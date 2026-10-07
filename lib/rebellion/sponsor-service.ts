/**
 * lib/rebellion/sponsor-service.ts
 * Rebel cells, phase 13b: who pays them, and what they do with it.
 *
 *   Sponsors  fund a cell in a rival's territory, arm it, route the money
 *             through a cutout, or second an agent to it. Every tick costs
 *             credits and builds evidence against them; enough evidence and
 *             the host finds out (Item 13, decision 3).
 *   Acts      a cell strikes on its own schedule, faster when funded and armed:
 *             heists (the sponsor takes a cut), sabotage, propaganda. Each act
 *             claims itself, reveals the cell to its host, and opens a case
 *             file whose real question is who stands behind it (decision 4).
 *   Prisoners a crackdown that finds a cell takes members, who say what they
 *             know: the sponsor's name, unless a cutout stood between them
 *             (decision 6).
 *
 * The truth of who pays whom lives in each sponsor's own shard. The host's
 * file holds it hidden, like every other file on the case board.
 */

import type { GameWorldState } from '../game-world-state';
import type { CaseClue, CovertCase } from '../espionage/espionage-types';
import {
    HOMEGROWN, sponsorshipCostPerTick,
    type CellActKind, type CellSponsorship, type RebelCell,
} from './rebellion-types';
import { crackdown, ensureRebellion, revealCell, type CrackdownResult } from './cell-service';
import { exposureStep } from '../piracy/sponsorship-service';
import { EXPOSURE_THRESHOLDS } from '../piracy/piracy-types';
import {
    ensureCases, motiveFor, suspectsFor, MAX_AI_OPEN_CASES, MAX_PLAYER_OPEN_CASES,
} from '../espionage/case-board';
import { empiresOfSpecies, isGrievance, relationPhrase, speciesLabel, speciesOf, withArticle, type ClueTag } from '../espionage/dossier';
import { deployAgent, recallAgent } from '../espionage/agent-service';
import { shiftRivalry } from '../diplomacy/offer-service';
import { fireNotification } from '../time/notification-hooks';
import { labelFor } from '../time/notification-names';
import { getGovernor, replaceGovernor } from '../government/governor-service';
import * as chronicle from '../narrative/chronicle';

// ─── Tuning (per strategic tick) ─────────────────────────────────────────────

/** Strength a sponsor's money and weapons add each tick. */
export const FUNDED_GROWTH = 0.6;
export const ARMED_GROWTH = 0.4;
export const SECONDED_GROWTH = 0.5;
/** Evidence against a sponsor (0–1) per tick, and per act of the cell they pay. */
export const EVIDENCE_PER_TICK = 0.008;
export const EVIDENCE_PER_TICK_ARMED = 0.012;
export const EVIDENCE_PER_ACT = 0.05;
/** Acts. A cell must be at least this strong to strike. */
export const ACT_MIN_STRENGTH = 15;
export const ACT_BASE_CHANCE = 0.01;
export const ACT_STRENGTH_CHANCE = 0.04;
export const ACT_FUNDED_CHANCE = 0.06;
export const ACT_ARMED_CHANCE = 0.04;
/** Share of a heist that goes to the cell's sponsors. */
export const SPONSOR_CUT = 0.4;

const NON_PLAYABLE = new Set(['faction-pirates', 'faction-neutral']);
function isPlayerRun(world: GameWorldState, factionId: string): boolean {
    if (NON_PLAYABLE.has(factionId)) return false;
    const claimed = (world as any).claimedFactionIds;
    return !Array.isArray(claimed) || claimed.includes(factionId);
}
function opaque(prefix: string, now: number, rand: () => number = Math.random): string {
    return `${prefix}-${now}-${Math.floor(rand() * 1e9).toString(36)}`;
}
function planetOf(world: GameWorldState, id: string): any {
    return world.construction?.planets?.get?.(id);
}
function credits(world: GameWorldState, id: string): number {
    return Number((world.economy?.factions?.get?.(id) as any)?.reserves?.CREDITS ?? 0);
}
function addCredits(world: GameWorldState, id: string, delta: number): void {
    const reserves: any = (world.economy?.factions?.get?.(id) as any)?.reserves;
    if (reserves) reserves.CREDITS = Math.max(0, Number(reserves.CREDITS ?? 0) + delta);
}

export function ensureSponsorships(world: GameWorldState): Map<string, CellSponsorship> {
    const rebellion: any = ensureRebellion(world);
    if (!(rebellion.sponsorships instanceof Map)) rebellion.sponsorships = new Map();
    return rebellion.sponsorships;
}

export function activeSponsorshipsOf(world: GameWorldState, cellId: string): CellSponsorship[] {
    return [...ensureSponsorships(world).values()].filter(s => s.cellId === cellId && !s.endedAtSeconds);
}

// Seeing cells abroad lives in ./visibility (browser-safe; the persistence layer uses it).
export { canSeeCell, foreignCellsFor, SEE_CELLS_MIN_INFILTRATION } from './visibility';
import { canSeeCell, SEE_CELLS_MIN_INFILTRATION } from './visibility';

// ─── Sponsoring ──────────────────────────────────────────────────────────────

export type SponsorResult = { ok: true; message: string; sponsorship?: CellSponsorship } | { ok: false; message: string };

export function sponsorCell(
    world: GameWorldState,
    sponsorId: string,
    cellId: string,
    opts: { armed?: boolean; cutout?: boolean; agentId?: string | null } = {}
): SponsorResult {
    const cell = ensureRebellion(world).cells.get(cellId);
    if (!cell || cell.status !== 'active') return { ok: false, message: 'That cell is gone.' };
    if (cell.hostFactionId === sponsorId) return { ok: false, message: 'You cannot sponsor rebels against yourself.' };
    if (!canSeeCell(world, sponsorId, cell)) return { ok: false, message: 'Our service cannot reach that cell.' };
    if (activeSponsorshipsOf(world, cellId).some(s => s.sponsorFactionId === sponsorId)) return { ok: false, message: 'We already pay that cell.' };
    const armed = !!opts.armed;
    const cutout = !!opts.cutout;
    const first = sponsorshipCostPerTick(armed, cutout);
    if (credits(world, sponsorId) < first) return { ok: false, message: `Sponsoring them costs ${first} credits a cycle.` };

    let secondedAgentId: string | null = null;
    if (opts.agentId) {
        const agent = world.espionage.agents.get(opts.agentId);
        if (!agent || agent.ownerFactionId !== sponsorId) return { ok: false, message: 'That agent does not answer to you.' };
        const deployed = deployAgent(agent, cell.systemId, world);
        if (!deployed.ok) return { ok: false, message: deployed.message };
        secondedAgentId = agent.id;
    }

    const now = world.nowSeconds;
    const sponsorship: CellSponsorship = {
        id: opaque(`csp-${sponsorId}`, now),
        organizationId: cell.id,
        cellId: cell.id,
        sponsorFactionId: sponsorId,
        targetFactionId: cell.hostFactionId,
        intensity: armed ? 'economicDisruption' : 'harassment',
        fundingPerHour: sponsorshipCostPerTick(armed, cutout) / 6,
        supplies: armed ? { ammo: 1 } : {},
        covert: true,
        startedAtSeconds: now,
        evidence: 0,
        attributionState: 'invisible',
        armed,
        cutout,
        secondedAgentId,
        creditsPaid: 0,
        cutReceived: 0,
        endedAtSeconds: null,
        endReason: null,
    };
    ensureSponsorships(world).set(sponsorship.id, sponsorship);
    return {
        ok: true, sponsorship,
        message: `We are paying ${cell.name}${armed ? ', and arming them' : ''}${cutout ? ', through a cutout' : ''}.`,
    };
}

export function endSponsorship(world: GameWorldState, s: CellSponsorship, reason: 'cut' | 'lapsed' | 'cell_ended'): void {
    if (s.endedAtSeconds) return;
    s.endedAtSeconds = world.nowSeconds;
    s.endReason = reason;
    if (s.secondedAgentId) {
        const agent = world.espionage.agents.get(s.secondedAgentId);
        if (agent && agent.status === 'deployed') recallAgent(agent, world);
    }
}

export function cutSponsorship(world: GameWorldState, sponsorId: string, sponsorshipId: string): SponsorResult {
    const s = ensureSponsorships(world).get(sponsorshipId);
    if (!s || s.sponsorFactionId !== sponsorId) return { ok: false, message: 'No such arrangement.' };
    if (s.endedAtSeconds) return { ok: false, message: 'That arrangement is already over.' };
    endSponsorship(world, s, 'cut');
    return { ok: true, message: 'The money stops. What they already know about us does not.' };
}

// ─── The tick: money, evidence, exposure ─────────────────────────────────────

/** One strategic tick of every sponsorship: pay, strengthen, leave traces. */
export function tickSponsorships(world: GameWorldState): void {
    const cells = ensureRebellion(world).cells;
    const now = world.nowSeconds;
    for (const s of ensureSponsorships(world).values()) {
        if (s.endedAtSeconds) continue;
        const cell = cells.get(s.cellId);
        if (!cell || cell.status !== 'active') { endSponsorship(world, s, 'cell_ended'); continue; }
        const cost = sponsorshipCostPerTick(s.armed, s.cutout);
        if (credits(world, s.sponsorFactionId) < cost) {
            endSponsorship(world, s, 'lapsed');
            if (isPlayerRun(world, s.sponsorFactionId)) {
                fireNotification({
                    id: `csp-lapsed-${s.id}`, factionId: s.sponsorFactionId, category: 'espionage', priority: 'normal',
                    title: 'SPONSORSHIP LAPSED', body: `We could not pay ${cell.name}, and the arrangement is over.`,
                    createdAt: new Date(now * 1000).toISOString(), read: false, linkToTab: 'intelligence',
                });
            }
            continue;
        }
        addCredits(world, s.sponsorFactionId, -cost);
        s.creditsPaid += cost;
        cell.treasury = (cell.treasury ?? 0) + cost * 0.5;
        cell.strength = Math.min(100, cell.strength + FUNDED_GROWTH + (s.armed ? ARMED_GROWTH : 0) + (s.secondedAgentId ? SECONDED_GROWTH : 0));
        addEvidence(world, s, (s.armed ? EVIDENCE_PER_TICK_ARMED : EVIDENCE_PER_TICK) * (s.cutout ? 0.5 : 1));
    }
}

/** Evidence builds; the first time it crosses the exposed rung, the host finds out. */
export function addEvidence(world: GameWorldState, s: CellSponsorship, amount: number): void {
    s.evidence = Math.min(1, s.evidence + amount);
    const step = exposureStep(s.evidence);
    s.attributionState = step === 'exposed' ? 'exposed' : step === 'invisible' ? 'invisible' : 'suspected';
    if (s.evidence < EXPOSURE_THRESHOLDS.exposed || s.exposedAtSeconds) return;

    const now = world.nowSeconds;
    s.exposedAtSeconds = now;
    const cell = ensureRebellion(world).cells.get(s.cellId);
    const host = s.targetFactionId ?? cell?.hostFactionId ?? '';
    const cellName = cell?.name ?? 'a rebel cell';
    try { shiftRivalry(world, host, s.sponsorFactionId, 10, 'interference_exposed', `funding ${cellName}`); } catch { /* minimal worlds */ }

    // Every open file the host has on this cell learns it.
    for (const kase of ensureCases(world).values()) {
        if (kase.cellId !== s.cellId || kase.status !== 'open') continue;
        (kase.pendingClues ??= []).unshift(clue('own_intel', 'testimony',
            `Documents seized this cycle prove ${labelFor(s.sponsorFactionId)} has been funding ${cellName}.`,
            [s.sponsorFactionId], { [s.sponsorFactionId]: 1 }, now));
        kase.nextClueAt = Math.min(kase.nextClueAt, now);
    }
    const createdAt = new Date(now * 1000).toISOString();
    if (isPlayerRun(world, host)) {
        fireNotification({
            id: `csp-exposed-host-${s.id}`, factionId: host, category: 'espionage', priority: 'urgent',
            title: 'FOREIGN HAND EXPOSED', body: `${labelFor(s.sponsorFactionId)} has been funding ${cellName} on our soil. We have the papers.`,
            createdAt, read: false, linkToTab: 'intelligence',
        });
    }
    if (isPlayerRun(world, s.sponsorFactionId)) {
        fireNotification({
            id: `csp-exposed-sponsor-${s.id}`, factionId: s.sponsorFactionId, category: 'espionage', priority: 'urgent',
            title: 'OUR SPONSORSHIP IS EXPOSED', body: `${labelFor(host)} has proof we fund ${cellName}.`,
            createdAt, read: false, linkToTab: 'intelligence',
        });
    }
}

// ─── Acts ────────────────────────────────────────────────────────────────────

function clue(source: CaseClue['source'], tag: ClueTag, text: string, pointsAt: string[], weights: Record<string, number>, now: number): CaseClue {
    return { id: opaque('clue', now), source, tag, text, pointsAt, weights, arrivedAt: 0 };
}

const ACT_PHRASE: Record<CellActKind, string> = {
    heist: 'a heist',
    sabotage: 'a sabotage attack',
    propaganda: 'a propaganda campaign',
    prison_break: 'a prison break',
    assassination: 'the killing of the governor',
};

/** How loudly the press carries each act (chronicle bands: 15-39 local news, 40-69 real news). */
const ACT_IMPORTANCE: Record<CellActKind, number> = {
    propaganda: 18, heist: 32, sabotage: 36, prison_break: 50, assassination: 62,
};

const ACT_TITLE: Record<CellActKind, string> = {
    heist: 'HEIST', sabotage: 'SABOTAGE', propaganda: 'AGITATION', prison_break: 'PRISON BREAK', assassination: 'ASSASSINATION',
};

/** Chance per tick that a cell strikes. */
export function actChance(cell: RebelCell, sponsors: CellSponsorship[]): number {
    if (cell.status !== 'active' || cell.strength < ACT_MIN_STRENGTH) return 0;
    return ACT_BASE_CHANCE + (cell.strength / 100) * ACT_STRENGTH_CHANCE
        + (sponsors.length ? ACT_FUNDED_CHANCE : 0) + (sponsors.some(s => s.armed) ? ACT_ARMED_CHANCE : 0);
}

/** Every cell's turn to strike. Returns what happened, for logs and probes. */
export function tickCellActs(world: GameWorldState, rand: () => number = Math.random): { cell: RebelCell; act: CellActKind; caseId: string | null }[] {
    const out: { cell: RebelCell; act: CellActKind; caseId: string | null }[] = [];
    for (const cell of ensureRebellion(world).cells.values()) {
        const sponsors = activeSponsorshipsOf(world, cell.id);
        if (rand() >= actChance(cell, sponsors)) continue;
        const act = pickAct(world, cell, sponsors, rand);
        const kase = commitAct(world, cell, act, sponsors, rand);
        out.push({ cell, act, caseId: kase?.id ?? null });
    }
    return out;
}

/** Agents of this cell's sponsors that its host holds: what a prison break is for. */
export function sponsorPrisoners(world: GameWorldState, cell: RebelCell, sponsors: CellSponsorship[]): string[] {
    const payers = new Set(sponsors.map(s => s.sponsorFactionId));
    return [...world.espionage.agents.values()]
        .filter(a => a.status === 'captured' && a.capturedByFactionId === cell.hostFactionId && payers.has(a.ownerFactionId))
        .map(a => a.id);
}

/** Strength a cell needs to kill a governor, armed; and unarmed, out of its own fury. */
export const ASSASSINATION_MIN_STRENGTH = 40;
export const ASSASSINATION_UNARMED_STRENGTH = 70;

function canAssassinate(world: GameWorldState, cell: RebelCell, sponsors: CellSponsorship[]): boolean {
    if (!getGovernor(world, cell.planetId)) return false;
    const armed = sponsors.some(s => s.armed);
    return cell.strength >= (armed ? ASSASSINATION_MIN_STRENGTH : ASSASSINATION_UNARMED_STRENGTH);
}

function pickAct(world: GameWorldState, cell: RebelCell, sponsors: CellSponsorship[], rand: () => number): CellActKind {
    const weights: [CellActKind, number][] = [
        ['propaganda', 1],
        ['heist', sponsors.length ? 2 : 1],
        ['sabotage', sponsors.some(s => s.armed) ? 2 : 0.5],
        // A sponsor wants its people back; a cell breaks them out.
        ['prison_break', sponsorPrisoners(world, cell, sponsors).length ? 3 : 0],
        ['assassination', canAssassinate(world, cell, sponsors) ? (sponsors.some(s => s.armed) ? 1 : 0.5) : 0],
    ];
    const total = weights.reduce((n, [, w]) => n + w, 0);
    let r = rand() * total;
    for (const [kind, w] of weights) { if ((r -= w) < 0) return kind; }
    return 'propaganda';
}

/** Carry out one act: its effect, its traces, and the host's file on it. */
export function commitAct(world: GameWorldState, cell: RebelCell, act: CellActKind, sponsors: CellSponsorship[], rand: () => number = Math.random): CovertCase | null {
    const now = world.nowSeconds;
    const planet = planetOf(world, cell.planetId);
    const host = cell.hostFactionId;
    let effect = '';

    if (act === 'heist') {
        const take = Math.round(Math.min(credits(world, host) * 0.01, 1500 + cell.strength * 40));
        addCredits(world, host, -take);
        const cut = sponsors.length ? Math.round(take * SPONSOR_CUT) : 0;
        for (const s of sponsors) {
            const share = Math.round(cut / sponsors.length);
            addCredits(world, s.sponsorFactionId, share);
            s.cutReceived += share;
        }
        cell.treasury = (cell.treasury ?? 0) + take - cut;
        effect = `${take} credits gone from the treasury`;
    } else if (act === 'sabotage') {
        if (planet) {
            planet.stability = Math.max(0, Number(planet.stability ?? 50) - 8);
            planet.unrest = Math.min(100, Number(planet.unrest ?? 0) + 3);
        }
        effect = 'works wrecked and the world shaken';
    } else if (act === 'prison_break') {
        const freed = sponsorPrisoners(world, cell, sponsors);
        const intel = world.espionage.factionIntel.get(host);
        for (const id of freed) {
            const agent = world.espionage.agents.get(id);
            if (!agent) continue;
            agent.status = 'on_cooldown';
            agent.capturedByFactionId = null;
            agent.cooldownUntil = now + 2 * 86400;
            if (intel?.prisoners) intel.prisoners = intel.prisoners.filter(p => p.agentId !== id);
            if (isPlayerRun(world, agent.ownerFactionId)) {
                fireNotification({
                    id: `prison-break-${id}-${now}`, factionId: agent.ownerFactionId, category: 'espionage', priority: 'normal',
                    title: 'AGENT FREED', body: `${agent.codename} is out: ${cell.name} broke them out of a prison of ${labelFor(host)}.`,
                    createdAt: new Date(now * 1000).toISOString(), read: false, linkToTab: 'intelligence',
                });
            }
        }
        if (planet) planet.stability = Math.max(0, Number(planet.stability ?? 50) - 4);
        effect = freed.length ? `${freed.length} prisoner${freed.length === 1 ? '' : 's'} gone from the cells` : 'a prison stormed';
    } else if (act === 'assassination') {
        const governor = getGovernor(world, cell.planetId);
        if (governor) {
            governor.status = 'deceased';
            governor.assignmentId = undefined;
            governor.history.push({ timestamp: now, description: `Killed on ${planet?.name ?? cell.planetId} by ${cell.name}.` });
            replaceGovernor(world, cell.planetId);
        }
        if (planet) {
            planet.stability = Math.max(0, Number(planet.stability ?? 50) - 10);
            planet.unrest = Math.min(100, Number(planet.unrest ?? 0) + 5);
        }
        effect = governor ? `Governor ${governor.name} is dead` : 'the governor\'s residence attacked';
    } else {
        const blocs: any[] = (world as any).movement?.empirePostures?.get?.(host)?.blocs ?? [];
        const bloc = blocs.find(b => b.id === cell.causeBlocId);
        if (bloc) bloc.satisfaction = Math.max(0, Number(bloc.satisfaction ?? 50) - 4);
        if (planet) planet.unrest = Math.min(100, Number(planet.unrest ?? 0) + 2);
        effect = `${cell.cause} stirred up`;
    }

    // Acting costs the cell its cover: it claims the act, and the host now knows it exists.
    cell.actsCommitted = (cell.actsCommitted ?? 0) + 1;
    cell.lastActAtSeconds = now;
    cell.strength = Math.max(0, cell.strength - 2);
    cell.safeHouse.concealment = Math.max(0.2, cell.safeHouse.concealment - 0.15);
    revealCell(cell, host);
    for (const s of sponsors) addEvidence(world, s, EVIDENCE_PER_ACT * (s.cutout ? 0.5 : 1));

    if (isPlayerRun(world, host)) {
        fireNotification({
            id: `cell-act-${cell.id}-${now}`, factionId: host, category: 'espionage', priority: 'urgent',
            title: `REBEL ${ACT_TITLE[act]} ON ${String(planet?.name ?? 'A WORLD').toUpperCase()}`,
            body: `${cell.name}, for ${cell.cause}, has claimed ${ACT_PHRASE[act]}: ${effect}. A case file is open: who stands behind them?`,
            createdAt: new Date(now * 1000).toISOString(), read: false, linkToTab: 'intelligence',
        });
    }
    // The press has the claim; the payers stay off the record until exposed.
    chronicle.record(world, {
        type: 'rebel_act',
        actorIds: sponsors.map(s => s.sponsorFactionId),
        targetIds: [host],
        location: cell.systemId,
        attribution: sponsors.length ? 'invisible' : 'exposed',
        // Most acts are local news; a killing or a jailbreak makes the front page.
        importanceOverride: ACT_IMPORTANCE[act],
        coalesceKey: `rebel-${cell.id}`,
        facts: { cellName: cell.name, cause: cell.cause, act, actPhrase: ACT_PHRASE[act], planetName: String(planet?.name ?? 'a world'), effect },
    });
    return openCellCase(world, cell, act, sponsors, rand);
}

// ─── The host's file ─────────────────────────────────────────────────────────

/** The one a file treats as behind the act: the longest-standing sponsor, or nobody. */
function primarySponsor(sponsors: CellSponsorship[]): CellSponsorship | null {
    return [...sponsors].sort((a, b) => a.startedAtSeconds - b.startedAtSeconds)[0] ?? null;
}

export function openCellCase(world: GameWorldState, cell: RebelCell, act: CellActKind, sponsors: CellSponsorship[], rand: () => number = Math.random): CovertCase | null {
    const host = cell.hostFactionId;
    const cases = ensureCases(world);
    const open = [...cases.values()].filter(c => c.ownerFactionId === host && c.status === 'open').sort((a, b) => a.openedAt - b.openedAt);
    if (!isPlayerRun(world, host) && open.length >= MAX_AI_OPEN_CASES) return null;
    if (isPlayerRun(world, host) && open.length >= MAX_PLAYER_OPEN_CASES) {
        const shelf = open[0];
        shelf.status = 'cold'; shelf.closedAt = world.nowSeconds; shelf.lead = null;
    }

    const now = world.nowSeconds;
    const planet = planetOf(world, cell.planetId);
    const where = planet?.name ?? 'one of our worlds';
    const lead = primarySponsor(sponsors);
    const actor = lead?.sponsorFactionId ?? HOMEGROWN;
    const suspects = [...new Set([HOMEGROWN, ...suspectsFor(world, host, actor)])];
    const kindPhrase = ACT_PHRASE[act];

    const kase: CovertCase = {
        id: opaque(`case-${host}`, now, rand),
        ownerFactionId: host,
        title: `${cell.name.charAt(0).toUpperCase()}${cell.name.slice(1)}: ${kindPhrase.replace(/^an? /, '')} at ${where}`,
        summary: `${cell.name.charAt(0).toUpperCase()}${cell.name.slice(1)}, a cell speaking for ${cell.cause}, has claimed ${kindPhrase} at ${where}. The question is whether anyone stands behind them.`,
        systemId: cell.systemId,
        kindPhrase,
        openedAt: now,
        suspectIds: suspects,
        clues: [],
        status: 'open',
        accusedFactionId: null,
        verdict: null,
        closedAt: null,
        nextClueAt: now,
        lead: null,
        leadsRun: 0,
        linkedNote: (cell.actsCommitted ?? 0) > 1 ? `${cell.name} has struck ${cell.actsCommitted} times.` : null,
        theoryMotive: null,
        motiveVerdict: null,
        cellId: cell.id,
        sponsorshipId: lead?.id ?? null,
        operationId: undefined,
        actorFactionId: actor,
        falseFlagFactionId: null,
        trueMotive: lead ? motiveFor(world, lead.sponsorFactionId, host) : 'cause',
        definitionId: null,
        operativeSpecies: lead?.secondedAgentId ? (world.espionage.agents.get(lead.secondedAgentId)?.species ?? null) : null,
        pendingClues: buildCellClues(world, cell, sponsors, suspects, now),
        interrogatedAgentIds: [],
    };
    cases.set(kase.id, kase);
    // The claim is public the moment it is made.
    const first = kase.pendingClues!.shift();
    if (first) { first.arrivedAt = now; kase.clues.push(first); }
    kase.nextClueAt = now + 6 * 3600;
    return kase;
}

/** Findings on a cell's act, worked out at the moment it struck. */
export function buildCellClues(world: GameWorldState, cell: RebelCell, sponsors: CellSponsorship[], suspects: string[], now: number): CaseClue[] {
    const host = cell.hostFactionId;
    const out: CaseClue[] = [];
    const factions = world.economy?.factions;
    const lead = primarySponsor(sponsors);
    const actor = lead?.sponsorFactionId ?? HOMEGROWN;

    // The claim: always first, always public.
    out.push(clue('press', 'testimony', `${cell.name.charAt(0).toUpperCase()}${cell.name.slice(1)} has claimed it, in the name of ${cell.cause}.`, [], {}, now));

    // Means: money a cell like this cannot raise alone, or means that look local.
    if (sponsors.length) {
        out.push(clue('method', 'means', `${cell.name.charAt(0).toUpperCase()}${cell.name.slice(1)} had more money than a cell like it can raise on its own.`, [], {}, now));
    } else {
        out.push(clue('method', 'means', `${cell.name.charAt(0).toUpperCase()}${cell.name.slice(1)}'s means look local: scraped together, stolen, borrowed.`, [HOMEGROWN], { [HOMEGROWN]: 0.5 }, now));
    }

    // Weapons: whose make, unless a cutout washed the marks off.
    const armer = sponsors.find(s => s.armed);
    if (armer) {
        if (armer.cutout) {
            out.push(clue('sensors', 'means', 'Their weapons came through a cutout and carry no maker\'s marks.', [], {}, now));
        } else {
            const species = speciesOf(factions?.get?.(armer.sponsorFactionId) as any);
            const kin = species ? empiresOfSpecies((factions?.entries?.() ?? []) as any, species).filter(id => suspects.includes(id)) : [];
            out.push(clue('sensors', 'means', `Their weapons are ${speciesLabel(species)}-made.`, kin,
                Object.fromEntries(kin.map(id => [id, id === actor ? 0.6 : 0])), now));
        }
    }

    // A seconded agent's face.
    const seconded = sponsors.find(s => s.secondedAgentId);
    const agent = seconded?.secondedAgentId ? world.espionage.agents.get(seconded.secondedAgentId) : undefined;
    if (agent) {
        const species = agent.species ?? speciesOf(factions?.get?.(agent.ownerFactionId) as any);
        const kin = species ? empiresOfSpecies((factions?.entries?.() ?? []) as any, species).filter(id => suspects.includes(id)) : [];
        out.push(clue('sensors', 'opportunity', `${withArticle(speciesLabel(species)).replace(/^./, c => c.toUpperCase())} was seen with them, giving orders.`, kin,
            Object.fromEntries(kin.map(id => [id, id === actor ? 0.4 : 0])), now));
    }

    // Motive: who has a grudge against us that a cell would serve.
    const grudges = suspects.filter(id => id !== HOMEGROWN).map(id => {
        const r: any = world.rivalries?.get?.(`rivalry-${host}-${id}`) ?? world.rivalries?.get?.(`rivalry-${id}-${host}`);
        const last = (Array.isArray(r?.recentEvents) ? r.recentEvents : []).filter(isGrievance).sort((a: any, b: any) => b.atSeconds - a.atSeconds)[0];
        return { id, score: r?.rivalryScore ?? 0, last };
    }).filter(g => g.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
    if (grudges.length) {
        const ids = grudges.map(g => g.id);
        out.push(clue('motive', 'motive', `Who would want ${cell.cause} armed against us? ${grudges.map(g => g.last
            ? `${labelFor(g.id)} (${relationPhrase(g.last.kind)} between us)` : labelFor(g.id)).join('; ')}.`,
        ids, Object.fromEntries(ids.map(id => [id, id === actor ? 0.2 : 0])), now));
    }

    // Our sources inside the sponsor know where the money goes.
    if (lead) {
        const ours = world.espionage.factionIntel.get(host)?.infiltrationLevels?.[lead.sponsorFactionId] ?? 0;
        if (ours >= SEE_CELLS_MIN_INFILTRATION) {
            out.push(clue('own_intel', 'testimony', `Our sources inside ${labelFor(lead.sponsorFactionId)} know of money going to ${cell.name}.`,
                [lead.sponsorFactionId], { [lead.sponsorFactionId]: 0.8 }, now));
        }
    }
    return out;
}

// ─── Crackdowns take prisoners ───────────────────────────────────────────────

/**
 * What a captured member of a cell says. They know their own cell and where
 * its money came from, and nothing more: a cutout means they never knew.
 */
export function memberTestimony(world: GameWorldState, cell: RebelCell, now: number): CaseClue {
    const sponsors = activeSponsorshipsOf(world, cell.id);
    const lead = primarySponsor(sponsors);
    if (!lead) {
        return clue('interrogation', 'testimony', `A member of ${cell.name}, taken in the crackdown, says nobody paid them: they did it for ${cell.cause}.`,
            [HOMEGROWN], { [HOMEGROWN]: 1 }, now);
    }
    if (lead.cutout) {
        return clue('interrogation', 'testimony', `A member of ${cell.name}, taken in the crackdown, says the money came from a go-between they met twice and could never name.`,
            [], {}, now);
    }
    return clue('interrogation', 'testimony', `A member of ${cell.name}, taken in the crackdown, says the money came from ${labelFor(lead.sponsorFactionId)}.`,
        [lead.sponsorFactionId], { [lead.sponsorFactionId]: 1 }, now);
}

/**
 * A crackdown, and the members it takes from every cell it found: their
 * testimony goes to the front of each open file on that cell.
 */
export function crackdownWithPrisoners(world: GameWorldState, factionId: string, planetId: string, rand: () => number = Math.random): CrackdownResult {
    const res = crackdown(world, factionId, planetId, rand);
    if (!res.ok) return res;
    const now = world.nowSeconds;
    for (const cell of ensureRebellion(world).cells.values()) {
        if (cell.planetId !== planetId || !cell.safeHouse.knownToFactionIds.includes(factionId)) continue;
        // Found this time, or already known and hit: either way, members were taken.
        for (const kase of ensureCases(world).values()) {
            if (kase.cellId !== cell.id || kase.status !== 'open') continue;
            (kase.pendingClues ??= []).unshift(memberTestimony(world, cell, now));
            kase.nextClueAt = Math.min(kase.nextClueAt, now);
        }
    }
    return res;
}
