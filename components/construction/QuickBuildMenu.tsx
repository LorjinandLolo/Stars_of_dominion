'use client';

// The quick-build menu: the next few things worth building on one world, each
// with one line of why and a one-click Build. Priorities live in
// lib/construction/build-advice.ts (resources, then exploration, then growth).
// Shown on the planet card (compact) and at the top of the Build tab.

import React from 'react';
import { Hammer, Pickaxe, Rocket, Sprout, Check } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { adviseBuilds, ADVICE_GROUP_LABEL, type AdviceGroup, type BuildAdvice } from '@/lib/construction/build-advice';
import { CIVILIAN_SHIPS, civilianCount } from '@/lib/combat/civilian-ships';

const GROUP_ICON: Record<AdviceGroup, React.ReactNode> = {
    resources: <Pickaxe className="w-3 h-3" />,
    exploration: <Rocket className="w-3 h-3" />,
    growth: <Sprout className="w-3 h-3" />,
};

const GROUP_TONE: Record<AdviceGroup, string> = {
    resources: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
    exploration: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
    growth: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
};

const COST_LABEL: Record<string, string> = { CREDITS: 'Cr', METALS: 'Met', CHEMICALS: 'Chm', ENERGY: 'Nrg' };

export default function QuickBuildMenu({ planetId, compact = false, onOpenFull }: { planetId: string; compact?: boolean; onOpenFull?: () => void }) {
    const planet: any = useUIStore(s => s.planets.find((p: any) => p.id === planetId));
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const faction: any = useUIStore(s => (s.factions as any)?.[s.playerFactionId ?? '']);
    const unlocked = useUIStore(s => s.techState?.unlockedTechIds);
    const fleets = useUIStore(s => s.fleets);
    // Orders sent from this menu: hidden until the next sync shows them queued.
    const [sent, setSent] = React.useState<Record<string, number>>({});
    const [notice, setNotice] = React.useState<string | null>(null);

    const hasExplorer = React.useMemo(
        () => (fleets as any[]).some(f => f.factionId === playerFactionId && civilianCount(f.composition, 'explorer') > 0),
        [fleets, playerFactionId],
    );
    const explorerCost = CIVILIAN_SHIPS.explorer.cost;
    const advice = React.useMemo(() => {
        if (!planet) return [];
        const now = Date.now();
        return adviseBuilds(planet, {
            civilizationId: faction?.civilizationId,
            unlockedTech: new Set(unlocked ?? []),
            hasExplorer: hasExplorer || (sent.explorer ?? 0) > now - 3 * 60_000,
        }, explorerCost, 6).filter(a => !((sent[a.id] ?? 0) > now - 30_000)).slice(0, 3);
    }, [planet, faction?.civilizationId, unlocked, hasExplorer, explorerCost, sent]);

    if (!planet || planet.ownerId !== playerFactionId) return null;
    const reserves: Record<string, number> = faction?.reserves ?? {};
    const shortfall = (a: BuildAdvice): string | null => {
        const short = Object.entries(a.cost).find(([k, v]) => v > 0 && (reserves[k] ?? 0) < v);
        return short ? `Need ${Math.ceil(short[1] - (reserves[short[0]] ?? 0)).toLocaleString()} ${short[0].toLowerCase()}` : null;
    };

    const build = async (a: BuildAdvice) => {
        const { dispatchOrder } = await import('@/lib/multiplayer/order-client');
        const res = a.kind === 'explorer'
            ? await dispatchOrder({ actionId: 'MIL_BUILD_CIVILIAN', factionId: playerFactionId!, payload: { planetId, shipType: 'explorer' }, label: 'Laying down Exploration Ship' })
            : await dispatchOrder({ actionId: 'PLANET_CONSTRUCT_BUILDING', factionId: playerFactionId!, payload: { planetId, systemId: planet.systemId, buildingType: a.id }, label: `Constructing ${a.name}` });
        if (res.success) {
            setSent(s => ({ ...s, [a.id]: Date.now() }));
            setNotice(a.kind === 'explorer'
                ? 'Exploration ship laid down. When it is ready, select it and pick a nearby system to scan or survey.'
                : `${a.name} ordered: watch it in the Structures tab.`);
        } else {
            setNotice(res.error ?? 'The order was refused.');
        }
    };

    return (
        <div data-tour="quick-build-menu" className={`rounded-lg border border-indigo-500/30 bg-indigo-950/20 ${compact ? 'p-2 space-y-1.5' : 'p-3 space-y-2'}`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-1.5">
                <Hammer className="w-3 h-3 text-indigo-300" />
                <span className={`font-display tracking-widest uppercase text-indigo-200 whitespace-nowrap ${compact ? 'text-[9px]' : 'text-[10px]'}`}>Build next</span>
                {!compact && <span className="text-[10px] text-slate-500">resources first, then exploration</span>}
                {onOpenFull && (
                    <button onClick={onOpenFull} className="ml-auto whitespace-nowrap text-[9px] text-indigo-300 hover:text-indigo-100 underline-offset-2 hover:underline">
                        All buildings
                    </button>
                )}
            </div>
            {advice.length === 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-300">
                    <Check className="w-3 h-3" /> The essentials are built or on order here. Open the full build list for specialists.
                </div>
            )}
            {advice.map(a => {
                const short = shortfall(a);
                const disabled = !!a.blocked || !!short;
                return (
                    <div key={a.id} className="flex items-start gap-2 rounded-md bg-slate-900/70 border border-slate-800 px-2 py-1.5">
                        <span className={`mt-0.5 shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[8px] uppercase tracking-wider ${GROUP_TONE[a.group]}`}>
                            {GROUP_ICON[a.group]}{ADVICE_GROUP_LABEL[a.group]}
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className={`font-semibold text-slate-100 leading-tight ${compact ? 'text-[10px]' : 'text-xs'}`}>{a.name}</div>
                            <div className={`text-slate-400 leading-snug ${compact ? 'text-[9px]' : 'text-[11px]'}`}>{a.blocked ?? a.why}</div>
                            <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                                {Object.entries(a.cost).filter(([, v]) => v > 0).map(([k, v]) => (
                                    <span key={k} className={`mr-2 ${(reserves[k] ?? 0) < v ? 'text-red-400' : ''}`}>{v.toLocaleString()} {COST_LABEL[k] ?? k}</span>
                                ))}
                            </div>
                        </div>
                        <button
                            disabled={disabled}
                            onClick={() => void build(a)}
                            title={a.blocked ?? short ?? a.why}
                            className={`shrink-0 self-center px-2 py-1 rounded text-[10px] font-semibold transition-colors ${disabled ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                        >
                            {a.blocked ? 'Locked' : short ? 'Short' : 'Build'}
                        </button>
                    </div>
                );
            })}
            {notice && <div className="text-[10px] text-emerald-300">{notice}</div>}
        </div>
    );
}
