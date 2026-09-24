// lib/time/galactic-time.ts
// Stars of Dominion — the one clock a player sees.
//
// The simulation runs at 15x (lib/time/time-config.ts); players do not. Every
// countdown for something a player must react to goes through here, and comes
// out in the player's own calendar: "today at 18:40", "tomorrow at 09:15",
// "in 3 days". Never sim hours, never strategic ticks, never cycle numbers —
// those are for depth players and live only in TopNav's tick counter.
//
// Pure and dependency-free past time-config, so the worker, the API routes and
// the client bundle all format the same way.

import { SIM_SECONDS_PER_REAL_SECOND } from './time-config';

const DAY_MS = 86_400_000;

/** Real seconds until a sim-clock instant. Negative once it has passed. */
export function realSecondsUntil(atSimSeconds: number, nowSimSeconds: number): number {
    return (atSimSeconds - nowSimSeconds) / SIM_SECONDS_PER_REAL_SECOND;
}

/** Whole calendar days between two instants, in the viewer's local time. */
function calendarDaysBetween(from: Date, to: Date): number {
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
    const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
    return Math.round((b - a) / DAY_MS);
}

function clockTime(at: Date): string {
    return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export interface DeadlineFormatOptions {
    /** Add the time of day to "today" / "tomorrow". Default true. */
    withTime?: boolean;
    /** Real clock "now". Injected so tests are not wall-clock dependent. */
    now?: Date;
}

/**
 * A deadline given as real seconds from now, in calendar words.
 *   < 0            → "expired"
 *   same day       → "today at 18:40"   (or "today")
 *   next day       → "tomorrow at 09:15" (or "tomorrow")
 *   later          → "in 3 days"
 */
export function formatRealDeadline(realSecondsLeft: number, options: DeadlineFormatOptions = {}): string {
    if (!Number.isFinite(realSecondsLeft)) return 'no deadline';
    if (realSecondsLeft <= 0) return 'expired';
    const now = options.now ?? new Date();
    const withTime = options.withTime ?? true;
    const at = new Date(now.getTime() + realSecondsLeft * 1000);
    const days = calendarDaysBetween(now, at);
    if (days <= 0) return withTime ? `today at ${clockTime(at)}` : 'today';
    if (days === 1) return withTime ? `tomorrow at ${clockTime(at)}` : 'tomorrow';
    return `in ${days} days`;
}

/** A sim-clock deadline, in calendar words. The formatter every panel uses. */
export function formatGalacticDeadline(
    atSimSeconds: number,
    nowSimSeconds: number,
    options: DeadlineFormatOptions = {},
): string {
    return formatRealDeadline(realSecondsUntil(atSimSeconds, nowSimSeconds), options);
}

/**
 * A length of real time, for cooldowns and waits: "12 minutes", "about 3
 * hours", "2 days". For "how long until I can", not "when" — deadlines use
 * formatRealDeadline.
 */
export function formatRealDuration(realSeconds: number): string {
    if (!Number.isFinite(realSeconds) || realSeconds <= 0) return 'no time';
    const minutes = Math.ceil(realSeconds / 60);
    if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
    const hours = Math.round(realSeconds / 3600);
    if (hours < 24) return hours === 1 ? 'about an hour' : `about ${hours} hours`;
    const days = Math.round(realSeconds / 86_400);
    return days === 1 ? '1 day' : `${days} days`;
}

/** Strategic ticks (6 sim hours each) as real time, for anything counted in turns. */
export function formatTicksAsRealDuration(ticks: number): string {
    return formatRealDuration((ticks * 6 * 3600) / SIM_SECONDS_PER_REAL_SECOND);
}

/** Sim seconds as a length of real time. */
export function formatSimDurationAsReal(simSeconds: number): string {
    return formatRealDuration(simSeconds / SIM_SECONDS_PER_REAL_SECOND);
}

/** Less than this much real time left reads as urgent in the UI. */
export const URGENT_REAL_SECONDS = 3 * 3600;

/** True when a sim-clock deadline is close enough to paint red. */
export function isUrgentDeadline(atSimSeconds: number, nowSimSeconds: number): boolean {
    const left = realSecondsUntil(atSimSeconds, nowSimSeconds);
    return left > 0 && left < URGENT_REAL_SECONDS;
}

/**
 * When something happened, for the bell and the brief: "today", "yesterday",
 * "3 days ago". Real (wall-clock) timestamps, calendar words.
 */
export function formatRealAgo(at: Date | string, now: Date = new Date()): string {
    const when = typeof at === 'string' ? new Date(at) : at;
    if (Number.isNaN(when.getTime())) return '';
    const days = calendarDaysBetween(when, now);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
}
