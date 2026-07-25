// lib/diplomacy/gambit-service.ts
// Stars of Dominion — Diplomacy Phase 2: gambits (prediction duels).
//
// WORKER-SIDE ONLY, same contract as offer-service: mutate GameWorldState in
// place, called from DIP_* order handlers and the strategic tick.
//
// Core loop (design doc §2/§4): initiator launches a pressure action and
// secretly predicts the target's response. Correct prediction amplifies the
// initiator's gains (×1.35); a miss hands the defender a bonus (×1.2 vs ×0.8)
// — the same philosophy as combat crises in lib/time/auto-resolve.ts.

import type { GameWorldState } from '@/lib/game-world-state';
import { ReputationService } from '@/lib/reputation/reputation-service';
import {
    DiplomaticGambit,
    GambitKind,
    GambitResponse,
    GAMBIT_TTL_SECONDS,
    GAMBIT_COOLDOWN_SECONDS,
    GAMBIT_RETENTION_SECONDS,
    GAMBIT_STAGE_GATES,
    GAMBIT_RESPONSES,
    PREDICTION_MATCH_BONUS,
    PREDICTION_MISS_PENALTY,
} from './diplomacy-types';
import { ensureDiplomacyState, getOrCreateRivalry, shiftRivalry, isAtWar } from './offer-service';
import type { DiplomacyResult } from './offer-service';

const ok = (message: string): DiplomacyResult => ({ success: true, message });
const fail = (message: string): DiplomacyResult => ({ success: false, message });

// ─── Leverage ────────────────────────────────────────────────────────────────

export function addLeverage(world: GameWorldState, holderId: string, overId: string, points: number): void {
    if (points <= 0) return;
    const dip = ensureDiplomacyState(world);
    const key = `${holderId}|${overId}`;
    dip.leverage.set(key, (dip.leverage.get(key) ?? 0) + points);
}

export function getLeverage(world: GameWorldState, holderId: string, overId: string): number {
    return ensureDiplomacyState(world).leverage.get(`${holderId}|${overId}`) ?? 0;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Rough military weight: summed basePower (falls back to strength) of a faction's fleets. */
export function factionFleetPower(world: GameWorldState, factionId: string): number {
    let total = 0;
    for (const fleet of world.movement.fleets.values()) {
        if (fleet.factionId !== factionId) continue;
        total += Number((fleet as any).basePower ?? (fleet as any).strength ?? 0) || 0;
    }
    return total;
}

/**
 * Does the evidence actually support "you spied on me"? True when any of the
 * target's operations against the accuser reached suspected/exposed
 * attribution, or an attribution record fingers them.
 */
function accusationHasEvidence(world: GameWorldState, accuserId: string, accusedId: string): boolean {
    for (const op of world.espionage.operations.values()) {
        if (op.actorFactionId === accusedId
            && (op as any).targetFactionId === accuserId
            && (op.attributionState === 'suspected' || op.attributionState === 'exposed')) {
            return true;
        }
    }
    for (const rec of world.espionage.attributionRecords) {
        if (rec.suspectedFactionId === accusedId
            && (rec.attributionState === 'suspected' || rec.attributionState === 'exposed')) {
            return true;
        }
    }
    return false;
}

/**
 * Doctrine-flavored default response for unanswered gambits, derived from the
 * target's empire posture stance (same signal auto-resolve.ts uses for combat
 * crises — no JSON config dependency, safe in the worker).
 */
export function pickAutoResponse(world: GameWorldState, gambit: DiplomaticGambit): GambitResponse {
    // EmpirePosture stores its stance in `current` (Militarist/Mercantile/...);
    // society tags add flavor (shadow societies stall and deny).
    const posture = world.movement.empirePostures.get(gambit.targetId) as any;
    const stance = String(posture?.current ?? posture?.stance ?? '').toLowerCase();
    const tags: string[] = posture?.society_tags ?? [];
    const bias: 'aggressive' | 'cooperative' | 'deceptive' | 'isolationist' | 'default' =
        tags.some(t => /shadow|information|covert/.test(t)) ? 'deceptive'
        : /militar|aggress|expansion/.test(stance) ? 'aggressive'
        : /pacif|mercantile|diplomat|economic|trade/.test(stance) ? 'cooperative'
        : /consolidat|isolation/.test(stance) ? 'isolationist'
        : 'default';

    switch (gambit.kind) {
        case 'ultimatum': {
            if (bias === 'aggressive') return 'reject';
            if (bias === 'deceptive' || bias === 'isolationist') return 'stall';
            // Cooperative/default: pay small demands, refuse extortion.
            const treasury = Number(world.economy.factions.get(gambit.targetId)?.reserves?.CREDITS ?? 0);
            return (gambit.demandCredits ?? 0) <= treasury * 0.05 ? 'concede' : 'reject';
        }
        case 'espionage_accusation':
            // Only a cooperative government owns up, and only when caught.
            return bias === 'cooperative' && gambit.accusationTrue ? 'admit' : 'deny';
        case 'show_of_force':
            if (bias === 'aggressive') return 'defy';
            if (bias === 'isolationist' || bias === 'cooperative') return 'submit';
            return gambit.initiatorStronger ? 'submit' : 'defy';
    }
}

// ─── Launch ──────────────────────────────────────────────────────────────────

export interface LaunchGambitParams {
    kind: GambitKind;
    targetId: string;
    prediction?: GambitResponse;
    demandCredits?: number;
}

export function launchGambit(world: GameWorldState, initiatorId: string, params: LaunchGambitParams): DiplomacyResult {
    const dip = ensureDiplomacyState(world);
    const { kind, targetId } = params;

    if (!targetId || targetId === initiatorId) return fail('Invalid gambit target.');
    if (!world.economy?.factions?.has?.(targetId)) return fail('Target faction has no functioning government.');
    if (!GAMBIT_RESPONSES[kind]) return fail('Unknown gambit.');
    if (isAtWar(world, initiatorId, targetId)) return fail('You are at war — gambits are peacetime pressure tools.');

    const rivalry = getOrCreateRivalry(world, initiatorId, targetId);
    const gate = GAMBIT_STAGE_GATES[kind];
    if ((rivalry.escalationLevel ?? 0) < gate) {
        return fail(`Not enough tension for that move — requires escalation level ${gate}.`);
    }

    if (params.prediction && !GAMBIT_RESPONSES[kind].includes(params.prediction)) {
        return fail('That prediction is not a possible response to this gambit.');
    }

    if (kind === 'ultimatum') {
        const amt = Math.floor(Number(params.demandCredits));
        if (!Number.isFinite(amt) || amt <= 0) return fail('Ultimatum needs a positive credit demand.');
        params.demandCredits = Math.min(50_000, amt);
    }

    for (const g of dip.gambits.values()) {
        if (g.status === 'pending' && g.initiatorId === initiatorId && g.targetId === targetId) {
            return fail('You already have a gambit awaiting their answer.');
        }
    }
    const cooldownKey = `gambit|${initiatorId}|${targetId}`;
    const lockedUntil = dip.cooldowns.get(cooldownKey) ?? 0;
    if (world.nowSeconds < lockedUntil) {
        const hours = Math.ceil((lockedUntil - world.nowSeconds) / 3600);
        return fail(`Their court will not entertain another gambit yet (~${hours}h).`);
    }

    const gambit: DiplomaticGambit = {
        id: `gambit-${initiatorId}-${targetId}-${world.nowSeconds}`,
        kind,
        initiatorId,
        targetId,
        prediction: params.prediction,
        demandCredits: params.demandCredits,
        createdAtSeconds: world.nowSeconds,
        respondBySeconds: world.nowSeconds + GAMBIT_TTL_SECONDS,
        status: 'pending',
    };
    // Facts frozen at launch so the resolution can't be gamed by later moves.
    if (kind === 'espionage_accusation') {
        gambit.accusationTrue = accusationHasEvidence(world, initiatorId, targetId);
    }
    if (kind === 'show_of_force') {
        gambit.initiatorStronger = factionFleetPower(world, initiatorId) > factionFleetPower(world, targetId);
        // Rattling sabers is itself provocative.
        shiftRivalry(world, initiatorId, targetId, 4, 'show_of_force_launched');
    }
    dip.gambits.set(gambit.id, gambit);
    return ok('Gambit delivered — awaiting their move.');
}

// ─── Respond / resolve ───────────────────────────────────────────────────────

export function respondToGambit(world: GameWorldState, responderId: string, gambitId: string, response: GambitResponse): DiplomacyResult {
    const dip = ensureDiplomacyState(world);
    const gambit = dip.gambits.get(gambitId);
    if (!gambit) return fail('Gambit not found.');
    if (gambit.targetId !== responderId) return fail('This gambit was not aimed at you.');
    if (gambit.status !== 'pending') return fail('That confrontation is already settled.');
    if (!GAMBIT_RESPONSES[gambit.kind].includes(response)) return fail('Not a possible response to this gambit.');

    resolveGambit(world, gambit, response, false);
    return ok(`You chose to ${response}.`);
}

function resolveGambit(world: GameWorldState, gambit: DiplomaticGambit, response: GambitResponse, autoResolved: boolean): void {
    const dip = ensureDiplomacyState(world);
    const { initiatorId: init, targetId: tgt } = gambit;

    gambit.status = 'resolved';
    gambit.response = response;
    gambit.autoResolved = autoResolved;
    gambit.resolvedAtSeconds = world.nowSeconds;
    gambit.predictionMatched = gambit.prediction != null && gambit.prediction === response;
    dip.cooldowns.set(`gambit|${init}|${tgt}`, world.nowSeconds + GAMBIT_COOLDOWN_SECONDS);

    // Prediction layer: reading your opponent is worth real advantage.
    const initMult = gambit.predictionMatched ? PREDICTION_MATCH_BONUS
        : gambit.prediction != null ? PREDICTION_MISS_PENALTY : 1.0;
    const tgtMult = (gambit.prediction != null && !gambit.predictionMatched) ? 1.2 : 1.0;
    const initGain = (pts: number) => addLeverage(world, init, tgt, Math.round(pts * initMult));
    const tgtGain = (pts: number) => addLeverage(world, tgt, init, Math.round(pts * tgtMult));

    switch (gambit.kind) {
        case 'ultimatum': {
            if (response === 'concede') {
                const initEcon = world.economy.factions.get(init)?.reserves;
                const tgtEcon = world.economy.factions.get(tgt)?.reserves;
                const paid = Math.min(gambit.demandCredits ?? 0, Number(tgtEcon?.CREDITS ?? 0));
                if (tgtEcon) tgtEcon.CREDITS = (tgtEcon.CREDITS ?? 0) - paid;
                if (initEcon) initEcon.CREDITS = (initEcon.CREDITS ?? 0) + paid;
                shiftRivalry(world, init, tgt, -8, 'ultimatum_conceded', `${paid} credits`);
                initGain(2);
                ReputationService.updateScore(world, init, { oppression: 4 }, 'ultimatum_extracted');
                gambit.outcome = `They yielded — ${paid} credits changed hands.`;
            } else if (response === 'reject') {
                shiftRivalry(world, init, tgt, 12, 'ultimatum_rejected');
                if (gambit.predictionMatched) initGain(2); // saw it coming, forces ready
                else tgtGain(1);
                gambit.outcome = 'They refused. The standoff hardens.';
            } else { // stall
                shiftRivalry(world, init, tgt, 4, 'ultimatum_stalled');
                if (gambit.predictionMatched) initGain(1);
                gambit.outcome = 'They played for time.';
            }
            break;
        }
        case 'espionage_accusation': {
            const caught = gambit.accusationTrue === true;
            if (response === 'admit') {
                shiftRivalry(world, init, tgt, 4, 'accusation_admitted');
                ReputationService.updateScore(world, tgt, { deception: 5, honor: 2 }, 'admitted_espionage');
                initGain(3);
                gambit.outcome = 'They admitted it publicly. A rare concession.';
            } else if (caught) {
                // Denied, but the evidence stands — the lie compounds the crime.
                shiftRivalry(world, init, tgt, 8, 'accusation_proved');
                ReputationService.updateScore(world, tgt, { deception: 10, honor: -4 }, 'caught_spying_denied');
                initGain(4);
                gambit.outcome = 'Their denial collapsed under the evidence.';
            } else {
                // Baseless accusation — it backfires (§10: false accusations damage the accuser).
                shiftRivalry(world, init, tgt, 8, 'accusation_baseless');
                ReputationService.updateScore(world, init, { reliability: -10, deception: 5 }, 'false_accusation');
                tgtGain(2);
                gambit.outcome = 'The accusation found no evidence — your credibility suffers.';
            }
            break;
        }
        case 'show_of_force': {
            if (response === 'submit') {
                shiftRivalry(world, init, tgt, -8, 'show_of_force_submitted');
                initGain(gambit.initiatorStronger ? 3 : 4); // a successful bluff is worth more
                ReputationService.updateScore(world, init, { aggression: 3 }, 'show_of_force');
                gambit.outcome = gambit.initiatorStronger
                    ? 'They backed down before your fleet.'
                    : 'They backed down — your bluff held.';
            } else { // defy
                shiftRivalry(world, init, tgt, 10, 'show_of_force_defied');
                if (gambit.initiatorStronger) {
                    if (gambit.predictionMatched) initGain(2);
                    gambit.outcome = 'They stood their ground against superior force.';
                } else {
                    // Bluff called.
                    ReputationService.updateScore(world, init, { reliability: -8 }, 'bluff_called');
                    tgtGain(2);
                    gambit.outcome = 'They called your bluff — your fleets could not back the threat.';
                }
            }
            break;
        }
    }

    console.log(`[Diplomacy] Gambit ${gambit.kind} ${init}→${tgt}: ${response}${autoResolved ? ' (auto)' : ''}`
        + `${gambit.prediction ? `, prediction ${gambit.predictionMatched ? 'MATCHED' : 'missed'}` : ''}`);
}

// ─── Strategic tick ──────────────────────────────────────────────────────────

/** Auto-resolve overdue gambits by doctrine, prune old resolved ones. */
export function tickGambits(world: GameWorldState): void {
    const dip = ensureDiplomacyState(world);
    for (const gambit of dip.gambits.values()) {
        if (gambit.status === 'pending' && world.nowSeconds >= gambit.respondBySeconds) {
            resolveGambit(world, gambit, pickAutoResponse(world, gambit), true);
        }
    }
    for (const [id, gambit] of [...dip.gambits.entries()]) {
        if (gambit.status !== 'pending'
            && world.nowSeconds - (gambit.resolvedAtSeconds ?? gambit.respondBySeconds) > GAMBIT_RETENTION_SECONDS) {
            dip.gambits.delete(id);
        }
    }
}
