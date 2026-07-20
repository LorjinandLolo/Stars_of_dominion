// lib/tactical/fleet-adapter.ts
// Bridges strategic fleets (lib/movement/types Fleet) and the tactical sim.
//
// Strategic composition keys (interceptor, destroyer, cruiser, bomber, carrier,
// …) map onto the four V1 tactical classes; results map back onto the ORIGINAL
// keys so the strategic fleet keeps its own vocabulary.

import type { ReserveEntry, BattleResult, SideResult, BattlePlan } from './types';
import { classForCompositionKey } from './ship-defs';

/** Minimal strategic-fleet shape the adapter needs (subset of movement Fleet). */
export interface StrategicFleetLike {
    id: string;
    factionId: string;
    name?: string;
    composition?: Record<string, number> | null;
    strength?: number;
    basePower?: number;
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
