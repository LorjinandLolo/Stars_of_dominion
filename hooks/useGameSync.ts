import { useEffect, useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { appwriteClient, databases } from '@/lib/appwrite-client';

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
                 const data = JSON.parse(snapshotJson);

                 // Phase 4: Fetch and Merge Shards
                 try {
                     const factionDocs = await databases.listDocuments(DB_ID, 'game_factions');
                     
                     if (!data.movement) data.movement = { fleets: {} };
                     if (!data.movement.fleets) data.movement.fleets = {};
                     if (!data.economy) data.economy = { factions: {} };
                     if (!data.economy.factions) data.economy.factions = {};
                     if (!data.tech) data.tech = {};
                     if (!data.espionage) data.espionage = { agents: {}, intelNetworks: {} };
                     if (!data.espionage.agents) data.espionage.agents = {};
                     if (!data.espionage.intelNetworks) data.espionage.intelNetworks = {};

                     factionDocs.documents.forEach((fDoc: any) => {
                         const shard = JSON.parse(fDoc.data);
                         if (shard.fleets) shard.fleets.forEach((f: any) => data.movement.fleets[f.id] = f);
                         if (shard.economy) data.economy.factions[shard.factionId] = shard.economy;
                         if (shard.tech) data.tech[shard.factionId] = shard.tech;
                         if (shard.espionageAgents) shard.espionageAgents.forEach((a: any) => data.espionage.agents[a.id] = a);
                         if (shard.intelNetworks) shard.intelNetworks.forEach((n: any) => data.espionage.intelNetworks[n.id] = n);
                     });
                 } catch (err) {
                     console.warn('[GameSync] Failed to fetch shards, UI may be incomplete.');
                 }
                 
                 if (data.movement?.fleets) {
                     let parsedFleets = Array.from(Object.values(data.movement.fleets)) as any[];
                     const visibility = playerFactionId && data.movement.factionVisibility 
                         ? data.movement.factionVisibility[playerFactionId] 
                         : null;

                     if (playerFactionId && visibility) {
                         parsedFleets = parsedFleets.filter(f => {
                             if (f.factionId === playerFactionId) return true;
                             const sysId = f.currentSystemId || f.destinationSystemId;
                             if (!sysId) return false;
                             const entry = visibility[sysId];
                             return entry && (entry.revealStage === 'scanned' || entry.revealStage === 'surveyed');
                         });
                     }
                     setFleets(parsedFleets);
                     if (visibility) setFactionVisibility(visibility);
                 }

                 if (data.nowSeconds !== undefined) setNowSeconds(data.nowSeconds);
                 
                 // Pillar 1: Diplomacy & Rivalry
                 if (data.rivalries) {
                     const rivalryArray = Array.from(Object.values(data.rivalries));
                     useUIStore.getState().updateDiplomacy({
                         rivalries: rivalryArray as any,
                         treaties: data.treaties ? Array.from(Object.values(data.treaties)) : [],
                         tradePacts: data.tradePacts ? Array.from(Object.values(data.tradePacts)) : [],
                         tributes: data.tributes ? Array.from(Object.values(data.tributes)) : [],
                         proxyConflicts: data.proxyConflicts ? Array.from(Object.values(data.proxyConflicts)) : []
                     });
                 }

                 // Pillar 2: Intelligence & Espionage
                 if (data.espionage) {
                     useUIStore.getState().updateEspionage(data.espionage);
                 }

                 // Pillar 3: Economy (Live Factions)
                 if (data.economy?.factions) {
                     const factionList = Array.from(Object.values(data.economy.factions));
                     useUIStore.getState().updatePolitics({
                         allFactions: factionList
                     });
                     useUIStore.getState().setFactions(data.economy.factions);
                 }

                 // Pillar 4: Tech
                 if (data.tech && playerFactionId) {
                     const pTech = data.tech[playerFactionId];
                     if (pTech) useUIStore.getState().updateTech(pTech);
                 }

                 // Pillar 5: Press & Media
                 if (data.press) {
                     useUIStore.getState().updatePress(data.press);
                 }

                 // Pillar 6: Construction & Planets (Multi-Planet Sync)
                 if (data.construction?.planets) {
                     const planetList = Array.from(Object.values(data.construction.planets)) as any[];
                     setPlanets(planetList);

                     // Recalculate contested status for each system based on planetary ownership
                     const systemGroups: Record<string, string[]> = {};
                     planetList.forEach(p => {
                         if (!systemGroups[p.systemId]) systemGroups[p.systemId] = [];
                         if (p.ownerId) systemGroups[p.systemId].push(p.ownerId);
                     });

                     Object.entries(systemGroups).forEach(([sysId, owners]) => {
                         const uniqueOwners = new Set(owners);
                         setSystemContested(sysId, uniqueOwners.size > 1);
                     });
                 }

                 // Pillar 7: Systems & Movement Structure
                 if (data.movement?.systems) {
                     const systemList = Array.from(Object.values(data.movement.systems)) as any[];
                     setSystems(systemList);
                 }

                 if (data.leadership) {
                     updateEmpireIdentity({
                         leadership: {
                             ...data.leadership,
                             leaders: new Map(Object.entries(data.leadership.leaders || {}))
                         }
                     });
                 }
                 setIsLoading(false);
                 setError(null);
                 setRetryCount(0); // Success! Reset retries.
             } catch(err) {
                 console.error('Failed to parse realtime sync payload', err);
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
