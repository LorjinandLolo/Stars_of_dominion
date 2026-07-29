// lib/logistics/storage-types.ts
// Phase 1 — Planetary storage. Production is no longer instantly consumable
// empire-wide: goods land in a planet's warehouses first, and warehouses are
// finite. What a planet cannot hold, it wastes.

import type { ResourceBundle } from '../economy/economy-types';

/**
 * Resources that physically occupy warehouse space.
 * `credits` and `research` are deliberately excluded — one is a ledger entry,
 * the other is knowledge in transit. Neither sits on a pallet.
 */
export type StorableResource =
    | 'metals'
    | 'chemicals'
    | 'food'
    | 'energy'
    | 'military'
    | 'luxury'
    | 'cultural'
    | 'rare'
    | 'ammo';

export const STORABLE_RESOURCES: StorableResource[] = [
    'metals', 'chemicals', 'food', 'energy', 'military', 'luxury', 'cultural', 'rare', 'ammo',
];

/**
 * Storage classes. A warehouse building grants capacity to a whole class,
 * not to one resource — a bulk silo holds ore or grain, but neither of them
 * holds antimatter cells.
 */
export type StorageClass = 'bulk' | 'volatile' | 'valuable' | 'ordnance';

export const STORAGE_CLASS_MEMBERS: Record<StorageClass, StorableResource[]> = {
    /** Mass goods moved by the megatonne. */
    bulk: ['metals', 'chemicals', 'food'],
    /** Needs containment: charge cells and propellant. */
    volatile: ['energy', 'ammo'],
    /** High value, low volume; vaulted rather than stacked. */
    valuable: ['rare', 'luxury', 'cultural'],
    /** Finished war materiel. */
    ordnance: ['military'],
};

/** Reverse lookup: which class a resource belongs to. */
export const RESOURCE_STORAGE_CLASS: Record<StorableResource, StorageClass> = (() => {
    const map = {} as Record<StorableResource, StorageClass>;
    for (const [cls, members] of Object.entries(STORAGE_CLASS_MEMBERS)) {
        for (const res of members) map[res] = cls as StorageClass;
    }
    return map;
})();

/** A `storage_capacity` building effect targets either one class or every class. */
export type StorageTarget = StorageClass | 'all';

/**
 * Live storage state for one planet, recomputed every economy tick.
 * Attached to PlanetProduction so the sync payload carries it for free.
 */
export interface PlanetStorageState {
    /** Maximum holdable amount per resource. Absent key = uncapped. */
    capacity: ResourceBundle;
    /** Amount destroyed by overflow on the last tick, per resource. */
    wastedLastTick: ResourceBundle;
    /** Running total wasted since the planet was founded. Pure telemetry. */
    wastedTotal: ResourceBundle;
    /** Fill ratio of the fullest storable resource, 0–1 (can read >1 while draining). */
    peakUtilization: number;
    /** Resources at or above the pressure threshold — the UI's overflow warning. */
    pressuredResources: StorableResource[];
    /**
     * Loading/unloading rating from warehouse tiers. Phase 2 (logistics depots)
     * reads this to decide how fast stores can actually feed industry.
     */
    throughput: number;
}

// ─── Tuning constants ─────────────────────────────────────────────────────────

/**
 * Hours of base-rate production a planet can hold with no warehouses at all.
 * Every colony has some native storage; warehouses are what make it strategic.
 */
export const BASE_COVER_HOURS = 12;

/** Capacity gained per infrastructure level above 1 (better handling, denser stacking). */
export const INFRA_CAPACITY_BONUS_PER_LEVEL = 0.15;

/**
 * Fraction of the *excess* above capacity lost per hour when a planet is already
 * over its limit — a warehouse was bombed out, a save predates this system, or a
 * specialization changed. Excess drains toward the cap instead of vanishing, so
 * losing storage is a crisis to manage rather than an instant confiscation.
 */
export const OVERFLOW_SPOILAGE_PER_HOUR = 0.2;

/** Fill ratio at which a resource is reported as under storage pressure. */
export const STORAGE_PRESSURE_THRESHOLD = 0.95;

/** Effect type emitted by warehouse buildings for capacity. */
export const STORAGE_CAPACITY_EFFECT = 'storage_capacity';

/** Effect type emitted by warehouse buildings for loading/unloading speed. */
export const STORAGE_THROUGHPUT_EFFECT = 'storage_throughput';
