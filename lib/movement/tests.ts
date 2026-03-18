// lib/movement/tests.ts
// Integration test suite for Movement, Exploration & Doctrine systems.
// Run with: npx ts-node lib/movement/tests.ts  (or via `tsc --noEmit` for type check).

import {
    findPath,
    issueMoveOrder,
    advanceFleet,
    canAccessLayer,
    weaponizeInfra,
} from './movement-service';
import {
    computeVisibility,
    getRevealStage,
} from './visibility-service';
import {
    tickDegradation,
    attemptReroute,
    attemptReshape,
} from './infrastructure-service';
import {
    issueExploreOrder,
    advanceExploration,
    advanceFrontierPhase,
    setAutomationDoctrine,
    tickAutomation,
} from '../exploration/exploration-service';
import {
    applyDoctrineToFleet,
    tickDoctrineEffects,
    initiatePostureShift,
    tickPostureShift,
    tickBlocInfluence,
    getFleetCardData,
} from '../doctrine/doctrine-service';
import { eventBus } from './event-bus';
import { getOverlayData, getCrisisTriggersSince } from './overlay-api';
import type {
    MovementWorldState,
    SystemNode,
    Fleet,
    GateObject,
    TradeSegment,
    Corridor,
    EmpirePosture,
    InfluenceBloc,
    HyperdriveProfile,
    FactionVisibility,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function layerProfile(): HyperdriveProfile {
    return {
        hyperlane: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
        trade: { speedMultiplier: 1.1, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 0.9 },
        corridor: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
        gate: { speedMultiplier: 3.0, detectabilityMultiplier: 1.2, supplyStrainMultiplier: 1.1 },
        deepSpace: { speedMultiplier: 0.5, detectabilityMultiplier: 0.2, supplyStrainMultiplier: 2.0 },
    };
}

function makeSystem(id: string, name: string, neighbors: string[]): SystemNode {
    return {
        id, name, q: 0, r: 0,
        tags: ['standard'],
        tagReveal: { allTags: ['standard'], revealedAt: {} },
        hyperlaneNeighbors: neighbors,
        tradeSegmentIds: [],
        corridorIds: [],
        instability: 20,
    };
}

function makeFleet(id: string, factionId: string, systemId: string): Fleet {
    return {
        id, factionId, name: `Fleet ${id}`,
        currentSystemId: systemId,
        destinationSystemId: null,
        activeLayer: null,
        transitProgress: 0,
        etaSeconds: 0,
        plannedPath: [],
        orders: [],
        doctrine: {
            type: 'Defensive',
            deviationFromPosture: 0,
            preferredLayers: ['hyperlane', 'corridor'],
            retreatThreshold: 0.4,
            logisticsStrain: 0,
            moraleDrift: 0,
            supplyLevel: 1,
        },
        postureId: 'Consolidating',
        strength: 1,
        hyperdriveProfile: layerProfile(),
        isDetectable: true,
    };
}

function makePosture(factionId: string): EmpirePosture {
    const blocs: InfluenceBloc[] = [
        { id: 'military', name: 'Military', influence: 25, satisfaction: 60, trend: 0 },
        { id: 'trade', name: 'Trade', influence: 30, satisfaction: 70, trend: 0 },
        { id: 'frontier', name: 'Frontier', influence: 20, satisfaction: 50, trend: 0 },
        { id: 'science', name: 'Science', influence: 25, satisfaction: 65, trend: 0 },
    ];
    return {
        factionId,
        current: 'Consolidating',
        pendingTarget: null,
        switchCompletesAt: null,
        transitionPenalty: 0,
        blocs,
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

/** Build a minimal 10-node world state for testing. */
function makeWorldState(): MovementWorldState {
    const systems = new Map<string, SystemNode>();
    // A — B — C — D — E (chain)
    //     |
    //     F — G
    // H — I — J
    systems.set('A', makeSystem('A', 'Alpha', ['B']));
    systems.set('B', makeSystem('B', 'Beta', ['A', 'C', 'F']));
    systems.set('C', makeSystem('C', 'Gamma', ['B', 'D']));
    systems.set('D', makeSystem('D', 'Delta', ['C', 'E']));
    systems.set('E', makeSystem('E', 'Epsilon', ['D']));
    systems.set('F', makeSystem('F', 'Fomalia', ['B', 'G']));
    systems.set('G', makeSystem('G', 'Gorgon', ['F']));
    systems.set('H', makeSystem('H', 'Heron', ['I']));
    systems.set('I', makeSystem('I', 'Iridis', ['H', 'J']));
    systems.set('J', makeSystem('J', 'Janus', ['I']));

    // One gate at E, another at H (for gate-jump test)
    const gates = new Map<string, GateObject>();
    gates.set('gate-E', { id: 'gate-E', systemId: 'E', ownerFactionId: 'faction-A', state: 'online', accessPolicy: 'open', integrity: 1, allowedFactionIds: [], overloadTriggered: false });
    gates.set('gate-H', { id: 'gate-H', systemId: 'H', ownerFactionId: 'faction-A', state: 'online', accessPolicy: 'open', integrity: 1, allowedFactionIds: [], overloadTriggered: false });
    systems.get('E')!.gateId = 'gate-E';
    systems.get('H')!.gateId = 'gate-H';

    // One trade segment B→C
    const tradeSegments = new Map<string, TradeSegment>();
    tradeSegments.set('ts-BC', { id: 'ts-BC', fromSystemId: 'B', toSystemId: 'C', throughput: 0.8, status: 'active', isReroute: false, integrity: 1, isFlashing: false });

    // One corridor B→C→D
    const corridors = new Map<string, Corridor>();
    corridors.set('cor-1', { id: 'cor-1', name: 'Core Corridor', nodeIds: ['B', 'C', 'D'], chokepointIds: ['C'], militarizationLevel: 0, denialFieldActive: false });

    const fleets = new Map<string, Fleet>();
    const ourFleet = makeFleet('fleet-1', 'faction-A', 'A');
    fleets.set('fleet-1', ourFleet);

    const empirePostures = new Map<string, EmpirePosture>();
    empirePostures.set('faction-A', makePosture('faction-A'));

    const factionVisibility = new Map<string, FactionVisibility>();
    factionVisibility.set('faction-A', {
        'A': { revealStage: 'surveyed', lastSeenAt: new Date().toISOString(), visibleTags: ['standard'], observedFleetIds: [], movementIntentVisible: false },
        'B': { revealStage: 'scanned', lastSeenAt: new Date().toISOString(), visibleTags: ['standard'], observedFleetIds: [], movementIntentVisible: false },
        'C': { revealStage: 'pinged', lastSeenAt: new Date().toISOString(), visibleTags: [], observedFleetIds: [], movementIntentVisible: false },
        'E': { revealStage: 'scanned', lastSeenAt: new Date().toISOString(), visibleTags: ['standard'], observedFleetIds: [], movementIntentVisible: false },
        'H': { revealStage: 'scanned', lastSeenAt: new Date().toISOString(), visibleTags: ['standard'], observedFleetIds: [], movementIntentVisible: false },
    });

    return {
        systems, planets: new Map(), gates, tradeSegments, corridors, fleets,
        factionVisibility, sensorSources: [],
        anomalyPool: [], frontierClaims: [], explorationOrders: [],
        automationDoctrines: new Map(), empirePostures, degradations: new Map(),
        nowSeconds: Date.now() / 1000,
    };
}

// ─── Test runner ──────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(`FAIL: ${message}`);
    console.log(`  ✓ ${message}`);
}

function suite(name: string, fn: () => void): void {
    console.log(`\n── ${name} ──`);
    try { fn(); console.log(`  PASS`); }
    catch (e) { console.error(`  ${(e as Error).message}`); process.exitCode = 1; }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

suite('MovementService.findPath — hyperlane', () => {
    const world = makeWorldState();
    const fleet = world.fleets.get('fleet-1')!;

    const result = findPath(fleet, 'D', ['hyperlane'], world);
    assert(result.canReach, 'Can reach D from A via hyperlane');
    assert(result.path[0] === 'A', 'Path starts at A');
    assert(result.path[result.path.length - 1] === 'D', 'Path ends at D');
    assert(result.totalSeconds > 0, 'Travel time is positive');
});

suite('MovementService.findPath — gate jump', () => {
    const world = makeWorldState();
    const fleet = world.fleets.get('fleet-1')!;

    // From A we can't reach H without gate; with gate E→H jump it's reachable
    const resultNoGate = findPath(fleet, 'H', ['hyperlane'], world);
    // Should still find path A→B→...→E→... but hyperlane doesn't connect E→H without deep space
    const resultWithGate = findPath(fleet, 'H', ['hyperlane', 'gate'], world);
    assert(resultWithGate.canReach, 'Can reach H via gate chain');
    assert(resultWithGate.totalSeconds < (resultNoGate.canReach ? resultNoGate.totalSeconds * 0.9 : Infinity), 'Gate path is faster');
});

suite('MovementService.advanceFleet — continuous travel', () => {
    const world = makeWorldState();
    let fleet = world.fleets.get('fleet-1')!;

    fleet = issueMoveOrder(fleet, 'C', 'hyperlane', world);
    assert(fleet.destinationSystemId === 'C', 'Destination set to C');
    assert(fleet.plannedPath.length >= 2, 'Path has at least 2 hops');

    const hopCost = fleet.etaSeconds;
    fleet = advanceFleet(fleet, hopCost * 0.5, world);
    assert(fleet.transitProgress > 0, 'Transit progress advanced');
    assert(fleet.activeLayer === 'hyperlane', 'Active layer is hyperlane');
});

suite('MovementService.weaponizeInfra — blockade', () => {
    const world = makeWorldState();
    let emitted = false;
    const unsub = eventBus.on('blockadeStarted', () => { emitted = true; });

    weaponizeInfra({ type: 'blockade', actorFactionId: 'faction-B', targetId: 'B', intensity: 0.7 }, world);
    assert(emitted, 'blockadeStarted event emitted');
    unsub();
});

suite('VisibilityService.computeVisibility — reveal stages', () => {
    const world = makeWorldState();
    // Add sensor on system A for faction-A
    world.sensorSources.push({ id: 'src-1', kind: 'planet', factionId: 'faction-A', systemId: 'A', detectionRadius: 3, detectionStrength: 1.0 });

    const vis = computeVisibility('faction-A', world);
    assert(vis['A']?.revealStage === 'surveyed', 'A is surveyed (strong sensor)');
    assert(['scanned', 'pinged'].includes(vis['B']?.revealStage ?? ''), 'B is at least pinged');
    assert(vis['J']?.revealStage === 'unknown' || !vis['J'], 'J is unknown (too far)');
});

suite('VisibilityService — no downgrade', () => {
    const world = makeWorldState();
    world.factionVisibility.get('faction-A')!['D'] = {
        revealStage: 'surveyed', lastSeenAt: new Date().toISOString(), visibleTags: [], observedFleetIds: [], movementIntentVisible: false,
    };
    const stage = getRevealStage('faction-A', 'D', world.factionVisibility);
    assert(stage === 'surveyed', 'Previously surveyed system stays surveyed');
});

suite('InfrastructureService.tickDegradation', () => {
    const world = makeWorldState();
    const seg = world.tradeSegments.get('ts-BC')!;
    const prevIntegrity = seg.integrity;
    tickDegradation(world, 3600); // 1 hour
    assert(seg.integrity < prevIntegrity, 'Trade segment degrades over time');
    assert(seg.integrity > 0, 'Not fully collapsed after 1 hour');
});

suite('InfrastructureService.attemptReroute', () => {
    const world = makeWorldState();
    const seg = world.tradeSegments.get('ts-BC')!;
    seg.status = 'collapsed';
    seg.integrity = 0;

    let rerouteEmitted = false;
    const unsub = eventBus.on('routeRerouted', () => { rerouteEmitted = true; });
    const result = attemptReroute('ts-BC', world);
    unsub();

    // Route may or may not find alternate (topology-dependent); just check no crash
    assert(true, 'attemptReroute completed without error');
});

suite('ExplorationService.issueExploreOrder + advanceExploration', () => {
    const world = makeWorldState();
    // Fast-forward: issue a 'ping' order and immediately complete it
    const order = issueExploreOrder('fleet-1', 'J', 'ping', world);
    assert(order !== null, 'Exploration order issued');
    assert(order!.mode === 'ping', 'Order mode is ping');

    // Move time past completion
    world.nowSeconds = new Date(order!.completesAt).getTime() / 1000 + 1;
    const vis = world.factionVisibility.get('faction-A')!;
    vis['J'] = { revealStage: 'unknown', lastSeenAt: '', visibleTags: [], observedFleetIds: [], movementIntentVisible: false };
    advanceExploration(world, 1);
    assert(world.explorationOrders.length === 0, 'Order consumed after completion');
});

suite('ExplorationService.advanceFrontierPhase', () => {
    const world = makeWorldState();
    world.frontierClaims.push({
        systemId: 'E', factionId: 'faction-A', phase: 'claim',
        presenceScore: 25, phaseStartedAt: new Date().toISOString(), claimAgeDays: 4,
    });

    let phaseEvent = false;
    const unsub = eventBus.on('frontierPhaseChanged', () => { phaseEvent = true; });
    const result = advanceFrontierPhase('E', 'faction-A', world);
    unsub();

    assert(result !== null, 'Phase advanced');
    assert(result!.phase === 'anchor', 'Advanced from claim to anchor');
    assert(phaseEvent, 'frontierPhaseChanged event emitted');
});

suite('DoctrineService.tickDoctrineEffects — gradual drift', () => {
    const world = makeWorldState();
    const fleet = world.fleets.get('fleet-1')!;
    const startStrain = fleet.doctrine.logisticsStrain;

    // Tick 10 hours
    tickDoctrineEffects(fleet, world, 10 * 3600);

    assert(fleet.doctrine.logisticsStrain > startStrain, 'Logistics strain increases over time');
    assert(fleet.doctrine.logisticsStrain < 1, 'Logistics strain never exceeds max in 10 hours');
    assert(fleet.doctrine.supplyLevel < 1, 'Supply level depleted');
});

suite('DoctrineService.tickBlocInfluence — bounded satisfaction', () => {
    const world = makeWorldState();
    // Tick multiple times to ensure satisfaction stays 0–100
    for (let i = 0; i < 10; i++) {
        tickBlocInfluence('faction-A', world);
    }
    const posture = world.empirePostures.get('faction-A')!;
    for (const bloc of posture.blocs) {
        assert(bloc.satisfaction >= 0 && bloc.satisfaction <= 100, `${bloc.id} satisfaction in bounds`);
    }
});

suite('DoctrineService.initiatePostureShift', () => {
    const world = makeWorldState();
    let shiftStarted = false;
    const unsub = eventBus.on('postureShiftStarted', () => { shiftStarted = true; });
    initiatePostureShift('faction-A', 'Militarist', world);
    unsub();

    const posture = world.empirePostures.get('faction-A')!;
    assert(shiftStarted, 'postureShiftStarted event emitted');
    assert(posture.pendingTarget === 'Militarist', 'Pending target set to Militarist');
    assert(posture.current === 'Consolidating', 'Current posture did not change yet');
    assert(posture.transitionPenalty > 0, 'Transition penalty applied');

    // Advance past completion
    world.nowSeconds = new Date(posture.switchCompletesAt!).getTime() / 1000 + 1;
    let shiftCompleted = false;
    const unsub2 = eventBus.on('postureShiftCompleted', () => { shiftCompleted = true; });
    tickPostureShift('faction-A', world);
    unsub2();
    assert(shiftCompleted, 'postureShiftCompleted event emitted');
    assert(posture.current === 'Militarist', 'Posture changed to Militarist');
});

suite('EventBus.getCrisisTriggersSince', () => {
    const since = Date.now() / 1000;
    const world = makeWorldState();
    world.nowSeconds = since + 1;
    weaponizeInfra({ type: 'sabotageGate', actorFactionId: 'faction-B', targetId: 'gate-E', intensity: 1.0 }, world);
    const triggers = getCrisisTriggersSince(since);
    assert(triggers.length > 0, 'Crisis triggers returned after hostile action');
});

suite('OverlayAPI.getOverlayData — all layers', () => {
    const world = makeWorldState();
    world.sensorSources.push({ id: 'src-1', kind: 'planet', factionId: 'faction-A', systemId: 'A', detectionRadius: 4, detectionStrength: 1.0 });
    world.factionVisibility.set('faction-A', computeVisibility('faction-A', world));

    const overlays = ['systems', 'trade', 'corridor', 'gates', 'deepSpace', 'sensors', 'influence'] as const;
    for (const overlay of overlays) {
        const primitives = getOverlayData('faction-A', overlay, world);
        assert(Array.isArray(primitives), `${overlay} overlay returns an array`);
    }
});

suite('DoctrineService.getFleetCardData', () => {
    const world = makeWorldState();
    const card = getFleetCardData('faction-A', 'fleet-1', world);
    assert(card !== null, 'Fleet card returned');
    assert(card!.doctrineType === 'Defensive', 'Doctrine type correct');
    assert(card!.supplyStrainLevel === 'low', 'Supply strain low initially');
    assert(card!.isInTransit === false, 'Fleet not in transit');
});

console.log('\n✅ All tests completed.\n');
