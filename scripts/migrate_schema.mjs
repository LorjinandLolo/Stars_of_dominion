import { Client, Databases, ID, Query } from 'node-appwrite';
import fs from 'node:fs';
import path from 'node:path';

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

async function main() {
    console.log('--- Migrating Armies Schema ---');
    const env = loadEnv();
    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const DB_ID = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
    const COLL_ARMIES = 'armies';
    const COLL_PLANETS = 'planets';

    // 1. Add Attributes
    console.log('Adding x and y attributes to armies...');
    try {
        await db.createIntegerAttribute(DB_ID, COLL_ARMIES, 'x', false); // false = not required (yet)
        console.log('Added x attribute (async).');
    } catch (e) {
        console.log('x attribute might already exist:', e.message);
    }

    try {
        await db.createIntegerAttribute(DB_ID, COLL_ARMIES, 'y', false);
        console.log('Added y attribute (async).');
    } catch (e) {
        console.log('y attribute might already exist:', e.message);
    }

    // Wait a bit for attributes to be created if this is first run
    console.log('Waiting 5s for schema update...');
    await new Promise(r => setTimeout(r, 5000));

    // 2. Backfill Data
    console.log('Backfilling existing armies...');
    const armies = await db.listDocuments(DB_ID, COLL_ARMIES);
    const planets = await db.listDocuments(DB_ID, COLL_PLANETS, [Query.limit(100)]);

    for (const army of armies.documents) {
        if (typeof army.x === 'undefined' || army.x === null) {
            if (army.location_planet_id) {
                const planet = planets.documents.find(p => p.$id === army.location_planet_id);
                if (planet) {
                    console.log(`Updating Army ${army.$id} to ${planet.x}, ${planet.y}`);
                    await db.updateDocument(DB_ID, COLL_ARMIES, army.$id, {
                        x: planet.x,
                        y: planet.y
                    });
                }
            }
        }
    }
    console.log('Migration complete.');
}

main().catch(console.error);
