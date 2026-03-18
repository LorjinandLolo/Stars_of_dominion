import fs from 'node:fs';
import path from 'node:path';
import { Client, Databases } from 'node-appwrite';

const envPath = path.resolve(process.cwd(), '.env.local');
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

const client = new Client()
    .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
    .setKey(env.APPWRITE_API_KEY);

const db = new Databases(client);

async function check() {
    try {
        const res = await db.listDocuments(env.NEXT_PUBLIC_APPWRITE_DATABASE_ID, 'planets');
        console.log(`Total planets: ${res.total}`);
        console.log(`First 5 planets:`);
        res.documents.slice(0, 5).forEach(p => console.log(`- ${p.name} (${p.x}, ${p.y})`));
    } catch (e) {
        console.error(e);
    }
}

check();
