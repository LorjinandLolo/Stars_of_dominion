// lib/piracy/counter-piracy-service.ts
// Pirate system Phase 8 — bounties, captured crews, and amnesty.
//
// Design: docs/pirate-system/counter-piracy.md §6, §8.
//
// Defeated pirates do not evaporate. What an empire does with them is a
// different resource in each case: a hanged crew buys deterrence, a turned one
// buys a permanent view inside the network, and an amnesty buys the whole
// merchant wing at the price of explaining it to your own public.

import type { GameWorldState } from '../game-world-state';
import { Resource } from '../trade-system/types';
import { RNG, seedFromString } from '../trade-system/rng';
import {
    activeOrganizations,
    ensurePiracyState,
    PIRATE_FACTION_ID,
} from './organization-service';
import { basesOf, discoverBase } from './base-service';
import { removeLeader } from './succession-service';
import type {
    CaptureDisposition,
    PirateBounty,
    PirateCapture,
    PirateOrganization,
} from './piracy-types';

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** Regional lawlessness a public execution burns off. */
const EXECUTION_DETERRENCE = 12;
/** Standing lost with a band whose people you hanged. */
const EXECUTION_STANDING = 40;

/** Crew loyalty a band loses per captured crew. */
const CAPTURE_LOYALTY_COST = 4;

/** Bases an informant gives up per tick of cooperation. */
const INFORMANT_BASES_PER_TICK = 1;
/** Chance per hour an informant is found out. */
const INFORMANT_BURN_PER_HOUR = 0.01;

/** Share of a wing's pressure that leaves when it accepts an amnesty. */
const AMNESTY_WING_DEPARTURE = 1;
/** Share of a band's internal pressure that must walk out for it to count as split. */
const AMNESTY_FRACTURE_SHARE = 40;
/** How willing each wing is to come in from the cold. */
const AMNESTY_ACCEPTANCE: Record<string, number> = {
    merchant: 0.9,
    smuggler: 0.7,
    corsair: 0.4,
    raider: 0.05,
    traditionalist: 0.02,
};

/** Bounty size that counts as serious money to a hunter. */
const BOUNTY_MIN = 500;
/** How long an unclaimed bounty stands before the escrow is returned. */
const BOUNTY_TTL_SECONDS = 30 * 24 * 3600;

// ─── Bounties ────────────────────────────────────────────────────────────────

/**
 * Outsource the problem. Anyone can claim — including a rival band, which is
 * efficient and consolidates the region under an organization you have now
 * personally funded.
 */
export function postBounty(
    world: GameWorldState,
    postedByFactionId: string,
    target: { organizationId?: string; leaderId?: string; baseId?: string },
    credits: number
): PirateBounty | null {
    if (credits < BOUNTY_MIN) return null;
    const reserves = world.economy?.factions?.get(postedByFactionId)?.reserves as
        Record<string, number> | undefined;
    if (!reserves || (reserves[Resource.CREDITS] ?? 0) < credits) return null;

    const piracy = ensurePiracyState(world);
    reserves[Resource.CREDITS] -= credits;   // escrowed until claimed

    const bounty: PirateBounty = {
        id: `pbounty-${postedByFactionId}-${world.nowSeconds}-${piracy.bounties.size}`,
        postedByFactionId,
        targetOrganizationId: target.organizationId,
        targetLeaderId: target.leaderId,
        targetBaseId: target.baseId,
        credits,
        postedAtSeconds: world.nowSeconds,
    };
    piracy.bounties.set(bounty.id, bounty);

    // A price on your head is attention, and attention is heat.
    if (target.organizationId) {
        const org = piracy.organizations.get(target.organizationId);
        if (org) {
            org.heat = Math.min(100, org.heat + credits / 2_000);
            org.heatByFaction[postedByFactionId] =
                Math.min(100, (org.heatByFaction[postedByFactionId] ?? 0) + credits / 1_000);
        }
    }
    console.log(`[Piracy] ${postedByFactionId} posts ${credits}cr on ${target.organizationId ?? target.leaderId ?? target.baseId}`);
    return bounty;
}

/** Collect. Claimants may be factions or rival bands. */
export function claimBounty(
    world: GameWorldState,
    bountyId: string,
    claimantFactionId: string
): number {
    const piracy = ensurePiracyState(world);
    const bounty = piracy.bounties.get(bountyId);
    if (!bounty || bounty.claimedByFactionId) return 0;

    bounty.claimedByFactionId = claimantFactionId;
    bounty.claimedAtSeconds = world.nowSeconds;

    const reserves = world.economy?.factions?.get(claimantFactionId)?.reserves as
        Record<string, number> | undefined;
    if (reserves) reserves[Resource.CREDITS] = (reserves[Resource.CREDITS] ?? 0) + bounty.credits;

    piracy.bounties.delete(bountyId);
    return bounty.credits;
}

/** Live bounties a hunter could go after. */
export function openBounties(world: GameWorldState, targetOrganizationId?: string): PirateBounty[] {
    return [...ensurePiracyState(world).bounties.values()].filter(b =>
        !b.claimedByFactionId
        && (!targetOrganizationId || b.targetOrganizationId === targetOrganizationId)
    );
}

// ─── Captures ────────────────────────────────────────────────────────────────

/**
 * Take prisoners rather than only wreckage. Called when a raider is destroyed
 * on top of a superior force, or when a base falls with people still in it.
 */
export function captureCrew(
    world: GameWorldState,
    org: PirateOrganization,
    captorFactionId: string,
    crewStrength: number,
    options: { takeLeader?: boolean } = {}
): PirateCapture {
    const piracy = ensurePiracyState(world);
    const takingLeader = !!options.takeLeader && !!org.leader;

    const capture: PirateCapture = {
        id: `pcap-${org.id}-${captorFactionId}-${world.nowSeconds}-${piracy.captures.size}`,
        organizationId: org.id,
        captorFactionId,
        leaderId: takingLeader ? org.leader!.id : undefined,
        leaderName: takingLeader ? org.leader!.name : undefined,
        crewStrength,
        capturedAtSeconds: world.nowSeconds,
    };
    piracy.captures.set(capture.id, capture);

    org.crewLoyalty = Math.max(0, org.crewLoyalty - CAPTURE_LOYALTY_COST);
    if (takingLeader) {
        // Losing the captain is worth roughly a stage — and opens the most
        // dangerous moment in a band's life.
        removeLeader(world, org, 'captured');
    }

    // Any outstanding bounty on this band is now claimable.
    for (const bounty of openBounties(world, org.id)) {
        if (bounty.targetLeaderId && bounty.targetLeaderId !== capture.leaderId) continue;
        claimBounty(world, bounty.id, captorFactionId);
    }

    console.log(`[Piracy] ${captorFactionId} takes prisoners from ${org.name}`);
    return capture;
}

export interface DispositionResult {
    ok: boolean;
    reason?: string;
    /** Set when the choice produced a person the leadership system now owns. */
    leaderId?: string;
}

/**
 * Decide what a captured crew is for. Each answer spends a different currency
 * and buys a different thing.
 */
export function disposeCapture(
    world: GameWorldState,
    captureId: string,
    disposition: CaptureDisposition
): DispositionResult {
    const piracy = ensurePiracyState(world);
    const capture = piracy.captures.get(captureId);
    if (!capture || capture.disposition) return { ok: false, reason: 'nothing to decide' };

    const org = piracy.organizations.get(capture.organizationId);
    capture.disposition = disposition;

    switch (disposition) {
        case 'execute': {
            // Deterrence, bought with the certainty that your own people will
            // be killed the next time somebody takes hostages.
            for (const sys of world.movement.systems.values()) {
                if (sys.ownerFactionId !== capture.captorFactionId) continue;
                sys.lawlessness = Math.max(0, (sys.lawlessness ?? 0) - EXECUTION_DETERRENCE);
            }
            if (org) {
                const relation = org.relations[capture.captorFactionId];
                if (relation) relation.standing = Math.max(-100, relation.standing - EXECUTION_STANDING);
                else org.relations[capture.captorFactionId] = {
                    factionId: capture.captorFactionId, standing: -EXECUTION_STANDING,
                    agreements: [], lastContactTick: world.nowSeconds, secret: false,
                };
            }
            break;
        }

        case 'imprison':
            // A bargaining chip. Kept, fed, and worth rescuing.
            break;

        case 'recruit': {
            // Crews become hulls. Cheap, and the locals remember these faces.
            const reserves = world.economy?.factions?.get(capture.captorFactionId)?.reserves as
                Record<string, number> | undefined;
            if (reserves) {
                reserves[Resource.CREDITS] = (reserves[Resource.CREDITS] ?? 0) + capture.crewStrength * 200;
            }
            break;
        }

        case 'conscript':
            // Forced service: cheap manpower, and a desertion problem that
            // seeds the next band.
            if (org) org.crewLoyalty = Math.max(0, org.crewLoyalty - 5);
            break;

        case 'amnesty':
            if (org) acceptAmnestyWing(world, org, capture.captorFactionId, 'merchant');
            break;

        case 'informant': {
            capture.informantForFactionId = capture.captorFactionId;
            // The feed starts immediately: they know where they slept.
            if (org) {
                const bases = basesOf(world, org);
                for (const base of bases.slice(0, INFORMANT_BASES_PER_TICK)) {
                    discoverBase(base, capture.captorFactionId);
                }
            }
            break;
        }
    }

    // A captain who is turned rather than hanged can end up an admiral.
    if (capture.leaderId && (disposition === 'recruit' || disposition === 'amnesty')) {
        const leaderId = `leader-${capture.leaderId}`;
        world.leadership?.leaders?.set(leaderId, {
            id: leaderId,
            factionId: capture.captorFactionId,
            name: capture.leaderName ?? 'A former pirate',
            role: disposition === 'recruit' ? 'admiral' : 'governor',
            level: 2,
            xp: 0,
            loyalty: disposition === 'amnesty' ? 55 : 40,
            status: 'active',
            traits: ['former_pirate'],
            history: [],
        } as never);
        return { ok: true, leaderId };
    }

    return { ok: true };
}

/**
 * Bounties that nobody collected. The credits were escrowed out of the poster's
 * treasury when it was posted, so without an expiry they were simply destroyed:
 * the money left the economy and the offer sat on the board forever.
 */
export function tickBounties(world: GameWorldState): void {
    const piracy = ensurePiracyState(world);
    for (const bounty of [...piracy.bounties.values()]) {
        if (bounty.claimedByFactionId) continue;
        if (world.nowSeconds - bounty.postedAtSeconds < BOUNTY_TTL_SECONDS) continue;

        const reserves = world.economy?.factions?.get(bounty.postedByFactionId)?.reserves as
            Record<string, number> | undefined;
        if (reserves) reserves[Resource.CREDITS] = (reserves[Resource.CREDITS] ?? 0) + bounty.credits;
        piracy.bounties.delete(bounty.id);
        console.log(`[Piracy] ${bounty.postedByFactionId}'s bounty lapsed unclaimed — ${bounty.credits}cr returned`);
    }
}

/** Informants keep paying out, until the day they do not. */
export function tickInformants(world: GameWorldState, deltaSeconds: number): void {
    const piracy = ensurePiracyState(world);
    const hours = Math.max(0, deltaSeconds / 3600);

    for (const capture of [...piracy.captures.values()]) {
        if (!capture.informantForFactionId) continue;
        const org = piracy.organizations.get(capture.organizationId);
        if (!org || org.dissolvedAtSeconds) {
            piracy.captures.delete(capture.id);
            continue;
        }

        for (const base of basesOf(world, org)) {
            if (base.knownToFactionIds.includes(capture.informantForFactionId)) continue;
            discoverBase(base, capture.informantForFactionId);
            break;   // a trickle, not a firehose
        }

        // Discovery collapses the feed and gets the informant killed.
        const burnChance = INFORMANT_BURN_PER_HOUR * (1 + org.heat / 100) * hours;
        const rng = new RNG(seedFromString(`piracy|informant|${capture.id}|${world.nowSeconds}`));
        if (rng.check(burnChance)) {
            piracy.captures.delete(capture.id);
            org.crewLoyalty = Math.min(100, org.crewLoyalty + 3);   // a traitor found
            console.log(`[Piracy] ${org.name} finds its informant`);
        }
    }
}

// ─── Amnesty ─────────────────────────────────────────────────────────────────

export interface AmnestyResult {
    accepted: boolean;
    /** Wings that came in from the cold. */
    wings: string[];
    /** True when enough of the band left that the remainder is a different thing. */
    fractured: boolean;
}

/**
 * Offer legitimacy in exchange for surrender. Accepted by WINGS, not by
 * organizations — which is the point: a partial amnesty deliberately splits the
 * band, leaving a smaller, poorer, angrier remainder.
 */
export function offerAmnesty(
    world: GameWorldState,
    org: PirateOrganization,
    factionId: string
): AmnestyResult {
    const standing = org.relations[factionId]?.standing ?? 0;
    const heatPressure = org.heat / 100;
    const accepted: string[] = [];
    // Snapshot before anyone leaves — acceptAmnestyWing zeroes the departing
    // wing and hands its pressure to the survivors.
    const pressureBefore: Record<string, number> = {};
    for (const wing of org.factions) pressureBefore[wing.doctrine] = wing.pressure;

    for (const wing of [...org.factions]) {
        const base = AMNESTY_ACCEPTANCE[wing.doctrine] ?? 0.3;
        // A hunted, unhappy wing with nothing to lose comes in; a satisfied one
        // with a patron does not.
        const willingness = base
            + heatPressure * 0.3
            + (1 - wing.satisfaction / 100) * 0.2
            + (standing > 0 ? 0.1 : -0.1);
        if (willingness < 0.5) continue;
        accepted.push(wing.doctrine);
        acceptAmnestyWing(world, org, factionId, wing.doctrine);
    }

    // Measure what LEFT, not what is left: acceptAmnestyWing redistributes the
    // departing wing's pressure across the survivors, so the total is invariant
    // at 100 and a "remaining < 60" test could only ever fire when literally
    // every wing walked out.
    const departedShare = accepted.reduce((sum, doctrine) => sum + (pressureBefore[doctrine] ?? 0), 0);
    return {
        accepted: accepted.length > 0,
        wings: accepted,
        fractured: departedShare >= AMNESTY_FRACTURE_SHARE,
    };
}

/**
 * One wing takes the deal: its pressure leaves the band, its share of the ships
 * and money goes with it, and its people become the accepting faction's problem
 * instead of its enemy.
 */
function acceptAmnestyWing(
    world: GameWorldState,
    org: PirateOrganization,
    factionId: string,
    doctrine: string
): void {
    const wing = org.factions.find(f => f.doctrine === doctrine);
    if (!wing || wing.pressure <= 0) return;

    const share = (wing.pressure / 100) * AMNESTY_WING_DEPARTURE;
    const leaving = Math.floor(org.fleetIds.length * share);

    // Their hulls become the amnesty-giver's hulls.
    for (let i = 0; i < leaving; i++) {
        const fleetId = org.fleetIds.pop();
        if (!fleetId) break;
        const fleet = world.movement.fleets.get(fleetId);
        if (!fleet) continue;
        fleet.factionId = factionId;
        fleet.organizationId = null;
    }

    const money = org.treasury * share;
    org.treasury -= money;
    const reserves = world.economy?.factions?.get(factionId)?.reserves as Record<string, number> | undefined;
    if (reserves) reserves[Resource.CREDITS] = (reserves[Resource.CREDITS] ?? 0) + money;

    // The wing is gone; the rest of the band redistributes its influence.
    const departed = wing.pressure;
    wing.pressure = 0;
    wing.satisfaction = 0;
    const others = org.factions.filter(f => f.doctrine !== doctrine && f.pressure > 0);
    for (const other of others) other.pressure += departed / Math.max(1, others.length);

    org.doctrine = org.factions.reduce((top, f) => (f.pressure > top.pressure ? f : top), org.factions[0]).doctrine;
    console.log(`[Piracy] the ${doctrine} wing of ${org.name} accepts amnesty from ${factionId}`);
}

// ─── Hunters ─────────────────────────────────────────────────────────────────

/**
 * Bands with a price on their heads that a rival band could go and collect.
 * Pirate-on-pirate bounty claiming is legal, common, and consolidates a region
 * under whoever the payer just financed.
 */
export function bountyTargetsFor(world: GameWorldState, hunterOrgId: string): PirateBounty[] {
    return openBounties(world).filter(b =>
        b.targetOrganizationId && b.targetOrganizationId !== hunterOrgId
    );
}

/** Every band a faction is currently paying to have hunted. */
export function huntedBy(world: GameWorldState, factionId: string): PirateOrganization[] {
    const ids = new Set(
        openBounties(world)
            .filter(b => b.postedByFactionId === factionId && b.targetOrganizationId)
            .map(b => b.targetOrganizationId!)
    );
    return activeOrganizations(world).filter(org => ids.has(org.id));
}

export { PIRATE_FACTION_ID };
