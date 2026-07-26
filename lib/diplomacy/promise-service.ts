// lib/diplomacy/promise-service.ts
// Stars of Dominion — Diplomacy Phase 5: promises as enforceable objects (§13-14).
//
// WORKER-SIDE ONLY. A promise is a timed commitment judged automatically:
//   - deliver_credits: pledge N credits before the deadline; fulfilled only by
//     an explicit DIP_FULFILL_PROMISE (which transfers the money), broken when
//     the deadline lapses.
//   - non_aggression: pledge no act of war against the beneficiary until the
//     deadline; broken instantly by any act of war, fulfilled at expiry.
// Kept promises build reliability and ease tension. Broken ones brand you,
// hand the beneficiary leverage, dent your public trust, and make headlines.

import type { GameWorldState } from '@/lib/game-world-state';
import { ReputationService } from '@/lib/reputation/reputation-service';
import {
    DiplomaticPromise,
    PromiseKind,
    PROMISE_MIN_DURATION_SECONDS,
    PROMISE_MAX_DURATION_SECONDS,
    PROMISE_RETENTION_SECONDS,
} from './diplomacy-types';
import { ensureDiplomacyState, shiftRivalry, isAtWar } from './offer-service';
import type { DiplomacyResult } from './offer-service';
import { addLeverage } from './gambit-service';
import { pushWorldStory, adjustPublicTrust } from '@/lib/press-system/integration';
import { StorySource, StoryTruth } from '@/lib/press-system/types';

const ok = (message: string): DiplomacyResult => ({ success: true, message });
const fail = (message: string): DiplomacyResult => ({ success: false, message });

export interface MakePromiseParams {
    kind: PromiseKind;
    beneficiaryId: string;
    amount?: number;
    durationSeconds?: number;
}

export function makePromise(world: GameWorldState, promiserId: string, params: MakePromiseParams): DiplomacyResult {
    const dip = ensureDiplomacyState(world);
    const { kind, beneficiaryId } = params;

    if (!beneficiaryId || beneficiaryId === promiserId) return fail('Invalid promise beneficiary.');
    if (!world.economy.factions.has(beneficiaryId)) return fail('Beneficiary has no functioning government.');
    if (kind !== 'deliver_credits' && kind !== 'non_aggression') return fail('Unknown promise kind.');
    if (kind === 'non_aggression' && isAtWar(world, promiserId, beneficiaryId)) {
        return fail('You are already at war — that promise would be worthless.');
    }
    if (kind === 'deliver_credits') {
        const amt = Math.floor(Number(params.amount));
        if (!Number.isFinite(amt) || amt <= 0) return fail('Pledge a positive credit amount.');
        params.amount = Math.min(100_000, amt);
    }
    for (const p of dip.promises.values()) {
        if (p.status === 'active' && p.promiserId === promiserId && p.beneficiaryId === beneficiaryId && p.kind === kind) {
            return fail('An identical promise is already outstanding.');
        }
    }

    const duration = Math.max(PROMISE_MIN_DURATION_SECONDS,
        Math.min(PROMISE_MAX_DURATION_SECONDS, Math.floor(Number(params.durationSeconds) || 48 * 3600)));

    const promise: DiplomaticPromise = {
        id: `promise-${promiserId}-${beneficiaryId}-${kind}-${world.nowSeconds}`,
        promiserId,
        beneficiaryId,
        kind,
        amount: params.amount,
        madeAtSeconds: world.nowSeconds,
        deadlineSeconds: world.nowSeconds + duration,
        status: 'active',
    };
    dip.promises.set(promise.id, promise);
    // A public pledge eases tension a little on its own — words matter,
    // until they don't.
    shiftRivalry(world, promiserId, beneficiaryId, -3, 'promise_made', kind);
    return ok('Promise recorded — the galaxy will judge it at the deadline.');
}

export function fulfillPromise(world: GameWorldState, factionId: string, promiseId: string): DiplomacyResult {
    const dip = ensureDiplomacyState(world);
    const promise = dip.promises.get(promiseId);
    if (!promise) return fail('Promise not found.');
    if (promise.promiserId !== factionId) return fail('That is not your promise to fulfill.');
    if (promise.status !== 'active') return fail('That promise has already been judged.');
    if (promise.kind !== 'deliver_credits') return fail('That promise is judged by time, not by payment.');

    const from = world.economy.factions.get(factionId)?.reserves;
    const to = world.economy.factions.get(promise.beneficiaryId)?.reserves;
    const amount = promise.amount ?? 0;
    if (!from || (from.CREDITS ?? 0) < amount) return fail(`Fulfilling requires ${amount} credits on hand.`);
    from.CREDITS = (from.CREDITS ?? 0) - amount;
    if (to) to.CREDITS = (to.CREDITS ?? 0) + amount;

    judgeFulfilled(world, promise);
    return ok(`Promise fulfilled — ${amount} credits delivered.`);
}

function judgeFulfilled(world: GameWorldState, promise: DiplomaticPromise): void {
    promise.status = 'fulfilled';
    promise.resolvedAtSeconds = world.nowSeconds;
    ReputationService.updateScore(world, promise.promiserId, { reliability: 8, honor: 4 }, `kept_${promise.kind}`);
    shiftRivalry(world, promise.promiserId, promise.beneficiaryId, -5, 'promise_kept', promise.kind);
    adjustPublicTrust(world, promise.promiserId, 2);
    console.log(`[Diplomacy] ${promise.promiserId} KEPT promise ${promise.kind} to ${promise.beneficiaryId}`);
}

function judgeBroken(world: GameWorldState, promise: DiplomaticPromise, cause: string): void {
    promise.status = 'broken';
    promise.resolvedAtSeconds = world.nowSeconds;
    ReputationService.updateScore(world, promise.promiserId, { reliability: -15, honor: -8 }, `broke_${promise.kind}`);
    shiftRivalry(world, promise.promiserId, promise.beneficiaryId, 10, 'promise_broken', cause);
    addLeverage(world, promise.beneficiaryId, promise.promiserId, 3);
    adjustPublicTrust(world, promise.promiserId, -4);
    pushWorldStory(world, {
        targetEmpireId: promise.promiserId,
        subject: `Broken promise: ${promise.kind === 'deliver_credits' ? 'pledged aid never arrived' : 'non-aggression pledge betrayed'}`,
        magnitude: 45,
        source: StorySource.RUMOR_MILL,
        truth: StoryTruth.TRUE,
    });
    console.log(`[Diplomacy] ${promise.promiserId} BROKE promise ${promise.kind} to ${promise.beneficiaryId} (${cause})`);
}

/**
 * Called from registerActOfWar: an act of war instantly breaks any active
 * non-aggression promise the aggressor made to the defender.
 */
export function breakNonAggressionPromises(world: GameWorldState, aggressorId: string, defenderId: string): void {
    const dip = ensureDiplomacyState(world);
    for (const promise of dip.promises.values()) {
        if (promise.status === 'active'
            && promise.kind === 'non_aggression'
            && promise.promiserId === aggressorId
            && promise.beneficiaryId === defenderId) {
            judgeBroken(world, promise, 'act_of_war');
        }
    }
}

/** Deadline judgment + pruning. Called each strategic tick. */
export function tickPromises(world: GameWorldState): void {
    const dip = ensureDiplomacyState(world);
    for (const promise of dip.promises.values()) {
        if (promise.status !== 'active' || world.nowSeconds < promise.deadlineSeconds) continue;
        if (promise.kind === 'deliver_credits') {
            judgeBroken(world, promise, 'deadline_lapsed'); // never paid
        } else {
            judgeFulfilled(world, promise); // survived the full duration in peace
        }
    }
    for (const [id, promise] of [...dip.promises.entries()]) {
        if (promise.status !== 'active'
            && world.nowSeconds - (promise.resolvedAtSeconds ?? promise.deadlineSeconds) > PROMISE_RETENTION_SECONDS) {
            dip.promises.delete(id);
        }
    }
}
