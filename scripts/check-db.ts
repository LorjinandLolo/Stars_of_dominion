
import { Client, Databases, Query } from 'node-appwrite';
import fs from 'node:fs';
import path from 'node:path';

// Manual env loading
const envPath = path.resolve(process.cwd(), '.env.local');
let env: any = {};
try {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
    });
} catch (e) {
    console.error('Could not read .env.local');
    process.exit(1);
}

const endpoint = env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = env.NEXT_PUBLIC_APPWRITE_PROJECT;
const apiKey = env.APPWRITE_API_KEY;
const dbId = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';

if (!endpoint || !projectId || !apiKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

const db = new Databases(client);

async function main() {
    console.log('--- DB DIAGNOSTIC ---');
    try {
        const res = await db.listDocuments(dbId, 'planets', [Query.limit(1000)]);
        console.log(`FETCHED_COUNT:${res.documents.length}`);
    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

main();
