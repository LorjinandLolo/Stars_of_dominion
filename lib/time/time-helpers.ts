// lib/time/time-helpers.ts
// Stars of Dominion — Pure Time Helper Functions
// All inputs/outputs are UTC. No side effects.

import { TICK_HOURS_UTC, TICK_INTERVAL_HOURS } from './time-config';

// ─── Strategic Tick Helpers ───────────────────────────────────────────────────

/**
 * Returns the ISO timestamp of the next 6-hour strategic tick after `now`.
 * Ticks occur at 00:00, 06:00, 12:00, 18:00 UTC.
 */
export function getNextStrategicTick(now: Date = new Date()): Date {
    const candidate = new Date(now);
    candidate.setUTCMinutes(0, 0, 0);

    for (const hour of TICK_HOURS_UTC) {
        candidate.setUTCHours(hour);
        if (candidate > now) return candidate;
    }

    // Wrap to next day
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    candidate.setUTCHours(TICK_HOURS_UTC[0], 0, 0, 0);
    return candidate;
}

/**
 * Returns the last strategic tick that has already fired before `now`.
 */
export function getLastStrategicTick(now: Date = new Date()): Date {
    const candidate = new Date(now);
    candidate.setUTCMinutes(0, 0, 0);

    // Walk backwards through today's tick hours
    const hours = [...TICK_HOURS_UTC].reverse();
    for (const hour of hours) {
        candidate.setUTCHours(hour);
        if (candidate <= now) return candidate;
    }

    // Wrap to yesterday's last tick
    candidate.setUTCDate(candidate.getUTCDate() - 1);
    candidate.setUTCHours(TICK_HOURS_UTC[TICK_HOURS_UTC.length - 1], 0, 0, 0);
    return candidate;
}

/**
 * Returns how many complete strategic ticks fit between `now` and `targetTime`.
 */
export function getTicksRemaining(now: Date, targetTime: Date): number {
    const msRemaining = targetTime.getTime() - now.getTime();
    if (msRemaining <= 0) return 0;
    return Math.ceil(msRemaining / (TICK_INTERVAL_HOURS * 60 * 60 * 1000));
}

/**
 * Returns ms until the next strategic tick from `now`.
 */
export function getMsUntilNextTick(now: Date = new Date()): number {
    return getNextStrategicTick(now).getTime() - now.getTime();
}

// ─── Progress Helpers ─────────────────────────────────────────────────────────

/**
 * Returns a 0–100 progress percentage for a timed process.
 */
export function getProgressPercent(startTime: Date, endTime: Date, now: Date = new Date()): number {
    const total = endTime.getTime() - startTime.getTime();
    if (total <= 0) return 100;
    const elapsed = now.getTime() - startTime.getTime();
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

/**
 * Returns true if the given expiry timestamp has passed.
 */
export function isExpired(now: Date, expiresAt: Date | string): boolean {
    const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    return now >= expiry;
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

/**
 * Formats a millisecond duration as "HH:MM:SS" for countdowns.
 */
export function formatCountdown(ms: number): string {
    if (ms <= 0) return '00:00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Formats an ISO date as a human-readable UTC string: "18:00 UTC" or "Tomorrow 06:00 UTC".
 */
export function formatTickTime(isoDate: string, now: Date = new Date()): string {
    const target = new Date(isoDate);
    const isToday = target.getUTCDate() === now.getUTCDate() &&
                    target.getUTCMonth() === now.getUTCMonth() &&
                    target.getUTCFullYear() === now.getUTCFullYear();

    const hh = String(target.getUTCHours()).padStart(2, '0');
    const mm = String(target.getUTCMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm} UTC`;

    if (isToday) return timeStr;
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (target.getUTCDate() === tomorrow.getUTCDate()) return `Tomorrow ${timeStr}`;
    return `${target.toUTCString().slice(0, 11)} ${timeStr}`;
}

/**
 * Returns a human-readable "X strategic cycles" label.
 */
export function formatStrategicCycles(ticks: number): string {
    if (ticks === 0) return 'This cycle';
    if (ticks === 1) return '1 strategic cycle';
    return `${ticks} strategic cycles`;
}

/**
 * Estimates the ISO completion time for a project that needs `ticksRequired` more ticks.
 */
export function estimateCompletionTime(ticksRequired: number, now: Date = new Date()): string {
    let cursor = new Date(now);
    for (let i = 0; i < ticksRequired; i++) {
        cursor = getNextStrategicTick(cursor);
        // Move past this tick by 1ms to avoid re-matching same hour
        cursor = new Date(cursor.getTime() + 1);
    }
    return new Date(cursor.getTime() - 1).toISOString();
}

// ─── Crisis Timer Helpers ─────────────────────────────────────────────────────

/**
 * Calculates the expiry ISO timestamp for a crisis starting `now` with `durationHours`.
 */
export function getCrisisExpiry(durationHours: number, now: Date = new Date()): string {
    return new Date(now.getTime() + durationHours * 60 * 60 * 1000).toISOString();
}

/**
 * Returns ms remaining in a crisis window. Negative means expired.
 */
export function getCrisisTimeRemaining(expiresAt: string, now: Date = new Date()): number {
    return new Date(expiresAt).getTime() - now.getTime();
}
