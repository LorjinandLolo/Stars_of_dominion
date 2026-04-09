import { useEffect, useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { appwriteClient, databases } from '@/lib/appwrite-client';
import { deserializeWorld } from '@/lib/persistence/save-service';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_SESSIONS = 'multiplayer_sessions';
const SESSION_DOC_ID = 'default-session';

export function useGameSync() {
    const setFleets = useUIStore(s => s.setFleets);
    const setPlanets = useUIStore(s => s.setPlanets);
    const setSystems = useUIStore(s => s.setSystems);
    const setSystemContested = useUIStore(s => s.setSystemContested);
    const setNowSeconds = useUIStore(s => s.setNowSeconds);
    const setFactionVisibility = useUIStore(s => s.setFactionVisibility);
    const updateEmpireIdentity = useUIStore(s => s.updateEmpireIdentity);
    const playerFactionId = useUIStore(s => s.playerFactionId);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    // Initial Fetch + WebSocket Subscription Setup
    useEffect(() => {
        let unsubscribe: (() => void) | null = null;
        let retryTimeout: NodeJS.Timeout | null = null;

        const syncSnapshot = async (snapshotJson: string) => {
             try {
                 // 1. Use the core deserializer to handle our Map-based storage format
                 const world = deserializeWorld(snapshotJson);

                 // 2. Fetch and Merge Shards (if they exist)
                 try {
                     const factionDocs = await databases.listDocuments(DB_ID, 'game_factions');
                     
                     // Helper to check if string is JSON before parsing
                     const safeParse = (str: string) => {
                         try { return JSON.parse(str); } catch { return null; }
                     };

                     factionDocs.documents.forEach((fDoc: any) => {
                         const shardData = safeParse(fDoc.data);
                         if (!shardData) return;
                         
                         // Note: Shards themselves might be serialized with mapsToRecords
                         // but serializeWorld/deserializeWorld handles the root.
                         // For now we assume shards are standard records as per extractFactionShard.
                         
                         if (shardData.fleets) {
                             shardData.fleets.forEach((f: any) => world.movement.fleets.set(f.id, f));
                         }
                         if (shardData.economy && shardData.factionId) {
                             world.economy.factions.set(shardData.factionId, shardData.economy);
                         }
                         if (shardData.tech && shardData.factionId) {
                             world.tech.set(shardData.factionId, shardData.tech);
                         }
                     });
                 } catch (err) {
                     console.warn('[GameSync] Failed to fetch shards, UI may use session base.');
                 }
                 
                 // 3. Convert MAPS to ARRAYS/RECORDS for the Zustand UI Store
                 const systemList = Array.from(world.movement.systems.values()).map(sys => ({
                    ...sys,
                    // Ensure mandatory UI fields are satisfied even if optional in simulation
                    escalationLevel: sys.escalationLevel ?? 0,
                    security: sys.security ?? 50,
                    tradeValue: sys.tradeValue ?? 0
                 }));
                 setSystems(systemList);

                 const planetList = Array.from(world.construction.planets.values());
                 setPlanets(planetList);

                 let fleetList = Array.from(world.movement.fleets.values());
                 
                 // Map Fog-of-War / Visibility
                 const visibility = playerFactionId 
                    ? world.movement.factionVisibility.get(playerFactionId) || null
                    : null;

                 if (playerFactionId && visibility) {
                     fleetList = fleetList.filter(f => {
                         if (f.factionId === playerFactionId) return true;
                         const sysId = f.currentSystemId || f.destinationSystemId;
                         if (!sysId) return false;
                         const entry = visibility[sysId];
                         return entry && (entry.revealStage === 'scanned' || entry.revealStage === 'surveyed');
                     });
                     setFactionVisibility(visibility);
                 }

                 setFleets(fleetList);
                 setNowSeconds(world.nowSeconds);
                 
                 // Pillar 1: Diplomacy
                 useUIStore.getState().updateDiplomacy({
                     rivalries: Array.from(world.rivalries.values()),
                     treaties: Array.from(world.treaties.values()),
                     tradePacts: Array.from(world.tradePacts.values()),
                     tributes: Array.from(world.tributes.values()),
                     proxyConflicts: Array.from(world.proxyConflicts.values())
                 });

                 // Pillar 3: Economy (Live Factions)
                 const factionMap: Record<string, any> = {};
                 world.economy.factions.forEach((f, id) => factionMap[id] = f);
                 
                 useUIStore.getState().setFactions(factionMap);
                 useUIStore.getState().updatePolitics({
                     allFactions: Object.values(factionMap)
                 });

                 // Pillar 4: Tech
                 if (playerFactionId) {
                     const pTech = world.tech.get(playerFactionId);
                     if (pTech) useUIStore.getState().updateTech(pTech);
                 }

                 // Recalculate contested status
                 const systemGroups: Record<string, string[]> = {};
                 planetList.forEach(p => {
                     if (!systemGroups[p.systemId]) systemGroups[p.systemId] = [];
                     if (p.ownerId) systemGroups[p.systemId].push(p.ownerId);
                 });
                 Object.entries(systemGroups).forEach(([sysId, owners]) => {
                     const uniqueOwners = new Set(owners);
                     setSystemContested(sysId, uniqueOwners.size > 1);
                 });

                 setIsLoading(false);
                 setError(null);
                 setRetryCount(0);
             } catch(err) {
                 console.error('[GameSync] Critical parse error:', err);
             }
        };

        const initSync = async (attempt = 0) => {
             try {
                 if (attempt === 0) setIsLoading(true);
                 
                 console.log(`[GameSync] Initialization attempt ${attempt + 1}...`);

                 // 1. Initial Load via HTTP
                 const doc: any = await databases.getDocument(DB_ID, COLL_SESSIONS, SESSION_DOC_ID);
                 if (doc && doc.snapshot) {
                     await syncSnapshot(doc.snapshot);
                 }

                 // 2. Subscribe to WebSocket events
                 const channel = `databases.${DB_ID}.collections.${COLL_SESSIONS}.documents.${SESSION_DOC_ID}`;
                 unsubscribe = appwriteClient.subscribe(channel, (response) => {
                     if (response.events.includes('databases.*.collections.*.documents.*.update')) {
                         const payload = response.payload as any;
                         if (payload.snapshot) {
                             syncSnapshot(payload.snapshot);
                         }
                     }
                 });

             } catch (err: any) {
                 console.warn(`[GameSync] Attempt ${attempt + 1} failed:`, err.message);
                 
                 if (attempt < 5) {
                     const delay = Math.pow(2, attempt) * 1000;
                     retryTimeout = setTimeout(() => initSync(attempt + 1), delay);
                 } else {
                     setError("Establishing connection to Sector Core failed. Signal lost.");
                     setIsLoading(false);
                 }
             }
        };

        if (playerFactionId) {
            initSync();
        }

        return () => {
            if (unsubscribe) unsubscribe();
            if (retryTimeout) clearTimeout(retryTimeout);
        };

    }, [playerFactionId, setFleets, setNowSeconds, setFactionVisibility, updateEmpireIdentity, retryCount]);

    return { isLoading, error };
}
