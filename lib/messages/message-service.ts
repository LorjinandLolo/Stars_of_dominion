// lib/messages/message-service.ts
// Stars of Dominion — messages between players' empires, the database side.
//
// Server only (imports lib/db). The rules live in message-rules.ts; this file
// reads the claims table, applies them, and writes the row. The route hands it
// an identity it resolved from the session — nothing in here trusts a faction
// id that came from a request body.

import { prisma } from '@/lib/db';
import {
    MESSAGE_KEEP_DAYS,
    MESSAGE_REFUSALS,
    checkMessage,
    cleanMessageBody,
    cooldownEndsAt,
    type EmpireMessageView,
} from './message-rules';

export type SendResult =
    | { ok: true; message: EmpireMessageView }
    | { ok: false; status: 400 | 429; error: string; nextAt?: string };

function toView(row: { id: string; fromFactionId: string; toFactionId: string; body: string; createdAt: Date }): EmpireMessageView {
    return {
        id: row.id,
        fromFactionId: row.fromFactionId,
        toFactionId: row.toFactionId,
        body: row.body,
        sentAt: row.createdAt.toISOString(),
    };
}

/**
 * Send one message as the claimant of `fromFactionId`. The caller has already
 * established that `userId` holds that empire (senderStatus in the rules).
 */
export async function sendMessage(input: {
    userId: string;
    fromFactionId: string;
    toFactionId: unknown;
    body: unknown;
    now?: Date;
}): Promise<SendResult> {
    const now = input.now ?? new Date();
    const fromFactionId = input.fromFactionId;
    const toFactionId = typeof input.toFactionId === 'string' ? input.toFactionId : '';
    const body = cleanMessageBody(input.body);

    const claims = await prisma.playerProfile.findMany({ select: { factionId: true } });
    const humanFactionIds = claims.map(c => c.factionId).filter(Boolean);

    // Everything that does not depend on timing is refused before a
    // transaction is opened.
    const refusal = checkMessage({ fromFactionId, toFactionId, body, humanFactionIds, now });
    if (refusal) return { ok: false, status: 400, error: MESSAGE_REFUSALS[refusal] };

    // The cooldown is "read the last one, then write": two tabs sending at
    // once would both read the same last message and both pass. A
    // transaction-scoped advisory lock on the pair makes the second wait for
    // the first, then see its row.
    return prisma.$transaction(async (tx): Promise<SendResult> => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`empire-message:${fromFactionId}:${toFactionId}`}))`;

        const last = await tx.empireMessage.findFirst({
            where: { fromFactionId, toFactionId, createdAt: { lte: now } },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
        });
        const waitUntil = cooldownEndsAt(last?.createdAt, now);
        if (waitUntil) {
            return { ok: false, status: 429, error: MESSAGE_REFUSALS.too_soon, nextAt: waitUntil.toISOString() };
        }

        const row = await tx.empireMessage.create({
            data: { fromFactionId, toFactionId, senderUserId: input.userId, body, createdAt: now },
        });
        return { ok: true, message: toView(row) };
    });
}

/**
 * The last week's messages, for the worker to sort into shards
 * (groupMessagesByFaction). Newest first out of the database so that a very
 * busy week drops its oldest rows, not the ones just sent.
 */
export async function loadRecentMessages(now: Date = new Date()): Promise<EmpireMessageView[]> {
    const since = new Date(now.getTime() - MESSAGE_KEEP_DAYS * 24 * 3600 * 1000);
    const rows = await prisma.empireMessage.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 5000,
    });
    return rows.reverse().map(toView);
}
