// lib/time/notification-hooks.ts
// Stars of Dominion — Notification Hooks
// Fires game notifications to an in-memory queue. Pure side-effectful module:
// no return values, no imports of the world.
//
// There are two queues, because there are two processes. The game loop has its
// own (scripts/game-loop.ts drains it with no faction and copies each note onto
// the target factions' records, which ride the faction shards to the client).
// This one is the Next.js server's, drained per caller by /api/notifications —
// server actions that touch lib/government fire into it.
//
// A note addressed to 'all' has to reach every faction, so a drain by one
// faction must not consume it for the rest. Targeted notes are taken off the
// queue by the faction they belong to; broadcasts stay and remember who has
// already had them, and age out.

import type { GameNotification } from './time-types';

// ─── In-Memory Notification Queue ────────────────────────────────────────────

const _notificationQueue: GameNotification[] = [];

/** Who has already been handed each broadcast, and when it was queued (wall clock). */
const _broadcasts = new Map<string, { queuedAt: number; delivered: Set<string> }>();

/** A broadcast nobody has collected in this long is dropped. */
const BROADCAST_TTL_MS = 30 * 60_000;
/** Hard ceiling, so a process nobody polls cannot grow without bound. */
const MAX_QUEUE = 500;

const isBroadcast = (n: GameNotification) => n.factionId === 'all';

/** Drop broadcasts nobody has collected in a while, and trim a runaway queue. */
function prune(now = Date.now()): void {
    for (let i = _notificationQueue.length - 1; i >= 0; i--) {
        const note = _notificationQueue[i];
        if (!isBroadcast(note)) continue;
        const state = _broadcasts.get(note.id);
        if (state && now - state.queuedAt < BROADCAST_TTL_MS) continue;
        _notificationQueue.splice(i, 1);
        _broadcasts.delete(note.id);
    }
    while (_notificationQueue.length > MAX_QUEUE) {
        const dropped = _notificationQueue.shift();
        if (dropped) _broadcasts.delete(dropped.id);
    }
}

/**
 * Fire a notification. Adds to the in-memory queue.
 * The client-side notification store polls or subscribes
 * to pick these up via the /api/notifications endpoint.
 *
 * Safe to call from any server-side context (server actions, tick processor, crisis engine).
 */
export function fireNotification(notification: GameNotification): void {
    _notificationQueue.push(notification);
    if (isBroadcast(notification)) {
        _broadcasts.set(notification.id, { queuedAt: Date.now(), delivered: new Set() });
    }
    prune();
    console.log(`[Notification] [${notification.priority.toUpperCase()}] ${notification.title}: ${notification.body}`);
}

/** Notes this faction has not been handed yet. `undefined` = everything queued. */
function pendingFor(factionId: string | undefined): GameNotification[] {
    return _notificationQueue.filter(n => {
        if (!factionId) return true;
        if (n.factionId === factionId) return true;
        return isBroadcast(n) && !_broadcasts.get(n.id)?.delivered.has(factionId);
    });
}

/**
 * Drain and return this faction's pending notifications.
 *
 * With a faction: its own notes leave the queue, and broadcasts are handed over
 * once each — they stay queued for the factions that have not polled yet. This
 * used to delete every match, so whichever player polled first swallowed the
 * season endings and eliminations meant for all fourteen.
 *
 * With no faction (the game loop, which does its own fan-out, and the tests):
 * takes everything and empties the queue.
 */
export function drainNotifications(factionId?: string): GameNotification[] {
    prune();
    const matching = pendingFor(factionId);
    if (!factionId) {
        _notificationQueue.length = 0;
        _broadcasts.clear();
        return matching;
    }

    const consumed = new Set<string>();
    for (const note of matching) {
        if (isBroadcast(note)) _broadcasts.get(note.id)?.delivered.add(factionId);
        else consumed.add(note.id);
    }
    if (consumed.size) {
        for (let i = _notificationQueue.length - 1; i >= 0; i--) {
            if (consumed.has(_notificationQueue[i].id)) _notificationQueue.splice(i, 1);
        }
    }
    return matching;
}

/**
 * Peek at notifications without consuming them — the same list a drain would
 * return, but nothing is marked as delivered.
 */
export function peekNotifications(factionId?: string): GameNotification[] {
    prune();
    return pendingFor(factionId);
}

/**
 * Returns the current length of the queue (for health checks).
 */
export function getQueueLength(): number {
    return _notificationQueue.length;
}
