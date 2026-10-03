// lib/telemetry/telemetry-store.ts
// Stars of Dominion — writing telemetry. SERVER-SIDE ONLY (imports the database).
//
// Recording how the game is played must never get in the way of playing it:
// every write here is best-effort, swallows its own failures, and is skipped
// entirely when TELEMETRY=off.

import { prisma } from '@/lib/db';
import { serverDetail, telemetryEnabled, type CleanEvent, type ServerEventKind } from './telemetry-rules';

/** Store events a verified player's browser reported. Returns how many were written. */
export async function storeReportedEvents(
    userId: string,
    factionId: string | null,
    events: CleanEvent[],
): Promise<number> {
    if (!telemetryEnabled(process.env) || events.length === 0) return 0;
    try {
        const result = await prisma.telemetryEvent.createMany({
            data: events.map(e => ({ userId, factionId, kind: e.kind, detail: e.detail, at: e.at })),
        });
        return result.count;
    } catch (e: any) {
        console.warn('[Telemetry] could not store a report:', e?.message ?? e);
        return 0;
    }
}

/** Record one server-side event. Fire and forget: never throws, never awaited by the caller's result. */
export function recordServerEvent(
    kind: ServerEventKind,
    who: { userId?: string | null; factionId?: string | null },
    detail: Record<string, string | number | boolean>,
): void {
    if (!telemetryEnabled(process.env)) return;
    prisma.telemetryEvent.create({
        data: {
            userId: who.userId ?? null,
            factionId: who.factionId ?? null,
            kind,
            detail: serverDetail(detail),
        },
    }).catch((e: any) => console.warn('[Telemetry] could not record', kind, e?.message ?? e));
}

/** Buffered rows the worker writes once per cycle (see scripts/game-loop.ts). */
const workerBuffer: Array<{ factionId: string; kind: ServerEventKind; detail: string; at: Date }> = [];
/** A worker that cannot reach the table stops buffering here rather than growing for ever. */
const MAX_WORKER_BUFFER = 2000;

/**
 * Note an event inside the worker's synchronous order loop. Only empires a
 * player has claimed are recorded — the AI's refused orders say nothing about
 * how people play. The write happens in flushWorkerTelemetry.
 */
export function bufferWorkerEvent(
    world: { claimedFactionIds?: unknown },
    kind: ServerEventKind,
    factionId: string,
    detail: Record<string, string | number | boolean>,
): void {
    if (!telemetryEnabled(process.env)) return;
    const claimed = Array.isArray(world.claimedFactionIds) ? world.claimedFactionIds as string[] : [];
    if (!claimed.includes(factionId)) return;
    if (workerBuffer.length >= MAX_WORKER_BUFFER) return;
    workerBuffer.push({ factionId, kind, detail: serverDetail(detail), at: new Date() });
}

/** Write what the worker buffered this cycle. A failed write keeps the rows for the next one. */
export async function flushWorkerTelemetry(): Promise<number> {
    if (workerBuffer.length === 0) return 0;
    const batch = workerBuffer.slice(0, 500);
    try {
        await prisma.telemetryEvent.createMany({ data: batch });
        workerBuffer.splice(0, batch.length);
        return batch.length;
    } catch (e: any) {
        console.warn('[Telemetry] worker flush failed, will retry:', e?.message ?? e);
        return 0;
    }
}
