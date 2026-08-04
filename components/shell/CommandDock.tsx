"use client";

// components/shell/CommandDock.tsx
// Stars of Dominion — signature bottom Command Dock.
// One persistent bar: click a category and its workspace expands upward from
// the dock while the galaxy stays visible behind it. No nested menus.

import React from 'react';
import { useUIStore, isShadowTabVisible, isCouncilTabVisible } from '@/lib/store/ui-store';
import { DOCK_CATEGORIES, categoryForTab, type DockCategory } from './dockConfig';
import { Globe2, Orbit, BookOpen, AlertTriangle } from 'lucide-react';

export default function CommandDock() {
    const activeTab = useUIStore(s => s.activeTab);
    const setActiveTab = useUIStore(s => s.setActiveTab);
    const setShowManual = useUIStore(s => s.setShowManual);
    const playerState = useUIStore(s => s.playerState);
    const councilState = useUIStore(s => s.councilState);
    const crisisWindows = useUIStore(s => s.crisisWindows);
    const setFocusTarget = useUIStore(s => s.setFocusTarget);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const factions = useUIStore(s => s.factions);
    const systems = useUIStore(s => s.systems);

    const showShadow = isShadowTabVisible(playerState);
    const showCouncil = isCouncilTabVisible(councilState);
    const activeCategory = categoryForTab(activeTab);
    const activeCrises = crisisWindows.filter(w => w.phase !== 'warning');
    const systemViewId = useUIStore(s => s.systemViewId);

    const handleSystem = () => {
        const state = useUIStore.getState();
        if (state.systemViewId) {
            state.setSystemView(null);
            return;
        }
        // Priority: the system selected on the map, else the home system.
        const faction = playerFactionId ? factions[playerFactionId] : null;
        const target = state.selectedSystemId
            ?? (faction as any)?.capitalSystemId
            ?? systems[0]?.id
            ?? null;
        if (target) state.setSystemView(target);
    };

    // Remember the last tab used per category so re-opening a category
    // returns to where the player left off.
    const lastTabRef = React.useRef<Record<string, string>>({});
    React.useEffect(() => {
        if (activeCategory) lastTabRef.current[activeCategory.id] = activeTab;
    }, [activeTab, activeCategory]);

    const visibleTabs = (cat: DockCategory) =>
        cat.tabs.filter(t =>
            t.conditional === 'shadow' ? showShadow :
            t.conditional === 'council' ? showCouncil : true
        );

    const handleCategory = (cat: DockCategory) => {
        if (activeCategory?.id === cat.id) {
            // Clicking the active category collapses back to the pure map.
            setActiveTab('galaxy');
            return;
        }
        const tabs = visibleTabs(cat);
        const remembered = lastTabRef.current[cat.id];
        const target = tabs.find(t => t.tab === remembered) ?? tabs[0];
        if (!target) return;
        // A floated tab has no docked workspace — activating it would light
        // the dock with nothing on screen. Re-dock it first.
        const { floatedTabs, toggleFloatTab } = useUIStore.getState();
        if (floatedTabs[target.tab]) toggleFloatTab(target.tab);
        setActiveTab(target.tab);
    };

    const handleGalaxy = () => {
        if (activeTab !== 'galaxy') {
            setActiveTab('galaxy');
            return;
        }
        // Already looking at the galaxy: snap the camera home.
        const faction = playerFactionId ? factions[playerFactionId] : null;
        const capital = systems.find(s => s.id === (faction as any)?.capitalSystemId) || systems[0];
        if (capital) setFocusTarget({ x: capital.q, y: capital.r, zoom: 2 });
    };

    return (
        <div className="relative z-50 flex items-stretch justify-between h-16 bg-slate-950/95 backdrop-blur-xl border-t border-slate-700/60 select-none shadow-[0_-8px_32px_rgba(0,0,0,0.6)]">
            {/* Top edge glow */}
            <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent pointer-events-none" />

            {/* ── Galaxy home ─────────────────────────────────────────────── */}
            <button
                onClick={handleGalaxy}
                className={[
                    'relative flex items-center gap-2.5 px-6 border-r border-slate-800/60 transition-all duration-200 group',
                    activeTab === 'galaxy'
                        ? 'text-sky-300 bg-sky-500/10'
                        : 'text-slate-400 hover:text-sky-300 hover:bg-sky-500/5',
                ].join(' ')}
                title={activeTab === 'galaxy' ? 'Focus capital' : 'Return to galaxy (Esc)'}
            >
                <Globe2 size={20} className="group-hover:scale-110 transition-transform duration-200" />
                <div className="hidden lg:flex flex-col items-start leading-none">
                    <span className="text-[11px] font-display tracking-[0.2em]">GALAXY</span>
                    <span className="text-[7px] font-display tracking-[0.15em] text-slate-500 mt-1">
                        {activeTab === 'galaxy' ? 'FOCUS CAPITAL' : 'RETURN — ESC'}
                    </span>
                </div>
                {activeTab === 'galaxy' && (
                    <span className="absolute top-0 left-0 right-0 h-[2px] bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
                )}
                {activeCrises.length > 0 && (
                    <span className="absolute top-2 right-2 flex items-center gap-1 text-[8px] font-mono text-red-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
                        {activeCrises.length}
                    </span>
                )}
            </button>

            {/* ── System view ─────────────────────────────────────────────── */}
            <button
                onClick={handleSystem}
                className={[
                    'relative flex items-center gap-2.5 px-5 border-r border-slate-800/60 transition-all duration-200 group',
                    systemViewId
                        ? 'text-indigo-300 bg-indigo-500/10'
                        : 'text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/5',
                ].join(' ')}
                title={systemViewId ? 'Close the system view (Esc)' : 'Enter the selected (or home) star system'}
            >
                <Orbit size={20} className="group-hover:scale-110 transition-transform duration-200" />
                <span className="hidden lg:block text-[11px] font-display tracking-[0.2em]">SYSTEM</span>
                {systemViewId && (
                    <span className="absolute top-0 left-0 right-0 h-[2px] bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.8)]" />
                )}
            </button>

            {/* ── Category buttons ────────────────────────────────────────── */}
            <div className="flex flex-1 items-stretch justify-center">
                {DOCK_CATEGORIES.map(cat => {
                    const isActive = activeCategory?.id === cat.id;
                    const emergency = cat.id === 'empire' && councilState.emergencySession && councilState.status !== 'absent';
                    return (
                        <button
                            key={cat.id}
                            onClick={() => handleCategory(cat)}
                            className={[
                                'relative flex flex-col items-center justify-center gap-1 px-3 lg:px-5 min-w-[52px] lg:min-w-[92px] transition-all duration-200 group',
                                isActive ? 'text-white' : 'text-slate-400 hover:text-slate-100',
                            ].join(' ')}
                            style={isActive ? { backgroundColor: `${cat.accent}14` } : undefined}
                            title={cat.label}
                        >
                            <span
                                className="transition-transform duration-200 group-hover:-translate-y-0.5"
                                style={isActive ? { color: cat.accent, filter: `drop-shadow(0 0 6px ${cat.accent}90)` } : undefined}
                            >
                                {cat.icon}
                            </span>
                            <span
                                className="hidden lg:block text-[9px] font-display tracking-[0.18em]"
                                style={isActive ? { color: cat.accent } : undefined}
                            >
                                {cat.label}
                            </span>
                            {/* Active indicator: lit edge on TOP of the dock (panel grows upward) */}
                            {isActive && (
                                <span
                                    className="absolute top-0 left-2 right-2 h-[2px]"
                                    style={{ backgroundColor: cat.accent, boxShadow: `0 0 10px ${cat.accent}cc` }}
                                />
                            )}
                            {emergency && (
                                <AlertTriangle
                                    size={10}
                                    className="absolute top-1.5 right-2 text-red-400 animate-pulse"
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Guide ───────────────────────────────────────────────────── */}
            <button
                onClick={() => setShowManual(true)}
                className="flex items-center gap-2 px-6 border-l border-slate-800/60 text-slate-400 hover:text-amber-300 hover:bg-amber-500/5 transition-all duration-200 group"
                title="Open the guidebook"
            >
                <BookOpen size={18} className="group-hover:scale-110 transition-transform duration-200" />
                <span className="text-[10px] font-display tracking-[0.2em] hidden lg:inline">GUIDE</span>
            </button>
        </div>
    );
}
