import { Client, Databases, Query } from 'node-appwrite';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_FACTIONS = 'game_factions';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '')
    .setKey(process.env.APPWRITE_API_KEY || '');

const databases = new Databases(client);

async function purgeShards() {
    console.log('[Cleanup] Purging all faction shards from Appwrite...');

    try {
        const docs = await databases.listDocuments(DB_ID, COLL_FACTIONS, [Query.limit(100)]);
        console.log(`[Cleanup] Found ${docs.documents.length} shards to delete.`);

        for (const doc of docs.documents) {
            await databases.deleteDocument(DB_ID, COLL_FACTIONS, doc.$id);
            console.log(`[Cleanup] Deleted shard: ${doc.$id}`);
        }

        console.log('✅ Shard purge complete.');
    } catch (err: any) {
        console.error('❌ Failed to purge shards:', err.message);
    }
}

purgeShards();
