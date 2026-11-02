'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Hammer, Clock, AlertTriangle, Building, ArrowUpCircle, Users, Heart, Zap, Shield, Info, Activity, ShieldCheck, Globe } from 'lucide-react';
import { BuildingType, PlacedBuilding, ConstructionOrder } from '@/lib/construction/construction-types';
import { BUILDINGS as BUILDING_DEFS, buildingOpenTo } from '@/data/buildings';
import PlanetOverviewTab from './PlanetOverviewTab';
import PlanetForcesTab from './PlanetForcesTab';
import { buildBlockReason } from '@/lib/construction/build-gates';
import { reserveFleets } from '@/lib/military/reserve';
import { registry as techRegistry } from '@/lib/tech/engine';
import { empireBuildingState } from '@/lib/construction/construction-service';
import ShipDesignPicker from '@/components/units/ShipDesignPicker';
import UnitIcon from '@/components/units/UnitIcon';
import groundUnits from '@/data/combat/ground-units.json';
import type { ShipDesign } from '@/lib/combat/ship-types';
import { cancelBuildingAction } from '@/app/actions/construction';
import { executePlayerAction } from '@/app/actions/registry-handler';
import { Navigation, Satellite, Route, Truck } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { OrbitalLayerTab } from './OrbitalLayerTab';
import { InfrastructureTab } from './InfrastructureTab';
import { LogisticsTab } from './LogisticsTab';
import { formatPercent } from '@/lib/ui/format';
import { SURFACE_YARD_TIERS } from '@/lib/combat/shipyard-gate';
// Shipyards are built in orbit (Orbital tab), not from this list.
import { SURFACE_YARD_TO_ORBITAL } from '@/lib/orbital/orbital-service';
import { defaultDesignFor, summarizeDesign } from '@/lib/combat/ship-registry';
import { formatSimAsClock } from '@/lib/time/galactic-time';
import { getSyncedWorld } from '@/hooks/useGameSync';
import { buildConstructionView } from '@/lib/construction/construction-view';
import { baseBuildSeconds, QUICK_BUILD_SECONDS, quickBuildApplies } from '@/lib/construction/build-time';
import { ACTION_DEFINITIONS } from '@/lib/actions/registry';
import { CIVILIAN_SHIPS, CIVILIAN_SHIP_IDS, type CivilianShipId } from '@/lib/combat/civilian-ships';

/** What MIL_BUILD_FLEET itself charges, before the corvette chained into it. */
const TASK_FORCE_COST = { credits: ACTION_DEFINITIONS.MIL_BUILD_FLEET.cost?.credits ?? 0, metals: ACTION_DEFINITIONS.MIL_BUILD_FLEET.cost?.metals ?? 0 };


interface PlanetConstructionPanelProps {
    planetId: string;
    systemId: string;
    factionId: string;
    factionCredits: number;
    factionMetals: number;
    factionChemicals: number;
    factionEnergy: number;
    factionRares: number;
    factionManpower?: number;
    /** Undefined on a world from before materiel existed: not checked here, the worker decides. */
    factionMateriel?: number;
    onClose: () => void;
}

type PlanetTab = 'OVERVIEW' | 'BUILD' | 'FORCES' | 'ORBITAL' | 'INFRA' | 'LOGISTICS' | 'SOCIETY';
const PLANET_TABS: readonly PlanetTab[] = ['OVERVIEW', 'BUILD', 'FORCES', 'ORBITAL', 'INFRA', 'LOGISTICS', 'SOCIETY'];
type BuildSection = 'BUILDINGS' | 'SHIPS' | 'TROOPS';
const TROOP_TYPES = ['INFANTRY', 'ARMOR', 'ANTI_ARMOR', 'ARTILLERY', 'AIRBORNE', 'SPECIAL_OPS'];
/** Troops come in companies of this many; the worker charges per head. */
const TROOP_BATCH = 10;

const TAB_ACTIVE: Record<string, string> = {
    indigo: 'border-indigo-500 text-indigo-300 bg-indigo-500/10',
    cyan: 'border-cyan-500 text-cyan-300 bg-cyan-500/10',
    fuchsia: 'border-fuchsia-500 text-fuchsia-300 bg-fuchsia-500/10',
    amber: 'border-amber-500 text-amber-300 bg-amber-500/10',
    emerald: 'border-emerald-500 text-emerald-300 bg-emerald-500/10',
};

export function PlanetConstructionPanel({
    planetId,
    systemId,
    factionId,
    factionCredits,
    factionMetals,
    factionChemicals,
    factionEnergy,
    factionRares,
    factionManpower = 0,
    factionMateriel,
    onClose
}: PlanetConstructionPanelProps) {
    const { playerFactionId, diplomacyState } = useUIStore();
    // Unique buildings show only to their own civilization (data/buildings.ts).
    const playerCivId = useUIStore(s => (s.factions as any)?.[s.playerFactionId ?? '']?.civilizationId as string | undefined);
    const [activeTab, setActiveTab] = useState<PlanetTab>(() => {
        // Opened on a page (a goal, the forces button, the station in orbit): start there, once.
        const asked = useUIStore.getState().constructionInitialTab;
        if (asked) useUIStore.setState({ constructionInitialTab: null });
        if (asked === 'SHIPS' || asked === 'TROOPS') return 'BUILD';
        return PLANET_TABS.includes(asked as PlanetTab) ? asked as PlanetTab : 'OVERVIEW';
    });
    const [buildSection, setBuildSection] = useState<BuildSection>(() => {
        const asked = useUIStore.getState().constructionInitialTab;
        return asked === 'SHIPS' ? 'SHIPS' : asked === 'TROOPS' ? 'TROOPS' : 'BUILDINGS';
    });
    const [showLocked, setShowLocked] = useState(false);
    // Each page, each world, starts at its top.
    const contentRef = React.useRef<HTMLDivElement>(null);
    useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [activeTab, buildSection, planetId]);
    const storePlanets = useUIStore(s => s.planets) as any[];
    const quietMode = useUIStore(s => s.uiPrefs?.quietMode ?? false);
    const unlockedTech = useUIStore(s => s.techState?.unlockedTechIds);
    const storeFleets = useUIStore(s => s.fleets) as any[];
    const storeSystems = useUIStore(s => s.systems) as any[];
    const myWorlds = React.useMemo(
        () => storePlanets.filter(p => p.ownerId === playerFactionId)
            .sort((a, b) => (a.planetType === 'capital' ? -1 : b.planetType === 'capital' ? 1 : String(a.name).localeCompare(String(b.name)))),
        [storePlanets, playerFactionId],
    );
    // Other worlds of ours, one step away, without going back through the map.
    const stepWorld = (delta: number) => {
        const i = myWorlds.findIndex(p => p.id === planetId);
        if (i < 0 || myWorlds.length < 2) return;
        useUIStore.getState().setConstructionPlanet(myWorlds[(i + delta + myWorlds.length) % myWorlds.length].id);
    };
    const [buildings, setBuildings] = useState<PlacedBuilding[]>([]);
    const [queue, setQueue] = useState<ConstructionOrder[]>([]);
    const [spaceQueue, setSpaceQueue] = useState<any[]>([]);
    const [planet, setPlanet] = useState<any | null>(null);
    const [planetLayer, setPlanetLayer] = useState<any | null>(null);
    // `planet` is read once on open; forces and defences must follow the sync.
    const livePlanet = { ...planet, ...storePlanets.find(p => p.id === planetId) };
    const [worldNowSeconds, setWorldNowSeconds] = useState<number>(() => Math.floor(Date.now() / 1000));
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Helper: Map BUILDING_DEFS array to an object for easier lookup
    const buildingMap = React.useMemo(() => {
        const map: Record<string, typeof BUILDING_DEFS[0]> = {};
        BUILDING_DEFS.forEach(b => { map[b.id] = b; });
        return map;
    }, []);

    // Built from the world this browser already syncs (lib/construction/
    // construction-view.ts). It used to come from /api/game-construction,
    // which read a freshly initialised galaxy on the Next server instead of the
    // live game: built buildings and the queue never showed. Recomputed on
    // every sync, so a finished building appears without reopening the panel.
    const syncTick = useUIStore(s => s.planets);
    const loadData = React.useCallback(async () => {
        const world = getSyncedWorld();
        if (!world) return; // first snapshot not in yet; the next sync calls this again
        try {
            const data = buildConstructionView(world, systemId);
            const p = data.planets.find((p: any) => p.id === planetId);
            setPlanet(p || null);
            setBuildings(data.buildings.filter((b: any) => b.planetId === planetId));
            setQueue(data.queue.filter((q: any) => q.planetId === planetId));
            setSpaceQueue(data.spaceBuildQueue.filter((q: any) => q.planetId === planetId));
            // Planet-layer detail (orbital ratings, infrastructure effects,
            // storage, haulage, blockade, specialization qualification).
            setPlanetLayer(data.planetLayers?.[planetId] ?? null);
            setWorldNowSeconds(data.nowSeconds);
        } catch (err: any) {
            setError(err.message || 'Failed to read construction data');
        } finally {
            setLoading(false);
        }
    }, [planetId, systemId]);

    useEffect(() => {
        void loadData();
    }, [loadData, syncTick]);

    const handleQueueBuilding = async (type: string) => {
        setActionLoading(true);
        setError(null);
        try {
            // Direct order dispatch (HTTP) — bypasses the flaky server-action
            // transport and shows the optimistic "syncing" chip.
            const { dispatchOrder } = await import('@/lib/multiplayer/order-client');
            const res = await dispatchOrder({
                actionId: 'PLANET_CONSTRUCT_BUILDING',
                factionId,
                payload: { planetId, systemId, buildingType: type },
                label: `Constructing ${type.replace(/_/g, ' ')}`,
            });
            if (!res.success) throw new Error(res.error || 'Failed to queue building');
            await loadData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleQueueSpaceConstruction = async (shipType: string) => {
        setActionLoading(true);
        setError(null);
        try {
            const { dispatchOrder } = await import('@/lib/multiplayer/order-client');
            // A hull class rides the modern chained recruit (standard pattern of
            // that hull); the worker refuses and refunds anything else.
            const res = await dispatchOrder({
                actionId: 'MIL_BUILD_FLEET',
                factionId,
                payload: { planetId, systemId, shipType, recruitUnitType: shipType.toUpperCase() },
                label: `Commissioning fleet + ${shipType.replace(/_/g, ' ')}`,
            });
            if (!res.success) throw new Error(res.error || 'Failed to queue space construction');
            await loadData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    // An unarmed ship in a fleet of its own (lib/combat/civilian-ships.ts).
    const [civNotice, setCivNotice] = useState<string | null>(null);
    const handleBuildCivilian = async (shipType: CivilianShipId) => {
        setActionLoading(true);
        setError(null);
        setCivNotice(null);
        try {
            const { dispatchOrder } = await import('@/lib/multiplayer/order-client');
            const res = await dispatchOrder({
                actionId: 'MIL_BUILD_CIVILIAN',
                factionId,
                payload: { planetId, shipType },
                label: `Laying down ${CIVILIAN_SHIPS[shipType].name}`,
            });
            if (!res.success) throw new Error(res.error || 'Failed to lay down the ship');
            const def = CIVILIAN_SHIPS[shipType];
            setCivNotice(`${def.name} laid down: ready in about ${Math.round(def.buildSeconds / 15 / 60)} minutes. It will appear in Military → Forces.`);
            await loadData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    /**
     * Shared dispatcher for the planet-layer tabs. They all follow the same
     * shape — fire the order, surface the rejection reason, reload — so the
     * three of them share one handler instead of copying this five times.
     */
    const handleLayerOrder = async (actionId: string, payload: Record<string, any>, label: string) => {
        setActionLoading(true);
        setError(null);
        try {
            const { dispatchOrder } = await import('@/lib/multiplayer/order-client');
            const res = await dispatchOrder({ actionId, factionId, payload, label });
            if (!res.success) throw new Error(res.error || `Failed: ${label}`);
            await loadData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancelOrder = async (orderId: string) => {
        setActionLoading(true);
        setError(null);
        try {
            const res = await cancelBuildingAction(orderId, factionId);
            if (!res.success) throw new Error(res.error || 'Failed to cancel order');
            await loadData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    // A warship from this world joins its reserve in orbit, made on the first
    // ship. The player never has to make a task force first.
    const handleCommissionShip = async (design: ShipDesign) => {
        const { dispatchOrder } = await import('@/lib/multiplayer/order-client');
        const unitType = design.hullId.toUpperCase();
        const rawPlanet = storePlanets.find(p => p.id === planetId);
        const reserve = rawPlanet && reserveFleets(storeFleets as any[], rawPlanet, playerFactionId ?? '')[0];
        await dispatchOrder(reserve
            ? { actionId: 'MIL_RECRUIT_FORMATION_UNIT', factionId, payload: { formationId: reserve.id, isFleet: true, unitType, designId: design.id, designName: design.name, count: 1 }, label: `Commissioning ${design.name}` }
            : { actionId: 'MIL_BUILD_FLEET', factionId, payload: { planetId, systemId, reserve: true, recruitUnitType: unitType, recruitDesignId: design.id }, label: `Commissioning ${design.name}` });
    };

    const handleRecruitTroops = async (unitType: string, count: number) => {
        const { dispatchOrder } = await import('@/lib/multiplayer/order-client');
        await dispatchOrder({ actionId: 'PLANET_RECRUIT_UNITS', factionId, payload: { planetId, unitType, count }, label: `Recruiting ${count}× ${unitType.replace(/_/g, ' ').toLowerCase()}` });
    };

    // What stops a building here, and how many are stopped.
    const blockFor = (def: any): string | null => {
        const rawPlanet = storePlanets.find(p => p.id === planetId);
        if (!rawPlanet) return null;
        return buildBlockReason(def, rawPlanet, {
            civilizationId: playerCivId,
            unlockedTech: new Set<string>(unlockedTech ?? []),
            techName: id => techRegistry.get(id)?.name,
            buildingName: id => buildingMap[id]?.name,
            empireHas: id => empireBuildingState(storePlanets, playerFactionId ?? '', id) !== 'none',
        });
    };
    const lockedCount = BUILDING_DEFS.filter(d => buildingOpenTo(d, playerCivId) && !(d.id in SURFACE_YARD_TO_ORBITAL) && !!blockFor(d)).length;

    // Helper: Can the faction afford this building right now?
    const canAfford = (type: string) => {
        const def = buildingMap[type];
        if (!def) return false;
        if (factionCredits < def.cost.credits) return false;
        if (def.cost.metals && factionMetals < def.cost.metals) return false;
        if (def.cost.chemicals && factionChemicals < def.cost.chemicals) return false;
        if (def.cost.energy && factionEnergy < def.cost.energy) return false;
        if (def.cost.manpower && factionManpower < def.cost.manpower) return false;
        return true;
    };

    // What a building costs, part by part, and which parts the treasury is short of.
    const costParts = (def: any) => {
        const parts = [
            { label: 'Cr', title: 'credits', amount: def.cost.credits ?? 0, have: factionCredits },
            { label: 'Met', title: 'metals', amount: def.cost.metals ?? 0, have: factionMetals },
            { label: 'Chm', title: 'chemicals', amount: def.cost.chemicals ?? 0, have: factionChemicals },
            { label: 'Nrg', title: 'energy', amount: def.cost.energy ?? 0, have: factionEnergy },
            { label: 'Man', title: 'manpower', amount: def.cost.manpower ?? 0, have: factionManpower },
            { label: 'Rx', title: 'rare materials', amount: def.cost.rares ?? 0, have: factionRares },
        ].filter(p => p.amount > 0);
        return parts.map(p => ({ ...p, short: p.have < p.amount }));
    };
    // The button names the first shortfall instead of greying out unexplained.
    const shortfallText = (def: any): string | null => {
        const short = costParts(def).find(p => p.short);
        return short ? `Need ${Math.ceil(short.amount - short.have).toLocaleString()} ${short.title}` : null;
    };
    // "metals_output" 20 -> "Metals output +20"; fractions read as percentages.
    const effectLabel = (e: any): string => {
        const words = String(e.type).replace(/_percent$/, '').replace(/_/g, ' ');
        const pct = /_percent$/.test(e.type) || (Math.abs(e.value) < 1 && e.value !== 0);
        const n = pct && Math.abs(e.value) < 1 ? Math.round(e.value * 100) : e.value;
        return `${words.charAt(0).toUpperCase()}${words.slice(1)} ${n > 0 ? '+' : ''}${n}${pct ? '%' : ''}`;
    };

    // Helper: Is this an upgrade button?
    const getUpgradePrereq = (type: string) => {
        const def = buildingMap[type];
        return def?.upgradesFrom || null;
    };

    const hasPrereq = (type: string) => {
        const prereq = getUpgradePrereq(type);
        if (!prereq) return true; // Tier 1 or no prereq defined
        return buildings.some(b => b.buildingId === prereq && b.status === 'operational');
    };

    const handleBuildFleet = async () => {
        setActionLoading(true);
        setError(null);
        try {
            const res = await executePlayerAction({
                id: `act_${Date.now()}`,
                actionId: 'MIL_BUILD_FLEET',
                issuerId: factionId,
                targetId: systemId,
                payload: { planetId, systemId, factionId },
                timestamp: Math.floor(Date.now() / 1000)
            });
            if (!res.success) throw new Error(res.error || 'Failed to construct fleet');
            await loadData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    // Same yard rule as the recruit gate (lib/combat/shipyard-gate.ts): the
    // surface yards in SURFACE_YARD_TIERS, or any orbital yard tier. The old
    // list named three building ids that exist nowhere in data/buildings.ts.
    const hasShipyard = buildings.some(b => b.type in SURFACE_YARD_TIERS && b.status === 'operational')
        || ((planetLayer?.orbital?.ratings?.shipyardTier ?? 0) >= 1);
    // What the corvette card actually costs: the worker prices the chained hull
    // from the standard pattern, never from a hard-coded string.
    const corvetteSummary = summarizeDesign(defaultDesignFor('corvette')!, null);
    // The whole price of a new task force, as the worker charges it: the
    // MIL_BUILD_FLEET registry cost, then the chained corvette. The button
    // names the first shortfall instead of letting the worker refuse it.
    const corvetteShortfall = (() => {
        const need = [
            { label: 'credits', need: TASK_FORCE_COST.credits + corvetteSummary.cost.CREDITS, have: factionCredits },
            { label: 'metals', need: TASK_FORCE_COST.metals + corvetteSummary.cost.METALS, have: factionMetals },
            { label: 'materiel', need: corvetteSummary.cost.MATERIEL, have: factionMateriel },
        ];
        const short = need.find(n => n.have !== undefined && n.have < n.need);
        return short ? `Need ${Math.ceil(short.need - (short.have ?? 0)).toLocaleString()} more ${short.label}` : null;
    })();

    // Build slots mirror lib/construction/construction-service.ts buildSlotsFor:
    // two per world, +1 per operational Builder Outpost, at most five extra.
    // Orders past the cap are accepted and wait; the worker promotes them.
    const outposts = buildings.filter(b => b.type === 'construction_yard' && b.status === 'operational').length;
    const buildSlots = 2 + Math.min(5, outposts) + ((planet as any)?.dockedCivilians?.builders ?? 0);
    const busySlots = queue.filter(q => !(q as any).queued).length;
    const waitingOrders = queue.filter(q => (q as any).queued).length;

    // Helper: get ownership color
    const getOwnershipColor = (ownerId: string | null) => {
        if (!ownerId) return 'var(--color-owner-neutral)';
        if (ownerId === playerFactionId) return 'var(--color-owner-player)';
        const isAlly = diplomacyState.treaties?.some(t => 
            t.status === 'active' && 
            t.signatories.includes(ownerId) && 
            t.signatories.includes(playerFactionId!)
        );
        if (isAlly) return 'var(--color-owner-ally)';
        const isEnemy = diplomacyState.rivalries?.some(r => 
            (r.empireAId === ownerId && r.empireBId === playerFactionId) ||
            (r.empireBId === ownerId && r.empireAId === playerFactionId)
        );
        if (isEnemy) return 'var(--color-owner-enemy)';
        return 'var(--color-owner-neutral)';
    };

    const ownerColor = getOwnershipColor(factionId); // Using factionId passed as prop which is the owner context

    // Organize BUILD tab into categories
    const categories = Array.from(new Set(Object.values(BUILDING_DEFS).map(d => d.category)));

    return (
        <div 
            className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 translate-y-0 w-[min(96vw,72rem)]"
            onWheel={(e) => e.stopPropagation()}
        >
            <div 
                className="bg-slate-950/95 backdrop-blur-md border-t border-l border-r border-slate-700/60 rounded-t-xl shadow-[0_-8px_32px_rgba(0,0,0,0.5)] flex flex-col h-[82vh] overflow-hidden"
                style={{ borderTopColor: ownerColor }}
            >
                {/* Header */}
                <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
                    <div className="flex items-center gap-3">
                        {myWorlds.length > 1 && (
                            <div className="flex flex-col gap-0.5">
                                <button onClick={() => stepWorld(-1)} aria-label="Previous world" title="Previous world" className="px-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs">‹</button>
                                <button onClick={() => stepWorld(1)} aria-label="Next world" title="Next world" className="px-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs">›</button>
                            </div>
                        )}
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2 leading-tight">
                                {planet?.name ?? 'Planetary construction'}
                                {planet && (
                                    <span className="text-[10px] font-mono font-normal bg-slate-800 px-2 py-0.5 rounded text-indigo-300 uppercase">
                                        {planet.planetType} world
                                    </span>
                                )}
                            </h2>
                            {planet && (
                                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <Users className="w-3 h-3 text-blue-400" />
                                        <span className="font-mono text-slate-200">{Math.round(planet.population || 0)}M / {planet.popCapacity || 20}M people</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <Heart className="w-3 h-3 text-rose-400" />
                                        <span className="font-mono text-slate-200">Happiness {formatPercent(planet.happiness || 80, 0)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <Zap className="w-3 h-3 text-amber-400" />
                                        <span className={`font-mono ${planet.unrest > 50 ? 'text-red-400' : 'text-slate-200'}`}>Unrest {formatPercent(planet.unrest || 0, 0)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <Shield className="w-3 h-3 text-cyan-400" />
                                        <span className={`font-mono ${planet.stability < 40 ? 'text-red-400' : 'text-slate-200'}`}>Stability {formatPercent(planet.stability || 0, 0)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            onClick={() => useUIStore.getState().setSurfacePlanet(planetId)}
                            title="See this world's districts and place buildings by hand"
                            className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-600/15 hover:bg-emerald-600/30 text-xs font-semibold text-emerald-300"
                        >
                            Surface
                        </button>
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Tabs — short names on one line; it scrolls sideways when narrow */}
                <div className="shrink-0 flex gap-1 px-4 pt-2 border-b border-slate-800 bg-slate-900/50 overflow-x-auto whitespace-nowrap">
                    {([
                        { id: 'OVERVIEW', label: 'Overview', icon: <Globe className="w-3.5 h-3.5" />, accent: 'cyan' },
                        { id: 'BUILD', label: `Build${queue.length ? ` · ${queue.length}` : ''}`, icon: <Hammer className="w-3.5 h-3.5" />, accent: 'indigo' },
                        { id: 'FORCES', label: 'Forces', icon: <Shield className="w-3.5 h-3.5" />, accent: 'amber' },
                        { id: 'ORBITAL', label: 'Orbital', icon: <Satellite className="w-3.5 h-3.5" />, accent: 'fuchsia', alert: !!planet?.orbital?.orbitControlLost },
                        { id: 'INFRA', label: 'Infrastructure', icon: <Route className="w-3.5 h-3.5" />, accent: 'cyan' },
                        { id: 'LOGISTICS', label: 'Logistics', icon: <Truck className="w-3.5 h-3.5" />, accent: 'amber', alert: !!(planetLayer?.blockade?.active || planetLayer?.logistics?.congested) },
                        { id: 'SOCIETY', label: 'Society', icon: <Users className="w-3.5 h-3.5" />, accent: 'emerald' },
                    ] as Array<{ id: typeof activeTab; label: string; icon: React.ReactNode; accent: string; alert?: boolean }>).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === t.id
                                ? TAB_ACTIVE[t.accent]
                                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                            }`}
                        >
                            {t.icon}
                            {t.label}
                            {t.alert && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div ref={contentRef} className="flex-1 overflow-y-auto p-6 pt-4 bg-slate-950/50 relative">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
                            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                        </div>
                    )}

                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 text-red-400">
                            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div className="text-sm font-medium space-y-1">
                                <p>Error Occurred</p>
                                <p className="text-red-300 opacity-90">{error}</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'OVERVIEW' && planet && (
                        <div className="mb-6">
                            <PlanetOverviewTab planet={livePlanet} layer={planetLayer} queue={queue} spaceQueue={spaceQueue} nowSeconds={worldNowSeconds} onOpenBuild={() => setActiveTab('BUILD')} />
                        </div>
                    )}

                    {activeTab === 'FORCES' && planet && (
                        <PlanetForcesTab planet={livePlanet} onOpenBuild={() => { setActiveTab('BUILD'); setBuildSection('SHIPS'); }} onClose={onClose} />
                    )}

                    {activeTab === 'BUILD' && (
                        <div className="sticky -top-4 z-20 -mx-6 px-6 py-2 mb-4 bg-slate-950/95 border-b border-slate-800/60 flex flex-wrap items-center gap-2">
                            {([['BUILDINGS', 'Buildings'], ['SHIPS', 'Ships'], ['TROOPS', 'Troops']] as Array<[BuildSection, string]>).map(([id, label]) => (
                                <button key={id} onClick={() => setBuildSection(id)}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${buildSection === id ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-indigo-500/50'}`}>
                                    {label}
                                </button>
                            ))}
                            {buildSection === 'BUILDINGS' && lockedCount > 0 && (
                                <button onClick={() => setShowLocked(v => !v)} className="ml-auto text-[11px] text-slate-400 hover:text-slate-200">
                                    {showLocked ? 'Hide' : 'Show'} {lockedCount} locked
                                </button>
                            )}
                        </div>
                    )}

                    {activeTab === 'BUILD' && buildSection === 'BUILDINGS' && (
                        <div className="space-y-8">
                            <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 rounded-xl border text-xs ${busySlots >= buildSlots ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-700/50 bg-slate-900/60'}`}>
                                <span className="font-display tracking-widest uppercase text-slate-400">Build slots</span>
                                {livePlanet.quickBuildsLeft > 0 && (
                                    <span className="font-mono font-bold text-emerald-300">{livePlanet.quickBuildsLeft} quick build{livePlanet.quickBuildsLeft === 1 ? '' : 's'} left: up in {formatSimAsClock(QUICK_BUILD_SECONDS)}</span>
                                )}
                                <span className={`font-mono font-bold ${busySlots >= buildSlots ? 'text-amber-300' : 'text-cyan-300'}`}>{busySlots} / {buildSlots} busy</span>
                                {waitingOrders > 0 && (
                                    <span className="font-mono text-amber-300">{waitingOrders} waiting for a slot</span>
                                )}
                                <span className="text-slate-500">
                                    A world works {buildSlots} site{buildSlots === 1 ? '' : 's'} at a time · each Builder Outpost adds one (up to +5){busySlots >= buildSlots ? ' · new orders will queue' : ''}
                                </span>
                            </div>
                            {categories.map(cat => (
                                <div key={cat} className="space-y-4">
                                    <h3 className="text-xs font-bold tracking-widest text-slate-500 uppercase flex items-center gap-2">
                                        <div className="h-px bg-slate-800 flex-1" />
                                        {cat}
                                        <div className="h-px bg-slate-800 flex-1" />
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {(BUILDING_DEFS.map(d => [d.id, d]) as [BuildingType, any][])
                                            .filter(([_, def]) => def.category === cat && buildingOpenTo(def, playerCivId) && !(def.id in SURFACE_YARD_TO_ORBITAL))
                                            .map(([type, def]) => {
                                                const afford = canAfford(type);
                                                // What stops it here, in words (the worker's own checks, lib/construction/build-gates.ts).
                                                const block = blockFor(def);
                                                const reqsMet = !block;
                                                const isUpgrade = def.tier > 1;
                                                if (block && !showLocked) return null;

                                                return (
                                                    <div
                                                        key={type}
                                                        className={`p-3 rounded-xl border transition-colors flex flex-col gap-2
                                                            ${afford && reqsMet ? 'bg-slate-900 border-slate-700/80 hover:border-indigo-500/50' : 'bg-slate-900/40 border-slate-800/70'}
                                                        `}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <h4 className="text-sm text-slate-100 font-semibold flex items-center gap-1.5 leading-tight">
                                                                    {isUpgrade ? <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Building className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                                                                    <span className="truncate">{def.name}</span>
                                                                </h4>
                                                                {!quietMode && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1" title={def.description}>{def.description}</p>}
                                                            </div>
                                                            <div className="flex flex-col items-end gap-1 shrink-0">
                                                                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">T{def.tier}</span>
                                                                <span className="flex items-center gap-1 text-[10px] text-slate-400" title="Build time, real time">
                                                                    <Clock className="w-3 h-3" />
                                                                    {formatSimAsClock(quickBuildApplies(livePlanet, def) ? Math.min(baseBuildSeconds(def), QUICK_BUILD_SECONDS) : baseBuildSeconds(def))}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {block && <p className="text-[11px] text-amber-300/90">{block}</p>}
                                                        {def.effects.length > 0 && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {def.effects.map((e: any, idx: number) => (
                                                                    <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300/90">
                                                                        {effectLabel(e)}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                                                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-mono">
                                                                {costParts(def).map(part => (
                                                                    <span key={part.label} className={part.short ? 'text-red-400' : 'text-slate-300'} title={part.title}>
                                                                        {part.amount.toLocaleString()} {part.label}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                            <button
                                                                disabled={!afford || !reqsMet || actionLoading}
                                                                onClick={() => handleQueueBuilding(type)}
                                                                title={block ?? (!afford ? shortfallText(def) ?? undefined : undefined)}
                                                                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors
                                                                    ${(!afford || !reqsMet)
                                                                        ? 'bg-slate-800/80 text-slate-500 cursor-not-allowed'
                                                                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'}
                                                                `}
                                                            >
                                                                {block ? 'Locked' : !afford ? (shortfallText(def) ?? 'Cannot afford') : isUpgrade ? 'Upgrade' : busySlots >= buildSlots ? 'Queue' : 'Build'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'OVERVIEW' && (
                        <div className="space-y-6">
                            {/* Completed Buildings Section */}
                            <div>
                                <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-4 flex items-center gap-2">
                                    <Building className="w-4 h-4 text-emerald-500" />
                                    Buildings ({buildings.filter(b => b.status === 'operational').length})
                                </h3>
                                {buildings.length === 0 ? (
                                    <div className="p-8 border border-slate-800 rounded-xl text-center text-slate-500 bg-slate-900/30">
                                        Planet is undeveloped.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {buildings.map(bldg => {
                                            const def = buildingMap[bldg.buildingId];
                                            if (!def) return null;
                                            return (
                                                <div key={bldg.id} className="p-4 bg-slate-900 border border-slate-700 rounded-xl relative overflow-hidden group">
                                                    <div className={`absolute top-0 right-0 w-16 h-16 -mr-8 -mt-8 rotate-45 ${bldg.status === 'operational' ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`} />
                                                    <div className="flex justify-between items-start relative z-10 mb-3">
                                                        <div>
                                                            <h4 className="font-bold text-slate-200">{def.name}</h4>
                                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mt-0.5">
                                                                <span>Tier {def.tier}</span>
                                                                <span className="w-1 h-1 rounded-full bg-slate-700" />
                                                                <span className={bldg.status === 'operational' ? 'text-emerald-500' : 'text-rose-500'}>
                                                                    {bldg.status}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2 text-xs relative z-10">
                                                        {def.effects.map((effect, idx) => (
                                                            <div key={idx} className={`flex justify-between items-center py-1 ${idx < def.effects.length - 1 ? 'border-b border-slate-800' : ''}`}>
                                                                <span className="text-slate-500 font-medium capitalize">{effect.type.replace(/_/g, ' ')}</span>
                                                                <span className="text-emerald-400 font-bold">+{effect.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    
                                                    {/* Upgrade Option */}
                                                    {(() => {
                                                        const upgradeDef = Object.values(buildingMap).find(d => d.upgradesFrom === def.id);
                                                        if (!upgradeDef) return null;
                                                        
                                                        const canAffordUpgrade = canAfford(upgradeDef.id);
                                                        return (
                                                            <div className="mt-4 pt-3 border-t border-slate-800 relative z-10">
                                                                <button
                                                                    disabled={!canAffordUpgrade || actionLoading}
                                                                    onClick={() => handleQueueBuilding(upgradeDef.id)}
                                                                    className={`w-full py-1.5 rounded text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                                                                        canAffordUpgrade 
                                                                            ? 'bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30' 
                                                                            : 'bg-slate-800/50 text-slate-500 cursor-not-allowed border border-slate-700/50'
                                                                    }`}
                                                                >
                                                                    <ArrowUpCircle className="w-3 h-3" />
                                                                    UPGRADE: {upgradeDef.name}
                                                                </button>
                                                                {!canAffordUpgrade && (
                                                                    <div className="text-[9px] text-center text-red-500 mt-1 uppercase tracking-wider">Insufficient Funds</div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'ORBITAL' && planet && (
                        <OrbitalLayerTab
                            planet={planet}
                            layer={planetLayer}
                            nowSeconds={worldNowSeconds}
                            actionLoading={actionLoading}
                            onDispatch={handleLayerOrder}
                            reserves={{
                                CREDITS: factionCredits,
                                METALS: factionMetals,
                                CHEMICALS: factionChemicals,
                                ENERGY: factionEnergy,
                                RARES: factionRares,
                            }}
                        />
                    )}

                    {activeTab === 'INFRA' && planet && (
                        <InfrastructureTab
                            planet={planet}
                            layer={planetLayer}
                            nowSeconds={worldNowSeconds}
                            actionLoading={actionLoading}
                            onDispatch={handleLayerOrder}
                        />
                    )}

                    {activeTab === 'LOGISTICS' && planet && (
                        <LogisticsTab
                            planet={planet}
                            layer={planetLayer}
                            nowSeconds={worldNowSeconds}
                            actionLoading={actionLoading}
                            onDispatch={handleLayerOrder}
                        />
                    )}

                    {activeTab === 'BUILD' && buildSection === 'SHIPS' && (
                        <div className="space-y-6">
                            {!hasShipyard && (
                                <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-200">
                                    This world has no shipyard. Yards are built in orbit.
                                    <button onClick={() => setActiveTab('ORBITAL')} className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold">Go to Orbital</button>
                                </div>
                            )}
                            <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-4 flex items-center gap-2">
                                <Navigation className="w-4 h-4 text-fuchsia-500" />
                                Civilian Ships
                            </h3>
                            {civNotice && (
                                <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">{civNotice}</div>
                            )}
                            {/* Unarmed ships: each in a fleet of its own, laid down by any yard. */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {CIVILIAN_SHIP_IDS.map(id => {
                                    const def = CIVILIAN_SHIPS[id];
                                    const short = [
                                        { label: 'credits', need: def.cost.CREDITS ?? 0, have: factionCredits },
                                        { label: 'metals', need: def.cost.METALS ?? 0, have: factionMetals },
                                    ].find(n => n.have < n.need);
                                    const realMinutes = Math.round(def.buildSeconds / 15 / 60);
                                    return (
                                        <div key={id} id={`civilian-card-${id}`} className="p-4 bg-slate-900 border border-slate-700 rounded-xl flex flex-col">
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-bold text-slate-200">{def.name}</h4>
                                                <div className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-widest">Unarmed · {realMinutes} min</div>
                                            </div>
                                            <p className="text-xs text-slate-400 mb-4 flex-1">{def.role}</p>
                                            <div className="text-[10px] font-mono text-fuchsia-400 mb-4">
                                                {(def.cost.CREDITS ?? 0).toLocaleString()} Cr / {(def.cost.METALS ?? 0).toLocaleString()} Met
                                            </div>
                                            <button
                                                onClick={() => handleBuildCivilian(id)}
                                                disabled={actionLoading || !!short}
                                                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {short ? `Need ${Math.ceil(short.need - short.have).toLocaleString()} more ${short.label}` : 'LAY DOWN'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase pt-2 flex items-center gap-2">
                                <Shield className="w-4 h-4 text-fuchsia-500" />
                                Warships
                            </h3>
                            {/* The same picker and yard rule as the recruit gate: every hull this yard can lay, standard or your own design. */}
                            <ShipDesignPicker
                                layout="grid"
                                yardAnchor={{ systemId, systemName: storeSystems.find(s => s.id === systemId)?.name ?? systemId, holding: true }}
                                onCommission={(design) => handleCommissionShip(design)}
                            />
                        </div>
                    )}

                    {activeTab === 'BUILD' && buildSection === 'TROOPS' && (
                        <div className="space-y-4">
                            <p className="text-xs text-slate-400">New troops wait in this world's garrison and defend it. Muster them from Forces. Each order is a company of {TROOP_BATCH}.</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {[...TROOP_TYPES, ...(playerCivId === 'civ-infernoid' ? ['ELDER_INFERNOID'] : [])].map(type => {
                                    const cfg = (groundUnits as Record<string, any>)[type];
                                    const count = type === 'ELDER_INFERNOID' ? 1 : TROOP_BATCH;
                                    const credits = (cfg?.cost?.credits ?? 0) * count;
                                    const metals = (cfg?.cost?.metals ?? 0) * count;
                                    const short = credits > factionCredits ? `Need ${Math.ceil(credits - factionCredits).toLocaleString()} credits`
                                        : metals > factionMetals ? `Need ${Math.ceil(metals - factionMetals).toLocaleString()} metals` : null;
                                    return (
                                        <div key={type} className="p-3 rounded-xl border border-slate-700/80 bg-slate-900 flex flex-col gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <UnitIcon type={type} size={24} />
                                                <h4 className="text-sm text-slate-100 font-semibold truncate">{cfg?.name ?? type.replace(/_/g, ' ')}</h4>
                                                <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400 shrink-0" title="Build time, real time">
                                                    <Clock className="w-3 h-3" />{formatSimAsClock((cfg?.buildTime ?? 60) * count)}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 line-clamp-2" title={cfg?.description}>{cfg?.description}</p>
                                            <div className="flex items-center justify-between gap-2 mt-auto">
                                                <span className="text-[11px] font-mono text-slate-300">{credits.toLocaleString()} Cr{metals ? ` · ${metals.toLocaleString()} Met` : ''}</span>
                                                <button disabled={!!short || actionLoading} onClick={() => handleRecruitTroops(type, count)}
                                                    className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-slate-800/80 disabled:text-slate-500 disabled:cursor-not-allowed">
                                                    {short ?? `Recruit ${count}`}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {activeTab === 'SOCIETY' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Demographics Card */}
                                <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-xl">
                                    <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-2 flex items-center gap-2">
                                        <Users className="w-4 h-4 text-blue-400" />
                                        Species Demographics
                                    </h3>
                                    {(() => {
                                        const bands: any[] = planet?.demographics ?? [];
                                        const total = bands.reduce((s, b) => s + (b.percentage ?? 0), 0) || 1;
                                        const diversity = 1 - bands.reduce((s, b) => s + Math.pow((b.percentage ?? 0) / total, 2), 0);
                                        const unfree = bands
                                            .filter(b => b.socialClass === 'Slave' || b.socialClass === 'Servant')
                                            .reduce((s, b) => s + (b.percentage ?? 0), 0);
                                        const label = diversity < 0.15 ? 'Homogeneous'
                                            : diversity < 0.40 ? 'Mixed'
                                            : diversity < 0.60 ? 'Plural' : 'Cosmopolitan';
                                        return (
                                            <div className="flex items-center gap-3 mb-6 text-[10px] uppercase tracking-widest">
                                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">{label}</span>
                                                <span className="text-slate-500">Diversity {(diversity * 100).toFixed(0)}%</span>
                                                {unfree > 0 && (
                                                    <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400">
                                                        {unfree.toFixed(0)}% unfree
                                                    </span>
                                                )}
                                                {planet?.conqueredFrom && (
                                                    <span className="text-slate-600 normal-case tracking-normal italic">
                                                        taken from {planet.conqueredFrom}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    <div className="space-y-4">
                                        {(!planet?.demographics?.length) && (
                                            <p className="text-[11px] text-slate-500 italic">No census on record for this world.</p>
                                        )}
                                        {planet?.demographics?.map((demo: any, idx: number) => (
                                            <div key={idx} className="space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-200">{demo.name}</span>
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter
                                                            ${demo.socialClass === 'Citizen' ? 'bg-emerald-500/20 text-emerald-400' : 
                                                              demo.socialClass === 'Resident' ? 'bg-blue-500/20 text-blue-400' :
                                                              demo.socialClass === 'Servant' ? 'bg-amber-500/20 text-amber-400' :
                                                              'bg-red-500/20 text-red-500'}
                                                        `}>
                                                            {demo.socialClass}
                                                        </span>
                                                    </div>
                                                    <span className="font-mono text-slate-400">{formatPercent(demo.percentage, 1)}</span>
                                                </div>
                                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full transition-all duration-500 ${
                                                            demo.socialClass === 'Citizen' ? 'bg-emerald-500' : 
                                                            demo.socialClass === 'Resident' ? 'bg-blue-500' :
                                                            demo.socialClass === 'Servant' ? 'bg-amber-500' :
                                                            'bg-red-500'
                                                        }`}
                                                        style={{ width: `${demo.percentage}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Stability Card */}
                                <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-xl">
                                    <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-6 flex items-center gap-2">
                                        <Activity className="w-4 h-4 text-cyan-400" />
                                        Control & Stability
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-3 bg-slate-950/50 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                                                <span className="text-sm font-medium text-slate-300">Planetary Stability</span>
                                            </div>
                                            <span className="text-lg font-bold text-emerald-400">{formatPercent(planet?.stability || 0, 3)}</span>
                                        </div>
                                        <div className="space-y-3 px-1">
                                            <div className="flex justify-between text-xs text-slate-500">
                                                <span>Baseline Satisfaction</span>
                                                <span className="text-emerald-500">+80%</span>
                                            </div>
                                            <div className="flex justify-between text-xs text-slate-500">
                                                <span>Unrest Penalty</span>
                                                <span className="text-red-400">-{((planet?.unrest || 0) * 0.5).toFixed(1)}%</span>
                                            </div>
                                            <div className="flex justify-between text-xs text-slate-500">
                                                <span>Infrastructure Support</span>
                                                <span className="text-emerald-500">+{((planet?.infrastructureLevel || 1) * 2).toFixed(1)}%</span>
                                            </div>
                                            {planet?.isOccupied && (
                                                <div className="flex justify-between text-xs text-slate-500">
                                                    <span>Military Occupation</span>
                                                    <span className="text-amber-500">-15.0%</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Ideology Section */}
                            <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-xl">
                                <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-6 flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-indigo-400" />
                                    Ideological Alignment
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                                    {[
                                        { label: 'Hierarchy', val: 75, color: 'text-purple-400' },
                                        { label: 'Centralization', val: 40, color: 'text-blue-400' },
                                        { label: 'Militarism', val: 90, color: 'text-red-400' },
                                        { label: 'Tradition', val: 60, color: 'text-amber-400' },
                                        { label: 'Collectivism', val: 30, color: 'text-emerald-400' },
                                        { label: 'Expansionism', val: 85, color: 'text-sky-400' },
                                        { label: 'Authoritarianism', val: 80, color: 'text-rose-400' }
                                    ].map((axis, idx) => (
                                        <div key={idx} className="flex items-center gap-4">
                                            <div className="w-24 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{axis.label}</div>
                                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden flex items-center justify-center relative">
                                                <div className="absolute left-1/2 w-0.5 h-full bg-slate-700 z-0" />
                                                <div 
                                                    className={`h-full relative z-10 transition-all duration-700 ${axis.color.replace('text-', 'bg-')}`}
                                                    style={{ 
                                                        width: `${Math.abs(axis.val)}%`,
                                                        marginLeft: axis.val < 0 ? 'auto' : '0',
                                                        marginRight: axis.val > 0 ? 'auto' : '0'
                                                    }}
                                                />
                                            </div>
                                            <div className={`w-10 text-right font-mono text-xs font-bold ${axis.color}`}>{axis.val > 0 ? '+' : ''}{axis.val}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-6 flex items-start gap-3 p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-lg">
                                    <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                                    <p className="text-xs text-slate-400 leading-relaxed italic">
                                        Ideological divergence from the Imperial Core increases unrest and slows infrastructure development. Maintain local stability to prevent secessionist movements.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default PlanetConstructionPanel;
