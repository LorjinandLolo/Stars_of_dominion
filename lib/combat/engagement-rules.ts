// lib/combat/engagement-rules.ts
// Pure rules the sector-combat manager applies AROUND the engine: who is the
// attacker, what a side's ships look like after losses, who breaks and runs.
// No world access, so lib/combat/engagement-rules-tests.ts drives them directly.

import type { Fleet } from '../movement/types';
import type { CombatantState, CombatStance, UnitComposition, UnitType } from './combat-types';
import type { DesignProfile } from './ship-types';
import { addProfile, normalizeComposition, scaleProfile } from './ship-registry';

/** Strike-craft keys the engine attrits in place each round (combat-engine air phase). */
const AIR_KEYS: UnitType[] = ['interceptor', 'bomber'];

/** Extra strength a breaking fleet loses when the enemy chose the `pursue` directive. */
export const PURSUIT_STRENGTH_LOSS = 0.05;

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/** Sim time the most recent fleet on a side entered the system; -Infinity if none is stamped. */
export function latestArrival(fleets: Fleet[]): number {
    let latest = -Infinity;
    for (const f of fleets) {
        const at = typeof f.arrivedAtSeconds === 'number' && Number.isFinite(f.arrivedAtSeconds)
            ? f.arrivedAtSeconds
            : -Infinity;
        if (at > latest) latest = at;
    }
    return latest;
}

export interface RoleAssignment {
    attackerFleets: Fleet[];
    defenderFleets: Fleet[];
    /** True when side B took the attacker role. */
    swapped: boolean;
}

/**
 * Whoever arrived last is the attacker. On a tie (or fleets that predate the
 * arrival stamp, which count as having always been there) the system owner
 * defends; if neither owns the system, side A keeps the attacker role, which
 * is what iteration order always produced before.
 */
export function pickRoles(fleetsA: Fleet[], fleetsB: Fleet[], systemOwnerId: string | null | undefined): RoleAssignment {
    const a = latestArrival(fleetsA);
    const b = latestArrival(fleetsB);
    let swapped = false;
    if (b > a) {
        swapped = true;
    } else if (a === b) {
        const factionA = fleetsA[0]?.factionId;
        const factionB = fleetsB[0]?.factionId;
        if (systemOwnerId && systemOwnerId === factionA && systemOwnerId !== factionB) swapped = true;
    }
    return swapped
        ? { attackerFleets: fleetsB, defenderFleets: fleetsA, swapped }
        : { attackerFleets: fleetsA, defenderFleets: fleetsB, swapped };
}

export interface ForceSnapshot {
    composition: UnitComposition;
    designProfile?: DesignProfile;
    screeningEfficiency: number;
}

/** HOI4 naval rule: three screens per capital is fully efficient. */
export function screeningEfficiencyOf(comp: UnitComposition): number {
    const screens = (comp.destroyer || 0) + (comp.corvette || 0);
    const capitals = (comp.cruiser || 0) + (comp.carrier || 0) + (comp.battleship || 0);
    if (capitals <= 0) return 1;
    return Math.min(1, screens / (capitals * 3));
}

/**
 * A side's ships as they stand NOW: every fleet's composition and design
 * signature scaled by its remaining strength. Losses reduce `strength`, never
 * `composition`, so without this a fleet at 10% still weighed its full ship
 * count in the counter grid and the attack table. Fractional ships are fine:
 * every consumer weights or sums counts.
 */
export function snapshotForce(fleets: Fleet[]): ForceSnapshot {
    const composition: UnitComposition = {};
    let profile: DesignProfile | undefined;
    for (const f of fleets) {
        const strength = clamp01(f.strength ?? 1);
        if (strength <= 0) continue;
        // A fleet can carry an empty composition object ({}), which is truthy;
        // fall back whenever there are no actual ship entries so production-built
        // fleets without a roster still fight.
        const normalized = normalizeComposition(f.composition);
        const comp: Record<string, number> = Object.keys(normalized).length > 0
            ? normalized
            : { destroyer: Math.max(1, Math.floor((f.basePower || 0) / 150)) };
        for (const [type, count] of Object.entries(comp)) {
            const n = (count || 0) * strength;
            if (n <= 0) continue;
            composition[type as UnitType] = (composition[type as UnitType] || 0) + n;
        }
        if (f.designProfile) profile = addProfile(profile, scaleProfile(f.designProfile, strength));
    }
    return { composition, designProfile: profile, screeningEfficiency: screeningEfficiencyOf(composition) };
}

/**
 * Re-read a combatant's ships from its live fleets at the top of a round.
 * Strike craft keep whatever the engine's air phase already shot down (the
 * fresh count is only a ceiling); everything else follows current strength,
 * including fleets that arrived since the battle began.
 */
export function refreshCombatant(side: CombatantState, fleets: Fleet[]): void {
    const fresh = snapshotForce(fleets);
    for (const key of AIR_KEYS) {
        const current = side.composition?.[key];
        const incoming = fresh.composition[key];
        if (typeof current === 'number' && typeof incoming === 'number') {
            fresh.composition[key] = Math.min(current, incoming);
        }
    }
    side.composition = fresh.composition;
    side.designProfile = fresh.designProfile;
    side.screeningEfficiency = fresh.screeningEfficiency;
}

/**
 * Split a round's incoming damage between a side's fleets and its orbital
 * defenses by their share of remaining mass, so a fortress soaks fire in
 * proportion to how much of the line it is.
 */
export function splitDamage(damage: number, fleetHp: number, fortHp: number): { fleets: number; fort: number } {
    const total = Math.max(0, fleetHp) + Math.max(0, fortHp);
    if (damage <= 0 || total <= 0) return { fleets: Math.max(0, damage), fort: 0 };
    const fort = damage * (Math.max(0, fortHp) / total);
    return { fleets: damage - fort, fort };
}

/**
 * Fleets that break off at the end of a round: anyone whose doctrine's
 * `retreatThreshold` (a strength fraction) has been crossed, or every fleet
 * on a side that fought the round under the `withdraw` stance. Dead fleets
 * are not breaking, they are gone.
 */
export function breakingFleets(fleets: Fleet[], stance: CombatStance | undefined): Fleet[] {
    return fleets.filter(f => {
        const strength = f.strength ?? 1;
        if (strength <= 0) return false;
        if (stance === 'withdraw') return true;
        const threshold = f.doctrine?.retreatThreshold;
        return typeof threshold === 'number' && threshold > 0 && strength <= threshold;
    });
}
