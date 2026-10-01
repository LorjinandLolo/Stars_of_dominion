// lib/invites/invite-service.ts
// Stars of Dominion — friend invites against the database (casual-play Item 6a).
//
// SERVER-ONLY (imports lib/db). The rules live in invite-rules.ts; this module
// reads and writes rows and calls them. Every entry point takes the caller's
// user id from the route, which took it from the session — never from a body.

import { prisma } from '@/lib/db';
import { LOBBY_FACTIONS, lobbyFactionById } from '@/data/factions/lobby-factions';
import { requestBreakawaySeat } from '@/lib/breakaway/seat-service';
import { capitalSystemIdFor } from '@/lib/galaxy/faction-capitals';
import {
    INVITE_REFUSALS,
    INVITE_TTL_MS,
    MAX_OPEN_INVITES,
    checkInvite,
    generateInviteCode,
    nearestEmpire,
    type GalaxySystem,
} from './invite-rules';

const SESSION_DOC_ID = 'default-session';

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const fail = <T>(status: number, error: string): ServiceResult<T> => ({ ok: false, status, error });

/** The display name of an empire, from the lobby roster. */
function empireName(factionId: string): string {
    return lobbyFactionById(factionId)?.name ?? factionId.replace(/^faction-/, '');
}

// ─── Making links ─────────────────────────────────────────────────────────────

export interface InviteSummary {
    code: string;
    expiresAt: string;
    used: boolean;
    claimedFactionName: string | null;
}

/** A player with a claim makes a link. "Next to you" needs a you. */
export async function createInvite(userId: string): Promise<ServiceResult<InviteSummary>> {
    const profile = await prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) return fail(409, 'Claim your empire first — a friend starts next to it.');

    const open = await prisma.invite.count({
        where: { createdBy: userId, usedBy: null, expiresAt: { gt: new Date() } },
    });
    if (open >= MAX_OPEN_INVITES) {
        return fail(429, `You already have ${open} unused links out. Share one of those first.`);
    }

    // Collisions at ~49 bits are not a real risk; the unique index is the referee.
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const invite = await prisma.invite.create({
                data: {
                    code: generateInviteCode(),
                    createdBy: userId,
                    inviterFactionId: profile.factionId,
                    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
                },
            });
            return { ok: true, value: { code: invite.code, expiresAt: invite.expiresAt.toISOString(), used: false, claimedFactionName: null } };
        } catch (e: any) {
            if (e?.code !== 'P2002') throw e;
        }
    }
    return fail(500, 'Could not mint a code — try again.');
}

/** The caller's own links, newest first. */
export async function listInvites(userId: string): Promise<InviteSummary[]> {
    const rows = await prisma.invite.findMany({ where: { createdBy: userId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.map(row => ({
        code: row.code,
        expiresAt: row.expiresAt.toISOString(),
        used: !!row.usedBy,
        claimedFactionName: row.claimedFactionId ? empireName(row.claimedFactionId) : null,
    }));
}

// ─── Reading a link ───────────────────────────────────────────────────────────

export interface InvitePreview {
    valid: boolean;
    reason?: string;
    inviterName?: string;
    inviterEmpire?: string;
    expiresAt?: string;
}

/**
 * What /join shows before anyone signs in: who invited you and from which
 * empire. Both are already public in the lobby roster; nothing else about the
 * inviter (account, email, position) leaves this function.
 */
export async function previewInvite(code: string): Promise<InvitePreview> {
    const invite = await prisma.invite.findUnique({ where: { code } });
    const verdict = checkInvite(invite, null);
    if (!invite || (!verdict.ok && verdict.reason !== 'used')) {
        return { valid: false, reason: INVITE_REFUSALS[verdict.ok ? 'unknown' : verdict.reason] };
    }
    const profile = await prisma.playerProfile.findUnique({ where: { factionId: invite.inviterFactionId } });
    return {
        // A used link still names its sender, so the friend who spent it can
        // come back through it; the claim path decides whether it is theirs.
        valid: verdict.ok,
        reason: verdict.ok ? undefined : INVITE_REFUSALS.used,
        inviterName: profile?.displayName ?? 'A commander',
        inviterEmpire: empireName(invite.inviterFactionId),
        expiresAt: invite.expiresAt.toISOString(),
    };
}

/** Registration gate: may someone who is not yet a user register with this code? */
export async function inviteOpenForSignup(code: string): Promise<ServiceResult<true>> {
    const invite = await prisma.invite.findUnique({ where: { code } });
    const verdict = checkInvite(invite, null);
    if (!verdict.ok) return fail(403, INVITE_REFUSALS[verdict.reason]);
    return { ok: true, value: true };
}

/** After registration: the code is this new user's now. */
export async function reserveInvite(code: string, userId: string): Promise<void> {
    await prisma.invite.updateMany({ where: { code, usedBy: null }, data: { usedBy: userId, usedAt: new Date() } });
}

// ─── Claiming through a link ──────────────────────────────────────────────────

export interface InviteClaim {
    factionId: string;
    empireName: string;
    inviterName: string;
    inviterEmpire: string;
    jumps: number | null;
    /**
     * Every empire was taken: a breakaway state is being raised next to the
     * host instead (casual-play Item 7, decision 7). The worker writes the
     * claim within a cycle; `factionId` is empty until then.
     */
    pendingBreakaway?: boolean;
}

/** Hyperlane graph from the live snapshot: the map a friend will actually play on. */
async function galaxySystems(): Promise<Map<string, GalaxySystem>> {
    const row = await prisma.multiplayerSession.findUnique({ where: { id: SESSION_DOC_ID }, select: { snapshot: true } });
    const systems = new Map<string, GalaxySystem>();
    if (!row?.snapshot) return systems;
    const parsed = JSON.parse(row.snapshot);
    const records = parsed?.movement?.systems ?? {};
    for (const system of Object.values<any>(records)) {
        if (system?.id) systems.set(system.id, { id: system.id, q: system.q, r: system.r, hyperlaneNeighbors: system.hyperlaneNeighbors });
    }
    return systems;
}

/**
 * Claim the free empire nearest the inviter's capital. The caller must hold no
 * claim yet. Two friends racing for the same neighbour both pass the "free"
 * check; the PlayerProfile unique index decides, and the loser gets the next
 * nearest instead of an error.
 */
export async function claimThroughInvite(code: string, userId: string, displayName: string): Promise<ServiceResult<InviteClaim>> {
    const invite = await prisma.invite.findUnique({ where: { code } });
    const verdict = checkInvite(invite, userId);
    if (!invite || !verdict.ok) return fail(verdict.ok ? 404 : (verdict.reason === 'unknown' ? 404 : 410), INVITE_REFUSALS[verdict.ok ? 'unknown' : verdict.reason]);

    const mine = await prisma.playerProfile.findUnique({ where: { userId } });
    if (mine) return fail(409, `You already lead ${empireName(mine.factionId)} this season.`);

    const inviterCapital = capitalSystemIdFor(invite.inviterFactionId);
    if (!inviterCapital) return fail(500, 'Your friend’s empire has no capital on this map.');

    const systems = await galaxySystems();
    const taken = new Set((await prisma.playerProfile.findMany({ select: { factionId: true } })).map(p => p.factionId));
    let candidates = LOBBY_FACTIONS
        .filter(f => !taken.has(f.id) && f.id !== invite.inviterFactionId)
        .map(f => ({ factionId: f.id, capitalSystemId: capitalSystemIdFor(f.id) ?? '' }))
        .filter(c => c.capitalSystemId);

    const inviter = await prisma.playerProfile.findUnique({ where: { factionId: invite.inviterFactionId } });
    const inviterName = inviter?.displayName ?? 'your friend';

    for (let attempt = 0; attempt < 3 && candidates.length; attempt++) {
        const pick = nearestEmpire(systems, inviterCapital, candidates);
        if (!pick) break;
        try {
            await prisma.playerProfile.create({ data: { userId, factionId: pick.factionId, displayName } });
        } catch (e: any) {
            if (e?.code === 'P2002') {
                candidates = candidates.filter(c => c.factionId !== pick.factionId);
                continue;
            }
            throw e;
        }
        await prisma.invite.update({
            where: { code },
            data: { usedBy: userId, usedAt: invite.usedAt ?? new Date(), claimedFactionId: pick.factionId },
        });
        return {
            ok: true,
            value: {
                factionId: pick.factionId,
                empireName: empireName(pick.factionId),
                inviterName,
                inviterEmpire: empireName(invite.inviterFactionId),
                jumps: pick.jumps,
            },
        };
    }
    // No free empire anywhere: a province next to the host rises for the
    // friend instead (Item 7, decision 7).
    const queued = await requestBreakawaySeat({
        userId, displayName, nearFactionId: invite.inviterFactionId, inviteCode: code, viaInvite: true,
    });
    if (!queued.ok) return fail(409, queued.error);
    return {
        ok: true,
        value: {
            factionId: '',
            empireName: 'a breakaway state',
            inviterName,
            inviterEmpire: empireName(invite.inviterFactionId),
            jumps: null,
            pendingBreakaway: true,
        },
    };
}
