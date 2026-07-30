// data/specializations.ts
// Phase 5 — The eight things a world can decide to be.
//
// Every entry is a bargain: a large upside paid for with a real downside. A
// mining world is genuinely bad at feeding itself, which is why it needs the
// agricultural world two jumps over.

import { SpecializationDefinition, SpecializationId } from '../lib/specialization/specialization-types';

export const SPECIALIZATIONS: SpecializationDefinition[] = [
    {
        id: 'mining_world',
        name: 'Mining World',
        description: 'Stripped crust, company towns and ore trains running day and night. The empire\'s metals come from worlds like this.',
        tradeoff: 'Poisoned soil and a miserable workforce: little food, unhappy population.',
        requirements: {
            infrastructureLevel: 2,
            buildingsByTag: { metals: 2 },
            buildingsByCategory: { resource: 3 },
        },
        effects: {
            metalsOutput: 1.55,
            chemicalsOutput: 1.15,
            storageCapacity: 1.2,
            foodOutput: 0.65,
            happiness: -8,
            researchOutput: 0.85,
        },
        declareCost: 400,
    },
    {
        id: 'forge_world',
        name: 'Forge World',
        description: 'A planet-wide factory floor. Foundries, assembly halls and a sky the colour of slag.',
        tradeoff: 'Nothing grows and nobody is happy, but everything gets built.',
        requirements: {
            infrastructureLevel: 3,
            buildingsByCategory: { industrial: 3 },
        },
        effects: {
            constructionSpeed: 1.3,
            shipProduction: 1.35,
            metalsOutput: 1.15,
            haulage: 1.2,
            foodOutput: 0.7,
            happiness: -12,
            researchOutput: 0.85,
        },
        declareCost: 700,
    },
    {
        id: 'agricultural_world',
        name: 'Agricultural World',
        description: 'Horizon-to-horizon cultivation feeding a dozen systems that could never feed themselves.',
        tradeoff: 'No industry worth the name, and no laboratories either.',
        requirements: {
            infrastructureLevel: 2,
            buildingsByTag: { food: 2 },
            buildingsByCategory: { resource: 3 },
        },
        effects: {
            foodOutput: 1.65,
            happiness: 6,
            stability: 5,
            storageCapacity: 1.15,
            metalsOutput: 0.7,
            researchOutput: 0.8,
            shipProduction: 0.85,
        },
        declareCost: 350,
    },
    {
        id: 'research_world',
        name: 'Research World',
        description: 'Campuses, reactors and institutes. The work here decides what the rest of the empire is allowed to build.',
        tradeoff: 'An academy is not an arsenal: weak industry, weak defenses.',
        requirements: {
            infrastructureLevel: 3,
            buildingsByCategory: { research: 3 },
        },
        effects: {
            researchOutput: 1.55,
            espionageResistance: 10,
            happiness: 4,
            metalsOutput: 0.7,
            defenseStrength: 0.8,
            troopRecruitment: 0.8,
        },
        declareCost: 800,
    },
    {
        id: 'trade_world',
        name: 'Trade World',
        description: 'Bonded warehouses, exchange floors and a permanent queue of freighters waiting on a berth.',
        tradeoff: 'Wealthy, well-stocked and notoriously badly defended.',
        requirements: {
            infrastructureLevel: 3,
            requiresOrbitalStation: true,
            buildingsByCategory: { logistics: 2 },
        },
        effects: {
            tradeThroughput: 1.45,
            storageCapacity: 1.4,
            haulage: 1.35,
            happiness: 6,
            defenseStrength: 0.75,
            orbitalDefense: 0.9,
            manpowerOutput: 0.85,
        },
        declareCost: 900,
    },
    {
        id: 'fortress_world',
        name: 'Fortress World',
        description: 'Layered defenses, buried command and a garrison that outnumbers the civilian register.',
        tradeoff: 'The whole economy serves the guns. Research and trade suffer for it.',
        requirements: {
            infrastructureLevel: 3,
            buildingsByCategory: { military: 2, defense: 1 },
        },
        effects: {
            defenseStrength: 1.6,
            orbitalDefense: 1.35,
            troopRecruitment: 1.3,
            espionageResistance: 15,
            stability: 8,
            researchOutput: 0.7,
            tradeThroughput: 0.85,
            happiness: -6,
        },
        declareCost: 850,
    },
    {
        id: 'shipyard_world',
        name: 'Shipyard World',
        description: 'The orbit is more built-up than the surface. Keels are laid here that cannot be laid anywhere else.',
        tradeoff: 'Everything is committed to the slipways; the ground economy is an afterthought.',
        requirements: {
            infrastructureLevel: 3,
            orbitalShipyardTier: 2,
            requiresOrbitalStation: true,
        },
        effects: {
            shipProduction: 1.55,
            constructionSpeed: 1.15,
            orbitalDefense: 1.15,
            haulage: 1.2,
            foodOutput: 0.8,
            researchOutput: 0.85,
            happiness: -5,
        },
        declareCost: 1200,
    },
    {
        id: 'capital_world',
        name: 'Capital World',
        description: 'The seat of government. Ministries, parade grounds, and every road on the map leading here.',
        tradeoff: 'Nothing, except that there can only ever be one — and losing it is catastrophic.',
        requirements: {
            infrastructureLevel: 4,
            totalBuildings: 6,
            buildingsByCategory: { society: 2 },
        },
        effects: {
            metalsOutput: 1.1,
            chemicalsOutput: 1.1,
            foodOutput: 1.1,
            energyOutput: 1.1,
            researchOutput: 1.1,
            manpowerOutput: 1.15,
            stability: 15,
            happiness: 10,
            espionageResistance: 20,
            tradeThroughput: 1.15,
        },
        declareCost: 2500,
        uniquePerEmpire: true,
    },
];

export const SPECIALIZATION_BY_ID: Record<string, SpecializationDefinition> =
    Object.fromEntries(SPECIALIZATIONS.map(s => [s.id, s]));

export function getSpecialization(id: SpecializationId | string): SpecializationDefinition | undefined {
    return SPECIALIZATION_BY_ID[id];
}
