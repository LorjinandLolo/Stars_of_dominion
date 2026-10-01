// lib/breakaway/breakaway-rules.ts
// Stars of Dominion — late joiners and comebacks through breakaway states
// (casual-play spec Item 7; the agreed rules are recorded under "Item 7 design
// decisions" in docs/casual-play-build-spec.md).
//
// Pure. Who may take a breakaway state, which ones there are, and where the
// game raises a new one when there are none — all decided over a world the
// caller already holds. No database, no mutation: breakaway-service.ts does the
// world changes, seat-service.ts the claim row.

import { LOBBY_FACTIONS } from '@/data/factions/lobby-factions';

/** Breakaway states are named `rebel-faction-<systemId>` (lib/combat/secession-service.ts). */
export const BREAKAWAY_PREFIX = 'rebel-faction-';

export function isBreakawayFactionId(id: unknown): boolean {
    return typeof id === 'string' && id.startsWith(BREAKAWAY_PREFIX);
}

export interface BreakawaySummary {
    factionId: string;
    name: string;
    parentFactionId: string;
    parentName: string;
    worlds: number;
    capitalSystemId: string | null;
    foundedAtSeconds: number;
}

function mapValues<T>(source: any): T[] {
    if (!source) return [];
    if (typeof source.values === 'function') return Array.from(source.values());
    return Object.values(source) as T[];
}

function mapGet(source: any, key: string): any {
    if (!source) return undefined;
    if (typeof source.get === 'function') return source.get(key);
    return source[key];
}

/** Display name for an empire, from what the world knows. */
export function empireName(world: any, factionId: string): string {
    return world?.factionNames?.[factionId]
        ?? mapGet(world?.economy?.factions, factionId)?.name
        ?? LOBBY_FACTIONS.find(f => f.id === factionId)?.name
        ?? factionId;
}

/**
 * Every breakaway state that exists and still holds at least one world. Works
 * on a live world (Maps) and on a parsed snapshot that has lost its economy
 * records (the web routes read the shared snapshot, where `factionNames` and
 * planet ownership survive).
 */
export function listBreakaways(world: any): BreakawaySummary[] {
    const worldsBy = new Map<string, number>();
    for (const planet of mapValues<any>(world?.construction?.planets)) {
        if (planet?.ownerId) worldsBy.set(planet.ownerId, (worldsBy.get(planet.ownerId) ?? 0) + 1);
    }
    const out: BreakawaySummary[] = [];
    const seen = new Set<string>();
    for (const crisis of mapValues<any>(world?.secessionCrises)) {
        const id = crisis?.rebelFactionId;
        if (!isBreakawayFactionId(id) || seen.has(id)) continue;
        const worlds = worldsBy.get(id) ?? 0;
        if (worlds === 0) continue; // never founded, or already reconquered
        seen.add(id);
        const economy = mapGet(world?.economy?.factions, id);
        out.push({
            factionId: id,
            name: empireName(world, id),
            parentFactionId: crisis.factionId,
            parentName: empireName(world, crisis.factionId),
            worlds,
            capitalSystemId: economy?.capitalSystemId ?? crisis.systemIds?.[0] ?? null,
            foundedAtSeconds: Number(crisis.escalatedAtSeconds ?? crisis.resolvedAtSeconds ?? crisis.openedAtSeconds ?? 0),
        });
    }
    return out.sort((a, b) => b.foundedAtSeconds - a.foundedAtSeconds || a.factionId.localeCompare(b.factionId));
}

// ─── Who may take one ─────────────────────────────────────────────────────────

export type SeatReason = 'late_joiner' | 'eliminated';
export type SeatRefusal = 'seats_open' | 'still_playing' | 'not_signed_in';

export interface SeatCheck {
    /** The caller's current claim, if any. */
    claimedFactionId: string | null;
    /** DefeatManager's latched status for that claim ('ALIVE' when unknown). */
    defeatStatus: 'ALIVE' | 'DYING' | 'ELIMINATED' | string | null;
    /** How many of the fourteen lobby empires nobody holds. */
    freeLobbySeats: number;
}

/**
 * A breakaway is for two people only (decisions 1 and 4): someone who arrives
 * after every empire is taken, and someone whose empire was destroyed. Anyone
 * with a living empire, or with a free empire still on offer, plays that.
 */
export function seatEligibility(check: SeatCheck): { eligible: true; reason: SeatReason } | { eligible: false; refusal: SeatRefusal } {
    if (check.claimedFactionId) {
        return check.defeatStatus === 'ELIMINATED'
            ? { eligible: true, reason: 'eliminated' }
            : { eligible: false, refusal: 'still_playing' };
    }
    if (check.freeLobbySeats > 0) return { eligible: false, refusal: 'seats_open' };
    return { eligible: true, reason: 'late_joiner' };
}

export const SEAT_REFUSALS: Record<SeatRefusal, string> = {
    seats_open: 'There are still empires nobody leads. Pick one in the lobby — breakaway states are for when every seat is taken.',
    still_playing: 'Your empire is still standing. A breakaway state is for a player whose empire has fallen.',
    not_signed_in: 'Sign in first.',
};

/** Free lobby seats, given the factions that are claimed. */
export function freeLobbySeats(claimedFactionIds: Iterable<string>): number {
    const taken = new Set(claimedFactionIds);
    return LOBBY_FACTIONS.filter(f => !taken.has(f.id)).length;
}

// ─── Where the game raises one ────────────────────────────────────────────────

/** Fewest worlds a parent keeps: a breakaway never takes an empire's last world, or its capital. */
const MIN_PARENT_WORLDS_AFTER = 1;
const MAX_WORLDS = 3;
/** How far from the parent's capital a frontier rising may stand. */
const FRONTIER_MIN_JUMPS = 2;
const FRONTIER_MAX_JUMPS = 5;

export interface UprisingSite {
    parentFactionId: string;
    /** 'carve': worlds the parent already owns. 'frontier': unsettled worlds the parent claims on paper. */
    kind: 'carve' | 'frontier';
    /** System the new state is named after and governed from. */
    systemId: string;
    /** For 'carve', the planets to take. For 'frontier', empty — the bodies are charted when it rises. */
    planetIds: string[];
    /** Jumps from `near` (the host's capital for an invite), when one was given. */
    jumpsFromNear: number | null;
}

function hopsFrom(world: any, fromSystemId: string | null | undefined): Map<string, number> {
    const hops = new Map<string, number>();
    if (!fromSystemId) return hops;
    const systems = world?.movement?.systems;
    hops.set(fromSystemId, 0);
    const queue = [fromSystemId];
    while (queue.length) {
        const current = queue.shift()!;
        for (const next of mapGet(systems, current)?.hyperlaneNeighbors ?? []) {
            if (hops.has(next)) continue;
            hops.set(next, hops.get(current)! + 1);
            queue.push(next);
        }
    }
    return hops;
}

/**
 * Where to raise a breakaway nobody has made yet (decision 1). AI-run empires
 * are preferred as parents. But a late joiner only exists once all fourteen
 * empires have players, so then the parent is a human — which is the story the
 * owner asked for (decision 3): the player whose province broke away has to
 * win it back while holding the rest of the empire together.
 *
 * - With worlds to spare, the parent loses its 1–3 outermost non-capital
 *   worlds ('carve').
 * - Early in a season every empire holds one world, so the rising instead
 *   claims an unsettled system 2–5 jumps from the parent's capital that no
 *   empire lives in ('frontier').
 *
 * `nearSystemId` (an invite: the host's capital) makes the nearest site win;
 * otherwise the largest AI empire is the parent — it can most afford it.
 */
export function rankUprisingSites(world: any, options: { nearSystemId?: string | null; humanFactionIds: Iterable<string> }): UprisingSite[] {
    const humans = new Set(options.humanFactionIds);
    const near = hopsFrom(world, options.nearSystemId);
    const planets = mapValues<any>(world?.construction?.planets);

    const parents = mapValues<any>(world?.economy?.factions)
        .filter(f => f?.id && f.capitalSystemId && !isBreakawayFactionId(f.id) && LOBBY_FACTIONS.some(l => l.id === f.id));
    if (parents.length === 0) return [];

    const occupiedSystems = new Set(planets.filter(p => p?.ownerId).map(p => p.systemId));
    const candidates: Array<UprisingSite & { score: number }> = [];

    for (const parent of parents) {
        const fromCapital = hopsFrom(world, parent.capitalSystemId);
        const owned = planets.filter(p => p?.ownerId === parent.id);
        const spare = owned
            .filter(p => p.systemId !== parent.capitalSystemId)
            .sort((a, b) => (fromCapital.get(b.systemId) ?? 0) - (fromCapital.get(a.systemId) ?? 0) || a.id.localeCompare(b.id));
        const canGive = Math.min(MAX_WORLDS, spare.length, owned.length - MIN_PARENT_WORLDS_AFTER);

        if (canGive >= 1) {
            // The outermost world, and up to two more of the parent's in that
            // system or next door — a rising is a region, not a scatter.
            const seed = spare[0];
            const neighbours = new Set([seed.systemId, ...(mapGet(world?.movement?.systems, seed.systemId)?.hyperlaneNeighbors ?? [])]);
            const taken = spare.filter(p => neighbours.has(p.systemId)).slice(0, canGive);
            const jumps = near.get(seed.systemId) ?? null;
            candidates.push({
                parentFactionId: parent.id, kind: 'carve', systemId: seed.systemId,
                planetIds: taken.map(p => p.id), jumpsFromNear: jumps,
                score: options.nearSystemId ? (jumps ?? 10_000) : -owned.length,
            });
            continue;
        }

        // Frontier: the nearest empty system in the 2–5 jump ring, ties by id.
        const ring = [...fromCapital.entries()]
            .filter(([systemId, d]) => d >= FRONTIER_MIN_JUMPS && d <= FRONTIER_MAX_JUMPS && !occupiedSystems.has(systemId))
            .filter(([systemId]) => !parents.some(p => p.capitalSystemId === systemId))
            .sort((a, b) => {
                if (options.nearSystemId) return (near.get(a[0]) ?? 10_000) - (near.get(b[0]) ?? 10_000) || a[0].localeCompare(b[0]);
                return a[1] - b[1] || a[0].localeCompare(b[0]);
            });
        for (const [systemId] of ring.slice(0, 12)) {
            const jumps = near.get(systemId) ?? null;
            candidates.push({
                parentFactionId: parent.id, kind: 'frontier', systemId, planetIds: [], jumpsFromNear: jumps,
                // Frontier sites rank after carve sites of the same distance.
                score: (options.nearSystemId ? (jumps ?? 10_000) : 0) + 0.5,
            });
        }
    }

    // Any AI parent beats every human one.
    for (const c of candidates) if (humans.has(c.parentFactionId)) c.score += 1_000_000;
    candidates.sort((a, b) => a.score - b.score || a.parentFactionId.localeCompare(b.parentFactionId) || a.systemId.localeCompare(b.systemId));
    return candidates.map(({ score: _score, ...site }) => site);
}

/**
 * The best site. A frontier site can still turn out empty when its bodies are
 * charted, so the service walks `rankUprisingSites` and takes the first that
 * yields a colonizable world; this is the answer when the first one does.
 */
export function pickUprisingSite(world: any, options: { nearSystemId?: string | null; humanFactionIds: Iterable<string> }): UprisingSite | null {
    return rankUprisingSites(world, options)[0] ?? null;
}
