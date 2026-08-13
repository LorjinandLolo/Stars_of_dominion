// lib/narrative/chronicle-flush.ts — the only place the chronicle touches the
// database on the write side.
//
// Kept apart from chronicle.ts on purpose. The recorder is imported by shared
// services (diplomacy, government, espionage) that the client bundles through
// hooks/useGameSync.ts, so it must stay free of `lib/db` — otherwise the `pg`
// driver is pulled into the browser build and Next fails with
// "Module not found: Can't resolve 'fs'". Only worker-side code imports this
// file.

import { prisma } from '../db';
import { drainBuffer, returnBuffer } from './chronicle';

/**
 * Write buffered events in one batch. Call after the world snapshot has been
 * persisted, so history can never claim something the saved world does not
 * show. On failure the rows go back on the buffer and the next cycle retries —
 * the chronicle is allowed to lag, never to lie.
 *
 * @returns number of rows written (0 on empty buffer or on error).
 */
export async function flushChronicle(): Promise<number> {
    const { rows, dropped } = drainBuffer();
    if (rows.length === 0) return 0;

    try {
        await prisma.chronicleEvent.createMany({ data: rows });
        if (dropped > 0) {
            console.warn(`[Chronicle] Buffer overflowed — ${dropped} event(s) dropped.`);
        }
        return rows.length;
    } catch (e: any) {
        returnBuffer(rows);
        console.error('[Chronicle] Flush failed, retrying next cycle:', e.message);
        return 0;
    }
}
