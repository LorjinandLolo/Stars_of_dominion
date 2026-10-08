'use client';

/**
 * components/underground/SeatRouter.tsx
 * Item 13d: an account that leads a movement from hiding holds a claim on a
 * state that does not exist yet, so the empire shell has nothing to show it.
 * This decides, once per load, which page the account plays: the underground
 * page while the movement hides, the full game once it is a state.
 *
 * Browser-safe: rebellion-types only.
 */

import React from 'react';
import GameShell from '@/components/shell/GameShell';
import UndergroundShell from './UndergroundShell';
import { isUndergroundSeatId } from '@/lib/rebellion/rebellion-types';

type Mode = 'checking' | 'game' | 'underground';

export default function SeatRouter() {
    const [mode, setMode] = React.useState<Mode>('checking');
    const [seatId, setSeatId] = React.useState<string | null>(null);

    React.useEffect(() => {
        let stopped = false;
        (async () => {
            try {
                const claim = await fetch('/api/lobby/claim', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null));
                const mine = claim?.myFactionId ?? null;
                if (!isUndergroundSeatId(mine)) { if (!stopped) setMode('game'); return; }
                const cell = await fetch('/api/rebel/cell', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null));
                if (stopped) return;
                if (cell?.risen) { setMode('game'); return; }
                setSeatId(mine);
                setMode('underground');
            } catch {
                // Anything unexpected: the game shell has its own recovery paths.
                if (!stopped) setMode('game');
            }
        })();
        return () => { stopped = true; };
    }, []);

    if (mode === 'checking') return <div className="h-dvh bg-slate-950" />;
    if (mode === 'underground' && seatId) return <UndergroundShell seatId={seatId} onRisen={() => setMode('game')} />;
    return <GameShell />;
}
