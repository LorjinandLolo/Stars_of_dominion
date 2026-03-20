// lib/doctrine/doctrine-service.ts
// Empire posture, fleet-specific doctrine, logistics drift, and bloc influence.

import type {
    Fleet,
    FleetDoctrine,
    FleetDoctrineType,
    EmpirePosture,
    EmpirePostureType,
    InfluenceBloc,
    MovementWorldState,
    FleetCardData,
} from '../movement/types';
import { 
    DoctrineDomain, 
    DoctrineDefinition, 
    EmpireDoctrines 
} from './types';
import doctrineDefinitions from './data/doctrine-definitions.json';
import { eventBus } from '../movement/event-bus';
import { GameWorldState } from '../game-world-state';
import config from '../movement/movement-config.json';

// ─── Constants ───────────────────────────────────────────────────────────────

const DOCTRINE_DEFINITIONS: Map<string, DoctrineDefinition> = new Map(
    (doctrineDefinitions as any[]).map(d => [d.id, d])
);

const DOCTRINE_CHANGE_COOLDOWN_SECONDS = 3600 * 24; // 1 day

// ─── Type helpers ─────────────────────────────────────────────────────────────

type DoctrineConfig = typeof config.doctrine.doctrineTypes[keyof typeof config.doctrine.doctrineTypes];
type PostureConfig = typeof config.doctrine.postureTypes[keyof typeof config.doctrine.postureTypes];

// ─── Doctrine application ──────────────────────────────────────────────────────

/**
 * Build a fresh FleetDoctrine for a fleet based on its doctrine type and
 * the current empire posture.  Call when doctrine is first assigned or changed.
 */
export function applyDoctrineToFleet(
    fleet: Fleet,
    posture: EmpirePosture,
    doctrineType: FleetDoctrineType
): FleetDoctrine {
    const dt = config.doctrine.doctrineTypes[doctrineType] as DoctrineConfig;

    // Compute deviation from posture: compare preferred layers vs posture defaults
    const posturePreferred = getPosturePreferredLayers(posture.current);
    const doctrinePreferred = dt.preferredLayers as string[];
    const overlap = doctrinePreferred.filter(l => posturePreferred.includes(l)).length;
    const maxOverlap = Math.max(posturePreferred.length, doctrinePreferred.length, 1);
    const deviation = 1 - overlap / maxOverlap;

    return {
        type: doctrineType,
        deviationFromPosture: deviation,
        preferredLayers: dt.preferredLayers as FleetDoctrine['preferredLayers'],
        retreatThreshold: dt.retreatThreshold,
        logisticsStrain: 0,
        moraleDrift: 0,
        supplyLevel: 1,
    };
}

function getPosturePreferredLayers(posture: EmpirePostureType): string[] {
    const map: Record<EmpirePostureType, string[]> = {
        Expansionist: ['hyperlane', 'deepSpace'],
        Consolidating: ['trade', 'corridor'],
        Militarist: ['hyperlane', 'corridor'],
        Pacifist: ['trade'],
        Mercantile: ['trade', 'gate'],
    };
    return map[posture] ?? ['hyperlane'];
}

// ─── Doctrine tick effects ────────────────────────────────────────────────────

export interface DoctrineTickResult {
    logisticsStrainDelta: number;
    moraleDriftDelta: number;
    supplyDepleted: number;
}

/**
 * Apply ongoing doctrine effects (logistics strain, morale drift, supply burn)
 * for a single fleet over deltaSeconds.  Mutates fleet.doctrine in-place.
 */
export function tickDoctrineEffects(
    fleet: Fleet,
    world: MovementWorldState,
    deltaSeconds: number
): DoctrineTickResult {
    const hours = deltaSeconds / 3600;
    const dt = config.doctrine.doctrineTypes[fleet.doctrine.type] as DoctrineConfig;
    const dc = config.doctrine;

    // Logistics strain: base rate × supply modifier × deviation friction
    const deviationPenalty = 1 + fleet.doctrine.deviationFromPosture * dc.doctrineDeviationFriction;
    const strainDelta = dc.logisticsStrainRateBase * dt.supplyModifier * deviationPenalty * hours;

    // Morale drift: accumulated gradually, not instant
    const moraleDelta = dt.moraleDriftBias * hours * 3600; // per-second bias scaled to hours

    // Supply burn proportional to strain
    const supplyBurn = strainDelta * 0.5;

    fleet.doctrine.logisticsStrain = Math.min(1, fleet.doctrine.logisticsStrain + strainDelta);
    fleet.doctrine.moraleDrift = Math.max(-100, Math.min(100, fleet.doctrine.moraleDrift + moraleDelta));
    fleet.doctrine.supplyLevel = Math.max(0, fleet.doctrine.supplyLevel - supplyBurn);

    // Morale recovery when not in transit and supply is healthy
    if (!fleet.destinationSystemId && fleet.doctrine.supplyLevel > 0.5) {
        const recovery = dc.moraleRecoveryRatePerHour * hours;
        fleet.doctrine.moraleDrift = Math.min(0, fleet.doctrine.moraleDrift + recovery);
        fleet.doctrine.logisticsStrain = Math.max(0, fleet.doctrine.logisticsStrain - recovery * 0.3);
    }

    return {
        logisticsStrainDelta: strainDelta,
        moraleDriftDelta: moraleDelta,
        supplyDepleted: supplyBurn,
    };
}

// ─── Posture management ───────────────────────────────────────────────────────

/**
 * Initiate an empire posture shift for a faction.
 * Takes time (config.doctrine.postureSwitchDurationHours); emits event.
 */
export function initiatePostureShift(
    factionId: string,
    targetPosture: EmpirePostureType,
    world: MovementWorldState
): void {
    const posture = world.empirePostures.get(factionId);
    if (!posture) return;
    if (posture.current === targetPosture) return;
    if (posture.pendingTarget) return; // already switching

    const durationHours = config.doctrine.postureSwitchDurationHours;
    const completesAt = world.nowSeconds + durationHours * 3600;

    posture.pendingTarget = targetPosture;
    posture.switchCompletesAt = new Date(completesAt * 1000).toISOString();
    posture.transitionPenalty = config.doctrine.postureTransitionInefficiency;

    eventBus.emit({
        type: 'postureShiftStarted',
        factionId,
        fromPosture: posture.current,
        toPosture: targetPosture,
        completesAt,
        timestamp: world.nowSeconds,
    });
}

/**
 * Advance posture shift timer.  If complete, apply the new posture.
 */
export function tickPostureShift(
    factionId: string,
    world: MovementWorldState
): void {
    const posture = world.empirePostures.get(factionId);
    if (!posture || !posture.pendingTarget || !posture.switchCompletesAt) return;

    const completesAt = new Date(posture.switchCompletesAt).getTime() / 1000;
    if (world.nowSeconds < completesAt) return;

    const prev = posture.current;
    posture.current = posture.pendingTarget;
    posture.pendingTarget = null;
    posture.switchCompletesAt = null;
    posture.transitionPenalty = 0;

    // Re-evaluate deviance for all faction fleets
    for (const fleet of world.fleets.values()) {
        if (fleet.factionId !== factionId) continue;
        fleet.doctrine = applyDoctrineToFleet(fleet, posture, fleet.doctrine.type);
    }

    eventBus.emit({
        type: 'postureShiftCompleted',
        factionId,
        newPosture: posture.current,
        timestamp: world.nowSeconds,
    });
}

// ─── Bloc influence ───────────────────────────────────────────────────────────

/**
 * Drift bloc influence and satisfaction based on active posture & fleet doctrines.
 * Call every `blocInfluenceUpdateIntervalHours` (config-driven).
 * Returns updated blocs.
 */
export function tickBlocInfluence(
    factionId: string,
    world: MovementWorldState
): InfluenceBloc[] {
    const posture = world.empirePostures.get(factionId);
    if (!posture) return [];

    const pc = config.doctrine.postureTypes[posture.current] as Record<string, number> | undefined;
    const dc = config.doctrine;

    const factionFleets = [...world.fleets.values()].filter(f => f.factionId === factionId);
    const avgStrain = factionFleets.reduce((s, f) => s + f.doctrine.logisticsStrain, 0) / Math.max(1, factionFleets.length);
    const avgMorale = factionFleets.reduce((s, f) => s + f.doctrine.moraleDrift, 0) / Math.max(1, factionFleets.length);

    for (const bloc of posture.blocs) {
        // Apply posture biases
        const bias = (pc?.[`${bloc.id}BlocBias`] as number | undefined) ?? 0;

        // Satisfaction drifts toward the posture direction
        bloc.satisfaction = clamp(bloc.satisfaction + bias * 10, 0, 100);

        // Military bloc dislikes high strain
        if (bloc.id === 'military') {
            bloc.satisfaction = clamp(bloc.satisfaction - avgStrain * 20, 0, 100);
        }
        // Trade bloc dislikes blockades (proxy: high morale fatigue = trade disruption)
        if (bloc.id === 'trade') {
            const tradePenalty = avgMorale < -20 ? Math.abs(avgMorale) * 0.1 : 0;
            bloc.satisfaction = clamp(bloc.satisfaction - tradePenalty, 0, 100);
        }
        // Frontier bloc grows when exploration orders are active
        if (bloc.id === 'frontier') {
            const activeExplore = world.explorationOrders.filter(
                o => world.fleets.get(o.fleetId)?.factionId === factionId
            ).length;
            bloc.satisfaction = clamp(bloc.satisfaction + activeExplore * 2, 0, 100);
        }
        // Science bloc steady unless military posture
        if (bloc.id === 'science') {
            const sciPenalty = posture.current === 'Militarist' ? -3 : 1;
            bloc.satisfaction = clamp(bloc.satisfaction + sciPenalty, 0, 100);
        }

        // Trend: derivative of satisfaction (simplified: positive if bias > 0)
        bloc.trend = bias > 0 ? 1 : bias < 0 ? -1 : 0;
    }

    // Check for multi-bloc crisis condition: ≥3 blocs at low satisfaction
    const unhappyBlocs = posture.blocs.filter(b => b.satisfaction < dc.blocMinSatisfactionForCrisis);
    if (unhappyBlocs.length >= dc.blocCrisisThreshold) {
        eventBus.emit({
            type: 'blocSatisfactionCrisis',
            factionId,
            affectedBlocIds: unhappyBlocs.map(b => b.id),
            timestamp: world.nowSeconds,
        });
    }

    return posture.blocs;
}

// ─── Fleet card data (UI) ─────────────────────────────────────────────────────

const DOCTRINE_ICONS: Record<FleetDoctrineType, string> = {
    Defensive: 'shield',
    Offensive: 'sword',
    Raider: 'skull',
    Fortress: 'castle',
    Mobility: 'zap',
};

function strainLevel(v: number): FleetCardData['supplyStrainLevel'] {
    if (v < 0.25) return 'low';
    if (v < 0.55) return 'moderate';
    if (v < 0.80) return 'high';
    return 'critical';
}

function etaLabel(fleet: Fleet): string {
    if (!fleet.destinationSystemId) return 'In system';
    const secs = fleet.etaSeconds;
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.round(secs / 60)} min`;
    return `${(secs / 3600).toFixed(1)} hr`;
}

/**
 * Produce the UI fleet card data for a single fleet.
 */
export function getFleetCardData(
    factionId: string,
    fleetId: string,
    world: MovementWorldState
): FleetCardData | null {
    const fleet = world.fleets.get(fleetId);
    if (!fleet || fleet.factionId !== factionId) return null;

    const posture = world.empirePostures.get(factionId);
    const postureAligned = posture
        ? fleet.doctrine.deviationFromPosture < 0.25
        : true;

    return {
        fleetId: fleet.id,
        name: fleet.name,
        factionId: fleet.factionId,
        doctrineType: fleet.doctrine.type,
        doctrineIcon: DOCTRINE_ICONS[fleet.doctrine.type],
        activeLayer: fleet.activeLayer,
        layerBias: fleet.doctrine.preferredLayers,
        supplyStrainLevel: strainLevel(fleet.doctrine.logisticsStrain),
        supplyStrainValue: fleet.doctrine.logisticsStrain,
        moraleDrift: fleet.doctrine.moraleDrift,
        strength: fleet.strength,
        etaLabel: etaLabel(fleet),
        isDetectable: fleet.isDetectable,
        isInTransit: fleet.destinationSystemId !== null,
        postureAligned,
    };
}

// ─── Empire Domain Doctrines ──────────────────────────────────────────────────

/**
 * Set a doctrine for an empire domain.
 */
export function setEmpireDoctrine(
    world: GameWorldState,
    factionId: string,
    domain: DoctrineDomain,
    doctrineId: string
): boolean {
    let empireDoctrines = world.doctrines.get(factionId);
    if (!empireDoctrines) {
        empireDoctrines = {
            factionId,
            activeDoctrines: { military: null, economic: null, intelligence: null },
            lastChangeTimestamps: { military: 0, economic: 0, intelligence: 0 }
        };
        world.doctrines.set(factionId, empireDoctrines);
    }

    const lastChange = empireDoctrines.lastChangeTimestamps[domain];
    if (world.nowSeconds - lastChange < DOCTRINE_CHANGE_COOLDOWN_SECONDS) {
        return false; // On cooldown
    }

    const definition = DOCTRINE_DEFINITIONS.get(doctrineId);
    if (!definition || definition.domain !== domain) return false;

    const prev = empireDoctrines.activeDoctrines[domain];
    empireDoctrines.activeDoctrines[domain] = doctrineId;
    empireDoctrines.lastChangeTimestamps[domain] = world.nowSeconds;

    eventBus.emit({
        type: 'doctrineChanged',
        factionId,
        domain,
        oldDoctrineId: prev,
        newDoctrineId: doctrineId,
        timestamp: world.nowSeconds
    });

    return true;
}

/**
 * Get aggregate modifiers from empire-wide doctrines.
 */
export function getEmpireDoctrineModifiers(
    world: GameWorldState,
    factionId: string
): Record<string, number> {
    const modifiers: Record<string, number> = {};
    const empireDoctrines = world.doctrines.get(factionId);
    if (!empireDoctrines) return modifiers;

    for (const doctrineId of Object.values(empireDoctrines.activeDoctrines)) {
        if (!doctrineId) continue;
        const def = DOCTRINE_DEFINITIONS.get(doctrineId);
        if (!def) continue;

        for (const [key, val] of Object.entries(def.modifiers)) {
            modifiers[key] = (modifiers[key] || 0) + val;
        }
    }

    return modifiers;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}
