// lib/messages/message-rules.ts
// Stars of Dominion — messages between players' empires (casual-play Item 6c).
//
// One plain-text note per sender, per recipient, per Galactic Day; 280
// characters. Everything here is pure: the send route, the worker, the brief,
// the panel and the probe all read the same rules, and none of them needs a
// database to be tested (lib/messages/message-service.ts does the writing).
//
// A message is text a stranger typed. It is stored as typed, minus characters
// that have no business in a line of text, and rendered as a text node — never
// as markup. There is no formatting language to get wrong.

import { GALACTIC_DAY_REAL_SECONDS } from '@/lib/time/time-config';

export const MESSAGE_MAX_CHARS = 280;
/** How far back an empire's shard carries its correspondence. */
export const MESSAGE_KEEP_DAYS = 7;
/** Most messages (sent and received together) one shard carries. */
export const MESSAGES_PER_FACTION = 60;

const DAY_MS = GALACTIC_DAY_REAL_SECONDS * 1000;

/** A message as both ends see it. The sender's account id is never part of it. */
export interface EmpireMessageView {
    id: string;
    fromFactionId: string;
    toFactionId: string;
    body: string;
    /** ISO timestamp, real clock. */
    sentAt: string;
    galacticDay: number;
}

/**
 * Which Galactic Day a real instant falls on. A Galactic Day is 24 real hours
 * (lib/time/time-config.ts); the count runs on the real clock so it keeps
 * turning while the worker is down, and rolls over at the same moment for
 * everyone (00:00 UTC), whenever each of them last wrote.
 */
export function galacticDayIndex(at: Date = new Date()): number {
    return Math.floor(at.getTime() / DAY_MS);
}

/** The instant the day after `at` begins — when the next message may go out. */
export function nextGalacticDayStart(at: Date = new Date()): Date {
    return new Date((galacticDayIndex(at) + 1) * DAY_MS);
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
        .replace(/[‎‏‪-‮⁦-⁩﻿]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Length as a person counts it: one emoji is one character. */
export function messageLength(body: string): number {
    return Array.from(body).length;
}

export type MessageRefusal =
    | 'empty'
    | 'too_long'
    | 'self'
    | 'not_a_player'
    | 'already_sent_today';

export const MESSAGE_REFUSALS: Record<MessageRefusal, string> = {
    empty: 'Write something first.',
    too_long: `A message is at most ${MESSAGE_MAX_CHARS} characters.`,
    self: 'You cannot write to your own empire.',
    not_a_player: 'That empire is run by the AI. Only an empire played by a person can read a message.',
    already_sent_today: 'You have already written to them today. One message per empire per day.',
};

export interface MessageCheck {
    fromFactionId: string;
    toFactionId: string;
    /** Already through cleanMessageBody. */
    body: string;
    /** Empires with a human claimant. */
    humanFactionIds: Iterable<string>;
    /** Whether this sender already wrote to this recipient on this Galactic Day. */
    sentToday: boolean;
}

/** Null when the message may be sent. */
export function checkMessage(check: MessageCheck): MessageRefusal | null {
    if (!check.body) return 'empty';
    if (messageLength(check.body) > MESSAGE_MAX_CHARS) return 'too_long';
    if (!check.toFactionId || check.toFactionId === check.fromFactionId) return 'self';
    if (!new Set(check.humanFactionIds).has(check.toFactionId)) return 'not_a_player';
    if (check.sentToday) return 'already_sent_today';
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
    const today = galacticDayIndex(now);
    const sent = (messages ?? []).some(m => m.fromFactionId === me && m.toFactionId === other && m.galacticDay === today);
    return sent ? { allowed: false, nextAt: nextGalacticDayStart(now) } : { allowed: true, nextAt: null };
}

/**
 * Each empire's own correspondence — what it sent and what it received, oldest
 * first, capped — keyed by faction id. This is what the worker hands to
 * extractFactionShard: an empire's shard carries its messages and nobody
 * else's.
 */
export function groupMessagesByFaction(rows: readonly EmpireMessageView[]): Map<string, EmpireMessageView[]> {
    const out = new Map<string, EmpireMessageView[]>();
    const sorted = [...rows].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    for (const row of sorted) {
        for (const factionId of new Set([row.fromFactionId, row.toFactionId])) {
            const list = out.get(factionId) ?? [];
            list.push(row);
            out.set(factionId, list);
        }
    }
    for (const [factionId, list] of out) {
        if (list.length > MESSAGES_PER_FACTION) out.set(factionId, list.slice(-MESSAGES_PER_FACTION));
    }
    return out;
}
