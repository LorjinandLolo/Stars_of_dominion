// lib/piracy/pirate-ground-strikes.ts
// Stars of Dominion — what the pirates do to the weak on their own ground
// (lib/piracy/pirate-ground.ts says why). Server side: the worker calls
// seizeCiviliansOnPirateGround every loop, and the combat manager asks
// pirateGroundEngages before opening a fight with the pirates.

import type { GameWorldState } from '../game-world-state';
import type { Fleet } from '../movement/types';
import { isCivilianFleet } from '../combat/civilian-ships';
import { fleetMass } from '../combat/engagement-rules';
import { fireNotification } from '../time/notification-hooks';
import * as chronicle from '../narrative/chronicle';
import { isPirateGround, pirateGroundKind, PIRATE_FACTION } from './pirate-ground';

function atRest(f: Fleet): boolean {
    return !!f.currentSystemId && !f.destinationSystemId && !(f.transitProgress > 0);
}

/** Fighting mass at rest in a system, for one faction (civilian hulls weigh nothing). */
function armedMass(world: GameWorldState, systemId: string, factionId: string): number {
    let total = 0;
    for (const f of world.movement.fleets.values()) {
        if (f.factionId !== factionId || f.currentSystemId !== systemId || !atRest(f)) continue;
        if (isCivilianFleet(f)) continue;
        total += fleetMass(f);
    }
    return total;
}

/**
 * Should the combat manager open (or keep) a fight between these two
 * factions here? Only on pirate ground, only when one side is the pirates,
 * and only when the pirates outgun the other side. A fight already under way
 * runs to its end, whatever the balance becomes.
 */
export function pirateGroundEngages(world: GameWorldState, systemId: string, a: string, b: string): boolean {
    if (a !== PIRATE_FACTION && b !== PIRATE_FACTION) return false;
    const other = a === PIRATE_FACTION ? b : a;
    if (other === PIRATE_FACTION || other === 'faction-neutral') return false;
    const sys = world.movement.systems.get(systemId);
    if (!sys || !isPirateGround(sys.tags, systemId)) return false;
    const ongoing = world.activeCombats?.get?.(`combat-${systemId}-${a}-${b}`) ?? world.activeCombats?.get?.(`combat-${systemId}-${b}-${a}`);
    if (ongoing && !ongoing.resolved) return true;
    const pirates = armedMass(world, systemId, PIRATE_FACTION);
    return pirates > 0 && pirates > armedMass(world, systemId, other);
}

export interface Seizure { fleetId: string; fleetName: string; factionId: string; systemId: string }

/**
 * Unarmed fleets at rest on pirate ground, with pirates there and no armed
 * escort of their own at least as strong, are seized. Their exploration
 * orders go with them (an arrival survey was free, so nothing is refunded).
 */
export function seizeCiviliansOnPirateGround(world: GameWorldState): Seizure[] {
    const out: Seizure[] = [];
    for (const fleet of [...world.movement.fleets.values()]) {
        if (fleet.factionId === PIRATE_FACTION || fleet.factionId === 'faction-neutral') continue;
        if (!atRest(fleet) || !isCivilianFleet(fleet)) continue;
        const systemId = fleet.currentSystemId!;
        const sys = world.movement.systems.get(systemId);
        if (!sys || !isPirateGround(sys.tags, systemId)) continue;
        const pirates = armedMass(world, systemId, PIRATE_FACTION);
        if (!(pirates > 0)) continue;
        if (armedMass(world, systemId, fleet.factionId) >= pirates) continue;

        world.movement.fleets.delete(fleet.id);
        world.movement.explorationOrders = world.movement.explorationOrders.filter(o => o.fleetId !== fleet.id);
        const name = fleet.name ?? 'A civilian fleet';
        const where = sys.name ?? systemId;
        out.push({ fleetId: fleet.id, fleetName: name, factionId: fleet.factionId, systemId });
        try {
            fireNotification({
                id: `pirate-seized-${fleet.id}-${world.nowSeconds}`,
                factionId: fleet.factionId,
                category: 'military',
                priority: 'urgent',
                title: 'SEIZED BY PIRATES',
                body: `${name} stopped at ${where}, ${pirateGroundKind(sys.tags)}, and pirate ships resting there took it. Unarmed ships need an armed escort at least as strong as the pirates to stop on pirate ground.`,
                createdAt: new Date(world.nowSeconds * 1000).toISOString(),
                read: false,
                linkToTab: 'map',
                payload: { systemId },
            } as any);
        } catch { /* notification queue absent in tests */ }
        chronicle.record(world, {
            type: 'pirate_raid', actorIds: [PIRATE_FACTION], targetIds: [fleet.factionId], location: systemId,
            facts: { seized: name, system: where, unarmed: true },
        });
    }
    return out;
}
