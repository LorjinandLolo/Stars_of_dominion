'use client';
// hooks/usePageVisible.ts
// One source of truth for "is the player looking at the game?".
//
// The game is meant to be left open in a background tab all day. Nothing used
// to listen for visibilitychange, so a hidden tab kept polling every 4 s,
// rebuilding the store, ticking 1 Hz clocks and animating the galaxy map.
// Everything that does recurring work should pause through this module.

import { useEffect, useRef, useSyncExternalStore } from 'react';

/** True unless the document reports itself hidden. Server render counts as visible. */
export function isPageVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function subscribe(onChange: () => void): () => void {
    if (typeof document === 'undefined') return () => {};
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
}

/** React: re-renders when the tab is hidden or shown. */
export function usePageVisible(): boolean {
    return useSyncExternalStore(subscribe, isPageVisible, () => true);
}

/**
 * Non-React: call `listener(visible)` on every change. Returns an unsubscribe.
 * Does NOT fire immediately; read isPageVisible() for the current state.
 */
export function onPageVisibilityChange(listener: (visible: boolean) => void): () => void {
    return subscribe(() => listener(isPageVisible()));
}

/**
 * setInterval that only runs while the player is looking. Hidden: no timer at
 * all. Shown again: `callback` fires once at once (the clock catches up), then
 * every `ms`. The latest callback is always the one called, so callers need
 * not memoise it.
 */
export function useVisibleInterval(callback: () => void, ms: number): void {
    const visible = usePageVisible();
    const latest = useRef(callback);
    useEffect(() => { latest.current = callback; });
    useEffect(() => {
        if (!visible) return;
        latest.current();
        const id = setInterval(() => latest.current(), ms);
        return () => clearInterval(id);
    }, [visible, ms]);
}
