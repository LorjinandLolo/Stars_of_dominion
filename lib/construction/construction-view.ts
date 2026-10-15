// lib/construction/construction-view.ts
// What the planetary construction panel shows for one system, read from a
// world. Pure, and safe in the client bundle.
//
// The panel used to fetch this from /api/game-construction, which read the
// Next server's in-memory world singleton. Nothing ever loads the live game
// into that singleton: it is a freshly initialised galaxy, so the panel showed
// every capital's STARTING buildings, never a building the player had built,
// and an empty queue (a barracks finished on Aglate never appeared). The live
// world is the one the client already holds from the sync poll, so the panel
// now builds this view from that, and the route keeps serving the same shape
// for anything else that asks.

import type { GameWorldState } from '../game-world-state';
import type { Planet } from './construction-types';
import { getBuildingsForSystem } from './construction-service';
import { computeOrbitalRatings, orbitalSlotCount } from '../orbital/orbital-service';
import { ensureInfrastructureNetwork, computeInfrastructureEffects, networkUpkeepPerHour } from '../infrastructure/infrastructure-service';
import { availableSpecializations, suggestSpecialization, checkQualification } from '../specialization/specialization-service';
import { SPECIALIZATIONS } from '../../data/specializations';

export interface ConstructionView {
    planets: Planet[];
    buildings: ReturnType<typeof getBuildingsForSystem>['buildings'];
    queue: ReturnType<typeof getBuildingsForSystem>['queue'];
    spaceBuildQueue: any[];
    planetLayers: Record<string, unknown>;
    nowSeconds: number;
}

export function buildConstructionView(world: GameWorldState, systemId: string): ConstructionView {
    const state = world.construction;
    const result = getBuildingsForSystem(systemId, state);

    const planets: Planet[] = [];
    for (const planet of state.planets.values()) {
        if (planet.systemId === systemId) planets.push(planet);
    }

    const spaceBuildQueue = (state.spaceBuildQueue ?? []).filter((q: any) => q.systemId === systemId);

    const planetLayers: Record<string, unknown> = {};
    for (const planet of planets) {
        const econ = world.economy?.planets?.get(planet.id);
        ensureInfrastructureNetwork(planet);
        planetLayers[planet.id] = {
            orbital: {
                slotCount: orbitalSlotCount(planet),
                ratings: computeOrbitalRatings(planet, world.nowSeconds),
            },
            infrastructure: {
                effects: computeInfrastructureEffects(planet),
                upkeepPerHour: networkUpkeepPerHour(planet),
            },
            specialization: {
                options: SPECIALIZATIONS.map(s => ({
                    id: s.id,
                    qualification: checkQualification(planet, s.id),
                })),
                availableIds: availableSpecializations(planet).map(s => s.id),
                suggestion: suggestSpecialization(planet),
            },
            storage: econ?.storage ?? null,
            logistics: econ?.logistics ?? null,
            logisticsPriority: econ?.logisticsPriority ?? 'balanced',
            blockade: econ?.blockade ?? null,
            // Needed for a real fill bar: the storage report carries capacity
            // and waste, but the amount actually held lives on the stockpile.
            stockpile: econ?.stockpile ?? null,
        };
    }

    return {
        planets,
        buildings: result.buildings,
        queue: result.queue,
        spaceBuildQueue,
        planetLayers,
        nowSeconds: world.nowSeconds,
    };
}
