/**
 * app/actions/leadership.ts
 * 
 * Server actions for the Leadership system.
 */
'use server'

import { revalidatePath } from 'next/cache';
import { ActionResult } from '@/lib/actions/types';
import { executePlayerAction } from './registry-handler';

/**
 * Recruit a leader from the galactic pool.
 */
export async function recruitLeaderAction(factionId: string, leaderId: string): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `leader-recruit-${Date.now()}`,
        actionId: 'LEADER_RECRUIT',
        issuerId: factionId,
        targetId: leaderId,
        payload: { leaderId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Assign an active leader to a specific target (Fleet, Planet, etc).
 */
export async function assignLeaderAction(factionId: string, leaderId: string, assignmentId: string): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `leader-assign-${Date.now()}`,
        actionId: 'LEADER_ASSIGN',
        issuerId: factionId,
        targetId: leaderId,
        payload: { leaderId, assignmentId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}
