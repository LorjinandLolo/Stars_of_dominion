"use client";

// components/galaxy/ExploreCountdown.tsx
// A live countdown for a ping, scan or survey in flight, so a player can see
// it is actually working. The order's completesAt is on the sim clock; the
// client's sim clock (store nowSeconds) only moves with each sync, so between
// syncs it is extrapolated at SIM_SECONDS_PER_REAL_SECOND. If the synced clock
// itself stops moving, the game server is not running, and the box says so
// instead of counting into nothing.

import React, { useEffect, useRef, useState } from 'react';
import { Search, AlertTriangle } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { SIM_SECONDS_PER_REAL_SECOND } from '@/lib/time/time-config';

/** The synced clock standing still this long (real seconds) means the server is not advancing. */
const STALLED_AFTER_SECONDS = 30;

interface Props {
    mode: 'ping' | 'scan' | 'survey';
    /** ISO, sim clock. */
    completesAt: string;
    /** ISO, sim clock; draws the bar when present. */
    issuedAt?: string;
    /** Free survey on arrival, relay ping, or a fleet order. */
    source?: string;
}

function clock(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function ExploreCountdown({ mode, completesAt, issuedAt, source }: Props) {
    const nowSeconds = useUIStore(s => s.nowSeconds);
    // When the synced sim clock last moved, in real time.
    const movedAt = useRef<{ sim: number; real: number }>({ sim: nowSeconds, real: Date.now() });
    if (movedAt.current.sim !== nowSeconds) movedAt.current = { sim: nowSeconds, real: Date.now() };
    const [, tick] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => tick(n => n + 1), 1000);
        return () => window.clearInterval(id);
    }, []);

    const sinceSyncReal = (Date.now() - movedAt.current.real) / 1000;
    const stalled = sinceSyncReal > STALLED_AFTER_SECONDS;
    // Extrapolate between syncs, but never past a stalled clock.
    const simNow = movedAt.current.sim + (stalled ? 0 : sinceSyncReal * SIM_SECONDS_PER_REAL_SECOND);
    const due = Date.parse(completesAt) / 1000;
    const start = issuedAt ? Date.parse(issuedAt) / 1000 : NaN;
    const leftReal = (due - simNow) / SIM_SECONDS_PER_REAL_SECOND;
    const pct = Number.isFinite(start) && due > start ? Math.min(100, Math.max(0, ((simNow - start) / (due - start)) * 100)) : null;
    const label = mode === 'ping' ? 'PINGING' : mode === 'scan' ? 'SCANNING' : 'SURVEYING';
    const how = source === 'arrival' ? 'Your exploration ship is surveying on arrival, free.'
        : source === 'relay' ? 'A sensor ping from your nearest shipyard.'
        : 'Your fleet is working on it.';

    return (
        <div id="explore-countdown" className="py-2 space-y-1.5">
            <div className={`w-full px-3 py-2.5 rounded border font-display text-[10px] tracking-[0.2em] flex items-center justify-between gap-2 ${
                stalled ? 'bg-red-950/30 border-red-700/40 text-red-300' : 'bg-slate-800/80 border-amber-600/30 text-amber-400'
            }`}>
                <span className="flex items-center gap-2">
                    {stalled ? <AlertTriangle size={14} /> : <Search size={14} className="animate-pulse" />}
                    {label}
                </span>
                <span className="font-mono text-[11px] tracking-normal">
                    {stalled ? 'paused' : leftReal > 0 ? `${clock(leftReal)} left` : 'landing…'}
                </span>
            </div>
            {pct !== null && !stalled && (
                <div className="h-1 w-full bg-black/50 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 transition-[width] duration-1000" style={{ width: `${pct}%` }} />
                </div>
            )}
            <p className="text-[9px] text-slate-500 text-center leading-snug">
                {stalled
                    ? `The game server has not advanced for ${Math.round(sinceSyncReal)}s, so nothing lands until it runs again.`
                    : leftReal > 0 ? how : 'Due now: it lands with the server’s next cycle, within a few seconds.'}
            </p>
        </div>
    );
}
