// lib/delegation/advisor-proposals.ts
// Stars of Dominion — the veto feed: what the advisors want to do and did.
//
// The AI deciders already know how to run an empire. For a HUMAN faction they
// are advisors: the routine they run themselves (lib/delegation, the systems
// the player has delegated), and the ambitious — a war, a peace, a battle
// group — they PROPOSE. A proposal is a pre-filled order: the player's Approve
// sends it through executeOrder, so the tech gate, the rite gates, the
// political-capital price and the treasury all apply exactly as if they had
// clicked it in a panel. Decline drops it (and the same advice is not repeated
// for a while); Always drops it into the auto list, and from then on that
// order runs without asking. Unanswered proposals expire and are dropped —
// absence may slow an empire, it must never start its wars.
//
// Three rules:
//  1. Nothing here executes anything. The worker (ADV_RESOLVE_PROPOSAL) and
//     the drain of the AI order outbox do; this file only keeps the books.
//  2. An AI-run faction never gets a proposal: `adviseOrder` queues straight
//     to the outbox for it, so every decider keeps one call site.
//  3. The record rides the owner's faction shard (save-service), like the
//     delegation settings: it is their desk, not public knowledge.

import type { DelegatedSystem } from './delegation-types';
import { queueAdvisorOrder, queueAIOrder, type AIOrder } from '@/lib/ai/ai-orders';
import { isAIRunFaction } from '@/lib/ai/belt-ambush-ai';

export interface AdvisorProposal {
    id: string;
    factionId: string;
    /** Which desk is asking — the brief groups and labels by it. */
    system: DelegatedSystem;
    actionId: string;
    payload: Record<string, unknown>;
    /** One line, in the advisor's voice: what and why. */
    title: string;
    detail: string;
    /** Decline hides the same advice (same `topic`) for `declineCooldownSeconds`. */
    topic: string;
    /**
     * A named server-side recipe the worker runs INSTEAD of a bare
     * executeOrder on approval — for advice that is a chain of orders
     * (a battle group is MIL_BUILD_FLEET plus one recruit per hull class).
     * The actionId/payload stay what the brief shows and prices.
     */
    replay?: string;
    createdAtSeconds: number;
    expiresAtSeconds: number;
}

export type AdvisorOutcome = 'ran' | 'approved' | 'declined' | 'expired' | 'always';

/** What the advisors did, for the brief's "Your advisors" ledger. */
export interface AdvisorLedgerEntry {
    id: string;
    atSeconds: number;
    system: DelegatedSystem;
    actionId: string;
    title: string;
    outcome: AdvisorOutcome;
}

export interface AdvisorRecord {
    proposals: AdvisorProposal[];
    /** Action ids the player answered Always to: they run without asking. */
    autoApprove: string[];
    /** topic → sim seconds until which that advice is not repeated. */
    declinedUntil: Record<string, number>;
    ledger: AdvisorLedgerEntry[];
}

/** How long a proposal waits for an answer (sim seconds): two sim days. */
export const PROPOSAL_TTL_SECONDS = 2 * 86400;
/** Declined advice stays quiet this long (sim seconds). */
export const DECLINE_COOLDOWN_SECONDS = 5 * 86400;
/** A desk never has more than this many open questions. */
export const MAX_OPEN_PROPOSALS = 6;
const MAX_LEDGER = 24;

type WorldLike = { advisors?: Map<string, AdvisorRecord>; nowSeconds: number } & Record<string, any>;

export function advisorRecordFor(world: WorldLike, factionId: string): AdvisorRecord {
    if (!world.advisors) world.advisors = new Map();
    let rec = world.advisors.get(factionId);
    if (!rec) {
        rec = { proposals: [], autoApprove: [], declinedUntil: {}, ledger: [] };
        world.advisors.set(factionId, rec);
    }
    // A record written before a field existed still answers for it.
    rec.proposals ??= [];
    rec.autoApprove ??= [];
    rec.declinedUntil ??= {};
    rec.ledger ??= [];
    return rec;
}

/** Read-only: the open proposals, soonest to expire first. Never creates a record. */
export function openProposals(world: WorldLike, factionId: string): AdvisorProposal[] {
    const rec = world.advisors?.get?.(factionId);
    if (!rec?.proposals?.length) return [];
    return [...rec.proposals].sort((a, b) => a.expiresAtSeconds - b.expiresAtSeconds);
}

/** Read-only: the ledger, newest first. */
export function advisorLedger(world: WorldLike, factionId: string): AdvisorLedgerEntry[] {
    const rec = world.advisors?.get?.(factionId);
    return rec?.ledger ? [...rec.ledger].reverse() : [];
}

export function isAutoApproved(world: WorldLike, factionId: string, actionId: string): boolean {
    return Boolean(world.advisors?.get?.(factionId)?.autoApprove?.includes(actionId));
}

function log(rec: AdvisorRecord, world: WorldLike, entry: Omit<AdvisorLedgerEntry, 'id' | 'atSeconds'>): void {
    rec.ledger.push({
        id: `adv-${world.nowSeconds}-${entry.actionId}-${rec.ledger.length}`,
        atSeconds: world.nowSeconds,
        ...entry,
    });
    if (rec.ledger.length > MAX_LEDGER) rec.ledger.splice(0, rec.ledger.length - MAX_LEDGER);
}

export interface AdviceInput extends AIOrder {
    system: DelegatedSystem;
    title: string;
    detail: string;
    /** Defaults to actionId + the payload's first value: "DIP_DECLARE_WAR:faction-x". */
    topic?: string;
    ttlSeconds?: number;
    replay?: string;
}

export type AdviceResult = 'queued' | 'proposed' | 'quiet' | 'dropped';

/**
 * One call for every decider that may be speaking for a human.
 *  - AI-run faction: queued to the outbox, exactly as queueAIOrder.
 *  - Human faction, action on the Always list: queued to the outbox as an
 *    advisor order (drained like the AI's, logged to the ledger).
 *  - Human faction otherwise: a proposal for the brief. 'quiet' when the same
 *    topic was declined recently or is already open; 'dropped' when the desk
 *    is full or the faction is unknown.
 */
export function adviseOrder(world: WorldLike, advice: AdviceInput): AdviceResult {
    const { system, title, detail, topic: topicIn, ttlSeconds, replay, ...order } = advice;
    const claimed = world.claimedFactionIds;
    if (!Array.isArray(claimed)) return 'dropped';
    if (isAIRunFaction(world as any, order.factionId)) {
        return queueAIOrder(world, order) ? 'queued' : 'dropped';
    }
    if (!claimed.includes(order.factionId)) return 'dropped';

    const rec = advisorRecordFor(world, order.factionId);
    const topic = topicIn ?? defaultTopic(order.actionId, order.payload);

    if (rec.autoApprove.includes(order.actionId)) {
        const onDone = order.onDone;
        const queued = queueAdvisorOrder(world, {
            ...order,
            onDone: (w: any) => {
                log(advisorRecordFor(w, order.factionId), w, { system, actionId: order.actionId, title, outcome: 'ran' });
                onDone?.(w);
            },
        });
        return queued ? 'queued' : 'dropped';
    }

    const until = rec.declinedUntil[topic];
    if (until !== undefined && until > world.nowSeconds) return 'quiet';
    if (rec.proposals.some(p => p.topic === topic)) return 'quiet';
    if (rec.proposals.length >= MAX_OPEN_PROPOSALS) return 'dropped';

    rec.proposals.push({
        id: `prop-${order.factionId}-${world.nowSeconds}-${rec.proposals.length}-${Math.random().toString(36).slice(2, 6)}`,
        factionId: order.factionId,
        system,
        actionId: order.actionId,
        payload: (order.payload ?? {}) as Record<string, unknown>,
        title,
        detail,
        topic,
        ...(replay ? { replay } : {}),
        createdAtSeconds: world.nowSeconds,
        expiresAtSeconds: world.nowSeconds + (ttlSeconds ?? PROPOSAL_TTL_SECONDS),
    });
    return 'proposed';
}

function defaultTopic(actionId: string, payload: any): string {
    const first = payload && typeof payload === 'object' ? Object.values(payload)[0] : undefined;
    return first === undefined ? actionId : `${actionId}:${String(first)}`;
}

export type ProposalDecision = 'approve' | 'decline' | 'always';

export interface ResolvedProposal {
    proposal: AdvisorProposal;
    /** True when the caller should now execute the proposal's order. */
    execute: boolean;
}

/**
 * The player's answer. Removes the proposal and books it; the WORKER executes
 * the order when `execute` is true (and should call `bookExecuted` after).
 * Null when no such proposal is open.
 */
export function resolveProposal(world: WorldLike, factionId: string, proposalId: string, decision: ProposalDecision): ResolvedProposal | null {
    const rec = world.advisors?.get?.(factionId);
    if (!rec) return null;
    const at = rec.proposals.findIndex(p => p.id === proposalId);
    if (at < 0) return null;
    const [proposal] = rec.proposals.splice(at, 1);

    if (decision === 'decline') {
        rec.declinedUntil[proposal.topic] = world.nowSeconds + DECLINE_COOLDOWN_SECONDS;
        log(rec, world, { system: proposal.system, actionId: proposal.actionId, title: proposal.title, outcome: 'declined' });
        return { proposal, execute: false };
    }
    if (decision === 'always' && !rec.autoApprove.includes(proposal.actionId)) {
        rec.autoApprove.push(proposal.actionId);
        // The same advice open twice (another target) runs too, under the new rule.
    }
    log(rec, world, {
        system: proposal.system, actionId: proposal.actionId, title: proposal.title,
        outcome: decision === 'always' ? 'always' : 'approved',
    });
    return { proposal, execute: true };
}

/** Take an action off the Always list. */
export function revokeAutoApprove(world: WorldLike, factionId: string, actionId: string): void {
    const rec = world.advisors?.get?.(factionId);
    if (!rec) return;
    rec.autoApprove = rec.autoApprove.filter(id => id !== actionId);
}

/** Drop what nobody answered. Once per strategic tick. Returns how many. */
export function expireProposals(world: WorldLike): number {
    let n = 0;
    for (const [factionId, rec] of world.advisors?.entries?.() ?? []) {
        if (!rec?.proposals?.length) continue;
        const keep: AdvisorProposal[] = [];
        for (const p of rec.proposals) {
            if (p.expiresAtSeconds > world.nowSeconds) { keep.push(p); continue; }
            log(rec, world, { system: p.system, actionId: p.actionId, title: p.title, outcome: 'expired' });
            n++;
        }
        rec.proposals = keep;
        // Cooldowns that have passed are just clutter in the shard.
        for (const [topic, until] of Object.entries(rec.declinedUntil ?? {})) {
            if (until <= world.nowSeconds) delete rec.declinedUntil[topic];
        }
        void factionId;
    }
    return n;
}
