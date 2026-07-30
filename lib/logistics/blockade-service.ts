// lib/logistics/blockade-service.ts
// Phase 6 — Starving a world instead of storming it.
//
// A planet with production buildings, full silos and no way to move goods in or
// out is a planet whose factories stop. This pass works out which worlds are cut
// off, cuts their imports and their orbital stores, and lets the consumption
// already modelled in Phase 1 drain them. Raiding logistics becomes a way to win
// that never requires landing a soldier.

import type { GameWorldState } from '../game-world-state';
import type { PlanetProduction, ResourceBundle } from '../economy/economy-types';
import type { Planet as ConstructionPlanet } from '../construction/construction-types';
import { isOrbitSuppressed, computeOrbitalRatings, maxOrbitalDefensePower } from '../orbital/orbital-service';
import { isAtWar } from '../diplomacy/offer-service';
import { STORABLE_RESOURCES } from './storage-types';

export interface BlockadeState {
    /** True while hostile forces control the approaches. */
    active: boolean;
    /** Sim-clock seconds the blockade began. */
    sinceSeconds: number;
    /** Factions enforcing it. */
    blockadingFactionIds: string[];
    /**
     * 0–1. How complete the cordon is: hostile strength weighed against whatever
     * the defender still has in orbit. A partial blockade leaks.
     */
    severity: number;
    /** Interstellar imports and in-system pooling are cut. */
    importsCut: boolean;
    /** Orbital warehouses cannot be reached from the surface. */
    orbitalStoresCut: boolean;
    /** Hours the world can still feed and power itself at current draw. */
    hoursOfCover: number;
    /** True once essential stores are gone and industry is failing. */
    starving: boolean;
}

// ─── Tuning constants ─────────────────────────────────────────────────────────

/**
 * Severity above which interstellar imports stop arriving at all. Below it,
 * trade is throttled rather than severed.
 */
export const IMPORT_CUT_SEVERITY = 0.4;

/** Severity above which the surface loses access to its own orbital warehouses. */
export const ORBITAL_CUT_SEVERITY = 0.6;

/** Hours of cover below which a world is reported as starving. */
export const STARVATION_COVER_HOURS = 6;

/**
 * Hostile strength that counts as a total cordon on an undefended world. Scales
 * severity so a lone raider is a nuisance and a battle fleet is a siege.
 */
export const FULL_BLOCKADE_POWER = 400;

/** Defensive weight of the orbital layer when resisting a cordon. */
export const ORBITAL_RESISTANCE_WEIGHT = 1.5;

// ─── Detection ────────────────────────────────────────────────────────────────

interface HostilePresence {
    factionIds: string[];
    power: number;
}

/** Hostile fleet strength sitting in a planet's system. */
function hostilePresence(world: GameWorldState, planet: ConstructionPlanet): HostilePresence {
    const factionIds = new Set<string>();
    let power = 0;

    const fleets = world.movement?.fleets;
    if (!fleets) return { factionIds: [], power: 0 };

    for (const fleet of fleets.values()) {
        if (fleet.currentSystemId !== planet.systemId) continue;
        if (!fleet.factionId || fleet.factionId === planet.ownerId) continue;
        // Only shooting wars blockade. A neutral freighter in orbit is commerce.
        if (!isAtWar(world, fleet.factionId, planet.ownerId)) continue;

        factionIds.add(fleet.factionId);
        power += (fleet.basePower ?? 0) * (fleet.strength ?? 1);
    }

    return { factionIds: [...factionIds], power };
}

/**
 * How complete a cordon is, 0–1. Hostile power is weighed against the orbital
 * defenses still standing: a world that holds its own orbit is inconvenienced,
 * not cut off.
 */
export function computeBlockadeSeverity(
    hostilePower: number,
    planet: ConstructionPlanet
): number {
    if (hostilePower <= 0) return 0;

    const orbitalDefense = computeOrbitalRatings(planet).defensePower * ORBITAL_RESISTANCE_WEIGHT;
    const contested = hostilePower / (hostilePower + orbitalDefense);
    const scale = Math.min(1, hostilePower / FULL_BLOCKADE_POWER);

    return Math.max(0, Math.min(1, contested * scale));
}

/** Hours a world can keep feeding and powering itself at its current draw. */
export function hoursOfEssentialCover(econPlanet: PlanetProduction): number {
    let worst = Infinity;
    for (const res of ['food', 'energy'] as const) {
        const perSecond = econPlanet.consumptionRates?.[res] ?? 0;
        if (perSecond <= 0) continue;
        const stock = econPlanet.stockpile[res] ?? 0;
        worst = Math.min(worst, stock / perSecond / 3600);
    }
    return worst === Infinity ? Infinity : worst;
}

/**
 * Recompute one world's blockade state. Written onto the economy planet, and
 * mirrored onto the construction planet so the storage pass can see it without
 * needing the whole world.
 */
export function updateBlockade(
    world: GameWorldState,
    econPlanet: PlanetProduction,
    constructionPlanet: ConstructionPlanet | undefined
): BlockadeState {
    const previous = econPlanet.blockade;
    const now = world.nowSeconds;

    if (!constructionPlanet) {
        const clear = clearState(now);
        econPlanet.blockade = clear;
        return clear;
    }

    const hostiles = hostilePresence(world, constructionPlanet);
    // An active siege is a blockade by definition — the besieger owns the orbit.
    const besieged = Boolean(constructionPlanet.siege);

    let severity = computeBlockadeSeverity(hostiles.power, constructionPlanet);
    if (besieged) severity = Math.max(severity, 0.85);
    // Having HAD an orbital layer and lost it is a near-total cordon: the defender
    // fought for the approaches and no longer holds them. This deliberately checks
    // that there were guns to silence — `isOrbitSuppressed` is trivially true for a
    // world that never built any, and without this guard a lone scout would impose
    // the same cordon on an undeveloped colony as a fleet does on a fortress.
    if (hostiles.power > 0
        && maxOrbitalDefensePower(constructionPlanet) > 0
        && isOrbitSuppressed(constructionPlanet)) {
        severity = Math.max(severity, 0.7);
    }

    const active = severity > 0;
    const state: BlockadeState = {
        active,
        sinceSeconds: active ? (previous?.active ? previous.sinceSeconds : now) : now,
        blockadingFactionIds: hostiles.factionIds,
        severity,
        importsCut: severity >= IMPORT_CUT_SEVERITY,
        orbitalStoresCut: severity >= ORBITAL_CUT_SEVERITY,
        hoursOfCover: hoursOfEssentialCover(econPlanet),
        starving: false,
    };
    state.starving = active && state.hoursOfCover < STARVATION_COVER_HOURS;

    econPlanet.blockade = state;
    constructionPlanet.blockade = {
        active: state.active,
        severity: state.severity,
        orbitalStoresCut: state.orbitalStoresCut,
    };
    return state;
}

function clearState(now: number): BlockadeState {
    return {
        active: false,
        sinceSeconds: now,
        blockadingFactionIds: [],
        severity: 0,
        importsCut: false,
        orbitalStoresCut: false,
        hoursOfCover: Infinity,
        starving: false,
    };
}

/**
 * Per-tick entry point. Must run before storage and distribution: both read the
 * flags this sets.
 */
export function tickBlockades(world: GameWorldState): void {
    for (const planet of world.economy.planets.values()) {
        const constructionPlanet = world.construction?.planets?.get(planet.planetId);
        updateBlockade(world, planet, constructionPlanet);
    }
}

// ─── Queries used by the systems a blockade affects ───────────────────────────

/** True when this world's interstellar and in-system imports are severed. */
export function importsBlocked(planet: PlanetProduction | undefined): boolean {
    return Boolean(planet?.blockade?.importsCut);
}

/**
 * Multiplier on trade throughput reaching this world. A partial cordon throttles
 * rather than severs, so raiding is worth doing before a full blockade is possible.
 */
export function tradeThroughputUnderBlockade(planet: PlanetProduction | undefined): number {
    const severity = planet?.blockade?.severity ?? 0;
    if (severity <= 0) return 1;
    return Math.max(0, 1 - severity);
}

/** True when a world has been cut off from its own orbital warehouses. */
export function orbitalStoresUnreachable(planet: ConstructionPlanet | undefined): boolean {
    return Boolean(planet?.blockade?.orbitalStoresCut);
}

// ─── Siege supply ─────────────────────────────────────────────────────────────

/** Resources a garrison eats, and how much of each per 1000 troops per hour. */
const GARRISON_DRAW: Array<[keyof ResourceBundle, number]> = [
    ['food', 12],
    ['ammo', 4],
];

export interface GarrisonSupplyResult {
    /** 0–1: how much of the garrison's demand the planet could actually meet. */
    satisfaction: number;
    /** Resources that ran dry this tick. */
    shortfalls: string[];
}

/**
 * Draw a besieged garrison's supply from the planet's own stores. This is what
 * the doc's "emergency reserves during sieges" is for: a world with a strategic
 * reserve vault holds out; a world running lean surrenders on schedule.
 */
export function drawGarrisonSupply(
    econPlanet: PlanetProduction | undefined,
    constructionPlanet: ConstructionPlanet,
    deltaSeconds: number
): GarrisonSupplyResult {
    const siege = constructionPlanet.siege;
    if (!siege || !econPlanet) return { satisfaction: 1, shortfalls: [] };

    const troops = siege.defenderState?.garrisonTroops ?? 0;
    if (troops <= 0) return { satisfaction: 1, shortfalls: [] };

    const hours = deltaSeconds / 3600;
    const thousands = troops / 1000;
    const shortfalls: string[] = [];
    let worstSatisfaction = 1;

    for (const [res, perThousandPerHour] of GARRISON_DRAW) {
        const want = perThousandPerHour * thousands * hours;
        if (want <= 0) continue;
        const available = econPlanet.stockpile[res] ?? 0;
        const taken = Math.min(available, want);
        econPlanet.stockpile[res] = available - taken;
        const satisfaction = want > 0 ? taken / want : 1;
        if (satisfaction < 0.999) shortfalls.push(res);
        worstSatisfaction = Math.min(worstSatisfaction, satisfaction);
    }

    // The garrison's supply pool tracks whether the planet can actually feed it.
    const defender = siege.defenderState;
    if (defender) {
        const maxSupply = defender.maxSupply || 1000;
        const drift = (worstSatisfaction - 0.5) * 2 * maxSupply * 0.1 * hours;
        defender.supply = Math.max(0, Math.min(maxSupply, defender.supply + drift));
    }

    return { satisfaction: worstSatisfaction, shortfalls };
}

/** Global pass: draw supply for every garrison currently under siege. */
export function tickGarrisonSupply(world: GameWorldState, deltaSeconds: number): void {
    for (const planet of world.construction.planets.values()) {
        if (!planet.siege) continue;
        drawGarrisonSupply(world.economy?.planets?.get(planet.id), planet, deltaSeconds);
    }
}

// ─── Empire reporting ─────────────────────────────────────────────────────────

export interface BlockadeReport {
    factionId: string;
    blockadedPlanetIds: string[];
    starvingPlanetIds: string[];
    /** Worst severity across the empire, 0–1. */
    worstSeverity: number;
}

export function getBlockadeReport(world: GameWorldState, factionId: string): BlockadeReport {
    const blockadedPlanetIds: string[] = [];
    const starvingPlanetIds: string[] = [];
    let worstSeverity = 0;

    for (const planet of world.economy.planets.values()) {
        if (planet.factionId !== factionId) continue;
        const blockade = planet.blockade;
        if (!blockade?.active) continue;
        blockadedPlanetIds.push(planet.planetId);
        if (blockade.starving) starvingPlanetIds.push(planet.planetId);
        if (blockade.severity > worstSeverity) worstSeverity = blockade.severity;
    }

    return { factionId, blockadedPlanetIds, starvingPlanetIds, worstSeverity };
}

/** Total goods a faction is holding across all its planets, for UI rollups. */
export function getEmpireHoldings(world: GameWorldState, factionId: string): ResourceBundle {
    const total: ResourceBundle = {};
    for (const planet of world.economy.planets.values()) {
        if (planet.factionId !== factionId) continue;
        for (const res of STORABLE_RESOURCES) {
            total[res] = (total[res] ?? 0) + (planet.stockpile[res] ?? 0);
        }
    }
    return total;
}
