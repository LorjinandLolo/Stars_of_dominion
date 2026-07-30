import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getConstructionWorldState, getGameWorldState } from '@/lib/game-world-state-singleton';
import { getBuildingsForSystem } from '@/lib/construction/construction-service';
import { Planet } from '@/lib/construction/construction-types';
import { computeOrbitalRatings, orbitalSlotCount } from '@/lib/orbital/orbital-service';
import { ensureInfrastructureNetwork, computeInfrastructureEffects, networkUpkeepPerHour } from '@/lib/infrastructure/infrastructure-service';
import { availableSpecializations, suggestSpecialization, checkQualification } from '@/lib/specialization/specialization-service';
import { SPECIALIZATIONS } from '@/data/specializations';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const systemId = searchParams.get('systemId');
        
        if (!systemId) {
            return NextResponse.json({ error: 'systemId is required' }, { status: 400 });
        }

        console.log(`[API/game-construction] Fetching data for system: ${systemId}`);

        const state = getConstructionWorldState();
        const result = getBuildingsForSystem(systemId, state);
        
        const planets: Planet[] = [];
        for (const planet of state.planets.values()) {
            if (planet.systemId === systemId) {
                planets.push(planet);
            }
        }

        const world = getGameWorldState();
        const spaceBuildQueue = world.construction.spaceBuildQueue.filter(q => q.systemId === systemId);

        // Planet-layer detail the panel cannot derive on its own: storage and
        // haulage live on the ECONOMY planet, and specialization qualification
        // needs the catalog plus the orbital layer. Keyed by planet id.
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
                    // Every entry with its unmet requirements spelled out, so the
                    // panel can grey an option out AND say why.
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

        return NextResponse.json({
            success: true,
            data: {
                planets,
                buildings: result.buildings,
                queue: result.queue,
                spaceBuildQueue,
                planetLayers,
                nowSeconds: world.nowSeconds,
            }
        }, { status: 200 });
    } catch (err: any) {
        console.error('[API/game-construction] Failed to fetch construction data:', err);
        return NextResponse.json({ success: false, error: err.message || 'Internal error' }, { status: 500 });
    }
}
