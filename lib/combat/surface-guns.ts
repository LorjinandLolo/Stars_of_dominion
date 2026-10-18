// lib/combat/surface-guns.ts
// Stars of Dominion — ground-to-space guns.
//
// A world's surface guns (the Orbital Defense Platform building, and the
// batteries of an outpost) used to do one thing: dig the garrison in. Now
// they shoot at what is overhead:
//
//   space battles  the guns of every world the side owns in the system join
//                  the fight. They shoot the enemy's fighters and bombers out
//                  of the sky first (anti-air), then fire on the ships the
//                  owner chose with planet.gunTarget. Ships cannot shoot back
//                  at guns dug into a planet; bombardment and raids are how a
//                  gun is silenced.
//   bombardment    guns firing back blunt what reaches the surface
//                  (bombardmentScreen) and hurt the bombarding fleet
//                  (returnFireDamage).
//   landings       flak: an invader's troops coming down under the guns lose
//                  men on the way (flakLoss). Landing under a contested sky
//                  costs men too, to the enemy fleet (CONTESTED_LANDING_LOSS).
//   air strikes    a sortie against the world, or a fleet over it, loses
//                  craft to the guns before it strikes.
//
// A gun counts only while it stands: not ruined, not sabotaged, not on a
// district the invader holds. Pure apart from the objects it is handed.

import type { Strongpoint } from './siege/strongpoints';

export type GunTarget = 'capital' | 'escorts' | 'transports' | 'spread';
export const GUN_TARGETS: readonly GunTarget[] = ['capital', 'escorts', 'transports', 'spread'];
export const GUN_TARGET_LABEL: Record<GunTarget, string> = {
    capital: 'Capital ships',
    escorts: 'Escorts',
    transports: 'Troop transports',
    spread: 'Whatever is closest',
};
export const GUN_TARGET_HINT: Record<GunTarget, string> = {
    capital: 'All fire on the biggest fleet overhead: wear down the battle line.',
    escorts: 'All fire on the smallest fleet: pick the screens off one by one.',
    transports: 'All fire on fleets carrying troops: stop the landing before it starts.',
    spread: 'Fire spread over every enemy fleet by size.',
};

/** Power a standing Orbital Defense Platform fires with (a cruiser is 45). */
export const PLATFORM_GUN_POWER = 100;
/** Power an outpost battery fires with. */
export const BATTERY_GUN_POWER = 15;
/** Fighters and bombers a platform shoots down per battle round (or per strike). */
export const PLATFORM_AA_KILLS = 6;
export const BATTERY_AA_KILLS = 2;
/** Share of an invader's landing troops a platform's flak kills (cap FLAK_MAX). */
export const PLATFORM_FLAK = 0.15;
export const BATTERY_FLAK = 0.03;
export const FLAK_MAX = 0.35;
/** Share of bombardment a platform's return fire stops (each battery adds a little; cap SCREEN_MAX). */
export const PLATFORM_SCREEN = 0.4;
export const BATTERY_SCREEN = 0.05;
export const SCREEN_MAX = 0.6;
/** Share of the landing force lost coming down under a contested sky. */
export const CONTESTED_LANDING_LOSS = 0.1;
/** hp per point of gun power per round (combat-config roundDamageFraction 0.08 × hpPerPower 10). */
const HP_PER_GUN_POWER = 0.8;

export interface SurfaceGuns {
    platforms: number;
    batteries: number;
    /** Power the guns fire with. */
    power: number;
    /** Fighters and bombers shot down per round. */
    aaKills: number;
}

const NO_GUNS: SurfaceGuns = { platforms: 0, batteries: 0, power: 0, aaKills: 0 };

/**
 * The guns standing on this world. Under siege, a platform on a district the
 * invader holds (its strongpoint) fires for nobody.
 */
export function surfaceGuns(planet: any, strongpoints?: Strongpoint[]): SurfaceGuns {
    if (!planet) return NO_GUNS;
    let platforms = 0;
    for (const t of planet.tiles ?? []) {
        if (t.buildingId !== 'orbital_defense_platform' || t.constructionState !== 'active') continue;
        if (strongpoints?.length) {
            const point = strongpoints.find(p => p.kind === 'orbital_defense' && (p.tileId === t.tileId || p.sectorIndex === t.sectorIndex));
            if (point && (!point.active || point.holder !== 'defender')) continue;
        }
        platforms++;
    }
    let batteries = 0;
    const outpost = planet.outpost;
    if (outpost?.cells) {
        for (const c of outpost.cells) {
            if (c.module === 'battery' && !((c.downUntilShift ?? 0) > (outpost.shift ?? 0))) batteries++;
        }
    }
    return {
        platforms,
        batteries,
        power: platforms * PLATFORM_GUN_POWER + batteries * BATTERY_GUN_POWER,
        aaKills: platforms * PLATFORM_AA_KILLS + batteries * BATTERY_AA_KILLS,
    };
}

export function gunTargetOf(planet: any): GunTarget {
    return GUN_TARGETS.includes(planet?.gunTarget) ? planet.gunTarget : 'spread';
}

/** The guns of every world `factionId` owns in the system, and the target each was told to take. */
export function systemGuns(planets: Iterable<any>, factionId: string, systemId: string): Array<{ planet: any; guns: SurfaceGuns; target: GunTarget }> {
    const out: Array<{ planet: any; guns: SurfaceGuns; target: GunTarget }> = [];
    for (const p of planets) {
        if (p.ownerId !== factionId || p.systemId !== systemId) continue;
        const guns = surfaceGuns(p, p.siege?.districts?.strongpoints);
        if (guns.power > 0) out.push({ planet: p, guns, target: gunTargetOf(p) });
    }
    return out;
}

const fleetPower = (f: any) => Math.max(0, Number(f.basePower) || 0) * Math.max(0, Math.min(1, Number(f.strength ?? 1)));

/** The fleets the guns fire on, given the owner's order. Falls back to all of them. */
export function pickGunTargets<F extends { basePower?: number; strength?: number; transportedArmyIds?: string[] }>(fleets: F[], target: GunTarget): F[] {
    const live = fleets.filter(f => fleetPower(f) > 0);
    if (live.length <= 1 || target === 'spread') return live;
    if (target === 'transports') {
        const carrying = live.filter(f => (f.transportedArmyIds ?? []).length > 0);
        return carrying.length ? carrying : live;
    }
    const sorted = [...live].sort((a, b) => fleetPower(b) - fleetPower(a));
    return [target === 'capital' ? sorted[0] : sorted[sorted.length - 1]];
}

/** Damage (hp scale) a round of these guns deals. */
export function gunRoundDamage(guns: SurfaceGuns): number {
    return guns.power * HP_PER_GUN_POWER;
}

/**
 * Anti-air: shoot down up to `kills` fighters and bombers from these fleets'
 * rosters, bombers first (they are what hurts). Returns the craft shot down.
 */
export function antiAirVolley(fleets: Array<{ composition?: Record<string, number> }>, kills: number): number {
    let left = Math.max(0, Math.floor(kills));
    let downed = 0;
    for (const key of ['bomber', 'interceptor']) {
        for (const f of fleets) {
            if (left <= 0) return downed;
            const have = Math.max(0, Number(f.composition?.[key]) || 0);
            if (!have) continue;
            const n = Math.min(have, left);
            f.composition![key] = have - n;
            left -= n;
            downed += n;
        }
    }
    return downed;
}

/** Anti-air against a sortie: craft shot down before it strikes, bombers first. Mutates the sortie's roster. */
export function antiAirOnSortie(sortie: { composition: { interceptor?: number; bomber?: number } }, guns: SurfaceGuns): number {
    return antiAirVolley([sortie as any], guns.aaKills);
}

/** Share of the landing force flak kills on the way down. */
export function flakLoss(guns: SurfaceGuns): number {
    return Math.min(FLAK_MAX, guns.platforms * PLATFORM_FLAK + guns.batteries * BATTERY_FLAK);
}

/** Fraction of bombardment that still reaches the ground under these guns' return fire. */
export function bombardmentScreen(guns: SurfaceGuns): number {
    return 1 - Math.min(SCREEN_MAX, guns.platforms * PLATFORM_SCREEN + guns.batteries * BATTERY_SCREEN);
}

/**
 * Return fire on fleets bombarding or holding the orbit: a cycle's worth of
 * the guns, as fleet strength lost (0..1), spread by the owner's targeting.
 * Applied to `fleets` in place; returns the power knocked off.
 */
export function returnFire(fleets: any[], guns: SurfaceGuns, target: GunTarget, scale = 1): number {
    const targets = pickGunTargets(fleets, target);
    const total = targets.reduce((s, f) => s + fleetPower(f), 0);
    if (total <= 0 || guns.power <= 0) return 0;
    // A platform takes ~4% off a 400-power battle line per volley; it wears a
    // fleet down over a long siege, it does not sweep the sky.
    const damage = guns.power * 0.15 * scale;
    let removed = 0;
    for (const f of targets) {
        const share = damage * (fleetPower(f) / total);
        const loss = Math.min(0.2, share / Math.max(1, Number(f.basePower) || 1));
        const before = f.strength ?? 1;
        f.strength = Math.max(0.05, before - loss); // guns cripple, they do not finish a fleet off
        removed += (before - f.strength) * (Number(f.basePower) || 0);
    }
    return removed;
}

/**
 * Take `share` of the men in a composition (rounded per unit type). Returns
 * how many were lost; the composition is changed in place.
 */
export function takeLandingLosses(composition: Record<string, number>, share: number): number {
    if (!(share > 0)) return 0;
    let lost = 0;
    for (const [type, n] of Object.entries(composition)) {
        const dead = Math.round((Number(n) || 0) * Math.min(1, share));
        if (dead <= 0) continue;
        composition[type] = (Number(n) || 0) - dead;
        lost += dead;
    }
    return lost;
}
