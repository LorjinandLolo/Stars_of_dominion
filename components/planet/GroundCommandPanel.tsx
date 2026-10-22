"use client";

// components/planet/GroundCommandPanel.tsx
// The commander's desk under the war HUD: what the last cycle did (a ticker
// that follows the board's replay, and a report card that says WHY each
// fight went the way it did), the decisions waiting before the next cycle,
// the call-ins, and the weather. Reads the side's own fogged view of the war.

import React from 'react';
import type { PlanetSurface } from '@/lib/planet-surface/types';
import type { DistrictWarState } from '@/lib/combat/siege/siege-types';
import { CALL_INS, callInBlocked, type CallInKind } from '@/lib/combat/siege/call-ins';
import { WEATHER_LABEL } from '@/lib/combat/siege/chaos';
import { CloudRain, Crosshair, Play, FileText, AlertTriangle } from 'lucide-react';
import { reportKey, reportTimeline, startPlayback, usePlayback } from './playbackClock';

interface Props {
    planet: any;
    surface: PlanetSurface;
    war: DistrictWarState;
    side: 'attacker' | 'defender';
    /** mm:ss until the next cycle resolves — the moments' deadline. */
    countdown: string;
    order: (actionId: string, payload: Record<string, any>, label: string) => void;
}

const SIDE_TEXT: Record<'attacker' | 'defender', string> = { attacker: 'text-red-300', defender: 'text-sky-300' };

export default function GroundCommandPanel({ planet, surface, war, side, countdown, order }: Props) {
    const [reportOpen, setReportOpen] = React.useState(false);
    const [arming, setArming] = React.useState<CallInKind | null>(null);
    const report = war.lastReport;
    const key = reportKey(report);
    const p = usePlayback(key);
    const timeline = React.useMemo(() => reportTimeline(report), [report]);
    const shown = p == null ? timeline.slice(-2) : timeline.filter(l => l.t <= p).slice(-2);

    const siege = planet.siege;
    const nextCycle = (siege?.cycleCount ?? 0) + 1;
    const board = { surface, war, orbit: siege?.orbit, nextCycle };
    const moments = (war.moments ?? []).filter(m => m.side === side && !m.resolved);
    const weather = war.weather?.kind ?? 'clear';
    const mine = side;

    // Districts a targeted call-in could hit right now.
    const targetsFor = (kind: CallInKind) => surface.sectors
        .filter(s => !callInBlocked(board, mine, kind, s.index))
        .sort((a, b) => a.ring - b.ring)
        .slice(0, 6)
        .map(s => s.index);

    return (
        <div className="border-t border-slate-900/80">
            {/* Ticker + weather */}
            <div className="flex items-start gap-3 px-3 py-2">
                <div className="flex-1 min-w-0 space-y-0.5 font-mono text-[9.5px] leading-snug">
                    {shown.length === 0 && <div className="text-slate-600">No fighting yet this war.</div>}
                    {shown.map((l, i) => (
                        <div key={`${l.t}-${i}`} className={`${SIDE_TEXT[l.side]} ${i === shown.length - 1 && p != null ? 'opacity-100' : 'opacity-70'} truncate`}
                            title={l.text}>
                            {l.sector != null && <span className="text-slate-500">D{l.sector} · </span>}{l.text}
                        </div>
                    ))}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="flex items-center gap-1 text-[8px] font-display tracking-[0.15em] uppercase text-slate-400"
                        title="Weather: rain, storms and snow bog down armour and blind the guns; fog favours the ambush; storms ground air drops.">
                        <CloudRain size={10} /> {WEATHER_LABEL[weather]}
                    </span>
                    {report && (
                        <div className="flex gap-1">
                            <button onClick={() => key && startPlayback(key)}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-700/60 text-[8px] font-display tracking-[0.12em] text-slate-400 hover:text-slate-100"
                                title="Replay the last cycle on the board">
                                <Play size={9} /> REPLAY
                            </button>
                            <button onClick={() => setReportOpen(o => !o)}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[8px] font-display tracking-[0.12em] ${reportOpen ? 'border-amber-500/50 text-amber-300' : 'border-slate-700/60 text-slate-400 hover:text-slate-100'}`}
                                title="Why each fight went the way it did">
                                <FileText size={9} /> REPORT
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Report card */}
            {reportOpen && report && (
                <div className="max-h-48 overflow-y-auto px-3 pb-2 space-y-1.5">
                    <div className="text-[8px] font-display tracking-[0.18em] uppercase text-slate-500">Cycle {report.cycle}</div>
                    {report.districts.length === 0 && <div className="text-[9px] text-slate-500">No district changed hands by force.</div>}
                    {report.districts.map(d => {
                        const won = d.holder === mine;
                        return (
                            <div key={d.sector} className="rounded border border-slate-800/80 bg-slate-900/50 px-2 py-1">
                                <div className="flex items-center gap-2 text-[9px]">
                                    <span className="font-mono text-slate-300">D{d.sector}</span>
                                    <span className="text-slate-500 capitalize">{d.terrain}</span>
                                    <span className={won ? 'text-emerald-300' : 'text-rose-300'}>
                                        {d.captured ? (won ? 'TAKEN' : 'LOST') : (won ? 'HELD' : 'REPULSED')}
                                    </span>
                                    <span className="ml-auto font-mono text-slate-400">
                                        <span className="text-red-300">{d.men.attacker}</span>/<span className="text-red-400/70">−{d.lost.attacker}</span>
                                        {'  vs  '}
                                        <span className="text-sky-300">{d.men.defender}</span>/<span className="text-sky-400/70">−{d.lost.defender}</span>
                                    </span>
                                </div>
                                {d.factors.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {d.factors.map((f, i) => (
                                            <span key={i}
                                                className={`px-1 rounded text-[8px] font-mono border ${f.side === mine ? 'border-emerald-700/50' : 'border-rose-700/50'} ${f.mult >= 1 ? 'text-slate-200' : 'text-slate-500'}`}
                                                title={`${f.side === mine ? 'Yours' : 'Theirs'}: ×${f.mult.toFixed(2)}`}>
                                                {f.side === mine ? '' : '⟂ '}{f.label} {f.mult >= 1 ? '+' : '−'}{Math.round(Math.abs(f.mult - 1) * 100)}%
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {(report.events ?? []).map((e, i) => (
                        <div key={`ev-${i}`} className={`text-[9px] ${SIDE_TEXT[e.side]}`}>⚡ {e.text}</div>
                    ))}
                </div>
            )}

            {/* Decisions before the next cycle */}
            {moments.map(m => (
                <div key={m.id} className="mx-3 mb-2 rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1.5">
                    <div className="flex items-center gap-2 text-[9px] font-display tracking-[0.12em] uppercase text-amber-300">
                        <AlertTriangle size={11} /> {m.title}
                        <span className="ml-auto font-mono text-amber-200/80 normal-case tracking-normal">{countdown}</span>
                    </div>
                    <div className="text-[9.5px] text-slate-300 mt-0.5">{m.text}</div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {m.choices.map(c => {
                            const picked = (m.chosen ?? null) === c.id;
                            const isDefault = !m.chosen && c.id === m.defaultChoice;
                            return (
                                <button key={c.id}
                                    onClick={() => order('MIL_GROUND_MOMENT', { planetId: planet.id, momentId: m.id, choiceId: c.id }, `${c.label} at district ${m.sector}`)}
                                    title={c.blurb + (c.id === m.defaultChoice ? ' (what happens if you give no order)' : '')}
                                    className={`px-2 py-0.5 rounded border text-[9px] font-display tracking-[0.1em] transition-colors ${picked ? 'border-amber-400 bg-amber-500/25 text-amber-100' : isDefault ? 'border-amber-500/40 text-amber-200/80 hover:bg-amber-500/15' : 'border-slate-700/70 text-slate-300 hover:bg-white/5'}`}>
                                    {c.label.toUpperCase()}{isDefault ? ' ·default' : ''}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* Call-ins */}
            <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
                <span className="text-[8px] font-display tracking-[0.18em] text-slate-500 uppercase flex items-center gap-1">
                    <Crosshair size={10} /> Call in
                </span>
                {(Object.keys(CALL_INS) as CallInKind[]).map(kind => {
                    const spec = CALL_INS[kind];
                    const ready = war.callInReady?.[mine]?.[kind] ?? 0;
                    const cooling = nextCycle < ready;
                    const blocked = spec.targeted ? (targetsFor(kind).length ? null : 'No valid target right now.') : callInBlocked(board, mine, kind, -1);
                    const disabled = cooling || !!blocked;
                    return (
                        <button key={kind}
                            disabled={disabled}
                            onClick={() => spec.targeted
                                ? setArming(a => a === kind ? null : kind)
                                : order('MIL_GROUND_CALL_IN', { planetId: planet.id, kind, sectorIndex: -1 }, `${spec.label} on ${planet.name}`)}
                            title={`${spec.blurb}${cooling ? ` Ready in ${ready - nextCycle} cycle(s).` : blocked ? ` ${blocked}` : ''}`}
                            className={`px-2 py-0.5 rounded border text-[9px] font-display tracking-[0.1em] transition-colors ${disabled ? 'border-slate-800 text-slate-600 cursor-not-allowed' : arming === kind ? 'border-amber-400 bg-amber-500/20 text-amber-100' : 'border-slate-700/70 text-slate-300 hover:bg-white/5'}`}>
                            {spec.label.toUpperCase()}{cooling ? ` · ${ready - nextCycle}` : ''}
                        </button>
                    );
                })}
                {arming && targetsFor(arming).map(idx => (
                    <button key={idx}
                        onClick={() => { order('MIL_GROUND_CALL_IN', { planetId: planet.id, kind: arming, sectorIndex: idx }, `${CALL_INS[arming].label} on district ${idx}`); setArming(null); }}
                        className="px-1.5 py-0.5 rounded border border-amber-500/50 text-[9px] font-mono text-amber-200 hover:bg-amber-500/15">
                        D{idx}
                    </button>
                ))}
            </div>
        </div>
    );
}
