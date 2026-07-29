// lib/economy/economy-service.ts
// Pillar 3 — Flow-Based Economy: local production, network trade flow,
// commodity distribution, and drift-based collapse.

import type {
    EconomyWorldState,
    PlanetProduction,
    TradeHub,
    TradeFlowEdge,
    EconomicRegion,
    CollapseState,
    CollapseStage,
    ResourceBundle,
    CommodityFlowResult,
} from './economy-types';
import type { GameWorldState } from '../game-world-state';
import { clampShared, recomputeInfraIntegrity } from '../game-world-state';
import { Resource } from '../trade-system/types';
import { eventBus } from '../movement/event-bus';
import config from '../movement/movement-config.json';
import { calculateBiosphereModifiers } from './biosphere-traits';
import { tickGalacticTrade, initializeGalacticMarkets } from '../trade-system/trade-network-service';
import { RNG } from '../trade-system/rng';
import { tickConstructionGlobal } from '../construction/construction-service';
import { initializePlanetServices, updatePlanetServices } from './services/service-engine';
import { tickAllCompanies } from './corporate/company-registry';
import { getEmpireDoctrineModifiers } from '../doctrine/doctrine-service';
import { tickStorage, snapshotStorables, buildStorageProfiles } from '../logistics/storage-service';
import type { StockpileSnapshot } from '../logistics/storage-service';
import { tickDistribution, chainThroughputMultiplier, poolingEfficiency } from '../logistics/distribution-service';

// Shared RNG instance for trade simulation (seeded deterministically)
const tradeRng = new RNG(42);

const econ = config.economy;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 1): number {
    return Math.max(lo, Math.min(hi, v));
}

function addBundles(a: ResourceBundle, b: ResourceBundle): ResourceBundle {
    const result: ResourceBundle = { ...a };
    for (const [k, v] of Object.entries(b)) {
        const key = k as keyof ResourceBundle;
        result[key] = (result[key] ?? 0) + (v ?? 0);
    }
    return result;
}

function scaleBundles(b: ResourceBundle, factor: number): ResourceBundle {
    const result: ResourceBundle = {};
    for (const [k, v] of Object.entries(b)) {
        result[k as keyof ResourceBundle] = (v ?? 0) * factor;
    }
    return result;
}

function bundleSum(b: ResourceBundle): number {
    return Object.values(b).reduce((s, v) => s + (v ?? 0), 0);
}

function planetBaseRates(planet: PlanetProduction): ResourceBundle {
    const base = econ.production.baseRates;
    const mults = (econ.production.planetTypeMults as Record<string, ResourceBundle>)[planet.planetType] ?? {};
    const result: ResourceBundle = {};

    // 1. Calculate base output multiplied by planetary industry typing
    for (const [k, v] of Object.entries(base)) {
        const key = k as keyof ResourceBundle;
        const mult = (mults as Record<string, number | undefined>)[key] ?? 1.0;
        result[key] = v * mult;
    }

    // 2. Add flat narrative Biosphere modifiers computed from SWN world tags
    const biosphereBonus = calculateBiosphereModifiers(planet.tags || []);
    for (const [k, v] of Object.entries(biosphereBonus)) {
        const key = k as keyof ResourceBundle;
        result[key] = Math.max(0, (result[key] ?? 0) + (v ?? 0)); // Prevent negative gross total production
    }

    return result;
}

// ─── Faction Economy Modifiers (tech + doctrine) ─────────────────────────────

export interface FactionEconomyMods {
    /** Multiplier on raw extraction rates. */
    production: number;
    /** Multiplier on recipe (manufactured) output. */
    manufacturing: number;
    /** Multiplier on state tax revenue. */
    tax: number;
    /** Multiplier on service upkeep costs. */
    upkeep: number;
    /** Multiplier on population growth rate. */
    popGrowth: number;
}

const NEUTRAL_MODS: FactionEconomyMods = { production: 1, manufacturing: 1, tax: 1, upkeep: 1, popGrowth: 1 };

/**
 * Aggregate a faction's economic modifiers from researched tech
 * (PlayerTechState.globalModifiers — written by the tech engine and, until
 * now, read by nothing) and its active doctrines.
 */
export function getFactionEconomyMods(world: GameWorldState, factionId: string): FactionEconomyMods {
    const tech = (world.tech?.get?.(factionId)?.globalModifiers ?? {}) as Record<string, number>;
    let doctrine: Record<string, number> = {};
    try {
        doctrine = getEmpireDoctrineModifiers(world, factionId);
    } catch { /* doctrine state absent on minimal worlds */ }

    return {
        production: (tech['eco_production_mult'] ?? 1) * (1 + (doctrine['productionCoordination'] ?? 0)),
        manufacturing: tech['eco_manufacturing_mult'] ?? 1,
        tax: (tech['eco_tax_mult'] ?? 1) * (1 + (doctrine['taxationRate'] ?? 0)),
        upkeep: tech['eco_upkeep_mult'] ?? 1,
        popGrowth: 1 + (doctrine['popGrowth'] ?? 0),
    };
}

// ─── Pillar 3A: Local Production ──────────────────────────────────────────────

/**
 * Advance planet production by deltaSeconds.
 * Accrues to stockpile; capped by build ceilings (not modelled yet — future work).
 */
export function tickProduction(
    planet: PlanetProduction,
    deltaSeconds: number,
    world: GameWorldState,
    mods: FactionEconomyMods = NEUTRAL_MODS
): void {
    // 1. Initialize Default Data-Driven Services (For unseeded planets)
    if (!planet.services) {
        planet.services = {};
        initializePlanetServices(planet);
    }

    // 2. Resolve Service Upkeeps, Coverage, and Aggregate Yield Modifiers.
    // Credit upkeep is paid from the owning faction's treasury.
    const factionReserves = world.economy.factions.get(planet.factionId)?.reserves as Record<string, number> | undefined;
    const gridEfficiency = updatePlanetServices(planet, deltaSeconds, factionReserves, mods.upkeep);

    // Doctrine-driven population growth adjustment (services set the baseline).
    planet.demographics.growthRate *= mods.popGrowth;

    // 3. Compute Production Modifiers
    const rates = planetBaseRates(planet);

    // Production focus policy (ECON_SET_FOCUS): +25% on the chosen resource,
    // −10% on everything else. Was only ever read by dead simulation code.
    const focus = world.economy.policies?.get?.(planet.factionId)?.productionFocus;
    if (focus) {
        const focusKey = MARKET_RESOURCE_TO_KEY[focus];
        if (focusKey) {
            for (const k of Object.keys(rates)) {
                const key = k as keyof ResourceBundle;
                rates[key] = (rates[key] ?? 0) * (key === focusKey ? 1.25 : 0.9);
            }
        }
    }

    // If the grid fails, it zeroes out industrial output efficiency natively
    let efficiencyMod = gridEfficiency - (world.shared.seasonalModifiers['tradeEfficiency'] ?? 0) * 0.3;
    efficiencyMod = Math.max(0, efficiencyMod);

    // 4. Update Stockpiles — raw extraction only. Goods covered by a recipe are
    // MANUFACTURED below: they consume stockpile inputs instead of appearing free.
    const recipes = econ.production.recipes as unknown as Array<{
        output: string;
        inputs: Record<string, number>;
        happinessScaled?: boolean;
    }>;
    const manufactured = new Set(recipes.map(r => r.output));

    for (const [k, v] of Object.entries(rates)) {
        const key = k as keyof ResourceBundle;
        if (manufactured.has(key)) continue;
        const effectiveRate = (v ?? 0) * efficiencyMod * mods.production;
        planet.stockpile[key] = (planet.stockpile[key] ?? 0) + effectiveRate * deltaSeconds;
        planet.currentRates[key] = effectiveRate; // Track effective rate
    }

    // 4b. Production chains, in declared tier order (so e.g. luxury exists
    // before cultural tries to consume it). Output throttled by the scarcest
    // input (bottleneck ratio); inputs are drawn from the planet stockpile.
    const mfgDraw: ResourceBundle = {}; // per-second input draw, reported as demand
    for (const recipe of recipes) {
        const key = recipe.output as keyof ResourceBundle;
        let desired = (rates[key] ?? 0) * deltaSeconds * efficiencyMod * mods.manufacturing;
        // Planetary haulage gates the chain: inputs sitting in a silo the depot
        // network cannot reach are inputs the factory never sees. The military /
        // civilian split means prioritising one lane genuinely starves the other.
        desired *= chainThroughputMultiplier(planet, recipe.output);
        if (recipe.happinessScaled) desired *= planet.happiness / 100;
        if (desired <= 0) {
            planet.currentRates[key] = 0;
            continue;
        }

        let ratio = 1;
        for (const [inK, perUnit] of Object.entries(recipe.inputs)) {
            const need = desired * perUnit;
            if (need <= 0) continue;
            const have = planet.stockpile[inK as keyof ResourceBundle] ?? 0;
            ratio = Math.min(ratio, have / need);
        }
        ratio = clamp(ratio);

        const actual = desired * ratio;
        for (const [inK, perUnit] of Object.entries(recipe.inputs)) {
            const inKey = inK as keyof ResourceBundle;
            const draw = actual * perUnit;
            planet.stockpile[inKey] = Math.max(0, (planet.stockpile[inKey] ?? 0) - draw);
            mfgDraw[inKey] = (mfgDraw[inKey] ?? 0) + draw / deltaSeconds;
        }
        planet.stockpile[key] = (planet.stockpile[key] ?? 0) + actual;
        planet.currentRates[key] = actual / deltaSeconds;
    }

    // 5. Research and military capacity
    planet.derived.research = planet.currentRates['research'] ?? 0;
    planet.derived.military = clamp((planet.currentRates['military'] ?? 0) / (econ.production.baseRates.military * 2.2));

    // 6. Consumption: population upkeep + industrial offtake. Deducted from the
    // stockpile so it only holds true surplus; the aggregate (including the
    // manufacturing draw above) feeds real market demand.
    tickConsumption(planet, deltaSeconds, mfgDraw);

    // 7. Local prices from stock cover vs local demand
    updateLocalPrices(planet);
}

/** Population + industrial resource drain for one planet. */
function tickConsumption(planet: PlanetProduction, deltaSeconds: number, mfgDraw?: ResourceBundle): void {
    const cc = econ.consumption;
    const hours = deltaSeconds / 3600;
    const pop = planet.demographics?.population ?? 0;

    const consumption: ResourceBundle = {
        food: (pop * cc.foodPerPopPerHour) / 3600,
        energy: (pop * cc.energyPerPopPerHour) / 3600,
    };
    // Residual industrial offtake (construction industry etc.) on top of the
    // real production-chain draw.
    for (const [k, factor] of Object.entries(cc.industrialOfftakeFactors)) {
        const key = k as keyof ResourceBundle;
        consumption[key] = (consumption[key] ?? 0) + (planet.currentRates[key] ?? 0) * (factor as number);
    }

    let essentialsShort = false;
    for (const [k, ratePerSec] of Object.entries(consumption)) {
        const key = k as keyof ResourceBundle;
        const want = (ratePerSec ?? 0) * deltaSeconds;
        if (want <= 0) continue;
        const available = planet.stockpile[key] ?? 0;
        const eaten = Math.min(available, want);
        planet.stockpile[key] = available - eaten;
        if ((key === 'food' || key === 'energy') && eaten < want * 0.999) {
            essentialsShort = true;
        }
    }
    // Reported demand = what was deducted here + what manufacturing already
    // drew this tick (deducted in the recipe loop, so only reported here).
    const reported: ResourceBundle = { ...consumption };
    for (const [k, v] of Object.entries(mfgDraw ?? {})) {
        const key = k as keyof ResourceBundle;
        reported[key] = (reported[key] ?? 0) + (v ?? 0);
    }
    planet.consumptionRates = reported;
    planet.essentialShortage = essentialsShort;

    if (essentialsShort) {
        planet.happiness = Math.max(0, planet.happiness - cc.shortageHappinessDriftPerHour * hours);
        planet.instability = Math.min(100, planet.instability + cc.shortageInstabilityDriftPerHour * hours);
    }
}

/**
 * Local price per resource: base price scaled by how far the stockpile is from
 * a target "days of cover" relative to local consumption. Scarce → expensive.
 */
function updateLocalPrices(planet: PlanetProduction): void {
    const mc = econ.market;
    const basePrices = mc.localBasePrices as Record<string, number>;
    const prices: ResourceBundle = {};
    const keys = new Set([
        ...Object.keys(planet.currentRates),
        ...Object.keys(planet.consumptionRates ?? {}),
    ]);
    for (const k of keys) {
        const key = k as keyof ResourceBundle;
        const demandPerHour = (planet.consumptionRates?.[key] ?? 0) * 3600;
        const targetStock = Math.max(demandPerHour * mc.localStockCoverHours, 1);
        const stock = Math.max(planet.stockpile[key] ?? 0, 0.001);
        const mult = Math.max(mc.localPriceMin, Math.min(mc.localPriceMax, Math.pow(targetStock / stock, mc.localPriceElasticity)));
        prices[key] = (basePrices[key] ?? 10) * mult;
    }
    planet.localPrices = prices;
}

// ─── Pillar 3A½: Faction Taxation ─────────────────────────────────────────────

/** Market-priced resources eligible for the production tax skim. */
const TAXABLE_RESOURCES: Array<[keyof ResourceBundle, Resource]> = [
    ['metals', Resource.METALS],
    ['chemicals', Resource.CHEMICALS],
    ['food', Resource.FOOD],
    ['energy', Resource.ENERGY],
    ['rare', Resource.RARES],
];

/**
 * Collect state taxes on planetary production. The government skims a fraction
 * of each planet's newly produced market goods and monetizes it at the current
 * galactic price, crediting the owning faction's CREDITS reserve. This is the
 * primary faction income stream — without it reserves only ever drain.
 */
export function collectFactionTaxes(
    ecoWorld: EconomyWorldState,
    deltaSeconds: number,
    modsByFaction?: Map<string, FactionEconomyMods>
): void {
    const taxRate = econ.taxation.productionTaxRate;
    if (taxRate <= 0) return;

    for (const planet of ecoWorld.planets.values()) {
        const faction = ecoWorld.factions.get(planet.factionId);
        if (!faction) continue;
        const taxMult = modsByFaction?.get(planet.factionId)?.tax ?? 1;

        let credits = 0;
        for (const [resKey, marketRes] of TAXABLE_RESOURCES) {
            const produced = (planet.currentRates[resKey] ?? 0) * deltaSeconds;
            if (produced <= 0) continue;
            // Skim from the stockpile the production tick just filled — never more
            // than what is actually on hand.
            const available = planet.stockpile[resKey] ?? 0;
            const taken = Math.min(available, produced * taxRate);
            if (taken <= 0) continue;
            planet.stockpile[resKey] = available - taken;
            const price = ecoWorld.markets.get(`galactic:${marketRes}`)?.currentPrice ?? 10;
            credits += taken * price;
        }

        if (credits > 0) {
            faction.reserves[Resource.CREDITS] = (faction.reserves[Resource.CREDITS] ?? 0) + credits * taxMult;
        }
    }
}

// ─── Imperial Internal Distribution ──────────────────────────────────────────

const ESSENTIAL_RESOURCES: Array<keyof ResourceBundle> = ['food', 'energy'];

/**
 * Imperial-market tier: pool essential goods between same-faction planets in
 * the same system, allocated proportionally to each planet's demand. Without
 * this, an agricultural colony sits on a food mountain while the industrial
 * capital next door starves.
 */
export function tickInternalDistribution(ecoWorld: EconomyWorldState): void {
    const groups = new Map<string, PlanetProduction[]>();
    for (const planet of ecoWorld.planets.values()) {
        const key = `${planet.factionId}:${planet.systemId}`;
        const group = groups.get(key);
        if (group) group.push(planet);
        else groups.set(key, [planet]);
    }

    for (const group of groups.values()) {
        if (group.length < 2) continue;
        // Pooling is only as good as the local distribution networks. Goods that
        // arrive in orbit still have to reach the people who need them, so a
        // congested system equalizes partially rather than perfectly.
        const pooling = poolingEfficiency(group);
        for (const res of ESSENTIAL_RESOURCES) {
            let totalStock = 0;
            let totalDemand = 0;
            for (const p of group) {
                totalStock += p.stockpile[res] ?? 0;
                totalDemand += p.consumptionRates?.[res] ?? 0;
            }
            if (totalStock <= 0 || totalDemand <= 0) continue;
            // Blend between "keep your own" and "everyone on the same hours of
            // cover". The blend conserves the group total either way.
            for (const p of group) {
                const share = (p.consumptionRates?.[res] ?? 0) / totalDemand;
                const own = p.stockpile[res] ?? 0;
                p.stockpile[res] = own * (1 - pooling) + totalStock * share * pooling;
            }
        }
    }
}

// ─── Galactic Market Orders ───────────────────────────────────────────────────

/** Reverse map of TAXABLE_RESOURCES plus manufactured tradables: market enum → stockpile key. */
const MARKET_RESOURCE_TO_KEY: Partial<Record<Resource, keyof ResourceBundle>> = {
    ...Object.fromEntries(TAXABLE_RESOURCES.map(([key, res]) => [res, key])),
    [Resource.AMMO]: 'ammo',
};

export interface MarketOrderResult {
    success: boolean;
    reason?: string;
    unitsFilled?: number;
    creditsDelta?: number;
    pricePerUnit?: number;
}

/**
 * Settle a faction buy/sell order against the galactic market at the current
 * price (plus a broker spread). Sells draw goods from a planet stockpile;
 * buys deliver to one. Order volume nudges market supply/demand so large
 * trades move the price on subsequent ticks.
 */
export function executeMarketOrder(
    world: GameWorldState,
    factionId: string,
    side: 'buy' | 'sell',
    resource: Resource,
    amount: number,
    planetId?: string
): MarketOrderResult {
    const mc = econ.market;
    const eco = world.economy;
    const fail = (reason: string): MarketOrderResult => ({ success: false, reason });

    const faction = eco.factions.get(factionId);
    if (!faction) return fail('Faction has no economy record.');

    const stockKey = MARKET_RESOURCE_TO_KEY[resource];
    if (!stockKey) return fail(`${resource} is not traded on the galactic exchange.`);

    const market = eco.markets.get(`galactic:${resource}`);
    if (!market) return fail('Galactic market is not initialized.');

    const qty = Math.min(Math.max(Math.floor(amount), 1), mc.maxOrderVolume);

    // Settle against a specific owned planet, defaulting to the faction's first.
    let planet = planetId ? eco.planets.get(planetId) : undefined;
    if (planet && planet.factionId !== factionId) return fail('Planet is not controlled by your faction.');
    if (!planet) {
        planet = [...eco.planets.values()].find(p => p.factionId === factionId);
    }
    if (!planet) return fail('No owned planet available to settle goods.');

    const price = market.currentPrice;

    if (side === 'buy') {
        const cost = qty * price * (1 + mc.orderSpread);
        const held = faction.reserves[Resource.CREDITS] ?? 0;
        if (held < cost) return fail(`Insufficient credits: need ${Math.ceil(cost)}, have ${Math.floor(held)}.`);
        faction.reserves[Resource.CREDITS] = held - cost;
        planet.stockpile[stockKey] = (planet.stockpile[stockKey] ?? 0) + qty;
        market.supply = Math.max(1, market.supply - qty);
        market.demand += qty * 0.5;
        return { success: true, unitsFilled: qty, creditsDelta: -cost, pricePerUnit: price };
    } else {
        const held = planet.stockpile[stockKey] ?? 0;
        if (held < qty) return fail(`Insufficient stockpile: need ${qty} ${stockKey}, have ${Math.floor(held)}.`);
        planet.stockpile[stockKey] = held - qty;
        const proceeds = qty * price * (1 - mc.orderSpread);
        faction.reserves[Resource.CREDITS] = (faction.reserves[Resource.CREDITS] ?? 0) + proceeds;
        market.supply += qty;
        return { success: true, unitsFilled: qty, creditsDelta: proceeds, pricePerUnit: price };
    }
}

// ─── Pillar 3B: Network Trade Flow ────────────────────────────────────────────

/**
 * Recompute trade flow across all route edges.
 * Applies hub compounding multipliers and disruption penalties.
 * Lazy: only recalculates when flow is stale.
 */
export function tickTradeFlow(
    ecoWorld: EconomyWorldState,
    world: GameWorldState,
    deltaSeconds: number
): void {
    const tf = econ.tradeFlow;
    const staleAfter = tf.flowUpdateIntervalSeconds;
    const lastUpdate = ecoWorld.lastFlowUpdateAt;
    const now = world.nowSeconds;

    if (now - lastUpdate < staleAfter) return; // throttle

    let totalEfficiency = 0;
    let edgeCount = 0;

    // 1. Recompute hub multipliers
    for (const hub of ecoWorld.tradeHubs.values()) {
        const routeBonus = Math.min(tf.maxHubBonus, hub.routeCount * tf.hubBonusPercentPerRoute);
        hub.hubMultiplier = 1 + routeBonus;
    }

    // 2. Recompute flow per edge
    for (const [segId, edge] of ecoWorld.tradeFlowEdges) {
        // Look up the corresponding trade segment for status
        const seg = world.movement.tradeSegments.get(segId);
        let eff = 1.0;

        if (seg) {
            if (seg.status === 'disrupted') eff *= (1 - tf.disruptionMultiplierPenalty);
            if (seg.status === 'blockaded') eff *= (1 - tf.blockadeMultiplierPenalty);
            if (seg.status === 'collapsed') eff *= (1 - tf.collapseMultiplierPenalty);
            if (seg.status === 'rerouted') eff *= (1 - tf.rerouteEfficiencyLoss);
        }

        // Apply seasonal trade volatility modifier
        const seasonPressure = world.shared.seasonalModifiers['tradeEfficiency'] ?? 0;
        eff *= (1 - seasonPressure * 0.5);

        edge.efficiencyMultiplier = clamp(eff);

        // Apply hub multipliers on both endpoints
        const fromHub = ecoWorld.tradeHubs.get(edge.fromSystemId);
        const toHub = ecoWorld.tradeHubs.get(edge.toSystemId);
        const hubMult = (fromHub?.hubMultiplier ?? 1.0) * (toHub?.hubMultiplier ?? 1.0);

        // Source planet's stockpile drains into flow
        const fromPlanet = [...ecoWorld.planets.values()].find(p => p.systemId === edge.fromSystemId);
        if (fromPlanet) {
            const drainRate = scaleBundles(fromPlanet.currentRates, 0.5 * eff * hubMult);
            edge.flowPerHour = drainRate;
            // Drain from stockpile (up to what's available)
            const drain = scaleBundles(drainRate, deltaSeconds / 3600);
            const toPlanet = [...ecoWorld.planets.values()].find(p => p.systemId === edge.toSystemId);
            for (const [k, v] of Object.entries(drain)) {
                const key = k as keyof ResourceBundle;
                // Only move what the source actually has on hand. Previously the source was
                // clamped to what it held while the destination received the full requested
                // amount, fabricating resources every tick when the source ran short.
                const available = fromPlanet.stockpile[key] ?? 0;
                const moved = Math.max(0, Math.min(available, v ?? 0));
                fromPlanet.stockpile[key] = available - moved;
                if (toPlanet) {
                    toPlanet.stockpile[key] = (toPlanet.stockpile[key] ?? 0) + moved;
                }
            }
        }

        totalEfficiency += eff;
        edgeCount++;
    }

    // 3. Write aggregate trade efficiency to shared state
    if (edgeCount > 0) {
        world.shared.tradeEfficiency = clampShared(totalEfficiency / edgeCount);
    }

    ecoWorld.lastFlowUpdateAt = now;
}

// ─── Pillar 3C: Commodity Distribution ───────────────────────────────────────

/**
 * Distribute luxury/cultural/rare goods from trade hubs to nearby planets.
 * Returns a distribution result with delivery amounts and scarcity flags.
 */
export function tickCommodityDistribution(
    ecoWorld: EconomyWorldState,
    world: GameWorldState,
    deltaSeconds: number
): CommodityFlowResult {
    const cc = econ.commodities;
    const hours = deltaSeconds / 3600;
    const deliveries = new Map<string, ResourceBundle>();
    const scarcePlanetIds: string[] = [];
    const COMMODITY_KEYS: Array<keyof ResourceBundle> = ['luxury', 'cultural', 'rare'];
    let totalDelivered = 0;
    let totalDemand = 0;

    for (const planet of ecoWorld.planets.values()) {
        const stockLux = planet.stockpile['luxury'] ?? 0;
        const stockCult = planet.stockpile['cultural'] ?? 0;
        const stockRare = planet.stockpile['rare'] ?? 0;
        const totalCommodity = stockLux + stockCult + stockRare;
        const demand = 1.0; // normalized demand per planet per hour

        // Scale delivery by available stock and trade efficiency
        const deliveryFraction = Math.min(1.0, totalCommodity * world.shared.tradeEfficiency);
        const delivered: ResourceBundle = {
            luxury: stockLux * deliveryFraction * hours,
            cultural: stockCult * deliveryFraction * hours,
            rare: stockRare * deliveryFraction * hours,
        };

        // Consume the delivered commodities from the stockpile. Without this, the same
        // standing stock granted happiness every tick forever (infinite luxury economy).
        planet.stockpile['luxury'] = Math.max(0, stockLux - (delivered.luxury ?? 0));
        planet.stockpile['cultural'] = Math.max(0, stockCult - (delivered.cultural ?? 0));
        planet.stockpile['rare'] = Math.max(0, stockRare - (delivered.rare ?? 0));

        deliveries.set(planet.planetId, delivered);
        totalDelivered += deliveryFraction;
        totalDemand += demand;

        const isScarce = deliveryFraction < econ.collapse.commodityShortageThreshold;
        planet.commodityScarcity = isScarce;

        if (isScarce) {
            scarcePlanetIds.push(planet.planetId);
            // Scarcity drives instability
            planet.instability = Math.min(100, planet.instability + cc.scarcityInstabilityDriftPerHour * hours);
            // Espionage vulnerability increases (written to shared state below)
        } else if (!planet.essentialShortage) {
            // Happiness bonus from commodity access — luxuries can't paper over
            // a population that is starving or without power.
            const happinessGain = Math.min(
                cc.maxHappinessBonusPerPlanet,
                totalCommodity * cc.baseHappinessPerUnit * hours
            );
            planet.happiness = Math.min(100, planet.happiness + happinessGain);
            planet.instability = Math.max(0, planet.instability - 0.2 * hours);
        }
    }

    const commodityAccessRatio = totalDemand > 0 ? clamp(totalDelivered / totalDemand) : 1;
    world.shared.commodityAccess = commodityAccessRatio;

    // Scarcity increases espionage vulnerability
    if (commodityAccessRatio < econ.collapse.commodityShortageThreshold) {
        world.shared.espionagePressure = clampShared(
            world.shared.espionagePressure + cc.scarcityEspionageVulnerabilityBonus * hours
        );
    }

    return { deliveries, scarcePlanetIds, commodityAccessRatio };
}

// ─── Pillar 3D: Collapse State ────────────────────────────────────────────────

const STAGE_ORDER: CollapseStage[] = ['stable', 'strained', 'critical', 'collapsing'];

function nextStage(current: CollapseStage): CollapseStage {
    const idx = STAGE_ORDER.indexOf(current);
    return STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];
}

function prevStage(current: CollapseStage): CollapseStage {
    const idx = STAGE_ORDER.indexOf(current);
    return STAGE_ORDER[Math.max(idx - 1, 0)];
}

/**
 * Advance collapse state for all economic regions by deltaSeconds.
 * No instant bankruptcy — all changes are drift-based.
 */
export function tickCollapseState(
    ecoWorld: EconomyWorldState,
    world: GameWorldState,
    deltaSeconds: number
): void {
    const cc = econ.collapse;
    const hours = deltaSeconds / 3600;

    for (const region of ecoWorld.regions.values()) {
        const collapse = ecoWorld.collapseStates.get(region.id);
        if (!collapse) continue;

        const isEfficiencyLow = region.tradeEfficiency < 0.5;
        const isCommodityLow = world.shared.commodityAccess < cc.commodityShortageThreshold;
        const isSeasonPressured = (world.shared.seasonalModifiers['tradeEfficiency'] ?? 0) > 0.1;

        // Accumulate pressure
        if (isEfficiencyLow || isCommodityLow || isSeasonPressured) {
            let pressureRate = cc.inefficiencyDriftRatePerHour;
            if (isEfficiencyLow) pressureRate += cc.inefficiencyDriftRatePerHour * 1.5;
            if (isCommodityLow) pressureRate += cc.inefficiencyDriftRatePerHour * 2.0;
            if (isSeasonPressured) pressureRate += cc.inefficiencyDriftRatePerHour * 0.5;
            collapse.pressure = Math.min(1, collapse.pressure + pressureRate * hours);
        } else {
            // Recovery
            collapse.pressure = Math.max(0, collapse.pressure - cc.collapseRecoveryRatePerHour * hours);
        }

        // Regional identity drift when collapse is persistent
        if (collapse.stage === 'critical' || collapse.stage === 'collapsing') {
            region.identityDrifting = true;
            world.shared.stability = clampShared(
                world.shared.stability - cc.regionalIdentityShiftRate * hours
            );
        } else {
            region.identityDrifting = false;
        }

        // Stage advance when pressure crosses threshold
        const oldStage = collapse.stage;
        if (collapse.pressure > 0.75 && collapse.stage !== 'collapsing') {
            collapse.stage = nextStage(collapse.stage);
            collapse.cause = buildCollapseCause(isEfficiencyLow, isCommodityLow, isSeasonPressured);
        } else if (collapse.pressure < 0.20 && collapse.stage !== 'stable') {
            collapse.stage = prevStage(collapse.stage);
        }

        region.collapseStage = collapse.stage;
        region.collapsePressure = collapse.pressure;
        region.tradeEfficiency = clamp(world.shared.tradeEfficiency * (1 - collapse.pressure * 0.5));
    }
}

function buildCollapseCause(efficiency: boolean, commodity: boolean, season: boolean): string {
    const parts: string[] = [];
    if (efficiency) parts.push('trade inefficiency');
    if (commodity) parts.push('commodity scarcity');
    if (season) parts.push('seasonal pressure');
    return parts.length > 0 ? `Accumulated pressure from ${parts.join(', ')}` : 'General instability';
}

/**
 * Compute the normalized 0–1 trade efficiency for a faction's regions.
 * Writes to world.shared.tradeEfficiency.
 */
export function computeTradeEfficiency(
    ecoWorld: EconomyWorldState,
    world: GameWorldState
): number {
    const regionEffs = [...ecoWorld.regions.values()].map(r => r.tradeEfficiency);
    if (regionEffs.length === 0) return 1;
    const avg = regionEffs.reduce((a, b) => a + b, 0) / regionEffs.length;
    world.shared.tradeEfficiency = clampShared(avg);
    return avg;
}

/**
 * Master economy tick. Call every major sim tick.
 */
export function tickEconomy(
    world: GameWorldState,
    deltaSeconds: number
): void {
    const eco = world.economy;

    // 0. Construction Tick (Global) — surface, orbital and space queues
    tickConstructionGlobal(world, deltaSeconds);

    // Markets must exist before taxation prices the skim. Merge in any market
    // added since the snapshot was written (e.g. AMMO on pre-phase-3 saves).
    if (!eco.markets || eco.markets.size === 0) {
        eco.markets = initializeGalacticMarkets();
    } else {
        for (const [key, market] of initializeGalacticMarkets()) {
            if (!eco.markets.has(key)) eco.markets.set(key, market);
        }
    }

    // 0½. Aggregate per-faction tech + doctrine modifiers once per tick.
    const modsByFaction = new Map<string, FactionEconomyMods>();
    for (const factionId of eco.factions.keys()) {
        modsByFaction.set(factionId, getFactionEconomyMods(world, factionId));
    }

    // 0¾. Snapshot storable stock BEFORE anything moves. The storage clamp needs
    // to tell "arrived this tick and does not fit" (wasted outright) apart from
    // "was already over capacity" (drains gradually).
    const storageSnapshots = new Map<string, StockpileSnapshot>();
    for (const planet of eco.planets.values()) {
        storageSnapshots.set(planet.planetId, snapshotStorables(planet));
    }

    // 0⅞. Distribution. Must precede production: the production chains read the
    // channel multipliers it derives. Storage profiles are computed once here and
    // reused by the end-of-tick clamp.
    const storageProfiles = buildStorageProfiles(world);
    tickDistribution(world, storageProfiles);

    // 1. Local production
    for (const planet of eco.planets.values()) {
        tickProduction(planet, deltaSeconds, world, modsByFaction.get(planet.factionId) ?? NEUTRAL_MODS);
    }

    // 1¼. Imperial tier: pool essentials between same-faction planets in-system
    tickInternalDistribution(eco);

    // 1½. State taxation of new production → faction credit income
    collectFactionTaxes(eco, deltaSeconds, modsByFaction);

    // 2. Trade flow (lazy, throttled internally)
    tickTradeFlow(eco, world, deltaSeconds);

    // 3. Commodity distribution
    tickCommodityDistribution(eco, world, deltaSeconds);

    // 3½. Storage caps. Runs after every path that can add goods to a planet
    //      (production, internal pooling, trade flow, commodity delivery) so a
    //      single clamp covers them all.
    tickStorage(world, storageSnapshots, deltaSeconds, storageProfiles);

    // 4. Collapse drift
    tickCollapseState(eco, world, deltaSeconds);

    // 5. Recompute infra integrity for shared state
    recomputeInfraIntegrity(world);

    // 6. Phase 14: Galactic Market Pricing — fluctuates commodity prices based on
    //    real planetary output vs. consumption and active trade route volumes.
    tickGalacticTrade(world, deltaSeconds, tradeRng);

    // 7. Chartered companies: tolls, dividends, piracy suppression, corruption.
    if (world.corporate) {
        tickAllCompanies(world.corporate, world);
    }
}

/**
 * Calculates a faction's "Real-Time" resources based on their rates
 * and the elapsed time since the last authoritative tick.
 */
export function getEffectiveFactionState(factionId: string, world: GameWorldState) {
    const faction = world.economy.factions.get(factionId);
    if (!faction) return null;

    const dtSeconds = Math.max(0, world.nowSeconds - world.economy.lastFlowUpdateAt);
    
    // Deep clone reserves to compute effective ones
    const effectiveReserves: any = { ...faction.reserves };

    // Accumulate from owned planets
    for (const planet of world.economy.planets.values()) {
        if (planet.factionId !== factionId) continue;
        
        for (const [resId, rate] of Object.entries(planet.currentRates)) {
             if (!rate) continue;
             // Bridge the case difference between PlanetProduction (lower) and FactionReserves (UPPER)
             const upperKey = resId.toUpperCase();
             effectiveReserves[upperKey] = (effectiveReserves[upperKey] || 0) + (rate as number) * dtSeconds;
        }
    }

    return {
        ...faction,
        reserves: effectiveReserves,
        isVirtual: true,
        virtualAgeSeconds: dtSeconds
    };
}

/**
 * Fetch current live economy state for serialization.
 */
export function getEconomyState(world: GameWorldState, playerFactionId: string) {
    // Apply lazy evaluation to all factions so the UI sees real-time changes
    const effectiveFactions = Array.from(world.economy.factions.keys()).map(id => 
        getEffectiveFactionState(id, world)
    ).filter(Boolean);

    return {
        markets: Array.from(world.economy.markets.values()),
        agreements: Array.from(world.economy.tradeAgreements.values()),
        routes: Array.from(world.economy.tradeRoutes.values()),
        factions: effectiveFactions,
        playerFactionId,
        policies: world.economy.policies ? Array.from(world.economy.policies.entries()) : []
    };
}
