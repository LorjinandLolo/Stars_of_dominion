import { GameWorldState } from '../game-world-state';
import { Resource, Market, TradeRoute } from './types';
import { updateMarketsAggregated } from './markets';
import { simulateTradeFlows } from './trade';
import { RNG } from './rng';
import { ResourceBundle, ResourceId } from '../economy/economy-types';

/**
 * Initializes default Galactic Markets for all resources at the global level.
 */
export function initializeGalacticMarkets(): Map<string, Market> {
    const markets = new Map<string, Market>();
    // We will track a global market for simplicity, or regional if needed. 
    // The spec asks for a "Galactic Exchange", suggesting global prices.
    const resources = [Resource.METALS, Resource.CHEMICALS, Resource.FOOD, Resource.ENERGY, Resource.RARES];

    for (const res of resources) {
        const key = `galactic:${res}`;
        markets.set(key, {
            theatreId: 'galactic',
            resource: res,
            supply: 10000,
            demand: 10000,
            basePrice: 10,
            volatility: 0.15,
            currentPrice: 10
        });
    }
    return markets;
}

/**
 * Maps the generic ResourceBundle from economy-types to the specific Resource enum in trade-types.
 */
function mapPayloadToResource(bundleKey: string): Resource | null {
    switch (bundleKey.toUpperCase()) {
        case 'METALS': return Resource.METALS;
        case 'CHEMICALS': return Resource.CHEMICALS;
        case 'FOOD': return Resource.FOOD;
        case 'ENERGY': return Resource.ENERGY;
        case 'RARE': return Resource.RARES;
        default: return null;
    }
}

/**
 * Main simulation tick for the Galactic Trade Network.
 * Integrates dynamic market pricing based on live planet production/consumption flows.
 */
export function tickGalacticTrade(
    world: GameWorldState,
    deltaSeconds: number,
    rng: RNG
): void {
    const tradeNetwork = world.economy;

    // 1. Aggregate Planetary Production & Consumption Globally
    const globalProduction = new Map<string, number>();
    const globalConsumption = new Map<string, number>();

    // We sum up the actual per-second baseRates (production) and inferred consumption.
    for (const planet of tradeNetwork.planets.values()) {
        for (const [resKey, prod] of Object.entries(planet.baseRates)) {
            const res = mapPayloadToResource(resKey);
            if (!res || prod === undefined) continue;

            // Multiply per-second rate to get an abstract "volume" metric for the market
            const volume = prod * 3600;
            const key = `galactic:${res}`;
            globalProduction.set(key, (globalProduction.get(key) || 0) + volume);

            // For now, baseline consumption is 80% of base rates, meaning a 20% surplus on average
            // unless war or unrest modifies it.
            const cons = volume * 0.8;
            globalConsumption.set(key, (globalConsumption.get(key) || 0) + cons);
        }
    }

    // 2. Evaluate active Trade Routes logic and interception (Piracy & Tariffs)
    const systemOwners = new Map<string, string>(); // SystemID -> FactionID
    for (const planet of tradeNetwork.planets.values()) {
        if (planet.factionId) {
            systemOwners.set(planet.systemId, planet.factionId);
        }
    }

    // Execute physical flows along Trade Routes
    // Use an empty policies/warstates map for now until we integrate faction states natively
    const tradeFlowsResult = simulateTradeFlows(
        Array.from(tradeNetwork.tradeRoutes?.values() || []),
        tradeNetwork.tradeAgreements || new Map(),
        new Map(),
        tradeNetwork.markets || new Map(),
        new Map(),
        systemOwners,
        rng
    );

    // Format net flow -> Total flow volume intersecting the markets.
    const netGlobalFlows = new Map<string, number>();
    for (const [systemId, flowMap] of tradeFlowsResult.netFlows.entries()) {
        for (const [res, amount] of flowMap.entries()) {
            const key = `galactic:${res}`;
            // Absolute flow represents active market liquidity
            netGlobalFlows.set(key, (netGlobalFlows.get(key) || 0) + Math.abs(amount));
        }
    }

    // 3. Global Market Pricing Algorithm 
    const globalDemandMultipliers = new Map<Resource, number>();
    // If trade efficiency is low, global demand for basics spikes to compensate
    if (world.shared.tradeEfficiency < 0.5) {
        globalDemandMultipliers.set(Resource.FOOD, 1.5);
        globalDemandMultipliers.set(Resource.ENERGY, 1.3);
    }

    // Update the next frame's Market state
    if (!tradeNetwork.markets) tradeNetwork.markets = initializeGalacticMarkets();

    tradeNetwork.markets = updateMarketsAggregated(
        tradeNetwork.markets,
        globalProduction,
        globalConsumption,
        netGlobalFlows,
        globalDemandMultipliers
    );
}
