'use server';

import { getEconomyState } from '@/lib/economy/economy-service';
import { Resource, PriceFormula, PolicyRule } from '@/lib/trade-system/types';
import { revalidatePath } from 'next/cache';
import { executePlayerAction } from './registry-handler';

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
    const result = await executePlayerAction({
        id: `trade-${Date.now()}`,
        actionId: 'DIP_TRADE_PACT',
        issuerId: 'PLAYER_FACTION',
        targetId: targetFactionId,
        payload: { targetFactionId, resource, volume, priceFormula, fixedPrice },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
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
    const result = await executePlayerAction({
        id: `policy-${Date.now()}`,
        actionId: 'ECON_UPDATE_POLICY',
        issuerId: 'PLAYER_FACTION',
        targetId: 'GLOBAL',
        payload: { updates },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Set the empire-wide production focus (e.g. Focus AMMO).
 */
export async function updateProductionFocusAction(resource: Resource | null) {
    const result = await executePlayerAction({
        id: `focus-${Date.now()}`,
        actionId: 'ECON_SET_FOCUS',
        issuerId: 'PLAYER_FACTION',
        targetId: 'GLOBAL',
        payload: { resource },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Fetch current live economy state for the UI.
 */
export async function getEconomyStateAction() {
    // Note: This remains a read-only operation
    return getEconomyState(null as any, 'faction-aurelian');
}

/**
 * Establish a trade route (used by Dashboard.tsx)
 */
export async function establishTradeRouteAction(playerFactionId: string, targetFactionId: string, resource: any, amount: number) {
    const result = await executePlayerAction({
        id: `route-${Date.now()}`,
        actionId: 'ECON_ESTABLISH_ROUTE',
        issuerId: playerFactionId,
        targetId: targetFactionId,
        payload: { targetFactionId, resource, amount },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
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
