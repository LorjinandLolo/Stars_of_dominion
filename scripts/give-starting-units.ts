import { Client, Databases, Query, ID } from 'node-appwrite';
import dotenv from 'dotenv';
import path from 'path';
import { Fleet } from '../lib/movement/types';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_PLANETS = 'planets';
const COLL_FLEETS = 'game_fleets';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '')
    .setKey(process.env.APPWRITE_API_KEY || '');

const databases = new Databases(client);

async function run() {
    console.log('[Script] Updating planets with 5 unit garrisons...');
    let offset = 0;
    const limit = 50;
    let totalPlanets = 0;
    
    // We will collect one planet per faction to spawn a fleet there
    const factionHomeworlds = new Map<string, string>(); // factionId -> systemId

    while (true) {
        const res = await databases.listDocuments(DB_ID, COLL_PLANETS, [
            Query.limit(limit),
            Query.offset(offset)
        ]);

        if (res.documents.length === 0) break;

        for (const doc of res.documents) {
            let attrs = {};
            try {
                attrs = JSON.parse(doc.attributes || '{}');
            } catch (e) {}

            // Give a 5 unit garrison (5 * 800 infantry = 4000)
            const newGarrison = {
                ownerEmpireId: doc.ownerId,
                garrisonTroops: 4000,
                unitComposition: { INFANTRY: 4000 },
                isUnderSiege: false,
                supply: 100, maxSupply: 100,
                morale: 100, maxMorale: 100,
                cohesion: 100, maxCohesion: 100
            };

            await databases.updateDocument(DB_ID, COLL_PLANETS, doc.$id, {
                attributes: JSON.stringify({
                    ...attrs,
                    garrison: newGarrison
                })
            });
            
            if (doc.ownerId && doc.ownerId !== 'faction-neutral') {
                if (!factionHomeworlds.has(doc.ownerId)) {
                    factionHomeworlds.set(doc.ownerId, doc.systemId);
                }
            }
            
            totalPlanets++;
        }
        
        offset += limit;
    }
    console.log(`✅ Updated ${totalPlanets} planets.`);

    console.log('[Script] Creating 2 ships per faction...');
    for (const [factionId, systemId] of factionHomeworlds.entries()) {
        const fleet: Fleet = {
            id: `fleet_${factionId}_1`,
            factionId,
            name: `1st Defense Flotilla`,
            currentSystemId: systemId,
            destinationSystemId: null,
            activeLayer: null,
            transitProgress: 0,
            etaSeconds: 0,
            plannedPath: [],
            orders: [],
            doctrine: {
                type: 'Defensive',
                deviationFromPosture: 0,
                preferredLayers: ['hyperlane'],
                retreatThreshold: 0.5,
                logisticsStrain: 0,
                moraleDrift: 0,
                supplyLevel: 1
            },
            postureId: 'Consolidating',
            strength: 1,
            basePower: 100,
            composition: { ARMOR: 80 }, // Representing ships
            hyperdriveProfile: {
                hyperlane: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 },
                trade: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 },
                corridor: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 },
                gate: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 },
                deepSpace: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 },
            },
            isDetectable: true
        };

        // Try to update or create the fleet document
        try {
            // Because game_fleets is one document per faction
            // Check if document exists
            const existing = await databases.listDocuments(DB_ID, COLL_FLEETS, [
                Query.equal('factionId', factionId)
            ]);
            
            if (existing.documents.length > 0) {
                await databases.updateDocument(DB_ID, COLL_FLEETS, existing.documents[0].$id, {
                    data: JSON.stringify([fleet])
                });
            } else {
                await databases.createDocument(DB_ID, COLL_FLEETS, ID.unique(), {
                    factionId,
                    data: JSON.stringify([fleet])
                });
            }
        } catch (e: any) {
            console.error(`Error adding fleet for ${factionId}:`, e.message);
        }
    }
    
    console.log(`✅ Fleets deployed for ${factionHomeworlds.size} factions.`);
    console.log('Done!');
}

run().catch(console.error);
