"use client";

// components/panels/ForcesPanel.tsx
// Stars of Dominion — every fleet and army, and where to find it.
//
// Four lists (lib/military/forces-view.ts): your fleets, your armies, foreign
// fleets inside your space, and what your yards are producing. Each row says
// where the force is and what it is doing, and Locate takes the camera there
// with it selected. Fleets and armies can be renamed (MIL_RENAME_FORMATION)
// and a fleet under way can be turned back. "By system" groups everything by
// where it stands, which is the question a player usually has.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import {
    Rocket, Shield, Crosshair, Factory, Search, MapPin, Navigation, Undo2, Pencil, Check, X, Users, Swords, Package,
} from 'lucide-react';
import { buildForcesView, type FleetRow, type ArmyRow, type ForceStatusKind } from '@/lib/military/forces-view';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { formatFleetEta } from '@/lib/movement/eta';
import { formatSimAsClock } from '@/lib/time/galactic-time';

type Tab = 'fleets' | 'armies' | 'contacts' | 'production';

const STATUS_STYLE: Record<ForceStatusKind, string> = {
    combat: 'text-red-300 bg-red-500/15 border-red-500/30',
    sieging: 'text-red-300 bg-red-500/15 border-red-500/30',
    moving: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
    refit: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    lurking: 'text-stone-300 bg-stone-500/15 border-stone-500/30',
    orbit: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/30',
    aboard: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/30',
    holding: 'text-slate-300 bg-slate-700/40 border-slate-600/40',
    stationed: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
    empty: 'text-slate-500 bg-slate-800/60 border-slate-700/60',
};

const VETERANCY_STYLE: Record<number, string> = {
    1: 'text-slate-400', 2: 'text-slate-300', 3: 'text-sky-300', 4: 'text-violet-300', 5: 'text-amber-300',
};

const fmt = (n: number) => n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString();

function Bar({ value, tone }: { value: number; tone: 'good' | 'warn' }) {
    const color = value >= 60 ? 'bg-emerald-500' : value >= 30 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div className="h-1 rounded-full bg-slate-800 overflow-hidden flex-1">
            <div className={`h-full ${tone === 'good' ? color : 'bg-amber-500'}`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
        </div>
    );
}

/** Inline rename: the pencil turns the name into a field; Enter sends MIL_RENAME_FORMATION. */
function Name({ id, name, onRename }: { id: string; name: string; onRename: (id: string, name: string) => void }) {
    const [editing, setEditing] = React.useState(false);
    const [draft, setDraft] = React.useState(name);
    React.useEffect(() => { if (!editing) setDraft(name); }, [name, editing]);
    if (!editing) {
        return (
            <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-semibold text-slate-100 truncate">{name}</span>
                <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} aria-label="Rename" className="text-slate-600 hover:text-slate-300 shrink-0">
                    <Pencil size={11} />
                </button>
            </span>
        );
    }
    const commit = () => { const n = draft.trim(); if (n && n !== name) onRename(id, n); setEditing(false); };
    return (
        <span className="flex items-center gap-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <input
                autoFocus
                value={draft}
                maxLength={40}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { e.preventDefault(); setEditing(false); } }}
                className="min-w-0 flex-1 bg-slate-950 border border-sky-500/40 rounded px-1.5 py-0.5 text-sm text-slate-100 outline-none"
            />
            <button onClick={commit} aria-label="Save name" className="text-emerald-400"><Check size={13} /></button>
            <button onClick={() => setEditing(false)} aria-label="Cancel" className="text-slate-500"><X size={13} /></button>
        </span>
    );
}

/** Owns the 1 Hz clock, so a ticking ETA re-renders one span, not the panel. */
function Eta({ etaSeconds, receivedAt }: { etaSeconds: number; receivedAt: number }) {
    const [now, setNow] = React.useState(() => Date.now());
    React.useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);
    return <>{formatFleetEta(etaSeconds, now - receivedAt) ?? 'arriving'}</>;
}

function FleetCard({ f, displayName, receivedAt, onRename, onLocate, onReturn }: {
    f: FleetRow; displayName: string; receivedAt: number;
    onRename: (id: string, name: string) => void;
    onLocate: (f: FleetRow) => void;
    onReturn: (f: FleetRow) => void;
}) {
    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Rocket size={14} className="text-indigo-300 shrink-0" />
                    <Name id={f.id} name={displayName} onRename={onRename} />
                </div>
                <span className="text-[11px] font-mono text-slate-300 shrink-0" title="Combat power">{fmt(f.power)} pw</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[f.status.kind]}`}>
                    {f.status.text}{f.etaSeconds ? <> · <Eta etaSeconds={f.etaSeconds} receivedAt={receivedAt} /></> : null}
                </span>
                <span className={`text-[10px] ${VETERANCY_STYLE[f.veterancy.rank]}`} title="Veterancy: earned in battle, raises combat power">{f.veterancy.label}</span>
                {f.armiesAboard > 0 && (
                    <span className="text-[10px] text-indigo-300 flex items-center gap-0.5"><Users size={10} /> {f.armiesAboard} {f.armiesAboard === 1 ? 'army' : 'armies'} aboard</span>
                )}
            </div>
            {f.ships.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {f.ships.map(s => (
                        <span key={s.cls} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 capitalize">{s.count} {s.cls}{s.count === 1 ? '' : 's'}</span>
                    ))}
                </div>
            )}
            <div className="flex gap-1.5 pt-0.5">
                <button onClick={() => onLocate(f)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md bg-indigo-600/25 hover:bg-indigo-600/40 border border-indigo-500/40 text-[11px] text-indigo-100">
                    <MapPin size={12} /> Locate &amp; command
                </button>
                {f.originSystemId && (
                    <button onClick={() => onReturn(f)} title="Turn back to where it set out from" className="px-2.5 py-1.5 rounded-md border border-slate-700 text-[11px] text-slate-300 hover:text-white flex items-center gap-1">
                        <Undo2 size={12} /> Turn back
                    </button>
                )}
            </div>
        </div>
    );
}

function ArmyCard({ a, displayName, onRename, onLocate }: {
    a: ArmyRow; displayName: string;
    onRename: (id: string, name: string) => void;
    onLocate: (a: ArmyRow) => void;
}) {
    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Shield size={14} className="text-emerald-300 shrink-0" />
                    <Name id={a.id} name={displayName} onRename={onRename} />
                </div>
                <span className="text-[11px] font-mono text-slate-300 shrink-0">{fmt(a.troopCount)} troops</span>
            </div>
            <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[a.status.kind]}`}>{a.status.text}</span>
            {a.troops.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {a.troops.map(t => <span key={t.type} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{fmt(t.count)} {t.type}</span>)}
                </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-[9px] uppercase tracking-wider text-slate-500">
                <div className="flex items-center gap-1.5">Morale <Bar value={a.morale} tone="good" /><span className="font-mono text-slate-300">{a.morale}</span></div>
                <div className="flex items-center gap-1.5">Supply <Bar value={a.supply} tone="good" /><span className="font-mono text-slate-300">{a.supply}</span></div>
            </div>
            <button onClick={() => onLocate(a)} disabled={!a.systemId} className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md bg-emerald-600/15 hover:bg-emerald-600/30 border border-emerald-500/30 text-[11px] text-emerald-100 disabled:opacity-40">
                <MapPin size={12} /> Locate
            </button>
        </div>
    );
}

export default function ForcesPanel() {
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const fleets = useUIStore(s => s.fleets);
    const armies = useUIStore(s => s.armies);
    const systems = useUIStore(s => s.systems);
    const planets = useUIStore(s => s.planets);
    const recruitmentJobs = useUIStore(s => s.recruitmentJobs);
    const activeCombats = useUIStore(s => s.activeCombats);
    const factions = useUIStore(s => s.factions);
    const nowSeconds = useUIStore(s => s.nowSeconds);

    const [tab, setTab] = React.useState<Tab>('fleets');
    const [query, setQuery] = React.useState('');
    const [bySystem, setBySystem] = React.useState(false);
    /** Renames sent but not yet echoed back by the worker. */
    const [pendingNames, setPendingNames] = React.useState<Record<string, string>>({});
    // Fleet ETAs count down between syncs from when the list arrived.
    const [receivedAt, setReceivedAt] = React.useState(() => Date.now());
    React.useEffect(() => { setReceivedAt(Date.now()); }, [fleets]);

    const view = React.useMemo(() => buildForcesView({
        playerFactionId: playerFactionId ?? '',
        fleets: fleets as any[], armies: armies as any[], systems: systems as any[], planets: planets as any[],
        recruitmentJobs: recruitmentJobs as any[], activeCombats: activeCombats as any[], factions: factions as any,
    }), [playerFactionId, fleets, armies, systems, planets, recruitmentJobs, activeCombats, factions]);

    // Drop a pending name once the synced one matches it.
    React.useEffect(() => {
        setPendingNames(prev => {
            const next = { ...prev };
            for (const f of [...view.fleets, ...view.armies]) if (next[f.id] === f.name) delete next[f.id];
            return Object.keys(next).length === Object.keys(prev).length ? prev : next;
        });
    }, [view]);

    const reserves = ((factions as any)?.[playerFactionId ?? '']?.reserves ?? {}) as Record<string, number>;

    const rename = async (id: string, name: string) => {
        if (!playerFactionId) return;
        setPendingNames(p => ({ ...p, [id]: name }));
        await dispatchOrder({ actionId: 'MIL_RENAME_FORMATION', factionId: playerFactionId, payload: { formationId: id, name }, label: `Renaming to ${name}` });
    };

    /** Take the camera to a system and select what is there. */
    const locate = (systemId: string | null, opts: { fleetId?: string; planetId?: string | null } = {}) => {
        if (!systemId) return;
        const store = useUIStore.getState();
        store.setActiveTab('galaxy' as any);
        store.setSystemView(null);
        store.setSelectedSystem(systemId);
        const sys = (systems as any[]).find(s => s.id === systemId);
        if (sys) store.setFocusTarget({ x: sys.q, y: sys.r, zoom: 2 });
        if (opts.fleetId) store.setSelectedFleetId(opts.fleetId);
        if (opts.planetId) store.setSelectedPlanet(opts.planetId);
    };

    const returnFleet = async (f: FleetRow) => {
        if (!playerFactionId || !f.originSystemId) return;
        await dispatchOrder({ actionId: 'MIL_MOVE_FLEET', factionId: playerFactionId, payload: { fleetId: f.id, destinationId: f.originSystemId }, label: `${f.name} turning back` });
    };

    const q = query.trim().toLowerCase();
    const match = (...texts: string[]) => !q || texts.some(t => t.toLowerCase().includes(q));
    const fleetsShown = view.fleets.filter(f => match(pendingNames[f.id] ?? f.name, f.systemName, f.status.text, ...f.ships.map(s => s.cls)));
    const armiesShown = view.armies.filter(a => match(pendingNames[a.id] ?? a.name, a.systemName, a.status.text));

    const group = <T extends { systemId: string | null; systemName: string }>(rows: T[]) => {
        const map = new Map<string, { name: string; systemId: string | null; rows: T[] }>();
        for (const r of rows) {
            const key = r.systemId ?? 'none';
            if (!map.has(key)) map.set(key, { name: r.systemId ? r.systemName : 'In transit', systemId: r.systemId, rows: [] });
            map.get(key)!.rows.push(r);
        }
        return [...map.values()].sort((a, b) => b.rows.length - a.rows.length);
    };

    const tabs: Array<{ id: Tab; label: string; count: number; icon: React.ReactNode }> = [
        { id: 'fleets', label: 'Fleets', count: view.fleets.length, icon: <Rocket size={12} /> },
        { id: 'armies', label: 'Armies', count: view.armies.length, icon: <Shield size={12} /> },
        { id: 'contacts', label: 'Contacts', count: view.contacts.length, icon: <Crosshair size={12} /> },
        { id: 'production', label: 'In production', count: view.production.length, icon: <Factory size={12} /> },
    ];

    return (
        <div className="h-full flex flex-col overflow-hidden text-slate-200">
            <div className="px-6 py-4 border-b border-slate-700/40 space-y-3">
                <div>
                    <h2 className="font-display text-sm tracking-widest text-red-300 flex items-center gap-2"><Swords size={16} /> FORCES</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Every fleet and army you have, where it is, and what it is doing.</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                        { label: 'Fleets', value: `${view.totals.fleets}`, sub: `${view.totals.ships} ships` },
                        { label: 'Armies', value: `${view.totals.armies}`, sub: `${fmt(view.totals.troops)} troops` },
                        { label: 'Power', value: fmt(view.totals.power), sub: 'fleets and armies' },
                        { label: 'War reserves', value: `${fmt(Math.floor(reserves.AMMO ?? 0))}`, sub: `ammo · ${fmt(Math.floor(reserves.MATERIEL ?? 0))} materiel` },
                    ].map(t => (
                        <div key={t.label} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                            <div className="text-[9px] uppercase tracking-wider text-slate-500">{t.label}</div>
                            <div className="text-lg font-mono text-slate-100 leading-tight">{t.value}</div>
                            <div className="text-[10px] text-slate-500">{t.sub}</div>
                        </div>
                    ))}
                </div>
                <div className="flex gap-1 overflow-x-auto whitespace-nowrap">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border transition-colors ${tab === t.id ? 'bg-slate-700/60 border-slate-500 text-white' : 'border-slate-800 text-slate-400 hover:text-slate-200'}`}
                        >
                            {t.icon}{t.label}<span className="font-mono text-slate-500">{t.count}</span>
                        </button>
                    ))}
                </div>
                {(tab === 'fleets' || tab === 'armies') && (
                    <div className="flex gap-2">
                        <label className="flex-1 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5">
                            <Search size={12} className="text-slate-500" />
                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find by name, place or ship class" className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-600" />
                        </label>
                        <button
                            onClick={() => setBySystem(v => !v)}
                            className={`shrink-0 px-2.5 rounded-lg border text-[11px] ${bySystem ? 'border-sky-500/50 bg-sky-500/10 text-sky-200' : 'border-slate-800 text-slate-400 hover:text-slate-200'}`}
                        >
                            By system
                        </button>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                {tab === 'fleets' && (
                    fleetsShown.length === 0 ? <Empty text={view.fleets.length ? 'No fleet matches.' : 'No fleets yet. Commission ships from a shipyard world (Build → Shipyard).'} />
                    : bySystem ? group(fleetsShown).map(g => (
                        <GroupBlock key={g.name} name={g.name} count={g.rows.length} onLocate={g.systemId ? () => locate(g.systemId) : undefined}>
                            {g.rows.map(f => <FleetCard key={f.id} f={f} displayName={pendingNames[f.id] ?? f.name} receivedAt={receivedAt} onRename={rename} onLocate={(x) => locate(x.systemId, { fleetId: x.id })} onReturn={returnFleet} />)}
                        </GroupBlock>
                    )) : fleetsShown.map(f => <FleetCard key={f.id} f={f} displayName={pendingNames[f.id] ?? f.name} receivedAt={receivedAt} onRename={rename} onLocate={(x) => locate(x.systemId, { fleetId: x.id })} onReturn={returnFleet} />)
                )}

                {tab === 'armies' && (
                    armiesShown.length === 0 ? <Empty text={view.armies.length ? 'No army matches.' : 'No armies yet. Recruit troops from a world: select it and press UNITS.'} />
                    : bySystem ? group(armiesShown).map(g => (
                        <GroupBlock key={g.name} name={g.name} count={g.rows.length} onLocate={g.systemId ? () => locate(g.systemId) : undefined}>
                            {g.rows.map(a => <ArmyCard key={a.id} a={a} displayName={pendingNames[a.id] ?? a.name} onRename={rename} onLocate={(x) => locate(x.systemId, { planetId: x.planetId })} />)}
                        </GroupBlock>
                    )) : armiesShown.map(a => <ArmyCard key={a.id} a={a} displayName={pendingNames[a.id] ?? a.name} onRename={rename} onLocate={(x) => locate(x.systemId, { planetId: x.planetId })} />)
                )}

                {tab === 'contacts' && (
                    view.contacts.length === 0 ? <Empty text="No foreign fleets in systems where you hold a world or keep a fleet." />
                    : view.contacts.map(c => (
                        <div key={c.id} className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5">
                            <Crosshair size={14} className="text-red-300 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="text-sm text-slate-100 truncate">{c.ownerName}</div>
                                <div className="text-[10px] text-slate-400">{c.shipCount} ships · {fmt(c.power)} pw · {c.moving ? 'passing through' : 'holding'} {c.systemName}</div>
                            </div>
                            <button onClick={() => locate(c.systemId)} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-700 text-[11px] text-slate-300 hover:text-white">
                                <MapPin size={12} /> Locate
                            </button>
                        </div>
                    ))
                )}

                {tab === 'production' && (
                    view.production.length === 0 ? <Empty text="Nothing in production. Ships come from shipyards, troops from any of your worlds." />
                    : view.production.map(p => (
                        <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-900/50 px-3 py-2.5">
                            <Package size={14} className="text-amber-300 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="text-sm text-slate-100 truncate">{p.label}</div>
                                <div className="text-[10px] text-slate-500">at {p.planetName}</div>
                            </div>
                            <span className="text-[11px] font-mono text-amber-200 shrink-0">{formatSimAsClock(p.completesAt - nowSeconds, 'Due now')}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function Empty({ text }: { text: string }) {
    return <p className="text-xs text-slate-500 py-6 text-center">{text}</p>;
}

function GroupBlock({ name, count, onLocate, children }: { name: string; count: number; onLocate?: () => void; children: React.ReactNode }) {
    return (
        <section className="space-y-2 pb-2">
            <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[10px] font-display tracking-[0.2em] uppercase text-slate-500">
                    <Navigation size={10} /> {name} <span className="font-mono">{count}</span>
                </h3>
                {onLocate && (
                    <button onClick={onLocate} className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1"><MapPin size={10} /> Show</button>
                )}
            </div>
            {children}
        </section>
    );
}
