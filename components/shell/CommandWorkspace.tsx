"use client";

// components/shell/CommandWorkspace.tsx
// The contextual workspace that expands UPWARD from the Command Dock.
// The galaxy stays visible above it — the player never leaves the map.

import React from 'react';
import { useUIStore, isShadowTabVisible, isCouncilTabVisible } from '@/lib/store/ui-store';
import { categoryForTab } from './dockConfig';
import type { NavTab } from '@/types/ui-state';
import { X, Maximize2 } from 'lucide-react';

interface CommandWorkspaceProps {
    /** The active panel content (dynamically imported by GameShell). */
    children: React.ReactNode;
}

/** Tabs that want more breathing room than the default workspace height. */
const TALL_TABS: NavTab[] = ['tech', 'designer', 'war', 'economy'];

export default function CommandWorkspace({ children }: CommandWorkspaceProps) {
    const activeTab = useUIStore(s => s.activeTab);
    const setActiveTab = useUIStore(s => s.setActiveTab);
    const toggleFloatTab = useUIStore(s => s.toggleFloatTab);
    const playerState = useUIStore(s => s.playerState);
    const councilState = useUIStore(s => s.councilState);

    const category = categoryForTab(activeTab);
    const showShadow = isShadowTabVisible(playerState);
    const showCouncil = isCouncilTabVisible(councilState);

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
        t.conditional === 'shadow' ? showShadow :
        t.conditional === 'council' ? showCouncil : true
    );
    const tall = TALL_TABS.includes(activeTab);

    return (
        <div
            className={[
                'absolute bottom-0 left-0 right-0 z-40 flex flex-col',
                tall ? 'h-[72%]' : 'h-[58%]',
                'bg-slate-950/95 backdrop-blur-xl border-t',
                'shadow-[0_-16px_48px_rgba(0,0,0,0.7)]',
            ].join(' ')}
            style={{
                animation: 'dockRiseUp 0.22s ease-out',
                borderTopColor: `${category.accent}55`,
            }}
        >
            {/* ── Workspace header: category identity + sub-tabs + controls ── */}
            <div className="flex items-center justify-between px-4 h-11 border-b border-slate-800/60 bg-slate-900/40 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <span style={{ color: category.accent }}>{category.icon}</span>
                    <span
                        className="text-[11px] font-display tracking-[0.25em] whitespace-nowrap"
                        style={{ color: category.accent }}
                    >
                        {category.label}
                    </span>
                    <div className="h-5 w-px bg-slate-800 mx-1" />

                    {/* Sub-tabs: flat segmented row — no nested menus, ever */}
                    <div className="flex items-center gap-1">
                        {tabs.map(t => {
                            const isActive = activeTab === t.tab;
                            return (
                                <button
                                    key={t.tab}
                                    onClick={() => setActiveTab(t.tab)}
                                    className={[
                                        'flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[10px] font-display tracking-[0.12em] transition-all duration-150',
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
                        className="p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                        title="Detach into a floating window"
                    >
                        <Maximize2 size={13} />
                    </button>
                    <button
                        onClick={() => setActiveTab('galaxy')}
                        className="p-2 text-slate-500 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
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
            `}</style>
        </div>
    );
}
