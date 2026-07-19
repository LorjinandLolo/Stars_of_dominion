import { useEffect, useState, useRef } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { deserializeWorld, injectFactionShard, recordsToMaps } from '@/lib/persistence/save-service';
import { applyPendingOrderOverlays } from '@/lib/multiplayer/optimistic';
import { useNotificationStore } from '@/lib/notifications/notification-store';
import type { GameWorldState } from '@/lib/game-world-state';

// A pending order dispatched more than this long before a snapshot arrived is
// assumed to be reflected in that snapshot (worker polls every 5s + margin).
const PENDING_CONFIRM_LAG_MS = 8000;

// Polling cadence against /api/game/sync. The worker ticks every 5s and only
// writes when something changed, so 4s keeps latency invisible while idle
// polls return a few bytes (since-filtered on the server).
const POLL_INTERVAL_MS = 4000;

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
        
        requestAnimationFrame(() => {
            updateStoreFromWorld();
            updatePendingRef.current = false;
        });
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
        const diplomacyState = {
            ...useUIStore.getState().diplomacyState,
            rivalries: Array.from(world.rivalries.values()),
            treaties: Array.from(world.treaties.values()),
            tradePacts: Array.from(world.tradePacts.values()),
            tributes: Array.from(world.tributes.values()),
            proxyConflicts: Array.from(world.proxyConflicts.values())
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

        const politicsState = {
            ...useUIStore.getState().politicsState,
            allFactions: Object.values(factionMap)
        };

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
            contestedSystemIds
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
