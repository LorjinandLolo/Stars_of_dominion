// lib/goals/campaign-raid.ts
// Stars of Dominion — the campaign's first fight: when a player reaches the
// "Drive off the raiders" goal, one weak pirate raider jumps into their home
// system. Pirates are at war with nobody, so this fleet carries campaignRaidOf,
// which combat-manager reads to start the battle. Win or lose, the goal closes:
// the raider dies, or leaves after RAID_PATIENCE, so no player can get stuck.
// The state lives on the capital so it persists with the world.

import { createRaiderFleet } from '../piracy/emergence-service';
import { RNG, seedFromString } from '../trade-system/rng';
import { fireNotification } from '../time/notification-hooks';
import { currentGoal } from './first-week-goals';

/** Twenty real minutes at 15x. */
export const RAID_PATIENCE = 18_000;
/** Below one patrol craft, so a player's first warship wins. */
const RAIDER_POWER = 4;

export function tickCampaignRaids(world: any): void {
    const claimed: string[] = Array.isArray(world.claimedFactionIds) ? world.claimedFactionIds : [];
    for (const factionId of claimed) {
        const systemId = world.economy?.factions?.get?.(factionId)?.capitalSystemId;
        const capital: any = ([...world.construction.planets.values()] as any[]).find(p => p.ownerId === factionId && p.systemId === systemId);
        if (!capital) continue;
        const raid = capital.campaignRaid;

        if (raid && !raid.done) {
            const fleet = world.movement.fleets.get(raid.fleetId);
            const expired = world.nowSeconds - raid.spawnedAt > RAID_PATIENCE;
            if (fleet && !expired) continue;
            if (fleet) world.movement.fleets.delete(raid.fleetId);
            raid.done = true;
            fireNotification({
                id: `campaign-raid-end-${factionId}`,
                factionId,
                category: 'system',
                priority: 'normal',
                title: fleet ? 'The raiders have gone' : 'Raiders destroyed',
                body: fleet ? 'The pirates grew bored and jumped out. Next time keep a warship at home.' : 'Your ships drove them off. Fleets in a system fight whoever is at war with you there, with or without your orders.',
                createdAt: new Date(world.nowSeconds * 1000).toISOString(),
                read: false,
            } as any);
            continue;
        }
        if (raid || currentGoal(world, factionId)?.goal.id !== 'repel_raid') continue;

        const system = world.movement.systems.get(systemId);
        if (!system) continue;
        const fleet: any = createRaiderFleet(system, world, new RNG(seedFromString(`campaign-${factionId}`)));
        fleet.id = `pirate-campaign-${factionId}`;
        fleet.campaignRaidOf = factionId;
        fleet.basePower = RAIDER_POWER;
        fleet.strength = 1;
        fleet.composition = { interceptor: 1 };
        world.movement.fleets.set(fleet.id, fleet);
        capital.campaignRaid = { fleetId: fleet.id, spawnedAt: world.nowSeconds, done: false };
        fireNotification({
            id: `campaign-raid-${factionId}`,
            factionId,
            category: 'military',
            priority: 'urgent',
            title: 'Raiders at home',
            body: `A pirate raider has jumped into your home system. Your warships will engage it on their own.`,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'galaxy',
        } as any);
    }
}
