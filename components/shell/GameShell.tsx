"use client";

import React, { useEffect, useRef } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { useGameSync } from '@/hooks/useGameSync';
import BootScreen from '@/components/auth/BootScreen';
import { factionColor } from '@/components/galaxy/starVisuals';
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
const FactionPanel = dynamic(() => import('@/components/panels/FactionPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-orange-400/80 animate-pulse border border-orange-900/20 bg-slate-950 rounded shadow-2xl">READING THE LEDGERS...</div>
});
const DiscoursePanel = dynamic(() => import('@/components/panels/DiscoursePanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-indigo-400/80 animate-pulse border border-indigo-900/20 bg-slate-950 rounded shadow-2xl">CONNECTING TO CHANNELS CONSOLE...</div>
});
const HistoryPanel = dynamic(() => import('@/components/panels/HistoryPanel'), {
    ssr: false,
    loading: () => <div className="p-6 text-xs font-mono text-cyan-400/80 animate-pulse border border-cyan-900/20 bg-slate-950 rounded shadow-2xl">OPENING THE GALACTIC ARCHIVE...</div>
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

const TacticalBattleView = dynamic(() => import('@/components/tactical/TacticalBattleView'), {
    ssr: false,
    loading: () => <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 text-xs font-mono text-rose-400/80 animate-pulse">ENTERING ENGAGEMENT ZONE...</div>
});

const SeasonEndScreen = dynamic(() => import('@/components/season/SeasonEndScreen'), { ssr: false });
const PlanetSurfaceView = dynamic(() => import('@/components/planet/PlanetSurfaceView'), {
    ssr: false,
    loading: () => <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 text-xs font-mono text-emerald-400/80 animate-pulse">ENTERING ORBIT...</div>
});
const SystemOrbitalView = dynamic(() => import('@/components/planet/SystemOrbitalView'), {
    ssr: false,
    loading: () => <div className="absolute inset-0 z-[38] flex items-center justify-center bg-slate-950/80 text-xs font-mono text-sky-400/80 animate-pulse">APPROACHING SYSTEM...</div>
});
const PendingOrdersIndicator = dynamic(() => import('@/components/notifications/PendingOrdersIndicator'), { ssr: false });
const EconomicTerminal = dynamic(() => import('@/components/economy/EconomicTerminal'), {
    ssr: false,
    loading: () => <div className="p-12 text-center text-xs font-mono text-cyan-400/80 animate-pulse">CONNECTING TO FINANCIAL SECTOR DATABASE...</div>
});
const ShadowPanel = dynamic(() => import('@/components/panels/ShadowPanel'), {
    loading: () => <div className="p-6 text-xs font-mono text-purple-400/80 animate-pulse border border-purple-900/20 bg-slate-950 rounded shadow-2xl">RAISING THE UNDERWORLD...</div>
});
const ManualGuidebook = dynamic(() => import('@/components/manual/ManualGuidebook'), { ssr: false });
const DevToolbox = dynamic(() => import('@/components/debug/DevToolbox'), { ssr: false });
const DefeatOverlay = dynamic(() => import('@/components/defeat/DefeatOverlay'), { ssr: false });
const NotificationFeed = dynamic(() => import('@/components/notifications/NotificationFeed'), { ssr: false });
const TutorialOverlay = dynamic(() => import('@/components/tutorial/TutorialOverlay'), { ssr: false });
const MusicPlayer = dynamic(() => import('@/components/audio/MusicPlayer'), { ssr: false });

const PANEL_MAP = {
    galaxy: null,         // No overlay — pure map view
    economy: <EconomyPanel />,
    government: <GovernmentPanel />,
    leadership: <LeadershipPanel />,
    intelligence: <IntelligencePanel />,
    press: <PressPanel />,
    // SHADOW is the underworld: bands, their bases, what we pay them and how
    // close our own arrangements are to being exposed. It used to point at the
    // espionage agency, which left ShadowPanel unreachable — the agency now has
    // its own sub-tab beside OPERATIONS.
    shadow: <ShadowPanel />,
    agency: <EspionageAgencyPanel />,
    council: <CouncilPanel />,
    dossier: <DossierPanel />,
    saga: <FactionPanel />,
    tech: <ResearchPanel />,
    discourse: <DiscoursePanel />,
    history: <HistoryPanel />,
    corporate: <CorporateLedgerPanel />,
    war: <BattleCommandPanel />,
    diplomacy: <DiplomacyPanel />,
    designer: <ShipDesignerPanel />,
} as const;

import CommandDock from '@/components/shell/CommandDock';
import CommandWorkspace from '@/components/shell/CommandWorkspace';

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
    const { isLoading: syncLoading, error: syncError } = useGameSync();

    // Boot checklist: stays up until the faction is known AND the first
    // snapshot has landed, so the player sees "faction registered" and the
    // galaxy count tick in rather than a black map that may or may not be
    // loading. Once it drops it never comes back for reconnects.
    const bootDoneRef = useRef(false);
    const galaxyReady = systems.length > 0;
    const booting = !bootDoneRef.current && (!playerFactionId || !galaxyReady || syncLoading);
    if (!booting) bootDoneRef.current = true;
    const bootFactionName = playerFactionId
        ? (factions[playerFactionId]?.name ?? playerFactionId.replace(/^faction-/, '').replace(/[_-]/g, ' '))
        : null;

    // On mount: check auth, then reconcile the played faction with the account's
    // ACTUAL claim. localStorage can hold a stale faction (e.g. selected before
    // switching accounts) — playing a faction claimed by someone else makes the
    // server reject every order with 403 "claimed by another player".
    useEffect(() => {
        const checkAuthAndFaction = async () => {
            const user = await authService.getCurrentUser();
            if (!user) {
                router.replace('/login');
                return;
            }

            // The authoritative source: whichever faction THIS account claimed.
            // The server resolves that from the session now and answers with
            // `myFactionId` / `isMine`; it no longer hands out other players'
            // account ids for the client to compare against.
            let serverAnswered = false;
            try {
                const res = await fetch('/api/lobby/claim');
                if (res.ok) {
                    const data = await res.json();
                    serverAnswered = true;
                    if (data.myFactionId) {
                        localStorage.setItem('selectedFactionId', data.myFactionId);
                        setPlayerFactionId(data.myFactionId);
                        return;
                    }
                }
            } catch { /* transient failure — resolved below */ }

            if (serverAnswered) {
                // The server said this account has NO claim. A stale
                // localStorage selection used to let the account enter the game
                // as any UNCLAIMED faction anyway. No claim → the lobby, always.
                localStorage.removeItem('selectedFactionId');
                router.replace('/lobby');
                return;
            }

            // Claim API unreachable (blip mid-session): fall back to the local
            // selection rather than kicking a valid player to the lobby — the
            // order queue is authoritative and rejects anything illegitimate.
            const saved = localStorage.getItem('selectedFactionId');
            if (saved) setPlayerFactionId(saved);
            else router.replace('/lobby');
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
            {/* ── Top information strip (resources · date · alerts) ─────────────── */}
            <TopNav />

            {/* ── Main area ──────────────────────────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Galaxy is ALWAYS rendered underneath — even when a workspace is open */}
                <div className="absolute inset-0">
                    <GalaxyShell />
                </div>

                {/* Layer 1.5 / 2: system orbital view, then the planet surface
                    board on top of it — each dive stacks over the galaxy */}
                <SystemViewGate />
                <PlanetSurfaceGate />

                {/* Contextual workspace expands UP from the Command Dock */}
                {activePanel && (
                    <CommandWorkspace>{activePanel}</CommandWorkspace>
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

            {/* ── Command Dock: the one persistent navigation surface ───────────── */}
            <CommandDock />

            {/* ── Boot checklist (full overlay until the first snapshot lands) ─── */}
            <BootScreen
                visible={booting}
                title={syncError ? 'Uplink fault' : bootFactionName ? 'Faction registered' : 'Verifying identity'}
                subtitle={syncError
                    ? 'The command deck could not reach the galaxy. Retrying…'
                    : bootFactionName ? `${bootFactionName} answers to you. Synchronizing the galaxy…` : 'Confirming which empire this account commands'}
                accent={playerFactionId ? factionColor(playerFactionId) : '#f59e0b'}
                steps={[
                    { label: 'Identity verified', state: 'done' },
                    {
                        label: 'Faction registered',
                        state: playerFactionId ? 'done' : 'active',
                        detail: bootFactionName ?? 'Reading your claim',
                    },
                    {
                        label: 'Synchronizing galaxy',
                        state: syncError ? 'error' : galaxyReady ? 'done' : playerFactionId ? 'active' : 'pending',
                        detail: syncError ? String(syncError) : galaxyReady ? `${systems.length} systems charted` : 'Pulling the latest snapshot',
                    },
                    {
                        label: 'Command uplink',
                        state: galaxyReady && !syncLoading ? 'done' : galaxyReady ? 'active' : 'pending',
                        detail: galaxyReady && !syncLoading ? 'Live' : undefined,
                    },
                ]}
            />

            {/* ── Pending orders HUD (optimistic feedback) ───────────────────────── */}
            <PendingOrdersIndicator />

            {/* ── Live tactical battle (full overlay) ────────────────────────────── */}
            <TacticalBattleOverlay />

            {/* ── Season-end screen (full overlay) ──────────────────────────────── */}
            {(showSeasonEnd || seasonState.phase === 'locked') && <SeasonEndScreen />}

            {/* ── Empire fallen (full overlay, dismissable to observer mode) ────── */}
            <DefeatOverlay />

            {/* ── Notification feed (opens from the TopNav bell) ────────────────── */}
            <NotificationFeed />

            {/* ── Guided tour (auto-starts on first login, ? button restarts) ───── */}
            <TutorialOverlay />

            {/* ── Soundtrack (headless; the control lives in TopNav) ─────────────── */}
            <MusicPlayer />

            {/* ── Economic Terminal Modal ────────────────────────────────────────── */}
            <EconomicTerminalModal />

            {/* ── Manual Guidebook (HOI4-style) ────────────────────────────────── */}
            <ManualGuidebook />

            {/* ── Developer Toolbox (Ctrl+D) — dev builds only. In production it
                 rendered "Auth: Root Admin" controls to every player. ───────── */}
            {process.env.NODE_ENV !== 'production' && <DevToolbox />}

        </div>
    );
}

/**
 * Battlefield features derived from the system's tags: asteroid/belt/debris
 * tags seed asteroid fields, nebula tags seed sensor-veiling clouds. Layout is
 * deterministic per system so refights happen on the same terrain.
 */
function hazardsForSystem(systemId: string, tags: string[]): import('@/lib/tactical/types').Hazard[] {
    const t = (tags || []).map(x => String(x).toLowerCase());
    const hasAsteroids = t.some(x => x.includes('asteroid') || x.includes('belt') || x.includes('debris'));
    const hasNebula = t.some(x => x.includes('nebula'));
    if (!hasAsteroids && !hasNebula) return [];
    let seed = 0;
    for (let i = 0; i < systemId.length; i++) seed = (seed * 31 + systemId.charCodeAt(i)) >>> 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
    const out: import('@/lib/tactical/types').Hazard[] = [];
    if (hasAsteroids) {
        const n = 2 + Math.floor(rand() * 2);
        for (let i = 0; i < n; i++) {
            out.push({ kind: 'asteroid', x: 420 + rand() * 760, y: 220 + rand() * 560, r: 70 + rand() * 70 });
        }
    }
    if (hasNebula) {
        const n = 1 + Math.floor(rand() * 2);
        for (let i = 0; i < n; i++) {
            out.push({ kind: 'nebula', x: 420 + rand() * 760, y: 220 + rand() * 560, r: 120 + rand() * 80 });
        }
    }
    return out;
}

/**
 * Bridges the strategic layer and the live tactical battle. Launch config is
 * set by the "ENGAGE — TACTICAL" button (SystemContextPanel); on resolution the
 * outcome is sent to the worker as MIL_TACTICAL_RESULT, which applies surviving
 * compositions to the strategic fleets and releases the auto-combat lock.
 */
function TacticalBattleOverlay() {
    const tacticalBattle = useUIStore(s => s.tacticalBattle);
    const setTacticalBattle = useUIStore(s => s.setTacticalBattle);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const fleets = useUIStore(s => s.fleets);
    const systems = useUIStore(s => s.systems);

    // Snapshot the participating fleets when the battle opens — sync updates
    // during the fight must not restart or mutate the running sim.
    const snapshotRef = useRef<{ playerFleets: any[]; enemyFleets: any[] } | null>(null);
    if (tacticalBattle && !snapshotRef.current) {
        snapshotRef.current = {
            playerFleets: fleets.filter((f: any) => tacticalBattle.playerFleetIds.includes(f.id)),
            enemyFleets: fleets.filter((f: any) => tacticalBattle.enemyFleetIds.includes(f.id)),
        };
    }
    if (!tacticalBattle) snapshotRef.current = null;

    // Fleets vanished between click and open (sync race) — bail out. Runs in
    // an effect (no store writes during render) and MUST release the
    // server-side lock, or the system's combats stay frozen for the full
    // lock timeout and re-engagement is rejected.
    const mustBail = !!tacticalBattle && !!snapshotRef.current
        && (!snapshotRef.current.playerFleets.length || !snapshotRef.current.enemyFleets.length);
    useEffect(() => {
        if (!mustBail || !tacticalBattle) return;
        (async () => {
            const { dispatchOrder } = await import('@/lib/multiplayer/order-client');
            dispatchOrder({
                actionId: 'MIL_TACTICAL_ABORT',
                factionId: playerFactionId || 'PLAYER_FACTION',
                payload: { systemId: tacticalBattle.systemId },
                label: `Standing down at ${tacticalBattle.systemName}`,
            });
            setTacticalBattle(null);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mustBail]);

    if (!tacticalBattle || mustBail) return null;
    const snap = snapshotRef.current!;

    const handleFinish = async (result: import('@/lib/tactical/types').BattleResult) => {
        const { buildResultPayload } = await import('@/lib/tactical/fleet-adapter');
        const { dispatchOrder } = await import('@/lib/multiplayer/order-client');
        const payload = buildResultPayload(
            tacticalBattle.systemId,
            tacticalBattle.playerFleetIds,
            tacticalBattle.enemyFleetIds,
            tacticalBattle.enemyFactionId,
            result
        );
        const res = await dispatchOrder({
            actionId: 'MIL_TACTICAL_RESULT',
            factionId: playerFactionId || 'PLAYER_FACTION',
            payload,
            label: `Battle of ${tacticalBattle.systemName}: ${result.winner === 'player' ? 'victory' : result.winner === 'enemy' ? 'defeat' : 'stalemate'}`,
        });
        // Only leave the battle screen once the result actually reached the
        // server — the outcome screen stays up on failure, and RETURN TO
        // GALAXY doubles as the retry button.
        if (res?.success) setTacticalBattle(null);
    };

    // Aborting must release the server-side auto-resolve lock; otherwise the
    // system's combats stay frozen until the lock times out.
    const handleAbort = async () => {
        const { dispatchOrder } = await import('@/lib/multiplayer/order-client');
        dispatchOrder({
            actionId: 'MIL_TACTICAL_ABORT',
            factionId: playerFactionId || 'PLAYER_FACTION',
            payload: { systemId: tacticalBattle.systemId },
            label: `Standing down at ${tacticalBattle.systemName}`,
        });
        setTacticalBattle(null);
    };

    const sys = systems.find((s: any) => s.id === tacticalBattle.systemId);

    return (
        <TacticalBattleView
            title={`BATTLE OF ${tacticalBattle.systemName.toUpperCase()}`}
            playerFleets={snap.playerFleets}
            enemyFleets={snap.enemyFleets}
            enemyName={tacticalBattle.enemyFactionId.replace(/^faction-/, '').replace(/-/g, ' ')}
            hazards={hazardsForSystem(tacticalBattle.systemId, (sys as any)?.tags ?? [])}
            playerHasAdmiral={snap.playerFleets.some((f: any) => !!f.leaderId)}
            enemyHasAdmiral={snap.enemyFleets.some((f: any) => !!f.leaderId)}
            onFinish={handleFinish}
            onAbort={handleAbort}
        />
    );
}

/**
 * Narrow-subscription gate so the planet-view chunk only loads (and GameShell
 * only re-renders) when a surface board is actually open.
 */
function PlanetSurfaceGate() {
    const surfacePlanetId = useUIStore(s => s.surfacePlanetId);
    if (!surfacePlanetId) return null;
    return <PlanetSurfaceView />;
}

/** Same narrow-subscription trick for the system orbital view. */
function SystemViewGate() {
    const systemViewId = useUIStore(s => s.systemViewId);
    if (!systemViewId) return null;
    return <SystemOrbitalView />;
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
