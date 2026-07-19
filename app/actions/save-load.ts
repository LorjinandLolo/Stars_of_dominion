'use server';
// app/actions/save-load.ts
// Stars of Dominion — Save / Load Server Actions

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '@/lib/persistence/save-service';
import { getCurrentTickState } from '@/lib/time/tick-scheduler';
import type { ActionResult } from '@/lib/actions/types';

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveGameAction(
    saveName: string,
    factionId: string
): Promise<ActionResult & { saveId?: string }> {
    try {
        const world   = getGameWorldState();
        const { tickIndex } = getCurrentTickState();
        const snapshot = serializeWorld(world);

        const doc = await prisma.gameSave.create({
            data: {
                saveName,
                factionId,
                savedAt: new Date().toISOString(),
                tickIndex: tickIndex ?? 0,
                nowSeconds: world.nowSeconds,
                snapshot,
            },
        });

        revalidatePath('/');
        return { success: true, saveId: doc.id };
    } catch (e: any) {
        return { success: false, error: e.message ?? 'Failed to save.' };
    }
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadGameAction(saveId: string): Promise<ActionResult> {
    try {
        const doc = await prisma.gameSave.findUnique({ where: { id: saveId } });

        if (!doc?.snapshot) return { success: false, error: 'Save file has no snapshot.' };

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
        const res = await prisma.gameSave.findMany({
            where: { factionId },
            orderBy: { savedAt: 'desc' },
            take: 20,
        });
        return res.map((d) => ({
            id: d.id,
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
        await prisma.gameSave.delete({ where: { id: saveId } });
        revalidatePath('/');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message ?? 'Failed to delete.' };
    }
}
