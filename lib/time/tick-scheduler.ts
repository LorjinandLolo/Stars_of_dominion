// lib/time/tick-scheduler.ts
// Stars of Dominion — Strategic Tick Scheduler
// Idempotent: safe to call multiple times within the same tick window.

import { getNextStrategicTick, getLastStrategicTick } from './time-helpers';
import { runStrategicTick } from './tick-processor';

export interface TickSchedulerResult {
    ran: boolean;
    tickIndex: number;
    lastTickAt: string;
    nextTickAt: string;
    skippedReason?: string;
}

// In-memory guard (persisted to Appwrite in production via the API route)
let _lastProcessedTickAt: string | null = null;
let _tickIndex = 0;

/**
 * Attempt to run a strategic tick if one is due.
 * Idempotent — calling twice within the same 6-hour window is safe and returns early.
 *
 * @param nowOverride - Optional date for testing/tutorial speed modes
 * @param externalLastTickAt - ISO string from Appwrite world_state (overrides in-memory guard)
 * @param externalTickIndex - Tick index from Appwrite
 * @param world - Optional authoritative world to tick. Pass this when the caller
 *   owns a deserialized world (multiplayer worker); omit for singleton/dev mode.
 */
export async function tryRunStrategicTick(
    nowOverride?: Date,
    externalLastTickAt?: string,
    externalTickIndex?: number,
    world?: Parameters<typeof runStrategicTick>[2]
): Promise<TickSchedulerResult> {
    const now = nowOverride ?? new Date();

    // Use external state from Appwrite if provided (prevents double-apply on restart)
    if (externalLastTickAt !== undefined) _lastProcessedTickAt = externalLastTickAt;
    if (externalTickIndex !== undefined) _tickIndex = externalTickIndex;

    const lastTick = getLastStrategicTick(now);
    const nextTick = getNextStrategicTick(now);
    const lastTickIso = lastTick.toISOString();

    // ── Idempotency guard ──────────────────────────────────────────────────────
    if (_lastProcessedTickAt && _lastProcessedTickAt >= lastTickIso) {
        return {
            ran: false,
            tickIndex: _tickIndex,
            lastTickAt: _lastProcessedTickAt,
            nextTickAt: nextTick.toISOString(),
            skippedReason: 'Tick already processed for this window',
        };
    }

    // ── Run the tick ───────────────────────────────────────────────────────────
    // Claim the window synchronously BEFORE awaiting. runStrategicTick yields at its
    // internal awaits; without claiming first, a second concurrent call would pass the
    // idempotency guard above and re-apply the entire tick (double resources/research).
    const previousProcessedAt = _lastProcessedTickAt;
    const previousTickIndex = _tickIndex;
    _lastProcessedTickAt = lastTickIso;
    _tickIndex = previousTickIndex + 1;

    try {
        await runStrategicTick(now, _tickIndex, world);
    } catch (err) {
        console.error('[TickScheduler] Tick processor failed:', err);
        // Roll back the optimistic claim so a retry can re-run this window.
        _lastProcessedTickAt = previousProcessedAt;
        _tickIndex = previousTickIndex;
        throw err; // Let caller handle / retry
    }

    return {
        ran: true,
        tickIndex: _tickIndex,
        lastTickAt: lastTickIso,
        nextTickAt: nextTick.toISOString(),
    };
}

/**
 * Force a tick regardless of timer (for testing/tutorial acceleration).
 */
export async function forceStrategicTick(): Promise<TickSchedulerResult> {
    const now = new Date();
    await runStrategicTick(now, _tickIndex + 1);
    _tickIndex++;
    _lastProcessedTickAt = now.toISOString();

    return {
        ran: true,
        tickIndex: _tickIndex,
        lastTickAt: _lastProcessedTickAt,
        nextTickAt: getNextStrategicTick(now).toISOString(),
    };
}

export function getCurrentTickState() {
    const now = new Date();
    return {
        tickIndex: _tickIndex,
        lastTickAt: _lastProcessedTickAt,
        nextTickAt: getNextStrategicTick(now).toISOString(),
    };
}
