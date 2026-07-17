"use client";

import React, { useEffect, useRef } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { useGameSync } from '@/hooks/useGameSync';
import DraggablePanel from '@/components/ui/DraggablePanel';
import type { NavTab } from '@/types/ui-state';
import { getFleetsAction } from '@/app/actions/movement';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth-service';
import TopNav from '@/components/shell/TopNav';
import GalaxyShell from '@/components/galaxy/GalaxyShell';
import Modal from '@/components/ui/Modal';
import dynamic from 'next/dynamic';

const LeadershipPanel = dynamic(() => import('@/components/panels/LeadershipPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-amber-500/80 animate-pulse border border-amber-900/20 bg-slate-950 rounded shadow-2xl">LOADING LEADERSHIP CORE...</div>
});
const EconomyPanel = dynamic(() => import('@/components/panels/EconomyPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-green-500/80 animate-pulse border border-green-900/20 bg-slate-950 rounded shadow-2xl">LOADING ECONOMIC NETWORK...</div>
});
const GovernmentPanel = dynamic(() => import('@/components/panels/GovernmentPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-blue-500/80 animate-pulse border border-blue-900/20 bg-slate-950 rounded shadow-2xl">LOADING ADMINISTRATIVE DATABASE...</div>
});
const IntelligencePanel = dynamic(() => import('@/components/panels/IntelligencePanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-purple-500/80 animate-pulse border border-purple-900/20 bg-slate-950 rounded shadow-2xl">DECRYPTING INTELLIGENCE COMMUNIQUE...</div>
});
const PressPanel = dynamic(() => import('@/components/panels/PressPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-cyan-500/80 animate-pulse border border-cyan-900/20 bg-slate-950 rounded shadow-2xl">CONNECTING TO PRESS FEED...</div>
});
const EspionageAgencyPanel = dynamic(() => import('@/components/intrigue/EspionageAgencyPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-red-500/80 animate-pulse border border-red-900/20 bg-slate-950 rounded shadow-2xl">SYNCHRONIZING SECURE AGENCY DATA...</div>
});
const CouncilPanel = dynamic(() => import('@/components/panels/CouncilPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-yellow-500/80 animate-pulse border border-yellow-900/20 bg-slate-950 rounded shadow-2xl">ESTABLISHING CONCILIAR LINK...</div>
});
const DossierPanel = dynamic(() => import('@/components/panels/DossierPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-slate-400 animate-pulse border border-slate-800/20 bg-slate-950 rounded shadow-2xl">COMPILING FACTION DOSSIERS...</div>
});
const ResearchPanel = dynamic(() => import('@/components/panels/ResearchPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-blue-400/80 animate-pulse border border-blue-900/20 bg-slate-950 rounded shadow-2xl">SYNCHRONIZING RESEARCH CORES...</div>
});
const DiscoursePanel = dynamic(() => import('@/components/panels/DiscoursePanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-indigo-400/80 animate-pulse border border-indigo-900/20 bg-slate-950 rounded shadow-2xl">CONNECTING TO CHANNELS CONSOLE...</div>
});
const CorporateLedgerPanel = dynamic(() => import('@/components/panels/CorporateLedgerPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-emerald-400/80 animate-pulse border border-emerald-900/20 bg-slate-950 rounded shadow-2xl">RETRIEVING LEDGER ARCHIVES...</div>
});
const BattleCommandPanel = dynamic(() => import('@/components/panels/BattleCommandPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-rose-500/80 animate-pulse border border-rose-900/20 bg-slate-950 rounded shadow-2xl">INITIALIZING STRATEGIC WARMAP...</div>
});
const DiplomacyPanel = dynamic(() => import('@/components/panels/DiplomacyPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-teal-400/80 animate-pulse border border-teal-900/20 bg-slate-950 rounded shadow-2xl">CONNECTING TO DIPLOMATIC UPLINK...</div>
});
const ShipDesignerPanel = dynamic(() => import('@/components/panels/ShipDesignerPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-sky-400/80 animate-pulse border border-sky-900/20 bg-slate-950 rounded shadow-2xl">LOADING SHIPWRIGHT SCHEMATICS...</div>
});

const SeasonEndScreen = dynamic(() => import('@/components/season/SeasonEndScreen'), { ssr: false });
const EconomicTerminal = dynamic(() => import('@/components/economy/EconomicTerminal'), {
    ssr: false,
    loading: () => <div className="p-12 text-center text-xs font-mono text-cyan-400/80 animate-pulse">CONNECTING TO FINANCIAL SECTOR DATABASE...</div>
});
const ManualGuidebook = dynamic(() => import('@/components/manual/ManualGuidebook'), { ssr: false });
const DevToolbox = dynamic(() => import('@/components/debug/DevToolbox'), { ssr: false });

const PANEL_MAP = {
    galaxy: null,         // No overlay — pure map view
    economy: <EconomyPanel />,
    government: <GovernmentPanel />,
    leadership: <LeadershipPanel />,
    intelligence: <IntelligencePanel />,
    press: <PressPanel />,
    shadow: <EspionageAgencyPanel />,
    council: <CouncilPanel />,
    dossier: <DossierPanel />,
    tech: <ResearchPanel />,
    discourse: <DiscoursePanel />,
    corporate: <CorporateLedgerPanel />,
    war: <BattleCommandPanel />,
    diplomacy: <DiplomacyPanel />,
    designer: <ShipDesignerPanel />,
} as const;

import ResourceBar from '@/components/shell/ResourceBar';

export default function GameShell() {
    // Narrow selectors instead of subscribing to the whole store — otherwise this heavy
    // shell (and its entire panel tree) re-rendered on every field change, including the
    // rapid useGameSync updates.
    const activeTab = useUIStore(s => s.activeTab);
    const showSeasonEnd = useUIStore(s => s.showSeasonEnd);
    const seasonState = useUIStore(s => s.seasonState);
    const setFleets = useUIStore(s => s.setFleets);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const setPlayerFactionId = useUIStore(s => s.setPlayerFactionId);
    const floatedTabs = useUIStore(s => s.floatedTabs);
    const closeFloatedTab = useUIStore(s => s.closeFloatedTab);
    const updateFloatedTabPos = useUIStore(s => s.updateFloatedTabPos);
    const systems = useUIStore(s => s.systems);
    const factions = useUIStore(s => s.factions);
    const setFocusTarget = useUIStore(s => s.setFocusTarget);
    const router = useRouter();

    // Sync global state via API polling
    useGameSync();

    // On mount: check auth and localStorage for saved faction
    useEffect(() => {
        const checkAuthAndFaction = async () => {


            const user = await authService.getCurrentUser();
            if (!user) {
                router.replace('/login');
                return;
            }

            const saved = localStorage.getItem('selectedFactionId');
            if (saved) {
                setPlayerFactionId(saved);
            } else {
                router.replace('/lobby');
            }
        };

        checkAuthAndFaction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-focus the capital ONCE on first load. useGameSync rebuilds `systems`/`factions`
    // as new references every sync, so depending on them here snapped the camera back to
    // the home system on every tick. A ref guard fires the focus a single time.
    const hasAutoFocusedRef = useRef(false);
    useEffect(() => {
        if (hasAutoFocusedRef.current) return;
        if (playerFactionId && systems.length > 0) {
            const faction = factions[playerFactionId];
            if (faction) {
                const capital = systems.find(s => s.id === faction.capitalSystemId) || systems[0];
                if (capital) {
                    setFocusTarget({ x: capital.q, y: capital.r, zoom: 1.5 });
                    hasAutoFocusedRef.current = true;
                }
            }
        }
    }, [playerFactionId, systems, factions, setFocusTarget]);

    const isFloated = activeTab in floatedTabs;
    const activePanel = isFloated ? null : PANEL_MAP[activeTab as keyof typeof PANEL_MAP];

    return (
        <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-950 text-slate-200">
            {/* ── Top Navigation ─────────────────────────────────────────────────── */}
            <TopNav />
            
            {/* ── Resource Bar ───────────────────────────────────────────────────── */}
            <ResourceBar />

            {/* ── Main area ──────────────────────────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Galaxy is ALWAYS rendered underneath — even when panel is active */}
                <div className="absolute inset-0">
                    <GalaxyShell />
                </div>

                {/* Side panel slides in when tab ≠ galaxy */}
                {activePanel && (
                    <div
                        className={`relative z-40 ml-auto h-full ${activeTab === 'dossier' || activeTab === 'diplomacy' ? 'w-[520px]' : (activeTab === 'tech' || activeTab === 'designer') ? 'w-[800px]' : 'w-[420px]'} bg-slate-950/96 backdrop-blur-sm border-l border-slate-700/50 overflow-hidden flex-shrink-0`}
                        style={{ animation: 'slideInRight 0.2s ease-out' }}
                    >
                        {activePanel}
                    </div>
                )}

                {/* ── Floated Panels ──────────────────────────────────────────────── */}
                {Object.entries(floatedTabs).map(([tab, pos]) => {
                    if (!pos) return null;
                    const PanelContent = PANEL_MAP[tab as keyof typeof PANEL_MAP];
                    if (!PanelContent) return null;

                    return (
                        <DraggablePanel
                            key={tab}
                            title={tab.replace(/_/g, ' ')}
                            initialPos={pos}
                            onClose={() => closeFloatedTab(tab as NavTab)}
                            onUpdatePos={(newPos: { x: number; y: number; w: number; h: number }) => updateFloatedTabPos(tab as NavTab, newPos)}
                        >
                            {PanelContent}
                        </DraggablePanel>
                    );
                })}
            </div>

            {/* ── Season-end screen (full overlay) ──────────────────────────────── */}
            {(showSeasonEnd || seasonState.phase === 'locked') && <SeasonEndScreen />}

            {/* ── Economic Terminal Modal ────────────────────────────────────────── */}
            <EconomicTerminalModal />

            {/* ── Manual Guidebook (HOI4-style) ────────────────────────────────── */}
            <ManualGuidebook />

            {/* ── Developer Toolbox (Ctrl+D) ───────────────────────────────────── */}
            <DevToolbox />

            {/* Slide animation keyframe */}
            <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(30px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
        </div>
    );
}

function EconomicTerminalModal() {
    const { showEconomicTerminal, setShowEconomicTerminal } = useUIStore();
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const [econData, setEconData] = React.useState<any>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        if (showEconomicTerminal) {
            console.log("[ECONOMY] Modal Open - Fetching data...");
            setLoading(true);
            setError(null);
            // Pass the player's own faction so the terminal shows their economy, not a
            // hardcoded one.
            const qs = playerFactionId ? `?factionId=${encodeURIComponent(playerFactionId)}` : '';
            fetch(`/api/game/economy${qs}`)
                .then(res => res.json())
                .then(data => {
                    console.log("[ECONOMY] Data received:", data);
                    setEconData(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error("[ECONOMY] Fetch failed:", err);
                    setError("Communication blackout detected. Uplink failed.");
                    setLoading(false);
                });
        }
    }, [showEconomicTerminal, playerFactionId]);

    if (!showEconomicTerminal) return null;

    return (
        <Modal 
            isOpen={showEconomicTerminal} 
            onClose={() => {
                setShowEconomicTerminal(false);
                setEconData(null);
                setError(null);
            }} 
            title="Advanced Economic Interface"
            wide
        >
            {error ? (
                <div className="h-[600px] w-[1000px] flex items-center justify-center bg-[#1a0505] border border-red-900/50 rounded-lg">
                    <div className="text-center space-y-4">
                        <div className="text-red-500 font-display text-4xl mb-2">⚠ ERROR</div>
                        <p className="text-red-400 font-mono text-sm tracking-widest">{error.toUpperCase()}</p>
                        <button 
                            onClick={() => setShowEconomicTerminal(false)}
                            className="px-6 py-2 bg-red-900/40 hover:bg-red-800/40 text-red-200 border border-red-700/50 rounded-lg text-xs font-display tracking-widest transition-all"
                        >
                            ABORT UPLINK
                        </button>
                    </div>
                </div>
            ) : econData && !loading ? (
                <EconomicTerminal 
                    markets={econData.markets}
                    agreements={econData.agreements}
                    routes={econData.routes}
                    factions={econData.factions}
                    playerFactionId={econData.playerFactionId}
                    currentPolicies={econData.policies}
                />
            ) : (
                <div className="h-[600px] w-[1100px] flex items-center justify-center bg-[#0a0c10] border border-blue-900/20 rounded-lg">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin shadow-[0_0_15px_rgba(59,130,246,0.3)]"></div>
                        <span className="text-blue-400 font-display tracking-widest text-xs animate-pulse">ESTABLISHING QUANTUM UPLINK...</span>
                        <div className="flex gap-1">
                            {[0, 1, 2].map(i => (
                                <div key={i} className="w-1 h-1 bg-blue-500/50 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }}></div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}
