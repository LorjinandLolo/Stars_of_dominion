// lib/movement/event-bus.ts
// Typed in-process pub/sub event bus for all movement, exploration,
// infrastructure, and doctrine events.  Wire to network layer later.

// ─── Event Payloads ───────────────────────────────────────────────────────────

export interface HostileEntryEvent {
    type: 'hostileEntry';
    fleetId: string;
    systemId: string;
    ownerFactionId: string;
    intruderFactionId: string;
    layer: string;
    timestamp: number; // unix seconds
}

export interface BlockadeStartedEvent {
    type: 'blockadeStarted';
    fleetId: string;
    systemId: string;
    segmentId?: string;
    factionId: string;
    timestamp: number;
}

export interface BlockadeEndedEvent {
    type: 'blockadeEnded';
    systemId: string;
    segmentId?: string;
    factionId: string;
    reason: 'withdrawn' | 'destroyed' | 'recovered';
    timestamp: number;
}

export interface GateClosedEvent {
    type: 'gateClosed';
    gateId: string;
    systemId: string;
    closedByFactionId: string;
    reason: 'policy' | 'sabotage' | 'overload';
    timestamp: number;
}

export interface GateOpenedEvent {
    type: 'gateOpened';
    gateId: string;
    systemId: string;
    openedByFactionId: string;
    timestamp: number;
}

export interface RouteReroutedEvent {
    type: 'routeRerouted';
    routeId: string;
    oldPath: string[];         // system IDs
    newPath: string[];
    cause: 'collapse' | 'blockade' | 'gateClosed' | 'policyDeny' | 'degradation';
    timestamp: number;
}

export interface InfrastructureAttackEvent {
    type: 'infrastructureAttack';
    actionType: string;        // maps to InfraActionType
    targetId: string;
    attackerFactionId: string;
    severity: number;          // 0–1
    timestamp: number;
}

export interface AnomalyDiscoveredEvent {
    type: 'anomalyDiscovered';
    anomalyId: string;
    anomalyName: string;
    systemId: string;
    planetId?: string;
    factionId: string;
    trigger: string;           // AnomalyTrigger
    payload: Record<string, unknown>;
    timestamp: number;
}

export interface PostureShiftStartedEvent {
    type: 'postureShiftStarted';
    factionId: string;
    fromPosture: string;
    toPosture: string;
    completesAt: number;  // unix seconds
    timestamp: number;
}

export interface PostureShiftCompletedEvent {
    type: 'postureShiftCompleted';
    factionId: string;
    newPosture: string;
    timestamp: number;
}

export interface FrontierPhaseChangedEvent {
    type: 'frontierPhaseChanged';
    systemId: string;
    factionId: string;
    from: string;              // FrontierPhase
    to: string;
    timestamp: number;
}

export interface DegradationEvent {
    type: 'degradationEvent';
    infraType: 'tradeSegment' | 'corridor' | 'gate';
    targetId: string;
    mode: string;              // DegradationMode
    severity: number;          // 0–1
    isPermanent: boolean;
    timestamp: number;
}

export interface ReshapeEvent {
    type: 'reshapeEvent';
    narrative: string;
    newLinks: { fromSystemId: string; toSystemId: string }[];
    fracturedCorridorIds: string[];
    newDeepSpacePaths: { fromSystemId: string; toSystemId: string }[];
    timestamp: number;
}

export interface DoctrineDeviationEvent {
    type: 'doctrineDeviation';
    fleetId: string;
    factionId: string;
    doctrineType: string;
    postureType: string;
    deviationLevel: number;    // 0–1
    timestamp: number;
}

export interface BlocSatisfactionCrisisEvent {
    type: 'blocSatisfactionCrisis';
    factionId: string;
    affectedBlocIds: string[];
    timestamp: number;
}

export interface ExplorationStageCompleteEvent {
    type: 'explorationStageComplete';
    fleetId: string;
    systemId: string;
    stage: 'ping' | 'scan' | 'survey';
    factionId: string;
    timestamp: number;
}

export interface IntelligenceOperationResolveEvent {
    type: 'intelligenceOperationResolve';
    opId: string;
    outcome: string;
    exposed: boolean;
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type GameEvent =
    | HostileEntryEvent
    | BlockadeStartedEvent
    | BlockadeEndedEvent
    | GateClosedEvent
    | GateOpenedEvent
    | RouteReroutedEvent
    | InfrastructureAttackEvent
    | AnomalyDiscoveredEvent
    | PostureShiftStartedEvent
    | PostureShiftCompletedEvent
    | FrontierPhaseChangedEvent
    | DegradationEvent
    | ReshapeEvent
    | DoctrineDeviationEvent
    | BlocSatisfactionCrisisEvent
    | ExplorationStageCompleteEvent
    | IntelligenceOperationResolveEvent;


export type GameEventType = GameEvent['type'];

type Listener<T extends GameEvent> = (event: T) => void;

// ─── EventBus ────────────────────────────────────────────────────────────────

/**
 * In-process typed event bus.  Singleton export — services import and call
 * `eventBus.emit(...)` and `eventBus.on('hostileEntry', cb)`.
 */
class EventBus {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private listeners: Map<GameEventType, Listener<any>[]> = new Map();
    /** Full ordered log of every event emitted — for getCrisisTriggersSince(). */
    private log: { event: GameEvent; emittedAt: number }[] = [];

    on<T extends GameEvent>(type: T['type'], listener: Listener<T>): () => void {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type)!.push(listener as Listener<GameEvent>);
        // Return unsubscribe function
        return () => {
            const arr = this.listeners.get(type);
            if (arr) {
                const idx = arr.indexOf(listener as Listener<GameEvent>);
                if (idx !== -1) arr.splice(idx, 1);
            }
        };
    }

    emit<T extends GameEvent>(event: T): void {
        const now = Date.now() / 1000; // unix seconds
        this.log.push({ event, emittedAt: now });
        const arr = this.listeners.get(event.type) ?? [];
        for (const listener of arr) listener(event);
    }

    /**
     * Returns all events emitted after the given unix-seconds timestamp.
     * Used by getCrisisTriggersSince() in overlay-api.ts.
     */
    getEventsSince(sinceSeconds: number): GameEvent[] {
        return this.log
            .filter((entry) => entry.emittedAt >= sinceSeconds)
            .map((entry) => entry.event);
    }

    /** Clear the in-memory log (e.g. on season end). */
    clearLog(): void {
        this.log = [];
    }
}

export const eventBus = new EventBus();
