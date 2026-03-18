import fs from 'node:fs';
import path from 'node:path';
import { Client, Databases, ID } from 'node-appwrite';

const envPath = path.resolve(process.cwd(), '.env.local');

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

async function importMap() {
    const env = loadEnv();
    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const dbId = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
    const collId = 'planets';

    const mapFile = process.argv[2] || 'Alpha - September 18, 2025.json';
    console.log(`Reading map from ${mapFile}...`);

    const raw = fs.readFileSync(path.resolve(process.cwd(), mapFile), 'utf-8');
    const data = JSON.parse(raw);

    // Flatten the structure
    // The JSON has keys like "asteroidBase", "asteroidBelt", "blackHole", "deepSpaceStation", "gasGiant", "moon", "planet", "sector", "star", "system"
    // We want to import "system", "blackHole" as top level nodes on the map?
    // Or maybe everything?
    // The "system" entries have x, y coordinates.
    // "blackHole" entries have x, y coordinates.
    // "sector" entries have x, y coordinates.
    // Other things like "planet", "moon" seem to be children of systems (they have "parent" attribute).
    // For the Galaxy Map, we primarily need the top-level nodes (Systems, Black Holes).
    // Let's import Systems and Black Holes first.

    const entities = [];

    if (data.system) {
        Object.entries(data.system).forEach(([id, val]) => {
            if (val.x !== undefined && val.y !== undefined) {
                entities.push({
                    originalId: id,
                    name: val.name,
                    x: val.x,
                    y: val.y,
                    type: 'system',
                    attributes: JSON.stringify(val.attributes || {})
                });
            }
        });
    }

    if (data.blackHole) {
        Object.entries(data.blackHole).forEach(([id, val]) => {
            if (val.x !== undefined && val.y !== undefined) {
                entities.push({
                    originalId: id,
                    name: val.name,
                    x: val.x,
                    y: val.y,
                    type: 'blackHole',
                    attributes: JSON.stringify(val.attributes || {})
                });
            }
        });
    }

    console.log(`Found ${entities.length} entities to import.`);

    for (const ent of entities) {
        try {
            await db.createDocument(dbId, collId, ID.unique(), {
                name: ent.name,
                x: ent.x,
                y: ent.y,
                type: ent.type,
                attributes: ent.attributes
            });
            console.log(`Imported ${ent.name} (${ent.type})`);
        } catch (e) {
            console.error(`Failed to import ${ent.name}: ${e.message}`);
        }
        // Sleep to avoid rate limits
        await new Promise(r => setTimeout(r, 100));
    }
}

importMap();
