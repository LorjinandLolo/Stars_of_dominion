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
    /** The outpost became a colony: play the dissolve, then call onDissolved. */
    graduated: boolean;
    onDissolved?: () => void;
    running: number[];
    idleOf: Map<number, 'workers' | 'power'>;
    selected: number | null;
    onSelect: (cell: number) => void;
}

/** How long the snow globe takes to become a dot on a world. */
const DISSOLVE_MS = 2800;

export default function OutpostDiorama({ state, running, idleOf, selected, onSelect, graduated, onDissolved }: Props) {
    const hostRef = React.useRef<HTMLDivElement>(null);
    const dioRef = React.useRef<import('@/lib/outposts/diorama/outpost-diorama').OutpostDiorama | null>(null);
    const onDissolvedRef = React.useRef(onDissolved);
    onDissolvedRef.current = onDissolved;
    const wasGraduated = React.useRef(graduated);
    const [fade, setFade] = React.useState(0);
    const [caption, setCaption] = React.useState<string | null>(null);
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
                dioRef.current = dio;
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
            dioRef.current = null;
            canvas.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // The dissolve: when the outpost becomes a colony while this is open, the
    // diorama pulls back and fades, then the surface opens. An outpost opened
    // already graduated just shows the frozen grid.
    const dissolve = React.useCallback((andThen: boolean) => {
        let raf = 0;
        const started = performance.now();
        setCaption('The domes are a city now.');
        const step = (now: number) => {
            const p = Math.min(1, (now - started) / DISSOLVE_MS);
            dioRef.current?.setPullback(p);
            setFade(p);
            if (p < 1) { raf = requestAnimationFrame(step); return; }
            if (andThen) onDissolvedRef.current?.();
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, []);

    React.useEffect(() => {
        if (!graduated || wasGraduated.current) { wasGraduated.current = graduated; return; }
        wasGraduated.current = true;
        return dissolve(true);
    }, [graduated, dissolve]);

    // Dev handle: play the dissolve without a real graduation (no hand-off
    // unless asked), so the sequence can be seen on any outpost.
    React.useEffect(() => {
        if (process.env.NODE_ENV !== 'development') return;
        (window as any).__outpostDissolve = (andThen = false) => dissolve(andThen);
        return () => { delete (window as any).__outpostDissolve; };
    }, [dissolve]);

    if (failed) return <div className="text-[11px] text-slate-500 p-3">The diorama needs WebGL; the board below still works.</div>;
    return (
        <div className="relative w-full aspect-[4/3] rounded-2xl border border-slate-800 bg-[radial-gradient(ellipse_at_50%_30%,rgba(56,189,248,0.10),rgba(2,6,23,0.9)_70%)] overflow-hidden">
            <div ref={hostRef} className="absolute inset-0 cursor-pointer" style={{ opacity: 1 - fade * 0.95, transition: 'opacity 120ms linear' }} aria-label="Outpost diorama" />
            {caption && (
                <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-6" style={{ opacity: Math.min(1, fade * 2) }}>
                    <div className="px-3 py-1.5 rounded-full bg-slate-950/70 border border-emerald-500/40 text-emerald-200 text-xs font-semibold tracking-wide">{caption} Opening the surface…</div>
                </div>
            )}
        </div>
    );
}
