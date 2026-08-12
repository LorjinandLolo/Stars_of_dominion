// lib/piracy/base-service.ts
// Pirate system Phase 3 — the base network.
//
// Design: docs/pirate-system/bases.md.
//
// Bases are what turn a raiding party into an organization: repair, resupply,
// recruitment, storage, intelligence and concealment, with no single kind
// providing all six. That is the whole point — destroying one base removes some
// capabilities and not others, so ending an organization means dismantling a
// network rather than winning a battle.

import type { GameWorldState } from '../game-world-state';
import type { Corridor, SystemNode } from '../movement/types';
import { RNG, seedFromString } from '../trade-system/rng';
import {
    activeOrganizations,
    ensurePiracyState,
    PIRATE_FACTION_ID,
} from './organization-service';
import type {
    PirateBase,
    PirateBaseKind,
    PirateDoctrine,
    PirateOrganization,
} from './piracy-types';

// ─── Catalog ─────────────────────────────────────────────────────────────────

export interface BaseKindSpec {
    kind: PirateBaseKind;
    label: string;
    /** Credits. */
    cost: number;
    /** Seconds of construction before the base does anything. */
    buildSeconds: number;
    /** Fleets it can repair and support. */
    berths: number;
    /** Starting concealment 0–1. */
    concealment: number;
    /** 0–1 strength of the repair it offers raiders parked here. */
    repair: number;
    /** Loot it can hold. */
    storage: number;
    /** 0–1 contribution to what the organization knows. */
    intel: number;
    /** True when the kind is a visible installation once anyone looks. */
    tagsSystemAsStation: boolean;
}

/**
 * Capability mix per kind — the table in bases.md §2 turned into numbers. A
 * network of one shipyard, two hideouts and a safe house behaves nothing like a
 * network of three smuggler ports: the first replaces losses, the second cannot
 * fight but is very hard to starve.
 */
export const BASE_KINDS: Record<PirateBaseKind, BaseKindSpec> = {
    hideout: {
        kind: 'hideout', label: 'Hideout',
        cost: 2_000, buildSeconds: 6 * 3600, berths: 1, concealment: 0.9,
        repair: 0.03, storage: 5_000, intel: 0, tagsSystemAsStation: false,
    },
    derelict_station: {
        kind: 'derelict_station', label: 'Derelict Station',
        cost: 8_000, buildSeconds: 18 * 3600, berths: 3, concealment: 0.6,
        repair: 0.08, storage: 15_000, intel: 0.1, tagsSystemAsStation: true,
    },
    frontier_port: {
        kind: 'frontier_port', label: 'Frontier Port',
        cost: 12_000, buildSeconds: 12 * 3600, berths: 3, concealment: 0.25,
        repair: 0.08, storage: 15_000, intel: 0.3, tagsSystemAsStation: true,
    },
    secret_shipyard: {
        kind: 'secret_shipyard', label: 'Secret Shipyard',
        cost: 40_000, buildSeconds: 48 * 3600, berths: 4, concealment: 0.5,
        repair: 0.15, storage: 8_000, intel: 0, tagsSystemAsStation: true,
    },
    smuggler_port: {
        kind: 'smuggler_port', label: 'Smuggler Port',
        cost: 18_000, buildSeconds: 24 * 3600, berths: 2, concealment: 0.6,
        repair: 0.03, storage: 40_000, intel: 0.2, tagsSystemAsStation: true,
    },
    underground_market: {
        kind: 'underground_market', label: 'Underground Market',
        cost: 15_000, buildSeconds: 24 * 3600, berths: 0, concealment: 0.6,
        repair: 0, storage: 20_000, intel: 0.3, tagsSystemAsStation: false,
    },
    safe_house: {
        kind: 'safe_house', label: 'Safe House',
        cost: 6_000, buildSeconds: 12 * 3600, berths: 0, concealment: 0.9,
        repair: 0, storage: 2_000, intel: 0.9, tagsSystemAsStation: false,
    },
    hidden_lane: {
        kind: 'hidden_lane', label: 'Hidden Lane',
        cost: 22_000, buildSeconds: 36 * 3600, berths: 0, concealment: 0.9,
        repair: 0, storage: 0, intel: 0.1, tagsSystemAsStation: false,
    },
};

/** What each wing spends loot on first (docs/pirate-system/emergence.md §3). */
const DOCTRINE_PRIORITY: Record<PirateDoctrine, PirateBaseKind[]> = {
    raider: ['hideout', 'secret_shipyard', 'derelict_station', 'frontier_port'],
    smuggler: ['smuggler_port', 'hidden_lane', 'underground_market', 'hideout'],
    corsair: ['safe_house', 'frontier_port', 'hideout', 'derelict_station'],
    merchant: ['underground_market', 'smuggler_port', 'frontier_port', 'hideout'],
    traditionalist: ['hideout', 'derelict_station', 'hidden_lane', 'secret_shipyard'],
};

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** Concealment lost per hour while the organization is actively raiding. */
const CONCEALMENT_USE_DECAY_PER_HOUR = 0.02;
/** Concealment recovered per hour while lying low. */
const CONCEALMENT_REST_RECOVERY_PER_HOUR = 0.01;
/** Seconds since the last raid before a base counts as idle. */
const IDLE_WINDOW_SECONDS = 6 * 3600;

/** Base chance per hour that a hostile fleet in-system finds a totally exposed base. */
const SENSOR_DISCOVERY_PER_HOUR = 0.25;
/** The owning government's standing chance of stumbling onto one. */
const OWNER_DISCOVERY_PER_HOUR = 0.02;

/** Share of an organization's bases that must be known before a rollup works. */
export const ROLLUP_THRESHOLD = 0.6;

/** Upkeep per berth per hour. A network costs money to keep. */
const UPKEEP_PER_BERTH_PER_HOUR = 12;

/** Tags that mark a system as holding something worth reactivating. */
const DERELICT_TAGS = new Set(['ruins', 'derelict', 'abandoned', 'station', 'wreck']);

// ─── Placement ───────────────────────────────────────────────────────────────

function hopsWithin(world: GameWorldState, fromId: string, maxHops: number): Set<string> {
    const seen = new Set<string>([fromId]);
    let frontier = [fromId];
    for (let depth = 0; depth < maxHops; depth++) {
        const next: string[] = [];
        for (const id of frontier) {
            for (const neighbour of world.movement.systems.get(id)?.hyperlaneNeighbors ?? []) {
                if (seen.has(neighbour)) continue;
                seen.add(neighbour);
                next.push(neighbour);
            }
        }
        if (next.length === 0) break;
        frontier = next;
    }
    return seen;
}

function nearActiveRoute(world: GameWorldState, systemId: string, maxHops: number): boolean {
    const routes = world.economy?.tradeRoutes;
    if (!(routes instanceof Map) || routes.size === 0) return false;
    const reach = hopsWithin(world, systemId, maxHops);
    for (const route of routes.values()) {
        if ((route.path ?? []).some(id => reach.has(id))) return true;
    }
    return false;
}

/** A system two hops away that is NOT a direct neighbour — the shortcut to sell. */
function findLaneEndpoint(world: GameWorldState, fromId: string): string | null {
    const from = world.movement.systems.get(fromId);
    if (!from) return null;
    const direct = new Set(from.hyperlaneNeighbors ?? []);
    const candidates = [...hopsWithin(world, fromId, 2)]
        .filter(id => id !== fromId && !direct.has(id))
        .sort();
    return candidates[0] ?? null;
}

export interface PlacementCheck {
    ok: boolean;
    reason?: string;
}

/**
 * Whether this kind of base can exist here at all. Several of these are
 * conditions the system's owner can remove by governing better — which is the
 * point: administrative fixes are real counter-piracy.
 */
export function canEstablishBase(
    world: GameWorldState,
    org: PirateOrganization,
    kind: PirateBaseKind,
    systemId: string
): PlacementCheck {
    const sys = world.movement.systems.get(systemId);
    if (!sys) return { ok: false, reason: 'no such system' };

    const piracy = ensurePiracyState(world);
    const alreadyHere = [...piracy.bases.values()]
        .some(b => b.organizationId === org.id && b.systemId === systemId && b.kind === kind);
    if (alreadyHere) return { ok: false, reason: 'already holds one here' };

    const lawlessness = sys.lawlessness ?? 0;
    const security = sys.security ?? 50;
    const gov = sys.ownerFactionId ? world.government?.get(sys.ownerFactionId) : undefined;

    switch (kind) {
        case 'hideout':
            return lawlessness >= 20 || !sys.ownerFactionId
                ? { ok: true }
                : { ok: false, reason: 'ground too orderly' };
        case 'derelict_station':
            return sys.tags?.some(tag => DERELICT_TAGS.has(tag))
                ? { ok: true }
                : { ok: false, reason: 'nothing here to reactivate' };
        case 'frontier_port':
            if (!sys.ownerFactionId) return { ok: false, reason: 'needs a settlement to look away' };
            return security < 35 || (gov?.corruption ?? 0) >= 60
                ? { ok: true }
                : { ok: false, reason: 'the port is honestly run' };
        case 'secret_shipyard':
            if (lawlessness < 60) return { ok: false, reason: 'too exposed to build openly' };
            return org.baseIds.length >= 2
                ? { ok: true }
                : { ok: false, reason: 'needs an existing network' };
        case 'smuggler_port':
            return nearActiveRoute(world, systemId, 2)
                ? { ok: true }
                : { ok: false, reason: 'no commerce within reach' };
        case 'underground_market': {
            const hasPopulation = [...(world.movement.planets?.values() ?? [])]
                .some(p => p.systemId === systemId);
            return hasPopulation ? { ok: true } : { ok: false, reason: 'nobody here to trade with' };
        }
        case 'safe_house':
            if (!sys.ownerFactionId) return { ok: false, reason: 'nothing to hide inside' };
            if (org.stage < 3) return { ok: false, reason: 'no contacts that deep' };
            return org.relations[sys.ownerFactionId]
                ? { ok: true }
                : { ok: false, reason: 'no contact in this territory' };
        case 'hidden_lane':
            return findLaneEndpoint(world, systemId)
                ? { ok: true }
                : { ok: false, reason: 'no unmapped shortcut here' };
    }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * A hidden lane is carried by a Corridor restricted to its owner: the movement
 * graph already treats corridor membership as traversable, so restricting one
 * gives the organization an edge nobody else can use — which is why hunting
 * pirates with conventional patrol geometry fails.
 */
function createHiddenLaneCorridor(
    world: GameWorldState,
    org: PirateOrganization,
    fromId: string,
    toId: string
): Corridor {
    const corridor: Corridor = {
        id: `corr-hidden-${org.id}-${fromId}-${toId}`,
        name: 'Unmarked Run',
        nodeIds: [fromId, toId],
        chokepointIds: [],
        militarizationLevel: 0,
        denialFieldActive: false,
        restrictedToOrgId: org.id,
    };
    world.movement.corridors.set(corridor.id, corridor);
    return corridor;
}

export function establishBase(
    world: GameWorldState,
    org: PirateOrganization,
    kind: PirateBaseKind,
    systemId: string,
    /**
     * `free` skips the cost and the placement check — for infrastructure
     * somebody ELSE paid to have built here, which the band simply inherits.
     */
    options: { free?: boolean } = {}
): PirateBase | null {
    if (!options.free && !canEstablishBase(world, org, kind, systemId).ok) return null;

    const spec = BASE_KINDS[kind];
    if (!options.free && org.treasury < spec.cost) return null;

    const piracy = ensurePiracyState(world);
    const base: PirateBase = {
        id: `pbase-${org.id}-${kind}-${systemId}`,
        organizationId: org.id,
        kind,
        systemId,
        concealment: spec.concealment,
        integrity: 1,
        berths: spec.berths,
        storedLoot: 0,
        knownToFactionIds: [],
        establishedAtSeconds: world.nowSeconds,
        readyAtSeconds: world.nowSeconds + spec.buildSeconds,
    };

    if (kind === 'hidden_lane') {
        const endpoint = findLaneEndpoint(world, systemId);
        if (!endpoint) return null;
        base.laneEndpoints = [systemId, endpoint];
        base.corridorId = createHiddenLaneCorridor(world, org, systemId, endpoint).id;
    }
    if (kind === 'underground_market' || kind === 'safe_house') {
        base.planetId = [...(world.movement.planets?.values() ?? [])]
            .find(p => p.systemId === systemId)?.id;
    }

    if (!options.free) org.treasury -= spec.cost;
    org.baseIds.push(base.id);
    piracy.bases.set(base.id, base);
    console.log(`[Piracy] ${org.name} establishes a ${spec.label} at ${systemId}`);
    return base;
}

/** A base is only useful once it is built and still standing. */
export function baseIsOperational(base: PirateBase, world: GameWorldState): boolean {
    return world.nowSeconds >= base.readyAtSeconds && base.integrity > 0;
}

export function basesOf(world: GameWorldState, org: PirateOrganization): PirateBase[] {
    const piracy = ensurePiracyState(world);
    return org.baseIds.map(id => piracy.bases.get(id)).filter((b): b is PirateBase => !!b);
}

export function removeBase(world: GameWorldState, baseId: string, reason: string): void {
    const piracy = ensurePiracyState(world);
    const base = piracy.bases.get(baseId);
    if (!base) return;

    if (base.corridorId) world.movement.corridors.delete(base.corridorId);
    const org = piracy.organizations.get(base.organizationId);
    if (org) org.baseIds = org.baseIds.filter(id => id !== baseId);
    piracy.bases.delete(baseId);
    console.log(`[Piracy] Base ${baseId} ${reason}`);
}

/** A hostile force takes the base: loot is seized, cover is blown. */
export function raidBase(world: GameWorldState, baseId: string, raiderFactionId: string): number {
    const base = ensurePiracyState(world).bases.get(baseId);
    if (!base) return 0;

    const seized = base.storedLoot;
    base.storedLoot = 0;
    base.integrity = Math.max(0, base.integrity - 0.4);
    base.concealment = 0;
    if (!base.knownToFactionIds.includes(raiderFactionId)) base.knownToFactionIds.push(raiderFactionId);

    const reserves = world.economy?.factions?.get(raiderFactionId)?.reserves as Record<string, number> | undefined;
    if (reserves && seized > 0) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + seized;

    if (base.integrity <= 0) {
        const org = ensurePiracyState(world).organizations.get(base.organizationId);
        if (org) org.crewLoyalty = Math.max(0, org.crewLoyalty - 8);
        removeBase(world, baseId, `destroyed by ${raiderFactionId}`);
    }
    return seized;
}

/** Discovery is not destruction: a known base can be watched, or left as bait. */
export function discoverBase(base: PirateBase, factionId: string): void {
    if (!base.knownToFactionIds.includes(factionId)) base.knownToFactionIds.push(factionId);
}

export interface RollupStatus {
    /** 0–1 share of the organization's bases known or compromised. */
    coverage: number;
    knownBaseIds: string[];
    /** True once a coordinated strike can hit the network before it disperses. */
    canRollup: boolean;
}

/**
 * How close a faction is to being able to take a whole network down in one
 * tick. Anything short of this gives the organization time to disperse — and a
 * dispersed band rebuilds elsewhere, on ground where nobody's map is any good.
 */
export function rollupStatus(
    world: GameWorldState,
    org: PirateOrganization,
    factionId: string
): RollupStatus {
    const bases = basesOf(world, org);
    const known = bases.filter(b =>
        b.knownToFactionIds.includes(factionId) || b.compromisedByFactionId === factionId
    );
    const coverage = bases.length === 0 ? 0 : known.length / bases.length;
    return {
        coverage,
        knownBaseIds: known.map(b => b.id),
        canRollup: bases.length > 0 && coverage >= ROLLUP_THRESHOLD,
    };
}

// ─── Acquisition ─────────────────────────────────────────────────────────────

/** Where a band would put its next base: its own water first, then near its ships. */
function candidateSystems(world: GameWorldState, org: PirateOrganization): string[] {
    const seen = new Set<string>([org.homeSystemId]);
    const ordered = [org.homeSystemId];
    for (const fleetId of org.fleetIds) {
        const systemId = world.movement.fleets.get(fleetId)?.currentSystemId;
        if (systemId && !seen.has(systemId)) {
            seen.add(systemId);
            ordered.push(systemId);
        }
    }
    for (const base of basesOf(world, org)) {
        for (const neighbour of world.movement.systems.get(base.systemId)?.hyperlaneNeighbors ?? []) {
            if (!seen.has(neighbour)) {
                seen.add(neighbour);
                ordered.push(neighbour);
            }
        }
    }
    return ordered;
}

/**
 * Loot buys capability. The dominant wing decides what capability: raiders buy
 * ships and somewhere to fix them, smugglers buy throughput, corsairs buy ears
 * inside somebody's capital.
 */
function acquireBase(world: GameWorldState, org: PirateOrganization): void {
    for (const kind of DOCTRINE_PRIORITY[org.doctrine]) {
        if (org.treasury < BASE_KINDS[kind].cost) continue;
        for (const systemId of candidateSystems(world, org)) {
            if (establishBase(world, org, kind, systemId)) return;
        }
    }
}

// ─── Step 11d — the base tick ────────────────────────────────────────────────

/**
 * Upkeep, concealment, discovery, repair, and the purchases an organization
 * makes with what it has stolen.
 */
export function tickPirateBases(world: GameWorldState, deltaSeconds: number): void {
    const piracy = ensurePiracyState(world);
    const hours = Math.max(0, deltaSeconds / 3600);

    // Who is in a position to notice anything, this tick.
    const hostilePresence = new Map<string, Set<string>>();
    for (const fleet of world.movement.fleets.values()) {
        if (fleet.factionId === PIRATE_FACTION_ID || !fleet.currentSystemId) continue;
        const set = hostilePresence.get(fleet.currentSystemId) ?? new Set<string>();
        set.add(fleet.factionId);
        hostilePresence.set(fleet.currentSystemId, set);
    }

    const stationSystems = new Set<string>();

    for (const org of activeOrganizations(world)) {
        const bases = basesOf(world, org);
        const idle = world.nowSeconds - org.lastRaidAtSeconds > IDLE_WINDOW_SECONDS;

        for (const base of bases) {
            if (!baseIsOperational(base, world)) continue;

            // Upkeep. A network that cannot pay for itself is abandoned below.
            org.treasury -= base.berths * UPKEEP_PER_BERTH_PER_HOUR * hours;

            // Cover is spent by using the place and rebuilt by not using it.
            base.concealment += idle
                ? CONCEALMENT_REST_RECOVERY_PER_HOUR * hours
                : -CONCEALMENT_USE_DECAY_PER_HOUR * hours;
            base.concealment = Math.max(0, Math.min(1, base.concealment));

            // Discovery. Partial by design — knowing a base exists is not the
            // same as being able to end it.
            const watchers = hostilePresence.get(base.systemId);
            const sys = world.movement.systems.get(base.systemId);
            const owner = sys?.ownerFactionId;
            const rng = new RNG(seedFromString(`piracy|discover|${base.id}|${world.nowSeconds}`));

            if (watchers) {
                for (const factionId of watchers) {
                    if (base.knownToFactionIds.includes(factionId)) continue;
                    if (rng.check(SENSOR_DISCOVERY_PER_HOUR * (1 - base.concealment) * hours)) {
                        discoverBase(base, factionId);
                        console.log(`[Piracy] ${factionId} locates a ${base.kind} at ${base.systemId}`);
                    }
                }
            }
            if (owner && !base.knownToFactionIds.includes(owner)) {
                if (rng.check(OWNER_DISCOVERY_PER_HOUR * (1 - base.concealment) * hours)) {
                    discoverBase(base, owner);
                }
            }

            // A fully exposed installation is simply visible on the map.
            if (BASE_KINDS[base.kind].tagsSystemAsStation && base.concealment <= 0.05) {
                stationSystems.add(base.systemId);
            }
        }

        // Repair: raiders recover at bases their own organization owns, which is
        // why taking the shipyard makes losses permanent.
        const repairBySystem = new Map<string, number>();
        for (const base of bases) {
            if (!baseIsOperational(base, world)) continue;
            const rate = BASE_KINDS[base.kind].repair;
            if (rate <= 0) continue;
            repairBySystem.set(base.systemId, Math.max(repairBySystem.get(base.systemId) ?? 0, rate));
        }
        for (const fleetId of org.fleetIds) {
            const fleet = world.movement.fleets.get(fleetId);
            if (!fleet?.currentSystemId) continue;
            const rate = repairBySystem.get(fleet.currentSystemId);
            if (rate) fleet.strength = Math.min(1, fleet.strength + rate * hours);
        }

        // Abandonment: nothing left to pay the crews who hold the place.
        if (org.treasury < 0) {
            const doomed = bases
                .filter(b => baseIsOperational(b, world))
                .sort((a, b) => BASE_KINDS[b.kind].cost - BASE_KINDS[a.kind].cost)[0];
            if (doomed) {
                org.treasury += BASE_KINDS[doomed.kind].cost * 0.25;   // stripped for parts
                removeBase(world, doomed.id, 'abandoned — the organization could not pay for it');
            }
        }

        acquireBase(world, org);
    }

    // pirate_station is an ASSET with an owner, unlike the corsair_den CONDITION
    // that the opportunity pass maintains.
    for (const sys of world.movement.systems.values()) {
        const shouldHave = stationSystems.has(sys.id);
        const hasTag = sys.tags.includes('pirate_station');
        if (shouldHave && !hasTag) {
            sys.tags.push('pirate_station');
            console.log(`[Piracy] Pirate station now visible at ${sys.name}`);
        } else if (!shouldHave && hasTag) {
            sys.tags = sys.tags.filter(tag => tag !== 'pirate_station');
        }
    }
}

/** Bases a faction is entitled to see. Used by the sync filter and the UI. */
export function knownBases(world: GameWorldState, factionId: string): PirateBase[] {
    return [...ensurePiracyState(world).bases.values()]
        .filter(b => b.knownToFactionIds.includes(factionId) || b.compromisedByFactionId === factionId);
}

/** Every base in a system, regardless of who knows about it. Engine-side only. */
export function basesInSystem(world: GameWorldState, systemId: string): PirateBase[] {
    return [...ensurePiracyState(world).bases.values()].filter(b => b.systemId === systemId);
}

/** Systems where the given kind exists, for callers that need capability maps. */
export function hasCapability(
    world: GameWorldState,
    org: PirateOrganization,
    kind: PirateBaseKind
): boolean {
    return basesOf(world, org).some(b => b.kind === kind && baseIsOperational(b, world));
}

export function baseSystems(world: GameWorldState, org: PirateOrganization): SystemNode[] {
    return basesOf(world, org)
        .map(b => world.movement.systems.get(b.systemId))
        .filter((s): s is SystemNode => !!s);
}
