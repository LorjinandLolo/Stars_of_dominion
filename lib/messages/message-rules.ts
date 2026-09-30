// lib/messages/message-rules.ts
// Stars of Dominion — messages between players' empires (casual-play Item 6c).
//
// Plain text, 280 characters, as many as the conversation needs. The spec's
// one-per-Galactic-Day limit was dropped on 2026-09-30: among friends it only
// stretched "truce?" / "deal" over three days. What is left is a short
// cooldown per sender and recipient, there to stop a flood, not a talk.
//
// Everything here is pure: the send route, the worker, the brief, the panel
// and the probe all read the same rules, and none of them needs a database to
// be tested (lib/messages/message-service.ts does the writing).
//
// A message is text a stranger typed. It is stored as typed, minus characters
// that have no business in a line of text, and rendered as a text node — never
// as markup. There is no formatting language to get wrong.

export const MESSAGE_MAX_CHARS = 280;
/** Seconds one sender waits before writing to the same empire again. */
export const MESSAGE_COOLDOWN_SECONDS = 15;
/** How far back an empire's shard carries its correspondence. */
export const MESSAGE_KEEP_DAYS = 7;
/** Most messages (both directions) a shard carries per conversation. */
export const MESSAGES_PER_THREAD = 20;

/** A message as both ends see it. The sender's account id is never part of it. */
export interface EmpireMessageView {
    id: string;
    fromFactionId: string;
    toFactionId: string;
    body: string;
    /** ISO timestamp, real clock. */
    sentAt: string;
}

/**
 * The text as it will be stored. Line breaks and tabs become spaces, runs of
 * whitespace collapse, control characters go, and so do the invisible
 * direction overrides that let a line of text display as something other than
 * what was typed.
 */
export function cleanMessageBody(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    return raw
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
        .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Length as a person counts it: one emoji is one character. */
export function messageLength(body: string): number {
    return Array.from(body).length;
}

/**
 * When a sender whose last message to this empire went out at `lastSentAt`
 * may write to it again. Null = now.
 */
export function cooldownEndsAt(lastSentAt: Date | string | null | undefined, now: Date = new Date()): Date | null {
    if (!lastSentAt) return null;
    const last = lastSentAt instanceof Date ? lastSentAt : new Date(lastSentAt);
    if (Number.isNaN(last.getTime())) return null;
    const ends = new Date(last.getTime() + MESSAGE_COOLDOWN_SECONDS * 1000);
    return ends.getTime() > now.getTime() ? ends : null;
}

export type MessageRefusal =
    | 'empty'
    | 'too_long'
    | 'self'
    | 'not_a_player'
    | 'too_soon';

export const MESSAGE_REFUSALS: Record<MessageRefusal, string> = {
    empty: 'Write something first.',
    too_long: `A message is at most ${MESSAGE_MAX_CHARS} characters.`,
    self: 'You cannot write to your own empire.',
    not_a_player: 'That empire is run by the AI. Only an empire played by a person can read a message.',
    too_soon: 'You only just wrote to them. Give it a few seconds.',
};

export interface MessageCheck {
    fromFactionId: string;
    toFactionId: string;
    /** Already through cleanMessageBody. */
    body: string;
    /** Empires with a human claimant. */
    humanFactionIds: Iterable<string>;
    /** When this sender last wrote to this recipient, if ever. */
    lastSentAt?: Date | string | null;
    now?: Date;
}

/** Null when the message may be sent. */
export function checkMessage(check: MessageCheck): MessageRefusal | null {
    if (!check.body) return 'empty';
    if (messageLength(check.body) > MESSAGE_MAX_CHARS) return 'too_long';
    if (!check.toFactionId || check.toFactionId === check.fromFactionId) return 'self';
    if (!new Set(check.humanFactionIds).has(check.toFactionId)) return 'not_a_player';
    if (cooldownEndsAt(check.lastSentAt, check.now)) return 'too_soon';
    return null;
}

/**
 * Who is allowed to send as `fromFactionId`. The sender is the session's
 * claimant and nobody else: no session is 401, a session without a claim is
 * 403, and so is a request that names an empire the caller does not hold.
 */
export function senderStatus(caller: { userId: string | null; factionId: string | null }, requestedFrom?: unknown): 200 | 401 | 403 {
    if (!caller.userId) return 401;
    if (!caller.factionId) return 403;
    if (requestedFrom !== undefined && requestedFrom !== null && requestedFrom !== caller.factionId) return 403;
    return 200;
}

/** The exchange between two empires, oldest first. */
export function threadWith(messages: readonly EmpireMessageView[] | null | undefined, me: string, other: string): EmpireMessageView[] {
    return (messages ?? [])
        .filter(m => (m.fromFactionId === me && m.toFactionId === other)
            || (m.fromFactionId === other && m.toFactionId === me))
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

/** Whether `me` may write to `other` right now, and if not, when. */
export function writeWindow(
    messages: readonly EmpireMessageView[] | null | undefined,
    me: string,
    other: string,
    now: Date = new Date(),
): { allowed: boolean; nextAt: Date | null } {
    let last = '';
    for (const m of messages ?? []) {
        if (m.fromFactionId === me && m.toFactionId === other && m.sentAt > last) last = m.sentAt;
    }
    const nextAt = cooldownEndsAt(last || null, now);
    return { allowed: !nextAt, nextAt };
}

/**
 * Each empire's own correspondence — what it sent and what it received, oldest
 * first — keyed by faction id. This is what the worker hands to
 * extractFactionShard: an empire's shard carries its messages and nobody
 * else's. Capped per conversation, so one busy thread cannot push a quieter
 * friend's messages out of the shard.
 */
export function groupMessagesByFaction(rows: readonly EmpireMessageView[]): Map<string, EmpireMessageView[]> {
    const threads = new Map<string, Map<string, EmpireMessageView[]>>();
    const sorted = [...rows].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    const file = (owner: string, other: string, row: EmpireMessageView) => {
        const mine = threads.get(owner) ?? new Map<string, EmpireMessageView[]>();
        const thread = mine.get(other) ?? [];
        thread.push(row);
        mine.set(other, thread);
        threads.set(owner, mine);
    };
    for (const row of sorted) {
        if (row.fromFactionId === row.toFactionId) continue;
        file(row.fromFactionId, row.toFactionId, row);
        file(row.toFactionId, row.fromFactionId, row);
    }

    const out = new Map<string, EmpireMessageView[]>();
    for (const [owner, mine] of threads) {
        const kept: EmpireMessageView[] = [];
        for (const thread of mine.values()) kept.push(...thread.slice(-MESSAGES_PER_THREAD));
        kept.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
        out.set(owner, kept);
    }
    return out;
}
