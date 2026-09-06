"use client";

// components/galaxy/OverlayPicker.tsx
// One pill in the top-left of the galaxy map that is picker, legend and
// counter at once. Every colour on a hex comes from lib/galaxy/overlays.ts,
// and so does every chip here — the same table drives both, so the legend
// can never drift from the paint. When an overlay has nothing to show, the
// pill stays open with the overlay's own sentence, so "nothing yet" never
// reads as "broken".

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import {
    OVERLAY_DEFS,
    chartedCoverage,
    isOverlayId,
    overlayDef,
    type OverlayId,
    type OverlayLegendEntry,
    type OverlayResult,
} from '@/lib/galaxy/overlays';
import { Radar, Flag, Sprout, HeartPulse, Layers, ChevronUp, ChevronDown, X } from 'lucide-react';

const ICONS = { Radar, Flag, Sprout, HeartPulse } as const;

/** Remembered overlay ('none' when the player switched everything off). */
const OVERLAY_KEY = 'sod.galaxyOverlay';
/** Whether the legend bar is expanded or folded down to the pill. */
const BAR_KEY = 'sod.overlayBar';

function readStorage(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string): void {
    try { window.localStorage.setItem(key, value); } catch { /* private mode, quota — the choice just isn't remembered */ }
}

function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || typeof el.tagName !== 'string') return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
}

// Six points of a pointy-top hex of radius r about (c, c).
function hexPoints(c: number, r: number): string {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        pts.push(`${(c + r * Math.cos(a)).toFixed(2)},${(c + r * Math.sin(a)).toFixed(2)}`);
    }
    return pts.join(' ');
}
const SWATCH_HEX = hexPoints(6, 5);

/** The chip's swatch IS the mark — a tiny hex (or badge, or ring) with the entry's real fill/stroke/dash. */
function Swatch({ entry }: { entry: OverlayLegendEntry }) {
    if (entry.ring) {
        return (
            <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
                <circle cx={6} cy={6} r={1.6} fill="#e2e8f0" opacity={0.7} />
                <circle cx={6} cy={6} r={4.6} fill="none" stroke={entry.stroke} strokeOpacity={entry.strokeOpacity}
                    strokeWidth={1} strokeDasharray={entry.dash} />
            </svg>
        );
    }
    if (entry.badge) {
        const hollow = entry.badge === 'hollow';
        return (
            <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
                <circle cx={6} cy={6} r={4} fill={hollow ? 'none' : entry.stroke} stroke={entry.stroke} strokeWidth={1} />
                <text x={6} y={8.2} textAnchor="middle" fontSize={6} fontFamily="monospace" fontWeight={700}
                    fill={hollow ? entry.stroke : '#052e16'}>n</text>
            </svg>
        );
    }
    return (
        <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true"
            className={`shrink-0 ${entry.pulse ? 'sod-overlay-pulse' : ''}`}>
            <polygon
                points={SWATCH_HEX}
                fill={entry.fill === 'none' ? 'none' : entry.fill}
                fillOpacity={entry.fill === 'none' ? 0 : Math.min(1, entry.fillOpacity * 1.6)}
                stroke={entry.stroke}
                strokeOpacity={entry.strokeOpacity}
                strokeWidth={entry.strokeWidth ?? 1}
                strokeDasharray={entry.dash}
            />
        </svg>
    );
}

interface OverlayPickerProps {
    /** GalaxyShell's memoised overlay verdict — the map and this bar share one computation. */
    result: OverlayResult | null;
}

export default function OverlayPicker({ result }: OverlayPickerProps) {
    const activeOverlay = useUIStore(s => s.activeOverlay);
    const setActiveOverlay = useUIStore(s => s.setActiveOverlay);
    const activeTab = useUIStore(s => s.activeTab);
    const systems = useUIStore(s => s.systems);
    const factionVisibility = useUIStore(s => s.factionVisibility);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const setFocusTarget = useUIStore(s => s.setFocusTarget);

    const [menuOpen, setMenuOpen] = useState(false);
    const [barOpen, setBarOpen] = useState(true);

    // Every change from this component goes through here so the choice is
    // remembered ('none' included — an explicit "off" must survive a reload).
    const select = useCallback((id: OverlayId | null) => {
        setActiveOverlay(id);
        writeStorage(OVERLAY_KEY, id ?? 'none');
        setMenuOpen(false);
    }, [setActiveOverlay]);

    // First mount: restore the remembered overlay. A fresh browser lands on
    // Charted — the one lens that says something on a capital-only start.
    useEffect(() => {
        const stored = readStorage(OVERLAY_KEY);
        if (stored === null) {
            setActiveOverlay('charted');
            writeStorage(OVERLAY_KEY, 'charted');
        } else if (isOverlayId(stored)) {
            setActiveOverlay(stored);
        }
        // 'none' or garbage (an old 'deepSpace') → leave the store's null.
        if (readStorage(BAR_KEY) === 'collapsed') setBarOpen(false);
    }, [setActiveOverlay]);

    const toggleBar = useCallback(() => {
        setBarOpen(open => {
            writeStorage(BAR_KEY, open ? 'collapsed' : 'open');
            return !open;
        });
    }, []);

    // Hotkeys, galaxy tab only. Bubble phase on document so the Modal's and
    // ResearchPanel's capture-phase Escape run first (and mark the event
    // handled), while CommandWorkspace's window-bubble Escape runs after us
    // and sees our preventDefault.
    useEffect(() => {
        if (activeTab !== 'galaxy') return;
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
            if (isTypingTarget(e.target)) return;
            const current = useUIStore.getState().activeOverlay;
            if (e.key === 'Escape') {
                // Only claim Escape while an overlay is on; otherwise it still
                // belongs to whoever handles it next.
                if (!current) return;
                e.preventDefault();
                select(null);
                return;
            }
            if (e.key.length !== 1 || e.key < '0' || e.key > '9') return;
            const digit = Number(e.key);
            if (digit === 0) { if (current) select(null); return; }
            const def = OVERLAY_DEFS[digit - 1];
            if (!def) return; // 5 and 6 are reserved
            select(def.id === current ? null : def.id);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [activeTab, select]);

    // 'Charted N / M' is always on the pill, whichever overlay is active.
    const coverage = useMemo(
        () => chartedCoverage({ systems: systems as any, visibility: factionVisibility, playerFactionId }),
        [systems, factionVisibility, playerFactionId],
    );

    const focusSystem = useCallback((systemId: string | undefined) => {
        if (!systemId) return;
        const sys = useUIStore.getState().systems.find(s => s.id === systemId);
        if (sys) setFocusTarget({ x: sys.q, y: sys.r, zoom: 2.5 });
    }, [setFocusTarget]);

    const def = activeOverlay ? overlayDef(activeOverlay) : null;
    const ActiveIcon = def ? ICONS[def.icon] : Layers;

    const coverageChip = (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); select('charted'); }}
            title="Systems pinged or better, over the whole galaxy — click to open Charted"
            className="font-mono text-[10px] tracking-wide text-teal-300/90 px-2 py-0.5 rounded-full border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 transition-colors"
        >
            Charted {coverage.charted} / {coverage.total}
        </button>
    );

    const stop = (e: React.SyntheticEvent) => e.stopPropagation();

    return (
        <div
            id="galaxy-overlay-controls"
            role="toolbar"
            aria-label="Map overlays"
            className="absolute top-4 left-4 z-30 pointer-events-auto max-w-[calc(100vw-2rem)] xl:max-w-[calc(100vw-26rem)]"
            onMouseDown={stop}
            onWheel={stop}
        >
            {/* ── The pill (collapsed, or the head of the legend bar) ── */}
            <div className="flex flex-wrap items-center gap-2 glass-panel rounded-full px-2 py-1 border border-slate-700/60 shadow-lg min-h-[32px]">
                <button
                    type="button"
                    onClick={() => setMenuOpen(o => !o)}
                    aria-expanded={menuOpen}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-display tracking-widest text-slate-200 hover:text-white hover:bg-white/5 transition-colors"
                    style={def ? { color: def.legend[0].stroke } : undefined}
                >
                    <ActiveIcon size={13} />
                    {def ? def.label.toUpperCase() : <>OVERLAY <span className="text-slate-500">· OFF</span></>}
                </button>
                {coverageChip}
                {def && (
                    <>
                        <button
                            type="button"
                            onClick={toggleBar}
                            aria-expanded={barOpen}
                            aria-label={barOpen ? 'Collapse legend' : 'Expand legend'}
                            className="text-slate-400 hover:text-white p-0.5 rounded"
                        >
                            {barOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        <button
                            type="button"
                            onClick={() => select(null)}
                            aria-label="Clear overlay"
                            title="Clear overlay (Esc)"
                            className="text-slate-400 hover:text-red-300 p-0.5 rounded"
                        >
                            <X size={13} />
                        </button>
                    </>
                )}
            </div>

            {/* ── The menu: four rows, one question each ── */}
            {menuOpen && (
                <div
                    aria-label="Choose an overlay"
                    className="mt-1.5 w-full md:w-[26rem] glass-panel rounded-lg border border-slate-700/60 shadow-xl overflow-hidden"
                >
                    {OVERLAY_DEFS.map((d) => {
                        const Icon = ICONS[d.icon];
                        const pressed = activeOverlay === d.id;
                        const accent = d.legend[0].stroke;
                        return (
                            <button
                                key={d.id}
                                type="button"
                                aria-pressed={pressed}
                                onClick={() => select(pressed ? null : d.id)}
                                className={[
                                    'w-full flex items-start gap-3 px-3 py-2 text-left transition-colors border-l-2',
                                    pressed ? 'bg-white/5' : 'border-transparent hover:bg-white/5',
                                ].join(' ')}
                                style={pressed ? { borderLeftColor: accent } : undefined}
                            >
                                <span className="mt-0.5 shrink-0" style={{ color: accent }}><Icon size={14} /></span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[11px] font-display tracking-widest text-slate-100">{d.label.toUpperCase()}</span>
                                    <span className="block text-[11px] text-slate-400 leading-snug">{d.question}</span>
                                </span>
                                <kbd className="shrink-0 font-mono text-[10px] text-slate-500 border border-slate-700 rounded px-1">{d.hotkey}</kbd>
                            </button>
                        );
                    })}
                    <div className="px-3 py-1.5 text-[10px] text-slate-500 border-t border-slate-800">
                        1–4 switch · same key, 0 or Esc clears
                    </div>
                </div>
            )}

            {/* ── The legend bar: chips with live counts, faction rows, footer ── */}
            {def && barOpen && (
                <div
                    role="status"
                    aria-live="polite"
                    className="mt-1.5 glass-panel rounded-lg border border-slate-700/60 shadow-lg px-3 py-2 text-[11px]"
                >
                    {result?.empty ? (
                        <div className="flex flex-wrap items-center gap-2 text-slate-300">
                            <span>{result.empty}</span>
                            {def.emptyAction && (
                                <button
                                    type="button"
                                    onClick={() => select(def.emptyAction!.switchTo)}
                                    className="font-display tracking-widest text-[10px] px-2 py-0.5 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                                >
                                    {def.emptyAction.label}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {def.legend.map((entry) => {
                                const count = result?.counts[entry.key] ?? 0;
                                // Zero-count chips dim but never hide: the legend still
                                // has to explain what the colours mean.
                                const dim = !entry.isAction && count === 0;
                                return (
                                    <span
                                        key={entry.key}
                                        className={`flex items-center gap-1 whitespace-nowrap ${dim ? 'opacity-40' : ''}`}
                                        title={entry.label}
                                    >
                                        <Swatch entry={entry} />
                                        <span className="text-slate-300">{entry.label}</span>
                                        {!entry.isAction && <span className="font-mono text-slate-400">{count}</span>}
                                    </span>
                                );
                            })}
                        </div>
                    )}

                    {result?.rows && result.rows.length > 0 && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800 flex flex-wrap gap-x-3 gap-y-1">
                            {result.rows.map((row) => (
                                <button
                                    key={`${row.label}-${row.stance}`}
                                    type="button"
                                    onClick={() => focusSystem(row.focusSystemId)}
                                    disabled={!row.focusSystemId}
                                    title={row.focusSystemId ? 'Focus this faction\'s capital' : undefined}
                                    className="flex items-center gap-1.5 text-slate-300 hover:text-white disabled:cursor-default"
                                >
                                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
                                    <span>{row.label}</span>
                                    <span className="text-slate-500">· {row.stance}</span>
                                    <span className="font-mono text-slate-400">· {row.count} {row.count === 1 ? 'system' : 'systems'}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {result && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-right font-mono text-[10px] text-slate-400">
                            {result.footer}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
