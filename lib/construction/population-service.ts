/**
 * lib/construction/population-service.ts
 * Core logic for the Population System.
 */

import { GameWorldState } from '../game-world-state';
import { Planet } from './construction-types';
import { eventBus } from '../movement/event-bus';
import { computeInfrastructureEffects } from '../infrastructure/infrastructure-service';
import { overpopulationFor, OVERPOP_UNREST_PER_DECILE } from '../factions/movanite';

export class PopulationService {
    /**
     * Periodic tick for population growth and unrest.
     */
    static tickPopulation(world: GameWorldState, deltaSeconds: number): void {
        const hours = deltaSeconds / 3600;

        for (const planet of world.construction.planets.values()) {
            // Movanite overflow: their numbers keep arriving past the point a
            // world can house them. Resolved here rather than inside the update
            // so the function stays faction-blind and every other empire keeps
            // its original hard cap by construction.
            const overpop = overpopulationFor(
                world,
                (planet as any).ownerId,
                planet.popCapacity,
                planet.population,
            );
            this.updatePlanetPopulation(planet, hours, world.nowSeconds, overpop);
        }
    }

    private static updatePlanetPopulation(
        planet: Planet,
        hours: number,
        now: number,
        overpop: { ceiling: number; unrest: number } | null = null,
    ): void {
        // 1. Growth Calculation
        // Base growth rate affected by happiness (80 is baseline)
        const happinessFactor = (planet.happiness - 80) / 100; // e.g., 0.1 at 90 happiness
        const effectiveGrowth = planet.popGrowth * (1 + happinessFactor);
        
        const deltaPop = planet.population * effectiveGrowth * hours;
        const oldPop = planet.population;
        
        // The ceiling. For everyone else this is popCapacity and hitting it is a
        // silent no-op — growth simply stops. The Movanites are allowed past it,
        // and pay for the overflow in unrest below; that overflow is the cost of
        // the pop_growth bonus that gets them there first.
        planet.population = Math.min(overpop?.ceiling ?? planet.popCapacity, planet.population + deltaPop);

        if (Math.abs(planet.population - oldPop) > 0.01) {
            eventBus.emit({
                type: 'populationShift',
                planetId: planet.id,
                delta: planet.population - oldPop,
                cause: 'natural_growth',
                timestamp: now
            });
        }

        // 2. Unrest Calculation
        // Unrest increases if stability is low or if occupied
        let unrestDelta = 0;
        if (planet.stability < 50) {
            unrestDelta += (50 - planet.stability) * 0.05 * hours;
        }
        if (planet.isOccupied) {
            unrestDelta += 2 * hours; // Significant unrest from occupation
        }
        
        // Overcrowding. Scaled per hour like every other term here, and computed
        // from the population AFTER growth so it responds the same tick the
        // world tips over rather than one behind.
        if (overpop && planet.population > planet.popCapacity) {
            const deciles = planet.popCapacity > 0
                ? ((planet.population - planet.popCapacity) / planet.popCapacity) * 10
                : 0;
            unrestDelta += deciles * OVERPOP_UNREST_PER_DECILE * (hours / 6);
        }

        // Unrest decays naturally if happiness is high
        if (planet.happiness > 70) {
            unrestDelta -= (planet.happiness - 70) * 0.02 * hours;
        }

        // Communication infrastructure is emergency response: a wired world puts
        // out fires the neglected one lets spread. Only the decay side is scaled —
        // relays do not stop grievances, they stop them compounding.
        if (unrestDelta < 0) {
            unrestDelta *= computeInfrastructureEffects(planet).unrestRecovery;
        }

        planet.unrest = Math.max(0, Math.min(100, planet.unrest + unrestDelta));

        // 3. Stability Feedback
        // High unrest reduces stability
        if (planet.unrest > 30) {
            planet.stability = Math.max(0, planet.stability - (planet.unrest - 30) * 0.1 * hours);
        }
    }

    /**
     * Get productivity multiplier based on population and unrest.
     */
    static getProductivityMultiplier(planet: Planet): number {
        // Base productivity scaled by population density (population / capacity)
        const density = planet.population / Math.max(1, planet.popCapacity);
        const densityBonus = 0.5 + density * 0.5; // Starts at 0.5, scales to 1.0 at full capacity
        
        // Unrest penalty
        const unrestPenalty = planet.unrest / 200; //-0.5 at 100 unrest
        
        return Math.max(0, densityBonus - unrestPenalty);
    }
}
