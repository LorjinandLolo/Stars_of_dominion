// lib/piracy/pirate-ground.ts
// Stars of Dominion — pirate ground is dangerous to the weak.
//
// A Corsair Den (lawless ground, lib/piracy/emergence-service.ts) or a Pirate
// Station (a band's base, lib/piracy/base-service.ts) used to be a label: space
// combat only starts between factions at war, and nothing ever put the pirates
// at war with anyone, so any ship could park in a den untouched. Now pirate
// fleets at rest on their own ground strike what they outgun:
//  - an armed fleet weaker than the pirates there is engaged in ordinary space
//    combat (combat-manager asks pirateGroundEngages);
//  - an unarmed fleet (only civilian hulls) with no armed escort strong
//    enough is seized: the ship is gone, its owner is told, the chronicle
//    records a raid.
// A stronger fleet passes unchallenged, and a strong escort covers its
// civilians. This file is client-safe up to the server section: the panel and
// the move order use isPirateGround / isUnarmedFleet / pirateGroundWarning.

import { isCivilianFleet } from '../combat/civilian-ships';

export const PIRATE_FACTION = 'faction-pirates';
export const PIRATE_GROUND_TAGS: readonly string[] = ['corsair_den', 'pirate_station'];

/**
 * The map's twenty named havens ('Corsair Den 10', ids pirate-N in
 * generated-systems.json) are pirate ground by birth. They carry no tag of
 * their own, and the corsair_den tag on other systems comes and goes with
 * lawlessness (emergence-service), so the id is the lasting mark.
 */
export function isPirateHaven(systemId: string | null | undefined): boolean {
    return !!systemId && systemId.startsWith('pirate-');
}

/** Pirate ground: a named haven, or any system tagged a den or a station. */
export function isPirateGround(tags: readonly string[] | null | undefined, systemId?: string | null): boolean {
    return isPirateHaven(systemId) || (!!tags && tags.some(t => PIRATE_GROUND_TAGS.includes(t)));
}

/** 'a Pirate Station' or 'a Corsair Den', for notices. */
export function pirateGroundKind(tags: readonly string[] | null | undefined): string {
    return tags?.includes('pirate_station') ? 'a Pirate Station' : 'a Corsair Den';
}

interface FleetLike {
    composition?: Record<string, number>;
    basePower?: number;
}

/** Only civilian hulls, or no fighting power at all. */
export function isUnarmedFleet(fleet: FleetLike | null | undefined): boolean {
    if (!fleet) return false;
    return isCivilianFleet(fleet as any) || !((fleet.basePower ?? 0) > 0);
}

/**
 * The confirm text for sending an unarmed fleet onto pirate ground, or null
 * when no warning is due. The caller asks; the order is the player's.
 */
export function pirateGroundWarning(
    fleet: (FleetLike & { name?: string }) | null | undefined,
    system: { name?: string; id?: string; tags?: readonly string[] } | null | undefined,
): string | null {
    if (!fleet || !system || !isPirateGround(system.tags, system.id) || !isUnarmedFleet(fleet)) return null;
    const where = system.name ?? system.id ?? 'that system';
    const kind = pirateGroundKind(system.tags);
    return `${where} is ${kind}. Pirate ships resting there seize unarmed ships that stop, unless an armed fleet of yours at least as strong is there with them.\n\nSend ${fleet.name ?? 'this fleet'} anyway?`;
}
