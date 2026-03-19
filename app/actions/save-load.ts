'use server';
// app/actions/save-load.ts
// Stars of Dominion — Save / Load Server Actions

import { revalidatePath } from 'next/cache';
import { getServerClients } from '@/lib/appwrite';
import { ID, Query } from 'node-appwrite';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '@/lib/persistence/save-service';
import { getCurrentTickState } from '@/lib/time/tick-scheduler';
import type { ActionResult } from '@/lib/actions/types';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ?? 'game';
const COLL  = 'game_saves';

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveGameAction(
    saveName: string,
    factionId: string
): Promise<ActionResult & { saveId?: string }> {
    try {
        const { db } = await getServerClients();
        const world   = getGameWorldState();
        const { tickIndex } = getCurrentTickState();
        const snapshot = serializeWorld(world);

        const doc = await db.createDocument(DB_ID, COLL, ID.unique(), {
            saveName,
            factionId,
            savedAt: new Date().toISOString(),
            tickIndex: tickIndex ?? 0,
            nowSeconds: world.nowSeconds,
            snapshot,         // store as string attribute in Appwrite
        });

        revalidatePath('/');
        return { success: true, saveId: doc.$id };
    } catch (e: any) {
        return { success: false, error: e.message ?? 'Failed to save.' };
    }
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadGameAction(saveId: string): Promise<ActionResult> {
    try {
        const { db } = await getServerClients();
        const doc: any = await db.getDocument(DB_ID, COLL, saveId);

        if (!doc.snapshot) return { success: false, error: 'Save file has no snapshot.' };

        const loaded = deserializeWorld(doc.snapshot as string);

        // Hot-swap the singleton (server-scope)
        const singleton = await import('@/lib/game-world-state-singleton');
        // Patch the underlying module-level variable via the exported getGameWorldState
        // (We assign to the result and then copy keys across)
        const current = singleton.getGameWorldState();
        Object.assign(current, loaded);

        revalidatePath('/');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message ?? 'Failed to load.' };
    }
}

// ─── List Saves ───────────────────────────────────────────────────────────────

export async function listSavesAction(factionId: string) {
    try {
        const { db } = await getServerClients();
        const res = await db.listDocuments(DB_ID, COLL, [
            Query.equal('factionId', factionId),
            Query.orderDesc('savedAt'),
            Query.limit(20),
        ]);
        return res.documents.map((d: any) => ({
            id: d.$id,
            saveName: d.saveName,
            savedAt: d.savedAt,
            factionId: d.factionId,
            tickIndex: d.tickIndex,
            nowSeconds: d.nowSeconds,
        }));
    } catch {
        return [];
    }
}

// ─── Delete Save ──────────────────────────────────────────────────────────────

export async function deleteSaveAction(saveId: string): Promise<ActionResult> {
    try {
        const { db } = await getServerClients();
        await db.deleteDocument(DB_ID, COLL, saveId);
        revalidatePath('/');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message ?? 'Failed to delete.' };
    }
}
