"use client";

import React, { useEffect } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { getFleetsAction } from '@/app/actions/movement';
import { useRouter } from 'next/navigation';
import TopNav from '@/components/shell/TopNav';
import GalaxyShell from '@/components/galaxy/GalaxyShell';
import EconomyPanel from '@/components/panels/EconomyPanel';
import GovernmentPanel from '@/components/panels/GovernmentPanel';
import IntelligencePanel from '@/components/panels/IntelligencePanel';
import PressPanel from '@/components/panels/PressPanel';
import EspionageAgencyPanel from '@/components/intrigue/EspionageAgencyPanel';
import CouncilPanel from '@/components/panels/CouncilPanel';
import SeasonEndScreen from '@/components/season/SeasonEndScreen';
import Modal from '@/components/ui/Modal';
import EconomicTerminal from '@/components/economy/EconomicTerminal';
import { getEconomyStateAction } from '@/app/actions/economy';
import DossierPanel from '@/components/panels/DossierPanel';
import ResearchPanel from '@/components/panels/ResearchPanel';
import DiscoursePanel from '@/components/panels/DiscoursePanel';
import CorporateLedgerPanel from '@/components/panels/CorporateLedgerPanel';
import BattleCommandPanel from '@/components/panels/BattleCommandPanel';
import DiplomacyPanel from '@/components/panels/DiplomacyPanel';
import ShipDesignerPanel from '@/components/panels/ShipDesignerPanel';

const PANEL_MAP = {
    galaxy: null,         // No overlay — pure map view
    economy: <EconomyPanel />,
    government: <GovernmentPanel />,
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

export default function GameShell() {
    const { activeTab, showSeasonEnd, seasonState, setFleets, playerFactionId, setPlayerFactionId } = useUIStore();
    const router = useRouter();

    // On mount: check localStorage for saved faction, redirect to /lobby if missing
    useEffect(() => {
        const saved = localStorage.getItem('selectedFactionId');
        if (saved) {
            setPlayerFactionId(saved);
        } else {
            router.replace('/lobby');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Initial fetch + poll every 2 seconds to animate fleet transit
    useEffect(() => {
        const fetchFleets = async () => {
            try {
                const fleets = await getFleetsAction();
                setFleets(fleets);
            } catch (e) {
                console.error("Failed to fetch fleets:", e);
            }
        };
        fetchFleets();
        const interval = setInterval(fetchFleets, 2000);
        return () => clearInterval(interval);
    }, [setFleets]);

    const activePanel = PANEL_MAP[activeTab];

    return (
        <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-950">
            {/* ── Top Navigation ─────────────────────────────────────────────────── */}
            <TopNav />

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
            </div>

            {/* ── Season-end screen (full overlay) ──────────────────────────────── */}
            {(showSeasonEnd || seasonState.phase === 'locked') && <SeasonEndScreen />}

            {/* ── Economic Terminal Modal ────────────────────────────────────────── */}
            <EconomicTerminalModal />

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
    const [econData, setEconData] = React.useState<any>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        if (showEconomicTerminal) {
            console.log("[ECONOMY] Modal Open - Fetching data...");
            setLoading(true);
            setError(null);
            getEconomyStateAction()
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
    }, [showEconomicTerminal]);

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
