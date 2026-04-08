"use client";

import { useState } from 'react';
import EventCard from '@/components/EventCard';
import Newspaper from '@/components/Newspaper';
import GalaxyMap from '@/components/GalaxyMap';
import Navbar from '@/components/Navbar';
import StatusBar from '@/components/StatusBar';
import FactionCouncil from '@/components/FactionCouncil';
import CommandDock from '@/components/CommandDock';
import Modal from '@/components/ui/Modal';
import CrisisDashboard from '@/components/CrisisDashboard';
import IntriguePanel from '@/components/intrigue/IntriguePanel';
import EspionageAgencyPanel from '@/components/intrigue/EspionageAgencyPanel';
import TradePanel from '@/components/economy/TradePanel';
import ColdWarPanel from '@/components/panels/ColdWarPanel';
import CorporateLedgerPanel from '@/components/panels/CorporateLedgerPanel';
import PlanetConstructionPanel from '@/components/construction/PlanetConstructionPanel';
import { DoomTracker } from '@/components/defeat/DoomTracker';
import { DefeatModal } from '@/components/defeat/DefeatModal';
import { VictoryModal } from '@/components/victory/VictoryModal';
import ResearchPanel from '@/components/panels/ResearchPanel';
import DiplomacyPanel from '@/components/panels/DiplomacyPanel';
import ShipDesignerPanel from '@/components/panels/ShipDesignerPanel';
import LeadershipPanel from '@/components/panels/LeadershipPanel';
import BattleCommandPanel from '@/components/panels/BattleCommandPanel';
import GovernmentPanel from '@/components/panels/GovernmentPanel';
import DoctrinePanel from '@/components/panels/DoctrinePanel';
import { establishTradeRouteAction, generateIntrigueOptionsAction, executeIntrigueAction } from '@/app/actions/economy';
import { getActiveRoutes } from '@/lib/economy/trade';
import { useRouter } from 'next/navigation';

export default function Dashboard({ state, planets, factions, armies }: any) {
    const router = useRouter();
    const [activeView, setActiveView] = useState<'none' | 'events' | 'gazette' | 'faction' | 'intrigue' | 'trade' | 'cold-war' | 'corporate' | 'build' | 'research' | 'diplomacy' | 'ship-designer' | 'leadership' | 'battle' | 'government' | 'doctrine'>('none');
    const [selectedHex, setSelectedHex] = useState<{ x: number, y: number } | null>(null);
    const [selectedArmyId, setSelectedArmyId] = useState<string | null>(null);
    const [isMoving, setIsMoving] = useState(false);

    // Mock Services (ideally passed from server or initialized once)
    // const intrigueService = new PoliticalIntrigueService(); // Removed, use Server Action
    const activeRoutes = getActiveRoutes(state.faction?.$id || 'faction-player');

    const handleHexClick = async (x: number, y: number) => {
        // Find planet at x,y
        const armyAtHex = armies?.find((a: any) => a.x === x && a.y === y);

        if (selectedArmyId && !isMoving) {
            // Logic: Attempt to move selected army to here
            if (armyAtHex && armyAtHex.$id === selectedArmyId) {
                // Clicked self -> Deselect
                setSelectedArmyId(null);
                setSelectedHex(null);
                return;
            }

            // Move! (This part uses a different action, assumed to work)
            // For now, let's just deselect if clicking elsewhere without move logic implemented here fully
            setSelectedArmyId(null);
            setSelectedHex(null);
        } else {
            // Select Logic
            setSelectedHex({ x, y });
            if (armyAtHex) {
                setSelectedArmyId(armyAtHex.$id);
            } else {
                setSelectedArmyId(null);
            }
        }
    };

    // Handlers for New Panels
    const handleGenerateOps = async (targetId: string) => {
        return await generateIntrigueOptionsAction(targetId);
    };

    const handleExecuteOp = async (optionId: string) => {
        await executeIntrigueAction(optionId, 'SABOTAGE', 'target-id'); // Type would ideally come from option
        router.refresh();
    };

    const handleCreateRoute = async (targetId: string, resource: any, amount: number) => {
        await establishTradeRouteAction(state.faction?.$id || 'player', targetId, resource, amount);
        router.refresh();
    };

    return (
        <div className="min-h-screen bg-black text-neutral-200 font-sans selection:bg-blue-500/30 overflow-hidden relative">
            {state.error && (
                <div className="absolute inset-x-0 top-0 z-[100] bg-red-900/90 text-white p-4 font-mono text-sm">
                    <h3 className="font-bold text-lg">CRITICAL SERVER ERROR</h3>
                    <p>{state.error}</p>
                    <pre className="text-xs mt-2 opacity-75 overflow-auto max-h-40">{state.stack}</pre>
                </div>
            )}
            {/* Layer 1: Galaxy Map (Background) */}
            <div className="absolute inset-0 z-0">
                <GalaxyMap
                    planets={planets}
                    factions={factions}
                    armies={armies}
                    onHexClick={handleHexClick}
                    selectedHex={selectedHex}
                />
                {isMoving && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto">
                        <div className="text-xl font-bold animate-pulse text-sky-500">Fleet Moving...</div>
                    </div>
                )}
            </div>

            {/* Layer 2: UI Overlays */}
            <div className="relative z-50 h-screen flex flex-col pointer-events-none w-full">
                <div className="pointer-events-auto">
                    <StatusBar state={state} />
                </div>

                <div className="flex-1" />

                {/* Bottom Dock */}
                <div className="pointer-events-auto pb-6">
                    <CommandDock
                        onOpenEvent={() => setActiveView('events')}
                        onOpenGazette={() => setActiveView('gazette')}
                        onOpenFaction={() => setActiveView('faction')}
                        onOpenIntrigue={() => setActiveView('intrigue')}
                        onOpenTrade={() => setActiveView('trade')}
                        onOpenColdWar={() => setActiveView('cold-war')}
                        onOpenCorporate={() => setActiveView('corporate')}
                        onOpenBuild={() => setActiveView('build')}
                        onOpenResearch={() => setActiveView('research')}
                        onOpenDiplomacy={() => setActiveView('diplomacy')}
                        onOpenShipDesigner={() => setActiveView('ship-designer')}
                        onOpenLeadership={() => setActiveView('leadership')}
                        onOpenBattle={() => setActiveView('battle')}
                        onOpenGovernment={() => setActiveView('government')}
                        onOpenDoctrine={() => setActiveView('doctrine')}
                    />
                </div>
            </div>

            {/* Layer 3: Modals */}
            <CrisisDashboard crises={state.crises || []} currentFactionId="692db2fa000cd91f9852" />
            <DoomTracker defeatState={state.defeat_status} />
            {state.defeat_status && <DefeatModal defeatState={state.defeat_status} />}
            {state.victory_status && <VictoryModal victoryState={state.victory_status} />}

            <Modal isOpen={activeView === 'events'} onClose={() => setActiveView('none')} title="Daily Event">
                <EventCard event={state.event} />
            </Modal>

            <Modal isOpen={activeView === 'gazette'} onClose={() => setActiveView('none')} title="Galactic Gazette">
                <div className="min-h-[400px]">
                    <Newspaper day={state.day} />
                </div>
            </Modal>

            <Modal isOpen={activeView === 'faction'} onClose={() => setActiveView('none')} title="Faction Council">
                <FactionCouncil />
            </Modal>

            {/* New Modals for Economy/Intrigue */}
            <Modal isOpen={activeView === 'intrigue'} onClose={() => setActiveView('none')} title="Espionage Agency">
                <EspionageAgencyPanel />
            </Modal>

            <Modal isOpen={activeView === 'trade'} onClose={() => setActiveView('none')} title="Trade Network">
                <TradePanel
                    factionId={state.faction?.$id}
                    activeRoutes={activeRoutes}
                    factions={factions}
                    planets={planets}
                    onCreateRoute={handleCreateRoute}
                />
            </Modal>

            <Modal isOpen={activeView === 'cold-war'} onClose={() => setActiveView('none')} title="Galactic Cold War">
                <ColdWarPanel />
            </Modal>

            <Modal isOpen={activeView === 'corporate'} onClose={() => setActiveView('none')} title="Galactic Exchange — Charter Companies">
                <CorporateLedgerPanel />
            </Modal>

            {activeView === 'build' && (() => {
                // Determine planet ID based on selection or fallback to home planet
                let planetId = 'none';
                let systemId = 'system1'; // Default system ID
                if (selectedHex) {
                    const p = planets.find((p: any) => p.x === selectedHex.x && p.y === selectedHex.y);
                    if (p) {
                        planetId = p.$id;
                        systemId = p.systemId || 'system1';
                    }
                } else if (state.faction?.home_planet_id) {
                    planetId = state.faction.home_planet_id;
                    const hp = planets.find((p: any) => p.$id === planetId);
                    if (hp) Object.assign({}, hp, { systemId: hp.systemId || 'system1' });
                }

                // If no planet is found, don't show the panel
                if (planetId === 'none') {
                    return (
                        <Modal isOpen={true} onClose={() => setActiveView('none')} title="Construction Error">
                            <div className="p-8 text-center text-slate-400">
                                Please select a planet on the map first to open construction.
                            </div>
                        </Modal>
                    );
                }

                // Safely parse resources since Appwrite returns stringified JSON
                let r: any = {};
                try {
                    r = typeof state.faction?.resources === 'string'
                        ? JSON.parse(state.faction.resources)
                        : (state.faction?.resources || {});
                } catch (e) { r = {} }

                return (
                    <PlanetConstructionPanel
                        planetId={planetId}
                        systemId={systemId}
                        factionId={state.faction?.$id || 'faction-player'}
                        factionCredits={r.credits || 0}
                        factionMetals={r.metals || 0}
                        factionChemicals={r.chemicals || 0}
                        factionEnergy={r.energy || 0}
                        factionRares={r.rares || 0}
                        onClose={() => setActiveView('none')}
                    />
                );
            })()}

            {/* === New Integrated Panels === */}

            <Modal isOpen={activeView === 'research'} onClose={() => setActiveView('none')} title="Neural Archive — Research">
                <ResearchPanel />
            </Modal>

            <Modal isOpen={activeView === 'diplomacy'} onClose={() => setActiveView('none')} title="Neural Statecraft — Diplomacy">
                <DiplomacyPanel />
            </Modal>

            <Modal isOpen={activeView === 'ship-designer'} onClose={() => setActiveView('none')} title="Fleet Engineer — Ship Designer">
                <ShipDesignerPanel />
            </Modal>

            <Modal isOpen={activeView === 'leadership'} onClose={() => setActiveView('none')} title="Personnel & Leadership">
                <LeadershipPanel />
            </Modal>

            <Modal isOpen={activeView === 'battle'} onClose={() => setActiveView('none')} title="Battle Command — Tactical Override">
                <BattleCommandPanel />
            </Modal>

            <Modal isOpen={activeView === 'government'} onClose={() => setActiveView('none')} title="Government Domain">
                <GovernmentPanel />
            </Modal>

            <Modal isOpen={activeView === 'doctrine'} onClose={() => setActiveView('none')} title="Empire Strategy — Doctrine">
                <DoctrinePanel />
            </Modal>
        </div>
    );
}
