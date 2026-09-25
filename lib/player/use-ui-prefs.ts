'use client';

// lib/player/use-ui-prefs.ts
// Stars of Dominion — load and change the player's interface preferences.
//
// The dock, the identity menu and the first-open advisor prompt all read the
// same store slot; this is the only code that talks to /api/player/prefs.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import type { UiPrefs, UiPrefsPatch } from './ui-prefs';
import { applyUiPrefsPatch, defaultUiPrefs } from './ui-prefs';
import type { DockVisibilityContext } from '@/lib/goals/dock-unlocks';

/** Fetch once per signed-in faction. Safe to call from several components. */
export function useLoadUiPrefs(): void {
    const playerFactionId = useUIStore(s => s.playerFactionId);
    React.useEffect(() => {
        if (!playerFactionId) return;
        let cancelled = false;
        fetch('/api/player/prefs', { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
                if (!cancelled && data?.prefs) useUIStore.getState().setUiPrefs(data.prefs as UiPrefs);
            })
            .catch(() => { /* offline: the dock falls back to showing everything */ });
        return () => { cancelled = true; };
    }, [playerFactionId]);
}

/**
 * What the dock needs to decide visibility. Until preferences have loaded the
 * answer is "show everything": an existing player must never watch buttons
 * blink out and back while a request is in flight. A new player sees the
 * extra buttons for that moment instead, which is the harmless direction.
 */
export function useDockContext(): DockVisibilityContext {
    const uiPrefs = useUIStore(s => s.uiPrefs);
    const goalsCompleted = useUIStore(s => s.goalsCompleted);
    return React.useMemo(() => ({
        showEverything: uiPrefs ? uiPrefs.showEverything : true,
        completedGoals: goalsCompleted,
    }), [uiPrefs, goalsCompleted]);
}

/** Change preferences: the store updates at once, the server follows. */
export async function patchUiPrefs(patch: UiPrefsPatch): Promise<void> {
    const store = useUIStore.getState();
    store.setUiPrefs(applyUiPrefsPatch(store.uiPrefs ?? defaultUiPrefs(), patch));
    try {
        const res = await fetch('/api/player/prefs', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (res.ok && data?.prefs) useUIStore.getState().setUiPrefs(data.prefs as UiPrefs);
    } catch {
        // Kept locally; the next load reconciles with whatever the server has.
    }
}
