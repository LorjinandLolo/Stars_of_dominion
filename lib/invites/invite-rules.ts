// lib/invites/invite-rules.ts
// Stars of Dominion — the pure half of friend invites (casual-play Item 6a).
//
// No database here, so the probe can drive it and the route can trust it:
// making a code, deciding whether a code may still be spent, and finding the
// free empire whose capital sits nearest the friend who sent the link.

import { randomBytes } from 'crypto';

/** How long a link stays good. */
export const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
/** Unspent links one player may hold at once. */
export const MAX_OPEN_INVITES = 10;

/** No 0/O, 1/I/L: people read these aloud and type them from phones. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** An unguessable 10-character code (~49 bits). */
export function generateInviteCode(): string {
    const bytes = randomBytes(10);
    let out = '';
    for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
}

/** Normalise what a person typed: case, spaces, dashes. Null if it cannot be a code. */
export function normaliseInviteCode(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const code = raw.toUpperCase().replace(/[\s-]/g, '');
    return /^[A-Z0-9]{6,16}$/.test(code) ? code : null;
}

export interface InviteRecord {
    code: string;
    usedBy: string | null;
    expiresAt: Date;
}

export type InviteVerdict =
    | { ok: true }
    | { ok: false; reason: 'unknown' | 'expired' | 'used' };

/**
 * May this user spend this invite now? A link is single use, but the friend it
 * was spent on may keep using it — registration reserves it, and the claim
 * that follows is the same person finishing the same journey.
 */
export function checkInvite(invite: InviteRecord | null, userId: string | null, now: Date = new Date()): InviteVerdict {
    if (!invite) return { ok: false, reason: 'unknown' };
    if (invite.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
    if (invite.usedBy && invite.usedBy !== userId) return { ok: false, reason: 'used' };
    return { ok: true };
}

export const INVITE_REFUSALS: Record<'unknown' | 'expired' | 'used', string> = {
    unknown: 'That invite code does not exist.',
    expired: 'That invite has expired — ask your friend for a fresh link.',
    used: 'That invite has already been used by someone else.',
};

/** Is registration gated on an invite? Off unless INVITE_REQUIRED=true. */
export function inviteRequired(env: Record<string, string | undefined> = process.env): boolean {
    return (env.INVITE_REQUIRED ?? '').trim().toLowerCase() === 'true';
}

// ─── "You start next to …" ─────────────────────────────────────────────────────

export interface GalaxySystem {
    id: string;
    q: number;
    r: number;
    hyperlaneNeighbors?: string[];
}

export interface CandidateEmpire {
    factionId: string;
    capitalSystemId: string;
}

function hexDistance(a: GalaxySystem, b: GalaxySystem): number {
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/**
 * The candidate whose capital is fewest hyperlane jumps from `fromSystemId`.
 * Where the lane graph does not connect two capitals (or is absent), falls
 * back to hex distance on the grid, scaled so a lane jump always beats it.
 * Ties break on grid distance, then faction id, so the answer is stable.
 */
export function nearestEmpire(
    systems: Map<string, GalaxySystem>,
    fromSystemId: string,
    candidates: readonly CandidateEmpire[],
): { factionId: string; jumps: number | null } | null {
    if (!candidates.length) return null;
    const origin = systems.get(fromSystemId);

    // Hyperlane BFS from the inviter's capital.
    const hops = new Map<string, number>([[fromSystemId, 0]]);
    const queue = [fromSystemId];
    while (queue.length) {
        const current = queue.shift()!;
        for (const next of systems.get(current)?.hyperlaneNeighbors ?? []) {
            if (hops.has(next)) continue;
            hops.set(next, hops.get(current)! + 1);
            queue.push(next);
        }
    }

    const scored = candidates.map(c => {
        const target = systems.get(c.capitalSystemId);
        const grid = origin && target ? hexDistance(origin, target) : Number.MAX_SAFE_INTEGER;
        const jumps = hops.get(c.capitalSystemId);
        if (jumps !== undefined) return { factionId: c.factionId, jumps, score: jumps, grid };
        return { factionId: c.factionId, jumps: null as number | null, score: 10_000 + grid, grid };
    });
    // Equal jumps: the one closer on the map reads as "next to"; then id, so
    // the answer never depends on list order.
    scored.sort((a, b) => (a.score - b.score) || (a.grid - b.grid) || a.factionId.localeCompare(b.factionId));
    return { factionId: scored[0].factionId, jumps: scored[0].jumps };
}
