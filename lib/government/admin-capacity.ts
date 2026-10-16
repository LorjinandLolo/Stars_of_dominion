// lib/government/admin-capacity.ts
// Stars of Dominion — what size costs. Pure and client-safe.
//
// A 2026-10-14 probe (scripts/empire-size-probe.ts) found an empire could
// hold 40 star systems with no secession, flat approval and income that grew
// linearly with every colony: size cost nothing. Three costs now:
//
//   capacity     an empire administers ADMIN_BASE_SYSTEMS star systems, plus
//                ADMIN_PER_CENTER for each working Administrative Center.
//                Systems past it are overextension.
//   cohesion     every world loses OVEREXTENSION_COHESION for each capacity's
//                worth of systems over it (cohesion-service driver
//                'overextension'), down to OVEREXTENSION_COHESION_MAX: the far
//                worlds of a sprawling empire drift toward secession (which
//                opens at cohesion 20).
//   upkeep       every colony outside the home system costs credits each
//                strategic cycle, more the further it is from the capital and
//                more again while overextended (tickEmpireUpkeep).
//
// Outposts still growing (lib/outposts) count toward neither: they pay their
// own way in shifts. A graduated one is a colony like any other.

export const ADMIN_BASE_SYSTEMS = 6;
export const ADMIN_PER_CENTER = 3;
export const ADMIN_CENTER_ID = 'administrative_center';
/** Cohesion lost on every world per whole capacity's worth of systems over it, and the floor. */
export const OVEREXTENSION_COHESION = 5;
export const OVEREXTENSION_COHESION_MAX = 15;
/** Credits per colony per strategic cycle, before distance and overextension. */
export const COLONY_UPKEEP_CREDITS = 60;
/** Extra upkeep per lane jump from the capital. */
export const UPKEEP_PER_JUMP = 0.1;
/** Overextension multiplies upkeep by (1 + over / capacity), at most this. */
export const UPKEEP_OVEREXTENSION_MAX = 3;
/** Stability lost on every colony in a cycle the upkeep could not be paid in full. */
export const UNPAID_UPKEEP_STABILITY = 3;

type PlanetLike = { id: string; ownerId?: string | null; systemId: string; outpost?: { graduated?: boolean } | null; tiles?: any[] };

/** A world that counts for administration: owned, and not an outpost still growing. */
export function countsAsHolding(p: PlanetLike, factionId: string): boolean {
    return p.ownerId === factionId && !(p.outpost && !p.outpost.graduated);
}

export interface AdminStatus {
    /** Star systems with at least one colony. */
    systems: number;
    capacity: number;
    centers: number;
    /** Systems over capacity (0 when within it). */
    over: number;
}

export function adminStatus(planets: Iterable<PlanetLike>, factionId: string): AdminStatus {
    const systems = new Set<string>();
    let centers = 0;
    for (const p of planets) {
        if (!countsAsHolding(p, factionId)) continue;
        systems.add(p.systemId);
        for (const t of p.tiles ?? []) {
            if (t?.buildingId === ADMIN_CENTER_ID && t.constructionState === 'active') centers++;
        }
    }
    const capacity = ADMIN_BASE_SYSTEMS + ADMIN_PER_CENTER * centers;
    return { systems: systems.size, capacity, centers, over: Math.max(0, systems.size - capacity) };
}

/** The cohesion every world of this empire loses to overextension (≤ 0). */
export function overextensionCohesion(status: AdminStatus): number {
    return -Math.min(OVEREXTENSION_COHESION_MAX, (status.over / Math.max(1, status.capacity)) * OVEREXTENSION_COHESION);
}

/** Upkeep for one colony `jumps` lane jumps from the capital, under `status`. */
export function colonyUpkeep(jumps: number, status: AdminStatus): number {
    const distance = 1 + UPKEEP_PER_JUMP * Math.max(0, jumps);
    const strain = Math.min(UPKEEP_OVEREXTENSION_MAX, 1 + status.over / Math.max(1, status.capacity));
    return Math.round(COLONY_UPKEEP_CREDITS * distance * strain);
}

/** Distinct star systems with a colony: what Enlightenment's "worlds" bar counts. */
export function heldSystemCount(planets: Iterable<PlanetLike>, factionId: string): number {
    const systems = new Set<string>();
    for (const p of planets) if (countsAsHolding(p, factionId)) systems.add(p.systemId);
    return systems.size;
}
