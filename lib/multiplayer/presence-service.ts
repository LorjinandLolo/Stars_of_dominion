// lib/multiplayer/presence-service.ts
// Stars of Dominion — Player Presence Tracking
// Tracks online/offline status per faction using Appwrite.

import { getServerClients } from '@/lib/appwrite';
import { ID, Query } from 'node-appwrite';

const DB_ID   = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ?? 'game';
const COLL    = 'presence';

export interface PresenceRecord {
    factionId: string;
    isOnline: boolean;
    lastSeenAt: string;
    sessionId: string;
}

/**
 * Upsert this faction's presence (call on login / periodic heartbeat).
 */
export async function upsertPresence(factionId: string, sessionId: string): Promise<void> {
    try {
        const { db } = await getServerClients();

        const existing = await db.listDocuments(DB_ID, COLL, [
            Query.equal('factionId', factionId),
            Query.limit(1),
        ]);

        const record = {
            factionId,
            isOnline: true,
            lastSeenAt: new Date().toISOString(),
            sessionId,
        };

        if (existing.total > 0) {
            await db.updateDocument(DB_ID, COLL, existing.documents[0].$id, record);
        } else {
            await db.createDocument(DB_ID, COLL, ID.unique(), record);
        }
    } catch (e) {
        console.warn('[PresenceService] Failed to upsert presence:', e);
    }
}

/**
 * Mark this faction as offline (call on logout or session end).
 */
export async function markOffline(factionId: string): Promise<void> {
    try {
        const { db } = await getServerClients();
        const existing = await db.listDocuments(DB_ID, COLL, [
            Query.equal('factionId', factionId),
            Query.limit(1),
        ]);
        if (existing.total > 0) {
            await db.updateDocument(DB_ID, COLL, existing.documents[0].$id, {
                isOnline: false,
                lastSeenAt: new Date().toISOString(),
            });
        }
    } catch (e) {
        console.warn('[PresenceService] Failed to mark offline:', e);
    }
}

/**
 * Get all faction presence records (for the presence bar UI).
 */
export async function getAllPresence(): Promise<PresenceRecord[]> {
    try {
        const { db } = await getServerClients();
        const res = await db.listDocuments(DB_ID, COLL, [Query.limit(20)]);
        return res.documents as unknown as PresenceRecord[];
    } catch {
        return [];
    }
}
