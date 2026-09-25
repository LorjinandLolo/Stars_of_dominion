// lib/player/ui-prefs.ts
// Stars of Dominion — a player's interface preferences, as stored.
//
// One JSON TEXT column on PlayerProfile (uiPrefs), per the repo's convention
// for JSON-bearing columns. Parsed and normalised here so the API route and
// the client agree on the shape and on the defaults.
//
// Null in the database means a new account: the progressive dock applies.
// Accounts that existed before it were migrated to { showEverything, legacy }
// (prisma/migrations/*_player_ui_prefs), so nothing changed for them.

export interface UiPrefs {
    /** Every dock button, regardless of first-week goals. */
    showEverything: boolean;
    /** Account predates the progressive dock: nothing was ever hidden from it. */
    legacy: boolean;
    /**
     * Advanced dock items (dock-unlocks ids) this player has opened at least
     * once. The first opening of a newly unlocked system is when the player is
     * offered to take it back from their advisors; this remembers it happened.
     */
    opened: string[];
}

export function defaultUiPrefs(): UiPrefs {
    return { showEverything: false, legacy: false, opened: [] };
}

/** Parse the stored column. Anything malformed reads as a new account's defaults. */
export function parseUiPrefs(raw: string | null | undefined): UiPrefs {
    if (!raw) return defaultUiPrefs();
    try {
        const parsed = JSON.parse(raw);
        return {
            showEverything: parsed?.showEverything === true,
            legacy: parsed?.legacy === true,
            opened: Array.isArray(parsed?.opened)
                ? parsed.opened.filter((id: unknown): id is string => typeof id === 'string').slice(0, 64)
                : [],
        };
    } catch {
        return defaultUiPrefs();
    }
}

/** What a client may change. `legacy` is set by migration only. */
export interface UiPrefsPatch {
    showEverything?: boolean;
    /** Ids to add to `opened`. */
    opened?: string[];
}

export function applyUiPrefsPatch(current: UiPrefs, patch: UiPrefsPatch): UiPrefs {
    const next: UiPrefs = { ...current, opened: [...current.opened] };
    if (typeof patch.showEverything === 'boolean') next.showEverything = patch.showEverything;
    for (const id of patch.opened ?? []) {
        if (typeof id !== 'string' || id.length > 64) continue;
        if (!next.opened.includes(id)) next.opened.push(id);
    }
    next.opened = next.opened.slice(0, 64);
    return next;
}
