import { useEffect, useState, useRef } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { appwriteClient, databases } from '@/lib/appwrite-client';
import { deserializeWorld, injectFactionShard, recordsToMaps } from '@/lib/persistence/save-service';
import type { GameWorldState } from '@/lib/game-world-state';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_SESSIONS = 'multiplayer_sessions';
const COLL_FACTIONS = 'game_factions';
const SESSION_DOC_ID = 'default-session';

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

        const planetList = Array.from(world.construction.planets.values());
        let fleetList = Array.from(world.movement.fleets.values());
        
        // Visibility / Fog-of-War
        const visibility = playerFactionId 
            ? world.movement.factionVisibility.get(playerFactionId) || {}
            : null;

        if (playerFactionId && visibility) {
            fleetList = fleetList.filter(f => {
                if (f.factionId === playerFactionId) return true;
                const sysId = f.currentSystemId || f.destinationSystemId;
                if (!sysId) return false;
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

        // Atomic Batch Update
        useUIStore.setState({
            systems: systemList,
            planets: planetList,
            fleets: fleetList,
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

    // ─── Initial Fetch + Real-Time Subscriptions ──────────────────────────────
    useEffect(() => {
        let unsubSession: (() => void) | null = null;
        let unsubFactions: (() => void) | null = null;
        let retryTimeout: NodeJS.Timeout | null = null;

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

        const initSync = async (attempt = 0) => {
            try {
                if (attempt === 0) setIsLoading(true);
                console.log(`[GameSync] Full sync attempt ${attempt + 1}...`);

                // 1. Parallel Load: Session + All Faction Shards
                const [sessionDoc, factionDocs] = await Promise.all([
                    databases.getDocument(DB_ID, COLL_SESSIONS, SESSION_DOC_ID),
                    databases.listDocuments(DB_ID, COLL_FACTIONS)
                ]);

                // 2. Initialize Authoritative World (Async worker)
                const baseWorld = await deserializeWorldAsync(sessionDoc.snapshot);
                worldRef.current = baseWorld;

                // 3. Inject Shards and Populate Cache (Async worker)
                await Promise.all(
                    factionDocs.documents.map(async (fDoc: any) => {
                        if (fDoc.data) {
                            try {
                                const shardObj = JSON.parse(fDoc.data);
                                const mapped = await deserializeShardAsync(fDoc.data);
                                shardCacheRef.current.set(fDoc.$id, shardObj);
                                mappedShardCacheRef.current.set(fDoc.$id, mapped);
                            } catch (e) {
                                console.warn(`[GameSync] Failed to deserialize shard ${fDoc.$id}:`, e);
                            }
                        }
                    })
                );

                // Apply all shards to world
                mappedShardCacheRef.current.forEach(mapped => injectMappedShard(baseWorld, mapped));
                throttledUpdate();
                setRetryCount(0);

                // 4. Subscribe: Multiplayer Session (The Clock)
                const sessionChannel = `databases.${DB_ID}.collections.${COLL_SESSIONS}.documents.${SESSION_DOC_ID}`;
                unsubSession = appwriteClient.subscribe(sessionChannel, async (response) => {
                    if (response.events.some(e => e.includes('.update'))) {
                        const payload = response.payload as any;
                        if (payload.snapshot) {
                            try {
                                const newBase = await deserializeWorldAsync(payload.snapshot);
                                // Re-inject cached MAPPED shards into new base snapshot (Zero re-parsing cost!)
                                mappedShardCacheRef.current.forEach(mapped => injectMappedShard(newBase, mapped));
                                worldRef.current = newBase;
                                throttledUpdate();
                            } catch (e) {
                                console.warn('[GameSync] Failed to parse updated session snapshot:', e);
                            }
                        }
                    }
                });

                // 5. Subscribe: Faction Shards (The Details)
                const factionChannel = `databases.${DB_ID}.collections.${COLL_FACTIONS}.documents`;
                unsubFactions = appwriteClient.subscribe(factionChannel, async (response) => {
                    if (response.events.some(e => e.includes('.update') || e.includes('.create'))) {
                        const shardDoc = response.payload as any;
                        if (shardDoc.data && worldRef.current) {
                            try {
                                const shardObj = JSON.parse(shardDoc.data);
                                const mapped = await deserializeShardAsync(shardDoc.data);
                                shardCacheRef.current.set(shardDoc.$id, shardObj);
                                mappedShardCacheRef.current.set(shardDoc.$id, mapped);
                                injectMappedShard(worldRef.current, mapped);
                                throttledUpdate();
                            } catch (e) {
                                console.warn(`[GameSync] Failed to parse updated faction shard ${shardDoc.$id}:`, e);
                            }
                        }
                    }
                });

            } catch (err: any) {
                console.warn(`[GameSync] Sync attempt ${attempt + 1} failed:`, err.message);
                if (attempt < 5) {
                    const delay = Math.pow(2, attempt) * 1000;
                    retryTimeout = setTimeout(() => initSync(attempt + 1), delay);
                } else {
                    setError("Connection lost.");
                    setIsLoading(false);
                }
            }
        };

        if (playerFactionId) {
            initSync();
        }

        return () => {
            if (unsubSession) unsubSession();
            if (unsubFactions) unsubFactions();
            if (retryTimeout) clearTimeout(retryTimeout);
        };
    }, [playerFactionId, retryCount]);

    return { isLoading, error };
}
