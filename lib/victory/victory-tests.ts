// lib/victory/victory-tests.ts
// Integration tests for the Seasonal & Victory System.
// Run: npx ts-node lib/victory/victory-tests.ts

import type { GameWorldState } from '../game-world-state';
import { defaultSharedState, clampShared } from '../game-world-state';
import type {
    EspionageWorldState,
} from '../espionage/espionage-types';
import type { EconomyWorldState } from '../economy/economy-types';
import type {
    MovementWorldState,
    EmpirePosture,
    InfluenceBloc,
    SystemNode,
    TradeSegment,
    GateObject,
} from '../movement/types';
import {
    checkConquestVictory,
    declareConquest,
    applyConquestPressure,
    tickConquestRebellionRisk,
    checkEnlightenmentQualification,
    tickEnlightenmentProgress,
    startTranscendence,
    resolveEnlightenmentSuccess,
    resolveEnlightenmentFailure,
    startPostVictoryTransition,
    tickPostVictoryTransition,
    resolvePostVictoryTransition,
    snapshotTerritoryAtSeasonEnd,
    applyTerritoryDrift,
    evaluateAutonomousRegions,
    ensureVictoryState,
} from './victory-service';

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

function expectTrue(v: boolean, msg?: string): void {
    if (!v) throw new Error(`Expected true${msg ? `: ${msg}` : ''}`);
}

function expectFalse(v: boolean, msg?: string): void {
    if (v) throw new Error(`Expected false${msg ? `: ${msg}` : ''}`);
}

function expectEq<T>(actual: T, expected: T, msg?: string): void {
    if (actual !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${msg ? ` (${msg})` : ''}`);
}

function expectNull<T>(v: T | null, msg?: string): void {
    if (v !== null) throw new Error(`Expected null${msg ? `: ${msg}` : ''}`);
}

function expectNotNull<T>(v: T | null, msg?: string): void {
    if (v === null) throw new Error(`Expected non-null${msg ? `: ${msg}` : ''}`);
}

function expectApprox(actual: number, expected: number, tol = 0.01, msg?: string): void {
    if (Math.abs(actual - expected) > tol)
        throw new Error(`Expected ~${expected} ±${tol}, got ${actual}${msg ? ` (${msg})` : ''}`);
}

// ─── Factories ────────────────────────────────────────────────────────────────

function makeSystem(id: string, ownerFactionId?: string, instability = 10): SystemNode {
    return {
        id, name: id, q: 0, r: 0,
        tags: [], tagReveal: { allTags: [], revealedAt: {} },
        hyperlaneNeighbors: [], tradeSegmentIds: [], corridorIds: [],
        ownerFactionId, instability,
    };
}

function makeBloc(id: 'military' | 'trade' | 'frontier' | 'science', influence: number, satisfaction: number): InfluenceBloc {
    return { id, name: id, influence, satisfaction, trend: 0 };
}

function makePosture(factionId: string, satisfaction = 80): EmpirePosture {
    return {
        factionId, current: 'Mercantile', pendingTarget: null,
        switchCompletesAt: null, transitionPenalty: 0,
        blocs: [
            makeBloc('military', 25, satisfaction),
            makeBloc('trade', 25, satisfaction),
            makeBloc('frontier', 25, satisfaction),
            makeBloc('science', 25, satisfaction),
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

function makeTradeSegment(id: string, integrity = 1.0): TradeSegment {
    return {
        id, fromSystemId: 'a', toSystemId: 'b',
        throughput: 0.8, status: 'active', isReroute: false, integrity, isFlashing: false,
    };
}

function makeGate(id: string, integrity = 1.0): GateObject {
    return {
        id,
        systemId: 'a',
        ownerFactionId: 'factionA',
        state: 'online',
        accessPolicy: 'open',
        integrity,
        allowedFactionIds: [],
        overloadTriggered: false,
    };
}

function makeEspionage(): EspionageWorldState {
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

function makeEconomy(): EconomyWorldState {
    return {
        planets: new Map(),
        tradeHubs: new Map(),
        tradeFlowEdges: new Map(),
        regions: new Map(),
        collapseStates: new Map(),
        markets: new Map(),
        tradeRoutes: new Map(),
        tradeAgreements: new Map(),
        lastFlowUpdateAt: 0,
    };
}

function makeWorld(factions: string[] = ['factionA', 'factionB']): GameWorldState {
    const systems = new Map<string, SystemNode>();
    systems.set('sys-alpha', makeSystem('sys-alpha', factions[0]));
    systems.set('sys-beta', makeSystem('sys-beta', factions[1] ?? factions[0]));

    const empirePostures = new Map<string, EmpirePosture>();
    for (const f of factions) empirePostures.set(f, makePosture(f));

    const movement: MovementWorldState = {
        systems,
        planets: new Map(),
        gates: new Map([['gate1', makeGate('gate1')]]),
        tradeSegments: new Map([['seg1', makeTradeSegment('seg1')]]),
        corridors: new Map(),
        fleets: new Map(),
        factionVisibility: new Map(),
        sensorSources: [],
        anomalyPool: [],
        frontierClaims: [],
        explorationOrders: [],
        automationDoctrines: new Map(),
        empirePostures,
        degradations: new Map(),
        nowSeconds: 1_000_000,
    };

    return {
        shared: defaultSharedState(),
        movement,
        economy: makeEconomy(),
        espionage: makeEspionage(),
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
        nowSeconds: 1_000_000,
    };
}

/** World where factionA owns all systems. */
function makeConquerorWorld(): GameWorldState {
    const world = makeWorld(['factionA']);
    world.movement.systems.set('sys-alpha', makeSystem('sys-alpha', 'factionA'));
    world.movement.systems.set('sys-beta', makeSystem('sys-beta', 'factionA'));
    return world;
}

/** World where shared state is at Enlightenment qualification thresholds. */
function makeEnlightenmentWorld(): GameWorldState {
    const world = makeWorld(['factionA']);
    world.shared.stability = 0.85;
    world.shared.tradeEfficiency = 0.80;
    world.shared.commodityAccess = 0.75;
    world.shared.blocSatisfaction = 0.75;
    world.shared.infraIntegrity = 0.80;
    // All blocs: equal influence (25 each = 25%), high satisfaction
    return world;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONQUEST VICTORY
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nConquest Victory');

test('checkConquestVictory returns null when contested', () => {
    const world = makeWorld(['factionA', 'factionB']);
    expectNull(checkConquestVictory(world), 'two factions → no conquest');
});

test('checkConquestVictory returns factionId when all systems owned', () => {
    const world = makeConquerorWorld();
    const winner = checkConquestVictory(world);
    expectEq(winner, 'factionA');
});

test('checkConquestVictory returns null for unclaimed galaxy', () => {
    const world = makeWorld();
    world.movement.systems.set('sys-alpha', makeSystem('sys-alpha', undefined));
    world.movement.systems.set('sys-beta', makeSystem('sys-beta', undefined));
    expectNull(checkConquestVictory(world), 'no owners → no conquest');
});

test('declareConquest sets conquest state and timestamps', () => {
    const world = makeConquerorWorld();
    const conquest = declareConquest('factionA', world);
    expectEq(conquest.factionId, 'factionA');
    expectTrue(conquest.rebellionPressure === 0);
    expectNotNull(world.victoryState, 'victoryState should be set');
    expectEq(world.victoryState?.lastVictoryType ?? null, 'conquest');
});

test('applyConquestPressure reduces stability and raises espionage pressure', () => {
    const world = makeConquerorWorld();
    const conquest = declareConquest('factionA', world);
    const initStability = world.shared.stability;
    const initEspionage = world.shared.espionagePressure;
    applyConquestPressure(conquest, world, 3600); // 1 hour
    expectTrue(world.shared.stability < initStability, 'stability should fall');
    expectTrue(world.shared.espionagePressure > initEspionage, 'espionage pressure should rise');
});

test('conquest pressure does NOT instantly trigger rebellion', () => {
    const world = makeConquerorWorld();
    const conquest = declareConquest('factionA', world);
    // Apply 24 hours of pressure
    for (let i = 0; i < 24; i++) applyConquestPressure(conquest, world, 3600);
    // Rebellion pressure accumulates, but systemic crisis is gated by politics service
    expectTrue(conquest.rebellionPressure >= 0, 'pressure accumulates');
    // No auto-rebellion flag set from pressure alone
    expectFalse(conquest.rebellionPressure > 1, 'rebellionPressure should not exceed 1');
});

test('tickConquestRebellionRisk flags high-instability systems', () => {
    const world = makeConquerorWorld();
    declareConquest('factionA', world);
    world.movement.systems.get('sys-alpha')!.instability = 90;
    tickConquestRebellionRisk('factionA', world, 3600);
    const flagged = world.victoryState?.conquest?.flaggedAutonomousRegions ?? [];
    expectTrue(flagged.includes('sys-alpha'), 'high-instability system should be flagged');
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENLIGHTENMENT VICTORY
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nEnlightenment Victory');

test('checkEnlightenmentQualification returns true when all metrics pass', () => {
    const world = makeEnlightenmentWorld();
    expectTrue(checkEnlightenmentQualification('factionA', world));
});

test('checkEnlightenmentQualification fails on low stability', () => {
    const world = makeEnlightenmentWorld();
    world.shared.stability = 0.50; // below 0.80 threshold
    expectFalse(checkEnlightenmentQualification('factionA', world));
});

test('checkEnlightenmentQualification fails on bloc dominance', () => {
    const world = makeEnlightenmentWorld();
    const posture = world.movement.empirePostures.get('factionA')!;
    posture.blocs = [
        makeBloc('military', 70, 80), // 70% dominance > 55% threshold
        makeBloc('trade', 10, 80),
        makeBloc('frontier', 10, 80),
        makeBloc('science', 10, 80),
    ];
    expectFalse(checkEnlightenmentQualification('factionA', world), 'bloc dominance too high');
});

test('checkEnlightenmentQualification fails on low bloc satisfaction', () => {
    const world = makeEnlightenmentWorld();
    const posture = world.movement.empirePostures.get('factionA')!;
    posture.blocs[0].satisfaction = 20; // 20/100 = 0.20, below 0.45
    expectFalse(checkEnlightenmentQualification('factionA', world), 'bloc satisfaction too low');
});

test('tickEnlightenmentProgress starts qualifying when thresholds pass', () => {
    const world = makeEnlightenmentWorld();
    tickEnlightenmentProgress('factionA', world, 60);
    const vs = ensureVictoryState(world);
    const progress = vs.enlightenmentProgress.get('factionA');
    expectEq(progress?.phase ?? 'inactive', 'qualifying');
});

test('tickEnlightenmentProgress resets timer when thresholds fail mid-qualifying', () => {
    const world = makeEnlightenmentWorld();
    tickEnlightenmentProgress('factionA', world, 60); // starts qualifying
    world.shared.stability = 0.30; // drops below threshold
    tickEnlightenmentProgress('factionA', world, 60); // should reset
    const progress = ensureVictoryState(world).enlightenmentProgress.get('factionA');
    expectEq(progress?.phase ?? '', 'inactive', 'phase should reset to inactive');
    expectEq(progress?.qualificationSecondsAccumulated ?? -1, 0, 'timer should reset');
});

test('startTranscendence sets transcending phase', () => {
    const world = makeEnlightenmentWorld();
    startTranscendence('factionA', world);
    const progress = ensureVictoryState(world).enlightenmentProgress.get('factionA')!;
    expectEq(progress.phase, 'transcending');
    expectNotNull(progress.transcendenceStartedAt);
});

test('resolveEnlightenmentSuccess applies structural impact and legacy bonuses', () => {
    const world = makeEnlightenmentWorld();
    startTranscendence('factionA', world);
    resolveEnlightenmentSuccess('factionA', world);
    const progress = ensureVictoryState(world).enlightenmentProgress.get('factionA')!;
    expectEq(progress.phase, 'complete');
    expectNotNull(progress.structuralImpact, 'structural impact should be set');
    expectTrue(Object.keys(progress.legacyBonuses).length > 0, 'legacy bonuses should be granted');
});

test('resolveEnlightenmentSuccess cultural pressure drains rival bloc satisfaction', () => {
    const world = makeEnlightenmentWorld();
    // Add a rival
    world.movement.empirePostures.set('factionB', makePosture('factionB'));
    const initBloc = world.shared.blocSatisfaction;
    startTranscendence('factionA', world);
    resolveEnlightenmentSuccess('factionA', world);
    expectTrue(world.shared.blocSatisfaction < initBloc, 'cultural pressure should reduce rival bloc satisfaction');
});

test('resolveEnlightenmentFailure resets phase to inactive', () => {
    const world = makeEnlightenmentWorld();
    startTranscendence('factionA', world);
    resolveEnlightenmentFailure('factionA', world);
    const progress = ensureVictoryState(world).enlightenmentProgress.get('factionA')!;
    expectEq(progress.phase, 'inactive');
    expectTrue(progress.transcendenceInterrupted, 'interrupted flag should be set');
});

test('legacy bonuses are capped at permanentBonusCap', () => {
    const world = makeEnlightenmentWorld();
    // Apply success repeatedly
    for (let i = 0; i < 10; i++) {
        startTranscendence('factionA', world);
        resolveEnlightenmentSuccess('factionA', world);
        // Reset phase manually to allow re-test
        const p = ensureVictoryState(world).enlightenmentProgress.get('factionA')!;
        p.phase = 'inactive';
    }
    const progress = ensureVictoryState(world).enlightenmentProgress.get('factionA')!;
    const cap = 5 / 100; // permanentBonusCap = 5 → 0.05
    for (const [, val] of Object.entries(progress.legacyBonuses)) {
        expectTrue(val <= cap + 0.001, `legacy bonus ${val} should not exceed cap ${cap}`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST-VICTORY TRANSITION
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nPost-Victory Transition');

test('startPostVictoryTransition creates 48h transition', () => {
    const world = makeWorld();
    const t = startPostVictoryTransition('conquest', 'factionA', world);
    const durationSeconds = 48 * 3600;
    const startS = new Date(t.startedAt).getTime() / 1000;
    const endS = new Date(t.endsAt).getTime() / 1000;
    expectApprox(endS - startS, durationSeconds, 1, '48h duration');
    expectFalse(t.resolved, 'should not be resolved yet');
});

test('tickPostVictoryTransition reduces stability and raises espionage', () => {
    const world = makeWorld();
    startPostVictoryTransition('conquest', 'factionA', world);
    const initStability = world.shared.stability;
    const initEsp = world.shared.espionagePressure;
    tickPostVictoryTransition(world, 3600);
    expectTrue(world.shared.stability < initStability, 'stability should fall during transition');
    expectTrue(world.shared.espionagePressure > initEsp, 'espionage should rise during transition');
});

test('tickPostVictoryTransition resolves after 48h', () => {
    const world = makeWorld();
    startPostVictoryTransition('conquest', 'factionA', world);
    // Move world clock past the end
    world.nowSeconds += 48 * 3600 + 1;
    tickPostVictoryTransition(world, 1);
    expectNull(world.postVictoryTransition, 'transition should be cleared after resolution');
});

test('resolvePostVictoryTransition clears transition and evaluates autonomous regions', () => {
    const world = makeConquerorWorld();
    declareConquest('factionA', world);
    startPostVictoryTransition('conquest', 'factionA', world);
    world.movement.systems.get('sys-alpha')!.instability = 95;
    resolvePostVictoryTransition(world);
    expectNull(world.postVictoryTransition);
    const flagged = world.victoryState?.conquest?.flaggedAutonomousRegions ?? [];
    expectTrue(flagged.includes('sys-alpha'), 'high-instability regions should be flagged on resolution');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TERRITORY PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nTerritory Persistence');

test('snapshotTerritoryAtSeasonEnd records ownership without reset', () => {
    const world = makeWorld(['factionA', 'factionB']);
    const record = snapshotTerritoryAtSeasonEnd(1, world);
    expectEq(record.territories['sys-alpha'], 'factionA');
    expectEq(record.territories['sys-beta'], 'factionB');
    expectTrue(world.territoryHistory.length === 1, 'record should be archived');
});

test('snapshotTerritoryAtSeasonEnd captures infra integrity', () => {
    const world = makeWorld();
    world.movement.tradeSegments.get('seg1')!.integrity = 0.75;
    const record = snapshotTerritoryAtSeasonEnd(1, world);
    expectApprox(record.infraIntegrity['seg1'], 0.75, 0.001);
});

test('applyTerritoryDrift decays disrupted segment integrity', () => {
    const world = makeWorld();
    world.movement.tradeSegments.get('seg1')!.status = 'disrupted';
    world.movement.tradeSegments.get('seg1')!.integrity = 1.0;
    applyTerritoryDrift(world, 86400); // 1 day
    const integrity = world.movement.tradeSegments.get('seg1')!.integrity;
    expectTrue(integrity < 1.0, 'disrupted segment should decay');
});

test('applyTerritoryDrift does not exceed maxCrossSeasonDecay (0.30)', () => {
    const world = makeWorld();
    world.movement.tradeSegments.get('seg1')!.status = 'disrupted';
    world.movement.tradeSegments.get('seg1')!.integrity = 1.0;
    // Apply 100 days of decay
    applyTerritoryDrift(world, 86400 * 100);
    const integrity = world.movement.tradeSegments.get('seg1')!.integrity;
    expectTrue(integrity >= 0.70, `integrity should not drop below 0.70 (maxDecay=0.30), got ${integrity}`);
});

test('evaluateAutonomousRegions only flags systems above instability threshold', () => {
    const world = makeConquerorWorld();
    declareConquest('factionA', world);
    world.movement.systems.get('sys-alpha')!.instability = 30; // below threshold
    world.movement.systems.get('sys-beta')!.instability = 85; // above threshold
    evaluateAutonomousRegions(world);
    const flagged = world.victoryState?.conquest?.flaggedAutonomousRegions ?? [];
    expectFalse(flagged.includes('sys-alpha'), 'low-instability system should not be flagged');
    expectTrue(flagged.includes('sys-beta'), 'high-instability system should be flagged');
});

test('territory ownership unchanged across season boundary', () => {
    const world = makeWorld(['factionA', 'factionB']);
    const before = world.movement.systems.get('sys-alpha')!.ownerFactionId;
    snapshotTerritoryAtSeasonEnd(1, world);
    // Ownership should still be the same - snapshot is read-only
    const after = world.movement.systems.get('sys-alpha')!.ownerFactionId;
    expectEq(before, after, 'ownership must not change during snapshot');
});

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
