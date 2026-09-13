// lib/combat/admiralty.ts
// What an admiral does to a battle. `Fleet.leaderId` pointed at a Leader
// with a level and traits, `LeadershipService.getLeaderModifiers` summed the
// traits, and nothing in combat ever read either: an admiral only made an
// empty fleet count as operational. Pure; lib/combat/admiralty-tests.ts.

/** Combat power per admiral level, inside the engine's ±40% clamp. */
export const ADMIRAL_POWER_PER_LEVEL = 0.02;
/** A level-5 admiral is as good as it gets on raw power. */
export const ADMIRAL_POWER_CAP = 0.10;
/** An admiral reads the enemy: the side opens with one prediction point (three arm annihilation). */
export const ADMIRAL_PREDICTION_POINTS = 1;
/** Leader XP for commanding a battle, more for winning it (the tick pays 50 per 6h for sitting). */
export const ADMIRAL_XP_PER_BATTLE = 150;
export const ADMIRAL_XP_FOR_VICTORY = 150;

export interface AdmiralLike {
    id: string;
    role: string;
    status: string;
    level: number;
}

/**
 * The admiral in command of a side: the highest-level active Admiral attached
 * to any of its fleets. Two admirals do not stack; the senior one commands.
 */
export function commandingAdmiral<L extends AdmiralLike>(
    fleets: ReadonlyArray<{ leaderId?: string | null }>,
    leaders: Map<string, L> | undefined | null,
): L | null {
    if (!leaders) return null;
    let best: L | null = null;
    for (const fleet of fleets) {
        if (!fleet.leaderId) continue;
        const leader = leaders.get(fleet.leaderId);
        if (!leader || leader.role !== 'Admiral' || leader.status !== 'active') continue;
        if (!best || (leader.level ?? 1) > (best.level ?? 1)) best = leader;
    }
    return best;
}

/** Additive combat_power_multiplier for the commanding admiral. */
export function admiralPowerBonus(admiral: AdmiralLike | null | undefined): number {
    if (!admiral) return 0;
    const level = Math.max(1, Math.floor(admiral.level ?? 1));
    return Math.min(ADMIRAL_POWER_CAP, ADMIRAL_POWER_PER_LEVEL * level);
}

/** XP an admiral earns for a battle. */
export function admiralBattleXp(won: boolean): number {
    return ADMIRAL_XP_PER_BATTLE + (won ? ADMIRAL_XP_FOR_VICTORY : 0);
}
