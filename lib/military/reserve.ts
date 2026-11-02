// lib/military/reserve.ts
// Stars of Dominion — a world's reserve: what it has raised and not yet sent.
//
// Ships wait in orbit, in one real fleet tagged reserveOf. Troops wait on the
// ground, in the world's garrison. Both already fight for the world (a fleet in
// the system joins any battle there, a garrison defends any landing), so the
// reserve adds no combat rules, only a place new units go and a limit on it.
// A reserve fleet that has left its system stops counting until it is back.
// Client-safe and pure.

import { planetYardSource, type YardPlanetLike } from '@/lib/combat/shipyard-gate';

/** Ships one yard tier can keep at readiness. */
export const SHIPS_PER_YARD_TIER = 6;
/** Troops any world can keep with no military building. */
export const BASE_TROOP_CAPACITY = 50;
/** Troops each active military building adds. */
export const TROOPS_PER_BUILDING: Record<string, number> = {
    barracks: 200,
    tank_foundry: 100,
    military_academy: 100,
};

export interface ReserveFleetLike {
    id: string;
    factionId: string;
    currentSystemId?: string | null;
    destinationSystemId?: string | null;
    reserveOf?: string;
    composition?: Record<string, number>;
}

export interface ReserveJobLike {
    kind?: string;
    planetId?: string;
    count?: number;
    targetFormationId?: string;
}

interface TroopPlanetLike {
    id: string;
    systemId?: string;
    tiles?: Array<{ buildingId?: string | null; constructionState?: string }>;
    garrison?: { garrisonTroops?: number } | null;
}

const sum = (comp: Record<string, number> | undefined) =>
    Object.values(comp ?? {}).reduce((a, n) => a + (Number(n) || 0), 0);

export function shipCapacity(planet: YardPlanetLike | null | undefined, nowSeconds = 0): number {
    const yard = planetYardSource(planet, nowSeconds);
    return Math.max(yard.tier, yard.light) * SHIPS_PER_YARD_TIER;
}

export function troopCapacity(planet: TroopPlanetLike | null | undefined): number {
    let cap = BASE_TROOP_CAPACITY;
    for (const t of planet?.tiles ?? []) {
        if (t.constructionState === 'active' && t.buildingId) cap += TROOPS_PER_BUILDING[t.buildingId] ?? 0;
    }
    return cap;
}

/** This world's reserve fleets at home. Normally one; two clicks can race. */
export function reserveFleets<F extends ReserveFleetLike>(fleets: Iterable<F>, planet: { id: string; systemId?: string }, factionId: string): F[] {
    const out: F[] = [];
    for (const f of fleets) {
        if (f.reserveOf === planet.id && f.factionId === factionId
            && f.currentSystemId === planet.systemId && !f.destinationSystemId) out.push(f);
    }
    return out;
}

/** Ships in reserve plus ships already on order for it. */
export function shipsHeld(fleets: Iterable<ReserveFleetLike>, jobs: Iterable<ReserveJobLike>, planet: { id: string; systemId?: string }, factionId: string): number {
    const reserve = reserveFleets(fleets, planet, factionId);
    const ids = new Set(reserve.map(f => f.id));
    let held = reserve.reduce((n, f) => n + sum(f.composition), 0);
    for (const j of jobs) {
        if (j.kind !== 'refit' && j.targetFormationId && ids.has(j.targetFormationId)) held += Number(j.count) || 0;
    }
    return held;
}

/** Troops in the garrison plus troops already in training for it. */
export function troopsHeld(planet: TroopPlanetLike, jobs: Iterable<ReserveJobLike>): number {
    let held = Number(planet.garrison?.garrisonTroops) || 0;
    for (const j of jobs) {
        if (j.planetId === planet.id && !j.targetFormationId) held += Number(j.count) || 0;
    }
    return held;
}

/** Why `count` more cannot be held, or null if there is room. */
export function capacityRefusal(what: 'ships' | 'troops', worldName: string, held: number, capacity: number, count: number): string | null {
    if (held + count <= capacity) return null;
    const room = what === 'ships' ? 'Build a bigger yard' : 'Build a Barracks';
    return `${worldName} can keep ${capacity} ${what} ready and has ${held}. ${room}, or muster some out.`;
}
