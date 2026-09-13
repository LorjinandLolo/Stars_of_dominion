// lib/tactical/fleet-adapter.ts
// Bridges strategic fleets (lib/movement/types Fleet) and the tactical sim.
//
// Strategic composition keys (interceptor, destroyer, cruiser, bomber, carrier,
// …) map onto the four V1 tactical classes; results map back onto the ORIGINAL
// keys so the strategic fleet keeps its own vocabulary.

import type { ReserveEntry, BattleResult, SideResult, BattlePlan, DesignTuning } from './types';
import { IDENTITY_TUNING } from './types';
import { classForCompositionKey } from './ship-defs';

/** Minimal strategic-fleet shape the adapter needs (subset of movement Fleet). */
export interface StrategicFleetLike {
    id: string;
    factionId: string;
    name?: string;
    composition?: Record<string, number> | null;
    strength?: number;
    basePower?: number;
    /** Summed per-ship design signature (lib/combat/ship-types DesignProfile). */
    designProfile?: Partial<Record<string, number>> | null;
}

/** Composition keys that are strike craft riding inside hulls, not hulls. */
const WING_KEYS = new Set(['interceptor', 'bomber']);

/** Per module per ship: how much each design dimension moves the tactical numbers. */
export const TUNING_RATES = Object.freeze({
    /** One Deflector per ship = +25% shield pool. */
    shieldPerModule: 0.25,
    /** One Plating per ship = +8 points of armour on every aspect, capped. */
    armorPerModule: 0.08,
    armorCap: 0.30,
    /** One Thruster (evasion 1) per ship = +8% speed. */
    speedPerModule: 0.08,
    /** Each weapon module per ship = +5% damage. */
    weaponPerModule: 0.05,
    /** Energy vs kinetic share swings shield/hull damage by up to ±30%. */
    mixSwing: 0.30,
    /** An all-explosive fit pierces a quarter of its damage straight to hull. */
    explosivePierce: 0.25,
});

/**
 * What a side's designs do to the sim, from the fleets' summed designProfile
 * divided by the hulls aboard. A side with no profile (fleets from before
 * designs, or AI spawns that never picked one) gets the identity, never a
 * penalty — the same rule the strategic engine follows.
 */
export function designTuningFor(fleets: StrategicFleetLike[]): DesignTuning {
    let ships = 0;
    const sum = { energy: 0, kinetic: 0, explosive: 0, shield: 0, armor: 0, evasion: 0 };
    let sawProfile = false;
    for (const fleet of fleets) {
        const strength = Math.min(1, Math.max(0, typeof fleet.strength === 'number' ? fleet.strength : 1));
        for (const [key, count] of Object.entries(fleet.composition ?? {})) {
            if (WING_KEYS.has(key.toLowerCase())) continue;
            ships += Math.max(0, Number(count) || 0) * strength;
        }
        const p = fleet.designProfile;
        if (!p) continue;
        sawProfile = true;
        for (const k of Object.keys(sum) as (keyof typeof sum)[]) {
            sum[k] += Math.max(0, Number(p[k]) || 0) * strength;
        }
    }
    if (!sawProfile || ships <= 0) return { ...IDENTITY_TUNING };

    const per = (k: keyof typeof sum) => sum[k] / ships;
    const weapons = per('energy') + per('kinetic') + per('explosive');
    const totalAttack = sum.energy + sum.kinetic + sum.explosive;
    const e = totalAttack > 0 ? sum.energy / totalAttack : 0;
    const k = totalAttack > 0 ? sum.kinetic / totalAttack : 0;
    const x = totalAttack > 0 ? sum.explosive / totalAttack : 0;
    const r = TUNING_RATES;
    return {
        shieldMult: 1 + r.shieldPerModule * per('shield'),
        armorBonus: Math.min(r.armorCap, r.armorPerModule * per('armor')),
        speedMult: 1 + r.speedPerModule * per('evasion'),
        weaponMult: 1 + r.weaponPerModule * weapons,
        vsShield: 1 + r.mixSwing * (e - k),
        vsHull: 1 + r.mixSwing * (k - e),
        pierceBonus: r.explosivePierce * x,
    };
}

/**
 * Convert one or more strategic fleets into tactical reserve entries.
 * A fleet with an empty composition still fields something (its basePower is
 * abstract strength): synthesize corvettes so the battle isn't a walkover.
 */
export function fleetsToReserves(fleets: StrategicFleetLike[]): ReserveEntry[] {
    const merged = new Map<string, ReserveEntry>();
    let sawAnyShip = false;

    for (const fleet of fleets) {
        for (const [key, count] of Object.entries(fleet.composition ?? {})) {
            const n = Math.max(0, Math.floor(Number(count) || 0));
            if (n <= 0) continue;
            sawAnyShip = true;
            const classId = classForCompositionKey(key);
            const mapKey = `${classId}:${key}`;
            const existing = merged.get(mapKey);
            if (existing) existing.count += n;
            else merged.set(mapKey, { classId, sourceKey: key, count: n });
        }
    }

    if (!sawAnyShip) {
        const power = fleets.reduce((sum, f) => sum + (f.basePower ?? 0) * (f.strength ?? 1), 0);
        const corvettes = Math.max(1, Math.round(power / 25));
        merged.set('corvette:interceptor', { classId: 'corvette', sourceKey: 'interceptor', count: corvettes });
    }

    return [...merged.values()];
}

/** Average strength across fleets (hull multiplier for spawned ships). */
export function fleetsStrength(fleets: StrategicFleetLike[]): number {
    if (!fleets.length) return 1;
    const s = fleets.reduce((sum, f) => sum + (typeof f.strength === 'number' ? f.strength : 1), 0) / fleets.length;
    return Math.min(1, Math.max(0.3, s));
}

/** Default AI plan for an NPC defender. */
export function defaultEnemyPlan(): BattlePlan {
    return { posture: 'balanced', retreatBelowFleetStrength: 0.15 };
}

/**
 * Shape of the MIL_TACTICAL_RESULT order payload. The worker applies each
 * side's outcome onto the participating strategic fleets.
 */
export interface TacticalResultPayload {
    systemId: string;
    /** Fleets that fought on the player's side (their ids at engage time). */
    playerFleetIds: string[];
    /** Fleets on the enemy side. */
    enemyFleetIds: string[];
    enemyFactionId: string;
    winner: BattleResult['winner'];
    reason: string;
    playerResult: SideResult;
    enemyResult: SideResult;
    durationSeconds: number;
}

export function buildResultPayload(
    systemId: string,
    playerFleetIds: string[],
    enemyFleetIds: string[],
    enemyFactionId: string,
    result: BattleResult
): TacticalResultPayload {
    return {
        systemId,
        playerFleetIds,
        enemyFleetIds,
        enemyFactionId,
        winner: result.winner,
        reason: result.reason,
        playerResult: result.player,
        enemyResult: result.enemy,
        durationSeconds: Math.round(result.durationSeconds),
    };
}
