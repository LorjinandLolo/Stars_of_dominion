// lib/narrative/chronicle.ts — the recorder the simulation writes history with.
//
// Contract with the tick (docs/narrative-system/README.md, Invariants 2 and 4):
//   * record() is synchronous, allocation-only, and can never throw into a tick
//     step. It buffers in memory.
//   * Nothing here reads or mutates world state beyond the clock.
//   * The chronicle is append-only. Cover-ups change attribution, never facts.
//
// THIS MODULE MUST NOT IMPORT THE DATABASE. Emission sites live in shared
// services (diplomacy, government, espionage) that the client bundles through
// hooks/useGameSync.ts; importing lib/db here pulls the `pg` driver into the
// browser and breaks the build with "Can't resolve 'fs'". The database write
// lives in chronicle-flush.ts, which only the worker imports.

import { scoreImportance } from './chronicle-importance';
import { prettifyFactionId } from './naming';
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

/**
 * What the recorder needs from the caller: the sim clock, and — when available
 * — the faction roster it uses to stamp display names onto the event.
 */
interface ClockLike {
    nowSeconds: number;
    economy?: { factions?: Map<string, { name?: string }> };
}

/**
 * Turn a faction id into something printable.
 *
 * Names are resolved here, at emission, for two reasons: they live in
 * per-faction shards rather than the world snapshot, so the narrator would have
 * no cheap way to look them up later; and a faction that renames itself must
 * not retroactively rename itself in articles already written about it.
 *
 * Runtime-created factions (civil-war splinters, for instance) may not be in
 * the roster yet, so ids fall back to a readable form of themselves.
 */
function resolveNames(world: ClockLike, ids: string[]): string[] {
    const roster = world?.economy?.factions;
    return ids.map(id => roster?.get?.(id)?.name || prettifyFactionId(id));
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

        const actorIds = draft.actorIds ?? [];
        const targetIds = draft.targetIds ?? [];

        buffer.push({
            tick: tickFromSeconds(nowSeconds),
            day: dayFromSeconds(nowSeconds),
            type: draft.type,
            importance,
            actorIds: JSON.stringify(actorIds),
            targetIds: JSON.stringify(targetIds),
            actorNames: JSON.stringify(resolveNames(world, actorIds)),
            targetNames: JSON.stringify(resolveNames(world, targetIds)),
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
 * Hand the buffered rows to the writer and clear them.
 *
 * Called only by chronicle-flush.ts. Detaching before the caller awaits means
 * record() calls that land during the write belong to the next batch, not this
 * one. Returns the drained rows and how many were dropped to the cap.
 */
export function drainBuffer(): { rows: ChronicleRow[]; dropped: number } {
    const rows = buffer;
    const dropped = droppedSinceLastFlush;
    buffer = [];
    droppedSinceLastFlush = 0;
    return { rows, dropped };
}

/**
 * Put a failed batch back at the front so ordering survives the retry, dropping
 * the oldest if that would blow the cap. The chronicle is allowed to lag; it is
 * not allowed to reorder history.
 */
export function returnBuffer(rows: ChronicleRow[]): void {
    buffer = [...rows, ...buffer].slice(-MAX_BUFFERED);
}
