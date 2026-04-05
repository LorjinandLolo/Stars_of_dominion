import { Client, Databases } from 'node-appwrite';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '')
    .setKey(process.env.APPWRITE_API_KEY || '');

const databases = new Databases(client);

async function purgeCollections() {
    const collections = ['planets', 'systems', 'game_factions', 'game_fleets', 'multiplayer_sessions'];
    console.log('[Purge] Resetting core collections for clean schema...');

    for (const collId of collections) {
        try {
            await databases.deleteCollection(DB_ID, collId);
            console.log(`✅ Purged: ${collId}`);
        } catch (e: any) {
            console.log(`ℹ️ ${collId} not found or already deleted.`);
        }
    }
    console.log('[Purge] Purge complete.');
}

purgeCollections();
