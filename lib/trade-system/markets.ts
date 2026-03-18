// ===== file: lib/trade-system/markets.ts =====
import { Market, Resource } from './types';

/**
 * Pure function to update market prices based on supply, demand, and volatility.
 * Uses a bounded stable formula to prevent runaway inflation/deflation.
 */
export function updateMarkets(
    markets: Map<string, Market>,
    planetProduction: Map<string, { [key in Resource]?: number }>, // SystemID -> Production
    planetConsumption: Map<string, { [key in Resource]?: number }>, // SystemID -> Consumption
    tradeFlows: Map<string, { [key in Resource]?: number }>, // TheatreID -> Net Import/Export
    warHooks: Map<string, { metalDemandMult: number, ammoDemandMult: number }> // FactionID -> Multipliers (mapped to theatre?) or TheatreID -> Mults?
    // Simplified: mapping TheatreID -> Demand Modifiers directly or deriving from factions present.
    // Let's assume we pass a map of TheatreID -> Aggregate Demand Multipliers
): Map<string, Market> {
    const nextMarkets = new Map<string, Market>();

    // We assume 'planetProduction/Consumption' can be aggregated per theatre
    // But since the inputs are by SystemID, we need a mapping of System -> Theatre.
    // For this pure function, let's assume the caller has already aggregated prod/cons per theatre
    // OR we change the signature to accept aggregated data.
    // Let's change signature to accept Aggregated Data for purity and simplicity.
    return nextMarkets;
}

/**
 * Revised updateMarkets that expects aggregated data per theatre.
 */
export function updateMarketsAggregated(
    currentMarkets: Map<string, Market>, // key: "theatreId:resource"
    production: Map<string, number>, // key: "theatreId:resource"
    consumption: Map<string, number>, // key: "theatreId:resource"
    netTradeFlow: Map<string, number>, // key: "theatreId:resource" (Positive = Import, Negative = Export)
    globalMultipliers: Map<Resource, number> // Resource -> global demand multiplier (war, etc)
): Map<string, Market> {
    const nextMarkets = new Map<string, Market>();

    for (const [key, market] of currentMarkets.entries()) {
        const prod = production.get(key) || 0;
        const cons = consumption.get(key) || 0;
        const flow = netTradeFlow.get(key) || 0;
        const mult = globalMultipliers.get(market.resource) || 1.0;

        // 1. Update Supply
        // Supply decays slightly (consumption) and grows with production + imports
        // Simple model: NewSupply = OldSupply * 0.9 + Production + Imports - Exports
        // But we want "Market Supply" to represent available stock.
        let newSupply = market.supply * 0.95 + prod + flow;

        // 2. Update Demand
        // Demand is based on consumption * multiplier
        let newDemand = (cons * mult) + (market.demand * 0.05); // heavy weight on current actual consumption

        // Safety clamps
        newSupply = Math.max(1, newSupply);
        newDemand = Math.max(1, newDemand);

        // 3. Calculate Price
        // Ratio > 1 implies shortage -> Price Up
        // Ratio < 1 implies glut -> Price Down
        const eps = 0.001;
        const ratio = (newDemand + eps) / (newSupply + eps);

        // Damping: price shouldn't swing wildly 1:1 with ratio per tick.
        // We target a price based on ratio, and move towards it.
        // TargetMultiplier = ratio ^ volatility
        const targetMultiplier = Math.pow(ratio, market.volatility);

        // Clamp multiplier to avoid 1000x prices or 0.001x prices
        const clampedMult = Math.max(0.2, Math.min(5.0, targetMultiplier));

        const targetPrice = market.basePrice * clampedMult;

        // Move current price towards target (exponential moving average)
        // alpha = 0.1 means 10% move per tick
        const alpha = 0.1;
        let newPrice = market.currentPrice * (1 - alpha) + targetPrice * alpha;

        // Absolute bounds
        newPrice = Math.max(market.basePrice * 0.1, Math.min(market.basePrice * 10, newPrice));

        nextMarkets.set(key, {
            ...market,
            supply: newSupply,
            demand: newDemand,
            currentPrice: newPrice
        });
    }

    return nextMarkets;
}
