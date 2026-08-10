// lib/tech/history-ledger.ts
// Stars of Dominion — the per-faction record of what a civilization has done.
//
// Emergent technology treats conduct as a research programme: an empire that has
// fought three defensive wars has, in practice, developed a defensive doctrine
// whether or not anyone queued the research. The ledger is what those triggers
// read.
//
// Deliberately not an event bus. The systems that already resolve these events
// call bumpMetric inline — one line at the source — and step4b_emergentTech
// recomputes the gauges and streaks that are cheaper to derive than to track.
//
// Persistence: world.techHistory is a plain Map of plain records, so the generic
// mapsToRecords/recordsToMaps pass in save-service carries it with no special
// handling. Never put class instances, Maps, or Sets inside a ledger.

export interface FactionHistoryLedger {
    factionId: string;
    /** Lifetime totals, incremented at the event sources. */
    counters: Record<string, number>;
    /** Point-in-time values, recomputed each tick by step4b. */
    gauges: Record<string, number>;
    /** Consecutive-tick runs, maintained by step4b. */
    streaks: Record<string, number>;
    /** Triggers that have already fired, so a reveal happens once. */
    firedTriggerIds: string[];
}

interface HistoryBearingWorld {
    techHistory?: Map<string, FactionHistoryLedger>;
}

export function emptyLedger(factionId: string): FactionHistoryLedger {
    return { factionId, counters: {}, gauges: {}, streaks: {}, firedTriggerIds: [] };
}

/**
 * Fetch (or create) a faction's ledger.
 *
 * Tolerates a missing techHistory map so worlds deserialized from snapshots
 * written before this field existed keep working — the map is created on first
 * write and rides the next save.
 */
export function getLedger(world: HistoryBearingWorld, factionId: string): FactionHistoryLedger {
    if (!world.techHistory) world.techHistory = new Map();
    let ledger = world.techHistory.get(factionId);
    if (!ledger) {
        ledger = emptyLedger(factionId);
        world.techHistory.set(factionId, ledger);
    }
    // Snapshots from an older shape may be missing a bucket.
    if (!ledger.counters) ledger.counters = {};
    if (!ledger.gauges) ledger.gauges = {};
    if (!ledger.streaks) ledger.streaks = {};
    if (!ledger.firedTriggerIds) ledger.firedTriggerIds = [];
    return ledger;
}

/** Increment a lifetime counter. Called at the event source. */
export function bumpMetric(world: HistoryBearingWorld, factionId: string, metric: string, n = 1): void {
    if (!factionId) return;
    const ledger = getLedger(world, factionId);
    ledger.counters[metric] = (ledger.counters[metric] ?? 0) + n;
}

/** Set a point-in-time gauge. Called from step4b. */
export function setGauge(world: HistoryBearingWorld, factionId: string, metric: string, value: number): void {
    if (!factionId) return;
    getLedger(world, factionId).gauges[metric] = value;
}

/**
 * Advance a streak if the condition held this tick, otherwise reset it to zero.
 * Returns the new value.
 */
export function updateStreak(
    world: HistoryBearingWorld,
    factionId: string,
    metric: string,
    heldThisTick: boolean,
): number {
    const ledger = getLedger(world, factionId);
    ledger.streaks[metric] = heldThisTick ? (ledger.streaks[metric] ?? 0) + 1 : 0;
    return ledger.streaks[metric];
}

/**
 * Read any metric by name, whichever bucket holds it. Triggers reference metrics
 * by a single flat name and should not care how the value is maintained.
 */
export function getMetric(world: HistoryBearingWorld, factionId: string, metric: string): number {
    const ledger = world.techHistory?.get(factionId);
    if (!ledger) return 0;
    return ledger.counters?.[metric]
        ?? ledger.gauges?.[metric]
        ?? ledger.streaks?.[metric]
        ?? 0;
}
