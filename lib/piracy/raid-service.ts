// lib/piracy/raid-service.ts
// Pirate system Phase 4 — operations.
//
// Design: docs/pirate-system/operations.md.
//
// Raiding stops being "cargo disappears" and becomes a choice: how hard to
// squeeze (posture) and what kind of violence to use (raid type). Both have
// consequences beyond the cargo — a captured hull flies against its owner, a
// sabotaged segment stays degraded, a destroyed convoy suppresses the whole
// corridor's traffic, and a hostage forces a great power to talk to a gang.

import type { GameWorldState } from '../game-world-state';
import type { Fleet } from '../movement/types';
import { RNG, seedFromString } from '../trade-system/rng';
import {
    derivePiracyFleets,
    tickPiracyInterdiction,
    type PiracyFleet,
    type PiracyPosture,
    type PiracyInterdictionResult,
    type RaiderSnapshot,
} from '../trade-system/piracy-service';
import { Resource, type TradeRoute } from '../trade-system/types';
import {
    activeOrganizations,
    ensurePiracyState,
    recordRaid,
    supportableFleets,
    PIRATE_FACTION_ID,
} from './organization-service';
import { basesOf, baseIsOperational, BASE_KINDS } from './base-service';
import { contractCovering } from './protection-service';
import { sponsoredIntensity } from './sponsorship-service';
import type {
    OperationIntensity,
    PirateDoctrine,
    PirateOrganization,
    RaidType,
} from './piracy-types';

// ─── Raid profiles ───────────────────────────────────────────────────────────

export interface RaidProfile {
    type: RaidType;
    label: string;
    /** Multiplier on the credit value actually taken. */
    profit: number;
    /** Heat added on top of the base per-raid heat. */
    heat: number;
    /** Infamy multiplier. */
    infamy: number;
    /** Minimum stage — a gang cannot take a hostage worth ransoming. */
    minStage: number;
}

/**
 * Destruction is deliberately unprofitable: it exists because it is the only
 * raid that produces fear at scale. Economic raids are the strategic weapon —
 * they convert piracy into siege warfare without a siege.
 */
export const RAID_PROFILES: Record<RaidType, RaidProfile> = {
    robbery:      { type: 'robbery',      label: 'Robbery',       profit: 1.0, heat: 0,   infamy: 1.0, minStage: 1 },
    capture:      { type: 'capture',      label: 'Capture',       profit: 1.3, heat: 1.5, infamy: 1.6, minStage: 2 },
    sabotage:     { type: 'sabotage',     label: 'Sabotage',      profit: 0.1, heat: 0.5, infamy: 0.8, minStage: 1 },
    hostage:      { type: 'hostage',      label: 'Hostage-taking',profit: 0.4, heat: 4.0, infamy: 2.5, minStage: 3 },
    destruction:  { type: 'destruction',  label: 'Destruction',   profit: 0,   heat: 6.0, infamy: 3.0, minStage: 2 },
    economicRaid: { type: 'economicRaid', label: 'Economic Raid', profit: 0.9, heat: 3.0, infamy: 1.4, minStage: 2 },
};

/**
 * What each wing reaches for, most-preferred first. Hostage-taking belongs to
 * the wings that want to be TALKED to — it is how a band forces a great power
 * to the table — and to the raiders, who simply like the leverage.
 */
const DOCTRINE_RAIDS: Record<PirateDoctrine, RaidType[]> = {
    raider: ['capture', 'destruction', 'robbery', 'hostage', 'economicRaid'],
    smuggler: ['robbery', 'sabotage'],
    corsair: ['hostage', 'economicRaid', 'capture', 'robbery'],
    merchant: ['robbery', 'sabotage'],
    traditionalist: ['robbery', 'capture'],
};

/** Preference weights by rank in the doctrine list. Extra ranks share the tail. */
const PREFERENCE_WEIGHTS = [0.45, 0.25, 0.15, 0.10, 0.05];

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** Heat above which even the raider wing starts to prefer a quiet skim. */
const HEAT_CAUTION = 55;
/** Heat above which a band stops choosing anything that makes headlines. */
const HEAT_PANIC = 75;

/** Interdiction odds multiplier when raiding from a chokepoint or hidden lane. */
const AMBUSH_BONUS = 1.4;
/** Escort levels convert to defence at this rate in the success roll. */
const ESCORT_DEFENCE = 0.09;
/** Non-pirate strength parked on the camp converts to defence at this rate. */
const GARRISON_DEFENCE = 0.35;

/** Terror added to a route by one destruction raid, and how fast it fades. */
const TERROR_PER_DESTRUCTION = 0.18;
const TERROR_DECAY_PER_HOUR = 0.02;
const TERROR_MAX = 0.6;

/** Integrity a sabotage raid strips from a trade segment. */
const SABOTAGE_INTEGRITY_LOSS = 0.25;

/** A captured hull arrives at this fraction of a raider's strength. */
const CAPTURED_HULL_STRENGTH = 0.45;

/** Ransom, as a multiple of the raid's credit value. */
const RANSOM_MULTIPLIER = 6;
const HOSTAGE_WINDOW_SECONDS = 72 * 3600;

/** Share of the treasury a band puts somewhere safe when it has storage. */
const BANKED_SHARE = 0.2;

// ─── Posture ─────────────────────────────────────────────────────────────────

/**
 * How hard to squeeze. A band that is being hunted eases off; a raider wing
 * with nothing to lose leans on the throat. Strangling is self-defeating and
 * the AI knows it — it is reserved for bands whose crews demand blood.
 */
export function choosePosture(
    org: PirateOrganization,
    route: TradeRoute,
    /**
     * What a sponsor is paying for, if anyone is. A band paid to blockade a
     * rival strangles the lane whatever its own wings would have preferred —
     * and takes the heat that comes with it.
     */
    sponsored?: OperationIntensity | null
): PiracyPosture {
    if (sponsored === 'blockade') return 'strangle';
    if (sponsored === 'economicDisruption') return 'prey';
    if (sponsored === 'harassment') return 'skim';

    if (org.heat >= HEAT_PANIC) return 'skim';

    const raiderPressure = org.factions.find(f => f.doctrine === 'raider')?.pressure ?? 0;
    if (org.doctrine === 'raider' && raiderPressure > 45 && org.heat < HEAT_CAUTION) return 'strangle';
    if (org.doctrine === 'smuggler' || org.doctrine === 'merchant') return 'skim';
    // A heavily escorted lane is not worth provoking further.
    if ((route.escortLevel ?? 0) >= 5) return 'skim';
    return 'prey';
}

// ─── Raid type ───────────────────────────────────────────────────────────────

export function chooseRaidType(
    org: PirateOrganization,
    rng: RNG,
    hasHostageTarget: boolean
): RaidType {
    const options = DOCTRINE_RAIDS[org.doctrine]
        .filter(type => org.stage >= RAID_PROFILES[type].minStage)
        .filter(type => type !== 'hostage' || hasHostageTarget);

    // Heat is the clock. Above the caution line a band stops doing the things
    // that put its name in the press.
    const affordable = options.filter(type => {
        if (org.heat >= HEAT_PANIC) return RAID_PROFILES[type].heat <= 0.5;
        if (org.heat >= HEAT_CAUTION) return RAID_PROFILES[type].heat <= 2;
        return true;
    });

    const pool = affordable.length > 0 ? affordable : ['robbery' as RaidType];

    // Weighted toward the wing's first choice, but every option in the pool is
    // reachable — a band that only ever did its favourite thing would be a
    // lookup table rather than a character.
    const weights = pool.map((_, i) => PREFERENCE_WEIGHTS[Math.min(i, PREFERENCE_WEIGHTS.length - 1)]);
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = rng.next() * total;
    for (let i = 0; i < pool.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
}

// ─── Success ─────────────────────────────────────────────────────────────────

/** Whether this camp is positioned to ambush rather than chase. */
function hasAmbushPosition(world: GameWorldState, org: PirateOrganization, systemId: string): boolean {
    const sys = world.movement.systems.get(systemId);
    if (sys?.tags?.some(tag => ['throat', 'canal', 'strait', 'gate'].includes(tag))) return true;
    return basesOf(world, org).some(base =>
        base.kind === 'hidden_lane'
        && baseIsOperational(base, world)
        && !!base.laneEndpoints?.includes(systemId)
    );
}

/**
 * Defence the raid has to beat: escorts on the lane, anything parked on top of
 * the camp, and the leader's competence on the other side of the ledger.
 */
export function raidOdds(
    world: GameWorldState,
    org: PirateOrganization,
    camp: PiracyFleet,
    route: TradeRoute
): number {
    let garrison = 0;
    for (const fleet of world.movement.fleets.values()) {
        if (fleet.factionId === PIRATE_FACTION_ID) continue;
        if (fleet.currentSystemId !== camp.systemId) continue;
        garrison += fleet.strength ?? 0;
    }

    const attack = camp.interdictionStrength * (0.7 + (org.leader?.competence ?? 40) / 200);
    const defence = (route.escortLevel ?? 0) * ESCORT_DEFENCE + garrison * GARRISON_DEFENCE;
    const ambush = hasAmbushPosition(world, org, camp.systemId) ? AMBUSH_BONUS : 1;

    return Math.max(0, Math.min(0.95, (attack - defence) * ambush));
}

// ─── Effects ─────────────────────────────────────────────────────────────────

function captureHull(
    world: GameWorldState,
    org: PirateOrganization,
    camp: PiracyFleet,
    rng: RNG
): boolean {
    // Over-extension is allowed — it costs crew loyalty rather than being
    // forbidden — but a band will not take a prize it plainly cannot crew.
    if (org.fleetIds.length >= supportableFleets(world, org) + 2) return false;

    const template = world.movement.fleets.get(camp.raiderFleetIds?.[0] ?? '');
    if (!template) return false;

    const id = `pirate-prize-${camp.systemId}-${world.nowSeconds}-${rng.nextInt(100, 999)}`;
    if (world.movement.fleets.has(id)) return false;

    const prize: Fleet = {
        ...template,
        id,
        name: 'Captured Hull',
        organizationId: org.id,
        strength: CAPTURED_HULL_STRENGTH,
        orders: [],
        plannedPath: [],
        destinationSystemId: null,
        transitProgress: 0,
        etaSeconds: 0,
        activeLayer: null,
    };
    world.movement.fleets.set(id, prize);
    org.fleetIds.push(id);
    return true;
}

function sabotageSegment(world: GameWorldState, route: TradeRoute, systemId: string): boolean {
    const index = route.path.indexOf(systemId);
    if (index < 0) return false;
    const neighbour = route.path[index + 1] ?? route.path[index - 1];
    if (!neighbour) return false;

    for (const segment of world.movement.tradeSegments.values()) {
        const matches =
            (segment.fromSystemId === systemId && segment.toSystemId === neighbour)
            || (segment.fromSystemId === neighbour && segment.toSystemId === systemId);
        if (!matches) continue;
        segment.integrity = Math.max(0, segment.integrity - SABOTAGE_INTEGRITY_LOSS);
        if (segment.integrity <= 0.2 && segment.status === 'active') segment.status = 'disrupted';
        return true;
    }
    return false;
}

function applyTerror(route: TradeRoute): void {
    route.terror = Math.min(TERROR_MAX, (route.terror ?? 0) + TERROR_PER_DESTRUCTION);
}

function takeHostage(
    world: GameWorldState,
    org: PirateOrganization,
    route: TradeRoute,
    victimFactionId: string,
    valueLost: number
): void {
    const piracy = ensurePiracyState(world);
    const id = `phost-${org.id}-${victimFactionId}-${world.nowSeconds}`;
    if (piracy.hostages.has(id)) return;

    piracy.hostages.set(id, {
        id,
        organizationId: org.id,
        victimFactionId,
        routeId: route.id,
        demandCredits: Math.round(Math.max(2_000, valueLost * RANSOM_MULTIPLIER)),
        takenAtSeconds: world.nowSeconds,
        expiresAtSeconds: world.nowSeconds + HOSTAGE_WINDOW_SECONDS,
        status: 'held',
    });
    console.log(`[Piracy] ${org.name} holds personnel from ${victimFactionId} for ransom`);
}

// ─── The raid tick ───────────────────────────────────────────────────────────

export interface RaidOutcome {
    routeId: string;
    organizationId: string;
    type: RaidType;
    posture: PiracyPosture;
    volumeLost: number;
    valueLost: number;
    victimFactionId?: string;
}

/**
 * Resolve this tick's raiding and return the volume each route lost, for the
 * settlement pass. Replaces the bare interdiction call: raiders still siphon
 * cargo, but now they choose how, and the choice leaves marks the victim can
 * see long after the cargo is gone.
 */
export function tickPirateRaids(
    world: GameWorldState,
    routes: TradeRoute[],
    rng: RNG,
    deltaSeconds: number
): { lossByRoute: Map<string, number>; outcomes: RaidOutcome[] } {
    const piracy = ensurePiracyState(world);
    const hours = Math.max(0, deltaSeconds / 3600);

    // Fear fades. A corridor nobody has burned in a while fills back up.
    for (const route of routes) {
        if (!route.terror) continue;
        route.terror = Math.max(0, route.terror - TERROR_DECAY_PER_HOUR * hours);
    }

    // Rebuild the interdiction registry from the live raiders, then let each
    // band set its posture on every lane it can reach.
    const snapshots: RaiderSnapshot[] = [];
    for (const fleet of world.movement.fleets.values()) {
        if (fleet.factionId !== PIRATE_FACTION_ID) continue;
        if (!fleet.currentSystemId || fleet.transitProgress > 0) continue;
        snapshots.push({
            fleetId: fleet.id,
            systemId: fleet.currentSystemId,
            strength: fleet.strength ?? 0,
            organizationId: fleet.organizationId ?? null,
            sponsorFactionId: null,
        });
    }
    const previous = world.economy.piracyFleets instanceof Map
        ? world.economy.piracyFleets
        : new Map<string, PiracyFleet>();
    const camps = derivePiracyFleets(snapshots, previous);
    world.economy.piracyFleets = camps;

    const orgById = new Map(activeOrganizations(world).map(org => [org.id, org]));

    /** The band running a camp, if any. */
    const orgOf = (camp: PiracyFleet) =>
        camp.organizationId ? orgById.get(camp.organizationId) : undefined;

    /**
     * Posture is decided per LANE, not per camp: a junction carries several
     * routes, and a strangle order aimed at one of them used to apply the 40-70%
     * siphon to every other route through the same system.
     */
    const postureOn = (camp: PiracyFleet, route: TradeRoute): PiracyPosture => {
        const org = orgOf(camp);
        if (!org) return camp.posture ?? 'prey';
        const ordered = org.posturePreference?.[route.id];
        if (ordered) return ordered;
        const laneOwner = world.economy.tradeAgreements?.get(route.agreementId)?.aFactionId;
        return choosePosture(org, route, sponsoredIntensity(world, org, laneOwner));
    };

    // Odds are a property of the ground, the escorts on THIS lane, and the
    // leader — so they are computed per (camp, route) and handed to the
    // interdiction pass, which then skips its own legacy escort mitigation.
    const oddsOn = (camp: PiracyFleet, route: TradeRoute): number => {
        const org = orgOf(camp);
        if (!org) return 0;
        return raidOdds(world, org, camp, route);
    };

    // Kept for the UI and for anything reading a camp at rest.
    for (const camp of camps.values()) {
        const onLane = routes.find(route => route.path.includes(camp.systemId));
        camp.posture = onLane ? postureOn(camp, onLane) : (camp.posture ?? 'prey');
    }

    const results: PiracyInterdictionResult[] =
        tickPiracyInterdiction([...camps.values()], routes, rng, oddsOn, postureOn);

    const lossByRoute = new Map<string, number>();
    const outcomes: RaidOutcome[] = [];
    const routeById = new Map(routes.map(route => [route.id, route]));

    for (const result of results) {
        const camp = camps.get(result.fleetId);
        const route = routeById.get(result.routeId);
        if (!camp?.organizationId || !route) continue;
        const org = orgById.get(camp.organizationId);
        if (!org) continue;

        // A band does not eat its own clients. Cover held by a RIVAL band is
        // somebody else's promise, though — and worth breaking on purpose when
        // the rival sold exclusive defence it now has to make good on.
        const contract = contractCovering(world, route.id);
        if (contract) {
            if (contract.organizationId === org.id) continue;
            if (contract.exclusiveDefence) {
                // The protector fights for its client. A raid still lands, but
                // it lands into opposition.
                const protector = orgById.get(contract.organizationId);
                if (protector && rng.check(Math.min(0.8, protector.networkControl / 100))) continue;
            }
        }

        const agreement = world.economy.tradeAgreements?.get(route.agreementId);
        const victimFactionId = agreement?.aFactionId;
        const raidRng = new RNG(seedFromString(`piracy|raid|${org.id}|${route.id}|${world.nowSeconds}`));
        // A pirate player's order stands, provided the band has the reach for it.
        const ordered = org.preferredRaidType;
        const type = ordered && org.stage >= RAID_PROFILES[ordered].minStage
            ? ordered
            : chooseRaidType(org, raidRng, !!victimFactionId);
        const profile = RAID_PROFILES[type];

        // The victim loses the cargo either way. What the RAIDERS get out of it
        // depends on what they came to do: destruction takes nothing home.
        const volumeLost = result.volumeLost;
        const valueLost = Math.round(result.valueLost * profile.profit);

        lossByRoute.set(route.id, (lossByRoute.get(route.id) ?? 0) + volumeLost);
        // Interdiction books the full value into the camp's pool; take back the
        // part this raid type never converts into loot.
        camp.lootAccumulated -= result.valueLost - valueLost;

        switch (type) {
            case 'capture':
                captureHull(world, org, camp, raidRng);
                break;
            case 'sabotage':
                sabotageSegment(world, route, camp.systemId);
                break;
            case 'destruction':
                applyTerror(route);
                break;
            case 'hostage':
                if (victimFactionId) takeHostage(world, org, route, victimFactionId, valueLost);
                break;
            case 'economicRaid':
                // Hitting one resource the victim cannot substitute is worth
                // more than the cargo: ratchet the lane's risk harder so the
                // shortage compounds across ticks.
                route.piracyRisk = Math.min(0.95, route.piracyRisk + 0.04);
                break;
            case 'robbery':
                break;
        }

        recordRaid(world, org.id, { valueLost, victimFactionId, raidType: type });

        outcomes.push({
            routeId: route.id,
            organizationId: org.id,
            type,
            posture: camp.posture ?? 'prey',
            volumeLost,
            valueLost,
            victimFactionId,
        });
    }

    // Loot has to go somewhere. A band with storage banks part of the take,
    // which is what makes raiding its bases worth doing.
    for (const org of orgById.values()) {
        if (org.treasury <= 0) continue;
        const store = basesOf(world, org).find(base =>
            baseIsOperational(base, world) && BASE_KINDS[base.kind].storage > 0
        );
        if (!store) continue;
        const capacity = BASE_KINDS[store.kind].storage - store.storedLoot;
        const banked = Math.min(org.treasury * BANKED_SHARE, Math.max(0, capacity));
        if (banked <= 0) continue;
        store.storedLoot += banked;
        org.treasury -= banked;
    }

    return { lossByRoute, outcomes };
}

/** Hostage deals the ransom window has closed on. */
export function tickHostages(world: GameWorldState): void {
    const piracy = ensurePiracyState(world);
    for (const deal of piracy.hostages.values()) {
        if (deal.status !== 'held') continue;
        if (world.nowSeconds < deal.expiresAtSeconds) continue;

        // Nobody paid. Killing the hostage is what a refusal costs both sides:
        // permanent infamy for the band, a blood feud from the victim.
        deal.status = 'killed';
        const org = piracy.organizations.get(deal.organizationId);
        if (org) {
            org.infamy = Math.min(100, org.infamy + 6);
            org.heat = Math.min(100, org.heat + 10);
            const relation = org.relations[deal.victimFactionId];
            if (relation) relation.standing = -100;
            else org.relations[deal.victimFactionId] = {
                factionId: deal.victimFactionId, standing: -100, agreements: [],
                lastContactTick: world.nowSeconds, secret: false,
            };
            console.log(`[Piracy] ${org.name} kills a hostage — ${deal.victimFactionId} will not forget`);
        }
    }
}

/** Pay a ransom. Wired to a player order in Phase 7; AI victims call it directly. */
export function payRansom(world: GameWorldState, hostageId: string): boolean {
    const piracy = ensurePiracyState(world);
    const deal = piracy.hostages.get(hostageId);
    if (!deal || deal.status !== 'held') return false;

    const reserves = world.economy?.factions?.get(deal.victimFactionId)?.reserves as Record<string, number> | undefined;
    if (!reserves || (reserves[Resource.CREDITS] ?? 0) < deal.demandCredits) return false;

    reserves[Resource.CREDITS] -= deal.demandCredits;
    deal.status = 'ransomed';

    const org = piracy.organizations.get(deal.organizationId);
    if (org) {
        org.treasury += deal.demandCredits;
        org.infamy = Math.min(100, org.infamy + 2);
        // A band that keeps its word is a band worth negotiating with again.
        const relation = org.relations[deal.victimFactionId];
        if (relation) relation.standing = Math.min(100, relation.standing + 10);
        else org.relations[deal.victimFactionId] = {
            factionId: deal.victimFactionId, standing: 10, agreements: ['hostageDeal'],
            lastContactTick: world.nowSeconds, secret: true,
        };
    }
    return true;
}
