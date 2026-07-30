// data/infrastructure-tracks.ts
// Phase 4 — The five engineering tracks a colony builds out beneath its
// buildings. Each is cheap at first and punishing at the top, so a fully
// developed world is a deliberate investment rather than a default state.

import { InfrastructureTrackDefinition, InfrastructureTrackId } from '../lib/infrastructure/infrastructure-types';

export const INFRASTRUCTURE_TRACKS: InfrastructureTrackDefinition[] = [
    {
        id: 'transit',
        name: 'Transit Network',
        description: 'Roads, high-speed transit and planetary rail. Moves crews to sites, materials to yards and divisions to fronts.',
        costPerLevel: { metals: 180, chemicals: 40, food: 0, manpower: 60, credits: 150 },
        costGrowth: 1.6,
        buildTimeSeconds: 900,
        upkeepPerLevel: { credits: 4, metals: 1 },
    },
    {
        id: 'power_grid',
        name: 'Power Grid',
        description: 'Substations, transmission and load balancing. Determines how much generated energy actually reaches a machine.',
        costPerLevel: { metals: 140, chemicals: 90, food: 0, manpower: 40, credits: 200 },
        costGrowth: 1.65,
        buildTimeSeconds: 800,
        upkeepPerLevel: { credits: 6, energy: 2 },
    },
    {
        id: 'comms',
        name: 'Communication Network',
        description: 'Relays and data trunking. Emergency services that arrive, and a government that hears about trouble before it spreads.',
        costPerLevel: { metals: 90, chemicals: 120, food: 0, manpower: 30, credits: 250 },
        costGrowth: 1.55,
        buildTimeSeconds: 700,
        upkeepPerLevel: { credits: 5, energy: 1 },
    },
    {
        id: 'water',
        name: 'Water System',
        description: 'Reservoirs, treatment and irrigation. Unglamorous, and the first thing a growing colony runs out of.',
        costPerLevel: { metals: 120, chemicals: 70, food: 0, manpower: 50, credits: 120 },
        costGrowth: 1.5,
        buildTimeSeconds: 750,
        upkeepPerLevel: { credits: 3, energy: 1 },
    },
    {
        id: 'freight',
        name: 'Freight Terminals',
        description: 'Cargo terminals, interchanges and marshalling yards. Where the warehouse network plugs into everything else.',
        costPerLevel: { metals: 200, chemicals: 60, food: 0, manpower: 70, credits: 220 },
        costGrowth: 1.6,
        buildTimeSeconds: 950,
        upkeepPerLevel: { credits: 5, metals: 1 },
    },
];

export const INFRASTRUCTURE_TRACK_BY_ID: Record<string, InfrastructureTrackDefinition> =
    Object.fromEntries(INFRASTRUCTURE_TRACKS.map(t => [t.id, t]));

export function getTrackDefinition(id: InfrastructureTrackId): InfrastructureTrackDefinition | undefined {
    return INFRASTRUCTURE_TRACK_BY_ID[id];
}
