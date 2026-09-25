// components/shell/dockConfig.tsx
// Stars of Dominion — Command Dock category map.
// Single source of truth for bottom-dock navigation: the dock renders the
// categories, the workspace header renders the sub-tabs of the active one.

import React from 'react';
import type { NavTab } from '@/types/ui-state';
import {
    DOCK_UNLOCKS,
    isDockItemUnlocked,
    type DockUnlock,
    type DockVisibilityContext,
} from '@/lib/goals/dock-unlocks';
import {
    Landmark,
    BarChart3,
    Atom,
    Sword,
    Eye,
    Handshake,
    Newspaper,
    Scale,
    Users,
    Building2,
    Shield,
    Skull,
    FileText,
    MessageSquare,
    Zap,
    Flame,
    BookOpen,
} from 'lucide-react';

/**
 * 'core' is what a new player sees; 'advanced' unlocks with a first-week goal
 * (lib/goals/dock-unlocks.ts says which) or the player's "Show everything".
 */
export type DockTier = 'core' | 'advanced';

export interface DockTab {
    tab: NavTab;
    label: string;
    icon: React.ReactNode;
    /** Render only when the corresponding store predicate says so. */
    conditional?: 'shadow' | 'council';
    /** Defaults to 'core'. An advanced tab inside a core category unlocks on its own. */
    tier?: DockTier;
}

export interface DockCategory {
    id: string;
    label: string;
    icon: React.ReactNode;
    accent: string; // css color for active glow
    tier: DockTier;
    tabs: DockTab[];
}

export const DOCK_CATEGORIES: DockCategory[] = [
    {
        id: 'empire',
        label: 'EMPIRE',
        icon: <Landmark size={18} />,
        accent: '#facc15',
        tier: 'advanced',
        tabs: [
            { tab: 'government', label: 'GOVERNMENT', icon: <Scale size={13} /> },
            { tab: 'leadership', label: 'LEADERSHIP', icon: <Users size={13} /> },
            { tab: 'saga', label: 'SAGA', icon: <Flame size={13} /> },
            { tab: 'council', label: 'COUNCIL', icon: <Shield size={13} />, conditional: 'council' },
        ],
    },
    {
        id: 'economy',
        label: 'ECONOMY',
        icon: <BarChart3 size={18} />,
        accent: '#34d399',
        tier: 'core',
        tabs: [
            { tab: 'economy', label: 'ECONOMY', icon: <BarChart3 size={13} /> },
            { tab: 'corporate', label: 'CORPORATE', icon: <Building2 size={13} />, tier: 'advanced' },
        ],
    },
    {
        id: 'research',
        label: 'RESEARCH',
        icon: <Atom size={18} />,
        accent: '#60a5fa',
        tier: 'advanced',
        tabs: [
            { tab: 'tech', label: 'TECHNOLOGY', icon: <Zap size={13} /> },
        ],
    },
    {
        id: 'military',
        label: 'MILITARY',
        icon: <Sword size={18} />,
        accent: '#f87171',
        tier: 'core',
        tabs: [
            { tab: 'war', label: 'WAR ROOM', icon: <Sword size={13} /> },
            { tab: 'designer', label: 'SHIP DESIGNER', icon: <Shield size={13} />, tier: 'advanced' },
        ],
    },
    {
        id: 'intelligence',
        label: 'INTELLIGENCE',
        icon: <Eye size={18} />,
        accent: '#c084fc',
        tier: 'advanced',
        tabs: [
            { tab: 'intelligence', label: 'OPERATIONS', icon: <Eye size={13} /> },
            { tab: 'agency', label: 'AGENCY', icon: <Eye size={13} /> },
            { tab: 'shadow', label: 'SHADOW', icon: <Skull size={13} />, conditional: 'shadow' },
        ],
    },
    {
        id: 'diplomacy',
        label: 'DIPLOMACY',
        icon: <Handshake size={18} />,
        accent: '#2dd4bf',
        tier: 'core',
        tabs: [
            { tab: 'diplomacy', label: 'RELATIONS', icon: <Handshake size={13} /> },
            { tab: 'dossier', label: 'DOSSIERS', icon: <FileText size={13} /> },
        ],
    },
    {
        id: 'press',
        label: 'COMMS',
        icon: <Newspaper size={18} />,
        accent: '#22d3ee',
        tier: 'advanced',
        tabs: [
            { tab: 'press', label: 'PRESS', icon: <Newspaper size={13} /> },
            { tab: 'discourse', label: 'DISCOURSE', icon: <MessageSquare size={13} /> },
            { tab: 'history', label: 'ARCHIVE', icon: <BookOpen size={13} /> },
        ],
    },
];

/**
 * Is this category on the dock for this player? Core always; advanced once its
 * first-week goal is met or "Show everything" is on. The category holding the
 * active tab is always shown — a notification or a goal link can open a
 * hidden panel, and the dock must not pretend nothing is open.
 */
export function isCategoryShown(cat: DockCategory, ctx: DockVisibilityContext, activeTab?: NavTab): boolean {
    if (cat.tier === 'core') return true;
    if (activeTab && cat.tabs.some(t => t.tab === activeTab)) return true;
    return isDockItemUnlocked(cat.id, ctx);
}

/** Same rule for a sub-tab inside a category. */
export function isTabShown(tab: DockTab, ctx: DockVisibilityContext, activeTab?: NavTab): boolean {
    if ((tab.tier ?? 'core') === 'core') return true;
    if (activeTab === tab.tab) return true;
    return isDockItemUnlocked(tab.tab, ctx);
}

/** Every advanced item still locked for this player, for the dock's "more" hint. */
export function lockedDockItems(ctx: DockVisibilityContext): DockUnlock[] {
    return DOCK_UNLOCKS.filter(u => !isDockItemUnlocked(u.id, ctx));
}

/** The category a NavTab belongs to, or null for 'galaxy' / unmapped tabs. */
export function categoryForTab(tab: NavTab): DockCategory | null {
    return DOCK_CATEGORIES.find(c => c.tabs.some(t => t.tab === tab)) ?? null;
}
