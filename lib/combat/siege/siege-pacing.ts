// lib/combat/siege/siege-pacing.ts
//
// How fast a planetary siege runs, stated once. The worker ticks every
// TICK_REAL_SECONDS of wall-clock time; a tactical cycle (orders resolve,
// battles are fought, districts change hands) is SIEGE_CYCLE_TICKS of those.
//
// A cycle used to be 4 ticks — 20 real seconds — and a defended homeworld
// fell in about five real minutes, which left no room for the thing a siege
// is supposed to be: holding on until help arrives. At 60 ticks a cycle is
// five real minutes and a well-held world lasts hours.
//
// Pure constants; the client imports this for the HUD countdown.

export const TICK_REAL_SECONDS = 5;

/** Ticks per tactical cycle: 60 × 5 s = one cycle every five real minutes. */
export const SIEGE_CYCLE_TICKS = 60;

/**
 * The cycle length the per-tick bombardment constants in district-battle.ts
 * and siege-engine.ts were tuned at. Orbital fire is applied every tick, so
 * a longer cycle would mean proportionally more of it per cycle; the engine
 * scales each tick's power by bombardTickScale() to keep per-cycle damage
 * what it was.
 */
export const BOMBARD_REFERENCE_CYCLE_TICKS = 4;

/**
 * Live pacing. Mutable so a probe can run sieges at the old 4-tick cycle
 * (cycle-based assertions, fifteen times fewer ticks); the game never writes
 * to it.
 */
export const pacing = { cycleLengthTicks: SIEGE_CYCLE_TICKS };

export const cycleRealSeconds = (ticks: number = pacing.cycleLengthTicks) => ticks * TICK_REAL_SECONDS;

export const cyclesPerRealHour = (ticks: number = pacing.cycleLengthTicks) => 3600 / cycleRealSeconds(ticks);

/** Multiplier for one tick's orbital fire so a cycle's total is pacing-independent. */
export const bombardTickScale = (cycleLengthTicks: number) =>
    BOMBARD_REFERENCE_CYCLE_TICKS / Math.max(1, cycleLengthTicks || SIEGE_CYCLE_TICKS);
