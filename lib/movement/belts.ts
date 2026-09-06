// lib/movement/belts.ts
// Asteroid belts as a real system feature.
//
// The orbital view has drawn a belt in ~55% of systems since it existed,
// seeded from the system id. Making the same roll here — the identical FNV-1a
// hash on the identical string — turns that decoration into a rule the worker
// can trust: a fleet may lurk in the belt (Fleet.stance = 'belt'), hidden from
// anyone who has not surveyed the system and parked a fleet there, and it
// springs an ambush on hostile fleets passing through. A leaf: no imports.

export const BELT_CHANCE_PERCENT = 55;

/** FNV-1a, 32-bit — the same hash components/galaxy/starVisuals.ts uses for visuals. */
export function beltHash(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function hasAsteroidBelt(systemId: string): boolean {
    return beltHash(`${systemId}:belt`) % 100 < BELT_CHANCE_PERCENT;
}

/** Which orbit lane the belt sits past, 0..orbits-1 — mirrors the view's placement. */
export function beltLaneIndex(systemId: string, orbits: number): number {
    if (orbits <= 0) return 0;
    return Math.min(orbits - 1, Math.floor((beltHash(`${systemId}:belt`) >> 4) % Math.max(1, orbits)));
}

/** Rivalry escalation at which a belt-lurker springs on a passing fleet. */
export const AMBUSH_WAR_ESCALATION = 7;
/** How long an ambush mark stays "fresh" for the combat manager, in sim seconds (two 15s ticks). */
export const AMBUSH_FRESH_SECONDS = 30;
/** Surprise: the ambushed side opens with this fraction of its organization. */
export const AMBUSH_ORGANIZATION_FACTOR = 0.7;

// ── Ambush resolution (type-only imports keep this a leaf) ────────────────────
import type { Fleet } from './types';

/** The slice of the world the ambush check reads — GameWorldState satisfies it. */
export interface AmbushWorldView {
    movement: { fleets: Map<string, Fleet> };
    rivalries: Map<string, { escalationLevel?: number }>;
}

export function factionsAtWar(world: AmbushWorldView, a: string, b: string): boolean {
    const r = world.rivalries.get(`rivalry-${a}-${b}`) ?? world.rivalries.get(`rivalry-${b}-${a}`);
    return (r?.escalationLevel ?? 0) >= AMBUSH_WAR_ESCALATION;
}

/**
 * The belt-lurking fleet that springs on `mover` as it enters `systemId`, or
 * null. Only a system with a belt, only a fleet parked there in 'belt'
 * stance, only a faction at war with the mover — and never the mover's own.
 */
export function findBeltAmbusher(world: AmbushWorldView, mover: Fleet, systemId: string): Fleet | null {
    if (!hasAsteroidBelt(systemId)) return null;
    for (const f of world.movement.fleets.values()) {
        if (f.id === mover.id || f.factionId === mover.factionId) continue;
        if (f.currentSystemId !== systemId || f.stance !== 'belt') continue;
        if (!factionsAtWar(world, f.factionId, mover.factionId)) continue;
        return f;
    }
    return null;
}

/** A fleet stopped in its tracks by an ambush: parked here, path dropped, stamped for the combat manager. */
export function ambushedFleet(mover: Fleet, systemId: string, ambusher: Fleet, nowSeconds: number): Fleet {
    return {
        ...mover,
        currentSystemId: systemId,
        destinationSystemId: null,
        originSystemId: null,
        plannedPath: [],
        transitProgress: 0,
        activeLayer: null,
        etaSeconds: 0,
        arrivalOrbitPlanetId: null,
        orbitingPlanetId: null,
        stance: null,
        ambushedBy: { factionId: ambusher.factionId, atSeconds: nowSeconds, systemId },
    };
}
