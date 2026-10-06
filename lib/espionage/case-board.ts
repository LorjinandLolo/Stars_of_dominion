/**
 * lib/espionage/case-board.ts
 * The case board, worker side (spec item 12a; design decisions in
 * docs/casual-play-build-spec.md, Item 12).
 *
 * When a covert operation hits an empire and its service did not catch the
 * sponsor outright, a case opens for the victim. The case shows the effect —
 * what, where, when — and every empire that could have done it. Clues arrive
 * over time, faster with more counter-intelligence. The player reads them,
 * names a culprit, and lives with being right or wrong.
 *
 * The truth of each case (the real sponsor, the operation, clues still to
 * come, how much each clue really points at whom) is stored on the case and
 * stripped on the wire. A clue's text is what the player gets; its hidden
 * weights are what AI accusations (12c) will read.
 *
 * This module also owns the two rules that make a wrong answer possible:
 *   - chooseSuspect: a suspected operation can be pinned on the wrong empire
 *     (and a false flag aims that suspicion on purpose);
 *   - captured agents (taken by Counter-Intel Sweeps) can be questioned, and
 *     a Double Agent lies.
 */

import type { GameWorldState } from '../game-world-state';
import type { CaseClue, CovertCase, EspionageOperation } from './espionage-types';
import type { SpyAgent } from './agent-types';
import { OPERATION_CATALOG_BY_ID, type OperationCategory } from './operation-catalog';
import { MIN_STAGE_FOR_CATEGORY, stageInfo } from './network-stages';
import { getOrCreateFactionIntel, updateInfiltration } from './faction-intel';
import { techIdsHaveFlag } from '../tech/flags';
import { fireNotification } from '../time/notification-hooks';
import { labelFor } from '../time/notification-names';
import * as chronicle from '../narrative/chronicle';
import { shiftRivalry } from '../diplomacy/offer-service';
import { openDebate } from '../politics/debate-service';
import { grantPoliticalCapital } from '../government/government-service';
import { ReputationService } from '../reputation/reputation-service';

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** Sim seconds between clues at zero counter-intelligence (48 real minutes). */
export const CLUE_INTERVAL_SECONDS = 12 * 3600;
/** A case nobody acts on goes cold after this long (two real days). */
export const CASE_COLD_AFTER_SECONDS = 30 * 24 * 3600;
/** Closed cases are dropped this long after closing. */
export const CASE_PRUNE_AFTER_SECONDS = 30 * 24 * 3600;
/** Chance a suspicion lands on the real sponsor, absent a false flag. */
export const SUSPECT_ACCURACY = 0.65;
/** Chance a false flag gets the suspicion it was dressed for. */
export const FALSE_FLAG_TAKE = 0.8;
/** Chance a sweep takes each agent of a network it breaks up (scaled by outcome). */
export const SWEEP_CAPTURE_CHANCE = 0.5;
/** Rewards and costs of an accusation. */
export const CORRECT_ACCUSATION_INTEL = 40;
export const CORRECT_ACCUSATION_CAPITAL = 5;
export const EXPOSED_RIVALRY_JUMP = 10;
export const FALSE_ACCUSATION_RIVALRY_JUMP = 8;
export const FALSE_ACCUSATION_ACTOR_INFILTRATION = 10;

const NON_PLAYABLE = new Set(['faction-pirates', 'faction-neutral']);

function isPlayerRun(world: GameWorldState, factionId: string): boolean {
    if (NON_PLAYABLE.has(factionId)) return false;
    const claimed = (world as any).claimedFactionIds;
    return !Array.isArray(claimed) || claimed.includes(factionId);
}

export function ensureCases(world: GameWorldState): Map<string, CovertCase> {
    const esp: any = world.espionage;
    if (!(esp.cases instanceof Map)) esp.cases = new Map();
    return esp.cases;
}

function systemName(world: GameWorldState, systemId: string): string {
    return (world.movement?.systems?.get?.(systemId) as any)?.name ?? 'an unnamed system';
}

function opaqueId(prefix: string, now: number): string {
    return `${prefix}-${now}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function rivalryScore(world: GameWorldState, a: string, b: string): number {
    return (world.rivalries?.get?.(`rivalry-${a}-${b}`) ?? world.rivalries?.get?.(`rivalry-${b}-${a}`))?.rivalryScore ?? 0;
}

/** Every empire that could have done it: everyone but the victim and the stateless. */
export function suspectsFor(world: GameWorldState, victimId: string, actorId: string): string[] {
    const out = new Set<string>();
    for (const id of world.economy?.factions?.keys?.() ?? []) {
        if (id === victimId || NON_PLAYABLE.has(id)) continue;
        out.add(id);
    }
    out.add(actorId);
    return [...out].sort();
}

// ─── Who gets blamed ─────────────────────────────────────────────────────────

/**
 * Who a victim's service suspects for an operation it half-caught. Usually the
 * sponsor; sometimes the empire with the best motive instead; and when the
 * operation was a false flag, most likely the empire it was dressed up as.
 * `rand` is injectable for tests.
 */
export function chooseSuspect(op: EspionageOperation, world: GameWorldState, rand: () => number = Math.random): string {
    if (op.falseFlagFactionId && op.falseFlagFactionId !== op.targetFactionId && rand() < FALSE_FLAG_TAKE) {
        return op.falseFlagFactionId;
    }
    if (rand() < SUSPECT_ACCURACY) return op.actorFactionId;
    const innocents = suspectsFor(world, op.targetFactionId, op.actorFactionId).filter(id => id !== op.actorFactionId);
    if (innocents.length === 0) return op.actorFactionId;
    // Blame flows toward whoever the victim already hates most.
    innocents.sort((a, b) => rivalryScore(world, op.targetFactionId, b) - rivalryScore(world, op.targetFactionId, a));
    return innocents[0];
}

// ─── Clues ───────────────────────────────────────────────────────────────────

function clue(source: CaseClue['source'], text: string, pointsAt: string[], weights: Record<string, number>, now: number): CaseClue {
    return { id: opaqueId('clue', now), source, text, pointsAt, weights, arrivedAt: 0 };
}

/**
 * The clues a case will release, worked out at the moment it opens (the
 * sensor log and the rivalries of that moment). Order is release order.
 */
export function buildClues(op: EspionageOperation, world: GameWorldState, suspects: string[], suspectedId: string | null): CaseClue[] {
    const now = world.nowSeconds;
    const victim = op.targetFactionId;
    const actor = op.actorFactionId;
    const where = systemName(world, op.targetRegionId);
    const def = op.definitionId ? OPERATION_CATALOG_BY_ID.get(op.definitionId) : undefined;
    const flag = op.falseFlagFactionId && op.falseFlagFactionId !== victim ? op.falseFlagFactionId : null;
    const out: CaseClue[] = [];
    const w = (id: string, genuine: number) => ({ [id]: id === actor ? genuine : 0 });

    // Press: whoever the attribution formula fingered, right or wrong.
    if (suspectedId) {
        out.push(clue('press', `Our own press is already naming ${labelFor(suspectedId)}.`, [suspectedId], w(suspectedId, 0.5), now));
    }

    // Planted evidence. A false flag leaves the look of someone else behind.
    if (flag) {
        out.push(clue('sensors', `A transponder code recovered near ${where} belongs to ${labelFor(flag)}.`, [flag], { [flag]: 0 }, now));
        out.push(clue('own_intel', `A walk-in source swears ${labelFor(flag)} ran it.`, [flag], { [flag]: 0 }, now));
    }

    // Method: what it took, and who could field that. Always true of the sponsor.
    if (def) {
        const stage = stageInfo(MIN_STAGE_FOR_CATEGORY[def.category as OperationCategory]);
        if (stage.minInfiltration > 0 || def.category === 'economic') {
            const holders = suspects.filter(id => {
                if (id === actor) return true; // they had it when they launched
                const level = world.espionage.factionIntel.get(id)?.infiltrationLevels?.[victim] ?? 0;
                if (level < stage.minInfiltration) return false;
                if (def.category === 'economic') {
                    return techIdsHaveFlag(world.tech?.get?.(id)?.unlockedTechIds ?? [], 'ENABLE_SHADOW_ECONOMY');
                }
                return true;
            });
            const needs = [
                stage.minInfiltration > 0 ? `a ${stage.label} network inside our empire` : null,
                def.category === 'economic' ? 'Black Market tradecraft' : null,
            ].filter(Boolean).join(' and ');
            const weights: Record<string, number> = {};
            for (const id of holders) weights[id] = id === actor ? 1 / holders.length + 0.3 : 0;
            out.push(clue('method',
                `This took ${needs}. ${holders.length === 1 ? 'Only one service could field that' : `${holders.length} services could field that`}: ${holders.map(labelFor).join(', ')}.`,
                holders, weights, now));
        }
    }

    // Money trail: somebody paid for this. Always true of the sponsor; usually
    // true of half the galaxy, which is what makes it only a start.
    if (def && def.creditsCost > 0) {
        const floor = def.creditsCost * 5;
        const payers = suspects.filter(id => id === actor
            || Number((world.economy?.factions?.get?.(id) as any)?.reserves?.CREDITS ?? 0) >= floor);
        if (payers.length > 0 && payers.length < suspects.length) {
            const weights: Record<string, number> = {};
            for (const id of payers) weights[id] = id === actor ? 0.1 : 0;
            out.push(clue('method', `It cost someone around § ${def.creditsCost}. Services with that to spare: ${payers.map(labelFor).join(', ')}.`, payers, weights, now));
        }
    }

    // Sensors: whose ships were in the system when it happened.
    const present = new Set<string>();
    for (const fleet of (world.movement?.fleets?.values?.() ?? []) as Iterable<any>) {
        if (fleet.currentSystemId === op.targetRegionId && fleet.factionId !== victim && suspects.includes(fleet.factionId)) {
            present.add(fleet.factionId);
        }
    }
    if (present.size > 0) {
        const ids = [...present].sort();
        const weights: Record<string, number> = {};
        for (const id of ids) weights[id] = id === actor ? 0.3 : 0;
        out.push(clue('sensors', `Our pickets logged ships of ${ids.map(labelFor).join(', ')} at ${where} around the time.`, ids, weights, now));
    }

    // Motive: who has the most reason to want us hurt.
    const byGrudge = suspects
        .map(id => ({ id, score: rivalryScore(world, victim, id) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
    if (byGrudge.length > 0) {
        const ids = byGrudge.map(x => x.id);
        const weights: Record<string, number> = {};
        for (const id of ids) weights[id] = id === actor ? 0.2 : 0;
        out.push(clue('motive', `${ids.map(labelFor).join(' and ')} ${ids.length > 1 ? 'have' : 'has'} the most reason to want us hurt.`, ids, weights, now));
    }

    // Neighbours: who holds systems closest to where it happened. True as
    // geography; as evidence it is only as good as the idea that spies work
    // close to home, which they need not.
    const here: any = world.movement?.systems?.get?.(op.targetRegionId);
    if (here && typeof here.q === 'number') {
        const hexDist = (s: any) => (Math.abs(s.q - here.q) + Math.abs(s.r - here.r) + Math.abs((s.q + s.r) - (here.q + here.r))) / 2;
        const nearest = new Map<string, number>();
        const consider = (owner: string | undefined, s: any) => {
            if (!owner || owner === victim || !suspects.includes(owner) || !s || typeof s.q !== 'number') return;
            const d = hexDist(s);
            if (d < (nearest.get(owner) ?? Infinity)) nearest.set(owner, d);
        };
        // System owner is derived by the worker each tick; planets are the
        // authority (and the only owner a fresh world has).
        for (const s of (world.movement.systems.values() as Iterable<any>)) consider(s.ownerFactionId, s);
        for (const p of (world.construction?.planets?.values?.() ?? []) as Iterable<any>) {
            consider(p.ownerId, world.movement.systems.get(p.systemId));
        }
        const ids = [...nearest.entries()].sort((a, b) => a[1] - b[1]).slice(0, 2).map(([id]) => id);
        if (ids.length > 0) {
            const weights: Record<string, number> = {};
            for (const id of ids) weights[id] = id === actor ? 0.1 : 0;
            out.push(clue('motive', `${ids.map(labelFor).join(' and ')} ${ids.length > 1 ? 'hold' : 'holds'} the nearest systems to ${where}.`, ids, weights, now));
        }
    }

    // Our own sources abroad: inside the sponsor they heard something; inside
    // an innocent they heard nothing, which is worth knowing too.
    const ours = world.espionage.factionIntel.get(victim)?.infiltrationLevels ?? {};
    const embedded = stageInfo('embedded_network').minInfiltration;
    if ((ours[actor] ?? 0) >= embedded) {
        out.push(clue('own_intel', `Our sources inside ${labelFor(actor)} heard talk of an operation against us.`, [actor], { [actor]: 0.8 }, now));
    } else {
        const watched = suspects.find(id => id !== actor && (ours[id] ?? 0) >= embedded);
        if (watched) {
            out.push(clue('own_intel', `Our sources inside ${labelFor(watched)} heard nothing about it.`, [watched], { [watched]: -0.5 }, now));
        }
    }
    return out;
}

/**
 * What a captured agent says about a case. Honest agents tell the truth as
 * they know it: their service did it, or it did not. A Double Agent lies.
 */
export function interrogationClue(agent: SpyAgent, kase: CovertCase, world: GameWorldState, rand: () => number = Math.random): CaseClue {
    const now = world.nowSeconds;
    const owner = agent.ownerFactionId;
    const actor = kase.actorFactionId ?? '';
    const lies = agent.traitIds.includes('double_agent');
    const didIt = owner === actor;
    const others = kase.suspectIds.filter(id => id !== owner);
    const scapegoat = others.length ? others[Math.floor(rand() * others.length)] : owner;

    if (didIt !== lies) {
        // Says their own service did it (true unless lying).
        const blamed = owner;
        return clue('interrogation', `${agent.codename}, taken in a sweep, says ${labelFor(owner)} ran the ${kase.kindPhrase.replace(/^an? /, '')}.`,
            [blamed], { [blamed]: didIt ? 1 : 0 }, now);
    }
    if (lies && didIt) {
        return clue('interrogation', `${agent.codename}, taken in a sweep, blames ${labelFor(scapegoat)}.`, [scapegoat], { [scapegoat]: 0 }, now);
    }
    return clue('interrogation', `${agent.codename}, taken in a sweep, swears ${labelFor(owner)} had nothing to do with it.`,
        [owner], { [owner]: -0.6 }, now);
}

// ─── Opening and ticking ─────────────────────────────────────────────────────

function clueInterval(world: GameWorldState, factionId: string): number {
    const ci = world.espionage.factionIntel.get(factionId)?.counterIntelStrength ?? 0;
    return CLUE_INTERVAL_SECONDS / (1 + Math.max(0, ci) / 50);
}

/**
 * Open a case for the victim of a resolved operation, when there is something
 * to investigate: the sponsor was not caught outright, and either it worked or
 * it was noticed. Only player-run victims get cases for now (AI cases: 12c).
 */
export function maybeOpenCase(
    op: EspionageOperation,
    world: GameWorldState,
    detail: { name: string; kindPhrase: string },
    suspectedId: string | null
): CovertCase | null {
    const victim = op.targetFactionId;
    if (!victim || victim === op.actorFactionId) return null;
    if (op.attributionState === 'exposed') return null;          // caught red-handed: no mystery
    if (op.attributionState === 'invisible' && !op.succeeded) return null; // nothing to see
    if (!isPlayerRun(world, victim)) return null;

    const now = world.nowSeconds;
    const where = systemName(world, op.targetRegionId);
    const suspects = suspectsFor(world, victim, op.actorFactionId);
    const pending = buildClues(op, world, suspects, suspectedId);
    const interval = clueInterval(world, victim);

    const kase: CovertCase = {
        id: opaqueId(`case-${victim}`, now),
        ownerFactionId: victim,
        title: `${detail.kindPhrase.charAt(0).toUpperCase()}${detail.kindPhrase.slice(1)} at ${where}`,
        summary: op.succeeded
            ? `${detail.kindPhrase.charAt(0).toUpperCase()}${detail.kindPhrase.slice(1)} hit us at ${where}. It did its damage. Nobody has claimed it.`
            : `Someone tried ${detail.kindPhrase} at ${where}. It failed, but someone sent it.`,
        systemId: op.targetRegionId,
        kindPhrase: detail.kindPhrase,
        openedAt: now,
        suspectIds: suspects,
        clues: [],
        status: 'open',
        accusedFactionId: null,
        verdict: null,
        closedAt: null,
        // The press is quick; everything else takes a while.
        nextClueAt: now + (suspectedId ? 0 : interval / 2),
        operationId: op.id,
        actorFactionId: op.actorFactionId,
        falseFlagFactionId: op.falseFlagFactionId ?? null,
        pendingClues: pending,
        interrogatedAgentIds: [],
    };
    ensureCases(world).set(kase.id, kase);
    releaseDueClues(kase, world, false);

    // A suspected operation was already announced (op-aftermath); only an
    // unnoticed one needs telling that something happened at all.
    if (op.attributionState === 'suspected') return kase;
    fireNotification({
        id: `case-open-${kase.id}`,
        factionId: victim,
        category: 'espionage',
        priority: 'normal',
        title: 'CASE OPENED',
        body: `${kase.summary} Our service is investigating; clues will come in.`,
        createdAt: new Date(now * 1000).toISOString(),
        read: false,
        linkToTab: 'intelligence',
    });
    return kase;
}

function releaseDueClues(kase: CovertCase, world: GameWorldState, notify: boolean): number {
    const now = world.nowSeconds;
    let released = 0;
    const pending = kase.pendingClues ?? [];
    while (pending.length > 0 && now >= kase.nextClueAt) {
        const next = pending.shift()!;
        next.arrivedAt = now;
        kase.clues.push(next);
        released++;
        kase.nextClueAt += clueInterval(world, kase.ownerFactionId);
    }
    if (pending.length === 0 && now >= kase.nextClueAt) {
        // Nothing waiting: the next clue (an interrogation, say) can come at once.
        kase.nextClueAt = now;
    }
    if (released > 0 && notify && isPlayerRun(world, kase.ownerFactionId)) {
        fireNotification({
            id: `case-clue-${kase.id}-${now}`,
            factionId: kase.ownerFactionId,
            category: 'espionage',
            priority: 'low',
            title: 'NEW CLUE',
            body: `${kase.title}: ${kase.clues[kase.clues.length - 1].text}`,
            createdAt: new Date(now * 1000).toISOString(),
            read: false,
            linkToTab: 'intelligence',
        });
    }
    return released;
}

/** Release clues, question new prisoners, let old cases go cold and old closed ones go. */
export function tickCases(world: GameWorldState): void {
    const cases = ensureCases(world);
    const now = world.nowSeconds;
    const prisoners = [...world.espionage.agents.values()].filter(a => a.status === 'captured' && a.capturedByFactionId);

    for (const [id, kase] of cases) {
        if (kase.status !== 'open') {
            if (kase.closedAt != null && now - kase.closedAt > CASE_PRUNE_AFTER_SECONDS) cases.delete(id);
            continue;
        }
        // New prisoners held by the case owner, from a suspect's service.
        for (const agent of prisoners) {
            if (agent.capturedByFactionId !== kase.ownerFactionId) continue;
            if (!kase.suspectIds.includes(agent.ownerFactionId)) continue;
            if (kase.interrogatedAgentIds?.includes(agent.id)) continue;
            (kase.interrogatedAgentIds ??= []).push(agent.id);
            (kase.pendingClues ??= []).unshift(interrogationClue(agent, kase, world));
        }
        releaseDueClues(kase, world, true);
        if (now - kase.openedAt > CASE_COLD_AFTER_SECONDS) {
            kase.status = 'cold';
            kase.closedAt = now;
        }
    }
}

// ─── Accusing and leaking ────────────────────────────────────────────────────

export type CaseActionResult = { ok: true; message: string; verdict?: 'correct' | 'wrong' } | { ok: false; message: string };

function ownOpenCase(world: GameWorldState, factionId: string, caseId: string): CovertCase | string {
    const kase = ensureCases(world).get(caseId);
    if (!kase || kase.ownerFactionId !== factionId) return 'No such case.';
    if (kase.status !== 'open') return 'That case is closed.';
    return kase;
}

/**
 * Name the culprit. Right: the operation is exposed after the fact, with every
 * consequence an exposure carries. Wrong: an innocent empire is insulted, the
 * accuser looks unreliable, and the real sponsor's hold tightens.
 */
export function fileAccusation(world: GameWorldState, factionId: string, caseId: string, suspectId: string): CaseActionResult {
    const kase = ownOpenCase(world, factionId, caseId);
    if (typeof kase === 'string') return { ok: false, message: kase };
    if (!kase.suspectIds.includes(suspectId)) return { ok: false, message: 'That empire is not a suspect in this case.' };

    const now = world.nowSeconds;
    const actor = kase.actorFactionId ?? '';
    const correct = suspectId === actor;
    const createdAt = new Date(now * 1000).toISOString();
    const accuserName = labelFor(factionId);
    const accusedName = labelFor(suspectId);

    kase.status = 'accused';
    kase.accusedFactionId = suspectId;
    kase.verdict = correct ? 'correct' : 'wrong';
    kase.closedAt = now;

    if (correct) {
        const op = kase.operationId ? world.espionage.operations.get(kase.operationId) : undefined;
        if (op) op.attributionState = 'exposed';
        try { shiftRivalry(world, factionId, actor, EXPOSED_RIVALRY_JUMP, 'spy_exposed', kase.kindPhrase); } catch { /* minimal worlds */ }
        try { openDebate(world, factionId, 'espionage_exposed_on_us', { aggressor: accusedName }, actor); } catch { /* no chamber */ }
        try { grantPoliticalCapital(world, factionId, CORRECT_ACCUSATION_CAPITAL, 'proved a foreign operation'); } catch { /* no government */ }
        try { ReputationService.updateScore(world, actor, { deception: 5, reliability: -3 }, 'exposed_by_accusation'); } catch { /* no ledger */ }
        const intel = getOrCreateFactionIntel(world, factionId);
        intel.intelPoints = Math.min(1000, intel.intelPoints + CORRECT_ACCUSATION_INTEL);
        chronicle.record(world, {
            type: 'scandal_confirmed',
            actorIds: [actor],
            targetIds: [factionId],
            location: kase.systemId,
            facts: { kind: kase.kindPhrase, accusedBy: accuserName, proved: true },
            attribution: 'exposed',
        });
        if (isPlayerRun(world, actor)) {
            fireNotification({
                id: `case-caught-${kase.id}`, factionId: actor, category: 'espionage', priority: 'urgent',
                title: 'OUR OPERATION IS EXPOSED',
                body: `${accuserName} has publicly named us for ${kase.kindPhrase} at ${systemName(world, kase.systemId)}, and the evidence holds.`,
                createdAt, read: false, linkToTab: 'intelligence',
            });
        }
        return { ok: true, verdict: 'correct', message: `The evidence held. ${accusedName} is exposed.` };
    }

    try { shiftRivalry(world, factionId, suspectId, FALSE_ACCUSATION_RIVALRY_JUMP, 'false_accusation', kase.kindPhrase); } catch { /* minimal worlds */ }
    try { ReputationService.updateScore(world, factionId, { reliability: -4 }, 'false_accusation'); } catch { /* no ledger */ }
    if (actor) updateInfiltration(world, actor, factionId, FALSE_ACCUSATION_ACTOR_INFILTRATION);
    chronicle.record(world, {
        type: 'investigation_published',
        actorIds: [factionId],
        targetIds: [suspectId],
        location: kase.systemId,
        facts: { kind: kase.kindPhrase, accusation: true, proved: false },
        attribution: 'exposed',
    });
    if (isPlayerRun(world, suspectId)) {
        fireNotification({
            id: `case-slander-${kase.id}`, factionId: suspectId, category: 'espionage', priority: 'urgent',
            title: 'FALSELY ACCUSED',
            body: `${accuserName} has publicly blamed us for ${kase.kindPhrase} at ${systemName(world, kase.systemId)}. We had nothing to do with it.`,
            createdAt, read: false, linkToTab: 'intelligence',
        });
    }
    return { ok: true, verdict: 'wrong', message: `${accusedName} denies it, and the evidence does not hold.` };
}

/**
 * Give the case to the press instead: an investigation that names a suspect,
 * with no diplomatic weight behind it. Closes the case.
 */
export function leakCase(world: GameWorldState, factionId: string, caseId: string, suspectId: string): CaseActionResult {
    const kase = ownOpenCase(world, factionId, caseId);
    if (typeof kase === 'string') return { ok: false, message: kase };
    if (!kase.suspectIds.includes(suspectId)) return { ok: false, message: 'That empire is not a suspect in this case.' };

    kase.status = 'leaked';
    kase.accusedFactionId = suspectId;
    kase.closedAt = world.nowSeconds;
    // The leak is OUR act (actorIds); what it alleges is a suspicion the press
    // can print but not prove.
    chronicle.record(world, {
        type: 'investigation_published',
        actorIds: [factionId],
        targetIds: [suspectId],
        location: kase.systemId,
        facts: { kind: kase.kindPhrase, leaked: true },
        attribution: `suspected:${suspectId}`,
    });
    return { ok: true, message: `The story is with the press. It names ${labelFor(suspectId)}.` };
}

// ─── Sweeps take prisoners ───────────────────────────────────────────────────

/**
 * Take agents from foreign networks a sweep broke up. Returns who was taken.
 * Called by applySweep for each network it found.
 */
export function captureAgents(
    world: GameWorldState,
    captorId: string,
    agentIds: string[],
    chance: number,
    rand: () => number = Math.random
): SpyAgent[] {
    const taken: SpyAgent[] = [];
    for (const id of agentIds) {
        const agent = world.espionage.agents.get(id);
        if (!agent || agent.ownerFactionId === captorId) continue;
        if (agent.status !== 'deployed' && agent.status !== 'on_cooldown') continue;
        if (rand() >= chance) continue;
        agent.status = 'captured';
        agent.capturedByFactionId = captorId;
        agent.deployedToSystemId = null;
        taken.push(agent);
    }
    return taken;
}
