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
 */
export async function tryRunStrategicTick(
    nowOverride?: Date,
    externalLastTickAt?: string,
    externalTickIndex?: number
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
    try {
        await runStrategicTick(now, _tickIndex + 1);
    } catch (err) {
        console.error('[TickScheduler] Tick processor failed:', err);
        throw err; // Let caller handle / retry
    }

    _tickIndex++;
    _lastProcessedTickAt = lastTickIso;

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
