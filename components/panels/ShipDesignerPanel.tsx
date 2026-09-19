// components/panels/ShipDesignerPanel.tsx
"use client";

// The Ship Designer. Everything shown here is computed by
// lib/combat/ship-registry.ts#summarizeDesign — the same function the worker
// prices and validates with — so the panel can never promise a ship the
// server refuses. Saves go through the order queue (SHIP_DESIGN_SAVE); the
// registry list comes back via sync, with an optimistic local copy in between.

import React, { useMemo, useState } from 'react';
import {
    Shield, Sword, Zap, Save, Trash2, Plus, Copy, Info, AlertOctagon,
    Cpu, Gauge, Maximize2, Lock, Clock, Coins, Loader2, CheckCircle2, Crosshair,
} from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { registry as techRegistry } from '@/lib/tech/engine';
import {
    DEFAULT_DESIGNS,
    MAX_DESIGNS_PER_FACTION,
    MAX_DESIGN_NAME_LENGTH,
    SHIP_COMPONENTS,
    SHIP_HULLS,
    defaultDesignFor,
    getComponent,
    getHull,
    sameFit,
    summarizeDesign,
} from '@/lib/combat/ship-registry';
import type { DesignSummary, HullSlot, ShipClassId, ShipDesign, SlotType } from '@/lib/combat/ship-types';
import UnitIcon from '@/components/units/UnitIcon';
import { formatBuildTime, formatCredits } from '@/components/units/ShipDesignPicker';
import { HULL_SPEED_FACTORS } from '@/lib/combat/fleet-speed';

const SLOT_META: Record<SlotType, { label: string; icon: React.ReactNode; tint: string }> = {
    weapon: { label: 'Weapon', icon: <Sword size={16} />, tint: 'text-red-400' },
    utility: { label: 'Defense', icon: <Shield size={16} />, tint: 'text-blue-400' },
    core: { label: 'Core', icon: <Zap size={16} />, tint: 'text-amber-400' },
};

function techName(id: string | undefined): string {
    if (!id) return '';
    return techRegistry.get(id)?.name ?? id;
}

function energyLabel(energy: number): string {
    if (energy < 0) return `+${-energy} pwr`;
    if (energy === 0) return '0 pwr';
    return `−${energy} pwr`;
}

function sameDesign(a: { name: string; hullId: string; components: Record<string, string> }, b: ShipDesign | undefined): boolean {
    if (!b) return false;
    if (a.name !== b.name || a.hullId !== b.hullId) return false;
    const ak = Object.entries(a.components).filter(([, v]) => v).sort();
    const bk = Object.entries(b.components ?? {}).filter(([, v]) => v).sort();
    return JSON.stringify(ak) === JSON.stringify(bk);
}

export default function ShipDesignerPanel() {
    const { shipDesigns, upsertShipDesign, removeShipDesign, toggleFloatTab, playerFactionId, techState } = useUIStore();
    const unlocked = useMemo(() => new Set(techState.unlockedTechIds ?? []), [techState.unlockedTechIds]);

    const [hullId, setHullId] = useState<ShipClassId>('corvette');
    const [components, setComponents] = useState<Record<string, string>>({});
    const [name, setName] = useState('New Pattern');
    const [activeId, setActiveId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const hull = getHull(hullId) ?? SHIP_HULLS[0];
    const draft = { hullId, name, components };
    const summary = useMemo(() => summarizeDesign(draft, unlocked), [hullId, name, components, unlocked]);
    const bare = useMemo(() => summarizeDesign({ hullId, name: 'bare', components: {} }, null), [hullId]);
    const standard = defaultDesignFor(hullId);
    const standardSummary = useMemo(() => standard ? summarizeDesign(standard, null) : null, [standard]);

    const activeDesign = activeId ? shipDesigns.find(d => d.id === activeId) : undefined;
    const dirty = !sameDesign(draft, activeDesign);

    // A pattern that ships carry (or are being built or refit to) keeps its
    // fit: a refit is priced from the source pattern, so editing it in place
    // would reprice ships already afloat. The worker refuses that; here the
    // edit is filed as a new pattern instead, and the ships can be refit to it.
    const fleets = useUIStore(s => s.fleets);
    const recruitmentJobs = useUIStore(s => s.recruitmentJobs);
    const inService = useMemo(() => {
        if (!activeDesign || !playerFactionId) return 0;
        let n = 0;
        for (const f of fleets as any[]) {
            if (f.factionId === playerFactionId) n += Math.max(0, Math.floor(Number(f.designCounts?.[activeDesign.id]) || 0));
        }
        for (const j of recruitmentJobs as any[]) {
            if (j.factionId === playerFactionId && (j.designId === activeDesign.id || j.refitFrom?.designId === activeDesign.id)) n += Math.max(0, Math.floor(Number(j.count) || 0));
        }
        return n;
    }, [activeDesign, fleets, recruitmentJobs, playerFactionId]);
    const fitChanged = !!activeDesign && !sameFit(activeDesign, { hullId, components });
    const saveAsNew = inService > 0 && fitChanged;
    const atCap = (!activeDesign || saveAsNew) && shipDesigns.length >= MAX_DESIGNS_PER_FACTION;

    const ownSorted = useMemo(() => {
        const order = new Map(SHIP_HULLS.map((h, i) => [h.id, i]));
        return [...shipDesigns].sort((a, b) =>
            (order.get(a.hullId) ?? 9) - (order.get(b.hullId) ?? 9) || a.name.localeCompare(b.name));
    }, [shipDesigns]);

    // ── Editor actions ────────────────────────────────────────────────────

    const loadDesign = (d: ShipDesign, asCopy: boolean) => {
        setHullId(d.hullId);
        setComponents({ ...(d.components ?? {}) });
        setName(asCopy ? `${d.name} Mk II`.slice(0, MAX_DESIGN_NAME_LENGTH) : d.name);
        setActiveId(asCopy ? null : d.id);
        setConfirmDelete(false);
        setNotice(null);
    };

    const newDesign = () => {
        setHullId('corvette');
        setComponents({});
        setName('New Pattern');
        setActiveId(null);
        setConfirmDelete(false);
        setNotice(null);
    };

    const changeHull = (next: ShipClassId) => {
        const nextHull = getHull(next);
        if (!nextHull) return;
        const slotType = new Map(nextHull.slots.map(s => [s.id, s.type]));
        // Keep whatever still fits — same slot id, same slot type.
        const kept: Record<string, string> = {};
        for (const [slotId, compId] of Object.entries(components)) {
            const comp = getComponent(compId);
            if (comp && slotType.get(slotId) === comp.type) kept[slotId] = compId;
        }
        setHullId(next);
        setComponents(kept);
    };

    const setSlot = (slotId: string, compId: string) => {
        setComponents(prev => {
            const next = { ...prev };
            if (compId) next[slotId] = compId;
            else delete next[slotId];
            return next;
        });
    };

    const save = async () => {
        if (!summary.valid || busy || !playerFactionId || atCap) return;
        setBusy(true);
        setNotice(null);
        const updating = !!activeId && !saveAsNew;
        const id = updating ? activeId! : `design-${playerFactionId}-${Date.now()}`;
        const design: ShipDesign = {
            id,
            factionId: playerFactionId,
            // A pattern filed beside the one in service needs its own name,
            // or the refit row reads "Lancer -> Lancer".
            name: saveAsNew && activeDesign && name.trim() === activeDesign.name
                ? `${name.trim()} Mk II`.slice(0, MAX_DESIGN_NAME_LENGTH)
                : name.trim(),
            hullId,
            components: Object.fromEntries(Object.entries(components).filter(([, v]) => v)),
        };
        const res = await dispatchOrder({
            actionId: 'SHIP_DESIGN_SAVE',
            factionId: playerFactionId,
            payload: { design },
            label: `Filing design: ${design.name}`,
        });
        if (res.success) {
            upsertShipDesign({ ...design, pending: true });
            setActiveId(id);
            setNotice({
                kind: 'ok',
                text: saveAsNew
                    ? `Filed as a new pattern. The ${inService} ship${inService === 1 ? '' : 's'} in service keep the old fit; refit them from their fleet's dossier at a yard.`
                    : updating
                        ? 'Design updated.'
                        : 'Design filed. It appears in every Requisition panel once the yard confirms.',
            });
        } else {
            setNotice({ kind: 'err', text: res.error ?? 'The yard rejected the design.' });
        }
        setBusy(false);
    };

    const del = async () => {
        if (!activeDesign || !playerFactionId || busy) return;
        // The worker refuses to retire a pattern ships still carry
        // (lib/combat/ship-design-service.ts deleteDesign); say so here
        // instead of reporting a retirement that then comes back.
        if (inService > 0) {
            setConfirmDelete(false);
            setNotice({ kind: 'err', text: `${inService} ship${inService === 1 ? ' carries' : 's carry'} this pattern. Refit ${inService === 1 ? 'it' : 'them'} to another pattern first.` });
            return;
        }
        if (!confirmDelete) { setConfirmDelete(true); return; }
        setBusy(true);
        const res = await dispatchOrder({
            actionId: 'SHIP_DESIGN_DELETE',
            factionId: playerFactionId,
            payload: { designId: activeDesign.id },
            label: `Retiring design: ${activeDesign.name}`,
        });
        if (res.success) {
            removeShipDesign(activeDesign.id);
            newDesign();
            setNotice({ kind: 'ok', text: 'Retirement filed with the yard.' });
        } else {
            setNotice({ kind: 'err', text: res.error ?? 'Could not retire the design.' });
        }
        setBusy(false);
    };

    // ── Render ────────────────────────────────────────────────────────────

    const library = (
        <DesignLibrary
            own={ownSorted}
            activeId={activeId}
            unlocked={unlocked}
            onLoad={loadDesign}
            onNew={newDesign}
        />
    );

    return (
        <div className="flex h-full bg-slate-950/80 backdrop-blur-xl border-l border-white/5 text-slate-200">
            {/* Library (wide screens) */}
            <div className="hidden md:flex w-56 shrink-0 border-r border-white/5 bg-black/40 flex-col">
                {library}
            </div>

            {/* Editor */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between gap-3 bg-gradient-to-r from-blue-500/5 to-transparent">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl shrink-0">
                            <Cpu className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="min-w-0">
                            <input
                                value={name}
                                maxLength={MAX_DESIGN_NAME_LENGTH}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Pattern name"
                                className="bg-transparent border-b border-transparent focus:border-blue-500/40 focus:outline-none text-lg font-display text-white p-0 uppercase tracking-widest block w-full max-w-xs"
                            />
                            <p className="text-[10px] text-slate-500 font-mono tracking-widest mt-1 truncate">
                                {hull.name} · {activeDesign ? (activeDesign.pending ? 'syncing with yard…' : 'saved pattern') : 'unsaved draft'}
                                {activeDesign && dirty ? ' · edited' : ''}
                                {inService > 0 ? ` · in service: ${inService} ship${inService === 1 ? '' : 's'}` : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => toggleFloatTab('designer')}
                            className="p-2 bg-slate-900/50 hover:bg-slate-800 border border-white/5 rounded-lg text-slate-400 hover:text-white transition-all"
                            title="Detach panel"
                        >
                            <Maximize2 size={14} />
                        </button>
                        {activeDesign && (
                            <>
                                <button
                                    onClick={() => loadDesign({ ...activeDesign, name, hullId, components }, true)}
                                    className="p-2 bg-slate-900/50 hover:bg-slate-800 border border-white/5 rounded-lg text-slate-400 hover:text-white transition-all"
                                    title="Save as a new pattern"
                                >
                                    <Copy size={14} />
                                </button>
                                <button
                                    onClick={del}
                                    disabled={busy || inService > 0}
                                    className={`p-2 border rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${confirmDelete
                                        ? 'bg-red-600 border-red-500 text-white'
                                        : 'bg-slate-900/50 hover:bg-red-900/40 border-white/5 text-slate-400 hover:text-red-300'}`}
                                    title={inService > 0
                                        ? `${inService} ship${inService === 1 ? ' carries' : 's carry'} this pattern: refit ${inService === 1 ? 'it' : 'them'} first`
                                        : confirmDelete ? 'Click again to retire this pattern' : 'Retire pattern'}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </>
                        )}
                        <button
                            onClick={save}
                            disabled={busy || !summary.valid || atCap || (!!activeDesign && !dirty)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all font-display text-xs tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                            title={atCap
                                ? `Registry full (${MAX_DESIGNS_PER_FACTION})`
                                : !summary.valid
                                    ? summary.issues[0]
                                    : saveAsNew
                                        ? `${inService} ship${inService === 1 ? '' : 's'} carry this pattern, so its fit is kept. This files your change as a new pattern you can refit them to.`
                                        : 'File this pattern with the yard'}
                        >
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            {saveAsNew ? 'SAVE AS NEW PATTERN' : activeDesign ? 'UPDATE' : 'FILE DESIGN'}
                        </button>
                    </div>
                </div>

                {notice && (
                    <div className={`mx-5 mt-3 px-3 py-2 rounded-lg border text-[11px] flex items-center gap-2 ${notice.kind === 'ok'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
                        {notice.kind === 'ok' ? <CheckCircle2 size={12} /> : <AlertOctagon size={12} />}
                        <span>{notice.text}</span>
                    </div>
                )}

                <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-7 custom-scrollbar">
                        {/* Library (narrow screens) */}
                        <div className="md:hidden border border-white/5 rounded-xl bg-black/30 max-h-64 flex flex-col">
                            {library}
                        </div>

                        {/* Hull */}
                        <section className="space-y-3">
                            <h4 className="text-[10px] font-display text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Crosshair size={12} /> Hull
                            </h4>
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                                {SHIP_HULLS.map(h => {
                                    const selected = h.id === hullId;
                                    const w = h.slots.filter(s => s.type === 'weapon').length;
                                    const u = h.slots.filter(s => s.type === 'utility').length;
                                    return (
                                        <button
                                            key={h.id}
                                            onClick={() => changeHull(h.id)}
                                            className={`p-3 rounded-xl border transition-all text-left flex flex-col gap-2 ${selected
                                                ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                                                : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="flex items-center gap-2 min-w-0">
                                                    <span className="text-indigo-300"><UnitIcon type={h.id.toUpperCase() as any} size={18} /></span>
                                                    <span className="text-[11px] font-display text-white uppercase tracking-wider truncate">{h.name}</span>
                                                </span>
                                                <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-blue-400 font-bold shrink-0">{h.size}</span>
                                            </div>
                                            <div className="text-[9px] text-slate-500 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                                                <span title="Bare hull power">⚡ {h.basePower}</span>
                                                <span title="Slots">{w}W · {u}D · 1C</span>
                                                <span title="Built-in reactor">{h.baseEnergy} pwr</span>
                                                <span title="Bare hull cost">{formatCredits(h.baseCost.credits)} cr</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-slate-500 leading-relaxed">{hull.description}</p>
                        </section>

                        {/* Slots */}
                        <section className="space-y-3">
                            <h4 className="text-[10px] font-display text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Gauge size={12} /> Fit — {summary.fitted}/{summary.slots} slots
                            </h4>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                {hull.slots.map(slot => (
                                    <SlotEditor
                                        key={slot.id}
                                        slot={slot}
                                        value={components[slot.id] ?? ''}
                                        unlocked={unlocked}
                                        locked={summary.lockedComponentIds.includes(components[slot.id] ?? '')}
                                        onChange={(id) => setSlot(slot.id, id)}
                                    />
                                ))}
                            </div>
                        </section>

                        {/* Specs (narrow screens) */}
                        <div className="xl:hidden">
                            <Specs summary={summary} bare={bare} standard={standardSummary} standardName={standard?.name} />
                        </div>
                    </div>

                    {/* Specs (wide screens) */}
                    <div className="hidden xl:block w-72 shrink-0 border-l border-white/5 bg-black/20 p-5 overflow-y-auto custom-scrollbar">
                        <Specs summary={summary} bare={bare} standard={standardSummary} standardName={standard?.name} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function DesignLibrary({ own, activeId, unlocked, onLoad, onNew }: {
    own: ShipDesign[];
    activeId: string | null;
    unlocked: Set<string>;
    onLoad: (d: ShipDesign, asCopy: boolean) => void;
    onNew: () => void;
}) {
    return (
        <>
            <div className="p-3 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-[10px] font-display tracking-widest text-slate-400 uppercase">
                    Registry <span className="text-slate-600">{own.length}/{MAX_DESIGNS_PER_FACTION}</span>
                </h3>
                <button onClick={onNew} className="p-1.5 hover:bg-white/10 rounded transition-colors" title="New pattern">
                    <Plus size={14} className="text-blue-400" />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {own.length === 0 && (
                    <p className="text-[10px] text-slate-500 px-2 py-3 leading-relaxed">
                        No patterns filed yet. Load a standard pattern below, change the fit, and file it under a new name.
                    </p>
                )}
                {own.map(d => (
                    <LibraryRow key={d.id} design={d} summary={summarizeDesign(d, unlocked)} active={activeId === d.id} onClick={() => onLoad(d, false)} />
                ))}
                <div className="pt-3 pb-1 px-2 text-[9px] font-display tracking-widest text-slate-600 uppercase">Standard patterns</div>
                {DEFAULT_DESIGNS.map(d => (
                    <LibraryRow key={d.id} design={d} summary={summarizeDesign(d, null)} active={false} standard onClick={() => onLoad(d, true)} />
                ))}
            </div>
        </>
    );
}

function LibraryRow({ design, summary, active, standard, onClick }: {
    design: ShipDesign; summary: DesignSummary; active: boolean; standard?: boolean; onClick: () => void;
}) {
    const hull = getHull(design.hullId);
    return (
        <button
            onClick={onClick}
            className={`w-full p-2.5 rounded-lg text-left transition-all border flex items-center gap-2 ${active
                ? 'bg-blue-500/10 border-blue-500/30'
                : 'border-transparent hover:bg-white/5'}`}
            title={standard ? 'Load as a template for a new pattern' : design.name}
        >
            <span className={standard ? 'text-indigo-300' : 'text-cyan-300'}>
                <UnitIcon type={design.hullId.toUpperCase() as any} size={16} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="text-[11px] font-display text-white truncate flex items-center gap-1.5">
                    {design.name}
                    {design.pending && <Loader2 size={9} className="text-amber-300 animate-spin" />}
                    {!summary.valid && <Lock size={9} className="text-red-300" />}
                </span>
                <span className="text-[9px] text-slate-500 uppercase block mt-0.5 font-mono">
                    {hull?.name ?? design.hullId} · ⚡{summary.power} · {formatCredits(summary.cost.CREDITS)}cr
                </span>
            </span>
            {standard && <Copy size={10} className="text-slate-600 shrink-0" />}
        </button>
    );
}

function SlotEditor({ slot, value, unlocked, locked, onChange }: {
    slot: HullSlot; value: string; unlocked: Set<string>; locked: boolean; onChange: (id: string) => void;
}) {
    const meta = SLOT_META[slot.type];
    const options = SHIP_COMPONENTS.filter(c => c.type === slot.type);
    const current = getComponent(value);
    return (
        <div className={`p-3 rounded-xl border flex flex-col gap-2 ${locked ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/5'}`}>
            <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0 ${meta.tint}`}>
                    {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest">{meta.label} · {slot.id}</div>
                    <select
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full bg-slate-900/70 border border-white/10 rounded px-2 py-1 mt-1 text-xs text-white focus:outline-none focus:border-blue-500/40 cursor-pointer"
                    >
                        <option value="">— empty —</option>
                        {options.map(c => {
                            const gated = !!c.techPrerequisite && !unlocked.has(c.techPrerequisite);
                            return (
                                <option key={c.id} value={c.id} disabled={gated && c.id !== value} className="bg-slate-900">
                                    {gated ? '🔒 ' : ''}{c.name} · {c.powerMult < 0 ? '−' : '+'}{Math.abs(Math.round(c.powerMult * 100))}% · {energyLabel(c.energy)} · {c.cost.credits}cr
                                    {gated ? ` · needs ${techName(c.techPrerequisite)}` : ''}
                                </option>
                            );
                        })}
                    </select>
                </div>
            </div>
            {current && (
                <div className="pl-12 text-[10px] text-slate-400 leading-relaxed">
                    {current.description}
                    {locked && current.techPrerequisite && (
                        <span className="block text-red-300 mt-1">Requires research: {techName(current.techPrerequisite)}.</span>
                    )}
                </div>
            )}
        </div>
    );
}

function Specs({ summary, bare, standard, standardName }: {
    summary: DesignSummary; bare: DesignSummary; standard: DesignSummary | null; standardName?: string;
}) {
    const vsBare = bare.power > 0 ? Math.round(((summary.power - bare.power) / bare.power) * 100) : 0;
    const vsStd = standard && standard.power > 0 ? Math.round(((summary.power - standard.power) / standard.power) * 100) : null;
    // Power grid: the bar runs to the most the reactor can be pushed to
    // (output + 25%), with a tick at rated output. Past the tick is brownout:
    // buildable, but every 1% over costs 1% combat power. Past the bar is refused.
    const gridScale = Math.max(1, summary.maxEnergyDraw, summary.energyProduced);
    const energyPct = Math.min(100, (summary.energyDrawn / gridScale) * 100);
    const ratedTickPct = Math.min(100, (summary.energyProduced / gridScale) * 100);
    const nearLimit = summary.energyProduced > 0 && summary.energyDrawn / summary.energyProduced > 0.85;
    const overCap = summary.overdraw > 0 && summary.brownoutPenalty === 0;
    const hot = summary.overdraw > 0 && !overCap;
    const brownoutPct = Math.round(summary.brownoutPenalty * 100);
    const attack = [['energy', 'Energy', 'bg-fuchsia-400'], ['kinetic', 'Kinetic', 'bg-orange-400'], ['explosive', 'Explosive', 'bg-red-400']] as const;
    const defense = [['shield', 'Shield', 'bg-cyan-400'], ['armor', 'Armor', 'bg-slate-300'], ['evasion', 'Evasion', 'bg-emerald-400']] as const;
    const maxWeight = Math.max(1, ...attack.map(([k]) => summary.profile[k]), ...defense.map(([k]) => summary.profile[k]));

    return (
        <div className="space-y-5">
            <h4 className="text-[10px] font-display text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <Gauge size={12} /> Specification
            </h4>

            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/10">
                <div className="text-[9px] uppercase tracking-widest text-blue-400 font-display">Combat power per ship</div>
                <div className="flex items-end gap-3 mt-1">
                    <div className="text-3xl font-mono text-white">{summary.power}</div>
                    {hot && (
                        <div className="pb-1 leading-tight" title={`Rated ${summary.ratedPower}; the starved reactor costs ${brownoutPct}% in battle.`}>
                            <div className="text-sm font-mono text-slate-500 line-through">{summary.ratedPower}</div>
                            <div className="text-[9px] font-display tracking-widest text-orange-300 bg-orange-500/10 border border-orange-500/30 rounded px-1.5 py-0.5">BROWNOUT -{brownoutPct}%</div>
                        </div>
                    )}
                    <div className="text-[10px] text-slate-400 leading-tight pb-1">
                        <div>{vsBare >= 0 ? '+' : ''}{vsBare}% vs bare hull</div>
                        {vsStd !== null && <div className={vsStd >= 0 ? 'text-emerald-400' : 'text-amber-400'}>{vsStd >= 0 ? '+' : ''}{vsStd}% vs {standardName ?? 'standard'}</div>}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2.5 rounded-lg bg-black/30 border border-white/5">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest flex items-center gap-1"><Coins size={9} /> Cost</div>
                    <div className="text-white mt-1">{summary.cost.CREDITS.toLocaleString()} cr</div>
                    <div className="text-slate-400">{summary.cost.METALS.toLocaleString()} metals</div>
                </div>
                <div className="p-2.5 rounded-lg bg-black/30 border border-white/5">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest flex items-center gap-1"><Clock size={9} /> Build</div>
                    <div className="text-white mt-1">{formatBuildTime(summary.buildTime)}</div>
                    <div className="text-slate-400">{summary.buildTime > bare.buildTime ? `+${formatBuildTime(summary.buildTime - bare.buildTime)} fit` : 'bare hull'}</div>
                    <div className="text-slate-400" title="Strategic lane speed: the slowest hull in a fleet sets the pace; Thrusters and Afterburners add to it.">
                        {`Lane speed ×${(HULL_SPEED_FACTORS[summary.hullId] * (1 + summary.speedMult)).toFixed(2)}`}{summary.speedMult > 0 ? ` (+${Math.round(summary.speedMult * 100)}% fit)` : ''}
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex justify-between text-[9px] uppercase tracking-widest font-mono">
                    <span className="text-slate-500">Power grid</span>
                    <span className={overCap ? 'text-red-400 font-bold' : hot ? 'text-orange-300 font-bold' : 'text-white'}>
                        {summary.energyDrawn} / {summary.energyProduced}
                        {(hot || overCap) && <span className="text-slate-500 font-normal"> (limit {summary.maxEnergyDraw})</span>}
                    </span>
                </div>
                <div className="relative h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    {/* brownout zone: rated output up to the push limit */}
                    <div className="absolute inset-y-0 bg-orange-500/15" style={{ left: `${ratedTickPct}%`, right: 0 }} />
                    <div
                        className={`relative h-full transition-all duration-500 ${overCap ? 'bg-red-500' : hot ? 'bg-orange-400' : nearLimit ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${overCap ? 100 : energyPct}%` }}
                    />
                    <div className="absolute inset-y-0 w-px bg-white/60" style={{ left: `${ratedTickPct}%` }} title="Rated reactor output" />
                </div>
                <div className="text-[10px] text-slate-500 flex gap-2 items-start">
                    {overCap
                        ? <AlertOctagon size={12} className="text-red-400 shrink-0" />
                        : hot
                            ? <AlertOctagon size={12} className="text-orange-300 shrink-0" />
                            : <Info size={12} className="text-blue-400 shrink-0" />}
                    <span>{overCap
                        ? `Draw ${summary.energyDrawn} is past the ${summary.maxEnergyDraw} this reactor can be pushed to. Fit a stronger core or drop a module.`
                        : hot
                            ? `Brownout: ${summary.overdraw} over (${brownoutPct}%). -${brownoutPct}% combat power. A stronger core clears it.`
                            : `${summary.energyBalance} spare. A reactor can be pushed 25% past its output, at 1% combat power per 1% over.`}</span>
                </div>
            </div>

            <div className="space-y-3">
                <div className="text-[9px] uppercase tracking-widest font-mono text-slate-500">Signature</div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <div className="text-[9px] text-slate-600 uppercase">Attack</div>
                        {attack.map(([k, label, color]) => <ProfileBar key={k} label={label} value={summary.profile[k]} max={maxWeight} color={color} />)}
                    </div>
                    <div className="space-y-1.5">
                        <div className="text-[9px] text-slate-600 uppercase">Defense</div>
                        {defense.map(([k, label, color]) => <ProfileBar key={k} label={label} value={summary.profile[k]} max={maxWeight} color={color} />)}
                    </div>
                </div>
                <p className="text-[9px] text-slate-500 leading-relaxed">
                    Energy burns shields, kinetics crack armor, explosives ruin bare hulls and miss evasive ones. Fleets compare signatures in battle for up to ±15% power.
                </p>
            </div>

            <div className={`p-3 rounded-lg border text-[10px] leading-relaxed ${summary.valid
                ? hot ? 'bg-orange-500/5 border-orange-500/25 text-orange-200' : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
                : 'bg-red-500/5 border-red-500/20 text-red-300'}`}>
                {summary.valid && hot ? (
                    <span className="flex gap-2"><AlertOctagon size={12} className="shrink-0 mt-0.5" /> Fileable with brownout: ships built from this pattern fight at -{brownoutPct}% power ({summary.power} instead of {summary.ratedPower}). Cost and build time are unchanged.</span>
                ) : summary.valid ? (
                    <span className="flex gap-2"><CheckCircle2 size={12} className="shrink-0" /> Ready to file. Commission it from any fleet&apos;s Requisition panel or a planet&apos;s Commission Space Forces.</span>
                ) : (
                    <ul className="space-y-1">
                        {summary.issues.map((issue, i) => <li key={i} className="flex gap-2"><AlertOctagon size={12} className="shrink-0 mt-0.5" />{issue}</li>)}
                    </ul>
                )}
            </div>
        </div>
    );
}

function ProfileBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    const pct = Math.min(100, (value / max) * 100);
    return (
        <div>
            <div className="flex justify-between text-[9px] font-mono">
                <span className="text-slate-500">{label}</span>
                <span className="text-slate-300">{value % 1 === 0 ? value : value.toFixed(1)}</span>
            </div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}
