// lib/combat/fleet-roster.ts
// What a fleet's books say is aboard, and the two operations that rewrite
// them: refit and split. Pure; lib/combat/refit-tests.ts.
//
// A fleet carries `composition` (hull -> ships) and `designCounts`
// (designId -> ships). Until refit existed the second was display-only, so
// it was allowed to drift. Refit reads it to decide which ships can be
// converted and what they are converted FROM, so it is load-bearing now:
//   - per hull, designCounts may never exceed composition (`inconsistent`);
//   - ships of a hull that no design accounts for are "unregistered": hulls
//     built before designs existed, rated at the bare hull.

import type { DesignProfile, ShipClassId, ShipDesign } from './ship-types';
import { emptyProfile, getHull, normalizeComposition, summarizeDesign } from './ship-registry';
import { shipCountOf } from './fleet-speed';

/** Looks a design up (standard patterns included). Undefined = no longer on file. */
export type DesignLookup = (designId: string) => ShipDesign | undefined;

export interface FleetBooks {
    id?: string;
    composition?: Record<string, number> | null;
    designCounts?: Record<string, number> | null;
    designProfile?: DesignProfile | null;
    designSpeedBonus?: number;
    basePower?: number;
}

export interface HullRoster {
    /** Ships of this hull in the composition. */
    total: number;
    /** designId -> ships, for designs of this hull that are still on file. */
    byDesign: Record<string, number>;
    /** Sum of byDesign. */
    known: number;
    /** total - known, floored at 0: hulls no design accounts for. */
    unregistered: number;
    /** The books claim more fitted ships of this hull than the fleet has. */
    inconsistent: boolean;
}

export interface FleetRoster {
    hulls: Record<string, HullRoster>;
    /** designCounts ids that resolve to nothing (pattern retired while in service). */
    orphanIds: string[];
}

export function rosterByHull(fleet: FleetBooks, lookup: DesignLookup): FleetRoster {
    const comp = normalizeComposition(fleet.composition ?? {});
    const hulls: Record<string, HullRoster> = {};
    const ensure = (hullId: string): HullRoster =>
        hulls[hullId] ?? (hulls[hullId] = { total: Math.max(0, Math.floor(comp[hullId] ?? 0)), byDesign: {}, known: 0, unregistered: 0, inconsistent: false });
    for (const key of Object.keys(comp)) if (getHull(key)) ensure(key);

    const orphanIds: string[] = [];
    for (const [designId, raw] of Object.entries(fleet.designCounts ?? {})) {
        const n = Math.max(0, Math.floor(Number(raw) || 0));
        if (n <= 0) continue;
        const design = lookup(designId);
        if (!design) { orphanIds.push(designId); continue; }
        const hull = ensure(design.hullId);
        hull.byDesign[designId] = (hull.byDesign[designId] ?? 0) + n;
        hull.known += n;
    }
    for (const hull of Object.values(hulls)) {
        hull.inconsistent = hull.known > hull.total;
        hull.unregistered = Math.max(0, hull.total - hull.known);
    }
    return { hulls, orphanIds };
}

/** An open refit job, as far as the roster cares. */
export interface RefitReservation {
    targetFormationId?: string;
    kind?: string;
    count: number;
    classKey?: string;
    refitFrom?: { designId: string | null } | null;
}

/**
 * Ships of `fromDesignId` (null = unregistered hulls of `hullId`) that can be
 * sent to the yard now: what the books hold, less what open refit jobs on this
 * fleet have already taken from the same source.
 */
export function refittable(
    fleet: FleetBooks,
    fromDesignId: string | null,
    hullId: ShipClassId,
    lookup: DesignLookup,
    jobs: ReadonlyArray<RefitReservation> = [],
): { available: number; reserved: number } {
    const roster = rosterByHull(fleet, lookup);
    const hull = roster.hulls[hullId];
    const held = !hull ? 0
        : fromDesignId === null ? hull.unregistered
        : Math.min(hull.byDesign[fromDesignId] ?? 0, hull.total);
    let reserved = 0;
    for (const job of jobs) {
        if (job.kind !== 'refit' || !fleet.id || job.targetFormationId !== fleet.id) continue;
        if ((job.refitFrom?.designId ?? null) !== fromDesignId) continue;
        if (fromDesignId === null && job.classKey !== hullId) continue;
        reserved += Math.max(0, Math.floor(job.count || 0));
    }
    return { available: Math.max(0, held - reserved), reserved };
}

export interface RefitDelta {
    fromDesignId: string | null;
    toDesignId: string;
    from: { power: number; profile?: Partial<DesignProfile> | null; speedMult: number };
    to: { power: number; profile?: Partial<DesignProfile> | null; speedMult: number };
}

const PROFILE_KEYS: (keyof DesignProfile)[] = ['energy', 'kinetic', 'explosive', 'shield', 'armor', 'evasion'];

/**
 * Convert `k` ships on the fleet's books. Rewrites exactly four fields:
 * basePower, designProfile, designCounts, designSpeedBonus. Composition,
 * strength, experience, leader and doctrine are untouched: the same hulls,
 * the same crews, different modules.
 */
export function applyRefit(fleet: FleetBooks, delta: RefitDelta, k: number): void {
    const n = Math.max(0, Math.floor(k));
    if (n <= 0) return;

    fleet.basePower = Math.max(1, (fleet.basePower ?? 0) + n * (delta.to.power - delta.from.power));

    const profile: DesignProfile = { ...emptyProfile(), ...(fleet.designProfile ?? {}) };
    for (const key of PROFILE_KEYS) {
        profile[key] = Math.max(0, (profile[key] ?? 0) - n * (delta.from.profile?.[key] ?? 0) + n * (delta.to.profile?.[key] ?? 0));
    }
    fleet.designProfile = profile;

    const counts = { ...(fleet.designCounts ?? {}) };
    if (delta.fromDesignId) {
        const left = (counts[delta.fromDesignId] ?? 0) - n;
        if (left > 0) counts[delta.fromDesignId] = left; else delete counts[delta.fromDesignId];
    }
    counts[delta.toDesignId] = (counts[delta.toDesignId] ?? 0) + n;
    fleet.designCounts = counts;

    const ships = shipCountOf(fleet.composition ?? {});
    if (ships > 0) {
        fleet.designSpeedBonus = Math.max(0, (fleet.designSpeedBonus ?? 0) + n * (delta.to.speedMult - delta.from.speedMult) / ships);
    }
}

export interface SplitResult {
    movedCounts: Record<string, number>;
    keptCounts: Record<string, number>;
    /** Power that leaves with the detachment. */
    movedPower: number;
    movedProfile?: DesignProfile;
    keptProfile?: DesignProfile;
}

/**
 * Work out what leaves with a detachment. `composition` is the source roster
 * BEFORE the split and `moved` the hulls being detached.
 *
 * The old split moved designCounts, power and signature by the overall ship
 * ratio, so detaching two battleships from ten corvettes and two battleships
 * took a sixth of the power and a sixth of every design. Here each hull's
 * ships come off that hull's own designs (largest remainder, the unregistered
 * remainder taking its share), power moves by what those ships are rated, and
 * the signature is the moved designs' own.
 */
export function splitRoster(
    src: FleetBooks,
    moved: Record<string, number>,
    lookup: DesignLookup,
): SplitResult {
    const roster = rosterByHull(src, lookup);
    const rating = new Map<string, { power: number; profile: DesignProfile }>();
    const rate = (designId: string) => {
        if (!rating.has(designId)) {
            const design = lookup(designId);
            const summary = design ? summarizeDesign(design, null) : null;
            rating.set(designId, { power: summary?.power ?? 0, profile: summary?.profile ?? emptyProfile() });
        }
        return rating.get(designId)!;
    };

    const movedCounts: Record<string, number> = {};
    let movedWeight = 0;
    let totalWeight = 0;
    const movedProfile = emptyProfile();

    for (const [hullId, hull] of Object.entries(roster.hulls)) {
        const bareWeight = getHull(hullId)?.basePower ?? 0;
        // Buckets of this hull: each design, then the unregistered remainder.
        // An inconsistent hull (books over-claim) is scaled down to what exists.
        const scale = hull.known > hull.total && hull.known > 0 ? hull.total / hull.known : 1;
        const buckets: { designId: string | null; count: number; weight: number }[] =
            Object.entries(hull.byDesign).map(([designId, c]) => ({ designId, count: c * scale, weight: rate(designId).power }));
        buckets.push({ designId: null, count: hull.unregistered, weight: bareWeight });
        for (const b of buckets) totalWeight += b.count * b.weight;

        const take = Math.max(0, Math.min(hull.total, Math.floor(moved[hullId] ?? 0)));
        if (take <= 0 || hull.total <= 0) continue;

        // Largest remainder over the buckets.
        const quotas = buckets.map(b => (take * b.count) / hull.total);
        const alloc = quotas.map(q => Math.floor(q));
        let left = take - alloc.reduce((a, b) => a + b, 0);
        const order = quotas.map((q, i) => ({ i, r: q - Math.floor(q) })).sort((a, b) => b.r - a.r || a.i - b.i);
        for (const { i } of order) {
            if (left <= 0) break;
            if (alloc[i] + 1 <= Math.ceil(buckets[i].count)) { alloc[i] += 1; left -= 1; }
        }
        buckets.forEach((b, i) => {
            const n = alloc[i];
            if (n <= 0) return;
            movedWeight += n * b.weight;
            if (b.designId) {
                movedCounts[b.designId] = (movedCounts[b.designId] ?? 0) + n;
                const p = rate(b.designId).profile;
                for (const key of PROFILE_KEYS) movedProfile[key] += n * (p[key] ?? 0);
            }
        });
    }

    const keptCounts: Record<string, number> = {};
    for (const [designId, raw] of Object.entries(src.designCounts ?? {})) {
        const left = Math.max(0, Math.floor(Number(raw) || 0)) - (movedCounts[designId] ?? 0);
        if (left > 0) keptCounts[designId] = left;
    }

    const srcPower = Math.max(0, src.basePower ?? 0);
    const movedShips = shipCountOf(moved);
    const totalShips = shipCountOf(src.composition ?? {});
    const ratio = totalWeight > 0 ? movedWeight / totalWeight : totalShips > 0 ? movedShips / totalShips : 0.5;
    const movedPower = Math.round(srcPower * Math.max(0, Math.min(1, ratio)));

    if (!src.designProfile) return { movedCounts, keptCounts, movedPower };
    const keptProfile = emptyProfile();
    for (const key of PROFILE_KEYS) {
        const have = Math.max(0, src.designProfile[key] ?? 0);
        movedProfile[key] = Math.min(have, movedProfile[key]);
        keptProfile[key] = have - movedProfile[key];
    }
    return { movedCounts, keptCounts, movedPower, movedProfile, keptProfile };
}
