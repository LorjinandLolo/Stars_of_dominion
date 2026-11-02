// lib/start/starter-kit.ts
// Stars of Dominion — what an empire has in hand on its first day: an exploration
// ship, a builder ship docked at the capital, and three quick buildings, so a new
// player explores and builds at once instead of waiting on a yard. AI empires get
// the same kit. A human claiming an empire the AI has been running is topped up
// once, because the AI may have spent its builder on an outpost.
//
// The markers live on the capital so they persist with the world.

import { civilianCount, type CivilianShipId } from '../combat/civilian-ships';
import { newCivilianFleet } from '../combat/civilian-service';
import { QUICK_BUILDS } from '../construction/build-time';

function capitalOf(world: any, factionId: string, systemId: string): any {
    return ([...world.construction.planets.values()] as any[])
        .filter(p => p.ownerId === factionId && p.systemId === systemId)
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
}

function ensureShip(world: any, factionId: string, planet: any, ship: CivilianShipId, fleetId: string, name: string): void {
    const fleets = [...world.movement.fleets.values()] as any[];
    if (fleets.some(f => f.factionId === factionId && civilianCount(f.composition, ship) > 0)) return;
    if (world.movement.fleets.has(fleetId)) return;
    world.movement.fleets.set(fleetId, newCivilianFleet(factionId, planet, fleetId, name, world.nowSeconds, { [ship]: 1 }));
}

/** Grants every empire that is due its kit. Safe to run on every pass. Returns who got one. */
export function grantStarterKits(world: any): string[] {
    const claimed = new Set<string>(Array.isArray(world.claimedFactionIds) ? world.claimedFactionIds : []);
    const granted: string[] = [];
    for (const [factionId, faction] of world.economy?.factions ?? []) {
        if (!faction?.capitalSystemId) continue;
        const planet = capitalOf(world, factionId, faction.capitalSystemId);
        if (!planet) continue;
        const isHuman = claimed.has(factionId);
        if (planet.starterGranted && (!isHuman || planet.starterClaimed)) continue;

        // The AI's survey logic finds its exploration ship by this id.
        ensureShip(world, factionId, planet, 'explorer', `fleet-${factionId}-scout-1`, 'Exploration 1');
        ensureShip(world, factionId, planet, 'builder', `fleet-${factionId}-starter-builder`, 'Builder 1');
        planet.quickBuildsLeft = QUICK_BUILDS;
        planet.starterGranted = true;
        if (isHuman) planet.starterClaimed = true;
        granted.push(factionId);
    }
    return granted;
}
