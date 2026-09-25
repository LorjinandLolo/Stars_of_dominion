"use client";

// components/goals/UnlockPrompt.tsx
// Stars of Dominion — the first time a newly unlocked panel is opened.
//
// A system a new player could not see was being run by their advisors
// (lib/delegation). The first time they open it, they are asked once whether
// to take it back or leave it where it is. Either answer is remembered, so the
// question never comes up again for that panel. Accounts that predate the
// progressive dock never see it: nothing was hidden from them.

import React from 'react';
import { ShieldCheck, Hand } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { categoryForTab } from '@/components/shell/dockConfig';
import { dockUnlockFor, type DockUnlock } from '@/lib/goals/dock-unlocks';
import { defaultDelegation, DELEGATION_LABELS } from '@/lib/delegation/delegation-types';
import { patchUiPrefs } from '@/lib/player/use-ui-prefs';
import { dispatchOrder } from '@/lib/multiplayer/order-client';

/** The advanced item the active tab is in, if any: a sub-tab rule wins over its category. */
function unlockForTab(tab: string): DockUnlock | undefined {
    return dockUnlockFor(tab) ?? (categoryForTab(tab as any) ? dockUnlockFor(categoryForTab(tab as any)!.id) : undefined);
}

export default function UnlockPrompt() {
    const activeTab = useUIStore(s => s.activeTab);
    const uiPrefs = useUIStore(s => s.uiPrefs);
    const delegation = useUIStore(s => s.delegation);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const [asking, setAsking] = React.useState<DockUnlock | null>(null);

    React.useEffect(() => {
        if (!uiPrefs || uiPrefs.legacy || !playerFactionId) return;
        const rule = unlockForTab(activeTab);
        if (!rule || uiPrefs.opened.includes(rule.id)) return;

        // Remember the first opening whatever happens next.
        void patchUiPrefs({ opened: [rule.id] });

        const delegated = rule.delegates
            ? ({ ...defaultDelegation(), ...(delegation ?? {}) })[rule.delegates]
            : false;
        if (delegated) setAsking(rule);
    }, [activeTab, uiPrefs, delegation, playerFactionId]);

    if (!asking || !asking.delegates) return null;
    const advisors = DELEGATION_LABELS[asking.delegates];

    const takeBack = async () => {
        const system = asking.delegates!;
        setAsking(null);
        if (!playerFactionId) return;
        await dispatchOrder({
            actionId: 'GOV_SET_DELEGATION',
            payload: { system, enabled: false },
            factionId: playerFactionId,
            label: `Take back ${system}`,
        });
    };

    return (
        <div className="fixed inset-0 z-[8500] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div id="unlock-prompt" className="w-full max-w-md rounded-2xl border border-sky-500/30 bg-slate-950/95 shadow-2xl shadow-black/60 p-6 space-y-4">
                <div>
                    <p className="text-[10px] font-display tracking-[0.25em] uppercase text-sky-400 mb-1">Newly unlocked · {asking.label}</p>
                    <h2 className="text-xl font-display uppercase tracking-wider text-white leading-tight">
                        Your {advisors.title} has been running this
                    </h2>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{advisors.detail}</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                    Take it back and every decision here is yours — including what happens when you are away.
                    You can change this any time in Empire → Government → Advisors.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                    <button
                        onClick={takeBack}
                        className="flex-1 min-h-[40px] flex items-center justify-center gap-2 rounded-lg bg-sky-600/80 hover:bg-sky-500/80 text-white text-xs font-bold transition-colors"
                    >
                        <Hand size={14} /> Take it back
                    </button>
                    <button
                        onClick={() => setAsking(null)}
                        className="flex-1 min-h-[40px] flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold transition-colors"
                    >
                        <ShieldCheck size={14} /> Leave it with them
                    </button>
                </div>
            </div>
        </div>
    );
}
