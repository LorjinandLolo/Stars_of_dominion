import { Client, Databases, Permission, Role } from 'node-appwrite';
import dotenv from 'dotenv';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld } from '../lib/persistence/save-service';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_SESSIONS = 'multiplayer_sessions';
const SESSION_DOC_ID = 'default-session';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || '')
    .setKey(process.env.APPWRITE_API_KEY || '');

const databases = new Databases(client);

async function fixPermissions() {
    console.log('[Fix] Checking "default-session" and setting public permissions...');

    try {
        const world = getGameWorldState();
        const snapshot = serializeWorld(world);

        try {
            // Attempt to update existing document with public permissions
            await databases.updateDocument(
                DB_ID,
                COLL_SESSIONS,
                SESSION_DOC_ID,
                {
                    snapshot: snapshot,
                    lastTickAt: new Date().toISOString()
                },
                [
                    Permission.read(Role.any()), // Allow anyone to read the game state
                ]
            );
            console.log('✅ Successfully updated "default-session" with public read permissions.');
        } catch (err: any) {
            if (err.code === 404) {
                // Create if not found
                await databases.createDocument(
                    DB_ID,
                    COLL_SESSIONS,
                    SESSION_DOC_ID,
                    {
                        snapshot: snapshot,
                        lastTickAt: new Date().toISOString()
                    },
                    [
                        Permission.read(Role.any()),
                    ]
                );
                console.log('✅ Created "default-session" with public read permissions.');
            } else {
                throw err;
            }
        }
    } catch (err: any) {
        console.error('❌ Failed to fix document:', err.message);
    }
}

fixPermissions();
