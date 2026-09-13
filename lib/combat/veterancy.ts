// lib/combat/veterancy.ts
// Fleets learn. `Fleet.experience` (0..EXPERIENCE_CAP) multiplies a fleet's
// combat power in createCombatant, is awarded to every fleet that survives a
// battle it fought in, dilutes when green ships join, averages by power on
// merge and rides along unchanged on split. Pure; lib/combat/veterancy-tests.ts.

/** Power multiplier at full veterancy: 1 + 0.25. */
export const EXPERIENCE_CAP = 0.25;
/** Awarded to every surviving fleet that fought at least one round. */
export const EXPERIENCE_PER_BATTLE = 0.02;
/** Extra for the side that held the field. */
export const EXPERIENCE_FOR_VICTORY = 0.02;

const clampXp = (v: number) => Math.max(0, Math.min(EXPERIENCE_CAP, Number.isFinite(v) ? v : 0));

/** Combat power multiplier for a fleet's experience. */
export function experienceMultiplier(experience: number | undefined): number {
    return 1 + clampXp(experience ?? 0);
}

/** Experience after a battle: base for surviving it, more for winning it. */
export function gainExperience(experience: number | undefined, won: boolean): number {
    return clampXp((experience ?? 0) + EXPERIENCE_PER_BATTLE + (won ? EXPERIENCE_FOR_VICTORY : 0));
}

/**
 * Power-weighted blend of two crews: a veteran fleet absorbing a green one,
 * or fresh hulls completing into a blooded fleet (pass their power with 0).
 */
export function blendExperience(
    oldXp: number | undefined,
    oldPower: number,
    newXp: number | undefined,
    newPower: number,
): number {
    const a = Math.max(0, oldPower);
    const b = Math.max(0, newPower);
    if (a + b <= 0) return clampXp(newXp ?? oldXp ?? 0);
    return clampXp(((oldXp ?? 0) * a + (newXp ?? 0) * b) / (a + b));
}

/** Rank label for the UI. */
export function veterancyRank(experience: number | undefined): 'Green' | 'Regular' | 'Seasoned' | 'Veteran' | 'Elite' {
    const xp = clampXp(experience ?? 0);
    if (xp >= 0.2) return 'Elite';
    if (xp >= 0.12) return 'Veteran';
    if (xp >= 0.06) return 'Seasoned';
    if (xp > 0) return 'Regular';
    return 'Green';
}
