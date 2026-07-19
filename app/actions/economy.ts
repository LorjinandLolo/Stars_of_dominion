'use server';

import { getEconomyState } from '@/lib/economy/economy-service';
import { Resource, PriceFormula, PolicyRule } from '@/lib/trade-system/types';
import { revalidatePath } from 'next/cache';
import { executePlayerAction } from './registry-handler';
import { prisma } from '@/lib/db';

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
/**
 * Awards a strategic bonus (credits/influence) to a faction.
 * Typically called after successful predictions or missions.
 */
export async function awardStrategicBonusAction(
    factionId: string,
    credits: number = 0,
    influence: number = 0
) {
    try {
        const factionDoc = await prisma.faction.findUniqueOrThrow({ where: { id: factionId } });
        const resources = factionDoc.resources ? JSON.parse(factionDoc.resources) : {};

        if (credits > 0) {
            resources.credits = (resources.credits || 0) + credits;
        }
        if (influence > 0) {
            resources.influence = (resources.influence || 0) + influence;
        }

        await prisma.faction.update({
            where: { id: factionId },
            data: { resources: JSON.stringify(resources) }
        });
    } catch (e) {
        console.error('Failed to directly award strategic bonus:', e);
    }

    const result = await executePlayerAction({
        id: `bonus-${Date.now()}`,
        actionId: 'ECON_AWARD_STRATEGIC_BONUS',
        issuerId: factionId,
        targetId: 'GLOBAL',
        payload: { credits, influence },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}
