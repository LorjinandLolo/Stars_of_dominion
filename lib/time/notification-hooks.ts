// lib/time/notification-hooks.ts
// Stars of Dominion — Notification Hooks
// Fires game notifications to in-memory store and (optionally) Appwrite.
// Pure side-effectful module: no return values.

import type { GameNotification } from './time-types';

// ─── In-Memory Notification Queue ────────────────────────────────────────────

const _notificationQueue: GameNotification[] = [];

/**
 * Fire a notification. Adds to the in-memory queue.
 * The client-side notification store polls or subscribes
 * to pick these up via the /api/notifications endpoint.
 *
 * Safe to call from any server-side context (server actions, tick processor, crisis engine).
 */
export function fireNotification(notification: GameNotification): void {
    _notificationQueue.push(notification);
    console.log(`[Notification] [${notification.priority.toUpperCase()}] ${notification.title}: ${notification.body}`);
}

/**
 * Drain and return all pending notifications for a given faction (or 'all').
 * Used by the /api/notifications polling endpoint.
 * Destructive: clears returned notifications from the queue.
 */
export function drainNotifications(factionId?: string): GameNotification[] {
    const matching = _notificationQueue.filter(n =>
        !factionId || n.factionId === factionId || n.factionId === 'all'
    );
    // Remove matched from queue
    const matchingIds = new Set(matching.map(n => n.id));
    for (let i = _notificationQueue.length - 1; i >= 0; i--) {
        if (matchingIds.has(_notificationQueue[i].id)) {
            _notificationQueue.splice(i, 1);
        }
    }
    return matching;
}

/**
 * Peek at notifications without consuming them.
 */
export function peekNotifications(factionId?: string): GameNotification[] {
    return _notificationQueue.filter(n =>
        !factionId || n.factionId === factionId || n.factionId === 'all'
    );
}

/**
 * Returns the current length of the queue (for health checks).
 */
export function getQueueLength(): number {
    return _notificationQueue.length;
}
