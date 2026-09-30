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
    galacticDayIndex,
    nextGalacticDayStart,
    type EmpireMessageView,
} from './message-rules';

export type SendResult =
    | { ok: true; message: EmpireMessageView }
    | { ok: false; status: 400 | 429; error: string; nextAt?: string };

function toView(row: { id: string; fromFactionId: string; toFactionId: string; body: string; galacticDay: number; createdAt: Date }): EmpireMessageView {
    return {
        id: row.id,
        fromFactionId: row.fromFactionId,
        toFactionId: row.toFactionId,
        body: row.body,
        sentAt: row.createdAt.toISOString(),
        galacticDay: row.galacticDay,
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
    const day = galacticDayIndex(now);
    const toFactionId = typeof input.toFactionId === 'string' ? input.toFactionId : '';
    const body = cleanMessageBody(input.body);

    const [claims, already] = await Promise.all([
        prisma.playerProfile.findMany({ select: { factionId: true } }),
        toFactionId
            ? prisma.empireMessage.findUnique({
                where: { fromFactionId_toFactionId_galacticDay: { fromFactionId: input.fromFactionId, toFactionId, galacticDay: day } },
                select: { id: true },
            })
            : Promise.resolve(null),
    ]);

    const refusal = checkMessage({
        fromFactionId: input.fromFactionId,
        toFactionId,
        body,
        humanFactionIds: claims.map(c => c.factionId).filter(Boolean),
        sentToday: !!already,
    });
    if (refusal) {
        return refusal === 'already_sent_today'
            ? { ok: false, status: 429, error: MESSAGE_REFUSALS[refusal], nextAt: nextGalacticDayStart(now).toISOString() }
            : { ok: false, status: 400, error: MESSAGE_REFUSALS[refusal] };
    }

    try {
        const row = await prisma.empireMessage.create({
            data: {
                fromFactionId: input.fromFactionId,
                toFactionId,
                senderUserId: input.userId,
                body,
                galacticDay: day,
                createdAt: now,
            },
        });
        return { ok: true, message: toView(row) };
    } catch (err: any) {
        // Two tabs sent at once and the other one won: the unique index on
        // (sender, recipient, day) is the rate limit, the check above is only
        // the polite version of it.
        if (err?.code === 'P2002') {
            return { ok: false, status: 429, error: MESSAGE_REFUSALS.already_sent_today, nextAt: nextGalacticDayStart(now).toISOString() };
        }
        throw err;
    }
}

/**
 * Every message of the last week, for the worker to sort into shards
 * (groupMessagesByFaction). A friends' galaxy sends a few dozen a day.
 */
export async function loadRecentMessages(now: Date = new Date()): Promise<EmpireMessageView[]> {
    const since = new Date(now.getTime() - MESSAGE_KEEP_DAYS * 24 * 3600 * 1000);
    const rows = await prisma.empireMessage.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        take: 5000,
    });
    return rows.map(toView);
}
