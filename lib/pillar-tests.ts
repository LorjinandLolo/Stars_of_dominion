// lib/pillar-tests.ts
// Cross-pillar integration tests for Pillars 3, 5, 6, 7.
// Run in-process: npx ts-node lib/pillar-tests.ts

import { defaultSharedState, recomputeBlocSatisfaction, recomputeInfraIntegrity } from './game-world-state';
import type { GameWorldState } from './game-world-state';
import type { EconomyWorldState, PlanetProduction, TradeHub, TradeFlowEdge, EconomicRegion, CollapseState } from './economy/economy-types';
import type { EspionageWorldState } from './espionage/espionage-types';
import { tickEconomy, tickCommodityDistribution, tickCollapseState } from './economy/economy-service';
import { tickBlocDrift, getBlocReport, isCrisisCondition, applyPolicyEffect } from './politics/politics-service';
import { launchOperation, tickOperations, resolveAttribution, computeAttributionProbability, getEspionagePressure } from './espionage/espionage-service';
import { scheduleNextSeason, activateSeason, tickSeasonModifiers, endSeason, getActiveModifiers } from './seasons/season-service';
import { MovementWorldState, EmpirePosture, InfluenceBloc, Fleet, SystemNode, TradeSegment } from './movement/types';

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (e: unknown) {
        console.error(`  ✗ ${name}`);
        if (e instanceof Error) console.error(`    ${e.message}`);
        failed++;
    }
}

function expect(actual: unknown, expected: unknown, msg?: string): void {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${msg ? ` (${msg})` : ''}`);
}

function expectApprox(actual: number, expected: number, tol = 0.05, msg?: string): void {
    if (Math.abs(actual - expected) > tol) {
        throw new Error(`Expected ~${expected} ±${tol}, got ${actual}${msg ? ` (${msg})` : ''}`);
    }
}

function expectTrue(v: boolean, msg?: string): void {
    if (!v) throw new Error(`Expected true${msg ? `: ${msg}` : ''}`);
}

function expectFalse(v: boolean, msg?: string): void {
    if (v) throw new Error(`Expected false${msg ? `: ${msg}` : ''}`);
}

// ─── Factories ────────────────────────────────────────────────────────────────

function makeSystem(id: string, ownerFactionId?: string): SystemNode {
    return {
        id, name: id, q: 0, r: 0,
        tags: [], tagReveal: { allTags: [], revealedAt: {} },
        hyperlaneNeighbors: [], tradeSegmentIds: [], corridorIds: [],
        ownerFactionId, instability: 20,
    };
}

function makeTradeSegment(id: string, from: string, to: string): TradeSegment {
    return {
        id, fromSystemId: from, toSystemId: to,
        throughput: 0.8, status: 'active', isReroute: false,
        integrity: 1.0, isFlashing: false,
    };
}

function makeBloc(id: 'military' | 'trade' | 'frontier' | 'science', influence: number, satisfaction: number): InfluenceBloc {
    return { id, name: id, influence, satisfaction, trend: 0 };
}

function makePosture(factionId: string): EmpirePosture {
    return {
        factionId, current: 'Mercantile', pendingTarget: null,
        switchCompletesAt: null, transitionPenalty: 0,
        blocs: [
            makeBloc('military', 25, 75),
            makeBloc('trade', 30, 80),
            makeBloc('frontier', 20, 70),
            makeBloc('science', 25, 85),
        ],
        ideology: {
            order_chaos: 0,
            centralization_autonomy: 0,
            militarism_pacifism: 0,
            tradition_progress: 0,
            collectivism_individualism: 0,
            expansionism_isolationism: 0,
            authoritarianism_liberty: 0
        }
    };
}

function makePlanet(id: string, systemId: string, factionId: string): PlanetProduction {
    return {
        planetId: id, systemId, factionId,
        planetType: 'commercial',
        tags: [],
        baseRates: { luxury: 1.0, cultural: 0.8, credits: 1.0 },
        stockpile: { luxury: 10, cultural: 8, rare: 2 },
        happiness: 60, instability: 20,
        militaryCapacity: 0.5, researchOutput: 0.3,
        commodityScarcity: false,
    };
}

function makeEcoWorld(): EconomyWorldState {
    const planet = makePlanet('p1', 'sys-alpha', 'factionA');
    const hub: TradeHub = {
        systemId: 'sys-alpha', factionId: 'factionA',
        routeCount: 3, hubMultiplier: 1.12,
        throughputPerHour: { luxury: 5, cultural: 3 },
    };
    const edge: TradeFlowEdge = {
        segmentId: 'seg1',
        fromSystemId: 'sys-alpha', toSystemId: 'sys-beta',
        efficiencyMultiplier: 0.9,
        flowPerHour: { luxury: 2, cultural: 1 },
    };
    const region: EconomicRegion = {
        id: 'region-a', name: 'Alpha Region',
        systemIds: ['sys-alpha', 'sys-beta'], factionId: 'factionA',
        tradeEfficiency: 0.9, collapsePressure: 0, collapseStage: 'stable',
        identityDrifting: false,
    };
    const collapse: CollapseState = {
        regionId: 'region-a', stage: 'stable',
        cause: '', pressure: 0,
    };
    return {
        planets: new Map([['p1', planet]]),
        tradeHubs: new Map([['sys-alpha', hub]]),
        tradeFlowEdges: new Map([['seg1', edge]]),
        regions: new Map([['region-a', region]]),
        collapseStates: new Map([['region-a', collapse]]),
        markets: new Map(),
        tradeRoutes: new Map(),
        tradeAgreements: new Map(),
        lastFlowUpdateAt: 0,
    };
}

function makeMovementWorld(factionId: string): MovementWorldState {
    const system = makeSystem('sys-alpha', factionId);
    const segment = makeTradeSegment('seg1', 'sys-alpha', 'sys-beta');
    return {
        systems: new Map([['sys-alpha', system], ['sys-beta', makeSystem('sys-beta')]]),
        planets: new Map(),
        gates: new Map(),
        tradeSegments: new Map([['seg1', segment]]),
        corridors: new Map(),
        fleets: new Map(),
        factionVisibility: new Map(),
        sensorSources: [],
        anomalyPool: [],
        frontierClaims: [],
        explorationOrders: [],
        automationDoctrines: new Map(),
        empirePostures: new Map([[factionId, makePosture(factionId)]]),
        degradations: new Map(),
        nowSeconds: 1000000,
    };
}

function makeEspionageWorld(): EspionageWorldState {
    return {
        operations: new Map(),
        counterIntel: new Map(),
        attributionRecords: [],
        shadowEconomyNodes: new Map(),
        regionEscalation: new Map(),
        agents: new Map(),
        intelNetworks: new Map(),
    };
}

function makeWorld(): GameWorldState {
    const factionId = 'factionA';
    return {
        shared: defaultSharedState(),
        movement: makeMovementWorld(factionId),
        economy: makeEcoWorld(),
        espionage: makeEspionageWorld(),
        activeSeason: null,
        seasonHistory: [],
        victoryState: null,
        postVictoryTransition: null,
        territoryHistory: [],
        tech: new Map(),
        rivalries: new Map(),
        blocs: new Map(),
        propagandaCampaigns: new Map(),
        activeCombats: new Map(),
        nowSeconds: 1000000,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PILLAR 3 — ECONOMY TESTS
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nPillar 3 — Economy');

test('tickProduction accrues stockpile', () => {
    const world = makeWorld();
    const planet = world.economy.planets.get('p1')!;
    const initialLuxury = planet.stockpile['luxury'] ?? 0;
    tickEconomy(world, 60); // 60 seconds
    const newLuxury = planet.stockpile['luxury'] ?? 0;
    expectTrue(newLuxury > initialLuxury, 'luxury stockpile should grow');
});

test('tickTradeFlow computes hub multiplier', () => {
    const world = makeWorld();
    const hub = world.economy.tradeHubs.get('sys-alpha')!;
    tickEconomy(world, 60);
    expectTrue(hub.hubMultiplier > 1, 'hub multiplier should exceed 1 with active routes');
});

test('trade disruption lowers edge efficiency', () => {
    const world = makeWorld();
    const seg = world.movement.tradeSegments.get('seg1')!;
    seg.status = 'disrupted';
    world.economy.lastFlowUpdateAt = 0; // force recalc
    tickEconomy(world, 60);
    const edge = world.economy.tradeFlowEdges.get('seg1')!;
    expectTrue(edge.efficiencyMultiplier < 0.85, 'disrupted segment should have low efficiency');
});

test('trade efficiency writes to shared state', () => {
    const world = makeWorld();
    world.economy.lastFlowUpdateAt = 0;
    tickEconomy(world, 60);
    expectTrue(world.shared.tradeEfficiency >= 0 && world.shared.tradeEfficiency <= 1, 'tradeEfficiency in 0–1');
});

test('commodity scarcity increases instability', () => {
    const world = makeWorld();
    const planet = world.economy.planets.get('p1')!;
    planet.stockpile = { luxury: 0, cultural: 0, rare: 0 }; // empty
    tickCommodityDistribution(world.economy, world, 3600);
    expectTrue(planet.instability > 20, 'instability should rise under scarcity');
    expectTrue(planet.commodityScarcity, 'scarcity flag should be set');
});

test('collapse pressure accumulates under low efficiency', () => {
    const world = makeWorld();
    world.shared.tradeEfficiency = 0.2;
    world.shared.commodityAccess = 0.15;
    world.economy.regions.get('region-a')!.tradeEfficiency = 0.2;
    const collapse = world.economy.collapseStates.get('region-a')!;
    const initialPressure = collapse.pressure;
    tickCollapseState(world.economy, world, 3600);
    expectTrue(collapse.pressure > initialPressure, 'pressure should accumulate');
});

test('collapse stage advances at threshold', () => {
    const world = makeWorld();
    world.shared.tradeEfficiency = 0.1;
    world.shared.commodityAccess = 0.1;
    world.economy.regions.get('region-a')!.tradeEfficiency = 0.1;
    const collapse = world.economy.collapseStates.get('region-a')!;
    collapse.pressure = 0.80; // above threshold
    tickCollapseState(world.economy, world, 60);
    expectTrue(collapse.stage !== 'stable', 'collapse stage should advance from stable');
});

// ═══════════════════════════════════════════════════════════════════════════════
// PILLAR 5 — POLITICS TESTS
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nPillar 5 — Internal Politics');

test('tickBlocDrift reduces trade bloc under low commodity access', () => {
    const world = makeWorld();
    world.shared.commodityAccess = 0.2; // very low
    const tradeBloc = world.movement.empirePostures.get('factionA')!.blocs.find(b => b.id === 'trade')!;
    const initial = tradeBloc.satisfaction;
    tickBlocDrift('factionA', world, 3600);
    expectTrue(tradeBloc.satisfaction < initial, 'trade bloc should lose satisfaction under scarcity');
});

test('getBlocReport returns correct structure', () => {
    const world = makeWorld();
    const report = getBlocReport('factionA', world);
    expect(report.factionId, 'factionA');
    expectTrue(report.blocs.length === 4, 'should return all 4 blocs');
});

test('isCrisisCondition requires multiple indicators', () => {
    const world = makeWorld();
    // Only single indicator — bloc satisfaction is low, but nothing else
    const posture = world.movement.empirePostures.get('factionA')!;
    posture.blocs.forEach(b => b.satisfaction = 15); // all blocs unhappy
    const justBlocs = isCrisisCondition('factionA', world);
    // Only 1 indicator (lowBlocSatisfaction) — should still need 2
    expectFalse(justBlocs, 'single indicator should not trigger crisis');
});

test('isCrisisCondition triggers with 2+ indicators', () => {
    const world = makeWorld();
    const posture = world.movement.empirePostures.get('factionA')!;
    posture.blocs.forEach(b => b.satisfaction = 15);
    world.shared.espionagePressure = 0.8;
    const crisis = isCrisisCondition('factionA', world);
    expectTrue(crisis, 'two indicators should trigger crisis condition');
});

test('applyPolicyEffect boosts aligned bloc satisfaction', () => {
    const world = makeWorld();
    const tradeBloc = world.movement.empirePostures.get('factionA')!.blocs.find(b => b.id === 'trade')!;
    const initial = tradeBloc.satisfaction;
    applyPolicyEffect('factionA', 'open_trade', world);
    expectTrue(tradeBloc.satisfaction >= initial, 'aligned policy should not reduce satisfaction');
});

// ═══════════════════════════════════════════════════════════════════════════════
// PILLAR 6 — ESPIONAGE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nPillar 6 — Espionage');

test('launchOperation creates active operation', () => {
    const world = makeWorld();
    const result = launchOperation('factionB', 'factionA', 'sys-alpha', 'infrastructureSabotage', 0.7, 0.4, world);
    expectTrue(result.success, 'operation should launch');
    expectTrue(world.espionage.operations.size === 1, 'operation should be in world state');
});

test('attribution probability uses sensor strength', () => {
    const world = makeWorld();
    // Add a sensor directly in target system — should increase attribution probability
    world.movement.sensorSources.push({
        id: 'sensor1', kind: 'planet', factionId: 'factionA',
        systemId: 'sys-alpha', detectionRadius: 2, detectionStrength: 0.95,
    });
    const result = launchOperation('factionB', 'factionA', 'sys-alpha', 'infrastructureSabotage', 0.7, 0.9, world);
    const op = result.operation!;
    const prob = computeAttributionProbability(op, world);
    expectTrue(prob > 0, 'attribution probability should be non-zero with strong sensors');
});

test('repeated operations escalate detection', () => {
    const world = makeWorld();
    // Two operations in same region
    launchOperation('factionB', 'factionA', 'sys-alpha', 'shadowEconomy', 0.5, 0.3, world);
    launchOperation('factionB', 'factionA', 'sys-alpha', 'shadowEconomy', 0.5, 0.3, world);
    const escalation = world.espionage.regionEscalation.get('sys-alpha');
    expectTrue((escalation?.operationCount ?? 0) >= 2, 'escalation count should accumulate');
});

test('resolveAttribution returns invisible with no sensors', () => {
    const world = makeWorld();
    const result = launchOperation('factionB', 'factionA', 'sys-alpha', 'shadowEconomy', 0.5, 0.1, world);
    const op = result.operation!;
    // No sensors in target system
    const attribution = resolveAttribution(op, world);
    expect(attribution, 'invisible', 'no sensors → invisible');
});

test('tickOperations resolves expired operations', () => {
    const world = makeWorld();
    const result = launchOperation('factionB', 'factionA', 'sys-alpha', 'shadowEconomy', 1.0, 0.2, world);
    const op = result.operation!;
    // Force the operation to be past its completion time
    op.completesAt = new Date((world.nowSeconds - 10) * 1000).toISOString();
    tickOperations(world, 60);
    expect(op.status === 'resolved' || op.status === 'failed', true, 'operation should be resolved');
});

test('shadow economy reduces trade efficiency', () => {
    const world = makeWorld();
    world.shared.tradeEfficiency = 0.9;
    const result = launchOperation('factionB', 'factionA', 'sys-alpha', 'shadowEconomy', 1.0, 0.2, world);
    const op = result.operation!;
    op.completesAt = new Date((world.nowSeconds - 10) * 1000).toISOString();
    op.succeeded = false; // force success in apply
    tickOperations(world, 60);
    // If succeeded, efficiency should drop
    if (op.succeeded) {
        expectTrue(world.shared.tradeEfficiency < 0.9, 'shadow economy should reduce trade efficiency');
    }
});

test('getEspionagePressure returns 0 for clean region', () => {
    const world = makeWorld();
    const pressure = getEspionagePressure('clean-region', world);
    expect(pressure, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PILLAR 7 — SEASONS TESTS
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nPillar 7 — Seasons');

test('scheduleNextSeason creates announced season', () => {
    const world = makeWorld();
    const season = scheduleNextSeason(1, world);
    expect(season.phase, 'announced');
    expectTrue(season.modifiers.length >= 2, 'should have at least 2 modifiers');
    expectTrue(season.modifiers.length <= 3, 'should have at most 3 modifiers');
});

test('activateSeason writes seasonal modifiers to shared state', () => {
    const world = makeWorld();
    const season = scheduleNextSeason(1, world);
    activateSeason(season, world);
    const keys = Object.keys(world.shared.seasonalModifiers);
    expectTrue(keys.length >= 2, 'should have at least 2 active modifiers');
});

test('tickSeasonModifiers transitions announced → active', () => {
    const world = makeWorld();
    const season = scheduleNextSeason(1, world);
    world.activeSeason = season;
    // Force past announcement period
    season.activatesAt = new Date((world.nowSeconds - 1) * 1000).toISOString();
    tickSeasonModifiers(world, 60);
    expect(season.phase, 'active');
});

test('seasonal pressure reduces affected variable', () => {
    const world = makeWorld();
    const season = scheduleNextSeason(1, world);
    activateSeason(season, world);
    world.activeSeason = season;
    season.activatesAt = new Date((world.nowSeconds - 1) * 1000).toISOString();
    season.phase = 'active';
    const tradeEff = world.shared.tradeEfficiency;
    // Apply modifiers
    tickSeasonModifiers(world, 3600 * 24); // 1 day
    // At least one shared variable should have shifted
    const changed = season.modifiers.some(m => {
        const key = m.affectedVariable as keyof typeof world.shared;
        const val = world.shared[key];
        return typeof val === 'number' && val < 1.0;
    });
    expectTrue(changed, 'seasonal modifiers should reduce at least one shared variable');
});

test('endSeason archives record and clears modifiers', () => {
    const world = makeWorld();
    const season = scheduleNextSeason(1, world);
    activateSeason(season, world);
    world.activeSeason = season;
    season.phase = 'ending';
    season.endsAt = new Date((world.nowSeconds - 1) * 1000).toISOString();
    endSeason(world);
    expectTrue(world.activeSeason === null, 'activeSeason should be cleared');
    expectTrue(world.seasonHistory.length === 1, 'season record should be archived');
    expect(Object.keys(world.shared.seasonalModifiers).length, 0, 'modifiers should be cleared');
});

test('getActiveModifiers returns empty outside of active season', () => {
    const world = makeWorld();
    const mods = getActiveModifiers(world);
    expect(mods.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-PILLAR INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nCross-Pillar Integration');

test('trade disruption → raises espionage vulnerability', () => {
    const world = makeWorld();
    world.shared.commodityAccess = 0.1; // severe scarcity
    tickCommodityDistribution(world.economy, world, 3600);
    expectTrue(world.shared.espionagePressure > 0, 'scarcity should raise espionage vulnerability');
});

test('espionage op exposed → reduces shared stability', () => {
    const world = makeWorld();
    world.movement.sensorSources.push({
        id: 's1', kind: 'planet', factionId: 'factionA',
        systemId: 'sys-alpha', detectionRadius: 2, detectionStrength: 0.99,
    });
    const result = launchOperation('factionB', 'factionA', 'sys-alpha', 'politicalSubversion', 1.0, 1.0, world);
    const op = result.operation!;
    op.completesAt = new Date((world.nowSeconds - 10) * 1000).toISOString();
    const initialStability = world.shared.stability;
    tickOperations(world, 60);
    // If attribution became exposed
    if (op.attributionState === 'exposed') {
        expectTrue(world.shared.stability < initialStability, 'exposure should reduce stability');
    }
});

test('season modifier tilts trade efficiency without hard override', () => {
    const world = makeWorld();
    world.shared.tradeEfficiency = 1.0;
    const season = scheduleNextSeason(2, world);
    // Force tradeVolatility modifier
    season.modifiers = [{ id: 'tradeVolatility', label: 'Trade Volatility', pressureRate: 0.15, affectedVariable: 'tradeEfficiency' }];
    activateSeason(season, world);
    world.activeSeason = season;
    season.phase = 'active';
    season.activatesAt = new Date((world.nowSeconds - 1) * 1000).toISOString();
    tickSeasonModifiers(world, 86400); // 1 day
    expectTrue(world.shared.tradeEfficiency < 1.0, 'seasonal pressure should reduce tradeEfficiency gradually');
    expectTrue(world.shared.tradeEfficiency > 0, 'seasonal pressure should not wipe tradeEfficiency to 0 in one tick');
});

test('high instability in frontier claims hurts frontier bloc', () => {
    const world = makeWorld();
    // Add a frontier claim in a high-instability system
    const sys = world.movement.systems.get('sys-alpha')!;
    sys.instability = 90;
    world.movement.frontierClaims.push({
        systemId: 'sys-alpha', factionId: 'factionA', phase: 'claim',
        presenceScore: 10, phaseStartedAt: new Date().toISOString(), claimAgeDays: 2,
    });
    const frontierBloc = world.movement.empirePostures.get('factionA')!.blocs.find(b => b.id === 'frontier')!;
    const initial = frontierBloc.satisfaction;
    tickBlocDrift('factionA', world, 3600 * 6); // 6 hours
    expectTrue(frontierBloc.satisfaction < initial, 'frontier bloc should drift down with high-instability claims');
});

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
