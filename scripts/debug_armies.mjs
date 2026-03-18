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
    console.log('--- Debugging Armies ---');
    const env = loadEnv();
    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const DB_ID = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
    const COLL_ARMIES = 'armies';

    const armies = await db.listDocuments(DB_ID, COLL_ARMIES);
    console.log(`Total Armies: ${armies.total}`);
    armies.documents.forEach(a => {
        console.log(`- [${a.$id}] Faction: ${a.faction_id} @ (${a.x}, ${a.y}) Planet: ${a.location_planet_id}`);
    });
}

main().catch(console.error);
