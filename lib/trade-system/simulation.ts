import {
    SimulationState,
    TradeAgreement,
    Resource
} from './types';
import { RNG } from './rng';
import { updateMarketsAggregated } from './markets';
import { updateTradeRoutes, simulateTradeFlows } from './trade';
import { updateFactionEconomy } from './economy';
import { evaluateCollapse } from './collapse';
import { applyProductionFocus, calculateDerivedCapacities } from '../economy/derived-logic';
import { recalculatePlanetStats } from '../construction/recalculation';

// Helper to extract system owners map from Planets
function getSystemOwners(planets: Map<string, any>): Map<string, string> {
    const map = new Map<string, string>();
    for (const [id, p] of planets.entries()) {
        if (p.ownerFactionId) map.set(id, p.ownerFactionId);
    }
    return map;
}

/**
 * Runs one tick of the Trade System simulation.
 */
export function runTick(
    state: SimulationState,
    seed: number
): { newState: SimulationState, collapseEvents: any[] } {
    const rng = new RNG(seed + state.tick);

    // 1. Aggregate Planetary Data & Apply Focus/Derived Logic
    const production = new Map<string, number>(); // "theatre:resource" -> amount
    const consumption = new Map<string, number>();
    const factionEnergyProd = new Map<string, number>();
    const factionEnergyLoad = new Map<string, number>();

    const nextPlanets = new Map(state.planets);

    for (const [id, planet] of state.planets.entries()) {
        const ownerId = planet.ownerFactionId || '';
        const policy = state.policies.get(ownerId);
        const faction = state.factions.get(ownerId);

        // Calculate building-based production from construction system
        const stats = recalculatePlanetStats(planet as any);

        // Merge building stats into base production rates
        const baseRates = { ...(planet.productionByResource as any) };
        baseRates[Resource.METALS] = (baseRates[Resource.METALS] || 0) + stats.metalsOutput;
        baseRates[Resource.CHEMICALS] = (baseRates[Resource.CHEMICALS] || 0) + stats.chemicalsOutput;
        baseRates[Resource.FOOD] = (baseRates[Resource.FOOD] || 0) + stats.foodOutput;
        baseRates[Resource.ENERGY] = (baseRates[Resource.ENERGY] || 0) + stats.energyOutput;

        // Apply Production Focus Move
        const focusedRates = applyProductionFocus(
            baseRates, 
            policy?.productionFocus || null
        );

        // Calculate Derived Capacities
        const derived = calculateDerivedCapacities({
            metals: focusedRates[Resource.METALS] || 0,
            chemicals: focusedRates[Resource.CHEMICALS] || 0,
            energy: focusedRates[Resource.ENERGY] || 0,
            food: focusedRates[Resource.FOOD] || 0,
            ammo: focusedRates[Resource.AMMO] || 0,
            rares: focusedRates[Resource.RARES] || 0,
            credits: faction?.creditSupply || 0,
            happiness: planet.localStability,
            infrastructureLevel: (planet as any).infrastructureLevel || 1,
            efficiencyModifier: 1.0 // Todo: add blockade impact
        });

        // Store back (in a real scenario we'd update labels, but for the sim we use them)
        nextPlanets.set(id, {
            ...planet,
            productionByResource: focusedRates
        } as any);

        // Aggregate for Markets
        for (const res of Object.values(Resource)) {
            if ([
                Resource.CONSTRUCTION, 
                Resource.MILITARY_CAP, 
                Resource.RESEARCH_CAP, 
                Resource.CULTURAL_CAP
            ].includes(res)) continue;

            const key = `${planet.theatreId}:${res}`;
            
            const pAmt = focusedRates[res] || 0;
            if (pAmt > 0) production.set(key, (production.get(key) || 0) + pAmt);

            const cAmt = planet.consumptionByResource[res] || 0;
            if (cAmt > 0) consumption.set(key, (consumption.get(key) || 0) + cAmt);
        }

        // Aggregate for Faction Stability
        if (ownerId) {
            factionEnergyProd.set(ownerId, (factionEnergyProd.get(ownerId) || 0) + (focusedRates[Resource.ENERGY] || 0));
            factionEnergyLoad.set(ownerId, (factionEnergyLoad.get(ownerId) || 0) + ((planet as any).energyLoad || 10));
        }
    }

    // 2. Update Trade Routes
    const systemOwners = getSystemOwners(state.planets);
    const agreementsList = Array.from(state.agreements.values());

    const nextRoutes = updateTradeRoutes(
        agreementsList,
        state.routes,
        state.graph,
        systemOwners,
        state.factions,
        state.policies,
        state.warStates
    );

    // 3. Simulate Flows
    const netTrade = new Map<string, number>();
    const flowResult = simulateTradeFlows(
        Array.from(nextRoutes.values()),
        state.agreements,
        state.policies,
        state.markets,
        state.warStates,
        systemOwners,
        rng
    );

    for (const [sysId, resMap] of flowResult.netFlows.entries()) {
        const planet = state.planets.get(sysId);
        if (planet) {
            for (const [res, amount] of resMap.entries()) {
                const key = `${planet.theatreId}:${res}`;
                netTrade.set(key, (netTrade.get(key) || 0) + amount);
            }
        }
    }

    // Now update Markets with real aggregated flows
    const nextMarkets = updateMarketsAggregated(
        state.markets,
        production,
        consumption,
        netTrade,
        new Map() // Global mults (war etc could go here)
    );

    // 4. Update Faction Economy
    const nextFactions = updateFactionEconomy(
        state.factions,
        flowResult.tariffRevenue,
        flowResult.piracyLoss,
        factionEnergyProd,
        factionEnergyLoad
    );

    // 5. Evaluate Collapse
    const collapseEvents = evaluateCollapse(nextFactions, nextPlanets, rng);

    // 6. Return New State
    return {
        newState: {
            ...state,
            tick: state.tick + 1,
            planets: nextPlanets,
            routes: nextRoutes,
            markets: nextMarkets,
            factions: nextFactions
        },
        collapseEvents
    };
}
