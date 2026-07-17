'use client';
// components/notifications/TickCountdown.tsx
// Stars of Dominion — Live countdown to the next strategic tick
// Displays in the StatusBar area so players always know when the next cycle fires.

import React, { useEffect, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { getMsUntilNextTick, formatCountdown, getNextStrategicTick } from '@/lib/time/time-helpers';

interface TickInfo {
    tickIndex: number;
    nextTickAt: string;
    lastTickAt: string | null;
}

export default function TickCountdown() {
    // Time-derived values must not be computed during render/initial state: the server and
    // the client evaluate `new Date()` at different instants, causing a hydration mismatch.
    // Start null and fill in after mount (client-only).
    const [msLeft, setMsLeft] = useState<number | null>(null);
    const [mounted, setMounted] = useState(false);
    const [tickInfo, setTickInfo] = useState<TickInfo | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // Fetch tick state from /api/tick on mount
    useEffect(() => {
        fetch('/api/tick')
            .then(r => r.json())
            .then((data: TickInfo) => setTickInfo(data))
            .catch(() => {/* silent */});
    }, []);

    // Live countdown (updates every second)
    useEffect(() => {
        const update = () => {
            setMsLeft(getMsUntilNextTick());
        };
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, []);

    const urgency = msLeft === null
        ? 'text-slate-300'
        : msLeft < 5 * 60 * 1000              // under 5 min
        ? 'text-red-400'
        : msLeft < 30 * 60 * 1000             // under 30 min
        ? 'text-amber-400'
        : 'text-slate-300';

    // Only compute the wall-clock target after mount so SSR and first client render agree.
    const nextAt = mounted ? getNextStrategicTick() : null;
    const nextHH = nextAt ? String(nextAt.getUTCHours()).padStart(2, '0') : '--';
    const nextMM = nextAt ? String(nextAt.getUTCMinutes()).padStart(2, '0') : '--';

    const handleForceTick = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/tick', { method: 'POST', headers: { 'x-cron-secret': 'dev' } });
            const data = await res.json();
            if (data.ran) {
                setTickInfo(data);
                setMsLeft(getMsUntilNextTick());
            }
        } catch { /* silent */ }
        setLoading(false);
    };

    return (
        <div
            id="tick-countdown"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 bg-black/40 select-none"
            title={`Next strategic tick at ${nextHH}:${nextMM} UTC`}
        >
            <Clock className={`w-3.5 h-3.5 ${urgency}`} />
            <div className="flex flex-col leading-none">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest">Next Cycle</span>
                <span className={`text-sm font-mono font-bold ${urgency}`}>
                    {msLeft === null ? '--:--' : formatCountdown(msLeft)}
                </span>
            </div>
            {tickInfo && (
                <span className="text-[9px] text-slate-600 font-mono ml-1">#{tickInfo.tickIndex}</span>
            )}
            {process.env.NODE_ENV === 'development' && (
                <button
                    onClick={handleForceTick}
                    disabled={loading}
                    title="Force tick (dev only)"
                    className="ml-1 p-0.5 rounded hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors disabled:opacity-30"
                >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                </button>
            )}
        </div>
    );
}
