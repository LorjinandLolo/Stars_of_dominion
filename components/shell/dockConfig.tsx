// components/shell/dockConfig.tsx
// Stars of Dominion — Command Dock category map.
// Single source of truth for bottom-dock navigation: the dock renders the
// categories, the workspace header renders the sub-tabs of the active one.

import React from 'react';
import type { NavTab } from '@/types/ui-state';
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
} from 'lucide-react';

export interface DockTab {
    tab: NavTab;
    label: string;
    icon: React.ReactNode;
    /** Render only when the corresponding store predicate says so. */
    conditional?: 'shadow' | 'council';
}

export interface DockCategory {
    id: string;
    label: string;
    icon: React.ReactNode;
    accent: string; // css color for active glow
    tabs: DockTab[];
}

export const DOCK_CATEGORIES: DockCategory[] = [
    {
        id: 'empire',
        label: 'EMPIRE',
        icon: <Landmark size={18} />,
        accent: '#facc15',
        tabs: [
            { tab: 'government', label: 'GOVERNMENT', icon: <Scale size={13} /> },
            { tab: 'leadership', label: 'LEADERSHIP', icon: <Users size={13} /> },
            { tab: 'council', label: 'COUNCIL', icon: <Shield size={13} />, conditional: 'council' },
        ],
    },
    {
        id: 'economy',
        label: 'ECONOMY',
        icon: <BarChart3 size={18} />,
        accent: '#34d399',
        tabs: [
            { tab: 'economy', label: 'ECONOMY', icon: <BarChart3 size={13} /> },
            { tab: 'corporate', label: 'CORPORATE', icon: <Building2 size={13} /> },
        ],
    },
    {
        id: 'research',
        label: 'RESEARCH',
        icon: <Atom size={18} />,
        accent: '#60a5fa',
        tabs: [
            { tab: 'tech', label: 'TECHNOLOGY', icon: <Zap size={13} /> },
        ],
    },
    {
        id: 'military',
        label: 'MILITARY',
        icon: <Sword size={18} />,
        accent: '#f87171',
        tabs: [
            { tab: 'war', label: 'WAR ROOM', icon: <Sword size={13} /> },
            { tab: 'designer', label: 'SHIP DESIGNER', icon: <Shield size={13} /> },
        ],
    },
    {
        id: 'intelligence',
        label: 'INTELLIGENCE',
        icon: <Eye size={18} />,
        accent: '#c084fc',
        tabs: [
            { tab: 'intelligence', label: 'OPERATIONS', icon: <Eye size={13} /> },
            { tab: 'shadow', label: 'SHADOW', icon: <Skull size={13} />, conditional: 'shadow' },
        ],
    },
    {
        id: 'diplomacy',
        label: 'DIPLOMACY',
        icon: <Handshake size={18} />,
        accent: '#2dd4bf',
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
        tabs: [
            { tab: 'press', label: 'PRESS', icon: <Newspaper size={13} /> },
            { tab: 'discourse', label: 'DISCOURSE', icon: <MessageSquare size={13} /> },
        ],
    },
];

/** The category a NavTab belongs to, or null for 'galaxy' / unmapped tabs. */
export function categoryForTab(tab: NavTab): DockCategory | null {
    return DOCK_CATEGORIES.find(c => c.tabs.some(t => t.tab === tab)) ?? null;
}
