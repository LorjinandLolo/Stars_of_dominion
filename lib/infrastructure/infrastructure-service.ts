// lib/infrastructure/infrastructure-service.ts
// Phase 4 — Infrastructure network: five tracks, their upgrades, their upkeep,
// and the effects they push into construction, production, haulage and order.
//
// The legacy scalar `planet.infrastructureLevel` is now derived from the tracks.
// It is still the value every older call site reads, so it is recomputed on every
// mutation rather than left to drift.

import type { Planet as ConstructionPlanet, BuildingCost } from '../construction/construction-types';
import type { GameWorldState } from '../game-world-state';
import type { PlanetProduction, ResourceBundle } from '../economy/economy-types';
import { INFRASTRUCTURE_TRACK_BY_ID } from '../../data/infrastructure-tracks';
import {
    INFRASTRUCTURE_TRACK_IDS,
    MIN_TRACK_LEVEL,
    MAX_TRACK_LEVEL,
    MIN_DERIVED_INFRA_LEVEL,
    INTEGRITY_RECOVERY_PER_HOUR,
    INTEGRITY_DECAY_PER_HOUR,
    UNPAID_GRACE_TICKS,
    TRACK_EFFECTS,
    MULTIPLICATIVE_EFFECTS,
} from './infrastructure-types';
import type {
    InfrastructureTrackId,
    InfrastructureNetwork,
    InfrastructureTrack,
    InfrastructureEffects,
} from './infrastructure-types';

// ─── Network lifecycle ────────────────────────────────────────────────────────

/**
 * Get (creating if needed) a planet's infrastructure network.
 *
 * Backfill matters here: worlds written before this system have only the scalar
 * `infrastructureLevel`. Seeding every track at that level means an existing
 * empire wakes up exactly as developed as it went to sleep, rather than at zero.
 */
export function ensureInfrastructureNetwork(planet: ConstructionPlanet): InfrastructureNetwork {
    if (!planet.infrastructure) {
        const seed = clampLevel(planet.infrastructureLevel ?? 1);
        const tracks = {} as Record<InfrastructureTrackId, InfrastructureTrack>;
        for (const id of INFRASTRUCTURE_TRACK_IDS) {
            tracks[id] = { level: seed, integrity: 100, upgrade: null };
        }
        planet.infrastructure = { tracks, unpaidTicks: 0 };
    }

    // Repair partial snapshots: a track added after a save was written.
    const network = planet.infrastructure;
    if (!network.tracks) network.tracks = {} as Record<InfrastructureTrackId, InfrastructureTrack>;
    for (const id of INFRASTRUCTURE_TRACK_IDS) {
        if (!network.tracks[id]) {
            network.tracks[id] = { level: MIN_TRACK_LEVEL, integrity: 100, upgrade: null };
        }
    }
    if (typeof network.unpaidTicks !== 'number') network.unpaidTicks = 0;

    return network;
}

function clampLevel(level: number): number {
    return Math.max(MIN_TRACK_LEVEL, Math.min(MAX_TRACK_LEVEL, Math.floor(level)));
}

/**
 * Recompute the legacy scalar from the tracks and write it back onto the planet.
 * Uses the mean rather than the minimum: a world that poured everything into
 * transit and freight is genuinely more developed than one that built nothing,
 * even with a neglected water system.
 */
export function recomputeInfrastructureLevel(planet: ConstructionPlanet): number {
    const network = ensureInfrastructureNetwork(planet);
    let total = 0;
    for (const id of INFRASTRUCTURE_TRACK_IDS) total += network.tracks[id].level;
    const mean = total / INFRASTRUCTURE_TRACK_IDS.length;
    const derived = Math.max(MIN_DERIVED_INFRA_LEVEL, Math.min(MAX_TRACK_LEVEL, Math.round(mean)));
    planet.infrastructureLevel = derived;
    return derived;
}

// ─── Effects ──────────────────────────────────────────────────────────────────

function neutralEffects(): InfrastructureEffects {
    return {
        constructionSpeed: 1,
        productionEfficiency: 1,
        haulageBonus: 0,
        storageThroughputBonus: 0,
        foodOutput: 1,
        populationGrowth: 1,
        stability: 0,
        unrestRecovery: 1,
        militaryMovement: 1,
        tradeThroughput: 1,
    };
}

/**
 * Effective level of a track: its level scaled by integrity. A level 5 grid at
 * 40% integrity performs like a level 2 one, which is the whole point of letting
 * infrastructure degrade.
 */
export function effectiveTrackLevel(track: InfrastructureTrack): number {
    return track.level * Math.max(0, Math.min(1, track.integrity / 100));
}

/** Aggregate every track's contribution into the effects the rest of the game reads. */
export function computeInfrastructureEffects(planet: ConstructionPlanet | undefined): InfrastructureEffects {
    const effects = neutralEffects();
    if (!planet) return effects;
    const network = ensureInfrastructureNetwork(planet);

    for (const id of INFRASTRUCTURE_TRACK_IDS) {
        const level = effectiveTrackLevel(network.tracks[id]);
        if (level <= 0) continue;
        const contributions = TRACK_EFFECTS[id];
        for (const [key, perLevel] of Object.entries(contributions)) {
            const effectKey = key as keyof InfrastructureEffects;
            effects[effectKey] += (perLevel ?? 0) * level;
        }
    }

    // Multiplicative effects must never go negative or zero out a system.
    for (const key of MULTIPLICATIVE_EFFECTS) {
        effects[key] = Math.max(0.1, effects[key]);
    }
    return effects;
}

// ─── Upgrades ─────────────────────────────────────────────────────────────────

/** Cost of raising a track by one level, compounded by the level already held. */
export function upgradeCost(trackId: InfrastructureTrackId, currentLevel: number): BuildingCost | undefined {
    const def = INFRASTRUCTURE_TRACK_BY_ID[trackId];
    if (!def) return undefined;
    const multiplier = Math.pow(def.costGrowth, currentLevel);
    const scaled: BuildingCost = {
        metals: Math.round((def.costPerLevel.metals ?? 0) * multiplier),
        chemicals: Math.round((def.costPerLevel.chemicals ?? 0) * multiplier),
        food: Math.round((def.costPerLevel.food ?? 0) * multiplier),
        manpower: Math.round((def.costPerLevel.manpower ?? 0) * multiplier),
        credits: Math.round((def.costPerLevel.credits ?? 0) * multiplier),
    };
    if (def.costPerLevel.energy) scaled.energy = Math.round(def.costPerLevel.energy * multiplier);
    if (def.costPerLevel.rares) scaled.rares = Math.round(def.costPerLevel.rares * multiplier);
    return scaled;
}

/** Seconds to raise a track by one level, compounded the same way. */
export function upgradeDuration(trackId: InfrastructureTrackId, currentLevel: number): number {
    const def = INFRASTRUCTURE_TRACK_BY_ID[trackId];
    if (!def) return 0;
    return def.buildTimeSeconds * Math.pow(1.35, currentLevel);
}

export interface UpgradeCheck {
    allowed: boolean;
    reason?: string;
    cost?: BuildingCost;
    durationSeconds?: number;
}

export function canUpgradeTrack(
    planet: ConstructionPlanet,
    trackId: InfrastructureTrackId
): UpgradeCheck {
    const def = INFRASTRUCTURE_TRACK_BY_ID[trackId];
    if (!def) return { allowed: false, reason: 'Unknown infrastructure track' };

    const network = ensureInfrastructureNetwork(planet);
    const track = network.tracks[trackId];

    if (track.upgrade) return { allowed: false, reason: 'That track is already being upgraded' };
    if (track.level >= MAX_TRACK_LEVEL) {
        return { allowed: false, reason: `${def.name} is already at maximum level` };
    }

    return {
        allowed: true,
        cost: upgradeCost(trackId, track.level),
        durationSeconds: upgradeDuration(trackId, track.level),
    };
}

/**
 * Begin an infrastructure upgrade. Payment is the caller's job, matching the
 * surface and orbital construction paths.
 */
export function startTrackUpgrade(
    planet: ConstructionPlanet,
    trackId: InfrastructureTrackId,
    now: number
): { success: boolean; error?: string; completesAtSeconds?: number; cost?: BuildingCost } {
    const check = canUpgradeTrack(planet, trackId);
    if (!check.allowed) return { success: false, error: check.reason };

    const network = ensureInfrastructureNetwork(planet);
    const track = network.tracks[trackId];
    const completesAtSeconds = now + (check.durationSeconds ?? 0);

    track.upgrade = {
        targetLevel: track.level + 1,
        startedAtSeconds: now,
        completesAtSeconds,
    };

    return { success: true, completesAtSeconds, cost: check.cost };
}

/** Abandon an in-progress upgrade. Spent resources are not refunded. */
export function cancelTrackUpgrade(planet: ConstructionPlanet, trackId: InfrastructureTrackId): boolean {
    const network = ensureInfrastructureNetwork(planet);
    const track = network.tracks[trackId];
    if (!track?.upgrade) return false;
    track.upgrade = null;
    return true;
}

/** Finish any upgrades that have come due. Returns the tracks that completed. */
export function processTrackUpgrades(planet: ConstructionPlanet, now: number): InfrastructureTrackId[] {
    const network = ensureInfrastructureNetwork(planet);
    const completed: InfrastructureTrackId[] = [];

    for (const id of INFRASTRUCTURE_TRACK_IDS) {
        const track = network.tracks[id];
        if (!track.upgrade) continue;
        if (now < track.upgrade.completesAtSeconds) continue;
        track.level = clampLevel(track.upgrade.targetLevel);
        track.upgrade = null;
        completed.push(id);
    }

    if (completed.length > 0) recomputeInfrastructureLevel(planet);
    return completed;
}

// ─── Upkeep and condition ─────────────────────────────────────────────────────

/** Per-hour upkeep of a planet's whole network at its current levels. */
export function networkUpkeepPerHour(planet: ConstructionPlanet): { credits: number; energy: number; metals: number } {
    const network = ensureInfrastructureNetwork(planet);
    const upkeep = { credits: 0, energy: 0, metals: 0 };

    for (const id of INFRASTRUCTURE_TRACK_IDS) {
        const def = INFRASTRUCTURE_TRACK_BY_ID[id];
        if (!def) continue;
        const level = network.tracks[id].level;
        upkeep.credits += (def.upkeepPerLevel.credits ?? 0) * level;
        upkeep.energy += (def.upkeepPerLevel.energy ?? 0) * level;
        upkeep.metals += (def.upkeepPerLevel.metals ?? 0) * level;
    }

    return upkeep;
}

/**
 * Charge one planet's infrastructure upkeep and move its integrity accordingly.
 * Credits come from the owning faction's treasury; energy and metals come off
 * the planet's own stockpile, so a blockaded world degrades even if the empire
 * is rich.
 */
export function tickInfrastructureUpkeep(
    planet: ConstructionPlanet,
    econPlanet: PlanetProduction | undefined,
    factionReserves: Record<string, number> | undefined,
    deltaSeconds: number
): { paid: boolean; integrityDelta: number } {
    const network = ensureInfrastructureNetwork(planet);
    const hours = deltaSeconds / 3600;
    const perHour = networkUpkeepPerHour(planet);

    const wantCredits = perHour.credits * hours;
    const wantEnergy = perHour.energy * hours;
    const wantMetals = perHour.metals * hours;

    let paid = true;

    if (wantCredits > 0) {
        const available = factionReserves?.['CREDITS'] ?? 0;
        if (available >= wantCredits) {
            if (factionReserves) factionReserves['CREDITS'] = available - wantCredits;
        } else {
            if (factionReserves) factionReserves['CREDITS'] = 0;
            paid = false;
        }
    }

    for (const [key, want] of [['energy', wantEnergy], ['metals', wantMetals]] as const) {
        if (want <= 0) continue;
        const stock = econPlanet?.stockpile[key as keyof ResourceBundle] ?? 0;
        if (stock >= want) {
            if (econPlanet) econPlanet.stockpile[key as keyof ResourceBundle] = stock - want;
        } else {
            if (econPlanet) econPlanet.stockpile[key as keyof ResourceBundle] = 0;
            paid = false;
        }
    }

    let integrityDelta = 0;
    if (paid) {
        network.unpaidTicks = 0;
        integrityDelta = INTEGRITY_RECOVERY_PER_HOUR * hours;
    } else {
        network.unpaidTicks++;
        // A short shortfall is absorbed; a sustained one starts eating the network.
        if (network.unpaidTicks > UNPAID_GRACE_TICKS) {
            integrityDelta = -INTEGRITY_DECAY_PER_HOUR * hours;
        }
    }

    if (integrityDelta !== 0) {
        for (const id of INFRASTRUCTURE_TRACK_IDS) {
            const track = network.tracks[id];
            track.integrity = Math.max(0, Math.min(100, track.integrity + integrityDelta));
        }
    }

    return { paid, integrityDelta };
}

/**
 * Damage the network — orbital bombardment, sabotage, ground fighting.
 * Spread evenly across tracks; `amount` is integrity points.
 */
export function damageInfrastructure(planet: ConstructionPlanet, amount: number): void {
    if (amount <= 0) return;
    const network = ensureInfrastructureNetwork(planet);
    for (const id of INFRASTRUCTURE_TRACK_IDS) {
        const track = network.tracks[id];
        track.integrity = Math.max(0, track.integrity - amount);
    }
}

/** Average integrity across the network, 0–100. Used for UI and siege reporting. */
export function networkIntegrity(planet: ConstructionPlanet | undefined): number {
    if (!planet) return 100;
    const network = ensureInfrastructureNetwork(planet);
    let total = 0;
    for (const id of INFRASTRUCTURE_TRACK_IDS) total += network.tracks[id].integrity;
    return total / INFRASTRUCTURE_TRACK_IDS.length;
}

// ─── World tick ───────────────────────────────────────────────────────────────

/**
 * Global infrastructure tick: complete upgrades, charge upkeep, move integrity,
 * and keep the derived scalar in step with the tracks.
 */
export function tickInfrastructure(world: GameWorldState, deltaSeconds: number): void {
    const now = world.nowSeconds;

    for (const planet of world.construction.planets.values()) {
        // Only touch worlds that already have a network or are developed enough
        // to be worth allocating one for.
        if (!planet.infrastructure && (planet.infrastructureLevel ?? 0) <= 0) continue;

        processTrackUpgrades(planet, now);

        const econPlanet = world.economy?.planets?.get(planet.id);
        const reserves = planet.ownerId
            ? (world.economy?.factions?.get(planet.ownerId)?.reserves as Record<string, number> | undefined)
            : undefined;
        tickInfrastructureUpkeep(planet, econPlanet, reserves, deltaSeconds);

        recomputeInfrastructureLevel(planet);
    }
}
