import { Client, Databases } from 'node-appwrite';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_SESSIONS = 'multiplayer_sessions';
const SESSION_DOC_ID = 'default-session';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || '')
    .setKey(process.env.APPWRITE_API_KEY || '');

const db = new Databases(client);

async function checkSize() {
    try {
        const doc: any = await db.getDocument(DB_ID, COLL_SESSIONS, SESSION_DOC_ID);
        const snapshot = doc.snapshot;
        const sizeBytes = Buffer.byteLength(snapshot, 'utf8');
        const sizeMB = sizeBytes / (1024 * 1024);

        console.log(`[Diagnostic] Session Snapshot Size: ${sizeMB.toFixed(3)} MB / 2.500 MB (Appwrite Limit)`);
        console.log(`[Diagnostic] Usage: ${Math.floor((sizeMB / 2.5) * 100)}%`);

        if (sizeMB > 2.0) {
            console.warn(`[WARNING] Session is nearly exhausted. Sharding is CRITICAL for 1.0.`);
        } else {
            console.log(`[OK] Session size within safe limits for 1.0.`);
        }
    } catch (e: any) {
        console.error(`[Error] Failed to fetch session:`, e.message);
    }
}

checkSize();
