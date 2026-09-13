// lib/combat/fleet-speed.ts
// How fast a fleet moves on the strategic map, from what it is made of.
//
// Strategic travel used to be one flat speed for every fleet (10 units/s per
// layer, the same hyperdrive profile stamped on every hull ever built), so a
// corvette wing and a battleship line crossed a lane in the same time and the
// Thrusters / Afterburners modules were a signature entry and nothing more.
//
// Two factors, both pure:
//   hull   — the slowest hull class aboard sets the pace (a fleet is as fast
//            as its battleships);
//   design — the ship-weighted average `speedMult` of the designs aboard
//            (Thrusters +10%, Afterburners +20%), kept on the fleet as
//            `designSpeedBonus` by recruitment and merge.
// Movement multiplies its layer speed by fleetSpeedFactor(fleet). Fleets from
// before this (no designSpeedBonus) still get the hull factor, which is what
// makes an old battleship fleet slow rather than "unknown".

/** Relative lane speed per hull class. Wings (interceptor/bomber) ride inside hulls and do not count. */
export const HULL_SPEED_FACTORS: Record<string, number> = {
    corvette: 1.2,
    destroyer: 1.05,
    cruiser: 0.9,
    carrier: 0.8,
    battleship: 0.75,
};

type CompositionLike = Record<string, number | undefined> | null | undefined;

/** Hull ships aboard (wings excluded), tolerant of legacy UPPERCASE keys. */
export function shipCountOf(composition: CompositionLike): number {
    let n = 0;
    for (const [key, count] of Object.entries(composition ?? {})) {
        if (!(key.toLowerCase() in HULL_SPEED_FACTORS)) continue;
        n += Math.max(0, Number(count) || 0);
    }
    return n;
}

/** The slowest hull class aboard sets the pace; an empty roster moves at 1. */
export function hullSpeedFactor(composition: CompositionLike): number {
    let slowest = Infinity;
    for (const [key, count] of Object.entries(composition ?? {})) {
        if (!(Number(count) > 0)) continue;
        const factor = HULL_SPEED_FACTORS[key.toLowerCase()];
        if (factor !== undefined && factor < slowest) slowest = factor;
    }
    return Number.isFinite(slowest) ? slowest : 1;
}

/**
 * Ship-weighted blend of two design speed bonuses: the fleet's existing
 * average over `oldShips` with `newBonus` over `newShips` more ships.
 */
export function blendSpeedBonus(
    oldBonus: number | undefined,
    oldShips: number,
    newBonus: number | undefined,
    newShips: number,
): number {
    const a = Math.max(0, oldShips) ;
    const b = Math.max(0, newShips);
    if (a + b <= 0) return newBonus ?? oldBonus ?? 0;
    return ((oldBonus ?? 0) * a + (newBonus ?? 0) * b) / (a + b);
}

/** Multiplier on the layer speed for this fleet: hull pace × (1 + design bonus). */
export function fleetSpeedFactor(fleet: { composition?: CompositionLike; designSpeedBonus?: number }): number {
    const bonus = typeof fleet.designSpeedBonus === 'number' && Number.isFinite(fleet.designSpeedBonus)
        ? Math.max(0, fleet.designSpeedBonus)
        : 0;
    return hullSpeedFactor(fleet.composition) * (1 + bonus);
}
