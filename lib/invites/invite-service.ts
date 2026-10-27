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
import { isCabinetPortfolio } from '@/lib/government/seat-scope';
import {
    GROUP_INVITE_MAX_USES,
    GROUP_INVITE_TTL_MS,
    INVITE_REFUSALS,
    INVITE_TTL_MS,
    MAX_OPEN_INVITES,
    checkInvite,
    generateInviteCode,
    isGroupInvite,
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
    /** A seat link: the portfolio the friend takes. Null for an empire link. */
    seatPortfolio?: string | null;
    /** A group link: how many have signed up through it, of how many. */
    group?: { uses: number; maxUses: number };
}

/**
 * A player with a claim makes a link. "Next to you" needs a you. With a
 * `seatPortfolio` the link seats the friend in the inviter's cabinet instead
 * (lib/government/seat-scope.ts); one holder per portfolio. With `group` it is
 * one link for a whole chat: anyone may sign up through it and picks their own
 * empire. A new group link retires the caller's older ones.
 */
export async function createInvite(userId: string, opts: { seatPortfolio?: string; group?: boolean } = {}): Promise<ServiceResult<InviteSummary>> {
    const profile = await prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) return fail(409, 'Claim your empire first — a friend starts next to it.');
    if (opts.group) return createGroupInvite(userId, profile.factionId);
    const seatPortfolio = opts.seatPortfolio ?? null;
    if (seatPortfolio !== null) {
        if (!isCabinetPortfolio(seatPortfolio)) return fail(400, 'That is not a cabinet portfolio.');
        const taken = await prisma.factionSeat.findUnique({ where: { factionId_portfolio: { factionId: profile.factionId, portfolio: seatPortfolio } } });
        if (taken) return fail(409, `The ${seatPortfolio} seat is already held by ${taken.persona}.`);
    }

    const open = await prisma.invite.count({
        where: { createdBy: userId, usedBy: null, maxUses: 1, expiresAt: { gt: new Date() } },
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
                    seatPortfolio,
                },
            });
            return { ok: true, value: { code: invite.code, expiresAt: invite.expiresAt.toISOString(), used: false, claimedFactionName: null, seatPortfolio } };
        } catch (e: any) {
            if (e?.code !== 'P2002') throw e;
        }
    }
    return fail(500, 'Could not mint a code — try again.');
}

async function createGroupInvite(userId: string, factionId: string): Promise<ServiceResult<InviteSummary>> {
    const now = new Date();
    // One live group link per host: a new one shuts the old (a leaked link
    // is closed by making another). Friends already in keep their accounts.
    await prisma.invite.updateMany({
        where: { createdBy: userId, maxUses: { gt: 1 }, expiresAt: { gt: now } },
        data: { expiresAt: now },
    });
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const invite = await prisma.invite.create({
                data: {
                    code: generateInviteCode(),
                    createdBy: userId,
                    inviterFactionId: factionId,
                    expiresAt: new Date(now.getTime() + GROUP_INVITE_TTL_MS),
                    maxUses: GROUP_INVITE_MAX_USES,
                },
            });
            return {
                ok: true,
                value: {
                    code: invite.code, expiresAt: invite.expiresAt.toISOString(), used: false, claimedFactionName: null,
                    seatPortfolio: null, group: { uses: 0, maxUses: invite.maxUses },
                },
            };
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
        used: isGroupInvite(row) ? row.uses >= row.maxUses : !!row.usedBy,
        claimedFactionName: row.claimedFactionId ? empireName(row.claimedFactionId) : null,
        seatPortfolio: row.seatPortfolio ?? null,
        ...(isGroupInvite(row) ? { group: { uses: row.uses, maxUses: row.maxUses } } : {}),
    }));
}

// ─── Reading a link ───────────────────────────────────────────────────────────

export interface InvitePreview {
    valid: boolean;
    reason?: string;
    inviterName?: string;
    inviterEmpire?: string;
    expiresAt?: string;
    /** A seat link: the cabinet portfolio it offers. Null for an empire link. */
    seatPortfolio?: string | null;
    /** A group link: the joiner picks any free empire; nobody is "next to" anyone. */
    group?: boolean;
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
        seatPortfolio: invite.seatPortfolio ?? null,
        group: isGroupInvite(invite),
    };
}

/**
 * Registration gate, host side: a galaxy nobody has claimed yet (fresh, or
 * just reseeded) is open, so the host can sign up and claim with
 * INVITE_REQUIRED already on. The first claim closes it for everyone after.
 */
export async function galaxyHasNoPlayers(): Promise<boolean> {
    return (await prisma.playerProfile.count()) === 0;
}

/** Registration gate: may someone who is not yet a user register with this code? */
export async function inviteOpenForSignup(code: string): Promise<ServiceResult<true>> {
    const invite = await prisma.invite.findUnique({ where: { code } });
    const verdict = checkInvite(invite, null);
    if (!verdict.ok) return fail(403, INVITE_REFUSALS[verdict.reason]);
    return { ok: true, value: true };
}

/** After registration: the code is this new user's now — or, for a group link, one more sign-up on it. */
export async function reserveInvite(code: string, userId: string): Promise<void> {
    const invite = await prisma.invite.findUnique({ where: { code }, select: { maxUses: true } });
    if (invite && isGroupInvite(invite)) {
        await prisma.invite.update({ where: { code }, data: { uses: { increment: 1 }, usedAt: new Date() } });
        return;
    }
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
    /** A seat link: the friend now holds this portfolio in `factionId`'s cabinet. */
    seatPortfolio?: string;
}

/**
 * A seat link: seat the friend in the inviter's cabinet. Unlike an empire
 * link the friend MAY already rule an empire of their own — the court knows
 * them by `displayName` only, and which empire they rule stays hidden until
 * exposed (lib/government/plots, later). One seat per account.
 */
async function claimSeatThroughInvite(invite: { code: string; inviterFactionId: string; seatPortfolio: string | null; usedAt: Date | null }, userId: string, displayName: string, inviterName: string): Promise<ServiceResult<InviteClaim>> {
    const portfolio = invite.seatPortfolio!;
    const held = await prisma.factionSeat.findUnique({ where: { userId } });
    if (held && held.factionId !== invite.inviterFactionId) return fail(409, 'You already hold a seat in another court this season.');
    const own = await prisma.playerProfile.findUnique({ where: { userId } });
    if (own?.factionId === invite.inviterFactionId) return fail(409, 'That is your own cabinet.');
    try {
        if (!held) {
            await prisma.factionSeat.create({
                data: { userId, factionId: invite.inviterFactionId, portfolio, persona: displayName, invitedBy: inviterName },
            });
        }
    } catch (e: any) {
        if (e?.code === 'P2002') return fail(409, `The ${portfolio} seat was taken just before you.`);
        throw e;
    }
    await prisma.invite.update({
        where: { code: invite.code },
        data: { usedBy: userId, usedAt: invite.usedAt ?? new Date(), claimedFactionId: invite.inviterFactionId },
    });
    return {
        ok: true,
        value: {
            factionId: invite.inviterFactionId,
            empireName: empireName(invite.inviterFactionId),
            inviterName,
            inviterEmpire: empireName(invite.inviterFactionId),
            jumps: null,
            seatPortfolio: portfolio,
        },
    };
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
    // A group link only opens the door; the joiner picks from the lobby list.
    if (isGroupInvite(invite)) return fail(400, 'This is a group link — pick any free empire from the list.');

    if (invite.seatPortfolio) {
        const host = await prisma.playerProfile.findUnique({ where: { factionId: invite.inviterFactionId } });
        return claimSeatThroughInvite(invite, userId, displayName, host?.displayName ?? 'your friend');
    }

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
