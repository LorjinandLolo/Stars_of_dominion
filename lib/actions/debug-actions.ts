'use server';

import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { TechEngine } from '@/lib/tech/engine';
import { tickSeasonModifiers, endSeason, scheduleNextSeason } from '@/lib/seasons/season-service';

/**
 * Manually advances the simulation clock and triggers pillar ticks.
 */
export async function triggerTickAction(hours: number): Promise<any> {
    console.log(`[DebugAction] Triggering tick for ${hours} hours...`);
    try {
        const world = getGameWorldState();
        const seconds = hours * 3600;
        
        world.nowSeconds += seconds;

        if (world.tech) {
            for (const [factionId, techState] of world.tech.entries()) {
                const updated = TechEngine.tickResearch(techState, seconds);
                world.tech.set(factionId, updated);
            }
        }

        tickSeasonModifiers(world, seconds);

        console.log(`[DebugAction] Tick complete. New time: ${world.nowSeconds}`);
        return { success: true };
    } catch (err: any) {
        console.error(`[DebugAction] Tick failed:`, err);
        return { success: false, error: err.message };
    }
}

/**
 * Forcefully terminates the current season and schedules a new one.
 */
export async function forceEndSeasonAction(): Promise<any> {
    console.log(`[DebugAction] Force ending season...`);
    try {
        const world = getGameWorldState();
        const record = endSeason(world);
        const nextSeasonNumber = (record?.seasonNumber ?? 0) + 1;
        world.activeSeason = scheduleNextSeason(nextSeasonNumber, world);
        
        console.log(`[DebugAction] Season ended.`);
        return { success: true };
    } catch (err: any) {
        console.error(`[DebugAction] Season end failed:`, err);
        return { success: false, error: err.message };
    }
}

/**
 * Injects resources into a specific faction for testing.
 */
export async function injectResourcesAction(factionId: string, resources: Record<string, number>): Promise<any> {
    console.log(`[DebugAction] Injecting resources for ${factionId}:`, resources);
    try {
        if (!factionId) return { success: false, error: 'No faction selected.' };

        const world = getGameWorldState();
        const faction = world.economy.factions.get(factionId);
        
        if (!faction) return { success: false, error: `Faction ${factionId} not found.` };
        
        if (!faction.reserves) faction.reserves = {};

        for (const [res, amount] of Object.entries(resources)) {
            const current = (faction.reserves as any)[res] || 0;
            (faction.reserves as any)[res] = current + amount;
        }
        
        console.log(`[DebugAction] Injection successful.`);
        return { success: true };
    } catch (err: any) {
        console.error(`[DebugAction] Injection failed:`, err);
        return { success: false, error: err.message };
    }
}
