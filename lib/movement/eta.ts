// lib/movement/eta.ts
// Client-side ETA display helpers for fleet transit.
//
// `fleet.etaSeconds` is GAME seconds remaining. The worker advances 15 game
// seconds per 5 real seconds, so game time runs at 3× real time — divide to
// get the countdown a player actually experiences.

export const GAME_SECONDS_PER_REAL_SECOND = 3;

/**
 * Format a fleet's remaining travel time as a real-time countdown ("1:24",
 * "12s", "1h 05m"). `elapsedRealMs` lets callers tick the countdown between
 * authoritative snapshots. Returns null when there is nothing to show.
 */
export function formatFleetEta(gameEtaSeconds: number | null | undefined, elapsedRealMs = 0): string | null {
    if (typeof gameEtaSeconds !== 'number' || !Number.isFinite(gameEtaSeconds) || gameEtaSeconds <= 0) {
        return null;
    }
    const realSeconds = Math.max(0, gameEtaSeconds / GAME_SECONDS_PER_REAL_SECOND - elapsedRealMs / 1000);
    if (realSeconds < 1) return 'arriving';
    if (realSeconds < 60) return `${Math.ceil(realSeconds)}s`;
    if (realSeconds < 3600) {
        const m = Math.floor(realSeconds / 60);
        const s = Math.floor(realSeconds % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    }
    const h = Math.floor(realSeconds / 3600);
    const m = Math.floor((realSeconds % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
}
