'use client';
// components/defeat/DefeatOverlay.tsx
// The end of an empire, made visible. Until this existed, elimination was a
// latched status plus an undeliverable notification — a knocked-out player
// just saw a quiet galaxy and assumed the server was broken.

import React from 'react';
import { Skull, Eye } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';

export default function DefeatOverlay() {
    const playerDefeatStatus = useUIStore(s => s.playerDefeatStatus);
    const seasonInfo = useUIStore(s => s.seasonInfo);
    const factions = useUIStore(s => s.factions);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const [dismissed, setDismissed] = React.useState(false);

    if (playerDefeatStatus !== 'ELIMINATED' || dismissed) return null;

    const factionName = (playerFactionId && (factions as any)[playerFactionId]?.name) || 'Your empire';

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm">
            <div className="max-w-md w-full mx-4 p-8 rounded-2xl border border-red-900/60 bg-slate-900/95 text-center space-y-5 shadow-[0_0_60px_rgba(239,68,68,0.15)]">
                <Skull size={40} className="mx-auto text-red-500" />
                <h1 className="font-display text-xl tracking-[0.3em] text-red-400 uppercase">
                    Empire Fallen
                </h1>
                <p className="text-sm text-slate-300 leading-relaxed">
                    {factionName} holds no worlds. Its story in{' '}
                    <span className="text-slate-100 font-semibold">
                        {seasonInfo?.name ?? 'this season'}
                    </span>{' '}
                    is over — but the galaxy&apos;s isn&apos;t. The chronicle will remember
                    what you built, and what took it from you.
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                    You can keep watching the season unfold as an observer. When the
                    season closes, every empire — fallen ones included — appears in the
                    final reckoning.
                </p>
                <button
                    onClick={() => setDismissed(true)}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600/50 rounded-lg font-display text-[11px] tracking-[0.25em] text-slate-200 uppercase flex items-center justify-center gap-2 transition-all"
                >
                    <Eye size={14} />
                    Continue as Observer
                </button>
            </div>
        </div>
    );
}
