import { Client, Databases, ID } from 'node-appwrite';
import dotenv from 'dotenv';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld } from '../lib/persistence/save-service';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_SESSIONS = 'multiplayer_sessions';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '')
    .setKey(process.env.APPWRITE_API_KEY || '');

const databases = new Databases(client);

async function pushInitialState() {
    console.log('[Init] Pushing Initial Game State to Appwrite...');

    try {
        // 1. Generate the initial world state using the game's singleton logic
        const world = getGameWorldState();
        const snapshot = serializeWorld(world);

        console.log(`[Init] Serialized world state size: ${(snapshot.length / 1024).toFixed(2)} KB`);

        // 2. Create the session document
        const doc = await databases.createDocument(
            DB_ID,
            COLL_SESSIONS,
            'default-session', // Constant ID for the main multiplayer session
            {
                snapshot: snapshot,
                lastTickAt: new Date().toISOString()
            }
        );

        console.log('✅ Successfully pushed initial state to "default-session"');
    } catch (err: any) {
        if (err.code === 409) {
            console.log('ℹ️ default-session already exists. Overwriting with fresh seeded state...');
            const world = getGameWorldState();
            const snapshot = serializeWorld(world);
            await databases.updateDocument(
                DB_ID,
                COLL_SESSIONS,
                'default-session',
                {
                    snapshot: snapshot,
                    lastTickAt: new Date().toISOString()
                }
            );
            console.log('✅ Successfully updated "default-session" with new seeded state.');
        } else {
            console.error('❌ Failed to push initial state:', err.message);
        }
    }
}

pushInitialState();
