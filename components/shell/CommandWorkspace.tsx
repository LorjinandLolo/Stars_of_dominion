"use client";

// components/shell/CommandWorkspace.tsx
// The contextual workspace that expands UPWARD from the Command Dock.
// The galaxy stays visible above it — the player never leaves the map.

import React from 'react';
import { useUIStore, isShadowTabVisible, isCouncilTabVisible } from '@/lib/store/ui-store';
import { categoryForTab, isTabShown } from './dockConfig';
import { useDockContext } from '@/lib/player/use-ui-prefs';
import { X, Maximize2 } from 'lucide-react';

interface CommandWorkspaceProps {
    /** The active panel content (dynamically imported by GameShell). */
    children: React.ReactNode;
}

export default function CommandWorkspace({ children }: CommandWorkspaceProps) {
    const activeTab = useUIStore(s => s.activeTab);
    const setActiveTab = useUIStore(s => s.setActiveTab);
    const toggleFloatTab = useUIStore(s => s.toggleFloatTab);
    const playerState = useUIStore(s => s.playerState);
    const councilState = useUIStore(s => s.councilState);

    const category = categoryForTab(activeTab);
    const piracyState = useUIStore(s => s.piracyState);
    const showShadow = isShadowTabVisible(playerState, piracyState);
    const showCouncil = isCouncilTabVisible(councilState);
    // Sub-tabs follow the same progressive rule as the dock (Item 5).
    const dockCtx = useDockContext();

    // Esc returns command to the galaxy. `defaultPrevented` is the layering
    // convention: a modal (capture phase) or another layer that already
    // consumed this keystroke marks it, and we consume it ourselves so the
    // planet board underneath doesn't also close on the same press.
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            e.preventDefault();
            setActiveTab('galaxy');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [setActiveTab]);

    if (!category) return null;

    const tabs = category.tabs.filter(t =>
        (t.conditional === 'shadow' ? showShadow :
        t.conditional === 'council' ? showCouncil : true)
        && isTabShown(t, dockCtx, activeTab)
    );
    // Full height of the play area (the resource bar above stays visible).
    // The old 58%/72% drawer left the galaxy peeking out behind every panel,
    // which playtesters read as "the menu only takes up half the screen".
    return (
        <div
            className={[
                'absolute inset-0 z-40 flex flex-col',
                'bg-slate-950/95 backdrop-blur-xl border-t',
                'shadow-[0_-16px_48px_rgba(0,0,0,0.7)]',
            ].join(' ')}
            style={{
                animation: 'dockRiseUp 0.22s ease-out',
                borderTopColor: `${category.accent}55`,
            }}
        >
            {/* ── Workspace header: category identity + sub-tabs + controls ── */}
            {/* On a phone: the sub-tabs scroll sideways, the category name and
                the detach button (there is nowhere to float a window) go. */}
            <div className="flex items-center justify-between gap-2 px-2 md:px-4 h-12 md:h-11 border-b border-slate-800/60 bg-slate-900/40 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="shrink-0 pl-1 md:pl-0" style={{ color: category.accent }}>{category.icon}</span>
                    <span
                        className="hidden md:inline text-[11px] font-display tracking-[0.25em] whitespace-nowrap"
                        style={{ color: category.accent }}
                    >
                        {category.label}
                    </span>
                    <div className="hidden md:block h-5 w-px bg-slate-800 mx-1" />

                    {/* Sub-tabs: flat segmented row — no nested menus, ever */}
                    <div className="workspace-tabs flex items-center gap-1 min-w-0 overflow-x-auto md:overflow-visible">
                        {tabs.map(t => {
                            const isActive = activeTab === t.tab;
                            return (
                                <button
                                    key={t.tab}
                                    onClick={() => setActiveTab(t.tab)}
                                    className={[
                                        'flex items-center gap-1.5 px-3 min-h-[40px] md:min-h-0 md:py-1.5 shrink-0 whitespace-nowrap rounded-sm text-[10px] font-display tracking-[0.12em] transition-all duration-150',
                                        isActive
                                            ? 'text-slate-950'
                                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60',
                                    ].join(' ')}
                                    style={isActive ? { backgroundColor: category.accent } : undefined}
                                >
                                    {t.icon}
                                    <span>{t.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={() => toggleFloatTab(activeTab)}
                        className="hidden md:block p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                        title="Detach into a floating window"
                    >
                        <Maximize2 size={13} />
                    </button>
                    <button
                        onClick={() => setActiveTab('galaxy')}
                        className="min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 md:p-2 flex items-center justify-center text-slate-500 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                        title="Close (Esc)"
                    >
                        <X size={15} />
                    </button>
                </div>
            </div>

            {/* ── Panel content ──────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {children}
            </div>

            <style jsx global>{`
                @keyframes dockRiseUp {
                    from { transform: translateY(24px); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
                .workspace-tabs { scrollbar-width: none; }
                .workspace-tabs::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
}
