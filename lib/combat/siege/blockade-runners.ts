// lib/combat/siege/blockade-runners.ts
// Stars of Dominion — supply slipped through a blockade.
//
// A besieged world (or a beachhead, or a position on contested ground) whose
// sky the enemy holds is cut off: its men go hungry and in the end surrender
// (formations.updateSupply). A lone ship can still try to run the blockade:
// a small fleet of the starving side, parked in the system or one jump out,
// gets a chance each cycle to slip something down. It is a fishing boat, not
// a cargo ship: a run that gets through only slows the hunger
// (TRICKLE_SUPPLY_LOSS instead of the full loss). It never ends a siege.
//
// Pure apart from the world it reads; deterministic per siege cycle.

import type { GameWorldState } from '../../game-world-state';
import { RNG, seedFromString } from '../../trade-system/rng';
import { civilianCount } from '../civilian-ships';
import { shipCountOf } from '../fleet-speed';

/** Chance per cycle that a run gets through, and with a freighter doing the running. */
export const RUNNER_CHANCE = 0.35;
export const RUNNER_CHANCE_FREIGHTER = 0.6;
/** Only small fleets slip past a blockade: at most this many hulls. */
export const RUNNER_MAX_HULLS = 3;

/** Fleets of `empireId` that could try: small, parked, in the system or one jump out. */
export function blockadeRunners(world: GameWorldState, empireId: string, systemId: string): any[] {
    const near = new Set([systemId, ...(world.movement.systems.get(systemId)?.hyperlaneNeighbors ?? [])]);
    return [...world.movement.fleets.values()].filter((f: any) => {
        if (f.factionId !== empireId || !f.currentSystemId || f.destinationSystemId || !near.has(f.currentSystemId)) return false;
        const hulls = shipCountOf(f.composition);
        const civilian = civilianCount(f.composition, 'freighter') + civilianCount(f.composition, 'explorer') + civilianCount(f.composition, 'spy') + civilianCount(f.composition, 'builder');
        return hulls + civilian > 0 && hulls <= RUNNER_MAX_HULLS;
    });
}

/** Whether a run gets through to `empireId`'s men on this world this cycle. */
export function blockadeRunGetsThrough(world: GameWorldState, empireId: string, planet: { id: string; systemId: string }, cycle: number): boolean {
    const runners = blockadeRunners(world, empireId, planet.systemId);
    if (!runners.length) return false;
    const chance = runners.some(f => civilianCount(f.composition, 'freighter') > 0) ? RUNNER_CHANCE_FREIGHTER : RUNNER_CHANCE;
    return new RNG(seedFromString(`${planet.id}|runner|${empireId}|${cycle}`)).check(chance);
}
