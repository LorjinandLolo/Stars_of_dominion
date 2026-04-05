'use server';
/**
 * app/actions/factions.ts
 * Multiplayer Authoritative Refactor
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionResult } from '@/lib/actions/types';
import { executePlayerAction } from './registry-handler';

/**
 * Creates a new faction for a player.
 */
export async function createFactionAction(name: string) {
    if (!name) return;

    const result = await executePlayerAction({
        id: `join-${Date.now()}`,
        actionId: 'FACTION_JOIN',
        issuerId: 'system', // Special issuer for new joins
        targetId: name,
        payload: { name },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) {
        revalidatePath('/');
        redirect('/faction');
    }
}

/**
 * Claims a home planet for a faction.
 */
export async function claimHomePlanetAction(factionId: string, formData: FormData) {
    const planetId = formData.get('planetId') as string;
    if (!planetId) return;

    const result = await executePlayerAction({
        id: `claim-${Date.now()}`,
        actionId: 'PLANET_CLAIM',
        issuerId: factionId,
        targetId: planetId,
        payload: { planetId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) {
        revalidatePath('/');
        redirect(`/faction/${factionId}`);
    }
}

/**
 * Recruits a ground army on a planet.
 */
export async function recruitArmyAction(factionId: string, homePlanetId: string, formData: FormData) {
    if (!homePlanetId) return;

    const result = await executePlayerAction({
        id: `recruit-army-${Date.now()}`,
        actionId: 'PLANET_RECRUIT_UNITS',
        issuerId: factionId,
        targetId: homePlanetId,
        payload: { planetId: homePlanetId, unitType: 'infantry', count: 1000 },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) {
        revalidatePath('/');
        redirect(`/faction/${factionId}`);
    }
}
