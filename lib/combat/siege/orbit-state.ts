// lib/combat/siege/orbit-state.ts
//
// Who holds the sky over a besieged world, and what that decides. Whoever
// holds the orbit feeds the ground war beneath it: an invader with the orbit
// keeps the beachhead supplied, lands reinforcements and bombards; a defender
// who wins it back starves the beachhead, silences the guns and can land
// transports. A planetary shield (lib/combat/siege/strongpoints.ts) is the
// one exception — under it the defender lands and nothing falls from orbit,
// whoever is overhead.
//
// Pure: the worker passes the live fleet list and the world's predicates,
// the client can call it with the synced fleets for display.

export type OrbitHolder = 'attacker' | 'defender' | 'contested' | 'none';

export interface OrbitState {
    holder: OrbitHolder;
    /** Parked, operational attacker fleet power in the planet's system. */
    attackerPower: number;
    /** Parked, operational power of the defender and anyone at war with the attacker. */
    defenderPower: number;
    /** The planet's own orbital defences are beaten down (isOrbitSuppressed). */
    suppressed: boolean;
    /** The defender holds an active planetary shield district. */
    shieldUp: boolean;
}

export interface OrbitFleetLike {
    id: string;
    factionId: string;
    currentSystemId: string | null;
    destinationSystemId: string | null;
    basePower?: number;
    strength?: number;
}

/**
 * Cycles the beachhead stays supplied after the attacker loses the orbit —
 * a relief fleet that is driven off again in one engagement does not starve
 * an army. Three cycles is fifteen real minutes at the live pacing.
 */
export const BLOCKADE_GRACE_CYCLES = 3;
/** Cycles a formation survives at zero supply before it lays down its arms. */
export const STARVE_SURRENDER_CYCLES = 6;
/**
 * Cycles of unbroken attacker blockade after which the defender's supply
 * shrinks to the capital core and the strongpoints it still mans.
 */
export const BLOCKADE_PHASEOUT_CYCLES = 24;

export function orbitState(input: {
    fleets: Iterable<OrbitFleetLike>;
    systemId: string;
    attackerEmpireId: string;
    defenderEmpireId: string;
    suppressed: boolean;
    shieldUp: boolean;
    isAtWar: (a: string, b: string) => boolean;
    isFleetOperational: (f: any) => boolean;
}): OrbitState {
    let attackerPower = 0;
    let defenderPower = 0;
    for (const f of input.fleets) {
        if (f.currentSystemId !== input.systemId || f.destinationSystemId) continue;
        if (!input.isFleetOperational(f)) continue;
        const power = Math.max(0, Number(f.basePower) || 0) * Math.max(0, Math.min(1, Number(f.strength ?? 1)));
        if (f.factionId === input.attackerEmpireId) attackerPower += power;
        else if (f.factionId === input.defenderEmpireId || input.isAtWar(input.attackerEmpireId, f.factionId)) defenderPower += power;
    }
    let holder: OrbitHolder;
    if (attackerPower > 0 && defenderPower > 0) holder = 'contested';
    else if (attackerPower > 0 && input.suppressed) holder = 'attacker';
    else if (defenderPower > 0 || !input.suppressed) holder = 'defender';
    else holder = 'none';
    return {
        holder,
        attackerPower: Math.round(attackerPower),
        defenderPower: Math.round(defenderPower),
        suppressed: input.suppressed,
        shieldUp: input.shieldUp,
    };
}

/**
 * Whether a side can move troops between orbit and surface right now: the
 * invader needs the orbit; the defender needs it NOT to be the invader's, or
 * a shield to land under.
 */
export function canCrossOrbit(orbit: OrbitState | undefined, side: 'attacker' | 'defender'): boolean {
    if (!orbit) return true;
    if (side === 'attacker') return orbit.holder === 'attacker';
    return orbit.holder !== 'attacker' || orbit.shieldUp;
}

/** Orbital fire support the invader can bring to bear this tick. */
export function orbitalFireFor(orbit: OrbitState): number {
    return orbit.holder === 'attacker' && !orbit.shieldUp ? orbit.attackerPower : 0;
}
