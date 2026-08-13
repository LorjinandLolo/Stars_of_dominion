// lib/piracy/protection-service.ts
// Pirate system Phase 5 — the protection economy.
//
// Design: docs/pirate-system/operations.md §5–6, metrics.md §3.
//
// A Stage III band works out that destroying commerce pays worse than taxing
// it. From that point the entity stops being a cost an empire absorbs and
// becomes infrastructure its merchants use — and the empire discovers its own
// corporations are funding the organization it is fighting.
//
// The whole mechanic hangs off one comparison a merchant makes honestly:
//
//     protection fee   vs   escort cost + expected losses
//
// A competent band prices just under the alternative, so cooperating is the
// rational choice. That is what makes it hard to legislate away.

import type { GameWorldState } from '../game-world-state';
import type { TradeRoute } from '../trade-system/types';
import { Resource } from '../trade-system/types';
import {
    activeOrganizations,
    ensurePiracyState,
    PIRATE_FACTION_ID,
} from './organization-service';
import { basesOf, baseIsOperational } from './base-service';
import type {
    PirateOrganization,
    ProtectionContract,
    ProtectionPayerKind,
    TributeAgreement,
} from './piracy-types';

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** Credits per hour one level of escort costs the route's owner. */
export const ESCORT_COST_PER_LEVEL_PER_HOUR = 140;
/** Credits a unit of cargo is worth when pricing expected losses. */
const CARGO_UNIT_VALUE = 12;

/** A band prices just under whatever the merchant's alternative costs. */
const UNDERCUT = 0.8;
/** Exclusive defence — fighting off rivals too — is charged for. */
const EXCLUSIVE_PREMIUM = 1.45;
/** Nobody sells protection for nothing. */
const MIN_FEE_PER_HOUR = 40;

const CONTRACT_TERM_SECONDS = 30 * 24 * 3600;
const TRIBUTE_TERM_SECONDS = 30 * 24 * 3600;

/** Network control needed before a band can do each thing to a lane it holds. */
export const CONTROL_SET_RISK = 25;
export const CONTROL_DENY_ACCESS = 40;
export const CONTROL_TOLL = 55;
export const CONTROL_DICTATE_CARGO = 70;
export const CONTROL_OWN_INFORMATION = 85;

/** Toll charged on a controlled lane, as a fraction of the flow's value. */
const TOLL_RATE = 0.06;

/** Tribute asked of a system, per hour, scaled by what the band could take. */
const TRIBUTE_RATE = 0.5;

/** Breaching a contract costs this much crew loyalty and standing. */
const BREACH_LOYALTY = 10;
const BREACH_STANDING = 45;
/** However warm the relationship was, a breach ends below neutral. */
const BREACH_FLOOR_STANDING = -20;

// ─── The merchant's comparison ───────────────────────────────────────────────

/** Credits per hour this route is expected to lose to piracy as things stand. */
export function expectedLossPerHour(world: GameWorldState, route: TradeRoute): number {
    const agreement = world.economy?.tradeAgreements?.get(route.agreementId);
    if (!agreement) return 0;
    const escortMitigation = Math.min(0.8, (route.escortLevel ?? 0) * 0.1);
    const exposure = (route.piracyRisk ?? 0) * (1 - escortMitigation);
    return agreement.volumePerHour * CARGO_UNIT_VALUE * exposure;
}

/** Credits per hour the escorts currently on this route cost to keep. */
export function escortCostPerHour(route: TradeRoute): number {
    return (route.escortLevel ?? 0) * ESCORT_COST_PER_LEVEL_PER_HOUR;
}

/**
 * What it would cost to escort this lane hard enough to be worth doing —
 * the honest alternative a merchant weighs the pirate's fee against.
 */
export function escortAlternativeCostPerHour(world: GameWorldState, route: TradeRoute): number {
    const targetLevel = 5;
    const residualRisk = expectedLossPerHour(world, { ...route, escortLevel: targetLevel });
    return targetLevel * ESCORT_COST_PER_LEVEL_PER_HOUR + residualRisk;
}

/**
 * The fee a band asks. Priced just below the merchant's alternative, because a
 * racket that costs more than a navy is a racket nobody buys.
 */
export function protectionQuote(
    world: GameWorldState,
    org: PirateOrganization,
    route: TradeRoute,
    exclusiveDefence = false
): number {
    const alternative = Math.min(
        escortAlternativeCostPerHour(world, route),
        expectedLossPerHour(world, route) + escortCostPerHour(route)
    );
    const premium = exclusiveDefence ? EXCLUSIVE_PREMIUM : 1;
    // A feared band can charge more; a band nobody has heard of has to discount.
    const reputation = 0.75 + (org.infamy / 100) * 0.5;
    return Math.max(MIN_FEE_PER_HOUR, Math.round(alternative * UNDERCUT * premium * reputation));
}

/** Whether paying beats the alternative. The AI and the UI use the same answer. */
export function protectionIsWorthIt(
    world: GameWorldState,
    org: PirateOrganization,
    route: TradeRoute,
    exclusiveDefence = false
): boolean {
    const fee = protectionQuote(world, org, route, exclusiveDefence);
    const alternative = expectedLossPerHour(world, route) + escortCostPerHour(route);
    return fee < alternative;
}

// ─── Contracts ───────────────────────────────────────────────────────────────

export function contractsOf(world: GameWorldState, organizationId: string): ProtectionContract[] {
    return [...ensurePiracyState(world).protectionContracts.values()]
        .filter(c => c.organizationId === organizationId && !c.breachedAtSeconds);
}

export function contractCovering(world: GameWorldState, routeId: string): ProtectionContract | null {
    for (const contract of ensurePiracyState(world).protectionContracts.values()) {
        if (contract.breachedAtSeconds) continue;
        if (contract.routeIds.includes(routeId)) return contract;
    }
    return null;
}

export function signProtectionContract(
    world: GameWorldState,
    org: PirateOrganization,
    payerId: string,
    payerKind: ProtectionPayerKind,
    routeIds: string[],
    options: { exclusiveDefence?: boolean; secret?: boolean; feePerHour?: number } = {}
): ProtectionContract | null {
    // Taxing commerce instead of destroying it is a Stage III capability: it
    // needs the contacts and the reach a mere fleet does not have.
    if (org.stage < 3) return null;
    if (routeIds.length === 0) return null;

    const piracy = ensurePiracyState(world);
    const routes = routeIds
        .map(id => world.economy?.tradeRoutes?.get(id))
        .filter((r): r is TradeRoute => !!r);
    if (routes.length === 0) return null;

    const fee = options.feePerHour ?? routes.reduce(
        (sum, route) => sum + protectionQuote(world, org, route, options.exclusiveDefence), 0
    );

    const contract: ProtectionContract = {
        id: `pcon-${org.id}-${payerId}-${world.nowSeconds}`,
        organizationId: org.id,
        payerId,
        payerKind,
        routeIds: routes.map(r => r.id),
        feePerHour: fee,
        exclusiveDefence: !!options.exclusiveDefence,
        signedAtSeconds: world.nowSeconds,
        expiresAtSeconds: world.nowSeconds + CONTRACT_TERM_SECONDS,
        secret: options.secret ?? true,
    };
    piracy.protectionContracts.set(contract.id, contract);

    for (const route of routes) route.protectedByOrgId = org.id;

    // Money that arrives without violence pleases the wings that wanted to stop
    // shooting, and insults the ones that did not.
    adjustWing(org, 'merchant', 6);
    adjustWing(org, 'raider', -4);

    const relation = org.relations[payerId];
    if (relation) relation.standing = Math.min(100, relation.standing + 15);
    else org.relations[payerId] = {
        factionId: payerId, standing: 15, agreements: ['protection'],
        lastContactTick: world.nowSeconds, secret: contract.secret,
    };

    console.log(`[Piracy] ${org.name} sells protection to ${payerId} (${Math.round(fee)}cr/hr)`);
    return contract;
}

function adjustWing(org: PirateOrganization, doctrine: string, delta: number): void {
    const wing = org.factions.find(f => f.doctrine === doctrine);
    if (wing) wing.satisfaction = Math.max(0, Math.min(100, wing.satisfaction + delta));
}

/**
 * A raid on a covered lane. Not forbidden — a band CAN eat its own client — but
 * every other client re-prices the moment they hear.
 */
export function breachContract(world: GameWorldState, contractId: string): void {
    const piracy = ensurePiracyState(world);
    const contract = piracy.protectionContracts.get(contractId);
    if (!contract || contract.breachedAtSeconds) return;

    contract.breachedAtSeconds = world.nowSeconds;
    const org = piracy.organizations.get(contract.organizationId);
    if (!org) return;

    org.crewLoyalty = Math.max(0, org.crewLoyalty - BREACH_LOYALTY);
    const relation = org.relations[contract.payerId];
    if (relation) {
        // Being betrayed by someone you paid is worse than never having met
        // them, so a breach always lands below neutral however good the
        // relationship was — the fee bought a promise, not a discount.
        relation.standing = Math.max(-100, Math.min(
            BREACH_FLOOR_STANDING,
            relation.standing - BREACH_STANDING
        ));
    }

    // Word travels. Every remaining client discounts what this band's word is
    // worth, which is what makes the racket self-policing.
    for (const other of contractsOf(world, org.id)) {
        other.feePerHour *= 0.85;
    }
    adjustWing(org, 'merchant', -20);
    console.log(`[Piracy] ${org.name} broke its word to ${contract.payerId}`);
}

// ─── Tribute ─────────────────────────────────────────────────────────────────

/** What a band would ask of a system: a fraction of what it could take by force. */
export function tributeQuote(world: GameWorldState, org: PirateOrganization, systemId: string): number {
    let exposed = 0;
    for (const route of world.economy?.tradeRoutes?.values() ?? []) {
        if (!route.path?.includes(systemId)) continue;
        exposed += expectedLossPerHour(world, route);
    }
    const sys = world.movement.systems.get(systemId);
    const localValue = (sys?.tradeValue ?? 0) * 4;
    return Math.max(MIN_FEE_PER_HOUR, Math.round((exposed + localValue) * TRIBUTE_RATE));
}

export function imposeTribute(
    world: GameWorldState,
    org: PirateOrganization,
    payerFactionId: string,
    systemId: string
): TributeAgreement | null {
    // Taxing a whole system rather than a lane needs a confederacy behind it.
    if (org.stage < 4) return null;

    const piracy = ensurePiracyState(world);
    const tribute: TributeAgreement = {
        id: `ptrib-${org.id}-${systemId}`,
        organizationId: org.id,
        payerFactionId,
        systemId,
        creditsPerHour: tributeQuote(world, org, systemId),
        signedAtSeconds: world.nowSeconds,
        expiresAtSeconds: world.nowSeconds + TRIBUTE_TERM_SECONDS,
    };
    piracy.tributes.set(tribute.id, tribute);
    console.log(`[Piracy] ${systemId} pays tribute to ${org.name}`);
    return tribute;
}

// ─── Network control ─────────────────────────────────────────────────────────

/**
 * How much of the criminal economy a band runs. This is the metric that makes a
 * pirate a POWER rather than a nuisance — and the one that survives military
 * defeat, because contracts, lanes and markets do not sink with a fleet.
 */
export function computeNetworkControl(world: GameWorldState, org: PirateOrganization): number {
    const routes = [...(world.economy?.tradeRoutes?.values() ?? [])];
    const totalPriority = routes.reduce((sum, r) => sum + (r.routePriority ?? 0), 0);

    const covered = new Set(contractsOf(world, org.id).flatMap(c => c.routeIds));
    const coveredPriority = routes
        .filter(r => covered.has(r.id))
        .reduce((sum, r) => sum + (r.routePriority ?? 0), 0);
    const protectionShare = totalPriority > 0 ? coveredPriority / totalPriority : 0;

    const tributes = [...ensurePiracyState(world).tributes.values()]
        .filter(t => t.organizationId === org.id);
    const tributeShare = Math.min(1, tributes.length / 4);

    const bases = basesOf(world, org).filter(b => baseIsOperational(b, world));
    const baseSpread = Math.min(1, new Set(bases.map(b => b.systemId)).size / 6);
    const hiddenLanes = Math.min(1, bases.filter(b => b.kind === 'hidden_lane').length / 3);

    // Share of the raiders operating anywhere near this band's ground.
    const ownRaiders = org.fleetIds.length;
    let regionalRaiders = 0;
    const reach = new Set([org.homeSystemId, ...bases.map(b => b.systemId)]);
    for (const fleet of world.movement.fleets.values()) {
        if (fleet.factionId !== PIRATE_FACTION_ID || !fleet.currentSystemId) continue;
        if (reach.has(fleet.currentSystemId)) regionalRaiders += 1;
    }
    const rivalSuppression = regionalRaiders > 0 ? Math.min(1, ownRaiders / regionalRaiders) : 0;

    // How much of the region's grey trade clears through this band's markets.
    // A band with liquidity and no fleets is dormant, not defeated.
    const totalLiquidity = activeOrganizations(world)
        .reduce((sum, other) => sum + (other.blackMarketLiquidity ?? 0), 0);
    const marketShare = totalLiquidity > 0 ? (org.blackMarketLiquidity ?? 0) / totalLiquidity : 0;

    return Math.max(0, Math.min(100,
        25 * protectionShare
        + 15 * tributeShare
        + 20 * baseSpread
        + 15 * hiddenLanes
        + 10 * rivalSuppression
        + 15 * marketShare
    ));
}

/**
 * Write the second truth onto the map. A system's owner is one fact; who
 * decides what moves through it is another, and the gap between them is the
 * most important strategic fact in a region.
 */
function projectInfluence(world: GameWorldState, org: PirateOrganization): void {
    const held = new Set<string>();
    for (const base of basesOf(world, org)) {
        if (baseIsOperational(base, world)) held.add(base.systemId);
    }
    for (const contract of contractsOf(world, org.id)) {
        for (const routeId of contract.routeIds) {
            const route = world.economy?.tradeRoutes?.get(routeId);
            for (const systemId of route?.path ?? []) held.add(systemId);
        }
    }
    for (const tribute of ensurePiracyState(world).tributes.values()) {
        if (tribute.organizationId === org.id) held.add(tribute.systemId);
    }

    for (const sys of world.movement.systems.values()) {
        if (!sys.pirateInfluence) sys.pirateInfluence = {};
        if (held.has(sys.id)) sys.pirateInfluence[org.id] = org.networkControl;
        else delete sys.pirateInfluence[org.id];
    }

    for (const corridor of world.movement.corridors.values()) {
        const overlap = corridor.nodeIds.filter(id => held.has(id)).length;
        if (!corridor.pirateControlByOrg) corridor.pirateControlByOrg = {};
        if (overlap === 0) {
            delete corridor.pirateControlByOrg[org.id];
            continue;
        }
        corridor.pirateControlByOrg[org.id] =
            org.networkControl * (overlap / Math.max(1, corridor.nodeIds.length));
    }
}

// ─── Step 11f — the protection tick ──────────────────────────────────────────

/**
 * Collect fees and tribute, enforce the bargain, charge tolls on lanes a band
 * genuinely controls, and recompute what "control" even means this tick.
 */
export function tickProtection(world: GameWorldState, deltaSeconds: number): void {
    const piracy = ensurePiracyState(world);
    const hours = Math.max(0, deltaSeconds / 3600);
    if (hours <= 0) return;

    const debit = (payerId: string, kind: ProtectionPayerKind, amount: number): boolean => {
        if (kind === 'company') {
            const company = world.corporate?.companies?.get(payerId);
            if (!company || company.treasury < amount) return false;
            company.treasury -= amount;
            return true;
        }
        const reserves = world.economy?.factions?.get(payerId)?.reserves as Record<string, number> | undefined;
        if (!reserves || (reserves[Resource.CREDITS] ?? 0) < amount) return false;
        reserves[Resource.CREDITS] -= amount;
        return true;
    };

    // 1. Contracts: collect, expire, and lapse the ones nobody can pay.
    for (const contract of [...piracy.protectionContracts.values()]) {
        const org = piracy.organizations.get(contract.organizationId);
        const expired = world.nowSeconds >= contract.expiresAtSeconds;

        if (!org || org.dissolvedAtSeconds || contract.breachedAtSeconds || expired) {
            for (const routeId of contract.routeIds) {
                const route = world.economy?.tradeRoutes?.get(routeId);
                if (route?.protectedByOrgId === contract.organizationId) delete route.protectedByOrgId;
            }
            if (expired || !org) piracy.protectionContracts.delete(contract.id);
            continue;
        }

        const due = contract.feePerHour * hours;
        if (!debit(contract.payerId, contract.payerKind, due)) {
            // A client who cannot pay is not a client. The band stops covering
            // the lane rather than working for free.
            for (const routeId of contract.routeIds) {
                const route = world.economy?.tradeRoutes?.get(routeId);
                if (route?.protectedByOrgId === org.id) delete route.protectedByOrgId;
            }
            piracy.protectionContracts.delete(contract.id);
            console.log(`[Piracy] ${contract.payerId} defaulted on protection from ${org.name}`);
            continue;
        }

        org.treasury += due;
        // A covered lane is genuinely safer: this is the service being sold.
        for (const routeId of contract.routeIds) {
            const route = world.economy?.tradeRoutes?.get(routeId);
            if (!route) continue;
            route.protectedByOrgId = org.id;
            const floor = contract.exclusiveDefence ? 0.01 : 0.04;
            route.piracyRisk = Math.max(floor, route.piracyRisk - (contract.exclusiveDefence ? 0.08 : 0.03) * hours);
        }
    }

    // 2. Tribute: whole systems paying not to be touched.
    for (const tribute of [...piracy.tributes.values()]) {
        const org = piracy.organizations.get(tribute.organizationId);
        if (!org || org.dissolvedAtSeconds || world.nowSeconds >= tribute.expiresAtSeconds) {
            piracy.tributes.delete(tribute.id);
            continue;
        }
        const due = tribute.creditsPerHour * hours;
        if (debit(tribute.payerFactionId, 'faction', due)) org.treasury += due;
        else piracy.tributes.delete(tribute.id);
    }

    // 3. Control, influence, and the tolls control buys.
    for (const org of activeOrganizations(world)) {
        org.networkControl = computeNetworkControl(world, org);
        projectInfluence(world, org);

        if (org.networkControl < CONTROL_TOLL) continue;

        // A band that controls the ground charges for passage whether or not
        // anyone signed anything. This is the point where the map's owner and
        // the corridor's owner are visibly different people.
        for (const route of world.economy?.tradeRoutes?.values() ?? []) {
            const agreement = world.economy?.tradeAgreements?.get(route.agreementId);
            if (!agreement) continue;
            const controlled = (route.path ?? []).some(id =>
                (world.movement.systems.get(id)?.pirateInfluence?.[org.id] ?? 0) >= CONTROL_TOLL
            );
            if (!controlled) continue;

            const toll = agreement.volumePerHour * CARGO_UNIT_VALUE * TOLL_RATE * hours;
            if (debit(agreement.aFactionId, 'faction', toll)) {
                org.treasury += toll;
                adjustWing(org, 'merchant', 1);
            }
        }
    }
}

/** Whether a band may deny a named faction passage through ground it holds. */
export function canDenyAccess(org: PirateOrganization): boolean {
    return org.networkControl >= CONTROL_DENY_ACCESS;
}

/** Whether a band's transit data is its own to sell (feeds Phase 6). */
export function ownsInformation(org: PirateOrganization): boolean {
    return org.networkControl >= CONTROL_OWN_INFORMATION;
}
