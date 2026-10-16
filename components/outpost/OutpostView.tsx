"use client";

// components/outpost/OutpostView.tsx
// Stars of Dominion — an outpost's own screen (docs/outposts/README.md): the
// crises waiting for an answer, the 5×5 grid, what the colonists have to live
// on, the charter and the outpost's functions, and what it needs to grow.
// Every action is one OUTPOST_ORDER; the worker runs the shifts.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import type { ModuleId, OutpostState, CharterId, OutpostCell } from '@/lib/outposts/outpost-types';
import {
    MODULES, BUILDABLE_MODULES, CHARTERS, CHARTER_IDS, TIERS, cellOpen, terrainOk, mineYield, GRID_SIZE,
    SHIFT_SIM_SECONDS, AIR_RESERVE_MAX, SUPPLY_DROP, CLEAR_ROCK_COST,
} from '@/lib/outposts/outpost-catalog';
import { computeBalance, moduleBuilt } from '@/lib/outposts/outpost-sim';
import { SIM_SECONDS_PER_REAL_SECOND } from '@/lib/time/time-config';
import {
    X, Home, BedDouble, Sun, Atom, Flame, Wind, Sprout, Pickaxe, Warehouse, Anchor, Coffee, HeartPulse, Shield, Lock,
    FlaskConical, Radar, Fuel, Users, Zap, Utensils, Smile, AlertTriangle, Package, ChevronUp, Power, Trash2, Hammer,
    Mountain, Clock, Sparkles, Skull,
} from 'lucide-react';

/** How a crisis reads: an opportunity, a danger, or something that can kill. */
const CRISIS_TONE: Record<string, 'chance' | 'danger' | 'deadly'> = {
    rich_vein: 'chance', ruins: 'chance',
    reactor_fault: 'deadly', raiders: 'deadly', riot: 'deadly', meteor_shower: 'deadly', lab_accident: 'deadly',
};
const TONE_STYLE = {
    chance: { box: 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 to-slate-900/60', title: 'text-emerald-200', Icon: Sparkles },
    danger: { box: 'border-amber-500/45 bg-gradient-to-br from-amber-500/15 to-slate-900/60', title: 'text-amber-200', Icon: AlertTriangle },
    deadly: { box: 'border-red-500/50 bg-gradient-to-br from-red-500/15 to-slate-900/60', title: 'text-red-200', Icon: Skull },
} as const;

const ICON: Record<ModuleId, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
    hub: Home, habitat: BedDouble, solar: Sun, reactor: Atom, geothermal: Flame, life_support: Wind,
    hydroponics: Sprout, mine: Pickaxe, warehouse: Warehouse, dock: Anchor, commons: Coffee, medbay: HeartPulse,
    bunker: Shield, cell_block: Lock, test_lab: FlaskConical, sensor_mast: Radar, fuel_depot: Fuel,
};

/** What a module is for, by colour: the grid reads at a glance. */
type Role = 'life' | 'food' | 'power' | 'industry' | 'civic' | 'security' | 'science' | 'logistics';
const ROLE: Record<ModuleId, Role> = {
    hub: 'life', habitat: 'life', life_support: 'life', medbay: 'life',
    hydroponics: 'food',
    solar: 'power', reactor: 'power', geothermal: 'power',
    mine: 'industry', warehouse: 'industry', dock: 'logistics', fuel_depot: 'logistics',
    commons: 'civic',
    bunker: 'security', cell_block: 'security',
    test_lab: 'science', sensor_mast: 'science',
};
const ROLE_COLOR: Record<Role, string> = {
    life: '#38bdf8', food: '#4ade80', power: '#fbbf24', industry: '#fb923c',
    civic: '#f472b6', security: '#f87171', science: '#a78bfa', logistics: '#2dd4bf',
};
const ROLE_LABEL: Record<Role, string> = {
    life: 'Living', food: 'Food', power: 'Power', industry: 'Industry',
    civic: 'Morale', security: 'Security', science: 'Science', logistics: 'Logistics',
};

/** Ground, painted: each terrain has its own texture so the map reads without labels. */
const TERRAIN_STYLE: Record<string, { label: string; style: React.CSSProperties }> = {
    flat: {
        label: 'Flat ground',
        style: { background: 'radial-gradient(circle at 30% 25%, rgba(148,163,184,0.10) 0 1px, transparent 2px) 0 0/9px 9px, linear-gradient(145deg, #334155 0%, #1e293b 100%)' },
    },
    ore: {
        label: 'Ore',
        style: { background: 'radial-gradient(circle, rgba(251,191,36,0.85) 0 1.5px, transparent 2.5px) 0 0/11px 13px, radial-gradient(circle, rgba(217,119,6,0.7) 0 1px, transparent 2px) 5px 6px/9px 10px, linear-gradient(150deg, #57391a 0%, #2b1d10 100%)' },
    },
    ice: {
        label: 'Ice',
        style: { background: 'linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.18) 45%, transparent 52%), linear-gradient(160deg, #0e7490 0%, #164e63 55%, #0c3a4a 100%)' },
    },
    vent: {
        label: 'Vent',
        style: { background: 'radial-gradient(circle at 50% 58%, rgba(251,146,60,0.75) 0%, rgba(234,88,12,0.35) 22%, transparent 48%), linear-gradient(150deg, #3b1d12 0%, #1c0f0a 100%)' },
    },
    rock: {
        label: 'Rock field',
        style: { background: 'repeating-linear-gradient(35deg, rgba(0,0,0,0.25) 0 2px, transparent 2px 9px), repeating-linear-gradient(-55deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 11px), linear-gradient(150deg, #44403c 0%, #1c1917 100%)' },
    },
    ruin: {
        label: 'Ruins',
        style: { background: 'linear-gradient(rgba(167,139,250,0.18) 1px, transparent 1px) 0 0/10px 10px, linear-gradient(90deg, rgba(167,139,250,0.18) 1px, transparent 1px) 0 0/10px 10px, linear-gradient(150deg, #3b2a5c 0%, #1e1533 100%)' },
    },
};

const fmtCost = (cost: Record<string, number>) =>
    Object.entries(cost).map(([k, v]) => `${v.toLocaleString()} ${k === 'CREDITS' ? 'Cr' : k === 'METALS' ? 'Met' : k.toLowerCase()}`).join(' / ') || 'free';

/** The sim clock moving between syncs (the store's only steps when a snapshot lands). */
function useLiveNow(): number {
    const synced = useUIStore(s => s.nowSeconds);
    const [receivedAt, setReceivedAt] = React.useState(() => Date.now());
    const [, setTick] = React.useState(0);
    React.useEffect(() => { setReceivedAt(Date.now()); }, [synced]);
    React.useEffect(() => { const id = window.setInterval(() => setTick(t => t + 1), 1000); return () => window.clearInterval(id); }, []);
    return synced + ((Date.now() - receivedAt) / 1000) * SIM_SECONDS_PER_REAL_SECOND;
}

/** Live countdown to the next shift, with a thin bar for the shift under way. Its own clock, so the grid stays still. */
function ShiftClock({ nextShiftAt, shift }: { nextShiftAt: number; shift: number }) {
    const now = useLiveNow();
    const left = Math.max(0, nextShiftAt - now);
    const realSecs = Math.round(left / SIM_SECONDS_PER_REAL_SECOND);
    const done = 1 - Math.min(1, left / SHIFT_SIM_SECONDS);
    return (
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Clock size={11} />
            <span>Shift {shift}</span>
            <span className="relative h-1.5 w-28 rounded-full bg-slate-800 overflow-hidden">
                <span className="absolute inset-y-0 left-0 bg-gradient-to-r from-sky-500 to-emerald-400 transition-[width] duration-1000" style={{ width: `${done * 100}%` }} />
            </span>
            <span className="font-mono text-slate-300">{realSecs > 0 ? `${Math.floor(realSecs / 60)}:${String(realSecs % 60).padStart(2, '0')}` : 'now'}</span>
        </div>
    );
}

/** A vital sign with a gauge: how full, and which way it is moving. */
function Gauge({ icon, label, value, sub, fill, tone = 'normal', color }: {
    icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode;
    /** 0..1, or undefined for no bar. */
    fill?: number; tone?: 'normal' | 'bad' | 'good'; color: string;
}) {
    const text = tone === 'bad' ? 'text-red-300' : tone === 'good' ? 'text-emerald-300' : 'text-slate-100';
    const barColor = tone === 'bad' ? '#f87171' : color;
    return (
        <div className={`relative rounded-xl border px-3 py-2 min-w-0 overflow-hidden ${tone === 'bad' ? 'border-red-500/40 bg-red-950/30' : 'border-slate-800 bg-slate-900/70'}`}>
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-slate-500"><span style={{ color }}>{icon}</span>{label}</div>
            <div className={`text-base font-semibold ${text} leading-tight tabular-nums`}>{value}</div>
            {sub && <div className="text-[10px] text-slate-500 leading-tight truncate">{sub}</div>}
            {fill !== undefined && (
                <div className="mt-1.5 h-1 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(3, Math.min(100, fill * 100))}%`, background: barColor, boxShadow: `0 0 6px ${barColor}` }} />
                </div>
            )}
        </div>
    );
}

function Cell({ cell, index, state, selected, running, idle, onClick }: {
    cell: OutpostCell; index: number; state: OutpostState; selected: boolean;
    running: boolean; idle?: 'workers' | 'power'; onClick: () => void;
}) {
    const open = cellOpen(index, state.tier);
    const terrain = TERRAIN_STYLE[cell.terrain] ?? TERRAIN_STYLE.flat;
    const def = cell.module ? MODULES[cell.module] : null;
    const Icon = cell.module ? ICON[cell.module] : cell.terrain === 'rock' ? Mountain : null;
    const color = cell.module ? ROLE_COLOR[ROLE[cell.module]] : '#94a3b8';
    const building = !!cell.module && !moduleBuilt(state, index);
    const down = (cell.downUntilShift ?? 0) > state.shift;
    const clearing = cell.clearingUntilShift !== undefined;
    let status: string | null = null;
    if (building) status = `${cell.buildDoneShift! - state.shift} shift${cell.buildDoneShift! - state.shift === 1 ? '' : 's'}`;
    else if (clearing) status = 'clearing';
    else if (cell.off) status = 'off';
    else if (down) status = 'damaged';
    else if (idle) status = idle === 'workers' ? 'no crew' : 'no power';
    const warn = !!cell.module && !building && !running && !cell.off;
    const built = (def?.buildShifts ?? 1) > 0 && building ? 1 - (cell.buildDoneShift! - state.shift) / Math.max(1, def!.buildShifts) : 1;

    return (
        <button
            onClick={onClick}
            disabled={!open}
            aria-label={`${def ? def.name : terrain.label}${status ? `, ${status}` : ''}`}
            title={def ? `${def.name}${status ? ` (${status})` : ''}` : terrain.label}
            style={terrain.style}
            className={`group relative z-10 aspect-square rounded-lg border overflow-hidden transition-all duration-200 ${
                !open ? 'cursor-not-allowed border-slate-900' :
                selected ? 'border-sky-300 ring-2 ring-sky-400/60 scale-[1.03]' :
                warn ? 'border-red-500/70' : 'border-black/40 hover:border-slate-400/70 hover:scale-[1.02]'
            }`}
        >
            {/* Closed ground lies under fog until the outpost grows. */}
            {!open && <span className="absolute inset-0 bg-slate-950/75 backdrop-blur-[1px]" />}

            {/* A dome: the module sits under glass, lit by its role. */}
            {def && (
                <span
                    className={`absolute inset-[12%] rounded-full flex items-center justify-center transition-all ${building ? 'border border-dashed' : 'border'} ${warn ? 'animate-pulse' : ''}`}
                    style={{
                        borderColor: building ? `${color}aa` : `${color}${running ? 'cc' : '55'}`,
                        background: building
                            ? `conic-gradient(${color}55 ${built * 360}deg, rgba(15,23,42,0.75) 0deg)`
                            : `radial-gradient(circle at 35% 30%, ${color}${running ? '55' : '22'} 0%, rgba(15,23,42,0.85) 70%)`,
                        boxShadow: running && !building ? `0 0 14px ${color}66, inset 0 0 10px ${color}33` : 'none',
                        opacity: cell.off ? 0.45 : 1,
                    }}
                >
                    {Icon && <Icon size={20} style={{ color: running || building ? '#f8fafc' : '#94a3b8' }} />}
                </span>
            )}
            {!def && Icon && open && <Icon size={18} className="absolute inset-0 m-auto text-stone-300/50" />}
            {!def && open && cell.terrain !== 'flat' && (
                <span className="absolute top-1 left-1.5 text-[8px] uppercase tracking-wider text-white/70">{cell.terrain}</span>
            )}
            {def && <span className="absolute top-0.5 inset-x-0 text-[8px] leading-tight text-center text-slate-200/90 truncate px-1">{def.name.split(' ')[0]}</span>}
            {status && (
                <span className={`absolute bottom-0.5 inset-x-0.5 text-[8px] leading-tight rounded px-0.5 text-center font-semibold ${building ? 'bg-sky-950/90 text-sky-200' : warn || down ? 'bg-red-950/90 text-red-200' : 'bg-slate-950/90 text-slate-300'}`}>{status}</span>
            )}
        </button>
    );
}

/**
 * The grid, with conduits between neighbouring modules drawn behind the cells:
 * they show through the gaps, lit when both ends are working.
 */
function Board({ state, running, idleOf, selected, onSelect }: {
    state: OutpostState; running: number[]; idleOf: Map<number, 'workers' | 'power'>;
    selected: number | null; onSelect: (i: number) => void;
}) {
    const runningSet = new Set(running);
    const links: Array<{ a: number; b: number; lit: boolean }> = [];
    state.cells.forEach((c, i) => {
        if (!c.module) return;
        const right = i % GRID_SIZE < GRID_SIZE - 1 ? i + 1 : -1;
        const down = i + GRID_SIZE < state.cells.length ? i + GRID_SIZE : -1;
        for (const j of [right, down]) {
            if (j >= 0 && state.cells[j].module) links.push({ a: i, b: j, lit: runningSet.has(i) && runningSet.has(j) });
        }
    });
    const at = (i: number) => ({ x: (i % GRID_SIZE) + 0.5, y: Math.floor(i / GRID_SIZE) + 0.5 });
    return (
        <div className="relative rounded-2xl p-3 border border-slate-800 bg-[radial-gradient(ellipse_at_50%_40%,rgba(56,189,248,0.08),transparent_65%)]">
            <svg className="absolute inset-3 w-[calc(100%-1.5rem)] h-[calc(100%-1.5rem)] pointer-events-none" viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`} preserveAspectRatio="none" aria-hidden>
                {links.map(({ a, b, lit }) => {
                    const p = at(a), q = at(b);
                    return <line key={`${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={lit ? '#38bdf8' : '#334155'} strokeWidth={lit ? 0.07 : 0.05} strokeLinecap="round" opacity={lit ? 0.9 : 0.7} />;
                })}
            </svg>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}>
                {state.cells.map((cell, i) => (
                    <Cell key={i} cell={cell} index={i} state={state} selected={selected === i} running={runningSet.has(i)} idle={idleOf.get(i)} onClick={() => onSelect(i)} />
                ))}
            </div>
        </div>
    );
}

function Legend() {
    return (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
            {(Object.keys(ROLE_COLOR) as Role[]).map(r => (
                <span key={r} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: ROLE_COLOR[r], boxShadow: `0 0 4px ${ROLE_COLOR[r]}` }} />{ROLE_LABEL[r]}</span>
            ))}
        </div>
    );
}

export default function OutpostView() {
    const planetId = useUIStore(s => s.outpostPlanetId);
    const setOutpostPlanet = useUIStore(s => s.setOutpostPlanet);
    const planets = useUIStore(s => s.planets);
    const factions = useUIStore(s => s.factions);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const prisonerGroups = useUIStore(s => s.prisoners);
    const planet: any = planets.find((p: any) => p.id === planetId);
    const state: OutpostState | undefined = planet?.outpost;
    const reserves: Record<string, number> = (factions as any)?.[playerFactionId ?? '']?.reserves ?? {};

    const [selected, setSelected] = React.useState<number | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); setOutpostPlanet(null); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [setOutpostPlanet]);
    React.useEffect(() => { if (planetId && planet && !state) setOutpostPlanet(null); }, [planetId, planet, state, setOutpostPlanet]);

    const held = React.useMemo(() => {
        const ids = new Set(state?.prisonerGroupIds ?? []);
        return (prisonerGroups ?? []).filter((g: any) => ids.has(g.id) && !g.resolved);
    }, [prisonerGroups, state?.prisonerGroupIds]);
    const prisoners = held.reduce((s: number, g: any) => s + (g.count ?? 0), 0);
    const balance = React.useMemo(() => state ? computeBalance(state, { prisoners, rareWorld: (planet?.tags ?? []).some((t: string) => /rare/.test(t)) }) : null, [state, prisoners, planet?.tags]);

    if (!planet || !state || !balance) return null;
    const mine = planet.ownerId === playerFactionId;

    const send = async (op: Record<string, any>, label: string) => {
        setBusy(true); setError(null);
        try {
            const res = await dispatchOrder({ actionId: 'OUTPOST_ORDER', factionId: playerFactionId!, payload: { planetId: planet.id, ...op }, label });
            if (!res.success) setError(res.error || 'The outpost could not do that.');
        } catch (e: any) { setError(e.message); }
        finally { setBusy(false); }
    };

    const idleOf = new Map(balance.idle.map(x => [x.cell, x.reason]));
    const sel = selected !== null ? state.cells[selected] : null;
    const tierDef = TIERS[state.tier];
    const next = tierDef.next;
    const heldInWarehouse = Object.values(state.warehouse).reduce((s, n) => s + n, 0);
    const airFlow = balance.airMade - balance.airUsed;
    const foodFlow = balance.foodMade - balance.foodUsed;
    const powerShort = balance.idle.some(x => x.reason === 'power');
    const derelict = state.colonists <= 0 && !state.graduated;
    const besieged = !!planet.siege && !!planet.siege.attackerEmpireId && planet.siege.attackerEmpireId !== planet.ownerId && !planet.siege.winner;
    const bunkers = state.cells.filter((c, i) => c.module === 'bunker' && moduleBuilt(state, i)).length;
    const capturable = (prisonerGroups ?? []).filter((g: any) => !g.resolved && g.captorEmpireId === playerFactionId && !(state.prisonerGroupIds ?? []).includes(g.id));
    const hasLab = balance.running.some(i => state.cells[i].module === 'test_lab');
    const hasDock = balance.running.some(i => state.cells[i].module === 'dock');
    const blockers: string[] = [];
    if (next) {
        if (state.colonists < next.colonists) blockers.push(`${next.colonists} colonists (${state.colonists})`);
        if (state.morale < next.morale) blockers.push(`morale ${next.morale} (${state.morale})`);
        for (const m of next.modules) if (!state.cells.some((c, i) => c.module === m && moduleBuilt(state, i))) blockers.push(`a ${MODULES[m].name}`);
        if (besieged) blockers.push('the siege lifted');
        for (const [k, v] of Object.entries(next.cost)) if ((reserves[k] ?? 0) < v) blockers.push(`${v.toLocaleString()} ${k.toLowerCase()}`);
    }

    return (
        <div className="fixed inset-0 z-[45] bg-slate-950/95 backdrop-blur-sm overflow-y-auto pt-16 pb-24" onClick={() => setSelected(null)}>
            <div className="max-w-5xl mx-auto px-4 py-4 space-y-4" onClick={e => e.stopPropagation()}>
                {/* Header: the world on the horizon, what the outpost is, and the shift clock */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 px-4 py-3">
                    <div className="pointer-events-none absolute -right-16 -bottom-24 w-72 h-72 rounded-full opacity-60"
                        style={{ background: 'radial-gradient(circle at 35% 30%, rgba(56,189,248,0.35), rgba(14,116,144,0.15) 45%, transparent 70%)' }} />
                    <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0 0.6px, transparent 1.2px) 0 0/37px 41px' }} />
                    <div className="relative flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.2em]">
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{state.graduated ? 'Colony' : tierDef.name}</span>
                                <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/25">{CHARTERS[state.charter].name}</span>
                                {state.crises.length > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 border border-amber-500/40 animate-pulse">{state.crises.length} crisis{state.crises.length === 1 ? '' : 'es'}</span>}
                            </div>
                            <h2 className="text-2xl font-display font-bold text-slate-50 truncate">{planet.name}</h2>
                            {!state.graduated && <ShiftClock nextShiftAt={state.nextShiftAt} shift={state.shift} />}
                        </div>
                        <button onClick={() => setOutpostPlanet(null)} aria-label="Close outpost" className="p-2 rounded-lg border border-slate-700 bg-slate-900/80 text-slate-400 hover:text-white shrink-0"><X size={16} /></button>
                    </div>
                    {next && !state.graduated && (
                        <div className="relative mt-3">
                            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                                <span>To {TIERS[(state.tier + 1) as 2 | 3].name.toLowerCase()}</span>
                                <span className="tabular-nums">{state.colonists} / {next.colonists} colonists</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-400" style={{ width: `${Math.min(100, (state.colonists / next.colonists) * 100)}%` }} />
                            </div>
                        </div>
                    )}
                </div>

                {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}

                {derelict && (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 flex items-center justify-between gap-3">
                        <div className="text-sm text-red-200">Nobody is left. The domes stand empty.</div>
                        <button disabled={busy || !mine} onClick={() => send({ op: 'resettle' }, 'Resettle outpost')} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50">Land a new crew · 1,000 Cr</button>
                    </div>
                )}

                {besieged && (
                    <div className="rounded-xl border border-red-500/50 bg-gradient-to-r from-red-950/70 to-slate-950/60 p-4 flex items-start gap-3">
                        <Skull size={18} className="text-red-300 shrink-0 mt-0.5" />
                        <div className="text-sm text-red-100 space-y-1">
                            <div className="font-bold">Under siege</div>
                            <div className="text-xs text-red-200/80">Enemy troops are on the ground. No colonists arrive, no supply ship lands, and morale sinks every shift. Bombardment wrecks domes and kills colonists unless they shelter in a bunker{bunkers ? ` (you have ${bunkers}; they also dig your defenders in)` : ''}.</div>
                        </div>
                    </div>
                )}

                {/* Crises */}
                {state.crises.map(c => (
                    <div key={c.id} className={`rounded-xl border p-4 space-y-3 ${TONE_STYLE[CRISIS_TONE[c.kind] ?? 'danger'].box}`}>
                        <div className="flex items-start justify-between gap-2">
                            <div className={`flex items-center gap-2 font-bold ${TONE_STYLE[CRISIS_TONE[c.kind] ?? 'danger'].title}`}>
                                {React.createElement(TONE_STYLE[CRISIS_TONE[c.kind] ?? 'danger'].Icon, { size: 16 })} {c.title}
                            </div>
                            <div className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded ${c.deadlineShift - state.shift <= 1 ? 'bg-red-500/20 text-red-200' : 'bg-slate-900/60 text-slate-300'}`}>{Math.max(0, c.deadlineShift - state.shift)} shift{c.deadlineShift - state.shift === 1 ? '' : 's'} to decide</div>
                        </div>
                        <p className="text-sm text-slate-200">{c.text}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {c.options.map(o => (
                                <button key={o.id} disabled={busy || !mine} onClick={() => send({ op: 'resolve', crisisId: c.id, option: o.id }, `${c.title}: ${o.label}`)}
                                    className="text-left rounded-lg border border-slate-600/80 bg-slate-950/70 hover:border-slate-300/60 hover:bg-slate-900 hover:-translate-y-0.5 transition-all px-3 py-2 disabled:opacity-50">
                                    <div className="text-xs font-semibold text-slate-100">{o.label}</div>
                                    <div className="text-[11px] text-slate-400">{o.detail}</div>
                                    {(o.id === (planet.governorId ? c.steward : c.fallback)) && <div className="text-[9px] text-slate-500 mt-1 uppercase tracking-wider">{planet.governorId ? 'The governor would pick this' : 'What happens if you say nothing'}</div>}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Vital signs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    <Gauge color="#38bdf8" icon={<Users size={11} />} label="Colonists" value={`${state.colonists} / ${balance.housing}`} sub={`${balance.workersFree} free hands`} fill={balance.housing ? state.colonists / balance.housing : 0} tone={state.colonists > balance.housing ? 'bad' : 'normal'} />
                    <Gauge color="#fbbf24" icon={<Zap size={11} />} label="Power" value={`${balance.powerUsed} / ${balance.powerMade}`} sub={powerShort ? 'modules going dark' : `${Math.round((balance.powerMade - balance.powerUsed) * 10) / 10} spare`} fill={balance.powerMade ? balance.powerUsed / balance.powerMade : 1} tone={powerShort ? 'bad' : 'normal'} />
                    <Gauge color="#67e8f9" icon={<Wind size={11} />} label="Air" value={`${state.air} / ${AIR_RESERVE_MAX}`} sub={airFlow < 0 ? `${airFlow} a shift · gone in ${Math.max(0, Math.floor(state.air / -airFlow))}` : `+${airFlow} a shift`} fill={state.air / AIR_RESERVE_MAX} tone={airFlow < 0 ? 'bad' : 'normal'} />
                    <Gauge color="#4ade80" icon={<Utensils size={11} />} label="Food" value={state.food} sub={foodFlow < 0 ? `${foodFlow} a shift · lasts ${Math.floor(state.food / -foodFlow)}` : `+${foodFlow} a shift`} fill={Math.min(1, state.food / 40)} tone={foodFlow < 0 && state.food < 6 ? 'bad' : foodFlow >= 0 ? 'good' : 'normal'} />
                    <Gauge color="#f472b6" icon={<Smile size={11} />} label="Morale" value={<>{state.morale}{balance.moraleTarget !== state.morale && <span className={`text-[11px] ml-1 ${balance.moraleTarget > state.morale ? 'text-emerald-400' : 'text-red-400'}`}>{balance.moraleTarget > state.morale ? '▲' : '▼'} {balance.moraleTarget}</span>}</>} sub={state.morale < 25 ? 'colonists are leaving' : state.morale >= 40 ? 'newcomers welcome' : 'nobody new will come'} fill={state.morale / 100} tone={state.morale < 30 ? 'bad' : state.morale >= 60 ? 'good' : 'normal'} />
                    <Gauge color="#fb923c" icon={<Package size={11} />} label="Warehouse" value={balance.storage ? `${Math.round(heldInWarehouse)} / ${balance.storage}` : 'none'} fill={balance.storage ? heldInWarehouse / balance.storage : undefined}
                        sub={Object.keys(balance.output).length ? Object.entries(balance.output).map(([k, v]) => `+${v} ${k.toLowerCase()}`).join(', ') : balance.storage ? 'nothing coming in' : 'build one to keep output'} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
                    {/* Grid */}
                    <div className="space-y-2">
                        <div className="max-w-[540px] mx-auto w-full">
                            <Board state={state} running={balance.running} idleOf={idleOf} selected={selected} onSelect={i => setSelected(selected === i ? null : i)} />
                        </div>
                        <Legend />
                        {state.tier === 1 && !state.graduated && <p className="text-[10px] text-slate-500 text-center">The outer ring opens when the outpost becomes a settlement.</p>}
                    </div>

                    {/* Side: selected cell, or the outpost's functions */}
                    <div className="space-y-3">
                        {sel && selected !== null ? (
                            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 space-y-2">
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">{TERRAIN_STYLE[sel.terrain]?.label}</div>
                                {sel.module ? (() => {
                                    const def = MODULES[sel.module];
                                    const yieldHere = sel.module === 'mine' ? mineYield(sel.terrain, (planet.tags ?? []).some((t: string) => /rare/.test(t))) : null;
                                    return (
                                        <>
                                            <div className="font-semibold text-slate-100">{def.name}</div>
                                            <p className="text-xs text-slate-400">{def.blurb}</p>
                                            <div className="text-[11px] text-slate-400 space-y-0.5">
                                                {def.workers > 0 && <div>Crew {def.workers}</div>}
                                                {def.power !== 0 && <div>Power {def.power > 0 ? `+${def.power}` : def.power}</div>}
                                                {def.air && <div>Air +{def.air}</div>}
                                                {def.food && <div>Food +{def.food}</div>}
                                                {def.housing && <div>Houses {def.housing}</div>}
                                                {def.storage && <div>Stores {def.storage}</div>}
                                                {def.prison && <div>Holds {def.prison} prisoners</div>}
                                                {yieldHere && <div>Yields {Object.entries(yieldHere).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')} a shift</div>}
                                                {idleOf.get(selected) && <div className="text-red-300">Idle: {idleOf.get(selected) === 'workers' ? 'not enough colonists to crew it' : 'not enough power'}</div>}
                                            </div>
                                            {sel.module !== 'hub' && !state.graduated && (
                                                <div className="flex gap-2 pt-1">
                                                    <button disabled={busy || !mine} onClick={() => send({ op: 'toggle', cell: selected }, `${def.name} ${sel.off ? 'on' : 'off'}`)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md border border-slate-600 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"><Power size={12} /> {sel.off ? 'Switch on' : 'Switch off'}</button>
                                                    <button disabled={busy || !mine} onClick={() => { if (window.confirm(`Tear down the ${def.name}? Nothing is refunded.`)) send({ op: 'demolish', cell: selected }, `Tear down ${def.name}`); }} className="px-2.5 py-1.5 rounded-md border border-red-500/40 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50" aria-label="Tear down"><Trash2 size={12} /></button>
                                                </div>
                                            )}
                                        </>
                                    );
                                })() : sel.terrain === 'rock' && sel.clearingUntilShift === undefined ? (
                                    <>
                                        <p className="text-xs text-slate-400">Nothing but a bunker stands on a rock field until it is cleared.</p>
                                        <button disabled={busy || !mine || state.graduated} onClick={() => send({ op: 'clear', cell: selected }, 'Clear rock')} className="w-full py-1.5 rounded-md bg-stone-600 hover:bg-stone-500 text-xs text-white disabled:opacity-50">Clear it · {fmtCost(CLEAR_ROCK_COST)} · 1 shift</button>
                                        <BuildList state={state} cellIndex={selected} reserves={reserves} busy={busy || !mine} onBuild={(m) => send({ op: 'build', cell: selected, module: m }, `Build ${MODULES[m].name}`)} />
                                    </>
                                ) : (
                                    <BuildList state={state} cellIndex={selected} reserves={reserves} busy={busy || !mine} onBuild={(m) => send({ op: 'build', cell: selected, module: m }, `Build ${MODULES[m].name}`)} />
                                )}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-400">Pick a square to build on it, or a module to see what it does.</div>
                        )}

                        {/* Charter */}
                        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2">
                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Charter: the outpost&apos;s job</div>
                            <select value={state.charter} disabled={busy || !mine} onChange={e => send({ op: 'charter', charter: e.target.value as CharterId }, 'Change charter')} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200">
                                {CHARTER_IDS.map(id => <option key={id} value={id}>{CHARTERS[id].name}</option>)}
                            </select>
                            <p className="text-[11px] text-slate-400">{CHARTERS[state.charter].blurb}</p>
                        </div>

                        {/* Functions */}
                        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2">
                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Orders</div>
                            {!state.graduated && (
                                <button disabled={busy || !mine || derelict} onClick={() => send({ op: 'supply' }, 'Supply drop')} className="w-full py-1.5 rounded-md border border-slate-600 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                                    Supply drop: +{SUPPLY_DROP.food} food · {fmtCost(Object.fromEntries(Object.entries(SUPPLY_DROP.cost).map(([k, v]) => [k, hasDock ? v : v * 2])))}
                                </button>
                            )}
                            {hasLab && (
                                <div className="flex gap-2">
                                    <button disabled={busy || !mine || state.shift < state.experimentReadyShift} onClick={() => send({ op: 'experiment', subjects: 'volunteers' }, 'Run experiment')} className="flex-1 py-1.5 rounded-md bg-violet-700/60 hover:bg-violet-600/60 text-xs text-white disabled:opacity-50">
                                        {state.shift < state.experimentReadyShift ? `Lab busy (${state.experimentReadyShift - state.shift})` : 'Run experiment'}
                                    </button>
                                    {prisoners > 0 && (
                                        <button disabled={busy || !mine || state.shift < state.experimentReadyShift} onClick={() => { if (window.confirm('Use prisoners as test subjects? Twice the gain; some will die, and their homeland will hear of it.')) send({ op: 'experiment', subjects: 'prisoners' }, 'Experiment on prisoners'); }} className="px-2 py-1.5 rounded-md border border-red-500/40 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-50">On prisoners</button>
                                    )}
                                </div>
                            )}
                            {balance.prisonCapacity > 0 && (
                                <div className="space-y-1.5">
                                    <div className="text-[11px] text-slate-300 flex items-center gap-1"><Lock size={11} /> Prisoners {prisoners} / {balance.prisonCapacity}</div>
                                    <label className="flex items-center gap-2 text-[11px] text-slate-400">
                                        <input type="checkbox" checked={!!state.prisonLabour} disabled={busy || !mine} onChange={e => send({ op: 'labour', on: e.target.checked }, 'Prison labour')} className="accent-amber-500" />
                                        Put them to work (metals, riots, angry homelands)
                                    </label>
                                    {capturable.length > 0 && (hasDock ? capturable.slice(0, 4).map((g: any) => (
                                        <button key={g.id} disabled={busy || !mine} onClick={() => send({ op: 'transfer_prisoners', groupId: g.id }, 'Move prisoners')} className="w-full text-left py-1 px-2 rounded border border-slate-700 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                                            Bring {g.count} {String(g.unitType ?? '').toLowerCase()} from {g.planetName}
                                        </button>
                                    )) : <p className="text-[10px] text-slate-500">Prisoner transports need a working landing dock.</p>)}
                                </div>
                            )}
                        </div>

                        {/* Growth */}
                        {next && !state.graduated && (
                            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                                <div className="text-[10px] uppercase tracking-widest text-emerald-400/80 flex items-center gap-1"><ChevronUp size={11} /> Grow into a {TIERS[(state.tier + 1) as 2 | 3].name.toLowerCase()}</div>
                                {blockers.length ? (
                                    <ul className="text-[11px] text-slate-400 list-disc pl-4">{blockers.map(b => <li key={b}>{b}</li>)}</ul>
                                ) : <p className="text-[11px] text-emerald-200">Ready.</p>}
                                <p className="text-[10px] text-slate-500">{state.tier === 1 ? 'Opens the whole plain.' : 'The world becomes a colony with a full surface for districts; these modules keep working.'}</p>
                                <button disabled={busy || !mine || blockers.length > 0} onClick={() => send({ op: 'advance' }, 'Grow outpost')} className="w-full py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white disabled:opacity-40">
                                    Grow · {fmtCost(next.cost)}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Log */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Outpost log</div>
                    <ul className="space-y-1 max-h-56 overflow-y-auto">
                        {state.log.map((l, i) => (
                            <li key={i} className={`text-[11px] ${l.tone === 'bad' ? 'text-red-300' : l.tone === 'good' ? 'text-emerald-300' : 'text-slate-400'}`}>
                                <span className="text-slate-600 font-mono mr-2">{l.shift}</span>{l.text}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

function BuildList({ state, cellIndex, reserves, busy, onBuild }: {
    state: OutpostState; cellIndex: number; reserves: Record<string, number>; busy: boolean; onBuild: (m: ModuleId) => void;
}) {
    const cell = state.cells[cellIndex];
    if (state.graduated) return <p className="text-xs text-slate-500">This is a colony now: build on its surface.</p>;
    const options = BUILDABLE_MODULES.filter(m => terrainOk(m, cell.terrain) && (cell.terrain !== 'rock' || m === 'bunker'));
    if (!options.length) return <p className="text-xs text-slate-500">Nothing can be built on this ground.</p>;
    return (
        <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 flex items-center gap-1"><Hammer size={10} /> Build here</div>
            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
                {options.map(m => {
                    const def = MODULES[m];
                    const locked = (def.minTier ?? 1) > state.tier;
                    const short = Object.entries(def.cost).find(([k, v]) => (reserves[k] ?? 0) < v);
                    const Icon = ICON[m];
                    return (
                        <button key={m} disabled={busy || locked || !!short} onClick={() => onBuild(m)} className="w-full text-left flex items-start gap-2 rounded-md border border-slate-700 hover:border-sky-500/50 bg-slate-950/60 px-2 py-1.5 disabled:opacity-45">
                            <Icon size={14} className="text-slate-300 mt-0.5 shrink-0" />
                            <span className="min-w-0 flex-1">
                                <span className="flex justify-between gap-2 text-xs text-slate-100"><span>{def.name}</span><span className="text-[10px] text-slate-500 shrink-0">{def.buildShifts} shift{def.buildShifts === 1 ? '' : 's'}</span></span>
                                <span className="block text-[10px] text-slate-400 leading-snug">{def.blurb}</span>
                                <span className={`block text-[10px] ${short ? 'text-red-300' : 'text-fuchsia-300/80'}`}>{locked ? `Needs a ${TIERS[def.minTier!].name.toLowerCase()}` : fmtCost(def.cost)}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
            <p className="text-[10px] text-slate-600">A shift is {Math.round(SHIFT_SIM_SECONDS / SIM_SECONDS_PER_REAL_SECOND / 60)} minutes.</p>
        </div>
    );
}
