// lib/combat/fleet-repair.ts
// One dock-repair rule for both clocks. The fast cycle (scripts/game-loop.ts)
// and the strategic tick (lib/time/tick-processor.ts) each patched fleets with
// their own literals, and the `fleet_repair_rate` an orbital Spaceyard sells
// was summed into OrbitalRatings and read by nobody.

import type { Fleet } from '../movement/types';
import { computeOrbitalRatings } from '../orbital/orbital-service';
import { getTechModifier } from '../tech/modifiers';
import { isSystemContested } from './war-status';

/** Strength a fleet holding in a friendly system regains per fast cycle with no yard. */
export const DOCK_REPAIR_PER_CYCLE = 0.01;

interface YardPlanetLike {
    ownerId?: string | null;
    systemId?: string | null;
    orbital?: unknown;
}

/**
 * Best orbital `fleet_repair_rate` among this faction's planets in the system.
 * A fleet docks at one yard, so the best one applies rather than the sum.
 */
export function yardRepairBonus(
    planets: Iterable<YardPlanetLike> | undefined,
    factionId: string,
    systemId: string,
    nowSeconds: number,
): number {
    let best = 0;
    for (const p of planets ?? []) {
        if (p.ownerId !== factionId || p.systemId !== systemId || !p.orbital) continue;
        const rate = computeOrbitalRatings(p as any, nowSeconds).fleetRepairRate;
        if (rate > best) best = rate;
    }
    return best;
}

/** Sitting still in a system the fleet's faction holds. */
export function isDocked(world: any, fleet: Fleet): boolean {
    if (!fleet.currentSystemId || fleet.destinationSystemId) return false;
    const sys = world.movement?.systems?.get?.(fleet.currentSystemId);
    return !!sys && sys.ownerFactionId === fleet.factionId;
}

/**
 * Strength regained this fast cycle: the base dock rate plus the best orbital
 * yard's repair rate, scaled by repair-doctrine research. Zero unless docked.
 * A bare Spaceyard (0.03) quadruples the base rate; a Capital Spaceyard (0.07)
 * brings a wreck back to full in about 13 cycles.
 */
export function dockRepairPerCycle(world: any, fleet: Fleet): number {
    if (!isDocked(world, fleet)) return 0;
    // No repair under fire: an enemy fleet holding in the system keeps the yard shut.
    if (isSystemContested(world, fleet.currentSystemId, fleet.factionId)) return 0;
    const yard = yardRepairBonus(
        world.construction?.planets?.values?.(),
        fleet.factionId,
        fleet.currentSystemId!,
        world.nowSeconds ?? 0,
    );
    return (DOCK_REPAIR_PER_CYCLE + yard) * getTechModifier(world, fleet.factionId, 'mil_repair_rate_mult');
}
