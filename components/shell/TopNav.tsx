"use client";

import * as React from 'react';
import { useUIStore, isShadowTabVisible, isCouncilTabVisible } from '@/lib/store/ui-store';
import type { NavTab } from '@/types/ui-state';
import {
    Globe2,
    BarChart3,
    Landmark,
    Eye,
    Newspaper,
    Skull,
    Sword,
    Shield,
    AlertTriangle,
    Clock,
    FastForward,
    BookOpen,
    Microscope,
    MessageSquare,
    Building2,
    ChevronDown,
    Handshake,
    Maximize2,
    Scale,
    Users,
    Zap
} from 'lucide-react';
import { advanceTimeAction } from '@/app/actions/construction';
import { getGlobalStateAction } from '@/app/actions/construction-sim';
import { CivilizationIdentity } from '../civilization/CivilizationIdentity';

interface NavItem {
    tab: NavTab;
    label: string;
    icon: React.ReactNode;
}

const NAV_GROUPS: Record<string, NavItem[]> = {
    foundation: [
        { tab: 'galaxy', label: 'GALAXY', icon: <Globe2 size={15} /> },
    ],
    governance: [
        { tab: 'government' as NavTab, label: 'GOVERNMENT', icon: <Scale size={15} /> },
        { tab: 'leadership' as NavTab, label: 'LEADERSHIP', icon: <Users size={15} /> },
        { tab: 'tech' as NavTab, label: 'TECHNOLOGY', icon: <Zap size={15} /> },
    ],
    commerce: [
        { tab: 'economy', label: 'ECONOMY', icon: <BarChart3 size={15} /> },
        { tab: 'corporate', label: 'CORPORATE', icon: <Building2 size={15} /> },
    ],
    operations: [
        { tab: 'intelligence', label: 'INTELLIGENCE', icon: <Eye size={15} /> },
        { tab: 'war', label: 'WAR', icon: <Sword size={15} /> },
        { tab: 'designer', label: 'SHIP DESIGNER', icon: <Shield size={15} /> },
    ],
    personal: [
        { tab: 'diplomacy', label: 'DIPLOMACY', icon: <Handshake size={15} /> },
    ],
    communication: [
        { tab: 'discourse', label: 'DISCOURSE', icon: <MessageSquare size={15} /> },
    ]
};

const GROUP_LABELS: Record<string, string> = {
    foundation: 'Foundation',
    governance: 'Governance',
    commerce: 'Commerce',
    operations: 'Operations',
    personal: 'Diplomatic',
    communication: 'Channel'
};

const DROPDOWN_GROUPS = ['governance', 'commerce', 'operations'];

interface NavDropdownProps {
    groupId: string;
    items: NavItem[];
    activeTab: NavTab;
    setActiveTab: (tab: NavTab) => void;
    label: string;
    toggleFloatTab: (tab: NavTab) => void;
}

function NavDropdown({ groupId, items, activeTab, setActiveTab, label, toggleFloatTab }: NavDropdownProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const hasActiveChild = items.some(item => item.tab === activeTab);

    return (
        <div 
            className="relative flex flex-col items-center group/dropdown"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            <span className="text-[8px] font-display tracking-[0.2em] text-slate-400 uppercase mb-1 opacity-40 group-hover/dropdown:opacity-100 transition-opacity duration-300">
                {label}
            </span>
            
            <button className={[
                'flex items-center gap-2 px-4 py-1.5 text-[10px] font-display tracking-[0.15em] transition-all duration-300 rounded-sm bg-slate-900/40 border border-transparent group-hover/dropdown:border-slate-800/50',
                hasActiveChild ? 'text-[var(--color-active)] bg-[var(--color-active)]/5' : 'text-slate-400 group-hover/dropdown:text-slate-100'
            ].join(' ')}>
                <span className="uppercase">{groupId}</span>
                <ChevronDown size={12} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                
                {/* Active indicator bar */}
                {hasActiveChild && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--color-active)] rounded-t shadow-[0_0_8px_rgba(239,250,107,0.5)]" />
                )}
            </button>

            {/* Dropdown Menu */}
            <div className={[
                'absolute top-full left-1/2 -translate-x-1/2 mt-1 w-48 bg-slate-950/98 backdrop-blur-xl border border-slate-800/80 rounded shadow-2xl transition-all duration-200 origin-top',
                isOpen ? 'opacity-100 scale-100 translate-y-0 visible' : 'opacity-0 scale-95 -translate-y-2 invisible'
            ].join(' ')}>
                <div className="p-1 flex flex-col gap-0.5">
                    {items.map(({ tab, label: itemLabel, icon }) => {
                        const isActive = activeTab === tab;
                        return (
                            <div key={tab} className="relative group/btn-container">
                                <button

                                    onClick={() => {
                                        setActiveTab(tab);
                                        setIsOpen(false);
                                    }}
                                    className={[
                                        'flex w-full items-center gap-3 px-3 py-2 text-[10px] font-display tracking-[0.1em] transition-all duration-200 rounded-sm text-left',
                                        isActive 
                                            ? 'text-amber-400 bg-amber-400/10' 
                                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                                    ].join(' ')}
                                >
                                    <div className={isActive ? 'text-amber-400' : 'text-slate-500'}>
                                        {icon}
                                    </div>
                                    <span>{itemLabel}</span>
                                    {isActive && (
                                        <div className="ml-auto w-1 h-1 rounded-full bg-[var(--color-active)] shadow-[0_0_4px_rgba(239,250,107,0.8)]" />
                                    )}
                                </button>
                                
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 group-hover/btn-container:opacity-100 transition-opacity pointer-events-none">
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleFloatTab(tab);
                                            setIsOpen(false);
                                        }}
                                        className="p-1 hover:bg-white/10 rounded text-slate-500 hover:text-white transition-colors cursor-pointer pointer-events-auto"
                                        title="Detach Panel"
                                    >
                                        <Maximize2 size={12} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function TopNav() {
    const { activeTab, setActiveTab, playerState, councilState, crisisWindows, nowSeconds, setNowSeconds, toggleFloatTab } =
        useUIStore();

    const activeCrises = crisisWindows.filter((w) => w.phase !== 'warning');
    const showShadow = isShadowTabVisible(playerState);
    const showCouncil = isCouncilTabVisible(councilState);





    const handleAdvance = async (delta: number) => {
        await advanceTimeAction(delta);
        const state = await getGlobalStateAction();
        setNowSeconds(state.nowSeconds);
    };

    // Simple date formatter (assuming season 1 started at timestamp 0 for simplicity)
    const dayOfSeason = Math.floor(nowSeconds / 86400) + 1;
    const season = Math.floor(dayOfSeason / 90) + 1; // 90 days per season
    const relativeDay = (dayOfSeason - 1) % 90 + 1;


    return (
        <nav className="relative z-50 flex items-center justify-between px-6 py-2 border-b border-slate-700/60 bg-slate-950/95 backdrop-blur-md select-none">
            {/* Brand */}
            <div className="flex items-center gap-3 min-w-[200px]">
                <div className="w-7 h-7 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-slate-950 font-black text-sm font-display">
                    S
                </div>
                <span className="font-display text-sm tracking-widest text-[var(--color-primary)] hidden md:block mr-4">
                    STARS OF DOMINION
                </span>

                <CivilizationIdentity />
            </div>

            {/* Grouped Nav Tabs */}
            <div className="flex items-center gap-1">
                {Object.entries(NAV_GROUPS).map(([groupId, items], groupIdx) => {
                    // Combine base items with conditional ones
                    let groupItems = [...items];
                    if (groupId === 'governance' && showCouncil) {
                        groupItems.push({ tab: 'council' as NavTab, label: 'COUNCIL', icon: <Shield size={15} /> });
                    }
                    if (groupId === 'operations' && showShadow) {
                        groupItems.push({ tab: 'shadow' as NavTab, label: 'SHADOW', icon: <Skull size={15} /> });
                    }
                    
                    // Add Press to Operations group dropdown per new plan
                    if (groupId === 'operations') {
                        groupItems.push({ tab: 'press' as NavTab, label: 'PRESS', icon: <Newspaper size={15} /> });
                    }

                    const isDropdown = DROPDOWN_GROUPS.includes(groupId);

                    return (
                        <React.Fragment key={groupId}>
                            {isDropdown ? (
                                <NavDropdown 
                                    groupId={groupId}
                                    items={groupItems}
                                    activeTab={activeTab}
                                    setActiveTab={setActiveTab}
                                    label={GROUP_LABELS[groupId]}
                                    toggleFloatTab={toggleFloatTab}
                                />
                            ) : (
                                /* Direct Links Group */
                                <div className="flex flex-col items-center group/container">
                                    <span className="text-[8px] font-display tracking-[0.2em] text-slate-400 uppercase mb-1 opacity-40 group-hover/container:opacity-100 transition-opacity duration-300">
                                        {GROUP_LABELS[groupId]}
                                    </span>
                                    <div className="flex items-center gap-0.5 bg-slate-900/20 px-1 py-0.5 rounded-sm border border-transparent group-hover/container:border-slate-800/50 transition-colors duration-300">
                                        {groupItems.map(({ tab, label, icon }) => {
                                            const isActive = activeTab === tab;
                                            const isGalaxy = tab === 'galaxy';
                                            const hasCrisisAlert = isGalaxy && activeCrises.length > 0;

                                            return (
                                                <div key={tab} className="relative group/btn-container">
                                                    <button
                                                        onClick={() => setActiveTab(tab)}
                                                        className={[
                                                            'relative flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-display tracking-[0.15em] transition-all duration-300 rounded-sm group/btn',
                                                            isActive
                                                                ? 'text-amber-400 bg-amber-400/10'
                                                                : tab === 'shadow'
                                                                    ? 'text-slate-400 hover:text-purple-400 hover:bg-purple-400/10'
                                                                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/40',
                                                        ].join(' ')}
                                                    >
                                                        <div className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover/btn:scale-110'}`}>
                                                            {icon}
                                                        </div>
                                                        <span className="hidden xl:inline">{label}</span>

                                                        {/* Active indicator bar */}
                                                        {isActive && (
                                                            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--color-active)] rounded-t shadow-[0_0_8px_rgba(239,250,107,0.5)]" />
                                                        )}

                                                        {/* Crisis pulse dot for galaxy tab */}
                                                        {hasCrisisAlert && !isActive && (
                                                            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_4px_rgba(239,68,68,0.8)]" />
                                                        )}
                                                    </button>

                                                    {/* Pop-out button on hover - Disabled for Galaxy */}
                                                    {tab !== 'galaxy' && (
                                                        <div
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleFloatTab(tab);
                                                            }}
                                                            className="absolute -top-1 -right-1 p-0.5 bg-slate-900 border border-slate-700 rounded opacity-0 group-hover/btn-container:opacity-100 transition-opacity text-slate-500 hover:text-white z-10 cursor-pointer shadow-lg"
                                                            title="Detach Panel"
                                                        >
                                                            <Maximize2 size={10} />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Divider between groups, but not after the last group */}
                            {groupIdx < Object.keys(NAV_GROUPS).length - 1 && (
                                <div className="mx-3 mt-3 h-6 w-px bg-gradient-to-b from-transparent via-slate-600/50 to-transparent" />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Status indicators */}
            <div className="flex items-center gap-3 min-w-[200px] justify-end">
                {councilState.emergencySession && councilState.status !== 'absent' && (
                    <div className="flex items-center gap-1 text-xs text-red-400 animate-pulse font-display">
                        <AlertTriangle size={12} />
                        <span className="hidden lg:inline">EMERGENCY SESSION</span>
                    </div>
                )}
                
                <div className="flex items-center gap-4 bg-slate-900/40 px-3 py-1.5 rounded-full border border-slate-700/50">
                    <div className="flex items-center gap-2 text-[var(--color-active)] font-mono text-[10px] tracking-tighter">
                        <Clock size={12} />
                        <span>S{season} · D{relativeDay}</span>
                    </div>
                    <div className="flex items-center gap-1 border-l border-slate-700 pl-2">
                        <button 
                            onClick={() => handleAdvance(86400)}
                            className="p-1 hover:text-[var(--color-active)] text-slate-500 transition-colors"
                            title="Advance 1 Day"
                        >
                            <FastForward size={14} />
                        </button>
                        <button 
                            onClick={() => handleAdvance(86400 * 7)}
                            className="p-1 hover:text-[var(--color-active)] text-slate-500 transition-colors flex items-center gap-0.5"
                            title="Advance 1 Week"
                        >
                            <FastForward size={14} />
                            <span className="text-[8px] font-bold">W</span>
                        </button>
                    </div>
                </div>

                <div className="text-xs font-mono text-slate-500">
                    {crisisWindows.length > 0 ? `${crisisWindows.length} ACTIVE` : 'STABLE'}
                </div>
            </div>
        </nav>
    );
}
