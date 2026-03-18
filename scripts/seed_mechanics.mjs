import fs from 'node:fs';
import path from 'node:path';
import { Client, Databases, ID, Query } from 'node-appwrite';

const envPath = path.resolve(process.cwd(), '.env.local');
const jsonPath = path.resolve(process.cwd(), 'Alpha - September 18, 2025.json');

// --- Helpers ---
function loadEnv() {
    if (!fs.existsSync(envPath)) {
        console.error('.env.local not found!');
        process.exit(1);
    }
    const content = fs.readFileSync(envPath, 'utf-8');
    const env = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            env[key] = value;
        }
    });
    return env;
}

// --- Main ---
async function main() {
    console.log('--- Seeding Game Mechanics ---');
    const env = loadEnv();

    // Init Appwrite
    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const DB_ID = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
    const COLL_PLANETS = 'planets';
    const COLL_FACTIONS = 'factions';
    const COLL_ARMIES = 'armies';

    // 1. Load JSON Data
    console.log('Reading JSON...');
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const data = JSON.parse(raw);

    // Get Systems (map to Planets)
    const systems = Object.values(data.system || {});
    console.log(`Found ${systems.length} systems to import as planets.`);

    // 2. Import Planets
    let importedPlanets = [];
    const existingPlanets = await db.listDocuments(DB_ID, COLL_PLANETS, [Query.limit(100)]);

    // Quick check to avoid double import if db isn't empty
    // (Ideally we'd check by ID, but IDs might be different if generated)
    // We'll trust the process or just upsert?
    // For now: Clean slate or Append?
    // Let's just create if not exists by name/location check could be slow.
    // Simpler: Just try to import 10-20 for testing if empty.

    if (existingPlanets.total === 0) {
        console.log('Importing systems...');
        for (const sys of systems) {
            // Only import if it has coords
            if (typeof sys.x !== 'number' || typeof sys.y !== 'number') continue;

            const planetData = {
                name: sys.name,
                x: sys.x,
                y: sys.y,
                type: 'system',
                resource_yield: JSON.stringify({ economic: 10, military: 2 }), // Default yield
                owner_faction_id: null
            };

            try {
                const doc = await db.createDocument(DB_ID, COLL_PLANETS, ID.unique(), planetData);
                importedPlanets.push(doc);
            } catch (e) {
                console.error(`Failed to import ${sys.name}:`, e.message);
            }
        }
        console.log(`Imported ${importedPlanets.length} planets.`);
    } else {
        console.log('Planets already exist. Skipping import.');
        importedPlanets = existingPlanets.documents;
    }

    if (importedPlanets.length === 0) {
        console.log('No planets available. Exiting.');
        return;
    }

    // 3. Create Factions
    const factionData = [
        { name: 'Terran Dominion', desc: 'The ruling body of the sector.', alignment: 'dominant' },
        { name: 'Free Systems Alliance', desc: 'A loose coalition of rebels.', alignment: 'rebel' }
    ];

    const existingFactions = await db.listDocuments(DB_ID, COLL_FACTIONS);
    let factions = existingFactions.documents;

    // Filter out existing by name to avoid duplicates if we just need to add one
    const needed = factionData.filter(d => !factions.find(f => f.name === d.name));

    if (needed.length > 0) {
        console.log(`Creating ${needed.length} missing factions...`);
        for (const f of needed) {
            const doc = await db.createDocument(DB_ID, COLL_FACTIONS, ID.unique(), {
                name: f.name,
                resources: JSON.stringify({ economic: 500, military: 100 }),
                traits: JSON.stringify({})
            });
            factions.push(doc);
        }
    } else {
        console.log('All factions already exist.');
    }

    // 4. Assign Home Planets
    console.log('Assigning (random) home planets...');
    for (const faction of factions) {
        if (!faction.home_planet_id) {
            // Pick random planet that isn't owned? Or just any?
            // Ideally unowned.
            const unowned = importedPlanets.filter(p => !p.owner_faction_id);
            const p = unowned.length > 0
                ? unowned[Math.floor(Math.random() * unowned.length)]
                : importedPlanets[Math.floor(Math.random() * importedPlanets.length)];

            await db.updateDocument(DB_ID, COLL_FACTIONS, faction.$id, {
                home_planet_id: p.$id
            });

            await db.updateDocument(DB_ID, COLL_PLANETS, p.$id, {
                owner_faction_id: faction.$id
            });
            console.log(`Assigned ${p.name} to ${faction.name}`);
        }
    }

    // 5. Spawn Armies
    const existingArmies = await db.listDocuments(DB_ID, COLL_ARMIES);
    if (existingArmies.total === 0) {
        console.log('Spawning initial armies...');
        for (const faction of factions) {
            // Get home planet
            // We need to fetch faction again to get updated home_planet_id if we just set it
            // or just rely on logic. existing faction obj is stale.
            const updatedFaction = await db.getDocument(DB_ID, COLL_FACTIONS, faction.$id);

            if (updatedFaction.home_planet_id) {
                // Fetch planet to get coords
                const homePlanet = await db.getDocument(DB_ID, COLL_PLANETS, updatedFaction.home_planet_id);

                await db.createDocument(DB_ID, COLL_ARMIES, ID.unique(), {
                    faction_id: faction.$id,
                    location_planet_id: updatedFaction.home_planet_id,
                    x: homePlanet.x,
                    y: homePlanet.y,
                    units: JSON.stringify({ infantry: 1000, tanks: 50 }),
                    status: 'idle'
                });
                console.log(`Spawned army for ${faction.name} at home.`);
            }
        }
    }

    console.log('Seeding complete.');
}

main().catch(console.error);
