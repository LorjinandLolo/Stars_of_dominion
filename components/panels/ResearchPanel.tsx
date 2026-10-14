"use client";

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import {
    Zap,
    Activity,
    Atom,
    Shield,
    TrendingUp,
    Globe,
    Eye,
    Search,
    Filter,
    Minus,
    Plus,
    Maximize2,
    Signpost,
} from 'lucide-react';
import { TechTreeType, TechTier, type Tech } from '@/lib/tech/types';
import { registry } from '@/lib/tech/engine';
import { startResearchAction } from '@/app/actions/tech';
import { patchUiPrefs } from '@/lib/player/use-ui-prefs';
import '@/lib/tech/techData';
import TechNode, { STATUS_META, STATUS_ORDER, type TechNodeEmphasis, type TechNodeStatus } from '../tech/TechNode';
import TechConnectors from '../tech/TechConnectors';
import TechInspector from '../tech/TechInspector';
import ForkRails from '../tech/ForkRails';
import { closedBy, closedTechIds, forkChoices, forkCost, forkLabel, forksOf, requiredForkOption } from '@/lib/tech/forks';
import {
    GUTTER_W,
    TIER_NAMES,
    TIER_NUMERALS,
    canvasSize,
    gridOffset,
    nodeRect,
    tierBands,
} from '../tech/layout';

const MIN_SCALE = 0.3;
const MAX_SCALE = 1.5;
const SCALE_STEP = 0.1;
// Every tree spans grid x 0..18 (~4300px), so a width-fit lands well below the
// zoom buttons' floor on any real display. Fit gets its own floor; the buttons
// keep theirs, so one click of + walks back up into readable range.
const FIT_MIN_SCALE = 0.12;
// An authorized order rides the order queue to the worker and comes back on a
// later sync; hold the card in "authorizing" until then, or give up after this.
const PENDING_TIMEOUT_MS = 30_000;

const BRANCHES = [
    { id: TechTreeType.ESPIONAGE, label: 'Espionage', icon: Eye, color: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/20' },
    { id: TechTreeType.MILITARY, label: 'Military', icon: Shield, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
    { id: TechTreeType.ECONOMY, label: 'Economy', icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
    { id: TechTreeType.DIPLOMACY, label: 'Diplomacy', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
    { id: TechTreeType.INFRASTRUCTURE, label: 'Infrastructure', icon: Atom, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
];

// Band tint per tier; the gutter label and the canvas band share it so the
// reader can match the two at a glance even when the band is scrolled far right.
const TIER_STYLE: Record<TechTier, { band: string; label: string }> = {
    [TechTier.FOUNDATION]: { band: 'bg-slate-500/[0.06] border-slate-400/20', label: 'text-slate-300' },
    [TechTier.EXPANSION]: { band: 'bg-indigo-500/[0.06] border-indigo-400/20', label: 'text-indigo-300' },
    [TechTier.SPECIALIZATION]: { band: 'bg-purple-500/[0.06] border-purple-400/20', label: 'text-purple-300' },
    [TechTier.DOMINANCE]: { band: 'bg-red-500/[0.06] border-red-400/20', label: 'text-red-300' },
    [TechTier.TRANSFORMATION]: { band: 'bg-amber-500/[0.06] border-amber-400/20', label: 'text-amber-300' },
};

interface NodeState { status: TechNodeStatus; progress: number }

/** uiPrefs.opened id for the one-time fork explainer. */
const FORK_EXPLAINER_ID = 'research-forks';

export default function ResearchPanel() {
    // Narrow selectors: the whole-store subscription re-rendered ~44 nodes and
    // the full edge list on every 4s sync poll.
    const techState = useUIStore(s => s.techState);
    const playerFactionId = useUIStore(s => s.playerState.factionId);

    const [activeBranch, setActiveBranch] = useState<TechTreeType>(TechTreeType.ESPIONAGE);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [availableOnly, setAvailableOnly] = useState(false);
    const [scale, setScale] = useState(1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /** Techs authorized here whose slot has not yet come back from the worker. */
    const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());

    const scrollRef = useRef<HTMLDivElement>(null);

    const allTechs = useMemo(() => registry.getAll(), []);
    // Keyed over every tree, not just the visible one, so the inspector can name
    // a cross-tree prerequisite instead of showing a blank link.
    const byId = useMemo(() => new Map(allTechs.map(t => [t.id, t] as const)), [allTechs]);
    const techs = useMemo(() => allTechs.filter(t => t.tree === activeBranch), [allTechs, activeBranch]);
    const offset = useMemo(() => gridOffset(techs), [techs]);
    const canvas = useMemo(() => canvasSize(techs, offset), [techs, offset]);
    const bands = useMemo(() => tierBands(techs, offset), [techs, offset]);

    const unlockedIds = useMemo(() => new Set(techState.unlockedTechIds), [techState.unlockedTechIds]);
    const lockedIds = useMemo(() => new Set(techState.lockedTechIds ?? []), [techState.lockedTechIds]);
    const activeSlots = useMemo(() => techState.activeSlots ?? [], [techState.activeSlots]);

    // Forks of no return (lib/tech/forks.ts). A fork is decided when research
    // starts, so an option being researched — or just authorized here — counts.
    const forks = useMemo(() => forksOf(allTechs), [allTechs]);
    const treeForks = useMemo(() => [...forks.values()].filter(f => f.tree === activeBranch), [forks, activeBranch]);
    const committedIds = useMemo(() => new Set<string>([
        ...unlockedIds,
        ...activeSlots.map(s => s.techId).filter((id): id is string => !!id),
        ...pendingIds,
    ]), [unlockedIds, activeSlots, pendingIds]);
    const choices = useMemo(() => forkChoices(forks, committedIds), [forks, committedIds]);
    const decidedGroups = useMemo(() => new Set(choices.keys()), [choices]);
    // Locked options plus everything that needs one: closed for the season.
    const closedIds = useMemo(() => closedTechIds(allTechs, lockedIds), [allTechs, lockedIds]);

    const nodeStates = useMemo(() => {
        const out = new Map<string, NodeState>();
        for (const tech of techs) {
            const slot = activeSlots.find(s => s.techId === tech.id);
            let status: TechNodeStatus;
            if (unlockedIds.has(tech.id)) status = 'unlocked';
            else if (lockedIds.has(tech.id)) status = 'locked';
            else if (closedIds.has(tech.id)) status = 'closed';
            else if (slot) status = 'researching';
            else if (pendingIds.has(tech.id)) status = 'pending';
            else if ((tech.prerequisites ?? []).every(pid => unlockedIds.has(pid))) status = 'available';
            else status = 'unavailable';

            // Progress comes from the tick counters the worker actually
            // advances; dividing elapsed seconds by researchCost (authored in
            // hours) pinned every bar to 100% within a minute of starting.
            let progress = 0;
            if (slot && slot.ticksRequired) {
                progress = Math.min(100, Math.max(0, ((slot.ticksCompleted ?? 0) / slot.ticksRequired) * 100));
            }
            out.set(tech.id, { status, progress });
        }
        return out;
    }, [techs, activeSlots, unlockedIds, lockedIds, closedIds, pendingIds]);

    // A pending card settles the moment the worker's slot (or unlock) shows up
    // in the synced state.
    useEffect(() => {
        if (pendingIds.size === 0) return;
        const settled = [...pendingIds].filter(id => unlockedIds.has(id) || activeSlots.some(s => s.techId === id));
        if (settled.length === 0) return;
        setPendingIds(prev => {
            const next = new Set(prev);
            for (const id of settled) next.delete(id);
            return next;
        });
    }, [pendingIds, unlockedIds, activeSlots]);

    const selected = selectedId ? byId.get(selectedId) ?? null : null;
    const selectedState = selectedId ? nodeStates.get(selectedId) ?? null : null;

    // What the inspector says about forks for the selected tech: the price of
    // committing (an undecided option), what closed it (a closed tech), the
    // option that was chosen instead (a path not taken), or the path it needs.
    const forkInfo = useMemo(() => {
        if (!selected) return null;
        const group = selected.mutuallyExclusiveGroup;
        const fork = group ? forks.get(group) ?? null : null;
        return {
            fork,
            cost: fork && !decidedGroups.has(fork.group) ? forkCost(allTechs, selected.id, lockedIds) : null,
            chosenInstead: fork ? choices.get(fork.group) ?? null : null,
            closedByOption: closedIds.has(selected.id) && !lockedIds.has(selected.id)
                ? closedBy(allTechs, byId, selected.id, lockedIds)
                : null,
            needsOption: !closedIds.has(selected.id) ? requiredForkOption(byId, selected.id, decidedGroups) : null,
        };
    }, [selected, forks, decidedGroups, allTechs, lockedIds, choices, closedIds, byId]);

    // Selected tech plus every ancestor, walked across trees so a chain that
    // dips into another branch still lights its visible segment.
    const chainIds = useMemo<ReadonlySet<string>>(() => {
        const out = new Set<string>();
        if (!selectedId) return out;
        const stack = [selectedId];
        while (stack.length) {
            const id = stack.pop()!;
            if (out.has(id)) continue;
            out.add(id);
            for (const pid of byId.get(id)?.prerequisites ?? []) stack.push(pid);
        }
        return out;
    }, [selectedId, byId]);

    const unlocks = useMemo<Tech[]>(
        () => (selectedId ? allTechs.filter(t => (t.prerequisites ?? []).includes(selectedId)) : []),
        [selectedId, allTechs],
    );
    const unlockIds = useMemo(() => new Set(unlocks.map(t => t.id)), [unlocks]);

    const query = search.trim().toLowerCase();
    const matches = useCallback((tech: Tech) => query.length > 0 && tech.name.toLowerCase().includes(query), [query]);

    // Selection wins over search and the filter for its own chain: the reader
    // asked to trace one lineage, so nothing else may compete for attention.
    const emphasisFor = useCallback((tech: Tech, status: TechNodeStatus): TechNodeEmphasis => {
        if (selectedId) {
            return chainIds.has(tech.id) || unlockIds.has(tech.id) ? 'highlight' : 'dim';
        }
        if (query) return matches(tech) ? 'highlight' : 'dim';
        if (availableOnly) return status === 'available' || status === 'researching' ? 'normal' : 'dim';
        return 'normal';
    }, [selectedId, chainIds, unlockIds, query, matches, availableOnly]);

    // A slot the research council filled is the player's to take over (the
    // worker's TECH_START_RESEARCH does), so it does not count as busy.
    const councilSlot = activeSlots.find(s => s.techId && s.startedBy === 'council');
    const allBusy = activeSlots.length > 0 && activeSlots.every(s => s.techId);
    const slotsFull = allBusy && !councilSlot;
    const replacesCouncil = allBusy && councilSlot?.techId
        ? (byId.get(councilSlot.techId)?.name ?? councilSlot.techId)
        : null;

    // The first visit explains forks once; "opened" in the player's prefs
    // remembers it across devices, like the dock's first-open prompts.
    const uiPrefs = useUIStore(s => s.uiPrefs);
    const showForkExplainer = !!uiPrefs && !uiPrefs.opened.includes(FORK_EXPLAINER_ID);

    const scrollNodeIntoView = useCallback((techId: string) => {
        // Defer a frame so a branch switch has painted the node before we look for it.
        requestAnimationFrame(() => {
            const el = scrollRef.current?.querySelector<HTMLElement>(`[data-tech-id="${CSS.escape(techId)}"]`);
            el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        });
    }, []);

    const handleNodeSelect = useCallback((techId: string) => {
        setError(null);
        setSelectedId(cur => (cur === techId ? null : techId));
    }, []);

    // Inspector links may point across trees; follow the tech to its branch and
    // bring it on screen rather than silently selecting something invisible.
    const handleInspectorSelect = useCallback((techId: string) => {
        const tech = byId.get(techId);
        if (!tech) return;
        setError(null);
        // Same reset the branch tabs do: a stale query would dim the new tree.
        setActiveBranch(prev => {
            if (prev !== tech.tree) setSearch('');
            return tech.tree;
        });
        setSelectedId(techId);
        scrollNodeIntoView(techId);
    }, [byId, scrollNodeIntoView]);

    // Open each tree where the player can act, not at its empty top-left corner:
    // at a readable zoom the canvas shows two cards of forty.
    useEffect(() => {
        if (selectedId) return;
        const frontier = techs.find(t => nodeStates.get(t.id)?.status === 'researching')
            ?? techs.find(t => nodeStates.get(t.id)?.status === 'available');
        if (frontier) scrollNodeIntoView(frontier.id);
        // Only on opening a tree: following every status change would yank the view.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeBranch]);

    const handleBranchChange = (branch: TechTreeType) => {
        setActiveBranch(branch);
        setSelectedId(null);
        setSearch('');
        setError(null);
    };

    // startResearchAction only queues an order for the worker; the Next process
    // holds no tech state of its own, so re-reading it here handed back an
    // EMPTY player state and wiped every researched node until the next sync.
    // Mark the card pending and let the poll deliver the worker's answer.
    const handleResearch = async (techId: string) => {
        setBusy(true);
        setError(null);
        try {
            const res = await startResearchAction(playerFactionId, techId);
            if (res.success) {
                setPendingIds(prev => new Set(prev).add(techId));
                window.setTimeout(() => {
                    setPendingIds(prev => {
                        if (!prev.has(techId)) return prev;
                        const next = new Set(prev);
                        next.delete(techId);
                        return next;
                    });
                }, PENDING_TIMEOUT_MS);
            } else {
                setError(res.error ?? 'Research could not be authorized.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Research could not be authorized.');
        } finally {
            setBusy(false);
        }
    };

    const fitToWidth = () => {
        const viewport = scrollRef.current?.clientWidth;
        if (!viewport) return;
        setScale(Math.max(FIT_MIN_SCALE, Math.min(1, (viewport - GUTTER_W - 32) / canvas.w)));
    };

    // The filter is only useful if it also brings the first candidate on screen;
    // dimming alone still leaves a 4000px canvas to scroll.
    const toggleAvailableOnly = () => {
        setAvailableOnly(v => {
            if (!v) {
                const first = techs.find(t => nodeStates.get(t.id)?.status === 'available');
                if (first) scrollNodeIntoView(first.id);
            }
            return !v;
        });
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        const first = techs.find(matches);
        if (first) {
            e.preventDefault();
            setError(null);
            setSelectedId(first.id);
            scrollNodeIntoView(first.id);
        }
    };

    // Esc clears the selection. The listener only exists while something is
    // selected. Layering convention (Modal, CommandWorkspace, the planet views):
    // bail on defaultPrevented so a modal above us keeps its Esc, and
    // preventDefault so the dock's bubble-phase handler does not also close the
    // panel. Document capture runs after a window-capture modal regardless of
    // registration order. Inside the search box Esc clears the query instead.
    useEffect(() => {
        if (!selectedId) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
            e.preventDefault();
            setSelectedId(null);
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [selectedId]);

    const scaledW = canvas.w * scale;
    const scaledH = canvas.h * scale;

    return (
        <div className="h-full flex flex-col bg-slate-950/80 backdrop-blur-xl overflow-hidden border-l border-white/5">
            {/* Header */}
            <div className="px-6 pt-6 pb-2 border-b border-white/5 bg-gradient-to-r from-indigo-500/10 via-transparent to-transparent">
                <div className="flex items-center justify-between gap-4 font-display mb-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <Zap size={20} className="text-indigo-400" />
                            <h2 className="text-xl tracking-[0.2em] text-white uppercase">Neural Archive</h2>
                        </div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">Planetary Scientific Convergence Terminal</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="relative">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            <input
                                type="search"
                                value={search}
                                // Typing drops the selection so the query's highlight
                                // is visible again instead of being silently overridden.
                                onChange={e => { setSearch(e.target.value); setSelectedId(null); }}
                                onKeyDown={handleSearchKeyDown}
                                placeholder="Search technologies"
                                aria-label="Search technologies"
                                className="w-48 pl-7 pr-2 py-1.5 rounded bg-black/40 border border-white/10 text-[10px] font-sans text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-400/60"
                            />
                        </label>

                        <button
                            type="button"
                            aria-pressed={availableOnly}
                            onClick={toggleAvailableOnly}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[9px] uppercase tracking-widest transition-colors ${
                                availableOnly
                                    ? 'bg-indigo-500/20 border-indigo-400/60 text-indigo-200'
                                    : 'bg-black/40 border-white/10 text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <Filter size={11} /> Available only
                        </button>

                        <div className="flex items-center gap-3 bg-black/40 px-3 py-2 rounded-lg border border-white/10">
                            <div className="flex flex-col items-end">
                                <span className="text-[8px] text-slate-500 uppercase">Research Slots</span>
                                <span className="text-xs font-mono text-indigo-400">
                                    {activeSlots.filter(s => s.techId).length} / {activeSlots.length}
                                </span>
                            </div>
                            <div className="h-8 w-px bg-white/10" />
                            <button
                                type="button"
                                aria-label="Zoom out"
                                onClick={() => setScale(s => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))}
                                className="text-slate-500 hover:text-white transition-colors"
                            >
                                <Minus size={14} />
                            </button>
                            <span className="text-[10px] font-mono text-slate-400 w-8 text-center">{Math.round(scale * 100)}%</span>
                            <button
                                type="button"
                                aria-label="Zoom in"
                                onClick={() => setScale(s => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))}
                                className="text-slate-500 hover:text-white transition-colors"
                            >
                                <Plus size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={fitToWidth}
                                className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
                            >
                                <Maximize2 size={11} /> Fit
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex gap-1">
                    {BRANCHES.map(branch => {
                        const isActive = activeBranch === branch.id;
                        const Icon = branch.icon;
                        return (
                            <button
                                key={branch.id}
                                type="button"
                                onClick={() => handleBranchChange(branch.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg border-x border-t transition-all duration-200 ${
                                    isActive
                                        ? `${branch.bg} ${branch.border} ${branch.color} border-white/10`
                                        : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                <Icon size={14} />
                                <span className="text-[10px] uppercase tracking-widest font-bold">{branch.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {showForkExplainer && (
                <div id="fork-explainer" className="flex items-start gap-3 px-6 py-3 border-b border-amber-400/30 bg-amber-950/40">
                    <Signpost size={16} className="text-amber-300 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-amber-200">Forks of no return</p>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                            Every tree splits twice, at tier II and tier IV. Fork options carry an amber <span className="text-amber-300">Fork</span> badge
                            and hang from a dashed amber rail. The moment you <em>start</em> one, the other options close for the season,
                            and so does everything that needs them. Closed cards turn red and struck through.
                        </p>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                            Everything else is safe to try. Your research council never picks a fork for you, and a project
                            it started gives way to the one you choose.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => { void patchUiPrefs({ opened: [FORK_EXPLAINER_ID] }); }}
                        className="shrink-0 px-3 py-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-100 text-[10px] font-semibold transition-colors"
                    >
                        Got it
                    </button>
                </div>
            )}

            {/* This tree's forks of no return, decided or not. Click to find one on the map. */}
            {treeForks.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 px-6 py-1.5 border-b border-white/5 bg-amber-950/10" aria-label="Forks in this tree">
                    <span className="flex items-center gap-1 text-[8px] uppercase tracking-widest text-amber-300/80">
                        <Signpost size={10} /> Forks
                    </span>
                    {treeForks.map(fork => {
                        const chosen = choices.get(fork.group);
                        return (
                            <button
                                key={fork.group}
                                type="button"
                                onClick={() => {
                                    const target = chosen ?? fork.options[0];
                                    setSelectedId(target.id);
                                    scrollNodeIntoView(target.id);
                                }}
                                className={`px-2 py-0.5 rounded-full border text-[9px] transition-colors ${
                                    chosen
                                        ? 'border-white/10 text-slate-400 hover:text-slate-200'
                                        : 'border-amber-400/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                                }`}
                            >
                                {forkLabel(fork)}: {chosen ? <span className="text-indigo-300">{chosen.name}</span> : `undecided · ${fork.options.length} paths`}
                            </button>
                        );
                    })}
                    <span className="text-[8px] text-slate-500 ml-1">Starting research on a fork option closes the others for the season.</span>
                </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-4 px-6 py-1.5 border-b border-white/5 bg-black/20" aria-label="Legend">
                {STATUS_ORDER.map(status => (
                    <span key={status} className="flex items-center gap-1.5 text-[8px] uppercase tracking-widest text-slate-400">
                        <span className={`inline-block w-2.5 h-2.5 rounded-sm border ${STATUS_META[status].swatch}`} />
                        {STATUS_META[status].label}
                    </span>
                ))}
                {selectedId && (
                    <span className="ml-auto text-[8px] uppercase tracking-widest text-slate-600">Esc clears selection</span>
                )}
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 flex">
                <div
                    ref={scrollRef}
                    className="flex-1 min-w-0 overflow-auto custom-scrollbar relative bg-[url('/grid-dark.svg')] bg-repeat"
                >
                    {/* The gutter shares this scrolled row so it tracks the canvas vertically; sticky-left keeps it visible on horizontal scroll. */}
                    <div className="flex" style={{ width: GUTTER_W + scaledW, height: scaledH }}>
                        <div
                            className="sticky left-0 z-40 shrink-0 bg-slate-950/90 backdrop-blur-sm border-r border-white/10"
                            style={{ width: GUTTER_W, height: scaledH }}
                            aria-hidden="true"
                        >
                            {bands.map(band => {
                                // The label does not scale with the canvas; a one-row
                                // tier zoomed out cannot hold the full name.
                                const bandH = band.height * scale;
                                const full = bandH >= 150;
                                return (
                                    <div
                                        key={band.tier}
                                        className={`absolute inset-x-0 flex items-center justify-center overflow-hidden border-t ${TIER_STYLE[band.tier].band}`}
                                        style={{ top: band.top * scale, height: bandH }}
                                        title={`Tier ${TIER_NUMERALS[band.tier]} · ${TIER_NAMES[band.tier]}`}
                                    >
                                        <span
                                            className={`font-display uppercase tracking-[0.3em] text-[9px] whitespace-nowrap ${TIER_STYLE[band.tier].label}`}
                                            style={full ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)' } : undefined}
                                        >
                                            {full ? `${TIER_NUMERALS[band.tier]} · ${TIER_NAMES[band.tier]}` : TIER_NUMERALS[band.tier]}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="relative shrink-0" style={{ width: scaledW, height: scaledH }}>
                            <div
                                className="relative"
                                style={{ width: canvas.w, height: canvas.h, transform: `scale(${scale})`, transformOrigin: '0 0' }}
                            >
                                {bands.map(band => (
                                    <div
                                        key={band.tier}
                                        className={`absolute inset-x-0 z-0 pointer-events-none border-t ${TIER_STYLE[band.tier].band}`}
                                        style={{ top: band.top, height: band.height }}
                                    />
                                ))}

                                <div className="absolute inset-0 z-0">
                                    <TechConnectors
                                        techs={techs}
                                        offset={offset}
                                        unlockedTechIds={techState.unlockedTechIds}
                                        chainIds={chainIds}
                                        selectedId={selectedId}
                                    />
                                </div>

                                <ForkRails forks={treeForks} offset={offset} choices={choices} width={canvas.w} height={canvas.h} />

                                {techs.map(tech => {
                                    const state = nodeStates.get(tech.id) ?? { status: 'unavailable' as const, progress: 0 };
                                    return (
                                        <TechNode
                                            key={tech.id}
                                            tech={tech}
                                            rect={nodeRect(tech, offset)}
                                            status={state.status}
                                            progress={state.progress}
                                            selected={tech.id === selectedId}
                                            emphasis={emphasisFor(tech, state.status)}
                                            fork={tech.mutuallyExclusiveGroup ? { decided: decidedGroups.has(tech.mutuallyExclusiveGroup) } : undefined}
                                            onSelect={handleNodeSelect}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <TechInspector
                    key={selectedId ?? 'none'}
                    forkInfo={forkInfo}
                    tech={selected}
                    status={selectedState?.status ?? null}
                    progress={selectedState?.progress ?? 0}
                    byId={byId}
                    unlockedIds={unlockedIds}
                    unlocks={unlocks}
                    slotsFull={slotsFull}
                    replacesCouncil={replacesCouncil}
                    busy={busy}
                    error={error}
                    onSelect={handleInspectorSelect}
                    onResearch={handleResearch}
                />
            </div>

            <div className="p-4 bg-slate-900/60 border-t border-white/5 backdrop-blur-md">
                <div className="flex items-center gap-6 max-w-5xl mx-auto italic">
                    <div className="flex items-center gap-2">
                        <Activity size={14} className="text-indigo-500" />
                        <span className="text-[10px] font-display text-slate-400 uppercase tracking-widest">Archive Sync Status:</span>
                        <span className="text-[10px] font-mono text-green-400 uppercase">Synchronized</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
