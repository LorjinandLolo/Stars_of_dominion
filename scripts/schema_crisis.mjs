import { Client, Databases, ID } from 'node-appwrite';
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
    console.log('--- Creating Crisis Schema ---');
    const env = loadEnv();
    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const DB_ID = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
    const COLL_CRISES = 'crises';

    // 1. Create Collection
    try {
        await db.createCollection(DB_ID, COLL_CRISES, 'Crises');
        console.log('Collection created.');
    } catch (e) {
        if (e.code === 409) {
            console.log('Collection already exists.');
        } else {
            console.error('Error creating collection:', e);
            return;
        }
    }

    // 2. Create Attributes
    // type: 'orbital_bombardment', 'invasion', 'sabotage'
    // attacker_id: Faction ID
    // defender_id: Faction ID
    // target_id: Planet/Fleet ID
    // status: 'active', 'resolved'
    // deadline: ISO Timestamp
    // attacker_commitment: JSON (units committed)
    // attacker_strategy: String (Hidden)
    // defender_response: String (Selected by defender)
    // resolution_result: JSON (Outcome)

    const attributes = [
        { key: 'type', type: 'string', size: 64, required: true },
        { key: 'attacker_id', type: 'string', size: 36, required: true },
        { key: 'defender_id', type: 'string', size: 36, required: true },
        { key: 'target_id', type: 'string', size: 36, required: true },
        { key: 'status', type: 'string', size: 32, required: true }, // active, resolved
        { key: 'deadline', type: 'string', size: 64, required: true }, // ISO Date
        { key: 'attacker_commitment', type: 'string', size: 5000, required: false }, // JSON
        { key: 'attacker_strategy', type: 'string', size: 255, required: false }, // Hidden strategy
        { key: 'defender_response', type: 'string', size: 255, required: false }, // Null initially
        { key: 'resolution_result', type: 'string', size: 5000, required: false } // JSON output
    ];

    for (const attr of attributes) {
        try {
            await db.createStringAttribute(DB_ID, COLL_CRISES, attr.key, attr.size, attr.required);
            console.log(`Attribute '${attr.key}' created.`);
            // Wait a bit to avoid rate limits / race conditions
            await new Promise(r => setTimeout(r, 200));
        } catch (e) {
            if (e.code === 409) {
                console.log(`Attribute '${attr.key}' already exists.`);
            } else {
                console.error(`Error creating attribute '${attr.key}':`, e);
            }
        }
    }

    console.log('Schema setup complete.');
}

main().catch(console.error);
