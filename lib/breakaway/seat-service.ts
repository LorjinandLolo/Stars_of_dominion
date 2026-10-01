// lib/breakaway/seat-service.ts
// Stars of Dominion — taking a seat in a breakaway state (casual-play Item 7).
//
// Server only (imports lib/db). Two halves:
//
//   requestBreakawaySeat   — the web route. Checks eligibility against the
//                            shared snapshot and the claims table, then queues
//                            a LOBBY_TAKE_BREAKAWAY row. Raising a state means
//                            changing the world, and only the worker holds it.
//   handleLobbyOrder       — the worker. Re-checks, raises a state if asked,
//                            writes the claim, readies the state, tells the
//                            press. One code path, so the probe drives the
//                            same thing the live worker runs.
//
// LOBBY_* rows are written by this module only. queueOrder (the player order
// path) refuses any action id it does not know, and LOBBY_TAKE_BREAKAWAY is in
// neither ACTION_DEFINITIONS nor WORKER_ONLY_ACTIONS — so no client can queue
// one, or one naming another account.

import { prisma } from '@/lib/db';
import { capitalSystemIdFor } from '@/lib/galaxy/faction-capitals';
import {
    SEAT_REFUSALS,
    freeLobbySeats,
    isBreakawayFactionId,
    listBreakaways,
    seatEligibility,
    type BreakawaySummary,
    type SeatReason,
} from './breakaway-rules';
import { raiseUprising, takeBreakaway } from './breakaway-service';

export const LOBBY_TAKE_BREAKAWAY = 'LOBBY_TAKE_BREAKAWAY';
/** The faction column of a lobby row: it belongs to no empire yet. */
export const LOBBY_FACTION = '__lobby__';
const SESSION_DOC_ID = 'default-session';

export interface LobbySeatPayload {
    userId: string;
    displayName: string;
    /** A specific state, or null: the game picks or raises one. */
    breakawayId: string | null;
    /** An invite: raise it next to this empire. */
    nearFactionId: string | null;
    /** The fallen empire, for a comeback. */
    fromFactionId: string | null;
    eliminated: boolean;
    /** The invite this seat spends, if any. */
    inviteCode: string | null;
}

/** The parts of the shared snapshot the eligibility check reads. */
async function readSnapshot(): Promise<any> {
    const doc = await prisma.multiplayerSession.findUnique({ where: { id: SESSION_DOC_ID }, select: { snapshot: true } });
    if (!doc?.snapshot) return null;
    try { return JSON.parse(doc.snapshot); } catch { return null; }
}

/** `{__map__, data}` (serializeWorld) or a plain record → plain record. */
function plain(source: any): Record<string, any> {
    if (!source) return {};
    if (source.__map__ && source.data) return source.data;
    return source;
}

/** A snapshot shaped enough for listBreakaways (Maps as plain objects are fine). */
function snapshotView(raw: any): any {
    return {
        factionNames: raw?.factionNames ?? {},
        construction: { planets: plain(raw?.construction?.planets) },
        secessionCrises: plain(raw?.secessionCrises),
        economy: { factions: {} },
    };
}

export interface SeatStatus {
    eligible: boolean;
    reason: SeatReason | null;
    message: string | null;
    breakaways: BreakawaySummary[];
    /** A request from this account is waiting for the worker. */
    pending: boolean;
    claimedFactionId: string | null;
}

/** What the lobby shows this account. */
export async function seatStatus(userId: string): Promise<SeatStatus> {
    const [raw, claims, mine, pending] = await Promise.all([
        readSnapshot(),
        prisma.playerProfile.findMany({ select: { factionId: true } }),
        prisma.playerProfile.findUnique({ where: { userId }, select: { factionId: true } }),
        prisma.gameOrder.findFirst({ where: { actionId: LOBBY_TAKE_BREAKAWAY, payload: { contains: `"userId":"${userId}"` } }, select: { id: true } }),
    ]);
    const defeatStatus = mine?.factionId ? (plain(raw?.titles?.defeatStatuses)[mine.factionId] ?? 'ALIVE') : null;
    const verdict = seatEligibility({
        claimedFactionId: mine?.factionId ?? null,
        defeatStatus,
        freeLobbySeats: freeLobbySeats(claims.map(c => c.factionId)),
    });
    const taken = new Set(claims.map(c => c.factionId));
    const breakaways = listBreakaways(snapshotView(raw)).filter(b => !taken.has(b.factionId));
    return {
        eligible: verdict.eligible,
        reason: verdict.eligible ? verdict.reason : null,
        message: verdict.eligible ? null : SEAT_REFUSALS[verdict.refusal],
        breakaways,
        pending: !!pending,
        claimedFactionId: mine?.factionId ?? null,
    };
}

export type SeatRequestResult =
    | { ok: true; queued: true }
    | { ok: false; status: 400 | 403 | 404 | 409; error: string };

/** The web route: queue a seat for the worker, once eligibility holds. */
export async function requestBreakawaySeat(input: {
    userId: string;
    displayName: string;
    breakawayId?: unknown;
    nearFactionId?: string | null;
    inviteCode?: string | null;
    /** Skip the "every seat taken" test — an invite whose host has no free neighbour. */
    viaInvite?: boolean;
}): Promise<SeatRequestResult> {
    const status = await seatStatus(input.userId);
    if (status.pending) return { ok: false, status: 409, error: 'Your request is already with the galaxy — give it a moment.' };
    const inviteOk = input.viaInvite && !status.claimedFactionId;
    if (!status.eligible && !inviteOk) return { ok: false, status: 403, error: status.message ?? 'Not eligible.' };

    let breakawayId: string | null = null;
    if (input.breakawayId !== undefined && input.breakawayId !== null && input.breakawayId !== '') {
        if (!isBreakawayFactionId(input.breakawayId)) return { ok: false, status: 400, error: 'That is not a breakaway state.' };
        if (!status.breakaways.some(b => b.factionId === input.breakawayId)) {
            return { ok: false, status: 404, error: 'That breakaway state is gone or already has a leader.' };
        }
        breakawayId = input.breakawayId as string;
    }

    const payload: LobbySeatPayload = {
        userId: input.userId,
        displayName: input.displayName,
        breakawayId,
        nearFactionId: input.nearFactionId ?? null,
        fromFactionId: status.reason === 'eliminated' ? status.claimedFactionId : null,
        eliminated: status.reason === 'eliminated',
        inviteCode: input.inviteCode ?? null,
    };
    await prisma.gameOrder.create({
        data: { actionId: LOBBY_TAKE_BREAKAWAY, factionId: LOBBY_FACTION, payload: JSON.stringify(payload) },
    });
    return { ok: true, queued: true };
}

export interface LobbyOrderOutcome {
    ok: boolean;
    message: string;
    factionId?: string;
}

/**
 * The worker's half. Called for each LOBBY_TAKE_BREAKAWAY row, before the
 * player orders of the cycle. Never throws for a refusal — it returns why,
 * and the worker deletes the row either way (a seat request is not retried).
 */
export async function handleLobbyOrder(world: any, payload: LobbySeatPayload): Promise<LobbyOrderOutcome> {
    const claims = await prisma.playerProfile.findMany({ select: { userId: true, factionId: true } });
    const mine = claims.find(c => c.userId === payload.userId) ?? null;
    const humans = claims.map(c => c.factionId);

    // Re-check what the route checked: a lot can change in a poll.
    if (mine && !(payload.eliminated && mine.factionId === payload.fromFactionId)) {
        return { ok: false, message: 'This account already leads an empire.' };
    }
    if (payload.eliminated) {
        const status = world?.titles?.defeatStatuses?.get?.(payload.fromFactionId);
        if (status !== 'ELIMINATED') return { ok: false, message: 'That empire is not destroyed.' };
    }

    const taken = new Set(humans);
    let rebelId = payload.breakawayId;
    if (rebelId) {
        if (taken.has(rebelId) || !listBreakaways(world).some(b => b.factionId === rebelId)) {
            return { ok: false, message: 'That breakaway state is gone or already has a leader.' };
        }
    } else {
        // Decision 1: never make anyone wait on luck. An existing unled state
        // near the host (or any, without one) — else raise one.
        const nearSystemId = payload.nearFactionId
            ? (world.economy?.factions?.get?.(payload.nearFactionId)?.capitalSystemId ?? capitalSystemIdFor(payload.nearFactionId) ?? null)
            : null;
        const free = listBreakaways(world).filter(b => !taken.has(b.factionId));
        if (free.length && !nearSystemId) {
            rebelId = free[0].factionId;
        } else {
            const raised = raiseUprising(world, { nearSystemId, humanFactionIds: humans });
            if (!raised.ok || !raised.factionId) return { ok: false, message: raised.message ?? 'No province could rise.' };
            rebelId = raised.factionId;
        }
    }

    // The claim. The unique index on factionId is the referee if two accounts
    // reach the same state in the same cycle.
    try {
        if (mine) {
            await prisma.playerProfile.update({
                where: { userId: payload.userId },
                data: { factionId: rebelId, displayName: payload.displayName || undefined, briefSeenAt: null },
            });
        } else {
            await prisma.playerProfile.create({
                data: { userId: payload.userId, factionId: rebelId, displayName: payload.displayName || 'Commander' },
            });
        }
    } catch (e: any) {
        if (e?.code === 'P2002') return { ok: false, message: 'Someone else took that state a moment ago.' };
        throw e;
    }
    if (payload.inviteCode) {
        await prisma.invite.updateMany({
            where: { code: payload.inviteCode },
            data: { usedBy: payload.userId, usedAt: new Date(), claimedFactionId: rebelId },
        }).catch(() => {});
    }

    // The AI stops speaking for it this very cycle, not at the next claims refresh.
    const claimed: string[] = Array.isArray(world.claimedFactionIds) ? world.claimedFactionIds : [];
    world.claimedFactionIds = [...claimed.filter((id: string) => id !== payload.fromFactionId), rebelId];

    const taken2 = takeBreakaway(world, rebelId, { fromFactionId: payload.fromFactionId, eliminated: payload.eliminated });
    if (!taken2.ok) return { ok: false, message: taken2.message ?? 'The state could not be handed over.', factionId: rebelId };
    return { ok: true, message: `${payload.displayName} leads ${taken2.name}.`, factionId: rebelId };
}
