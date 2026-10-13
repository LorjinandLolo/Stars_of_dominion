// lib/combat/siege/army-morale.ts
//
// Army-wide morale for a positional siege. The old abstract engine subtracted
// a tenth of every cycle's raw damage from morale, which on a real siege is
// hundreds of points — morale hit zero on the first resolved cycle and never
// came back, so every surrender rate sat at its maximum and the number on the
// HUD meant nothing. Here morale is a slow, bounded quantity driven by what a
// side can see happening: ground taken and lost, the share of the army that
// died this cycle, men taken prisoner, and whether the army is fed.

export interface MoraleCycle {
    /** Districts this side took this cycle. */
    captured: number;
    /** Districts this side lost this cycle. */
    lost: number;
    /** 0..1 — share of this side's fighting men that died this cycle. */
    lossShare: number;
    /** Men of this side who surrendered this cycle. */
    surrendered: number;
    /** 0..1 — share of this side's formations that are cut off from supply. */
    encircledShare: number;
    /** Whether the side fought at all this cycle. */
    fought: boolean;
}

export const MORALE_PER_CAPTURE = 4;
export const MORALE_PER_LOSS = 6;
export const MORALE_PER_LOSS_SHARE = 45;
export const MORALE_PER_SURRENDER = 3;
export const MORALE_ENCIRCLED = 6;
/** Regained per quiet, supplied cycle. */
export const MORALE_REST = 2.5;
/** Regained per fighting cycle that cost nothing — the enemy is breaking. */
export const MORALE_UNBLOODIED = 1;

/** The next cycle's morale, 0..max. */
export function nextMorale(current: number, max: number, cycle: MoraleCycle): number {
    let delta = 0;
    delta += cycle.captured * MORALE_PER_CAPTURE;
    delta -= cycle.lost * MORALE_PER_LOSS;
    delta -= Math.min(1, Math.max(0, cycle.lossShare)) * MORALE_PER_LOSS_SHARE;
    if (cycle.surrendered > 0) delta -= MORALE_PER_SURRENDER;
    delta -= Math.min(1, Math.max(0, cycle.encircledShare)) * MORALE_ENCIRCLED;
    if (!cycle.fought) delta += MORALE_REST;
    else if (cycle.lossShare <= 0 && cycle.lost === 0) delta += MORALE_UNBLOODIED;
    const cap = max > 0 ? max : 100;
    return Math.max(0, Math.min(cap, current + delta));
}
