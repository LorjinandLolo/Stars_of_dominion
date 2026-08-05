import { useEffect, useState, useRef } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { deserializeWorld, injectFactionShard, recordsToMaps, normalizeEspionageState } from '@/lib/persistence/save-service';
import { applyPendingOrderOverlays } from '@/lib/multiplayer/optimistic';
import { useNotificationStore } from '@/lib/notifications/notification-store';
import type { GameWorldState } from '@/lib/game-world-state';
import type { Region, RegionStatus, MarketTicker } from '@/types/ui-state';
// Pure module (types only) — safe on the client, unlike the fs-backed services.
import { getDominantIdeologyType } from '@/lib/politics/ideology-service';

// A pending order dispatched more than this long before a snapshot arrived is
// assumed to be reflected in that snapshot (worker polls every 5s + margin).
const PENDING_CONFIRM_LAG_MS = 8000;

// Polling cadence against /api/game/sync. The worker ticks every 5s and only
// writes when something changed, so 4s keeps latency invisible while idle
// polls return a few bytes (since-filtered on the server).
const POLL_INTERVAL_MS = 4000;

// Cabinet seat labels. Mirrors PORTFOLIO_LABEL in lib/government/cabinet-service,
// which is worker-side (fs registries) and cannot be imported on the client.
const PORTFOLIO_LABELS: Record<string, string> = {
    defence: 'Defence',
    economy: 'Economy',
    science: 'Science',
    intelligence: 'Intelligence',
    interior: 'Interior',
    foreign: 'Foreign Affairs',
};

export function useGameSync() {
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    const worldRef = useRef<GameWorldState | null>(null);
    const shardCacheRef = useRef<Map<string, any>>(new Map());
    const mappedShardCacheRef = useRef<Map<string, any>>(new Map());
    const updatePendingRef = useRef(false);

    const workerRef = useRef<Worker | null>(null);
    const pendingRequestsRef = useRef<Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>>(new Map());
    const msgIdRef = useRef(0);

    // Initialize Web Worker
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                const worker = new Worker('/workers/game-sync.worker.js');
                worker.onmessage = (e) => {
                    const { id, success, result, error } = e.data;
                    const pending = pendingRequestsRef.current.get(id);
                    if (pending) {
                        pendingRequestsRef.current.delete(id);
                        if (success) {
                            pending.resolve(result);
                        } else {
                            pending.reject(new Error(error));
                        }
                    }
                };
                workerRef.current = worker;
            } catch (err) {
                console.warn('[GameSync] Failed to initialize Web Worker, falling back to sync execution:', err);
            }
        }

        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);

    const deserializeWorldAsync = (snapshot: string): Promise<GameWorldState> => {
        const worker = workerRef.current;
        if (!worker) {
            return Promise.resolve(deserializeWorld(snapshot));
        }
        const id = ++msgIdRef.current;
        return new Promise((resolve, reject) => {
            pendingRequestsRef.current.set(id, { resolve, reject });
            worker.postMessage({ id, type: 'DESERIALIZE_WORLD', payload: snapshot });
        });
    };

    const deserializeShardAsync = (shardJson: string): Promise<any> => {
        const worker = workerRef.current;
        if (!worker) {
            return Promise.resolve(recordsToMaps(JSON.parse(shardJson)));
        }
        const id = ++msgIdRef.current;
        return new Promise((resolve, reject) => {
            pendingRequestsRef.current.set(id, { resolve, reject });
            worker.postMessage({ id, type: 'DESERIALIZE_SHARD', payload: shardJson });
        });
    };

    // Safety net: if snapshots stop arriving (worker down, socket dead), don't
    // leave ghost overlays on screen forever — expire pendings after 45s.
    useEffect(() => {
        const interval = setInterval(() => {
            const { pendingOrders, prunePendingOrders } = useUIStore.getState();
            if (pendingOrders.length > 0) {
                prunePendingOrders(Date.now() - 45_000);
            }
        }, 10_000);
        return () => clearInterval(interval);
    }, []);

    // ─── Throttled Update Engine ──────────────────────────────────────────────
    const throttledUpdate = () => {
        if (updatePendingRef.current) return;
        updatePendingRef.current = true;

        // rAF aligns store rebuilds with paint, but background/hidden tabs
        // never fire rAF — without a timer fallback the store froze at its
        // defaults until the tab was next composited.
        let ran = false;
        const run = () => {
            if (ran) return;
            ran = true;
            updateStoreFromWorld();
            updatePendingRef.current = false;
        };
        requestAnimationFrame(run);
        setTimeout(run, 250);
    };

    const updateStoreFromWorld = () => {
        const world = worldRef.current;
        if (!world) return;

        // 1. Convert MAPS to ARRAYS/RECORDS for the Zustand UI Store
        const systemList = Array.from(world.movement.systems.values()).map(sys => ({
            ...sys,
            // Systems store their owner as `ownerFactionId`; the map layer reads `ownerId`.
            // Normalise so ownership actually renders on the galaxy map.
            ownerId: (sys as any).ownerFactionId ?? (sys as any).ownerId ?? null,
            escalationLevel: sys.escalationLevel ?? 0,
            security: sys.security ?? 50,
            tradeValue: sys.tradeValue ?? 0
        }));

        let planetList = Array.from(world.construction.planets.values());
        let fleetList = Array.from(world.movement.fleets.values());
        
        // Visibility / Fog-of-War
        const visibility = playerFactionId 
            ? world.movement.factionVisibility.get(playerFactionId) || {}
            : null;

        // Systems where I physically have a fleet: everything there is visible
        // to me regardless of scan level — you can always see who's parked next
        // to you. (Without this, two fleets meeting in an unscanned system were
        // mutually invisible and could never engage.)
        const myPresenceSystems = new Set(
            fleetList
                .filter(f => f.factionId === playerFactionId && f.currentSystemId)
                .map(f => f.currentSystemId as string)
        );

        if (playerFactionId && visibility) {
            fleetList = fleetList.filter(f => {
                if (f.factionId === playerFactionId) return true;
                const sysId = f.currentSystemId || f.destinationSystemId;
                if (!sysId) return false;
                if (f.currentSystemId && myPresenceSystems.has(f.currentSystemId)) return true;
                const entry = visibility[sysId];
                return entry && (entry.revealStage === 'scanned' || entry.revealStage === 'surveyed');
            });
        }

        // Active fleet combats — the Battle Command panel reads these from the
        // store, but they were never synced, so the war room always showed
        // "no active engagements" even mid-battle.
        const combatList = Array.from(((world as any).activeCombats?.values?.() || [])) as any[];
        const myCombats = playerFactionId
            ? combatList.filter((c: any) =>
                c?.attacker?.factionId === playerFactionId || c?.defender?.factionId === playerFactionId)
            : combatList;

        // Armies (ground forces). Same visibility rules as fleets.
        let armyList = Array.from(((world.movement as any).armies?.values?.() || [])) as any[];
        if (playerFactionId && visibility) {
            armyList = armyList.filter((a: any) => {
                if (a.factionId === playerFactionId) return true;
                const sysId = a.currentSystemId;
                if (!sysId) return false;
                if (myPresenceSystems.has(sysId)) return true;
                const entry = visibility[sysId];
                return entry && (entry.revealStage === 'scanned' || entry.revealStage === 'surveyed');
            });
        }

        // Diplomacy
        // Offers are private between the two parties — only surface the ones
        // involving the local player. Pending first, then newest.
        const myOffers = Array.from(((world as any).diplomacy?.offers?.values?.() ?? []) as Iterable<any>)
            .filter(o => o.fromFactionId === playerFactionId || o.toFactionId === playerFactionId)
            .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1)
                || b.createdAtSeconds - a.createdAtSeconds);
        // Gambits: the initiator's prediction stays secret from the target
        // until the confrontation resolves.
        const myGambits = Array.from(((world as any).diplomacy?.gambits?.values?.() ?? []) as Iterable<any>)
            .filter(g => g.initiatorId === playerFactionId || g.targetId === playerFactionId)
            .map(g => (g.initiatorId === playerFactionId || g.status !== 'pending') ? g : { ...g, prediction: undefined })
            .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1)
                || b.createdAtSeconds - a.createdAtSeconds);
        const myLeverage: Record<string, number> = {};
        for (const [key, pts] of (((world as any).diplomacy?.leverage?.entries?.() ?? []) as Iterable<[string, number]>)) {
            if (playerFactionId && key.split('|').includes(playerFactionId)) myLeverage[key] = pts;
        }
        const diplomacyState = {
            ...useUIStore.getState().diplomacyState,
            rivalries: Array.from(world.rivalries.values()),
            treaties: Array.from(world.treaties.values()),
            tradePacts: Array.from(world.tradePacts.values()),
            tributes: Array.from(world.tributes.values()),
            proxyConflicts: Array.from(world.proxyConflicts.values()),
            offers: myOffers,
            gambits: myGambits,
            leverage: myLeverage,
            mandate: playerFactionId
                ? ((world as any).diplomacy?.mandates?.get?.(playerFactionId) ?? null)
                : null,
            sanctions: Array.from(((world as any).diplomacy?.sanctions?.values?.() ?? []) as Iterable<any>)
                .filter(s => s.imposerId === playerFactionId || s.targetId === playerFactionId),
            promises: Array.from(((world as any).diplomacy?.promises?.values?.() ?? []) as Iterable<any>)
                .filter(p => p.promiserId === playerFactionId || p.beneficiaryId === playerFactionId)
                .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1)
                    || b.madeAtSeconds - a.madeAtSeconds),
            interventions: Array.from(((world as any).diplomacy?.interventions?.values?.() ?? []) as Iterable<any>)
                .sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1)
                    || b.openedAtSeconds - a.openedAtSeconds)
        };

        // Economy
        const factionMap: Record<string, any> = {};
        world.economy.factions.forEach((f, id) => factionMap[id] = f);

        // Surface asynchronous order failures reported by the game-loop worker.
        // The worker stamps a reason on the faction's economy record (rides the
        // faction shard); the notification store dedupes by id, so each distinct
        // failure fires exactly once even though this runs on every snapshot.
        if (playerFactionId) {
            const failure = factionMap[playerFactionId]?.lastOrderError;
            if (failure?.id && failure?.reason) {
                useNotificationStore.getState().addNotification({
                    id: failure.id,
                    factionId: playerFactionId,
                    category: 'system',
                    priority: 'urgent',
                    title: 'Order Failed',
                    body: failure.reason,
                    createdAt: failure.at ?? new Date().toISOString(),
                    read: false,
                });
            }
        }

        const playerPosture = playerFactionId ? world.movement.empirePostures.get(playerFactionId) : undefined;
        // Government Phase 1: the worker owns world.government; mirror the
        // player's slice so the panel shows live approval/capital.
        const playerGov = playerFactionId
            ? (world as any).government?.get?.(playerFactionId)
            : undefined;
        const headOfState = playerGov?.headOfStateId
            ? (world as any).leadership?.leaders?.get?.(playerGov.headOfStateId)
            : undefined;
        const headOfStateSnapshot = headOfState
            ? {
                  id: headOfState.id,
                  name: headOfState.name,
                  title: headOfState.title ?? 'Head of State',
                  age: Math.round(headOfState.age ?? 0),
                  health: Math.round(headOfState.health ?? 100),
                  popularity: Math.round(headOfState.popularity ?? 50),
                  politicalSkill: Math.round(headOfState.politicalSkill ?? 50),
                  traits: headOfState.traits ?? [],
                  // Sim clock: leaders age half a year per sim day (Phase 2).
                  yearsInOffice: headOfState.tookOfficeAtSeconds
                      ? Math.max(0, Math.round(((world.nowSeconds ?? 0) - headOfState.tookOfficeAtSeconds) / 86400 * 0.5))
                      : 0,
              }
            : undefined;
        const politicsState = {
            ...useUIStore.getState().politicsState,
            allFactions: Object.values(factionMap),
            blocs: (playerPosture as any)?.blocs?.map((b: any) => ({
                id: b.id, name: b.name, influence: b.influence,
                satisfaction: b.satisfaction, trend: b.trend ?? 0,
            })) ?? useUIStore.getState().politicsState.blocs,
            government: playerGov
                ? {
                      headOfState: headOfStateSnapshot,
                      cabinet: Object.entries(playerGov.cabinet ?? {})
                          .map(([portfolio, leaderId]) => {
                              const minister = leaderId
                                  ? (world as any).leadership?.leaders?.get?.(leaderId)
                                  : undefined;
                              if (!minister) return null;
                              return {
                                  portfolio,
                                  portfolioLabel: PORTFOLIO_LABELS[portfolio] ?? portfolio,
                                  id: minister.id,
                                  name: minister.name,
                                  competence: Math.round(minister.competence ?? 50),
                                  loyalty: Math.round(minister.loyalty ?? 50),
                                  corruption: Math.round(minister.corruption ?? 0),
                                  ambitionDrive: Math.round(minister.ambitionDrive ?? 50),
                                  traits: minister.traits ?? [],
                              };
                          })
                          .filter((m): m is NonNullable<typeof m> => m !== null),
                      cabinetAdvice: playerGov.cabinetAdvice ?? [],
                      parties: playerGov.parties ?? [],
                      bills: playerGov.bills ?? [],
                      ideology: (playerPosture as any)?.ideology
                          ? {
                                label: getDominantIdeologyType((playerPosture as any).ideology),
                                axes: { ...(playerPosture as any).ideology },
                            }
                          : undefined,
                      coupPressure: playerGov.coupPressure ?? 0,
                      ambitions: (playerGov.ambitions ?? []).map((a: any) => ({
                          id: a.id,
                          name: a.name,
                          description: a.description,
                          progress: a.progress ?? 0,
                          completed: Boolean(a.completed),
                          prestige: a.prestige ?? 0,
                      })),
                      legacy: {
                          prestige: playerGov.legacy?.prestige ?? 0,
                          completed: playerGov.legacy?.completed ?? [],
                          bonuses: playerGov.legacy?.bonuses ?? {},
                          chronicle: playerGov.legacy?.chronicle ?? [],
                      },
                      governmentId: playerGov.governmentId,
                      institutionName: playerGov.institutionName ?? 'Executive Council',
                      tags: playerGov.tags ?? [],
                      approval: playerGov.approval ?? 50,
                      legitimacy: playerGov.legitimacy ?? 50,
                      politicalCapital: playerGov.politicalCapital ?? 0,
                      politicalCapitalCap: playerGov.politicalCapitalCap ?? 100,
                      corruption: playerGov.corruption ?? 0,
                      senatePower: playerGov.senatePower ?? 0,
                      executivePower: playerGov.executivePower ?? 0,
                      activePolicies: playerGov.activePolicies ?? [],
                      history: playerGov.history ?? [],
                  }
                : useUIStore.getState().politicsState.government,
            activePolicies: playerGov?.activePolicies
                ?? useUIStore.getState().politicsState.activePolicies,
            shared: {
                warFatigue: world.shared?.warFatigue ?? 0,
                stability: world.shared?.stability ?? 1,
                tradeEfficiency: world.shared?.tradeEfficiency ?? 1,
                publicTrust: playerFactionId
                    ? ((world as any).press?.empires?.get?.(playerFactionId)?.publicTrust ?? 60)
                    : 60,
            }
        };

        // Press — the worker owns world.press; mirror it into the store so
        // PressPanel's crises/stories/tools render live data (previously the
        // store default was never updated and the panel showed nothing).
        const pressWorld = (world as any).press;
        const pressState = pressWorld ? {
            ...useUIStore.getState().pressState,
            tick: pressWorld.tick ?? 0,
            empires: pressWorld.empires instanceof Map ? pressWorld.empires : new Map(),
            planets: pressWorld.planets instanceof Map ? pressWorld.planets : new Map(),
            pressFactions: pressWorld.pressFactions instanceof Map ? pressWorld.pressFactions : new Map(),
            activeStories: pressWorld.activeStories instanceof Map ? pressWorld.activeStories : new Map(),
            publishedStories: Array.isArray(pressWorld.publishedStories) ? pressWorld.publishedStories : [],
            crises: pressWorld.crises instanceof Map ? pressWorld.crises : new Map(),
            investigations: pressWorld.investigations instanceof Map ? pressWorld.investigations : new Map(),
            campaigns: pressWorld.campaigns instanceof Map ? pressWorld.campaigns : new Map(),
            quarantinedPlanets: pressWorld.quarantinedPlanets instanceof Set ? pressWorld.quarantinedPlanets : new Set(),
            jammedSystems: pressWorld.jammedSystems instanceof Set ? pressWorld.jammedSystems : new Set(),
            counterNarratives: pressWorld.counterNarratives instanceof Map ? pressWorld.counterNarratives : new Map(),
        } : useUIStore.getState().pressState;

        // Tech
        const pTech = playerFactionId ? world.tech.get(playerFactionId) : undefined;
        const techState = pTech ? {
            ...useUIStore.getState().techState,
            ...pTech
        } : useUIStore.getState().techState;

        // Contested Systems
        const systemGroups: Record<string, string[]> = {};
        planetList.forEach(p => {
            if (!systemGroups[p.systemId]) systemGroups[p.systemId] = [];
            if (p.ownerId) systemGroups[p.systemId].push(p.ownerId);
        });
        
        const contestedSystemIds = new Set<string>();
        Object.entries(systemGroups).forEach(([sysId, owners]) => {
            const uniqueOwners = new Set(owners);
            if (uniqueOwners.size > 1) contestedSystemIds.add(sysId);
        });

        // Re-apply optimistic overlays for still-pending orders. Without this,
        // every authoritative rebuild would clobber the instant feedback and the
        // UI would rubber-band (fleet arrow appears → snaps back → reappears).
        const pendingOrders = useUIStore.getState().pendingOrders;
        if (pendingOrders.length > 0) {
            const overlaid = applyPendingOrderOverlays(
                { fleets: fleetList, planets: planetList },
                pendingOrders
            );
            fleetList = overlaid.fleets;
            planetList = overlaid.planets;
        }

        // Economy: galactic market tickers + regional trade state simulated by
        // the worker. Previously never synced, so EconomyPanel and the Policy
        // Bureau resource list always rendered empty.
        const marketTickers: MarketTicker[] = Array.from(world.economy.markets?.values?.() || []).map((m: any) => ({
            resource: m.resource,
            currentPrice: Math.round(m.currentPrice * 100) / 100,
            basePrice: m.basePrice,
            supply: Math.round(m.supply),
            demand: Math.round(m.demand),
        }));
        const corpWorld = (world as any).corporate;
        const companySnapshots = corpWorld?.companies
            ? Array.from(corpWorld.companies.values() as Iterable<any>).map((c: any) => ({
                id: c.id,
                fullName: c.charter?.fullName ?? c.id,
                foundingFactionId: c.foundingFactionId,
                sharePrice: c.sharePrice,
                sharePricePrev: c.sharePricePrev ?? c.sharePrice,
                sharesOutstanding: c.sharesOutstanding,
                treasury: c.treasury,
                dividendsPaidTotal: c.dividendsPaidTotal,
                privateFleetSize: c.privateFleetSize,
                autonomyLevel: c.autonomyLevel,
                corruptionIndex: c.corruptionIndex,
                activeTradeRouteIds: c.activeTradeRouteIds ?? [],
                monopolySystemsCount: new Set(Object.values(c.monopolyRights ?? {}).flat()).size,
                corporateColoniesCount: (c.corporateColonies ?? []).length,
                powers: c.charter?.powers ?? [],
            }))
            : [];
        const playerCorpState = playerFactionId ? corpWorld?.factionStates?.get?.(playerFactionId) : null;
        const playerPortfolioValue = playerCorpState
            ? Object.entries(playerCorpState.companySharesOwned ?? {}).reduce((sum, [cid, shares]) => {
                const c = corpWorld.companies.get(cid);
                return sum + (c ? (shares as number) * c.sharePrice : 0);
            }, 0)
            : 0;
        const corporateState = {
            companies: companySnapshots,
            markets: marketTickers,
            playerPortfolioValue,
            totalDividendsReceived: playerCorpState?.totalDividendsReceived ?? 0,
        };

        const stageColors: Record<string, string> = {
            stable: '#22c55e', strained: '#f59e0b', critical: '#f97316', collapsing: '#ef4444',
        };
        const stageStatus: Record<string, RegionStatus> = {
            stable: 'stable', strained: 'emerging', critical: 'dissolving', collapsing: 'dissolving',
        };
        const flowEdges = Array.from(world.economy.tradeFlowEdges?.values?.() || []) as any[];
        const regionList: Region[] = Array.from(world.economy.regions?.values?.() || []).map((r: any) => {
            const volume = flowEdges
                .filter(e => r.systemIds.includes(e.fromSystemId) || r.systemIds.includes(e.toSystemId))
                .reduce((s, e) => s + Object.values(e.flowPerHour || {}).reduce((a: number, v: any) => a + (v || 0), 0), 0);
            return {
                id: r.id,
                name: r.name,
                systemIds: r.systemIds,
                status: stageStatus[r.collapseStage] ?? 'stable',
                color: stageColors[r.collapseStage] ?? '#22c55e',
                metrics: {
                    stabilityIndex: Math.round((1 - (r.collapsePressure ?? 0)) * 100),
                    tradeVolume: Math.round(volume),
                    pirateShare: 0,
                    escalationAvg: 0,
                    dominantIdeology: 'mercantile',
                    institutionalInfluence: 50,
                    strengthScore: Math.round((r.tradeEfficiency ?? 1) * 100),
                },
            };
        });

        // Espionage: player-scoped slices of the synced world. Candidates are a
        // client-side concern (recruit pool fetched on demand) — preserve them.
        const espWorld = world.espionage;
        const espionageState = {
            agents: playerFactionId
                ? Array.from(espWorld.agents.values()).filter(a => a.ownerFactionId === playerFactionId)
                : Array.from(espWorld.agents.values()),
            networks: playerFactionId
                ? Array.from(espWorld.intelNetworks.values()).filter(n => n.ownerFactionId === playerFactionId)
                : Array.from(espWorld.intelNetworks.values()),
            operations: playerFactionId
                ? Array.from(espWorld.operations.values()).filter(op => op.actorFactionId === playerFactionId)
                : Array.from(espWorld.operations.values()),
            candidates: useUIStore.getState().espionageState.candidates,
            exposureRisk: Math.round((world.shared?.espionagePressure ?? 0) * 100),
            intel: playerFactionId ? (espWorld.factionIntel.get(playerFactionId) ?? null) : null,
            reports: (playerFactionId
                ? Array.from(espWorld.reports.values()).filter(r => r.ownerFactionId === playerFactionId)
                : Array.from(espWorld.reports.values())
            ).sort((a, b) => b.createdAt - a.createdAt),
            board: (playerFactionId
                ? Array.from(espWorld.boardOpportunities.values()).filter(o => o.ownerFactionId === playerFactionId)
                : Array.from(espWorld.boardOpportunities.values())
            ).sort((a, b) => a.expiresAt - b.expiresAt),
        };

        // Atomic Batch Update
        useUIStore.setState({
            systems: systemList,
            planets: planetList,
            fleets: fleetList,
            armies: armyList,
            activeCombats: myCombats as any,
            forwardBases: Array.from((world.movement as any).forwardBases?.values?.() || []),
            nowSeconds: world.nowSeconds,
            factionVisibility: visibility,
            diplomacyState,
            factions: factionMap,
            politicsState,
            techState,
            contestedSystemIds,
            espionageState,
            corporateState,
            pressState,
            regions: regionList,
            // Prisoners of war held across the empire (and by others) — the
            // ledger lives in the session snapshot, not a faction shard.
            prisoners: ((world as any).combat?.prisoners?.groups ?? []) as any,
        });

        setIsLoading(false);
        setError(null);
    };

    // ─── Initial Fetch + Polling Sync ─────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        let pollTimer: NodeJS.Timeout | null = null;
        let retryTimeout: NodeJS.Timeout | null = null;
        let pollInFlight = false;
        let pollFailures = 0;
        // Server-side change filters: only session/shards newer than these are sent.
        let sessionSince = '';
        let shardsSince = '';

        const injectMappedShard = (world: GameWorldState, mappedShard: any) => {
            if (!mappedShard) return;
            if (mappedShard.fleets) {
                mappedShard.fleets.forEach((f: any) => world.movement.fleets.set(f.id, f));
            }
            if (mappedShard.economy) world.economy.factions.set(mappedShard.factionId, mappedShard.economy);
            if (mappedShard.tech) world.tech.set(mappedShard.factionId, mappedShard.tech);
            if (mappedShard.espionageAgents) {
                mappedShard.espionageAgents.forEach((a: any) => world.espionage.agents.set(a.id, a));
            }
            if (mappedShard.intelNetworks) {
                mappedShard.intelNetworks.forEach((n: any) => world.espionage.intelNetworks.set(n.id, n));
            }
            if (mappedShard.espionageFactionIntel) {
                world.espionage.factionIntel.set(mappedShard.factionId, mappedShard.espionageFactionIntel);
            }
            if (mappedShard.espionageOperations) {
                mappedShard.espionageOperations.forEach((op: any) => world.espionage.operations.set(op.id, op));
            }
            if (mappedShard.espionageReports) {
                mappedShard.espionageReports.forEach((r: any) => world.espionage.reports.set(r.id, r));
            }
            if (mappedShard.espionageBoard) {
                mappedShard.espionageBoard.forEach((o: any) => world.espionage.boardOpportunities.set(o.id, o));
            }
            if (mappedShard.recruitmentJobs) {
                if (!world.combat) world.combat = { recruitmentJobs: [] };
                const existingIds = new Set(world.combat.recruitmentJobs.map(j => j.id));
                mappedShard.recruitmentJobs.forEach((j: any) => {
                    if (!existingIds.has(j.id)) world.combat.recruitmentJobs.push(j);
                });
            }
        };

        /** Parse a shard row from /api/game/sync, cache it, inject into a world. */
        const applyShardDoc = async (row: { id: string; data: string }, world: GameWorldState | null) => {
            if (!row.data) return;
            try {
                const shardObj = JSON.parse(row.data);
                const mapped = await deserializeShardAsync(row.data);
                shardCacheRef.current.set(row.id, shardObj);
                mappedShardCacheRef.current.set(row.id, mapped);
                if (world) injectMappedShard(world, mapped);
            } catch (e) {
                console.warn(`[GameSync] Failed to deserialize shard ${row.id}:`, e);
            }
        };

        const fetchSync = async (withSince: boolean) => {
            const params = withSince
                ? `?sessionSince=${encodeURIComponent(sessionSince)}&shardsSince=${encodeURIComponent(shardsSince)}`
                : '';
            const res = await fetch(`/api/game/sync${params}`, { cache: 'no-store' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.error || `Sync failed (${res.status})`);
            }
            return res.json();
        };

        const bumpShardsSince = (rows: Array<{ updatedAt: string }>) => {
            for (const row of rows) {
                if (row.updatedAt > shardsSince) shardsSince = row.updatedAt;
            }
        };

        const initSync = async (attempt = 0) => {
            try {
                if (attempt === 0) setIsLoading(true);
                console.log(`[GameSync] Full sync attempt ${attempt + 1}...`);

                // 1. Full load: session snapshot + all faction shards
                const data = await fetchSync(false);
                if (cancelled) return;

                // 2. Initialize Authoritative World (Async worker)
                const baseWorld = await deserializeWorldAsync(data.session.snapshot);
                // Worker path bypasses save-service deserializeWorld — normalize here.
                normalizeEspionageState(baseWorld);
                worldRef.current = baseWorld;
                sessionSince = data.session.updatedAt;

                // 3. Inject Shards and Populate Cache (Async worker)
                await Promise.all(data.factions.map((row: any) => applyShardDoc(row, null)));
                bumpShardsSince(data.factions);

                // Apply all shards to world
                mappedShardCacheRef.current.forEach(mapped => injectMappedShard(baseWorld, mapped));
                throttledUpdate();
                setRetryCount(0);

                // 4. Poll for changes (replaces the Appwrite realtime channels)
                pollTimer = setInterval(poll, POLL_INTERVAL_MS);

            } catch (err: any) {
                console.warn(`[GameSync] Sync attempt ${attempt + 1} failed:`, err.message);
                if (cancelled) return;
                if (attempt < 5) {
                    const delay = Math.pow(2, attempt) * 1000;
                    retryTimeout = setTimeout(() => initSync(attempt + 1), delay);
                } else {
                    setError("Connection lost.");
                    setIsLoading(false);
                }
            }
        };

        const poll = async () => {
            if (pollInFlight || cancelled) return;
            pollInFlight = true;
            try {
                const data = await fetchSync(true);
                if (cancelled) return;
                pollFailures = 0;

                // Updated session snapshot → rebuild the authoritative world.
                if (data.session?.snapshot) {
                    const newBase = await deserializeWorldAsync(data.session.snapshot);
                    normalizeEspionageState(newBase);
                    // Re-inject cached MAPPED shards into new base snapshot (zero re-parsing cost)
                    mappedShardCacheRef.current.forEach(mapped => injectMappedShard(newBase, mapped));
                    worldRef.current = newBase;
                    sessionSince = data.session.updatedAt;

                    // Confirm optimistic orders: anything dispatched comfortably
                    // before this snapshot was produced is now reflected
                    // authoritatively — drop its overlay.
                    useUIStore.getState().prunePendingOrders(Date.now() - PENDING_CONFIRM_LAG_MS);
                    throttledUpdate();
                } else if (data.sessionUpdatedAt) {
                    sessionSince = data.sessionUpdatedAt;
                }

                // Updated faction shards → inject into the current world.
                if (data.factions?.length) {
                    for (const row of data.factions) {
                        await applyShardDoc(row, worldRef.current);
                    }
                    bumpShardsSince(data.factions);
                    throttledUpdate();
                }

                setError(null);
            } catch (err: any) {
                pollFailures++;
                console.warn(`[GameSync] Poll failed (${pollFailures}):`, err.message);
                if (pollFailures >= 5) setError("Connection lost.");
            } finally {
                pollInFlight = false;
            }
        };

        if (playerFactionId) {
            initSync();
        }

        return () => {
            cancelled = true;
            if (pollTimer) clearInterval(pollTimer);
            if (retryTimeout) clearTimeout(retryTimeout);
        };
    }, [playerFactionId, retryCount]);

    return { isLoading, error };
}
