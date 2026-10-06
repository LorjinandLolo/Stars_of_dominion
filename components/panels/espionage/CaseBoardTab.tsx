'use client';

/**
 * The case board (spec item 12b). A covert operation hit us and our service
 * did not catch who sent it. Clues come in over time; the player pins each
 * clue to the suspect they think it points at, and when ready, accuses one
 * publicly, leaks the story to the press, or lets the case sit.
 *
 * The board does no inference. Pins are the player's own notes and live in
 * this browser only; the worker never sees them. What the player is told is
 * exactly what the server sent: no sponsor, no hidden weights.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
    Briefcase, CheckCircle2, Coins, Eye, Gavel, MapPin, Megaphone, Newspaper, Pin, Radar, Scale, Search, UserX, XCircle,
} from 'lucide-react';
import type { CaseClue, CovertCase } from '@/types/ui-state';
import { formatGalacticDeadline, formatRealAgo, realSecondsUntil } from '@/lib/time/galactic-time';

interface Props {
    cases: CovertCase[];
    factionName: (id: string) => string;
    nowSeconds: number;
    busy: boolean;
    onAccuse: (caseId: string, suspectId: string) => void;
    onLeak: (caseId: string, suspectId: string) => void;
}

const SOURCE: Record<CaseClue['source'], { label: string; icon: React.ReactNode }> = {
    method: { label: 'Method', icon: <Search size={11} /> },
    press: { label: 'Press', icon: <Newspaper size={11} /> },
    sensors: { label: 'Sensors', icon: <Radar size={11} /> },
    motive: { label: 'Motive', icon: <Scale size={11} /> },
    own_intel: { label: 'Our sources', icon: <Eye size={11} /> },
    interrogation: { label: 'Interrogation', icon: <UserX size={11} /> },
    author: { label: 'Informant', icon: <Briefcase size={11} /> },
};

/** Money-trail clues are 'method' too; tell them apart by their text. */
function sourceOf(clue: CaseClue) {
    if (clue.source === 'method' && /^It cost someone/.test(clue.text)) return { label: 'Money trail', icon: <Coins size={11} /> };
    return SOURCE[clue.source] ?? SOURCE.author;
}

// ─── Pins: the player's notes, this browser only ─────────────────────────────

type Pins = Record<string, string>; // clueId → suspectId
const pinKey = (caseId: string) => `sod.casepins.${caseId}`;

function loadPins(caseId: string): Pins {
    try {
        const raw = window.localStorage.getItem(pinKey(caseId));
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}
function savePins(caseId: string, pins: Pins): void {
    try { window.localStorage.setItem(pinKey(caseId), JSON.stringify(pins)); } catch { /* private mode: pins just aren't remembered */ }
}

function ago(nowSeconds: number, at: number): string {
    const realSecondsAgo = Math.max(0, -realSecondsUntil(at, nowSeconds));
    if (realSecondsAgo < 3600) return 'just now';
    return formatRealAgo(new Date(Date.now() - realSecondsAgo * 1000));
}

export function CaseBoardTab({ cases, factionName, nowSeconds, busy, onAccuse, onLeak }: Props) {
    const open = cases.filter(c => c.status === 'open');
    const closed = cases.filter(c => c.status !== 'open');
    const [selectedId, setSelectedId] = useState<string | null>(open[0]?.id ?? cases[0]?.id ?? null);
    const kase = cases.find(c => c.id === selectedId) ?? open[0] ?? cases[0] ?? null;

    const [pins, setPins] = useState<Pins>({});
    useEffect(() => { if (kase) setPins(loadPins(kase.id)); }, [kase?.id]);

    const [suspectId, setSuspectId] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<'accuse' | 'leak' | null>(null);
    useEffect(() => { setSuspectId(null); setConfirming(null); }, [kase?.id]);

    const pin = (clueId: string, suspect: string) => {
        if (!kase) return;
        const next = { ...pins };
        if (!suspect || next[clueId] === suspect) delete next[clueId]; else next[clueId] = suspect;
        setPins(next);
        savePins(kase.id, next);
    };

    /** Suspects ordered by the player's own pins, then by how often clues name them. */
    const suspects = useMemo(() => {
        if (!kase) return [];
        return kase.suspectIds.map(id => ({
            id,
            pinned: kase.clues.filter(c => pins[c.id] === id).length,
            named: kase.clues.filter(c => c.pointsAt.includes(id)).length,
        })).sort((a, b) => b.pinned - a.pinned || b.named - a.named || factionName(a.id).localeCompare(factionName(b.id)));
    }, [kase, pins, factionName]);

    if (cases.length === 0) {
        return (
            <div className="py-12 border border-dashed border-slate-800/50 rounded-lg flex flex-col items-center justify-center text-slate-600 text-center px-4">
                <Briefcase size={24} className="mb-2 opacity-30" />
                <p className="text-[10px] uppercase tracking-widest font-display">No open cases</p>
                <p className="text-[10px] mt-1 text-slate-500 max-w-sm">
                    When a foreign operation hits us and our service does not catch who sent it, a case opens here. Clues arrive over time, faster with more counter-intelligence.
                </p>
            </div>
        );
    }

    const selected = suspectId ?? suspects[0]?.id ?? null;

    return (
        <div className="space-y-4">
            {/* Case list */}
            <div className="flex gap-2 overflow-x-auto pb-1">
                {[...open, ...closed].map(c => (
                    <button key={c.id} onClick={() => setSelectedId(c.id)}
                        className={`shrink-0 min-h-[40px] text-left rounded-lg border px-3 py-2 max-w-[240px] ${kase?.id === c.id
                            ? 'border-amber-500/60 bg-amber-500/10'
                            : 'border-slate-800 bg-slate-900/40 hover:border-slate-600'}`}>
                        <div className="text-[11px] text-slate-200 truncate">{c.title}</div>
                        <div className="text-[9px] uppercase tracking-wider mt-0.5 text-slate-500">
                            {c.status === 'open' ? `${c.clues.length} clue${c.clues.length === 1 ? '' : 's'}`
                                : c.status === 'accused' ? (c.verdict === 'correct' ? 'Solved' : 'Wrong accusation')
                                    : c.status === 'leaked' ? 'Leaked' : 'Gone cold'}
                        </div>
                    </button>
                ))}
            </div>

            {kase && (
                <>
                    {/* Case header */}
                    <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm text-slate-100">{kase.title}</h3>
                            <span className="text-[9px] text-slate-500 shrink-0">opened {ago(nowSeconds, kase.openedAt)}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{kase.summary}</p>
                        {kase.status === 'open' && (
                            <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                <MapPin size={10} /> More may come: next lead expected {formatGalacticDeadline(Math.max(kase.nextClueAt, nowSeconds + 60), nowSeconds)}.
                            </p>
                        )}
                        {kase.status === 'accused' && kase.accusedFactionId && (
                            <p className={`text-[11px] flex items-center gap-1.5 ${kase.verdict === 'correct' ? 'text-emerald-400' : 'text-red-400'}`}>
                                {kase.verdict === 'correct' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                {kase.verdict === 'correct'
                                    ? `We accused ${factionName(kase.accusedFactionId)}, and the evidence held.`
                                    : `We accused ${factionName(kase.accusedFactionId)}. They denied it, and the evidence did not hold. Whoever did it is still out there.`}
                            </p>
                        )}
                        {kase.status === 'leaked' && kase.accusedFactionId && (
                            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                                <Megaphone size={12} /> Leaked to the press, naming {factionName(kase.accusedFactionId)}.
                            </p>
                        )}
                        {kase.status === 'cold' && <p className="text-[11px] text-slate-500">The trail went cold.</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        {/* Clues */}
                        <div className="md:col-span-3 space-y-2">
                            <div className="text-[10px] font-display tracking-widest text-slate-500 uppercase">Clues</div>
                            {kase.clues.length === 0 && (
                                <p className="text-[11px] text-slate-500 border border-dashed border-slate-800 rounded-lg p-3">{kase.status === 'open' ? 'No leads yet. Our service is working on it.' : 'No leads came in.'}</p>
                            )}
                            {kase.clues.map(c => {
                                const src = sourceOf(c);
                                const pinnedTo = pins[c.id];
                                return (
                                    <div key={c.id} className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 space-y-2">
                                        <div className="flex items-center justify-between gap-2 text-[9px] uppercase tracking-wider text-slate-500">
                                            <span className="flex items-center gap-1">{src.icon}{src.label}</span>
                                            <span className="normal-case tracking-normal">{ago(nowSeconds, c.arrivedAt)}</span>
                                        </div>
                                        <p className="text-[12px] text-slate-200 leading-snug">{c.text}</p>
                                        {kase.status === 'open' && (
                                            <div className="flex items-center gap-2">
                                                <Pin size={11} className={pinnedTo ? 'text-amber-400' : 'text-slate-600'} />
                                                <select value={pinnedTo ?? ''} onChange={e => pin(c.id, e.target.value)}
                                                    className="flex-1 min-w-0 min-h-[40px] bg-slate-950 border border-slate-800 rounded px-2 py-2 text-[11px] text-slate-300 outline-none">
                                                    <option value="">Not pinned</option>
                                                    {c.pointsAt.length > 0 && (
                                                        <optgroup label="Named in this clue">
                                                            {c.pointsAt.map(id => <option key={id} value={id}>{factionName(id)}</option>)}
                                                        </optgroup>
                                                    )}
                                                    <optgroup label="Any suspect">
                                                        {kase.suspectIds.filter(id => !c.pointsAt.includes(id)).map(id => (
                                                            <option key={id} value={id}>{factionName(id)}</option>
                                                        ))}
                                                    </optgroup>
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Suspects and the decision */}
                        <div className="md:col-span-2 space-y-2">
                            <div className="text-[10px] font-display tracking-widest text-slate-500 uppercase">Suspects</div>
                            <div className="space-y-1">
                                {suspects.map(s => (
                                    <button key={s.id} onClick={() => { setSuspectId(s.id); setConfirming(null); }}
                                        className={`w-full min-h-[40px] flex items-center justify-between gap-2 rounded border px-3 py-2 text-left ${selected === s.id
                                            ? 'border-amber-500/60 bg-amber-500/10'
                                            : 'border-slate-800 bg-slate-900/40 hover:border-slate-600'}`}>
                                        <span className="text-[11px] text-slate-200 truncate">{factionName(s.id)}</span>
                                        <span className="text-[10px] font-mono shrink-0 flex items-center gap-2">
                                            {s.pinned > 0 && <span className="text-amber-400 flex items-center gap-0.5"><Pin size={10} />{s.pinned}</span>}
                                            <span className="text-slate-500" title="Clues that name them">{s.named} named</span>
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {kase.status === 'open' && selected && (
                                <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 space-y-2">
                                    {confirming === null && (
                                        <>
                                            <button disabled={busy} onClick={() => setConfirming('accuse')}
                                                className="w-full min-h-[40px] py-2 rounded uppercase font-display text-[10px] tracking-widest flex items-center justify-center gap-1.5 bg-red-700/80 text-white hover:bg-red-600 disabled:opacity-50">
                                                <Gavel size={12} /> Accuse {factionName(selected)}
                                            </button>
                                            <button disabled={busy} onClick={() => setConfirming('leak')}
                                                className="w-full min-h-[40px] py-2 rounded uppercase font-display text-[10px] tracking-widest flex items-center justify-center gap-1.5 border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                                                <Megaphone size={12} /> Leak to the press
                                            </button>
                                            <p className="text-[10px] text-slate-500">Or hold: the case stays open while leads come in, and goes cold in about two days.</p>
                                        </>
                                    )}
                                    {confirming === 'accuse' && (
                                        <>
                                            <p className="text-[11px] text-slate-300">
                                                Publicly accuse {factionName(selected)}? If we are right they are exposed, and we gain standing. If we are wrong they are insulted, we look unreliable, and whoever really did it gets bolder.
                                            </p>
                                            <div className="flex gap-2">
                                                <button onClick={() => setConfirming(null)} className="flex-1 min-h-[40px] py-2 rounded border border-slate-700 text-slate-400 text-[10px] uppercase tracking-widest">Back</button>
                                                <button disabled={busy} onClick={() => { onAccuse(kase.id, selected); setConfirming(null); }}
                                                    className="flex-1 min-h-[40px] py-2 rounded bg-red-600 text-white text-[10px] uppercase tracking-widest hover:bg-red-500 disabled:opacity-50">Accuse</button>
                                            </div>
                                        </>
                                    )}
                                    {confirming === 'leak' && (
                                        <>
                                            <p className="text-[11px] text-slate-300">
                                                Give the story to the press, naming {factionName(selected)}? It will be printed as a suspicion. No diplomatic weight, and the case closes.
                                            </p>
                                            <div className="flex gap-2">
                                                <button onClick={() => setConfirming(null)} className="flex-1 min-h-[40px] py-2 rounded border border-slate-700 text-slate-400 text-[10px] uppercase tracking-widest">Back</button>
                                                <button disabled={busy} onClick={() => { onLeak(kase.id, selected); setConfirming(null); }}
                                                    className="flex-1 min-h-[40px] py-2 rounded bg-slate-200 text-slate-950 text-[10px] uppercase tracking-widest hover:bg-white disabled:opacity-50">Leak</button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
