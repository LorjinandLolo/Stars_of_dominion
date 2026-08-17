// lib/factions/stimulant.ts
//
// The shape two civilizations independently need: take a substance, become
// briefly terrifying, then pay for it.
//
// The Sarrak Divine Serum landed first and the Gabagoonian Capacola Surge is
// structurally identical — an active window, then a crash window, both derived
// from absolute sim-seconds. Rather than write the comparisons twice, the LOGIC
// is promoted here while each faction keeps its own STATE FIELDS.
//
// That split is deliberate. Migrating sarrak's persisted serumEndsAtSeconds /
// withdrawalEndsAtSeconds to shared names would be churn with real regression
// risk across a live snapshot, for no behavioural gain. Passing the two
// timestamps in as numbers gets the duplication out of the codebase without
// touching a single stored field.
//
// What the two factions do NOT share is magnitude: the serum is a binary dose,
// while capacola "scales with how much is eaten". So this module deliberately
// models only the CYCLE, never the size of the effect.

export type StimulantPhase = 'surging' | 'crashing' | 'clear';

/**
 * Where a stimulant cycle stands right now.
 *
 * Absolute timestamps, never a countdown. A stored `ticksRemaining` is the shape
 * that rots the moment a tick is missed — world.propagandaCampaigns is
 * decremented every strategic tick against a Map nothing ever writes to, and
 * looks alive in the tick processor while being worth nothing.
 */
export function stimulantPhase(
    nowSeconds: number,
    activeUntilSeconds: number,
    crashUntilSeconds: number,
): StimulantPhase {
    if (nowSeconds < activeUntilSeconds) return 'surging';
    if (nowSeconds < crashUntilSeconds) return 'crashing';
    return 'clear';
}

export function isSurging(now: number, activeUntil: number, crashUntil: number): boolean {
    return stimulantPhase(now, activeUntil, crashUntil) === 'surging';
}

export function isCrashing(now: number, activeUntil: number, crashUntil: number): boolean {
    return stimulantPhase(now, activeUntil, crashUntil) === 'crashing';
}

/**
 * The timestamps a fresh dose produces.
 *
 * The crash window always follows the active one — a stimulant whose crash could
 * be dodged by re-dosing at the right moment would be a strictly-better button,
 * not a trade-off. Callers gate re-dosing separately.
 */
export function doseWindows(
    nowSeconds: number,
    activeSeconds: number,
    crashSeconds: number,
): { activeUntilSeconds: number; crashUntilSeconds: number } {
    const activeUntilSeconds = nowSeconds + activeSeconds;
    return { activeUntilSeconds, crashUntilSeconds: activeUntilSeconds + crashSeconds };
}
