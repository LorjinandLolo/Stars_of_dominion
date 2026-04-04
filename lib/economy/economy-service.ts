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
import { eventBus } from '../movement/event-bus';
import config from '../movement/movement-config.json';
import { calculateBiosphereModifiers } from './biosphere-traits';
import { tickGalacticTrade, initializeGalacticMarkets } from '../trade-system/trade-network-service';
import { RNG } from '../trade-system/rng';
import { tickConstructionGlobal } from '../construction/construction-service';

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

// ─── Pillar 3A: Local Production ──────────────────────────────────────────────

/**
 * Advance planet production by deltaSeconds.
 * Accrues to stockpile; capped by build ceilings (not modelled yet — future work).
 */
export function tickProduction(
    planet: PlanetProduction,
    deltaSeconds: number,
    world: GameWorldState
): void {
    // 1. Initialize Default Data-Driven Services (For unseeded planets)
    if (!planet.services) {
        planet.services = {};
        const { initializePlanetServices } = require('./services/service-engine');
        initializePlanetServices(planet);
    }

    const { updatePlanetServices } = require('./services/service-engine');
    
    // 2. Resolve Service Upkeeps, Coverage, and Aggregate Yield Modifiers
    const gridEfficiency = updatePlanetServices(planet, deltaSeconds);

    // 3. Compute Production Modifiers
    const rates = planetBaseRates(planet);
    
    // If the grid fails, it zeroes out industrial output efficiency natively
    let efficiencyMod = gridEfficiency - (world.shared.seasonalModifiers['tradeEfficiency'] ?? 0) * 0.3;
    efficiencyMod = Math.max(0, efficiencyMod);

    // 4. Update Stockpiles
    for (const [k, v] of Object.entries(rates)) {
        const key = k as keyof ResourceBundle;
        const delta = (v ?? 0) * deltaSeconds * efficiencyMod;
        planet.stockpile[key] = (planet.stockpile[key] ?? 0) + delta;
        planet.currentRates[key] = (v ?? 0) * efficiencyMod; // Track effective rate
    }

    // 5. Research and military capacity
    planet.derived.research = (rates['research'] ?? 0) * efficiencyMod;
    planet.derived.military = clamp((rates['military'] ?? 0) / (econ.production.baseRates.military * 2.2)) * efficiencyMod;
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
            for (const [k, v] of Object.entries(drain)) {
                const key = k as keyof ResourceBundle;
                fromPlanet.stockpile[key] = Math.max(0, (fromPlanet.stockpile[key] ?? 0) - (v ?? 0));
            }
            // Add to destination planet
            const toPlanet = [...ecoWorld.planets.values()].find(p => p.systemId === edge.toSystemId);
            if (toPlanet) {
                for (const [k, v] of Object.entries(drain)) {
                    const key = k as keyof ResourceBundle;
                    toPlanet.stockpile[key] = (toPlanet.stockpile[key] ?? 0) + (v ?? 0);
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
        } else {
            // Happiness bonus from commodity access
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

    // 0. Construction Tick (Global)
    tickConstructionGlobal(world);

    // 1. Local production
    for (const planet of eco.planets.values()) {
        tickProduction(planet, deltaSeconds, world);
    }

    // 2. Trade flow (lazy, throttled internally)
    tickTradeFlow(eco, world, deltaSeconds);

    // 3. Commodity distribution
    tickCommodityDistribution(eco, world, deltaSeconds);

    // 4. Collapse drift
    tickCollapseState(eco, world, deltaSeconds);

    // 5. Recompute infra integrity for shared state
    recomputeInfraIntegrity(world);

    // 6. Phase 14: Galactic Market Pricing — fluctuates commodity prices based on
    //    real planetary output vs. consumption and active trade route volumes.
    if (!eco.markets || eco.markets.size === 0) {
        eco.markets = initializeGalacticMarkets();
    }
    tickGalacticTrade(world, deltaSeconds, tradeRng);
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
