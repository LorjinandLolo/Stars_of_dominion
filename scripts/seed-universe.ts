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
                    // System Schema Alignment: Provide mandatory x and y (from q/r)
                    await databases.createDocument(DB_ID, COLL_SYSTEMS, sys.id, {
                        name: sys.name,
                        x: sys.q, 
                        y: sys.r,
                        q: sys.q,
                        r: sys.r,
                        security: sys.security,
                        tradeValue: sys.tradeValue,
                        regionId: sys.regionId
                    });
                    systemsCreated++;
                }

                // New logic: Check if it's a homeworld for a faction
                const isCapital = sys.tags.includes('capital') || sys.tags.some(t => t.toLowerCase().includes('core'));

                // 2. Determine Planet Count (4 for capitals, 1-4 for others)
                const hash = sys.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                let planetCount = isCapital ? 4 : (hash % 4) + 1;

                // 3. Create Planets
                for (let p = 0; p < planetCount; p++) {
                    const planetId = `planet_${sys.id}_${p}`;
                    
                    // 3.1 Advanced Faction Mapping for ALL 14 Society Homeworlds
                    let ownerId = 'faction-neutral';
                    const sysName = sys.name.toLowerCase();
                    const sysTags = sys.tags.map(t => t.toLowerCase());

                    if (isCapital) {
                        if (sysName.includes("aurelia")) ownerId = 'faction-aurelian';
                        else if (sysName.includes("vektor")) ownerId = 'faction-vektori';
                        else if (sysName.includes("syndicate")) ownerId = 'faction-null-syndicate';
                        else if (sysName.includes("altar") || sysTags.includes('covenant core')) ownerId = 'faction-covenant';
                        else if (sysName.includes("solara") || sysTags.includes('dyson-shell')) ownerId = 'nexulan_convergence';
                        else if (sysName.includes("muun")) ownerId = 'banking_clan';
                        else if (sysName.includes("graviton")) ownerId = 'rhimetal_sovereignty';
                        else if (sysName.includes("meatballia")) ownerId = 'gabagoonian_republic';
                        else if (sysName.includes("pyrothar")) ownerId = 'infernoid_crusade';
                        else if (sysName.includes("rrriiaa")) ownerId = 'movanite_stampede';
                        else if (sysName.includes("aeiralux")) ownerId = 'leopantheri_harmonate';
                        else if (sysName.includes("jabal")) ownerId = 'buthari_council';
                        else if (sysName.includes("gor") && sysName.includes("zhul")) ownerId = 'sarrak_legion';
                        else if (sysName.includes("savarr")) ownerId = 'kaer_ruun_hunt';
                    }

                    // 3.2 Ensure Unique Planet Types for Capital Systems
                    const STARTER_TYPES = ['standard', 'arid', 'oceanic', 'volcanic', 'tundra', 'industrial', 'mining'];
                    let planetType = getRandomType(sys.id, p);
                    if (isCapital) {
                        planetType = STARTER_TYPES[p % STARTER_TYPES.length];
                    }
                    
                    try {
                        await databases.getDocument(DB_ID, COLL_PLANETS, planetId);
                    } catch (e) {
                        // Extended Multiplayer Data (packed into attributes JSON)
                        const isNeutral = ownerId === 'faction-neutral';
                        const garrison = {
                            ownerEmpireId: ownerId,
                            garrisonTroops: isCapital ? 1000 : (isNeutral ? 100 : 500),
                            unitComposition: isCapital
                                ? { INFANTRY: 600, ARMOR: 200, ARTILLERY: 200 }
                                : (isNeutral ? { MILITIA: 100 } : { INFANTRY: 400, MILITIA: 100 }),
                            fortificationLevel: isCapital ? 5 : (isNeutral ? 0 : 2),
                            fortificationLayers: {
                                orbitalSuppressed: false,
                                outerDefenses: isCapital ? 500 : (isNeutral ? 0 : 100),
                                innerDefenses: isCapital ? 250 : 0,
                                commandBunkers: isCapital ? 100 : 0
                            },
                            supply: isCapital ? 5000 : (isNeutral ? 200 : 1000),
                            maxSupply: isCapital ? 5000 : (isNeutral ? 200 : 1000),
                            morale: 100,
                            maxMorale: 100,
                            cohesion: 100,
                            maxCohesion: 100,
                            resistance: isCapital ? 50 : (isNeutral ? 0 : 10),
                            stability: isCapital ? 100 : 80,
                            infrastructureIntegrity: 100,
                            militiaAvailable: true,
                            occupationProgress: 0,
                            isUnderSiege: false
                        };
                        
                        await databases.createDocument(DB_ID, COLL_PLANETS, planetId, {
                            name: `${sys.name} ${SUFFIXES[p] || p + 1}`,
                            x: sys.q, // Mandatory
                            y: sys.r, // Mandatory
                            type: planetType, // Mandatory
                            owner_faction_id: ownerId, // Map ownerId to schema field
                            attributes: JSON.stringify({
                                systemId: sys.id,
                                ownerId: ownerId, // Duplicate for backward compat
                                planetType: planetType, // Duplicate for backward compat
                                population: isCapital ? 25.0 : (Math.random() * 5 + 0.5),
                                stability: isCapital ? 100 : (70 + Math.random() * 30),
                                unrest: 0,
                                garrison: garrison
                            })
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
