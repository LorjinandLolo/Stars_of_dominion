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
import { SIM_SECONDS_PER_REAL_SECOND } from '../time/time-config';
import { HOMEGROWN } from '../rebellion/rebellion-types';
import {
    empiresOfSpecies, isGrievance, relationPhrase, speciesLabel, speciesOf, withArticle, type ClueTag,
    LEAD_BY_KIND, leadCost, leadDurationSeconds, MOTIVE_WINDOW_SECONDS, SOURCES_LEAD_MIN_INFILTRATION, motiveLabel, type LeadKind,
} from './dossier';
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
/** Rewards and costs of an accusation. */
export const CORRECT_ACCUSATION_INTEL = 40;
export const CORRECT_ACCUSATION_CAPITAL = 5;
export const EXPOSED_RIVALRY_JUMP = 10;
export const FALSE_ACCUSATION_RIVALRY_JUMP = 8;
export const FALSE_ACCUSATION_ACTOR_INFILTRATION = 10;
/** Open files an AI empire works at once. */
export const MAX_AI_OPEN_CASES = 4;
/** Notify on each passive clue (off: see releaseDueClues). */
export const PASSIVE_CLUE_ALERTS = false;
/** Open files a player works at once; older ones are shelved for newer. */
export const MAX_PLAYER_OPEN_CASES = 12;
/** The kind phrase intelligence-gathering files carry (op-aftermath KIND_PHRASE). */
const KIND_PHRASE_INTEL = 'an intelligence operation';

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

function clue(source: CaseClue['source'], tag: ClueTag, text: string, pointsAt: string[], weights: Record<string, number>, now: number): CaseClue {
    return { id: opaqueId('clue', now), source, tag, text, pointsAt, weights, arrivedAt: 0 };
}

/** Hidden weights: the sponsor gets `genuine`, everyone else named gets 0. */
function onlySponsor(ids: string[], actor: string, genuine: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const id of ids) out[id] = id === actor ? genuine : 0;
    return out;
}

/** Chance a hired foreigner is recognised as a freelancer, by our counter-intelligence. */
export function hirelingSpotChance(counterIntelStrength: number): number {
    return Math.min(0.9, 0.3 + Math.max(0, counterIntelStrength) / 200);
}

/** Real days, like the page: the sim clock runs 15x. */
function ago(now: number, at: number): string {
    const days = Math.max(0, Math.round((now - at) / SIM_SECONDS_PER_REAL_SECOND / 86400));
    return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * The clues a case will release, worked out at the moment it opens (the
 * sensor log, the relations log and the treasuries of that moment). Order is
 * release order. Each clue carries a public tag (motive, means, opportunity,
 * testimony) and hidden weights.
 */
export function buildClues(
    op: EspionageOperation,
    world: GameWorldState,
    suspects: string[],
    suspectedId: string | null,
    rand: () => number = Math.random
): CaseClue[] {
    const now = world.nowSeconds;
    const victim = op.targetFactionId;
    const actor = op.actorFactionId;
    const where = systemName(world, op.targetRegionId);
    const def = op.definitionId ? OPERATION_CATALOG_BY_ID.get(op.definitionId) : undefined;
    const flag = op.falseFlagFactionId && op.falseFlagFactionId !== victim ? op.falseFlagFactionId : null;
    const factions = world.economy?.factions;
    const out: CaseClue[] = [];

    // Press: whoever the attribution formula fingered, right or wrong.
    if (suspectedId) {
        out.push(clue('press', 'testimony', `Our own press is already naming ${labelFor(suspectedId)}.`, [suspectedId], onlySponsor([suspectedId], actor, 0.5), now));
    }

    // The convenient witness. A walk-in who turns up within hours, certain,
    // with a name: genuine sources never come this way, plants always do.
    if (flag) {
        out.push(clue('own_intel', 'testimony', `A walk-in turned up within hours, certain it was ${labelFor(flag)}, and named the officer who gave the order.`, [flag], { [flag]: 0 }, now));
    }

    // Species trace: someone saw the operative. Own species points home; a
    // hired foreigner points at their homeworld.
    const agent = op.agentId ? world.espionage.agents.get(op.agentId) : undefined;
    const actorSpecies = speciesOf(factions?.get?.(actor) as any);
    // An agent shows their own face; an agentless operation shows whatever
    // face the sponsor hired for it (AI services, item 12c), or none.
    const seenSpecies = agent ? (agent.species ?? actorSpecies) : (op.operativeSpecies ?? null);
    if (seenSpecies && factions) {
        const kin = empiresOfSpecies(factions.entries() as any, seenSpecies).filter(id => id !== victim && suspects.includes(id));
        const label = speciesLabel(seenSpecies);
        out.push(clue('sensors', 'opportunity',
            `Witnesses at ${where} describe the operative: ${withArticle(label)}.${kin.length ? '' : ' No empire of that species is on our list.'}`,
            kin, onlySponsor(kin, actor, 0.4), now));
    }

    // A false flag's planted hardware.
    if (flag) {
        out.push(clue('sensors', 'opportunity', `A transponder code recovered near ${where} belongs to ${labelFor(flag)}.`, [flag], { [flag]: 0 }, now));
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
            out.push(clue('method', 'means',
                `This took ${needs}. ${holders.length === 1 ? 'Only one service could field that' : `${holders.length} services could field that`}: ${holders.map(labelFor).join(', ')}.`,
                holders, weights, now));
        }
    }

    // Money trail: somebody paid for this. Always true of the sponsor; usually
    // true of half the galaxy, which is what makes it only a start.
    if (def && def.creditsCost > 0) {
        const floor = def.creditsCost * 5;
        const payers = suspects.filter(id => id === actor
            || Number((factions?.get?.(id) as any)?.reserves?.CREDITS ?? 0) >= floor);
        if (payers.length > 0 && payers.length < suspects.length) {
            out.push(clue('method', 'means', `It cost someone around § ${def.creditsCost}. Services with that to spare: ${payers.map(labelFor).join(', ')}.`,
                payers, onlySponsor(payers, actor, 0.1), now));
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
        out.push(clue('sensors', 'opportunity', `Our pickets logged ships of ${ids.map(labelFor).join(', ')} at ${where} around the time.`, ids, onlySponsor(ids, actor, 0.3), now));
    }

    // Motive: the grudges on file. Real incidents from the relations log, the
    // two worst relationships first; a bare score only when the log is empty.
    const grudges = suspects
        .map(id => {
            const r: any = world.rivalries?.get?.(`rivalry-${victim}-${id}`) ?? world.rivalries?.get?.(`rivalry-${id}-${victim}`);
            const events = (Array.isArray(r?.recentEvents) ? r.recentEvents : [])
                .filter((e: any) => isGrievance(e) && now - e.atSeconds <= MOTIVE_WINDOW_SECONDS)
                .sort((a: any, b: any) => b.atSeconds - a.atSeconds);
            return { id, score: r?.rivalryScore ?? 0, last: events[0] as { kind: string; atSeconds: number } | undefined };
        })
        .filter(g => g.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
    if (grudges.length > 0) {
        const ids = grudges.map(g => g.id);
        const lines = grudges.map(g => g.last
            ? `${labelFor(g.id)} (${relationPhrase(g.last.kind)} between us, ${ago(now, g.last.atSeconds)})`
            : `${labelFor(g.id)} (relations long sour)`);
        out.push(clue('motive', 'motive', `Grudges on file: ${lines.join('; ')}.`, ids, onlySponsor(ids, actor, 0.2), now));
    }

    // Cui bono: who moves up if we are knocked down. Sometimes the sponsor,
    // often not, which is the point of asking.
    const ourCredits = Number((factions?.get?.(victim) as any)?.reserves?.CREDITS ?? 0);
    const chasers = suspects
        .map(id => ({ id, credits: Number((factions?.get?.(id) as any)?.reserves?.CREDITS ?? 0) }))
        .filter(x => x.credits > 0 && x.credits < ourCredits)
        .sort((a, b) => b.credits - a.credits)
        .slice(0, 2)
        .map(x => x.id);
    if (chasers.length > 0) {
        out.push(clue('motive', 'motive', `Who gains if we stumble? ${chasers.map(labelFor).join(' and ')}, the treasuries just behind ours.`,
            chasers, onlySponsor(chasers, actor, 0.1), now));
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
            out.push(clue('motive', 'opportunity', `${ids.map(labelFor).join(' and ')} ${ids.length > 1 ? 'hold' : 'holds'} the nearest systems to ${where}.`,
                ids, onlySponsor(ids, actor, 0.1), now));
        }
    }

    // Our own sources abroad: inside the sponsor they heard something; inside
    // an innocent they heard nothing, which is worth knowing too.
    const ours = world.espionage.factionIntel.get(victim)?.infiltrationLevels ?? {};
    const embedded = stageInfo('embedded_network').minInfiltration;
    if ((ours[actor] ?? 0) >= embedded) {
        out.push(clue('own_intel', 'testimony', `Our sources inside ${labelFor(actor)} heard talk of an operation against us.`, [actor], { [actor]: 0.8 }, now));
    } else {
        const watched = suspects.find(id => id !== actor && (ours[id] ?? 0) >= embedded);
        if (watched) {
            out.push({ ...clue('own_intel', 'testimony', `Our sources inside ${labelFor(watched)} heard nothing about it.`, [watched], { [watched]: -0.5 }, now), clears: [watched] });
        }
    }

    // Seeing through a hired face: our files may know this operative as a
    // freelancer. Comes late, and only to a service that keeps good files.
    if (seenSpecies && actorSpecies && seenSpecies !== actorSpecies) {
        const ci = world.espionage.factionIntel.get(victim)?.counterIntelStrength ?? 0;
        if (rand() < hirelingSpotChance(ci)) {
            const kin = factions ? empiresOfSpecies(factions.entries() as any, seenSpecies).filter(id => id !== victim && suspects.includes(id)) : [];
            const weights: Record<string, number> = {};
            for (const id of kin) weights[id] = -0.4;
            out.push({ ...clue('own_intel', 'testimony',
                `Our files know the ${speciesLabel(seenSpecies)} operative: a freelancer who has sold work to more than one service. Their face proves nothing about who paid.`,
                kin, weights, now), clears: kin });
        }
    }
    return out;
}

/**
 * What a captured agent says about a case. Honest agents tell the truth as
 * they know it: their service did it, or it did not. A Double Agent lies. A
 * hired foreigner says who paid them, which is the whole value of catching one.
 */
export function interrogationClue(agent: SpyAgent, kase: CovertCase, world: GameWorldState, rand: () => number = Math.random): CaseClue {
    const now = world.nowSeconds;
    const owner = agent.ownerFactionId;
    const actor = kase.actorFactionId ?? '';
    const lies = agent.traitIds.includes('double_agent');
    const didIt = owner === actor;
    const others = kase.suspectIds.filter(id => id !== owner);
    const scapegoat = others.length ? others[Math.floor(rand() * others.length)] : owner;
    const ownerSpecies = speciesOf(world.economy?.factions?.get?.(owner) as any);
    const hired = !!agent.species && !!ownerSpecies && agent.species !== ownerSpecies;
    const who = hired ? `${agent.codename}, ${withArticle(speciesLabel(agent.species))} taken in a sweep,` : `${agent.codename}, taken in a sweep,`;
    const kind = kase.kindPhrase.replace(/^an? /, '');

    if (didIt !== lies) {
        // Says their own employer did it (true unless lying).
        return clue('interrogation', 'testimony',
            hired ? `${who} says ${labelFor(owner)} paid for the ${kind}.` : `${who} says ${labelFor(owner)} ran the ${kind}.`,
            [owner], { [owner]: didIt ? 1 : 0 }, now);
    }
    if (lies && didIt) {
        return clue('interrogation', 'testimony', `${who} blames ${labelFor(scapegoat)}.`, [scapegoat], { [scapegoat]: 0 }, now);
    }
    return { ...clue('interrogation', 'testimony', `${who} swears ${labelFor(owner)} had nothing to do with it.`,
        [owner], { [owner]: -0.6 }, now), clears: [owner] };
}

// ─── Motives ─────────────────────────────────────────────────────────────────

/** Earlier files within this window count as linked. */
export const LINK_WINDOW_SECONDS = 10 * 86400;

function ordinal(n: number): string {
    return ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'][n] ?? `${n}th`;
}

function rivalryBetween(world: GameWorldState, a: string, b: string): any {
    return world.rivalries?.get?.(`rivalry-${a}-${b}`) ?? world.rivalries?.get?.(`rivalry-${b}-${a}`);
}

/**
 * Why the sponsor really did it, fixed when the file opens. Built from the
 * same public facts the page uses to offer motives (motiveOptions in
 * dossier.ts), so the right answer is always one of the choices: at war,
 * else the freshest grievance between them, else money, else opportunism.
 */
export function motiveFor(world: GameWorldState, actorId: string, victimId: string): string {
    const now = world.nowSeconds;
    const r = rivalryBetween(world, actorId, victimId);
    if ((r?.escalationLevel ?? 0) >= 7) return 'war';
    const live = (Array.isArray(r?.recentEvents) ? r.recentEvents : [])
        .filter((e: any) => isGrievance(e) && now - e.atSeconds <= MOTIVE_WINDOW_SECONDS)
        .sort((a: any, b: any) => b.atSeconds - a.atSeconds);
    if (live.length > 0) return `grievance:${live[0].kind}`;
    const credits = (id: string) => Number((world.economy?.factions?.get?.(id) as any)?.reserves?.CREDITS ?? 0);
    if (credits(actorId) < credits(victimId)) return 'economic';
    return 'opportunism';
}

// ─── Leads ───────────────────────────────────────────────────────────────────

/** Sponsor-side reward when a theory names the right motive as well as the right culprit. */
export const RIGHT_MOTIVE_INTEL_BONUS = 20;
export const RIGHT_MOTIVE_CAPITAL_BONUS = 3;

function pick<T>(list: T[], rand: () => number): T | undefined {
    return list.length ? list[Math.floor(rand() * list.length)] : undefined;
}

function prisonersHeld(world: GameWorldState, factionId: string) {
    const intel = world.espionage.factionIntel.get(factionId);
    return (intel?.prisoners ?? []).filter(p => {
        const a = world.espionage.agents.get(p.agentId);
        return a && a.status === 'captured' && a.capturedByFactionId === factionId;
    });
}

/** Why a lead cannot be run on this file right now, or null when it can. */
export function leadBlocker(world: GameWorldState, kase: CovertCase, kind: LeadKind, targetId: string | null): string | null {
    if (kase.status !== 'open') return 'That file is closed.';
    if (kase.lead) return 'Our service is already working a lead on this file.';
    if (kind === 'sources') {
        if (!targetId || !kase.suspectIds.includes(targetId)) return 'Pick a person of interest whose service we have people inside.';
        const level = world.espionage.factionIntel.get(kase.ownerFactionId)?.infiltrationLevels?.[targetId] ?? 0;
        if (level < SOURCES_LEAD_MIN_INFILTRATION) return `We have no Embedded Network inside ${labelFor(targetId)}.`;
    }
    if (kind === 'prisoner' && prisonersHeld(world, kase.ownerFactionId).length === 0) return 'We hold no prisoners.';
    if (kind === 'operative' && !kase.operativeSpecies) return 'Nobody saw the operative.';
    return null;
}

/** Start a lead: pay its Intel, set its clock. */
export function pursueLead(world: GameWorldState, factionId: string, caseId: string, kind: string, targetId: string | null): CaseActionResult {
    const kase = ensureCases(world).get(caseId);
    if (!kase || kase.ownerFactionId !== factionId) return { ok: false, message: 'No such file.' };
    if (!(kind in LEAD_BY_KIND)) return { ok: false, message: 'Unknown line of inquiry.' };
    const leadKind = kind as LeadKind;
    const blocker = leadBlocker(world, kase, leadKind, targetId);
    if (blocker) return { ok: false, message: blocker };

    const intel = getOrCreateFactionIntel(world, factionId);
    const ci = intel.counterIntelStrength ?? 0;
    const cost = leadCost(leadKind, ci);
    if (intel.intelPoints < cost) return { ok: false, message: `${LEAD_BY_KIND[leadKind].label} needs ${cost} Intel.` };
    intel.intelPoints -= cost;
    const now = world.nowSeconds;
    kase.lead = { kind: leadKind, targetFactionId: targetId, startedAt: now, dueAt: now + leadDurationSeconds(leadKind, ci), cost };
    return { ok: true, message: `${LEAD_BY_KIND[leadKind].label}: our service is on it.` };
}

/**
 * What a lead turns up. Findings, not verdicts: a lead never names the sponsor
 * as proven, and several can come back empty or point at the wrong door.
 */
export function resolveLead(world: GameWorldState, kase: CovertCase, rand: () => number = Math.random): CaseClue | null {
    const lead = kase.lead;
    if (!lead) return null;
    const now = world.nowSeconds;
    const actor = kase.actorFactionId ?? '';
    const victim = kase.ownerFactionId;
    const ci = world.espionage.factionIntel.get(victim)?.counterIntelStrength ?? 0;
    const where = systemName(world, kase.systemId);
    const def = kase.definitionId ? OPERATION_CATALOG_BY_ID.get(kase.definitionId) : undefined;
    const suspects = kase.suspectIds;
    const nothing = (text: string) => clue('own_intel', 'testimony', text, [], {}, now);

    switch (lead.kind as LeadKind) {
        case 'money': {
            if (rand() >= 0.6 + ci / 250) return nothing('The money went through too many hands. The trail is cold.');
            const decoys = suspects.filter(id => id !== actor);
            const named = [actor];
            for (let i = 0; i < 2 && decoys.length; i++) named.push(decoys.splice(Math.floor(rand() * decoys.length), 1)[0]);
            named.sort();
            return clue('method', 'means', `The money for this ran through accounts tied to ${named.map(labelFor).join(', ')}.`,
                named, onlySponsor(named, actor, 0.5), now);
        }
        case 'sensors': {
            const here: any = world.movement?.systems?.get?.(kase.systemId);
            const area = new Set<string>([kase.systemId, ...((here?.hyperlaneNeighbors as string[]) ?? [])]);
            const seen = new Set<string>();
            for (const fleet of (world.movement?.fleets?.values?.() ?? []) as Iterable<any>) {
                if (area.has(fleet.currentSystemId) && fleet.factionId !== victim && suspects.includes(fleet.factionId)) seen.add(fleet.factionId);
            }
            const ids = [...seen].sort();
            if (ids.length === 0) return nothing(`The sensor logs around ${where} show nobody who should not have been there.`);
            return clue('sensors', 'opportunity', `Sensor logs in and around ${where} show ships of ${ids.map(labelFor).join(', ')}.`,
                ids, onlySponsor(ids, actor, 0.3), now);
        }
        case 'method': {
            if (!def) return nothing('The method leaves nothing we can measure.');
            const stage = stageInfo(MIN_STAGE_FOR_CATEGORY[def.category as OperationCategory]);
            const holders = suspects.filter(id => id === actor
                || (world.espionage.factionIntel.get(id)?.infiltrationLevels?.[victim] ?? 0) >= stage.minInfiltration);
            if (stage.minInfiltration === 0) return nothing('Anyone with a recon team could have done this. The method tells us nothing.');
            const weights: Record<string, number> = {};
            for (const id of holders) weights[id] = id === actor ? 1 / holders.length + 0.3 : 0;
            return clue('method', 'means', `As of now, ${holders.length === 1 ? 'one service holds' : `${holders.length} services hold`} a ${stage.label} network inside us: ${holders.map(labelFor).join(', ')}.`,
                holders, weights, now);
        }
        case 'sources': {
            const target = lead.targetFactionId ?? '';
            if (target === actor) {
                return clue('own_intel', 'testimony', `Our sources inside ${labelFor(target)} confirm it: an operation against us was run from there.`,
                    [target], { [target]: 0.9 }, now);
            }
            return { ...clue('own_intel', 'testimony', `Our sources inside ${labelFor(target)} heard nothing of it, and they would have.`,
                [target], { [target]: -0.7 }, now), clears: [target] };
        }
        case 'prisoner': {
            const record = pick(prisonersHeld(world, victim), rand);
            const agent = record ? world.espionage.agents.get(record.agentId) : undefined;
            if (!record || !agent) return nothing('There is nobody left to question.');
            const owner = agent.ownerFactionId;
            if (agent.traitIds.includes('double_agent') && rand() < 0.5 + ci / 200) {
                const out = clue('interrogation', 'testimony',
                    `${agent.codename} broke: they had been lying, and work for ${labelFor(owner)}${owner === actor ? ', who ran this' : ''}.`,
                    [owner], { [owner]: owner === actor ? 1 : 0 }, now);
                return record.claimedEmployerId !== owner ? { ...out, clears: [record.claimedEmployerId] } : out;
            }
            return interrogationClue(agent, kase, world, rand);
        }
        case 'operative': {
            const species = kase.operativeSpecies;
            if (!species) return nothing('Nobody saw the operative.');
            const actorSpecies = speciesOf(world.economy?.factions?.get?.(actor) as any);
            const kin = empiresOfSpecies((world.economy?.factions?.entries?.() ?? []) as any, species).filter(id => suspects.includes(id));
            if (species !== actorSpecies) {
                if (rand() >= 0.6 + ci / 200) return nothing(`The ${speciesLabel(species)} operative left no trail we can follow.`);
                const decoy = pick(suspects.filter(id => id !== actor && !kin.includes(id)), rand);
                const brokers = [actor, ...(decoy ? [decoy] : [])].sort();
                const weights: Record<string, number> = {};
                for (const id of kin) weights[id] = -0.5;
                for (const id of brokers) weights[id] = id === actor ? 0.6 : 0;
                return { ...clue('own_intel', 'testimony',
                    `The ${speciesLabel(species)} operative is a freelancer, hired through a broker who has sold to ${brokers.map(labelFor).join(' and ')}.`,
                    brokers, weights, now), clears: kin.filter(id => !brokers.includes(id)) };
            }
            return clue('own_intel', 'testimony',
                `The operative is no freelancer: their tradecraft is ${speciesLabel(species)} service training.`,
                kin, onlySponsor(kin, actor, 0.5), now);
        }
    }
    return null;
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
    // Quiet spying leaves no mark: a successful intelligence operation nobody
    // noticed has no effect for the victim to investigate.
    if (op.attributionState === 'invisible' && op.definitionId
        && OPERATION_CATALOG_BY_ID.get(op.definitionId)?.category === 'intel_gathering') return null;
    // AI victims investigate too (item 12c), on a few files at a time so a
    // season of AI espionage does not fill their shards.
    if (!isPlayerRun(world, victim)) {
        const open = [...ensureCases(world).values()].filter(c => c.ownerFactionId === victim && c.status === 'open').length;
        if (open >= MAX_AI_OPEN_CASES) return null;
    } else {
        // A player can work only so many files. Over the cap, shelve the oldest
        // file about mere snooping first, else the oldest file of all.
        const open = [...ensureCases(world).values()]
            .filter(c => c.ownerFactionId === victim && c.status === 'open')
            .sort((a, b) => a.openedAt - b.openedAt);
        if (open.length >= MAX_PLAYER_OPEN_CASES) {
            const snoop = open.find(c => c.kindPhrase === KIND_PHRASE_INTEL);
            const shelf = snoop ?? open[0];
            shelf.status = 'cold';
            shelf.closedAt = world.nowSeconds;
            shelf.lead = null;
        }
    }

    const now = world.nowSeconds;
    const where = systemName(world, op.targetRegionId);
    const suspects = suspectsFor(world, victim, op.actorFactionId);
    const pending = buildClues(op, world, suspects, suspectedId);
    const interval = clueInterval(world, victim);

    // Linked incidents: earlier files of ours in the same system, or of the
    // same kind, within ten sim days.
    const recent = [...ensureCases(world).values()].filter(c =>
        c.ownerFactionId === victim && now - c.openedAt <= LINK_WINDOW_SECONDS);
    const sameSystem = recent.filter(c => c.systemId === op.targetRegionId).length;
    const sameKind = recent.filter(c => c.kindPhrase === detail.kindPhrase).length;
    const linkedNote = sameSystem > 0
        ? `The ${ordinal(sameSystem + 1)} incident at ${where} in ten days.`
        : sameKind > 0
            ? `The ${ordinal(sameKind + 1)} ${detail.kindPhrase.replace(/^an? /, '')} against us in ten days.`
            : null;

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
        lead: null,
        leadsRun: 0,
        linkedNote,
        theoryMotive: null,
        motiveVerdict: null,
        trueMotive: motiveFor(world, op.actorFactionId, victim),
        definitionId: op.definitionId ?? null,
        operativeSpecies: op.agentId
            ? (world.espionage.agents.get(op.agentId)?.species ?? speciesOf(world.economy?.factions?.get?.(op.actorFactionId) as any))
            : (op.operativeSpecies ?? null),
    };
    ensureCases(world).set(kase.id, kase);
    releaseDueClues(kase, world, false);
    // A false flag's walk-in is quick to arrive: that is its tell.
    if (kase.falseFlagFactionId) kase.nextClueAt = Math.min(kase.nextClueAt, now + interval / 4);

    // A suspected operation was already announced (op-aftermath); only an
    // unnoticed one needs telling that something happened at all.
    if (op.attributionState === 'suspected' || !isPlayerRun(world, victim)) return kase;
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
    // Passive clues arrive without a ping: with AI espionage live, a player
    // can hold dozens of files, and one alert per clue buried the bell. Files
    // opening, leads reporting back and verdicts still notify.
    if (released > 0 && notify && PASSIVE_CLUE_ALERTS && isPlayerRun(world, kase.ownerFactionId)) {
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
export function tickCases(world: GameWorldState, deltaSeconds = 0): void {
    const cases = ensureCases(world);
    const now = world.nowSeconds;
    tickMoles(world, cases, deltaSeconds);
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
        // A pursued lead comes back.
        if (kase.lead && now >= kase.lead.dueAt) {
            const label = LEAD_BY_KIND[kase.lead.kind as LeadKind]?.label ?? 'Lead';
            const finding = resolveLead(world, kase);
            kase.lead = null;
            kase.leadsRun = (kase.leadsRun ?? 0) + 1;
            if (finding) {
                finding.arrivedAt = now;
                kase.clues.push(finding);
                if (isPlayerRun(world, kase.ownerFactionId)) {
                    fireNotification({
                        id: `case-lead-${kase.id}-${now}`, factionId: kase.ownerFactionId, category: 'espionage', priority: 'normal',
                        title: 'LEAD REPORTS BACK',
                        body: `${kase.title} · ${label}: ${finding.text}`,
                        createdAt: new Date(now * 1000).toISOString(), read: false, linkToTab: 'intelligence',
                    });
                }
            }
        }
        releaseDueClues(kase, world, true);
        if (now - kase.openedAt > CASE_COLD_AFTER_SECONDS) {
            kase.status = 'cold';
            kase.closedAt = now;
            kase.lead = null;
            // The press notices an investigation that went nowhere.
            chronicle.record(world, {
                type: 'investigation_published',
                actorIds: [kase.ownerFactionId],
                targetIds: [kase.ownerFactionId],
                location: kase.systemId,
                facts: { ...pressFacts(world, kase), subject: `the unsolved ${kase.kindPhrase.replace(/^an? /, '')} at ${systemName(world, kase.systemId)}`, kind: kase.kindPhrase, cold: true },
                attribution: 'invisible',
            });
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
export function fileAccusation(world: GameWorldState, factionId: string, caseId: string, suspectId: string, motive: string | null = null): CaseActionResult {
    const kase = ownOpenCase(world, factionId, caseId);
    if (typeof kase === 'string') return { ok: false, message: kase };
    if (!kase.suspectIds.includes(suspectId)) return { ok: false, message: 'That empire is not a suspect in this case.' };
    if (suspectId === HOMEGROWN) return closeAsHomegrown(world, kase, motive);

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
    // The theory: a named motive is judged only when the culprit is right.
    kase.lead = null;
    kase.theoryMotive = motive;
    const motiveRight = correct && !!motive && motive === kase.trueMotive;
    kase.motiveVerdict = correct && motive ? (motiveRight ? 'right' : 'wrong') : null;

    if (correct) {
        const op = kase.operationId ? world.espionage.operations.get(kase.operationId) : undefined;
        if (op) op.attributionState = 'exposed';
        // A cell's file: naming the sponsor exposes the sponsorship (Item 13b).
        const sponsorship: any = kase.sponsorshipId ? (world as any).rebellion?.sponsorships?.get?.(kase.sponsorshipId) : undefined;
        if (sponsorship && !sponsorship.exposedAtSeconds) { sponsorship.evidence = 1; sponsorship.attributionState = 'exposed'; sponsorship.exposedAtSeconds = now; }
        try { shiftRivalry(world, factionId, actor, EXPOSED_RIVALRY_JUMP, 'spy_exposed', kase.kindPhrase); } catch { /* minimal worlds */ }
        try { openDebate(world, factionId, 'espionage_exposed_on_us', { aggressor: accusedName }, actor); } catch { /* no chamber */ }
        try { grantPoliticalCapital(world, factionId, CORRECT_ACCUSATION_CAPITAL, 'proved a foreign operation'); } catch { /* no government */ }
        try { ReputationService.updateScore(world, actor, { deception: 5, reliability: -3 }, 'exposed_by_accusation'); } catch { /* no ledger */ }
        const intel = getOrCreateFactionIntel(world, factionId);
        intel.intelPoints = Math.min(1000, intel.intelPoints + CORRECT_ACCUSATION_INTEL + (motiveRight ? RIGHT_MOTIVE_INTEL_BONUS : 0));
        if (motiveRight) {
            try { grantPoliticalCapital(world, factionId, RIGHT_MOTIVE_CAPITAL_BONUS, 'named the motive behind a foreign operation'); } catch { /* no government */ }
        }
        chronicle.record(world, {
            type: 'scandal_confirmed',
            actorIds: [actor],
            targetIds: [factionId],
            location: kase.systemId,
            // The press can mock a right culprit named for the wrong reason.
            facts: { ...pressFacts(world, kase), kind: kase.kindPhrase, accusedBy: accuserName, proved: true, motive: motive ? motiveLabel(motive) : null, motiveRight: motive ? motiveRight : null },
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
        const why = !motive ? ''
            : motiveRight ? ` And we named the reason: ${motiveLabel(motive).toLowerCase()}.`
                : ' But our theory of why was wrong, and the press is enjoying it.';
        return { ok: true, verdict: 'correct', message: `The evidence held. ${accusedName} is exposed.${why}` };
    }

    try { shiftRivalry(world, factionId, suspectId, FALSE_ACCUSATION_RIVALRY_JUMP, 'false_accusation', kase.kindPhrase); } catch { /* minimal worlds */ }
    try { ReputationService.updateScore(world, factionId, { reliability: -4 }, 'false_accusation'); } catch { /* no ledger */ }
    if (actor) updateInfiltration(world, actor, factionId, FALSE_ACCUSATION_ACTOR_INFILTRATION);
    chronicle.record(world, {
        type: 'investigation_published',
        actorIds: [factionId],
        targetIds: [suspectId],
        location: kase.systemId,
        facts: { ...pressFacts(world, kase), kind: kase.kindPhrase, accusation: true, proved: false },
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
    if (suspectId === HOMEGROWN) return { ok: false, message: 'There is nobody to name: to call it homegrown, close the file with an accusation instead.' };

    kase.status = 'leaked';
    kase.lead = null;
    kase.accusedFactionId = suspectId;
    kase.closedAt = world.nowSeconds;
    // The leak is OUR act (actorIds); what it alleges is a suspicion the press
    // can print but not prove.
    chronicle.record(world, {
        type: 'investigation_published',
        actorIds: [factionId],
        targetIds: [suspectId],
        location: kase.systemId,
        facts: { ...pressFacts(world, kase), kind: kase.kindPhrase, leaked: true },
        attribution: `suspected:${suspectId}`,
    });
    return { ok: true, message: `The story is with the press. It names ${labelFor(suspectId)}.` };
}

// ─── The mole ────────────────────────────────────────────────────────────────

/** Chance per hour, at full counter-intelligence strength, of outing one mole. */
export const MOLE_DETECT_PER_HOUR_AT_FULL_CI = 0.01;
/** A mole leaks each open file at most this often (sim seconds). */
export const MOLE_LEAK_INTERVAL_SECONDS = 24 * 3600;
export const MOLE_REPORT_DOMAIN = 'mole';

function isActiveMole(agent: SpyAgent): boolean {
    return agent.traitIds.includes('compromised') && !agent.compromiseKnown
        && agent.status !== 'burned' && agent.status !== 'captured' && agent.status !== 'turned';
}

/**
 * A compromised agent in an empire's own service feeds its case files to the
 * people the files are about: the sponsor of each open case learns how close
 * the investigation is. The owner's counter-intelligence can out the mole, at
 * which point the leaking stops and the owner finally sees the trait.
 */
export function tickMoles(world: GameWorldState, cases: Map<string, CovertCase>, deltaSeconds: number): void {
    const now = world.nowSeconds;
    const hours = Math.max(0, deltaSeconds) / 3600;
    const molesByOwner = new Map<string, SpyAgent[]>();
    for (const agent of world.espionage.agents.values()) {
        if (!isActiveMole(agent)) continue;
        if (!molesByOwner.has(agent.ownerFactionId)) molesByOwner.set(agent.ownerFactionId, []);
        molesByOwner.get(agent.ownerFactionId)!.push(agent);
    }
    if (molesByOwner.size === 0) return;

    // Outing: the owner's counter-intelligence finds them.
    for (const [owner, moles] of molesByOwner) {
        const ci = world.espionage.factionIntel.get(owner)?.counterIntelStrength ?? 0;
        const chance = MOLE_DETECT_PER_HOUR_AT_FULL_CI * (ci / 100) * hours;
        for (const mole of moles) {
            if (chance <= 0 || Math.random() >= chance) continue;
            mole.compromiseKnown = true;
            if (isPlayerRun(world, owner)) {
                fireNotification({
                    id: `mole-found-${mole.id}-${now}`, factionId: owner, category: 'espionage', priority: 'urgent',
                    title: 'MOLE FOUND',
                    body: `${mole.codename} has been feeding our case files to a foreign service. They are compromised; whatever they touched, assume it was read.`,
                    createdAt: new Date(now * 1000).toISOString(), read: false, linkToTab: 'intelligence',
                });
            }
        }
    }

    // Leaking: each open file goes to the sponsor it is about.
    for (const kase of cases.values()) {
        if (kase.status !== 'open' || !kase.actorFactionId) continue;
        const moles = (molesByOwner.get(kase.ownerFactionId) ?? []).filter(isActiveMole);
        if (moles.length === 0) continue;
        if (kase.moleLeakedAt != null && now - kase.moleLeakedAt < MOLE_LEAK_INTERVAL_SECONDS) continue;
        kase.moleLeakedAt = now;
        const sponsor = kase.actorFactionId;
        if (!isPlayerRun(world, sponsor)) continue;
        const naming = kase.clues.filter(c => c.pointsAt.includes(sponsor)).length;
        const press = kase.clues.find(c => c.source === 'press')?.pointsAt[0];
        const body = `Our asset inside ${labelFor(kase.ownerFactionId)}'s service reports on their file "${kase.title}": `
            + `${kase.clues.length} finding${kase.clues.length === 1 ? '' : 's'} so far, ${naming} of them naming us.`
            + (press ? ` Their press is pointing at ${labelFor(press)}.` : '');
        world.espionage.reports.set(`mole-${kase.id}-${now}`, {
            id: `mole-${kase.id}-${now}`,
            ownerFactionId: sponsor,
            targetFactionId: kase.ownerFactionId,
            domain: MOLE_REPORT_DOMAIN,
            title: `Their investigation: ${kase.title}`,
            body,
            confidence: 1,
            accurate: true,
            createdAt: now,
            expiresAt: now + 7 * 24 * 3600,
        });
    }
}

// ─── AI tradecraft (item 12c) ────────────────────────────────────────────────

/** Chance an AI service hires a foreign face for an operation. */
export const AI_FOREIGN_FACE_CHANCE = 0.25;

/**
 * The face an AI operation shows a witness: usually the sponsor's own species,
 * sometimes a hired foreigner's. AI services run operations without agents, so
 * without this their operations left no species trace at all.
 */
export function aiOperativeSpecies(world: GameWorldState, actorId: string, rand: () => number = Math.random): string | null {
    const factions = world.economy?.factions;
    const own = speciesOf(factions?.get?.(actorId) as any);
    if (rand() >= AI_FOREIGN_FACE_CHANCE) return own;
    const others = [...new Set([...(factions?.values?.() ?? [])].map((f: any) => f?.civilizationId).filter((s: any) => s && s !== own))] as string[];
    return others.length ? others[Math.floor(rand() * others.length)] : own;
}

/**
 * Who an AI dresses a false flag up as: the empire the victim already hates
 * most, so the frame fits. Never the sponsor or the victim.
 */
export function aiFrameFor(world: GameWorldState, actorId: string, targetId: string): string | null {
    const candidates = [...(world.economy?.factions?.keys?.() ?? [])]
        .filter(id => id !== actorId && id !== targetId && !NON_PLAYABLE.has(id));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => rivalryScore(world, targetId, b) - rivalryScore(world, targetId, a));
    return candidates[0];
}

/**
 * What the narrator's investigation and scandal templates read (lib/narrative/
 * prose/template-writer.ts): a subject line and how documented the case is.
 * Names only what the file shows: the incident and its victim, never the sponsor.
 */
export function pressFacts(world: GameWorldState, kase: CovertCase): { subject: string; evidence: number; obstructions: number } {
    return {
        subject: `${kase.kindPhrase.replace(/^an? /, 'the ')} against ${labelFor(kase.ownerFactionId)} at ${systemName(world, kase.systemId)}`,
        evidence: Math.min(90, kase.clues.length * 15 + (kase.leadsRun ?? 0) * 10),
        obstructions: 0,
    };
}

// ─── Rebel cells' files (Item 13b) ───────────────────────────────────────────

/**
 * Close a cell's file as homegrown: no foreign hand. Right when nobody was
 * paying the cell; wrong when somebody was, and the sponsor goes on unseen.
 * No empire is accused, so nobody is insulted either way.
 */
function closeAsHomegrown(world: GameWorldState, kase: CovertCase, motive: string | null): CaseActionResult {
    const now = world.nowSeconds;
    const right = kase.actorFactionId === HOMEGROWN;
    kase.status = 'accused';
    kase.accusedFactionId = HOMEGROWN;
    kase.verdict = right ? 'correct' : 'wrong';
    kase.closedAt = now;
    kase.lead = null;
    kase.theoryMotive = motive;
    kase.motiveVerdict = right && motive ? (motive === kase.trueMotive ? 'right' : 'wrong') : null;
    if (right) {
        const intel = getOrCreateFactionIntel(world, kase.ownerFactionId);
        intel.intelPoints = Math.min(1000, intel.intelPoints + 10);
        return { ok: true, verdict: 'correct', message: 'Nobody paid them. The cell acted on its own grievance, and the file can say so.' };
    }
    // The sponsor goes on unseen and a little bolder.
    if (kase.actorFactionId) updateInfiltration(world, kase.actorFactionId, kase.ownerFactionId, 5);
    return { ok: true, verdict: 'wrong', message: 'We called it homegrown. Somebody was paying them, and still is.' };
}
