import { Client, Databases, Query } from 'node-appwrite';
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
const content = fs.readFileSync(envPath, 'utf-8');
const env: any = {};
content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
});

const client = new Client()
    .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
    .setKey(env.APPWRITE_API_KEY);

const db = new Databases(client);
const DB_ID = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;

async function main() {
    console.log('--- CLEARING PLANETS COLLECTION ---');

    while (true) {
        // Fetch a batch
        const payload = await db.listDocuments(DB_ID, 'planets', [Query.limit(50)]);
        if (payload.total === 0 || payload.documents.length === 0) break;

        console.log(`Found ${payload.total} planets. Deleting batch of ${payload.documents.length}...`);

        // Delete sequentially or efficiently to avoid 429
        // Parallelizing 50 is risky on some plans, let's do chunks of 10
        const chunk = payload.documents;
        for (let i = 0; i < chunk.length; i += 10) {
            const sub = chunk.slice(i, i + 10);
            await Promise.all(sub.map(doc =>
                db.deleteDocument(DB_ID, 'planets', doc.$id).catch(e => console.warn(`Failed to delete ${doc.$id}:`, e))
            ));
            await new Promise(r => setTimeout(r, 100)); // Small buffer between sub-batches
        }

        await new Promise(r => setTimeout(r, 500)); // Buffer between main batches
    }

    console.log('All planets deleted.');
}

main().catch(console.error);
