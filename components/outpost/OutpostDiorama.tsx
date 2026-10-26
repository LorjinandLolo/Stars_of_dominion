"use client";

// components/outpost/OutpostDiorama.tsx
// Stars of Dominion — the React mount for the outpost snow globe
// (lib/outposts/diorama/outpost-diorama.ts). Owns the canvas and the frame
// loop; the scene reads the same balance the 2D board does, so what glows
// here is what works there. Click a tile to select it, as on the board.

import React from 'react';
import type { OutpostState } from '@/lib/outposts/outpost-types';
import { SIM_SECONDS_PER_REAL_SECOND } from '@/lib/time/time-config';
import { SHIFT_SIM_SECONDS } from '@/lib/outposts/outpost-catalog';

interface Props {
    state: OutpostState;
    running: number[];
    idleOf: Map<number, 'workers' | 'power'>;
    selected: number | null;
    onSelect: (cell: number) => void;
}

export default function OutpostDiorama({ state, running, idleOf, selected, onSelect }: Props) {
    const hostRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef({ state, running, idleOf, selected });
    inputRef.current = { state, running, idleOf, selected };
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        let dio: import('@/lib/outposts/diorama/outpost-diorama').OutpostDiorama | null = null;
        let raf = 0;
        let cancelled = false;
        // The canvas is made here, not by React: a lost context cannot host a
        // new renderer on hot reload (same rule as the battle view).
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        host.appendChild(canvas);

        const shiftProgress = () => {
            // Real clock: one turn of the sun per shift.
            const period = SHIFT_SIM_SECONDS / SIM_SECONDS_PER_REAL_SECOND * 1000;
            return (Date.now() % period) / period;
        };

        import('@/lib/outposts/diorama/outpost-diorama').then(({ OutpostDiorama }) => {
            if (cancelled) return;
            try {
                dio = new OutpostDiorama(canvas);
            } catch {
                setFailed(true);
                return;
            }
            const fit = () => { const r = host.getBoundingClientRect(); dio?.resize(Math.round(r.width), Math.round(r.height)); };
            fit();
            const ro = new ResizeObserver(fit);
            ro.observe(host);
            let last = performance.now();
            let lastSig = '';
            const loop = (now: number) => {
                const dt = Math.min(0.1, (now - last) / 1000);
                last = now;
                const cur = inputRef.current;
                const inp = { state: cur.state, running: cur.running, idle: cur.idleOf, selected: cur.selected, shiftProgress: shiftProgress() };
                // Rebuild the scene only when the state that matters changed.
                const sig = `${inp.state.shift}|${inp.state.cells.map(c => `${c.module ?? ''}:${c.off ? 1 : 0}:${c.downUntilShift ?? ''}:${c.buildDoneShift ?? ''}:${c.terrain}`).join(',')}|${inp.running.join(',')}|${inp.selected}|${inp.state.crises.map(c => c.id).join(',')}|${inp.state.colonists}|${inp.state.tier}`;
                if (sig !== lastSig) { dio!.update(inp); lastSig = sig; }
                dio!.frame(dt, inp);
                raf = requestAnimationFrame(loop);
            };
            raf = requestAnimationFrame(loop);
            (canvas as any).__fit = () => ro.disconnect();
        }).catch(() => setFailed(true));

        const onClick = (e: MouseEvent) => {
            if (!dio) return;
            const r = canvas.getBoundingClientRect();
            const cell = dio.pick(e.clientX - r.left, e.clientY - r.top);
            if (cell !== null) onSelect(cell);
        };
        canvas.addEventListener('click', onClick);

        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
            canvas.removeEventListener('click', onClick);
            (canvas as any).__fit?.();
            dio?.dispose();
            dio = null;
            canvas.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (failed) return <div className="text-[11px] text-slate-500 p-3">The diorama needs WebGL; the board below still works.</div>;
    return <div ref={hostRef} className="w-full aspect-[4/3] rounded-2xl border border-slate-800 bg-[radial-gradient(ellipse_at_50%_30%,rgba(56,189,248,0.10),rgba(2,6,23,0.9)_70%)] overflow-hidden cursor-pointer" aria-label="Outpost diorama" />;
}
