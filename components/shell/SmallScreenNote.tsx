"use client";

// components/shell/SmallScreenNote.tsx
// Stars of Dominion — "best on a larger screen" (casual-play spec Item 8).
//
// The five-minute path works on a phone: the brief, the goal card, messages,
// the lobby and the public gazette. The galaxy map and the depth panels are
// built for a wide screen and stay that way. This strip says so, once, under
// the top bar, and only below the `md` breakpoint. Dismissed per browser.

import React from 'react';
import { MonitorSmartphone, X } from 'lucide-react';

const DISMISS_KEY = 'sod-small-screen-note-dismissed';

export default function SmallScreenNote() {
    // Hidden until the stored choice is read, so it never flashes for a player
    // who already closed it.
    const [dismissed, setDismissed] = React.useState(true);

    React.useEffect(() => {
        try { setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1'); }
        catch { setDismissed(false); }
    }, []);

    if (dismissed) return null;

    const dismiss = () => {
        setDismissed(true);
        try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private window */ }
    };

    return (
        <div
            id="small-screen-note"
            className="md:hidden relative z-40 flex items-center gap-2 pl-3 pr-1 py-1 border-b border-slate-800/80 bg-slate-900/95 text-slate-300"
        >
            <MonitorSmartphone size={16} className="text-sky-400 shrink-0" />
            <p className="flex-1 text-[11px] leading-snug">
                The map and the detailed panels are best on a larger screen. Your brief, your goal and
                your messages work here.
            </p>
            <button
                onClick={dismiss}
                title="Got it"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-slate-800/60 transition-colors shrink-0"
            >
                <X size={16} />
            </button>
        </div>
    );
}
