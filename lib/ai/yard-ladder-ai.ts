// lib/ai/yard-ladder-ai.ts
// AI factions climb the shipyard ladder. No AI code ever built a Spaceyard,
// an Advanced Spaceyard or a Capital Spaceyard (or raised the infrastructure
// they need), so every AI faction was capped at corvettes and destroyers for
// the whole season while a player could field battleships.
//
// One step per strategic tick at the capital, in this order: Space Station →
// Spaceyard (tier 1) → Advanced Spaceyard (tier 2) → Capital Spaceyard
// (tier 3). When the next rung is blocked by planetary infrastructure, the
// lowest infrastructure track is raised instead (the derived level is the
// mean of the tracks). Same helpers, same prices and the same eligibility as
// the player's ORBITAL_CONSTRUCT and INFRA_UPGRADE_TRACK orders; the AI keeps
// double the price in hand so the ladder never drains its war chest.

import type { GameWorldState } from '../game-world-state';
import { ORBITAL_STRUCTURE_BY_ID } from '../../data/orbital-structures';
import type { OrbitalStructureDefinition } from '../orbital/orbital-types';
import { INFRASTRUCTURE_TRACK_IDS } from '../infrastructure/infrastructure-types';
import type { InfrastructureTrackId } from '../infrastructure/infrastructure-types';
import {
    canBuildOrbital,
    startOrbitalConstruction,
    orbitalStructureCharge,
    orbitalChargeShortfall,
    computeOrbitalRatings,
    ensureOrbitalState,
} from '../orbital/orbital-service';
import { ensureInfrastructureNetwork, canUpgradeTrack, startTrackUpgrade } from '../infrastructure/infrastructure-service';
import { unlockedTechSet } from '../combat/ship-design-service';

/** Keep this many times the price in hand before laying anything down. */
export const YARD_LADDER_HEADROOM = 2;

/** Orbital rungs, in order. Each is only wanted once the previous one stands. */
export const ORBITAL_RUNGS = ['space_station', 'spaceyard', 'advanced_spaceyard', 'capital_spaceyard'] as const;

export type YardStep =
    | { kind: 'orbital'; structureId: string }
    | { kind: 'infrastructure'; trackId: InfrastructureTrackId }
    | null;

type Reserves = Record<string, number>;
type Stockpile = Record<string, number>;

const MATERIAL_KEYS = ['metals', 'chemicals', 'food', 'energy'] as const;

/** The faction's capital world: the 'capital' planet in its capital system, else any owned one there. */
export function capitalPlanetOf(world: GameWorldState, factionId: string): any | undefined {
    const systemId = (world.economy.factions.get(factionId) as any)?.capitalSystemId;
    if (!systemId) return undefined;
    const owned = [...world.construction.planets.values()]
        .filter((p: any) => p.ownerId === factionId && p.systemId === systemId) as any[];
    return owned.find(p => p.planetType === 'capital') ?? owned[0];
}

/** Which orbital rung the planet wants next, or null at the top. */
export function wantedOrbitalRung(planet: any, now: number): (typeof ORBITAL_RUNGS)[number] | null {
    const ratings = computeOrbitalRatings(planet, now);
    if (!ratings.hasStation) return 'space_station';
    if (ratings.shipyardTier < 1) return 'spaceyard';
    if (ratings.shipyardTier < 2) return 'advanced_spaceyard';
    if (ratings.shipyardTier < 3) return 'capital_spaceyard';
    return null;
}

/** Every tracked reserve covers the charge with headroom; untracked keys are free (as the player's charge treats them). */
function affordable(reserves: Reserves | undefined, charge: Record<string, number>, headroom = YARD_LADDER_HEADROOM): boolean {
    if (!reserves) return false;
    return Object.entries(charge).every(([key, amount]) =>
        amount <= 0 || reserves[key] === undefined || (reserves[key] ?? 0) >= amount * headroom);
}

/**
 * Pure decision: what the AI lays down at this planet this tick, or null.
 * Orbital work and infrastructure work are both one-at-a-time.
 */
export function chooseYardStep(
    planet: any,
    reserves: Reserves | undefined,
    stockpile: Stockpile | undefined,
    unlocked: Set<string>,
    now: number,
): YardStep {
    const orbital = ensureOrbitalState(planet);
    if (orbital.buildQueue?.length) return null;

    const rung = wantedOrbitalRung(planet, now);
    if (!rung) return null;
    const def: OrbitalStructureDefinition | undefined = ORBITAL_STRUCTURE_BY_ID[rung];
    if (!def) return null;

    if (canBuildOrbital(planet, rung, unlocked).canBuild) {
        return affordable(reserves, orbitalStructureCharge(def)) ? { kind: 'orbital', structureId: rung } : null;
    }

    // Blocked by the ground: raise the weakest infrastructure track.
    if ((planet.infrastructureLevel ?? 1) >= def.infrastructureRequired) return null;
    const network = ensureInfrastructureNetwork(planet);
    if (INFRASTRUCTURE_TRACK_IDS.some(id => network.tracks[id]?.upgrade)) return null;
    const trackId = [...INFRASTRUCTURE_TRACK_IDS]
        .sort((a, b) => (network.tracks[a]?.level ?? 0) - (network.tracks[b]?.level ?? 0))[0];
    if (!trackId) return null;
    const check = canUpgradeTrack(planet, trackId);
    if (!check.allowed || !check.cost) return null;
    // Credits come from the treasury with headroom; materials come off the
    // planet's own stockpile, exactly as INFRA_UPGRADE_TRACK charges a player.
    if (!affordable(reserves, { CREDITS: check.cost.credits ?? 0 })) return null;
    if (MATERIAL_KEYS.some(k => (check.cost![k] ?? 0) > 0 && (stockpile?.[k] ?? 0) < (check.cost![k] ?? 0))) return null;
    return { kind: 'infrastructure', trackId };
}

/** Take one step up the ladder at the faction's capital. Returns what was started, or null. */
export function tickAIYardLadder(world: GameWorldState, factionId: string): YardStep {
    const planet = capitalPlanetOf(world, factionId);
    if (!planet) return null;
    const reserves = (world.economy.factions.get(factionId) as any)?.reserves as Reserves | undefined;
    if (!reserves) return null;
    const stockpile = (world.economy.planets.get(planet.id) as any)?.stockpile as Stockpile | undefined;
    const unlocked = unlockedTechSet(world as any, factionId);
    const now = world.nowSeconds;

    const step = chooseYardStep(planet, reserves, stockpile, unlocked, now);
    if (!step) return null;

    if (step.kind === 'orbital') {
        const def = ORBITAL_STRUCTURE_BY_ID[step.structureId]!;
        const charge = orbitalStructureCharge(def);
        if (orbitalChargeShortfall(reserves, charge)) return null;
        const paid: Reserves = {};
        for (const [key, amount] of Object.entries(charge)) {
            if (reserves[key] === undefined) continue;
            reserves[key] = (reserves[key] ?? 0) - amount;
            paid[key] = amount;
        }
        const result = startOrbitalConstruction(planet, step.structureId, now, unlocked);
        if (!result.success || !result.order) {
            for (const [key, amount] of Object.entries(paid)) reserves[key] = (reserves[key] ?? 0) + amount;
            return null;
        }
        result.order.paid = paid;
        console.log(`[AI] ${factionId} lays down ${def.name} over ${planet.name ?? planet.id}.`);
        return step;
    }

    const check = canUpgradeTrack(planet, step.trackId);
    if (!check.allowed || !check.cost) return null;
    const started = startTrackUpgrade(planet, step.trackId, now);
    if (!started.success) return null;
    if ((check.cost.credits ?? 0) > 0) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) - (check.cost.credits ?? 0);
    if (stockpile) {
        for (const k of MATERIAL_KEYS) {
            if ((check.cost[k] ?? 0) > 0) stockpile[k] = (stockpile[k] ?? 0) - (check.cost[k] ?? 0);
        }
    }
    console.log(`[AI] ${factionId} raises ${step.trackId} on ${planet.name ?? planet.id} toward the next yard.`);
    return step;
}
