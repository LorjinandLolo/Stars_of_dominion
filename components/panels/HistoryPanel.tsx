'use client';

// The galaxy's archive. Everything the narrator has ever written, filterable by
// kind, so a player can read back through the war their grandparents started.
//
// Reads /api/narrative/history — no game state, no store subscription. History
// does not change when the world ticks; it only grows.

import React, { useState } from 'react';
import useSWR from 'swr';
import { BookOpen, Newspaper, Search, Skull, Landmark } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

type Kind = 'all' | 'news' | 'investigation' | 'obituary' | 'retrospective';

const FILTERS: { kind: Kind; label: string; icon: React.ReactNode }[] = [
    { kind: 'all', label: 'ALL', icon: <BookOpen size={12} /> },
    { kind: 'news', label: 'NEWS', icon: <Newspaper size={12} /> },
    { kind: 'investigation', label: 'EXPOSÉS', icon: <Search size={12} /> },
    { kind: 'obituary', label: 'OBITUARIES', icon: <Skull size={12} /> },
    { kind: 'retrospective', label: 'ERAS', icon: <Landmark size={12} /> },
];

const KIND_ACCENT: Record<string, string> = {
    news: 'text-slate-400 border-slate-700',
    investigation: 'text-amber-300/90 border-amber-700/50',
    obituary: 'text-violet-300/90 border-violet-700/50',
    retrospective: 'text-cyan-300/90 border-cyan-700/50',
};

export default function HistoryPanel() {
    const [kind, setKind] = useState<Kind>('all');
    const [openId, setOpenId] = useState<string | null>(null);

    const url = kind === 'all' ? '/api/narrative/history' : `/api/narrative/history?kind=${kind}`;
    const { data, error } = useSWR(url, fetcher, { refreshInterval: 30000 });

    const counts: Record<string, number> = data?.counts ?? {};
    const total = Object.values(counts).reduce((a: number, b) => a + (b as number), 0);

    return (
        <div className="h-full overflow-y-auto p-6 space-y-4">
            <header className="flex items-baseline justify-between gap-3">
                <div>
                    <div className="text-[10px] font-display tracking-widest text-slate-500 flex items-center gap-2">
                        <BookOpen size={12} /> GALACTIC ARCHIVE
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1">
                        {total > 0
                            ? `${total} article${total === 1 ? '' : 's'} on record.`
                            : 'The record is empty. Run the narrator to begin writing history.'}
                    </div>
                </div>
            </header>

            <nav className="flex flex-wrap gap-1.5">
                {FILTERS.map(f => {
                    const n = f.kind === 'all' ? total : (counts[f.kind] ?? 0);
                    const active = kind === f.kind;
                    return (
                        <button
                            key={f.kind}
                            onClick={() => { setKind(f.kind); setOpenId(null); }}
                            className={`px-2.5 py-1 rounded-md border text-[9px] font-mono tracking-wider flex items-center gap-1.5 transition-colors ${
                                active
                                    ? 'bg-slate-800 border-slate-500 text-slate-100'
                                    : 'bg-slate-900/40 border-slate-800/60 text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {f.icon} {f.label}
                            <span className="text-slate-600">{n}</span>
                        </button>
                    );
                })}
            </nav>

            {error && <div className="text-[10px] text-red-400/80">The archive is unreachable.</div>}
            {!data && !error && <div className="text-[10px] text-slate-500">Reading the record…</div>}

            {data?.articles?.length === 0 && (
                <div className="text-[10px] text-slate-600 italic py-8 text-center">
                    Nothing of this kind has been written yet.
                </div>
            )}

            <div className="space-y-2">
                {data?.articles?.map((a: any) => {
                    const open = openId === a.id;
                    const accent = KIND_ACCENT[a.kind] ?? KIND_ACCENT.news;
                    return (
                        <article
                            key={a.id}
                            onClick={() => setOpenId(open ? null : a.id)}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                open ? 'bg-slate-800/70 border-slate-600' : 'bg-slate-900/40 border-slate-800/60 hover:border-slate-700'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-3 mb-1">
                                <div className="text-[11px] text-slate-100 leading-tight font-medium">
                                    {a.headline}
                                </div>
                                <div className={`text-[8px] font-mono px-1.5 py-0.5 rounded-full border shrink-0 ${accent}`}>
                                    {a.kind.toUpperCase()}
                                </div>
                            </div>

                            <div className="flex items-center gap-3 text-[9px] font-mono text-slate-600">
                                <span>DAY {a.day}</span>
                                {a.masthead && <span className="text-slate-500">{a.masthead}</span>}
                                {a.eraName && <span className="text-cyan-500/70">{a.eraName}</span>}
                            </div>

                            {open && (
                                <div className="mt-2.5 pt-2.5 border-t border-slate-800 text-[10px] text-slate-300 leading-relaxed whitespace-pre-line">
                                    {a.body}
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
