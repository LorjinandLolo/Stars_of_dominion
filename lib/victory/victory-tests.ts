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
    readEnlightenmentConditions,
    buildEnlightenmentView,
    tickVictory,
    type VictoryEvent,
} from './victory-service';
import { drainBuffer, resetChronicleBuffer } from '../narrative/chronicle';
import movementConfig from '../movement/movement-config.json';

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
        factionIntel: new Map(),
        reports: new Map(),
        boardOpportunities: new Map(),
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

function makeGovernment(factionId: string, approval = 72, legitimacy = 90, cohesion = 85): any {
    return {
        factionId, approval, legitimacy, cohesion,
        politicalCapital: 10, politicalCapitalCap: 100,
        legacy: { prestige: 0, completed: [], bonuses: {}, chronicle: [] },
        history: [],
    };
}

/** Give factionId `count` owned planets in the construction layer; the first holds a standing Great Archive. */
function givePlanets(world: GameWorldState, factionId: string, count: number): void {
    const w = world as any;
    if (!w.construction) w.construction = { planets: new Map() };
    for (let i = 0; i < count; i++) {
        const tiles = i === 0
            ? [{ tileId: `${factionId}-archive`, districtType: 'any', buildingId: 'great_archive', constructionState: 'active', constructionCompleteAt: null }]
            : [];
        w.construction.planets.set(`${factionId}-p${i}`, { id: `${factionId}-p${i}`, ownerId: factionId, systemId: 'sys-alpha', tiles, buildQueue: [] });
    }
}

function archiveTile(world: GameWorldState, factionId: string): any {
    return (world as any).construction.planets.get(`${factionId}-p0`).tiles[0];
}

/**
 * World where factionA's OWN empire passes every Enlightenment condition. The
 * galaxy-wide shared state is left at its defaults on purpose: since 2026-10
 * qualification never reads it.
 */
function makeEnlightenmentWorld(factions: string[] = ['factionA']): GameWorldState {
    const world = makeWorld(factions);
    (world as any).government = new Map(factions.map(f => [f, makeGovernment(f)]));
    for (const f of factions) givePlanets(world, f, 3);
    // All blocs: equal influence (25 each = 25%), satisfaction 80
    return world;
}

/** Tick one faction `days` times, a sim day each, moving the clock with it. */
function tickDays(world: GameWorldState, factionId: string, days: number, events: VictoryEvent[] = []): void {
    for (let d = 0; d < days; d++) {
        world.nowSeconds += DAY;
        tickEnlightenmentProgress(factionId, world, DAY, events);
    }
}

const DAY = 86400;
const ENL = movementConfig.victory.enlightenment;
const QUAL_DAYS = ENL.qualificationDurationDays;

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

test('checkEnlightenmentQualification ignores the galaxy-wide shared state', () => {
    // The old rule read world.shared, which sat at stability 0.00 for a whole
    // soak season — nobody could ever qualify, and nobody could steer it.
    const world = makeEnlightenmentWorld();
    world.shared.stability = 0;
    world.shared.tradeEfficiency = 0;
    world.shared.infraIntegrity = 0;
    expectTrue(checkEnlightenmentQualification('factionA', world));
});

test('checkEnlightenmentQualification fails on low approval', () => {
    const world = makeEnlightenmentWorld();
    (world as any).government.get('factionA').approval = 59; // a delegated empire's best in the soak
    expectFalse(checkEnlightenmentQualification('factionA', world));
});

test('checkEnlightenmentQualification fails on low legitimacy', () => {
    const world = makeEnlightenmentWorld();
    (world as any).government.get('factionA').legitimacy = 60;
    expectFalse(checkEnlightenmentQualification('factionA', world));
});

test('checkEnlightenmentQualification fails on low cohesion', () => {
    const world = makeEnlightenmentWorld();
    (world as any).government.get('factionA').cohesion = 60;
    expectFalse(checkEnlightenmentQualification('factionA', world));
});

test('checkEnlightenmentQualification fails with too few worlds', () => {
    const world = makeEnlightenmentWorld();
    (world as any).construction.planets.delete('factionA-p0');
    expectFalse(checkEnlightenmentQualification('factionA', world), 'two worlds is below the minimum of three');
});

test('checkEnlightenmentQualification fails with no government or no blocs', () => {
    const noGov = makeEnlightenmentWorld();
    (noGov as any).government.delete('factionA');
    expectFalse(checkEnlightenmentQualification('factionA', noGov), 'no government');
    const noBlocs = makeEnlightenmentWorld();
    noBlocs.movement.empirePostures.get('factionA')!.blocs = [];
    expectFalse(checkEnlightenmentQualification('factionA', noBlocs), 'no interest groups');
});

test('the Great Archive must be standing — not planned, building or ruined', () => {
    const world = makeEnlightenmentWorld();
    const tile = archiveTile(world, 'factionA');
    for (const [state, label] of [['under_construction', 'building'], ['ruined', 'ruined']] as const) {
        tile.constructionState = state;
        const row = readEnlightenmentConditions('factionA', world).find(r => r.id === 'archive')!;
        expectEq(row.state, label);
        expectFalse(row.passing, `${label} archive must not pass`);
    }
    (world as any).construction.planets.get('factionA-p0').tiles = [];
    expectFalse(checkEnlightenmentQualification('factionA', world), 'no archive');
    // Someone else's Archive is not yours.
    givePlanets(world, 'factionB', 1);
    expectFalse(checkEnlightenmentQualification('factionA', world), "a rival's archive");
});

test('one empire qualifying does not qualify its neighbour', () => {
    const world = makeEnlightenmentWorld(['factionA', 'factionB']);
    (world as any).government.get('factionB').approval = 40;
    expectTrue(checkEnlightenmentQualification('factionA', world));
    expectFalse(checkEnlightenmentQualification('factionB', world));
});

test('readEnlightenmentConditions reports each reading against its target', () => {
    const world = makeEnlightenmentWorld();
    const rows = readEnlightenmentConditions('factionA', world);
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    expectEq(rows.length, 7);
    expectEq(byId.archive.state, 'operational');
    expectEq(byId.approval.value, 72);
    expectEq(byId.approval.target, 65);
    expectApprox(byId.blocBalance.value ?? -1, 0.25, 0.001);
    expectEq(byId.blocBalance.bound, 'max');
    expectEq(byId.worlds.value, 3);
    expectTrue(rows.every(r => r.passing));
});

test('checkEnlightenmentQualification fails on bloc dominance', () => {
    const world = makeEnlightenmentWorld();
    const posture = world.movement.empirePostures.get('factionA')!;
    posture.blocs = [
        makeBloc('military', 70, 80), // 70% dominance > 40% threshold
        makeBloc('trade', 10, 80),
        makeBloc('frontier', 10, 80),
        makeBloc('science', 10, 80),
    ];
    expectFalse(checkEnlightenmentQualification('factionA', world), 'bloc dominance too high');
});

test('checkEnlightenmentQualification fails on low bloc satisfaction', () => {
    const world = makeEnlightenmentWorld();
    const posture = world.movement.empirePostures.get('factionA')!;
    posture.blocs[0].satisfaction = 20; // below 45
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
    (world as any).government.get('factionA').approval = 30; // drops below threshold
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

test('resolveEnlightenmentSuccess pays the reward into the government legacy', () => {
    const world = makeEnlightenmentWorld();
    const gov = (world as any).government.get('factionA');
    startTranscendence('factionA', world);
    resolveEnlightenmentSuccess('factionA', world);
    const progress = ensureVictoryState(world).enlightenmentProgress.get('factionA')!;
    expectEq(progress.phase, 'complete');
    expectNotNull(progress.completedAt ?? null, 'completion time recorded');
    // The keys getGovernmentModifiers reads — so the reward actually does something.
    expectEq(gov.legacy.bonuses.approval, 3);
    expectApprox(gov.legacy.bonuses.legitimacy_drift, 0.3, 0.0001);
    expectEq(gov.legacy.prestige, 250);
    expectEq(gov.legitimacy, 100, 'legitimacy +10, clamped');
    expectEq(gov.politicalCapital, 50);
    expectEq(progress.legacyBonuses.approval, 3, 'what was granted is recorded for the panel');
});

test('resolveEnlightenmentSuccess presses each rival\'s own blocs, never the winner\'s', () => {
    const world = makeEnlightenmentWorld();
    world.movement.empirePostures.set('factionB', makePosture('factionB', 80));
    world.movement.empirePostures.set('factionC', makePosture('factionC', 40));
    startTranscendence('factionA', world);
    resolveEnlightenmentSuccess('factionA', world);
    const sat = (f: string) => world.movement.empirePostures.get(f)!.blocs[0].satisfaction;
    expectEq(sat('factionA'), 80, 'the winner is untouched');
    expectApprox(sat('factionB'), 77, 0.001, 'a content rival loses 3');
    expectApprox(sat('factionC'), 35.5, 0.001, 'a restless rival loses 4.5');
});

test('a full run: qualify, transcend (announced), achieve', () => {
    resetChronicleBuffer();
    const world = makeEnlightenmentWorld();
    const events: VictoryEvent[] = [];
    tickEnlightenmentProgress('factionA', world, 6 * 3600, events); // inactive → qualifying
    tickDays(world, 'factionA', QUAL_DAYS, events);
    expectEq(events.map(e => e.kind).join(','), 'enlightenment_transcending');
    tickDays(world, 'factionA', 14, events);
    expectEq(events.length, 1, 'fourteen days of the window is not fifteen');
    tickDays(world, 'factionA', 1, events);
    expectEq(events.map(e => e.kind).join(','), 'enlightenment_transcending,enlightenment_achieved');
    const types = drainBuffer().rows.map(r => r.type);
    expectEq(types.join(','), 'enlightenment_transcending,enlightenment_achieved', 'both moments are in the chronicle');
    // Complete is terminal.
    tickEnlightenmentProgress('factionA', world, DAY, events);
    expectEq(events.length, 2);
});

test('slipping while qualifying drains the bank instead of erasing it', () => {
    const world = makeEnlightenmentWorld();
    tickEnlightenmentProgress('factionA', world, 60); // → qualifying
    tickDays(world, 'factionA', 10);
    const gov = (world as any).government.get('factionA');
    gov.approval = 50;
    tickDays(world, 'factionA', 2); // drains 2 × 2 days
    const p = ensureVictoryState(world).enlightenmentProgress.get('factionA')!;
    expectEq(p.phase, 'qualifying', 'two bad days do not end the attempt');
    expectApprox(p.qualificationSecondsAccumulated / DAY, 6, 0.001, 'ten banked, four drained');
    expectTrue(!!p.failingNow, 'the panel can say it is slipping');
    tickDays(world, 'factionA', 3); // drains the rest
    expectEq(p.phase, 'inactive', 'an empty bank ends it');
    expectEq(p.qualificationSecondsAccumulated, 0);
});

test('a short stumble during transcendence strains it, then eases off', () => {
    const world = makeEnlightenmentWorld();
    const events: VictoryEvent[] = [];
    startTranscendence('factionA', world);
    tickDays(world, 'factionA', 5, events);
    const gov = (world as any).government.get('factionA');
    gov.cohesion = 50;
    tickDays(world, 'factionA', 2, events); // two of three grace days
    const p = ensureVictoryState(world).enlightenmentProgress.get('factionA')!;
    expectEq(p.phase, 'transcending', 'still inside the grace');
    expectApprox(p.transcendenceSecondsAccumulated! / DAY, 5, 0.001, 'the window does not advance while failing');
    expectApprox(buildEnlightenmentView(world, 'factionA').strain, 2 / 3, 0.001);
    gov.cohesion = 85;
    tickDays(world, 'factionA', 2, events);
    expectEq(p.strainSeconds, 0, 'strain eases off while it holds');
    expectEq(events.length, 0);
});

test('a broken transcendence is announced and keeps half the bank', () => {
    resetChronicleBuffer();
    const world = makeEnlightenmentWorld();
    const events: VictoryEvent[] = [];
    startTranscendence('factionA', world);
    archiveTile(world, 'factionA').constructionState = 'ruined'; // a saboteur got through
    tickDays(world, 'factionA', 3, events);
    expectEq(events.map(e => e.kind).join(','), 'enlightenment_interrupted');
    const p = ensureVictoryState(world).enlightenmentProgress.get('factionA')!;
    expectEq(p.phase, 'qualifying');
    expectApprox(p.qualificationSecondsAccumulated / DAY, QUAL_DAYS * ENL.interruptRetainFraction, 0.001, 'part of the bank kept');
    expectTrue(p.transcendenceInterrupted);
    expectTrue(drainBuffer().rows.some(r => r.type === 'enlightenment_interrupted'));
});

test('a window started before the bank existed is read from its start time', () => {
    const world = makeEnlightenmentWorld();
    startTranscendence('factionA', world);
    const p = ensureVictoryState(world).enlightenmentProgress.get('factionA')!;
    delete p.transcendenceSecondsAccumulated;
    delete p.strainSeconds;
    world.nowSeconds += 14 * DAY;
    const events: VictoryEvent[] = [];
    tickEnlightenmentProgress('factionA', world, DAY, events);
    expectEq(events.map(e => e.kind).join(','), 'enlightenment_achieved', '14 days elapsed + this tick');
});

test('tickVictory reports every empire that completes on the same tick', () => {
    const world = makeEnlightenmentWorld(['factionA', 'factionB']);
    startTranscendence('factionA', world);
    startTranscendence('factionB', world);
    for (const id of ['factionA', 'factionB']) {
        ensureVictoryState(world).enlightenmentProgress.get(id)!.transcendenceSecondsAccumulated = 14.5 * DAY;
    }
    const events = tickVictory(world, DAY).filter(e => e.kind === 'enlightenment_achieved');
    expectEq(events.map(e => e.factionId).sort().join(','), 'factionA,factionB');
});

test('buildEnlightenmentView shows progress and names rivals', () => {
    const world = makeEnlightenmentWorld(['factionA', 'factionB']);
    tickEnlightenmentProgress('factionA', world, 15 * DAY); // starts qualifying, no time banked
    tickEnlightenmentProgress('factionA', world, (QUAL_DAYS / 2) * DAY); // half the qualifying stage
    startTranscendence('factionB', world);
    const view = buildEnlightenmentView(world, 'factionA');
    expectEq(view.phase, 'qualifying');
    expectApprox(view.stageProgress, 0.5, 0.001);
    expectNotNull(view.stageRemaining);
    expectEq(view.rivalsTranscending.join(','), 'FactionB');
    expectEq(view.conditions.length, 7);
});

test('resolveEnlightenmentFailure drops back to qualifying, not to nothing', () => {
    const world = makeEnlightenmentWorld();
    startTranscendence('factionA', world);
    resolveEnlightenmentFailure('factionA', world);
    const progress = ensureVictoryState(world).enlightenmentProgress.get('factionA')!;
    expectEq(progress.phase, 'qualifying');
    expectEq(progress.transcendenceStartedAt, null);
    expectTrue(progress.transcendenceInterrupted, 'interrupted flag should be set');
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
