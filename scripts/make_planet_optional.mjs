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
    console.log('--- Migrating Armies Schema (Make Optional) ---');
    const env = loadEnv();
    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const DB_ID = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
    const COLL_ARMIES = 'armies';

    console.log('Updating location_planet_id to be optional...');
    try {
        // updateStringAttribute(databaseId, collectionId, key, required, default, xfer, size)
        // size for an ID is usually 36 (UUID) or 20 (Appwrite ID). Let's assume 255 to be safe or check existing.
        // Appwrite ID is 20 chars. 
        // We'll try to just update the 'required' flag.
        await db.updateStringAttribute(DB_ID, COLL_ARMIES, 'location_planet_id', false, null);
        console.log('Success: Attribute updated.');
    } catch (e) {
        console.error('Failed to update attribute:', e.message);
    }
}

main().catch(console.error);
