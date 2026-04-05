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

const PLANET_TYPES = ['standard', 'arid', 'oceanic', 'volcanic', 'barren', 'gas_giant', 'moon', 'tundra'];
const SUFFIXES = ['Prime', 'II', 'III', 'IV', 'V'];

function getRandomType(systemId: string, index: number) {
    // Simple deterministic type based on IDs
    const types = PLANET_TYPES;
    const charCodeSum = systemId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return types[(charCodeSum + index) % types.length];
}

async function seedUniverse() {
    console.log(`[Seeder] Starting Universe Seed: ${mockSystems.length} systems.`);

    try {
        await databases.listDocuments(DB_ID, COLL_SYSTEMS, [Query.limit(1)]);
    } catch (e: any) {
        console.error('❌ Systems collection missing. Run init-multiplayer.ts first.');
        process.exit(1);
    }

    let systemsCreated = 0;
    let planetsCreated = 0;

    const BATCH_SIZE = 5; // Smaller batch for stability
    for (let i = 0; i < mockSystems.length; i += BATCH_SIZE) {
        const batch = mockSystems.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (sys) => {
            try {
                // 1. Ensure System Exists
                try {
                    await databases.getDocument(DB_ID, COLL_SYSTEMS, sys.id);
                } catch (e) {
                    await databases.createDocument(DB_ID, COLL_SYSTEMS, sys.id, {
                        name: sys.name,
                        q: sys.q,
                        r: sys.r,
                        security: sys.security,
                        tradeValue: sys.tradeValue,
                        regionId: sys.regionId
                    });
                    systemsCreated++;
                }

                // 2. Determine Planet Count (1-4)
                // Deterministic count based on systemId hash
                const hash = sys.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                const planetCount = (hash % 4) + 1;

                // 3. Create Planets
                for (let p = 0; p < planetCount; p++) {
                    const planetId = `planet_${sys.id}_${p}`;
                    const planetType = getRandomType(sys.id, p);
                    
                    // Determine initial owner
                    let ownerId = 'faction-neutral';
                    if (sys.tags.includes('capital') || sys.tags.some(t => t.toLowerCase().includes('core'))) {
                        if (sys.tags.some(t => t.includes('Hegemony'))) ownerId = 'faction-aurelian';
                        else if (sys.tags.some(t => t.includes('Vektori'))) ownerId = 'faction-vektori';
                        else if (sys.tags.some(t => t.includes('Syndicate'))) ownerId = 'faction-null-syndicate';
                        else if (sys.tags.some(t => t.includes('Covenant'))) ownerId = 'faction-covenant';
                    }

                    try {
                        await databases.getDocument(DB_ID, COLL_PLANETS, planetId);
                    } catch (e) {
                        await databases.createDocument(DB_ID, COLL_PLANETS, planetId, {
                            name: `${sys.name} ${SUFFIXES[p] || p + 1}`,
                            systemId: sys.id,
                            ownerId: ownerId,
                            planetType: planetType,
                            population: Math.random() * 5 + 0.5,
                            stability: 70 + Math.random() * 30,
                            unrest: Math.random() * 20
                        });
                        planetsCreated++;
                    }
                }
            } catch (err: any) {
                console.error(`Error processing ${sys.name}:`, err.message);
            }
        }));

        console.log(`[Seeder] Processed ${Math.min(i + BATCH_SIZE, mockSystems.length)} systems...`);
    }

    console.log(`\n========= ✅ SEEDING COMPLETE =========`);
    console.log(`Systems Processed: ${mockSystems.length}`);
    console.log(`Planets Created: ${planetsCreated}`);
}

seedUniverse();
