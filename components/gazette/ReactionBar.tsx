"use client";

// components/gazette/ReactionBar.tsx
// Stars of Dominion — the buttons under a gazette story.
//
// Up to three answers to an article (lib/narrative/reactions.ts), each an
// existing order dispatched through PRESS_REACT so the chronicle remembers
// it, or a panel to open. Greyed when the court cannot pay. Hidden for a
// reader with no empire. The relations the rules need are read off the
// synced world here, so reactions.ts stays pure.

import React from 'react';
import { Check } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { getSyncedWorld } from '@/hooks/useGameSync';
import { reactionsFor, type PublicEvent, type Reaction } from '@/lib/narrative/reactions';
import type { NavTab } from '@/types/ui-state';

const TONE: Record<Reaction['tone'], string> = {
    hostile: 'border-red-500/40 bg-red-950/30 text-red-100 hover:bg-red-900/40',
    friendly: 'border-emerald-500/40 bg-emerald-950/30 text-emerald-100 hover:bg-emerald-900/40',
    neutral: 'border-slate-600/50 bg-slate-900/60 text-slate-200 hover:bg-slate-800/60',
};

export default function ReactionBar({ articleId, headline, events }: { articleId: string; headline: string; events: PublicEvent[] }) {
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const observer = useUIStore(s => s.observer);
    const setActiveTab = useUIStore(s => s.setActiveTab);
    const politics = useUIStore(s => s.politicsState);
    const [answered, setAnswered] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    void politics; // re-render as the synced world moves
    if (!playerFactionId || observer || !events?.length) return null;

    const world: any = getSyncedWorld();
    const me = playerFactionId;
    const rivalryOf = (id: string) => world?.rivalries?.get?.(`rivalry-${me}-${id}`) ?? world?.rivalries?.get?.(`rivalry-${id}-${me}`);
    const reactions = reactionsFor(events, {
        readerFactionId: me,
        isAtWar: id => (rivalryOf(id)?.escalationLevel ?? 0) >= 7,
        rivalry: id => rivalryOf(id)?.rivalryScore ?? 20,
        exists: id => !!world?.economy?.factions?.has?.(id),
        politicalCapital: Number(world?.government?.get?.(me)?.politicalCapital ?? 0),
    });
    if (!reactions.length) return null;

    const act = async (r: Reaction) => {
        if (r.openTab) { setActiveTab(r.openTab as NavTab); return; }
        if (!r.actionId) return;
        setBusy(true);
        const result = await dispatchOrder({
            actionId: 'PRESS_REACT',
            payload: { articleId, headline, actionId: r.actionId, payload: r.payload ?? {} },
            factionId: me,
            label: r.label,
        });
        setBusy(false);
        setAnswered(result.success ? r.label : `refused: ${result.error ?? 'unknown'}`);
    };

    if (answered) return <p className="mt-2 text-[10px] font-mono text-emerald-400 flex items-center gap-1"><Check size={11} /> {answered}</p>;
    return (
        <div className="mt-2 flex flex-wrap gap-1.5">
            {reactions.map(r => (
                <button key={r.id} disabled={busy || !!r.disabled} onClick={() => act(r)} title={r.disabled ?? r.detail}
                    className={`min-h-[30px] px-2.5 rounded-md border text-[10px] font-semibold transition-colors disabled:opacity-40 ${TONE[r.tone]}`}>
                    {r.label}{r.pcCost > 0 && <span className="ml-1 font-mono opacity-70">·{r.pcCost}</span>}
                </button>
            ))}
        </div>
    );
}
