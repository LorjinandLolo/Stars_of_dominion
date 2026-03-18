import { Client, Databases } from 'node-appwrite';
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
    console.log('--- Updating Economy Schema ---');
    const env = loadEnv();
    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const DB_ID = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
    const COLL_FACTIONS = 'factions';

    // Attributes to add
    // last_updated: ISO Timestamp (When resources were last calculated)
    // income_rate: JSON (Cached production values per hour)

    const attributes = [
        { key: 'economy_last_updated', type: 'string', size: 64, required: false },
        { key: 'resources', type: 'string', size: 5000, required: false }, // Large size for complex JSON
        { key: 'income_rates', type: 'string', size: 5000, required: false },
        { key: 'capacities', type: 'string', size: 5000, required: false }
    ];

    for (const attr of attributes) {
        try {
            await db.createStringAttribute(DB_ID, COLL_FACTIONS, attr.key, attr.size, attr.required);
            console.log(`Attribute '${attr.key}' created.`);
            // Wait to avoid rate limits
            await new Promise(r => setTimeout(r, 200));
        } catch (e) {
            if (e.code === 409) {
                console.log(`Attribute '${attr.key}' already exists.`);
            } else {
                console.error(`Error creating attribute '${attr.key}':`, e);
            }
        }
    }

    console.log('Schema update complete.');
}

main().catch(console.error);
