import { GameWorldState } from '../game-world-state';
import { Resource, Market, TradeRoute, WarState, PolicyState } from './types';
import { updateMarketsAggregated } from './markets';
import { simulateTradeFlows, updateTradeRoutes, TradeFlowResult } from './trade';
import { buildTradeGraph } from './graph-adapter';
import { suppressRaider, PiracyFleet } from './piracy-service';
import { RNG } from './rng';
import { tickPirateRaids } from '../piracy/raid-service';
import { ensurePiracyState } from '../piracy/organization-service';
import { captureCrew } from '../piracy/counter-piracy-service';
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

/** The umbrella faction every raider fleet flies under. */
const PIRATE_FACTION_ID = 'faction-pirates';
/** A parked fleet weaker than this cannot meaningfully engage raiders. */
const MIN_SUPPRESSOR_STRENGTH = 0.4;
/** Fraction of a suppressor's strength applied to each raider it engages. */
const SUPPRESSION_RATE = 0.5;
/** Share of a band's treasury a destroyed raider was carrying, recovered by the killer. */
const SUPPRESSION_RECOVERY = 0.5;

/**
 * Piracy loop: the raider fleets on the movement map prey on routes passing
 * through the systems they occupy, and are suppressed by any military fleet
 * parked on top of them (suppressor's faction pockets half the recovered loot).
 * Returns per-route volume lost this tick.
 *
 * Pirate system Phase 0: this no longer spawns anything. Raiders are created by
 * the emergence pass in the tick processor and live in world.movement.fleets;
 * world.economy.piracyFleets is now a derived per-system interdiction cache
 * rebuilt from them. Before this change there were two unrelated pirate
 * populations — an abstract one that taxed trade and a physical one on the map
 * that did not — and neither could be suppressed by fighting the other.
 */
function tickPiracy(
    world: GameWorldState,
    routes: TradeRoute[],
    rng: RNG,
    deltaSeconds: number
): Map<string, number> {
    const eco = world.economy;
    const previous = eco.piracyFleets instanceof Map ? eco.piracyFleets : new Map<string, PiracyFleet>();

    // 1. Suppression: any military fleet parked in a raider's system fights it.
    //    Damage lands on the physical fleet — the interdiction record is derived
    //    and would lose the damage on the next rebuild.
    for (const raider of [...world.movement.fleets.values()]) {
        if (raider.factionId !== PIRATE_FACTION_ID || !raider.currentSystemId) continue;
        for (const fleet of world.movement.fleets.values()) {
            if (fleet.factionId === PIRATE_FACTION_ID) continue;
            if (fleet.currentSystemId !== raider.currentSystemId) continue;
            if ((fleet.strength ?? 0) < MIN_SUPPRESSOR_STRENGTH) continue;

            const destroyed = suppressRaider(raider, fleet.strength * SUPPRESSION_RATE);
            if (!destroyed) continue;

            // Recovered plunder comes out of the BAND'S TREASURY, which is where
            // raid proceeds actually live (recordRaid credits it). The camp's
            // lootAccumulated is a per-system display tally that the interdiction
            // pass also writes, so paying a bounty from it minted credits: real
            // money reached the suppressor while the pirates lost nothing.
            const org = raider.organizationId
                ? ensurePiracyState(world).organizations.get(raider.organizationId)
                : undefined;
            const crewShare = org && org.fleetIds.length > 0 ? 1 / org.fleetIds.length : 1;
            const bounty = Math.max(0, (org?.treasury ?? 0) * SUPPRESSION_RECOVERY * crewShare);
            if (org && bounty > 0) org.treasury = Math.max(0, org.treasury - bounty);

            const reserves = eco.factions.get(fleet.factionId)?.reserves as Record<string, number> | undefined;
            if (reserves && bounty > 0) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + bounty;

            // Survivors are taken, not vaporised. This is the only production
            // path that produces a PirateCapture, so without it the whole
            // disposition system — execute, recruit, turn informant, amnesty —
            // and every posted bounty had no way to ever resolve.
            if (org) {
                captureCrew(world, org, fleet.factionId, Math.max(0.1, raider.strength + 1));
            }

            world.movement.fleets.delete(raider.id);
            console.log(`[Piracy] Raider ${raider.id} destroyed by ${fleet.factionId} (bounty ${Math.round(bounty)})`);
            break;
        }
    }

    // 2 & 3. Raiding: the raid service rebuilds the interdiction registry from
    // the surviving raiders, lets each band pick a posture and a raid type, runs
    // the interdiction, and applies everything a raid leaves behind — captured
    // hulls, sabotaged segments, terror, hostages — booking it all against the
    // organization that did it. See docs/pirate-system/operations.md.
    void previous;
    const { lossByRoute } = tickPirateRaids(world, routes, rng, deltaSeconds);
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

    // 2c. Piracy: suppress camped raiders, then resolve this tick's raiding.
    const pirateLossByRoute = tickPiracy(world, liveRoutes, rng, deltaSeconds);

    // 2d. Execute flows along routes using the live policy/war state. Routes a
    // modelled raid already hit are exempt from the abstract piracy roll, which
    // stands in for the raiding the simulation does not model.
    const tradeFlowsResult = simulateTradeFlows(
        liveRoutes,
        tradeNetwork.tradeAgreements || new Map(),
        policies,
        tradeNetwork.markets || new Map(),
        tradeNetwork.warStates || new Map(),
        systemOwners,
        rng,
        new Set(pirateLossByRoute.keys())
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
