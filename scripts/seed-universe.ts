import { Client, Databases, ID, Query } from 'node-appwrite';
import dotenv from 'dotenv';
import path from 'path';
import { mockSystems } from '../lib/ui-mock-data';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_SYSTEMS = 'systems';
const COLL_PLANETS = 'planets';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '')
    .setKey(process.env.APPWRITE_API_KEY || '');

const databases = new Databases(client);

async function seedUniverse() {
    console.log(`[Seeder] Starting Universe Seed: ${mockSystems.length} systems found in mock data.`);

    try {
        // 1. Verify collections exist by listing one doc
        await databases.listDocuments(DB_ID, COLL_SYSTEMS, [Query.limit(1)]);
        console.log('✅ Systems collection verified.');
    } catch (e: any) {
        console.error('❌ Systems collection missing or not ready. Run init-multiplayer.ts first.');
        process.exit(1);
    }

    let systemsCreated = 0;
    let planetsCreated = 0;

    // Batch systems to avoid hitting Appwrite rate limits too hard
    const BATCH_SIZE = 10;
    for (let i = 0; i < mockSystems.length; i += BATCH_SIZE) {
        const batch = mockSystems.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (sys) => {
            try {
                // Check if system already exists
                try {
                    await databases.getDocument(DB_ID, COLL_SYSTEMS, sys.id);
                    // console.log(`ℹ️ System ${sys.name} already exists.`);
                } catch (e) {
                    // Create System
                    await databases.createDocument(DB_ID, COLL_SYSTEMS, sys.id, {
                        name: sys.name,
                        q: sys.q,
                        r: sys.r,
                        security: sys.security,
                        tradeValue: sys.tradeValue,
                        regionId: sys.regionId
                    });
                    systemsCreated++;

                    // Create a "Prime" planet for every system
                    const planetId = `planet_${sys.id}`;
                    try {
                        await databases.createDocument(DB_ID, COLL_PLANETS, planetId, {
                            name: `${sys.name} Prime`,
                            systemId: sys.id,
                            ownerId: 'faction-neutral',
                            planetType: 'standard',
                            population: 1.0
                        });
                        planetsCreated++;
                    } catch (e) { /* planet exists */ }
                }
            } catch (err: any) {
                console.error(`Error processing ${sys.name}:`, err.message);
            }
        }));

        console.log(`[Seeder] Processed ${Math.min(i + BATCH_SIZE, mockSystems.length)} / ${mockSystems.length} systems...`);
    }

    console.log(`\n========= ✅ SEEDING COMPLETE =========`);
    console.log(`Systems Created: ${systemsCreated}`);
    console.log(`Planets Created: ${planetsCreated}`);
    console.log(`Universe is now authoritative in Appwrite.`);
}

seedUniverse();
