'use server'

import { revalidatePath } from 'next/cache';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { sponsorProxyConflict } from '@/lib/politics/proxy-logic';
import { ActionResult } from '@/lib/actions/types';
import { ProxyConflict } from '@/lib/politics/cold-war-types';

/**
 * Returns all active proxy conflicts for a given target empire.
 */
export async function getProxyConflictsAction(targetEmpireId: string): Promise<ProxyConflict[]> {
    const world = getGameWorldState();
    return Array.from(world.proxyConflicts.values())
        .filter(p => p.targetEmpireId === targetEmpireId);
}

/**
 * Sponsors a proxy conflict (increases funding and intensity).
 */
export async function sponsorProxyAction(
    sponsorId: string,
    conflictId: string,
    amount: number
): Promise<ActionResult<ProxyConflict>> {
    const world = getGameWorldState();
    
    const result = sponsorProxyConflict(world, sponsorId, conflictId, amount);
    
    if (!result.success) {
        return { success: false, error: result.message };
    }

    revalidatePath('/');
    return { success: true, data: result.conflict };
}
