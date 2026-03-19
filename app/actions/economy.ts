'use server';

import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { getEconomyState } from '@/lib/economy/economy-service';
import { Resource, PriceFormula, PolicyRule } from '@/lib/trade-system/types';
import { revalidatePath } from 'next/cache';

/**
 * Propose or update a trade agreement between two factions.
 */
export async function proposeTradeAgreementAction(
    targetFactionId: string,
    resource: Resource,
    volume: number,
    priceFormula: PriceFormula = 'market',
    fixedPrice?: number
) {
    const world = getGameWorldState();
    const playerFactionId = 'faction-aurelian'; // Hardcoded for now, would come from session

    const agreementId = `ag-${playerFactionId}-${targetFactionId}-${resource}`;
    
    world.economy.tradeAgreements.set(agreementId, {
        id: agreementId,
        aFactionId: playerFactionId,
        bFactionId: targetFactionId,
        resource,
        volumePerHour: volume,
        startTick: 0, // Should be current tick
        endTick: 1000, // Should be configurable
        priceFormula,
        fixedPrice
    });

    console.log(`[ECONOMY] Proposal: ${playerFactionId} <-> ${targetFactionId} for ${volume} ${resource}`);
    
    revalidatePath('/');
    return { success: true, agreementId };
}

/**
 * Update economic policy (tariffs, sanctions).
 */
export async function updateEconomicPolicyAction(
    updates: {
        tariffs?: { resource: Resource; value: number }[];
        subsidies?: { resource: Resource; value: number }[];
        sanctions?: string[];
        embargoes?: { factionId: string; resources: Resource[] }[];
    }
) {
    const world = getGameWorldState();
    const playerFactionId = 'faction-aurelian';
    
    let policy = world.economy.policies?.get(playerFactionId);
    if (!policy) {
        policy = {
            tariffsByResource: new Map(),
            subsidiesByResource: new Map(),
            sanctions: new Set(),
            embargoes: [],
            chokepointRules: new Map(),
            productionFocus: null
        };
        if (!world.economy.policies) world.economy.policies = new Map();
        world.economy.policies.set(playerFactionId, policy);
    }

    if (updates.tariffs) {
        updates.tariffs.forEach(t => policy!.tariffsByResource.set(t.resource, t.value));
    }
    if (updates.subsidies) {
        updates.subsidies.forEach(s => policy!.subsidiesByResource.set(s.resource, s.value));
    }
    if (updates.sanctions) {
        policy.sanctions = new Set(updates.sanctions);
    }
    if (updates.embargoes) {
        policy.embargoes = updates.embargoes;
    }

    revalidatePath('/');
    return { success: true };
}

/**
 * Set the empire-wide production focus (e.g. Focus AMMO).
 */
export async function updateProductionFocusAction(resource: Resource | null) {
    const world = getGameWorldState();
    const playerFactionId = 'faction-aurelian';
    
    let policy = world.economy.policies?.get(playerFactionId);
    if (!policy) {
        policy = {
            tariffsByResource: new Map(),
            subsidiesByResource: new Map(),
            sanctions: new Set(),
            embargoes: [],
            chokepointRules: new Map(),
            productionFocus: null
        };
        if (!world.economy.policies) world.economy.policies = new Map();
        world.economy.policies.set(playerFactionId, policy);
    }

    policy.productionFocus = resource;
    console.log(`[ECONOMY] Production Focus set to: ${resource}`);

    revalidatePath('/');
    return { success: true };
}

/**
 * Fetch current live economy state for the UI.
 */
export async function getEconomyStateAction() {
    const world = getGameWorldState();
    return getEconomyState(world, 'faction-aurelian');
}

/**
 * Stub for establishTradeRouteAction (used by Dashboard.tsx)
 */
export async function establishTradeRouteAction(playerFactionId: string, targetFactionId: string, resource: any, amount: number) {
    console.log(`[ECONOMY] Stub: establishTradeRouteAction for ${resource} from ${playerFactionId} to ${targetFactionId}`);
    return { success: true };
}

/**
 * Stub for generateIntrigueOptionsAction (used by Dashboard.tsx)
 */
export async function generateIntrigueOptionsAction(targetFactionId: string) {
    console.log(`[INTRIGUE] Stub: generateIntrigueOptionsAction for ${targetFactionId}`);
    return [];
}

/**
 * Stub for executeIntrigueAction (used by Dashboard.tsx)
 */
export async function executeIntrigueAction(optionId: string, type: string, targetId: string) {
    console.log(`[INTRIGUE] Stub: executeIntrigueAction ${type} on ${targetId}`);
    return { success: true };
}
