// lib/orbital/orbital-service.ts
// Phase 3 — Orbital infrastructure: slots, construction, damage and the derived
// ratings the rest of the game reads off a planet's orbit.
//
// Effects scale linearly with integrity. A station at 40% is a station doing 40%
// of its job, which is what makes bombarding the layer worth an attacker's time
// before committing to a landing.

import type { Planet as ConstructionPlanet } from '../construction/construction-types';
import type { GameWorldState } from '../game-world-state';
import { ORBITAL_STRUCTURE_BY_ID } from '../../data/orbital-structures';
import {
    BASE_ORBITAL_SLOTS,
    ORBITAL_SLOT_INFRA_THRESHOLDS,
    DAMAGED_INTEGRITY_THRESHOLD,
    REPAIR_INTEGRITY_PER_HOUR,
    ORBIT_CONTROL_THRESHOLD,
    SHIPYARD_TIER_UNLOCKS,
    ORBITAL_DEFENSE_EFFECT,
    ORBITAL_SHIELD_EFFECT,
    ORBITAL_SENSOR_EFFECT,
    SHIPYARD_TIER_EFFECT,
    FLEET_CAPACITY_EFFECT,
    FLEET_REPAIR_EFFECT,
    TRADE_EFFICIENCY_EFFECT,
} from './orbital-types';
import type {
    OrbitalState,
    OrbitalSlot,
    OrbitalBuildOrder,
    OrbitalRatings,
    OrbitalStructureDefinition,
} from './orbital-types';

// ─── Slots ────────────────────────────────────────────────────────────────────

/**
 * How many orbital slots a planet has. Orbit is only as buildable as the ground
 * support beneath it, so slots unlock with planetary infrastructure.
 */
export function orbitalSlotCount(planet: ConstructionPlanet): number {
    const infra = planet.infrastructureLevel ?? 1;
    let slots = BASE_ORBITAL_SLOTS;
    for (const threshold of ORBITAL_SLOT_INFRA_THRESHOLDS) {
        if (infra >= threshold) slots++;
    }
    return slots;
}

function emptySlot(planetId: string, index: number): OrbitalSlot {
    return {
        slotId: `${planetId}-orb${index}`,
        structureId: null,
        state: 'empty',
        completesAt: null,
        integrity: 100,
    };
}

/**
 * Get (creating if needed) a planet's orbital layer, resized to its current slot
 * count. Grows when infrastructure unlocks a slot; never shrinks below occupied
 * slots, because demolishing infrastructure should not silently delete a station.
 */
export function ensureOrbitalState(planet: ConstructionPlanet): OrbitalState {
    if (!planet.orbital) {
        planet.orbital = { slots: [], buildQueue: [] };
    }
    const orbital = planet.orbital;
    if (!Array.isArray(orbital.slots)) orbital.slots = [];
    if (!Array.isArray(orbital.buildQueue)) orbital.buildQueue = [];

    const target = orbitalSlotCount(planet);
    while (orbital.slots.length < target) {
        orbital.slots.push(emptySlot(planet.id, orbital.slots.length));
    }
    // Trim only trailing slots that were never used.
    while (orbital.slots.length > target) {
        const last = orbital.slots[orbital.slots.length - 1];
        if (last.structureId !== null || last.state !== 'empty') break;
        orbital.slots.pop();
    }
    return orbital;
}

// ─── Derived ratings ──────────────────────────────────────────────────────────

/** Live effect weight of a slot: 0 when destroyed or unfinished, else integrity-scaled. */
function slotEffectiveness(slot: OrbitalSlot): number {
    if (slot.state !== 'active' && slot.state !== 'damaged') return 0;
    if (!slot.structureId) return 0;
    return Math.max(0, Math.min(1, slot.integrity / 100));
}

const ZERO_RATINGS: OrbitalRatings = {
    defensePower: 0,
    shieldStrength: 0,
    sensorStrength: 0,
    shipyardTier: 0,
    shipProductionBonus: 0,
    fleetCapacity: 0,
    fleetRepairRate: 0,
    researchOutput: 0,
    logisticsCapacity: 0,
    tradeEfficiency: 0,
    storageCapacity: {},
    storageThroughput: 0,
    activeStructures: 0,
    hasStation: false,
};

/**
 * Everything the rest of the game reads off a planet's orbit.
 * Cheap enough to call per tick; nothing is cached.
 */
export function computeOrbitalRatings(planet: ConstructionPlanet | undefined): OrbitalRatings {
    if (!planet?.orbital?.slots?.length) return { ...ZERO_RATINGS, storageCapacity: {} };

    const ratings: OrbitalRatings = { ...ZERO_RATINGS, storageCapacity: {} };

    for (const slot of planet.orbital.slots) {
        const weight = slotEffectiveness(slot);
        if (weight <= 0) continue;
        const def = ORBITAL_STRUCTURE_BY_ID[slot.structureId!];
        if (!def) continue;

        ratings.activeStructures++;
        if (def.category === 'station') ratings.hasStation = true;

        for (const effect of def.effects) {
            const value = effect.value * weight;
            switch (effect.type) {
                case ORBITAL_DEFENSE_EFFECT: ratings.defensePower += value; break;
                case ORBITAL_SHIELD_EFFECT: ratings.shieldStrength += value; break;
                case ORBITAL_SENSOR_EFFECT: ratings.sensorStrength += value; break;
                case FLEET_CAPACITY_EFFECT: ratings.fleetCapacity += value; break;
                case FLEET_REPAIR_EFFECT: ratings.fleetRepairRate += value; break;
                case TRADE_EFFICIENCY_EFFECT: ratings.tradeEfficiency += value; break;
                case 'research_output': ratings.researchOutput += value; break;
                case 'logistics_capacity': ratings.logisticsCapacity += value; break;
                case 'ship_production_speed': ratings.shipProductionBonus += value; break;
                case 'storage_throughput': ratings.storageThroughput += value; break;
                case 'storage_capacity': {
                    const target = effect.target ?? 'bulk';
                    ratings.storageCapacity[target] = (ratings.storageCapacity[target] ?? 0) + value;
                    break;
                }
                case SHIPYARD_TIER_EFFECT:
                    // Tier is a threshold, not a sum — and a half-wrecked yard cannot
                    // lay a keel it could when intact.
                    if (slot.integrity >= DAMAGED_INTEGRITY_THRESHOLD) {
                        ratings.shipyardTier = Math.max(ratings.shipyardTier, effect.value);
                    }
                    break;
            }
        }
    }

    return ratings;
}

/** Hull classes this planet's orbit can currently lay down. */
export function buildableHullClasses(planet: ConstructionPlanet | undefined): string[] {
    const tier = computeOrbitalRatings(planet).shipyardTier;
    return SHIPYARD_TIER_UNLOCKS[tier] ?? [];
}

/** Peak defense power this orbit would have with everything intact. */
export function maxOrbitalDefensePower(planet: ConstructionPlanet | undefined): number {
    if (!planet?.orbital?.slots?.length) return 0;
    let total = 0;
    for (const slot of planet.orbital.slots) {
        if (!slot.structureId || slot.state === 'empty' || slot.state === 'under_construction') continue;
        const def = ORBITAL_STRUCTURE_BY_ID[slot.structureId];
        if (!def) continue;
        for (const effect of def.effects) {
            if (effect.type === ORBITAL_DEFENSE_EFFECT) total += effect.value;
        }
    }
    return total;
}

/**
 * True when the layer has been beaten below the share of its own intact rating
 * needed to contest orbit. An empty orbit is uncontested by definition.
 */
export function isOrbitSuppressed(planet: ConstructionPlanet | undefined): boolean {
    const max = maxOrbitalDefensePower(planet);
    if (max <= 0) return true;
    return computeOrbitalRatings(planet).defensePower < max * ORBIT_CONTROL_THRESHOLD;
}

// ─── Construction ─────────────────────────────────────────────────────────────

export interface OrbitalBuildCheck {
    canBuild: boolean;
    reason?: string;
    /** Slot the structure would occupy — an empty one, or the one it upgrades. */
    slotId?: string;
}

/**
 * Validate an orbital construction request. Returns the slot it would take:
 * upgrades consume the slot of the structure they replace, everything else
 * needs a free one.
 */
export function canBuildOrbital(
    planet: ConstructionPlanet,
    structureId: string,
    unlockedTechIds: Set<string> = new Set()
): OrbitalBuildCheck {
    const def = ORBITAL_STRUCTURE_BY_ID[structureId];
    if (!def) return { canBuild: false, reason: 'Unknown orbital structure' };

    const orbital = ensureOrbitalState(planet);

    if (def.techRequired && !unlockedTechIds.has(def.techRequired)) {
        return { canBuild: false, reason: `Technology '${def.techRequired}' required` };
    }

    if ((planet.infrastructureLevel ?? 1) < def.infrastructureRequired) {
        return { canBuild: false, reason: `Infrastructure level ${def.infrastructureRequired} required to service this orbit` };
    }

    // Upgrades: find the structure being replaced.
    if (def.upgradesFrom) {
        const source = orbital.slots.find(s =>
            s.structureId === def.upgradesFrom && (s.state === 'active' || s.state === 'damaged'));
        if (!source) {
            const sourceDef = ORBITAL_STRUCTURE_BY_ID[def.upgradesFrom];
            return { canBuild: false, reason: `Requires an operational ${sourceDef?.name ?? def.upgradesFrom} in orbit` };
        }
        if (orbital.buildQueue.some(o => o.slotId === source.slotId)) {
            return { canBuild: false, reason: 'That structure is already being worked on' };
        }
        return { canBuild: true, slotId: source.slotId };
    }

    if (def.requiresStation && !computeOrbitalRatings(planet).hasStation) {
        return { canBuild: false, reason: 'Requires an operational space station in orbit' };
    }

    if (def.uniquePerPlanet) {
        const exists = orbital.slots.some(s => s.structureId === structureId && s.state !== 'destroyed');
        const queued = orbital.buildQueue.some(o => o.structureId === structureId);
        if (exists || queued) return { canBuild: false, reason: 'Already present in this orbit' };
    }

    const free = orbital.slots.find(s => s.state === 'empty' || s.state === 'destroyed');
    if (!free) {
        return { canBuild: false, reason: 'No free orbital slot — raise planetary infrastructure to unlock more' };
    }

    return { canBuild: true, slotId: free.slotId };
}

/**
 * Start orbital construction. Resource payment is the caller's job, matching the
 * surface construction path.
 */
export function startOrbitalConstruction(
    planet: ConstructionPlanet,
    structureId: string,
    now: number,
    unlockedTechIds: Set<string> = new Set()
): { success: boolean; error?: string; order?: OrbitalBuildOrder } {
    const check = canBuildOrbital(planet, structureId, unlockedTechIds);
    if (!check.canBuild || !check.slotId) return { success: false, error: check.reason };

    const def = ORBITAL_STRUCTURE_BY_ID[structureId]!;
    const orbital = ensureOrbitalState(planet);
    const slot = orbital.slots.find(s => s.slotId === check.slotId)!;

    const isUpgrade = Boolean(def.upgradesFrom) && slot.structureId === def.upgradesFrom;
    const replacedStructureId = isUpgrade ? slot.structureId ?? undefined : undefined;

    // Orbital work is slowed by a wrecked layer the same way ground work is, but
    // never faster than baseline — orbit has no equivalent of a construction bonus yet.
    const completesAt = now + def.buildTimeSeconds;

    slot.structureId = structureId;
    slot.state = 'under_construction';
    slot.completesAt = completesAt;
    slot.integrity = 100;

    const order: OrbitalBuildOrder = {
        orderId: `orb_${Math.random().toString(36).slice(2, 11)}`,
        structureId,
        slotId: slot.slotId,
        planetId: planet.id,
        startedAtSeconds: now,
        completesAtSeconds: completesAt,
        isUpgrade,
        replacedStructureId,
    };
    orbital.buildQueue.push(order);

    return { success: true, order };
}

/** Cancel an in-progress orbital build, restoring an upgraded structure if there was one. */
export function cancelOrbitalConstruction(planet: ConstructionPlanet, slotId: string): boolean {
    const orbital = ensureOrbitalState(planet);
    const order = orbital.buildQueue.find(o => o.slotId === slotId);
    const slot = orbital.slots.find(s => s.slotId === slotId);
    if (!order || !slot || slot.state !== 'under_construction') return false;

    if (order.isUpgrade && order.replacedStructureId) {
        slot.structureId = order.replacedStructureId;
        slot.state = 'active';
    } else {
        slot.structureId = null;
        slot.state = 'empty';
    }
    slot.completesAt = null;
    orbital.buildQueue = orbital.buildQueue.filter(o => o.slotId !== slotId);
    return true;
}

/** Advance one planet's orbital build queue. Returns the slots that finished. */
export function processOrbitalQueue(planet: ConstructionPlanet, now: number): string[] {
    const orbital = ensureOrbitalState(planet);
    const completed: string[] = [];
    const remaining: OrbitalBuildOrder[] = [];

    for (const order of orbital.buildQueue) {
        if (now >= order.completesAtSeconds) {
            const slot = orbital.slots.find(s => s.slotId === order.slotId);
            if (slot) {
                slot.state = 'active';
                slot.completesAt = null;
                slot.integrity = 100;
                completed.push(slot.slotId);
            }
        } else {
            remaining.push(order);
        }
    }

    orbital.buildQueue = remaining;
    return completed;
}

// ─── Damage and repair ────────────────────────────────────────────────────────

export interface OrbitalDamageResult {
    /** Damage that got through the shields. */
    hullDamageApplied: number;
    /** Damage soaked by shield projectors. */
    shieldAbsorbed: number;
    destroyedSlotIds: string[];
    /** True when the layer dropped below the threshold to contest orbit. */
    orbitControlLost: boolean;
}

/**
 * Apply bombardment to a planet's orbital layer. Shields soak first; the rest is
 * spread across standing structures in proportion to their hull, so a fortress
 * absorbs more than a sensor mast rather than everything dying at once.
 */
export function applyOrbitalDamage(planet: ConstructionPlanet, incoming: number): OrbitalDamageResult {
    const orbital = ensureOrbitalState(planet);
    const result: OrbitalDamageResult = {
        hullDamageApplied: 0,
        shieldAbsorbed: 0,
        destroyedSlotIds: [],
        orbitControlLost: false,
    };
    if (incoming <= 0) return result;

    const ratings = computeOrbitalRatings(planet);
    // Shields soak a share of the incoming volley rather than a flat amount, so
    // they stay relevant against big fleets instead of being one-shot through.
    const soakFraction = Math.min(0.8, ratings.shieldStrength / (ratings.shieldStrength + 200));
    result.shieldAbsorbed = incoming * soakFraction;
    let remaining = incoming - result.shieldAbsorbed;
    result.hullDamageApplied = remaining;

    const targets = orbital.slots.filter(s =>
        (s.state === 'active' || s.state === 'damaged') && s.structureId && s.integrity > 0);
    if (targets.length === 0) {
        result.orbitControlLost = true;
        orbital.orbitControlLost = true;
        return result;
    }

    const totalHull = targets.reduce((sum, s) => {
        const def = ORBITAL_STRUCTURE_BY_ID[s.structureId!];
        return sum + (def?.hullStrength ?? 500);
    }, 0);

    for (const slot of targets) {
        const def = ORBITAL_STRUCTURE_BY_ID[slot.structureId!];
        const hull = def?.hullStrength ?? 500;
        const share = remaining * (hull / totalHull);
        const integrityLost = (share / hull) * 100;
        slot.integrity = Math.max(0, slot.integrity - integrityLost);

        if (slot.integrity <= 0) {
            slot.state = 'destroyed';
            slot.integrity = 0;
            result.destroyedSlotIds.push(slot.slotId);
        } else if (slot.integrity < DAMAGED_INTEGRITY_THRESHOLD) {
            slot.state = 'damaged';
        }
    }

    result.orbitControlLost = isOrbitSuppressed(planet);
    orbital.orbitControlLost = result.orbitControlLost;
    return result;
}

/**
 * Repair damaged structures. Destroyed ones are not repaired — they have to be
 * rebuilt into their slot. A planet under active siege repairs nothing.
 */
export function repairOrbital(planet: ConstructionPlanet, deltaSeconds: number): number {
    if (planet.siege) return 0;
    const orbital = ensureOrbitalState(planet);
    const gain = REPAIR_INTEGRITY_PER_HOUR * (deltaSeconds / 3600);
    let repaired = 0;

    for (const slot of orbital.slots) {
        if (slot.state !== 'damaged' || !slot.structureId) continue;
        const before = slot.integrity;
        slot.integrity = Math.min(100, slot.integrity + gain);
        repaired += slot.integrity - before;
        if (slot.integrity >= DAMAGED_INTEGRITY_THRESHOLD) slot.state = 'active';
    }

    if (repaired > 0 && !isOrbitSuppressed(planet)) orbital.orbitControlLost = false;
    return repaired;
}

// ─── World tick ───────────────────────────────────────────────────────────────

/**
 * Global orbital tick: advance every planet's build queue and repair damage.
 * Called from tickConstructionGlobal.
 */
export function tickOrbitalGlobal(world: GameWorldState, deltaSeconds: number): void {
    const now = world.nowSeconds;
    for (const planet of world.construction.planets.values()) {
        // Only pay the slot-sync and repair cost for worlds that actually have a
        // layer or are building one.
        if (!planet.orbital && (planet.infrastructureLevel ?? 1) < 2) continue;
        processOrbitalQueue(planet, now);
        repairOrbital(planet, deltaSeconds);
    }
}

/** Structure catalog entry, for UI and validation. */
export function getOrbitalDefinition(structureId: string): OrbitalStructureDefinition | undefined {
    return ORBITAL_STRUCTURE_BY_ID[structureId];
}
