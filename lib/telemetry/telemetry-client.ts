// lib/telemetry/telemetry-client.ts
// Stars of Dominion — the browser half of telemetry.
//
// Started once by the game shell. Records which panels and overlays get
// opened, one heartbeat a minute while the game is on screen, orders refused
// before they reached the worker, and uncaught errors. Events are buffered and
// sent every 30 seconds, and once more when the tab is hidden or closed.
//
// Everything here is best-effort: a failed send is dropped, never retried in a
// loop, and never shown to the player.

'use client';

import { useUIStore } from '@/lib/store/ui-store';
import { isPageVisible, onPageVisibilityChange } from '@/hooks/usePageVisible';
import type { ClientEventKind } from './telemetry-rules';

const ENDPOINT = '/api/telemetry';
const FLUSH_MS = 30_000;
const HEARTBEAT_MS = 60_000;
/** Never hold more than this; a tab that cannot send drops the oldest. */
const MAX_BUFFER = 200;
/** One identical error is worth one report per session. */
const seenErrors = new Set<string>();

let buffer: Array<{ kind: ClientEventKind; detail?: Record<string, unknown>; at: number }> = [];
let started = false;

/** Note one event. Safe to call before start() and on the server (does nothing). */
export function track(kind: ClientEventKind, detail?: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;
    buffer.push({ kind, detail, at: Date.now() });
    if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
}

function payload(events: typeof buffer): string {
    const now = Date.now();
    return JSON.stringify({ events: events.map(e => ({ kind: e.kind, detail: e.detail, ageMs: now - e.at })) });
}

/** Send what is buffered. `leaving`: the tab is going away, so use a beacon. */
function flush(leaving = false): void {
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, 50);
    const body = payload(batch);
    try {
        if (leaving && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
            return;
        }
        void fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
        }).catch(() => { /* dropped on purpose */ });
    } catch {
        /* dropped on purpose */
    }
}

/**
 * Start recording. Idempotent: the shell may mount more than once. Returns a
 * stop function for tests and hot reload.
 */
export function startTelemetry(): () => void {
    if (typeof window === 'undefined' || started) return () => {};
    started = true;

    track('session_start', {
        w: window.innerWidth,
        h: window.innerHeight,
        touch: typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0,
    });

    // Panels and overlays, from the store the UI already drives.
    const unsubscribeStore = useUIStore.subscribe((state, previous) => {
        if (state.activeTab !== previous.activeTab && state.activeTab) {
            track('tab_opened', { tab: state.activeTab });
        }
        if (state.activeOverlay !== previous.activeOverlay && state.activeOverlay) {
            track('overlay_opened', { overlay: state.activeOverlay });
        }
    });

    // One heartbeat a minute while the game is actually on screen.
    const heartbeat = window.setInterval(() => {
        if (isPageVisible()) track('heartbeat');
    }, HEARTBEAT_MS);
    const flusher = window.setInterval(() => flush(), FLUSH_MS);

    const onHidden = onPageVisibilityChange(visible => { if (!visible) flush(true); });
    const onPageHide = () => flush(true);
    window.addEventListener('pagehide', onPageHide);

    const onError = (message: string) => {
        const key = message.slice(0, 120);
        if (!key || seenErrors.has(key)) return;
        seenErrors.add(key);
        track('client_error', { message: key });
    };
    const onWindowError = (event: ErrorEvent) => onError(String(event.message ?? 'error'));
    const onRejection = (event: PromiseRejectionEvent) =>
        onError(String((event.reason as any)?.message ?? event.reason ?? 'unhandled rejection'));
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
        flush(true);
        unsubscribeStore();
        window.clearInterval(heartbeat);
        window.clearInterval(flusher);
        onHidden();
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('error', onWindowError);
        window.removeEventListener('unhandledrejection', onRejection);
        started = false;
    };
}
