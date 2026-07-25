import { GameWorldState } from '../game-world-state';
import { Resource, Market, TradeRoute, WarState, PolicyState } from './types';
import { updateMarketsAggregated } from './markets';
import { simulateTradeFlows, updateTradeRoutes, TradeFlowResult } from './trade';
import { buildTradeGraph } from './graph-adapter';
import { tickPiracyInterdiction, spawnPiracyFleet, suppressPiracyFleet, PiracyFleet } from './piracy-service';
import { RNG } from './rng';
import { ResourceBundle, ResourceId } from '../economy/economy-types';

/**
 * Initializes default Galactic Markets for all resources at the global level.
 */
export function initializeGalacticMarkets(): Map<string, Market> {
    const markets = new Map<string, Market>();
    // We will track a global market for simplicity, or regional if needed.
    // The spec asks for a "Galactic Exchange", suggesting global prices.
    const resources: Array<[Resource, number]> = [
        [Resource.METALS, 10],
        [Resource.CHEMICALS, 10],
        [Resource.FOOD, 10],
        [Resource.ENERGY, 10],
        [Resource.RARES, 10],
        // Manufactured goods trade at a premium over raw inputs.
        [Resource.AMMO, 25],
    ];

    for (const [res, basePrice] of resources) {
        const key = `galactic:${res}`;
        markets.set(key, {
            theatreId: 'galactic',
            resource: res,
            supply: 10000,
            demand: 10000,
            basePrice,
            volatility: 0.15,
            currentPrice: basePrice
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
        case 'AMMO': return Resource.AMMO;
        default: return null;
    }
}

/** Market enum → planet stockpile key (settlement needs the lowercase side). */
const RESOURCE_TO_STOCK_KEY: Partial<Record<Resource, ResourceId>> = {
    [Resource.METALS]: 'metals',
    [Resource.CHEMICALS]: 'chemicals',
    [Resource.FOOD]: 'food',
    [Resource.ENERGY]: 'energy',
    [Resource.RARES]: 'rare',
    [Resource.AMMO]: 'ammo',
};

/** Rivalries at or above this escalation level are treated as shooting wars. */
const HOSTILE_ESCALATION_LEVEL = 5;

/**
 * Rebuild per-faction WarStates from live fleet positions and rivalries, so
 * pathfinding and flow rolls see real blockades instead of empty maps.
 */
export function refreshWarStates(world: GameWorldState, systemOwners: Map<string, string>): void {
    const eco = world.economy;
    const hostileOf = new Map<string, Set<string>>();
    for (const riv of world.rivalries.values()) {
        if ((riv.escalationLevel ?? 0) < HOSTILE_ESCALATION_LEVEL) continue;
        if (!hostileOf.has(riv.empireAId)) hostileOf.set(riv.empireAId, new Set());
        if (!hostileOf.has(riv.empireBId)) hostileOf.set(riv.empireBId, new Set());
        hostileOf.get(riv.empireAId)!.add(riv.empireBId);
        hostileOf.get(riv.empireBId)!.add(riv.empireAId);
    }

    const next = new Map<string, WarState>();
    for (const factionId of eco.factions.keys()) {
        const enemies = hostileOf.get(factionId);
        const ws: WarState = {
            factionId,
            ammoDemandMultiplier: enemies?.size ? 1.5 : 1,
            metalDemandMultiplier: enemies?.size ? 1.3 : 1,
            blockadeSystems: new Set<string>(),
            hostileFleetsPresence: new Map<string, number>(),
        };
        if (enemies?.size) {
            for (const fleet of world.movement.fleets.values()) {
                if (!enemies.has(fleet.factionId)) continue;
                if (!fleet.currentSystemId || (fleet.strength ?? 0) < 0.2) continue;
                const sys = fleet.currentSystemId;
                ws.hostileFleetsPresence.set(sys, (ws.hostileFleetsPresence.get(sys) ?? 0) + fleet.strength * 5);
                // Enemy force parked in one of our systems = blockade.
                if (systemOwners.get(sys) === factionId && (ws.hostileFleetsPresence.get(sys) ?? 0) >= 2.5) {
                    ws.blockadeSystems.add(sys);
                }
            }
        }
        next.set(factionId, ws);
    }
    eco.warStates = next;
}

/**
 * Light piracy loop: pirates spawn in low-security systems, prey on routes
 * passing through, and are suppressed by any military fleet parked on top of
 * them (suppressor's faction pockets half the recovered loot).
 * Returns per-route volume lost this tick.
 */
function tickPiracy(world: GameWorldState, routes: TradeRoute[], rng: RNG): Map<string, number> {
    const eco = world.economy;
    if (!(eco.piracyFleets instanceof Map)) eco.piracyFleets = new Map<string, PiracyFleet>();
    const fleets = eco.piracyFleets;

    // 1. Spawn: each low-security system without a pirate camp has a small chance.
    const MAX_PIRATE_FLEETS = 4;
    if (fleets.size < MAX_PIRATE_FLEETS) {
        for (const sys of world.movement.systems.values()) {
            if (fleets.size >= MAX_PIRATE_FLEETS) break;
            const security = (sys as any).security ?? 50;
            if (security >= 30) continue;
            if ([...fleets.values()].some(f => f.systemId === sys.id)) continue;
            if (rng.next() < 0.02) {
                const fleet = spawnPiracyFleet('pirate', sys.id, null, 0.3 + rng.next() * 0.4);
                fleets.set(fleet.id, fleet);
                console.log(`[Piracy] Corsair den established in ${sys.id}`);
            }
        }
    }

    // 2. Suppression: any military fleet parked in the pirate's system fights it.
    for (const [id, pirate] of [...fleets.entries()]) {
        for (const fleet of world.movement.fleets.values()) {
            if (fleet.currentSystemId !== pirate.systemId || (fleet.strength ?? 0) < 0.4) continue;
            const destroyed = suppressPiracyFleet(pirate, fleet.strength * 0.5);
            if (destroyed) {
                const bounty = pirate.lootAccumulated * 0.5;
                const reserves = eco.factions.get(fleet.factionId)?.reserves as Record<string, number> | undefined;
                if (reserves && bounty > 0) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + bounty;
                fleets.delete(id);
                console.log(`[Piracy] Pirates in ${pirate.systemId} destroyed by ${fleet.factionId} (bounty ${Math.round(bounty)})`);
                break;
            }
        }
    }

    // 3. Interdiction against live routes (ratchets route.piracyRisk).
    const lossByRoute = new Map<string, number>();
    const results = tickPiracyInterdiction([...fleets.values()], routes, rng);
    for (const r of results) {
        lossByRoute.set(r.routeId, (lossByRoute.get(r.routeId) ?? 0) + r.volumeLost);
    }
    return lossByRoute;
}

/**
 * Physical + monetary settlement of trade flows: goods leave the seller's
 * capital-system stockpile, arrive at the buyer's, and credits move the other
 * way at the agreed price. Tariff revenue and subsidies hit faction treasuries.
 */
function settleTradeFlows(
    world: GameWorldState,
    flows: TradeFlowResult,
    pirateLossByRoute: Map<string, number>,
    deltaSeconds: number
): void {
    const eco = world.economy;
    const hours = deltaSeconds / 3600;

    const reservesOf = (factionId: string) =>
        eco.factions.get(factionId)?.reserves as Record<string, number> | undefined;

    const planetIn = (factionId: string, systemId: string) =>
        [...eco.planets.values()].find(p => p.factionId === factionId && p.systemId === systemId)
        ?? [...eco.planets.values()].find(p => p.factionId === factionId);

    for (const route of flows.activeRoutes) {
        const agreement = eco.tradeAgreements.get(route.agreementId);
        if (!agreement) continue;
        const stockKey = RESOURCE_TO_STOCK_KEY[agreement.resource];
        if (!stockKey) continue;

        const seller = planetIn(agreement.aFactionId, route.path[0]);
        const buyer = planetIn(agreement.bFactionId, route.path[route.path.length - 1]);
        const sellerReserves = reservesOf(agreement.aFactionId);
        const buyerReserves = reservesOf(agreement.bFactionId);
        if (!seller || !buyer || !sellerReserves || !buyerReserves) continue;

        const ratio = flows.deliveredRatio.get(route.id) ?? 0;
        let volume = agreement.volumePerHour * hours * ratio;
        volume -= (pirateLossByRoute.get(route.id) ?? 0) * hours;
        if (volume <= 0) continue;

        const market = eco.markets.get(`galactic:${agreement.resource}`);
        const price = agreement.priceFormula === 'fixed' && agreement.fixedPrice !== undefined
            ? agreement.fixedPrice
            : market?.currentPrice ?? 10;

        // Clamp to what the seller has and the buyer can afford.
        volume = Math.min(volume, seller.stockpile[stockKey] ?? 0);
        if (price > 0) volume = Math.min(volume, (buyerReserves['CREDITS'] ?? 0) / price);
        if (volume <= 0) continue;

        seller.stockpile[stockKey] = (seller.stockpile[stockKey] ?? 0) - volume;
        buyer.stockpile[stockKey] = (buyer.stockpile[stockKey] ?? 0) + volume;
        const payment = volume * price;
        buyerReserves['CREDITS'] = (buyerReserves['CREDITS'] ?? 0) - payment;
        sellerReserves['CREDITS'] = (sellerReserves['CREDITS'] ?? 0) + payment;
    }

    // Tariff revenue and subsidy costs (computed per-hour inside the flow sim).
    for (const [factionId, revenue] of flows.tariffRevenue) {
        const reserves = reservesOf(factionId);
        if (reserves) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + revenue * hours;
    }
    for (const [factionId, cost] of flows.subsidyCost) {
        const reserves = reservesOf(factionId);
        if (reserves) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) - cost * hours;
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

    // We sum the actual per-second production and the planet's real measured
    // consumption (population upkeep + industrial offtake, see tickConsumption).
    for (const planet of tradeNetwork.planets.values()) {
        for (const [resKey, prod] of Object.entries(planet.currentRates)) {
            const res = mapPayloadToResource(resKey);
            if (!res || prod === undefined) continue;

            // Multiply per-second rate to get an abstract "volume" metric for the market
            const volume = prod * 3600;
            const key = `galactic:${res}`;
            globalProduction.set(key, (globalProduction.get(key) || 0) + volume);

            // Fall back to the legacy 80%-of-production assumption only for
            // planets that predate consumption tracking.
            const consPerSec = planet.consumptionRates?.[resKey as keyof ResourceBundle];
            const cons = consPerSec !== undefined ? consPerSec * 3600 : volume * 0.8;
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

    // 2a. Rebuild war states from live fleet positions + rivalries.
    refreshWarStates(world, systemOwners);

    // 2b. Recompute routes for every agreement: build the trade graph from the
    // movement layer and pathfind respecting policies (DENY/TAX/embargo) and
    // war states (blockade avoidance). Invalidated routes reroute automatically.
    const policies: Map<string, PolicyState> = tradeNetwork.policies || new Map();
    if (tradeNetwork.tradeAgreements?.size) {
        const graph = buildTradeGraph(world);
        tradeNetwork.tradeRoutes = updateTradeRoutes(
            [...tradeNetwork.tradeAgreements.values()],
            tradeNetwork.tradeRoutes || new Map(),
            graph,
            systemOwners,
            tradeNetwork.factions,
            policies,
            tradeNetwork.warStates
        );
    }
    const liveRoutes = Array.from(tradeNetwork.tradeRoutes?.values() || []);

    // 2c. Piracy: spawn/suppress corsair fleets, interdict routes.
    const pirateLossByRoute = tickPiracy(world, liveRoutes, rng);

    // 2d. Execute flows along routes using the live policy/war state.
    const tradeFlowsResult = simulateTradeFlows(
        liveRoutes,
        tradeNetwork.tradeAgreements || new Map(),
        policies,
        tradeNetwork.markets || new Map(),
        tradeNetwork.warStates || new Map(),
        systemOwners,
        rng
    );

    // 2e. Settle: move goods between planet stockpiles, credits between
    // treasuries, tariffs/subsidies to faction treasuries.
    settleTradeFlows(world, tradeFlowsResult, pirateLossByRoute, deltaSeconds);

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
