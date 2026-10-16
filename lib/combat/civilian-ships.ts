// lib/combat/civilian-ships.ts
// Stars of Dominion — the four unarmed ships: explorer, freighter, spy ship,
// builder. Pure and client-safe.
//
// They ride in a fleet's `composition` under their own keys, like hulls, but
// they are NOT ship classes (SHIP_CLASS_IDS): no designs, no modules, no
// combat power, and the designer never offers them. A civilian fleet holds
// only civilian ships; it never joins a battle, and an armed enemy at war that
// finds it alone in a system takes it (lib/combat/civilian-service.ts). What
// each one does lives in civilian-service.ts and the hooks it names.

export type CivilianShipId = 'explorer' | 'freighter' | 'spy' | 'builder';

export interface CivilianShipDef {
    id: CivilianShipId;
    name: string;
    /** One line for the shipyard card. */
    role: string;
    /** Faction-reserve keys. */
    cost: Record<string, number>;
    /** Sim seconds (the clock runs 15x real). */
    buildSeconds: number;
    /** Lane speed, on the same scale as HULL_SPEED_FACTORS. */
    speed: number;
}

export const CIVILIAN_SHIPS: Record<CivilianShipId, CivilianShipDef> = {
    explorer: {
        id: 'explorer',
        name: 'Exploration Ship',
        role: 'Fast and unarmed. Scans and surveys twice as fast, from up to two jumps away.',
        cost: { CREDITS: 300, METALS: 100 },
        buildSeconds: 2 * 60 * 15, // 2 real minutes
        speed: 1.5,
    },
    freighter: {
        id: 'freighter',
        name: 'Freighter',
        role: 'Docked at your world: +5% of its taxes. On a route between two of your worlds: carries goods and pays a cut. At a trade partner’s world: earns credits for both of you.',
        cost: { CREDITS: 1500, METALS: 600 },
        buildSeconds: 6 * 60 * 15,
        speed: 1.0,
    },
    spy: {
        id: 'spy',
        name: 'Spy Ship',
        role: 'Shows every fleet in its system and one jump around. Your spy network there grows 50% faster, and operations there are harder to trace. Can be caught in foreign space.',
        cost: { CREDITS: 2500, METALS: 400 },
        buildSeconds: 10 * 60 * 15,
        speed: 1.3,
    },
    builder: {
        id: 'builder',
        name: 'Builder Ship',
        role: 'Docked at your world: one more building site (up to two ships) and orbital work 25% faster. Or spend it to plant an outpost on an empty world.',
        cost: { CREDITS: 2000, METALS: 1200 },
        buildSeconds: 8 * 60 * 15,
        speed: 0.8,
    },
};

export const CIVILIAN_SHIP_IDS: readonly CivilianShipId[] = ['explorer', 'freighter', 'spy', 'builder'];

export function isCivilianShip(key: unknown): key is CivilianShipId {
    return typeof key === 'string' && key.toLowerCase() in CIVILIAN_SHIPS;
}

type CompositionLike = Record<string, number | undefined> | null | undefined;

/** How many of one civilian type a composition carries. */
export function civilianCount(composition: CompositionLike, id: CivilianShipId): number {
    let n = 0;
    for (const [key, count] of Object.entries(composition ?? {})) {
        if (key.toLowerCase() === id) n += Math.max(0, Number(count) || 0);
    }
    return n;
}

/**
 * A civilian fleet: has ships, and every one of them is civilian. A fleet with
 * any warship aboard is a warship fleet and fights as one.
 */
export function isCivilianFleet(fleet: { composition?: CompositionLike } | null | undefined): boolean {
    let any = false;
    for (const [key, count] of Object.entries(fleet?.composition ?? {})) {
        if (!(Number(count) > 0)) continue;
        if (!isCivilianShip(key)) return false;
        any = true;
    }
    return any;
}

/** Freighters docked at one world that count toward its taxes. */
export const FREIGHTER_DOCK_MAX = 3;
/** Tax bonus per docked freighter. */
export const FREIGHTER_TAX_BONUS = 0.05;
/** Builder ships at one world that count toward building sites. */
export const BUILDER_DOCK_MAX = 2;
/** Orbital construction time with a builder docked. */
export const BUILDER_ORBITAL_TIME_FACTOR = 0.75;
/** Cost of planting an outpost with a builder (the ship is spent too). */
export const OUTPOST_COST: Record<string, number> = { CREDITS: 2000 };
/** Explorer: exploration time multiplier and scan/survey reach in jumps. */
export const EXPLORER_TIME_FACTOR = 0.5;
export const EXPLORER_REACH = 2;
/** Spy ship: network growth multiplier and the share of trace chance left. */
export const SPY_NETWORK_GROWTH = 1.5;
export const SPY_TRACE_FACTOR = 0.6;
/** Spy ship: chance per strategic cycle of being caught in a foreign empire's system. */
export const SPY_CATCH_CHANCE = 0.04;
/** Freighter at a trade partner's world: credits per cycle to owner and host. */
export const FOREIGN_TRADE_CREDITS = { owner: 250, host: 125 };
/** Freighter on a route: units carried per freighter, and credits paid per unit delivered. */
export const ROUTE_CARGO_PER_FREIGHTER = 400;
export const ROUTE_CREDITS_PER_UNIT = 0.5;

/** What docked civilian ships do for a world; the worker refreshes it every cycle. */
export interface DockedCivilians {
    freighters: number;
    builders: number;
}

type FleetLike = { factionId: string; currentSystemId: string | null; destinationSystemId?: string | null; composition?: CompositionLike };

/** Whether factionId has one of this civilian type parked in systemId. */
export function hasParkedCivilian(fleets: Iterable<FleetLike>, factionId: string, systemId: string, id: CivilianShipId): boolean {
    for (const f of fleets) {
        if (f.factionId === factionId && f.currentSystemId === systemId && !f.destinationSystemId && civilianCount(f.composition, id) > 0) return true;
    }
    return false;
}

/**
 * Systems a fleet parked in fromSystemId can scan or survey: its own, one
 * hyperlane out, and a second hop when it carries an exploration ship. The
 * worker's EXPLORE_ISSUE_ORDER check is the same rule.
 */
export function scanReachFrom(
    fromSystemId: string,
    composition: CompositionLike,
    neighborsOf: (systemId: string) => readonly string[] | undefined,
): Set<string> {
    const out = new Set<string>([fromSystemId]);
    const first = neighborsOf(fromSystemId) ?? [];
    for (const n of first) out.add(n);
    if (civilianCount(composition, 'explorer') > 0) {
        for (const n of first) for (const m of neighborsOf(n) ?? []) out.add(m);
    }
    return out;
}
