/**
 * app/actions/leadership.ts
 * 
 * Server actions for the Leadership system.
 */
'use server'

import { revalidatePath } from 'next/cache';
import { ActionResult } from '@/lib/actions/types';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { LeadershipService } from '@/lib/leadership/leadership-service';

/**
 * Recruit a leader from the galactic pool.
 */
export async function recruitLeaderAction(factionId: string, leaderId: string): Promise<ActionResult> {
    try {
        const world = getGameWorldState();
        
        // 1. Logic check
        const candidate = world.leadership.recruitmentPool.find(l => l.id === leaderId);
        if (!candidate) return { success: false, error: 'Candidate no longer available.' };

        // 2. Execute via service
        LeadershipService.recruitLeader(world, leaderId, factionId);
        
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Assign an active leader to a specific target (Fleet, Planet, etc).
 */
export async function assignLeaderAction(factionId: string, leaderId: string, assignmentId: string): Promise<ActionResult> {
    try {
        const world = getGameWorldState();
        
        // 1. Logic check
        const leader = world.leadership.leaders.get(leaderId);
        if (!leader) return { success: false, error: 'Leader not found.' };
        if (leader.factionId !== factionId) return { success: false, error: 'Unauthorized assignment.' };

        // 2. Execute via service
        LeadershipService.assignLeader(world, leaderId, assignmentId);
        
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
