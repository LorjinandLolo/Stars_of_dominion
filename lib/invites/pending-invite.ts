'use client';

// lib/invites/pending-invite.ts
// Stars of Dominion — carry a friend link's code from /join through sign-up to
// the lobby. The link is opened once; registering, logging in and picking an
// empire are three pages later, possibly after a reload. localStorage is the
// right tool for a per-browser convenience like this (every access guarded:
// it can throw in a private window, and the flow must still work without it —
// the /join URL keeps the code too).

const KEY = 'sod-pending-invite';

export function rememberInvite(code: string): void {
    try { window.localStorage.setItem(KEY, code); } catch { /* private window */ }
}

export function pendingInvite(): string | null {
    try { return window.localStorage.getItem(KEY); } catch { return null; }
}

export function forgetInvite(): void {
    try { window.localStorage.removeItem(KEY); } catch { /* private window */ }
}
