'use server';
/**
 * app/actions/doctrine.ts
 * Server action for switching empire doctrine in a domain.
 * Wraps the existing setEmpireDoctrine() service — no duplicate logic.
 */

import { revalidatePath } from 'next/cache';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { setEmpireDoctrine } from '@/lib/doctrine/doctrine-service';
import type { DoctrineDomain } from '@/lib/doctrine/types';

const COOLDOWN_SECONDS = 3600 * 24; // mirrors doctrine-service constant

export interface SetDoctrineResult {
    success: boolean;
    error?: string;
    cooldownRemainingSeconds?: number;
}

/**
 * Switches the active doctrine for a single domain.
 * Returns cooldown info if the switch is blocked by the cooldown window.
 */
export async function setDoctrineAction(
    factionId: string,
    domain: DoctrineDomain,
    doctrineId: string
): Promise<SetDoctrineResult> {
    try {
        const world = getGameWorldState();
        const success = setEmpireDoctrine(world, factionId, domain, doctrineId);

        if (!success) {
            const empireDoctrines = world.doctrines.get(factionId);
            const lastChange = empireDoctrines?.lastChangeTimestamps[domain] ?? 0;
            const cooldownRemainingSeconds = Math.max(
                0,
                COOLDOWN_SECONDS - (world.nowSeconds - lastChange)
            );
            return {
                success: false,
                error: 'Doctrine transition is on cooldown.',
                cooldownRemainingSeconds,
            };
        }

        revalidatePath('/');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message ?? 'Unknown error' };
    }
}
