// lib/narrative/chronicle.ts — the recorder the simulation writes history with.
//
// Contract with the tick (docs/narrative-system/README.md, Invariants 2 and 4):
//   * record() is synchronous, allocation-only, and can never throw into a tick
//     step. It buffers in memory.
//   * flushChronicle() runs ONCE per cycle, AFTER the world snapshot commits,
//     so a crash mid-tick cannot leave the chronicle claiming things the saved
//     world does not show.
//   * Nothing here reads or mutates world state beyond the clock.
//   * The chronicle is append-only. Cover-ups change attribution, never facts.

import { prisma } from '../db';
import { scoreImportance } from './chronicle-importance';
import type { ChronicleDraft, ChronicleRow } from './chronicle-types';

/** Strategic ticks are 6-hour windows — the same unit game-loop.ts fires on. */
const SECONDS_PER_TICK = 6 * 3600;
const SECONDS_PER_DAY = 24 * 3600;

/** Canonical tick index for a sim-clock reading. Matches the strategic-tick
 *  window in scripts/game-loop.ts; keep the two in step. */
export function tickFromSeconds(nowSeconds: number): number {
    return Math.floor(nowSeconds / SECONDS_PER_TICK);
}

/** Canonical gazette day for a sim-clock reading. */
export function dayFromSeconds(nowSeconds: number): number {
    return Math.floor(nowSeconds / SECONDS_PER_DAY);
}

/**
 * Cap on the in-memory buffer. If the narrator's database is unreachable for a
 * long stretch, the game keeps ticking and old drafts are dropped rather than
 * growing the worker's heap without bound. Losing prose beats losing the game.
 */
const MAX_BUFFERED = 2000;

let buffer: ChronicleRow[] = [];
let droppedSinceLastFlush = 0;

/** Anything the recorder can be handed that carries the sim clock. */
interface ClockLike {
    nowSeconds: number;
}

/**
 * Record an event. Safe to call from anywhere inside a tick step or an order
 * handler — it never touches the database and never throws.
 */
export function record(world: ClockLike, draft: ChronicleDraft): void {
    try {
        if (buffer.length >= MAX_BUFFERED) {
            droppedSinceLastFlush++;
            return;
        }

        // A caller without a valid sim clock is broken. Recording anyway would
        // file the event on day 0 — junk at the very front of the gazette's
        // history, and unfixable later because the chronicle is append-only.
        const nowSeconds = world?.nowSeconds;
        if (typeof nowSeconds !== 'number' || !Number.isFinite(nowSeconds) || nowSeconds <= 0) {
            console.warn(`[Chronicle] Dropped ${draft?.type ?? 'unknown'} event — no sim clock on the caller.`);
            return;
        }

        const facts = draft.facts ?? {};
        const importance = draft.importanceOverride !== undefined
            ? Math.max(0, Math.min(100, Math.round(draft.importanceOverride)))
            : scoreImportance(draft.type, facts);

        buffer.push({
            tick: tickFromSeconds(nowSeconds),
            day: dayFromSeconds(nowSeconds),
            type: draft.type,
            importance,
            actorIds: JSON.stringify(draft.actorIds ?? []),
            targetIds: JSON.stringify(draft.targetIds ?? []),
            location: draft.location ?? null,
            facts: JSON.stringify(facts),
            attribution: draft.attribution ?? 'exposed',
            coalesceKey: draft.coalesceKey ?? null,
        });
    } catch {
        // A malformed draft must never break a tick. The event is simply lost.
    }
}

/** Events waiting to be written. Exposed for tests and diagnostics. */
export function pendingCount(): number {
    return buffer.length;
}

/** Drop everything unwritten. Tests only — the game never discards history. */
export function resetChronicleBuffer(): void {
    buffer = [];
    droppedSinceLastFlush = 0;
}

/**
 * Write buffered events in one batch. Call after the world snapshot has been
 * persisted. On failure the buffer is kept so the next cycle retries — the
 * chronicle is allowed to lag, never to lie.
 *
 * @returns number of rows written (0 on empty buffer or on error).
 */
export async function flushChronicle(): Promise<number> {
    if (buffer.length === 0) return 0;

    // Detach before awaiting: record() calls that land during the write belong
    // to the next batch, not this one.
    const batch = buffer;
    buffer = [];

    try {
        await prisma.chronicleEvent.createMany({ data: batch });
        if (droppedSinceLastFlush > 0) {
            console.warn(`[Chronicle] Buffer overflowed — ${droppedSinceLastFlush} event(s) dropped.`);
            droppedSinceLastFlush = 0;
        }
        return batch.length;
    } catch (e: any) {
        // Put them back at the front so ordering survives the retry, unless
        // that would blow the cap — then the oldest go.
        buffer = [...batch, ...buffer].slice(-MAX_BUFFERED);
        console.error('[Chronicle] Flush failed, retrying next cycle:', e.message);
        return 0;
    }
}
