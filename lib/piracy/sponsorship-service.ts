// lib/piracy/sponsorship-service.ts
// Pirate system Phase 7 — sponsorship, exposure, privateering, diplomacy.
//
// Design: docs/pirate-system/sponsorship.md.
//
// The strongest mechanic in the system: an empire that does not want a war can
// buy somebody else's. It is cheap, it is reversible, and it is deniable right
// up until the evidence lands — at which point the bill arrives through the
// press, the diplomacy system and the sponsor's own parliament at once.
//
// Both sides of a sponsorship are damaged by exposure, which is why an
// intelligent sponsor cuts funding while the trail is still cold.

import type { GameWorldState } from '../game-world-state';
import { Resource } from '../trade-system/types';
import { RNG, seedFromString } from '../trade-system/rng';
import { pushWorldStory, adjustPublicTrust } from '../press-system/integration';
import { StorySource, StoryTruth } from '../press-system/types';
import type { AttributionState } from '../espionage/espionage-types';
import {
    activeOrganizations,
    ensurePiracyState,
} from './organization-service';
import { basesOf } from './base-service';
import {
    EXPOSURE_THRESHOLDS,
    type ExposureStep,
    type OperationIntensity,
    type PirateAgreementKind,
    type PirateDoctrine,
    type PirateOrganization,
    type Sponsorship,
} from './piracy-types';

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** How much proof each intensity generates per active hour, before modifiers. */
const INTENSITY_EVIDENCE: Record<OperationIntensity, number> = {
    harassment: 0.002,
    economicDisruption: 0.005,
    blockade: 0.010,
};

/** Heat the band takes on for running at each intensity. */
const INTENSITY_HEAT: Record<OperationIntensity, number> = {
    harassment: 0.2,
    economicDisruption: 0.6,
    blockade: 1.2,
};

/**
 * Cold trails go cold. This has to be strong enough that cutting funding and
 * letting an asset cool is a genuinely viable play — otherwise every covert
 * sponsorship is merely a slow walk to exposure and the interesting decision
 * (when to stop) never exists.
 */
const EVIDENCE_DECAY_PER_HOUR = 0.005;
/** Seconds of inactivity after which a sponsorship stops generating proof. */
const ACTIVITY_WINDOW_SECONDS = 12 * 3600;

/** Step changes: a compromised base leaks far faster than tradecraft erodes. */
const LEAK_COMPROMISED_BASE = 0.15;
const LEAK_MUTINOUS_CREW = 0.10;
/** Crew loyalty below which a band's own people start talking. */
const LOYALTY_LEAK_THRESHOLD = 30;

/** Standing a sponsorship buys the sponsor with the band, per tick of funding. */
const SPONSOR_STANDING_PER_TICK = 0.5;
/** Being somebody's asset grates on the crews. */
const SPONSOR_LOYALTY_DRAG_PER_HOUR = 0.15;

/** Consequences of a public exposure. */
const EXPOSURE_TRUST_HIT = 12;
const EXPOSURE_RIVALRY_JUMP = 25;
const EXPOSURE_ESCALATION_JUMP = 2;

/** A marque needs a real war to be a legal instrument rather than a confession. */
const MARQUE_MIN_ESCALATION = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function sponsorshipsOf(world: GameWorldState, organizationId: string): Sponsorship[] {
    return [...ensurePiracyState(world).sponsorships.values()]
        .filter(s => s.organizationId === organizationId && !s.revokedAtSeconds);
}

export function sponsorshipsBy(world: GameWorldState, sponsorFactionId: string): Sponsorship[] {
    return [...ensurePiracyState(world).sponsorships.values()]
        .filter(s => s.sponsorFactionId === sponsorFactionId && !s.revokedAtSeconds);
}

/** Which rung of the ladder a given amount of proof sits on. */
export function exposureStep(evidence: number): ExposureStep {
    if (evidence >= EXPOSURE_THRESHOLDS.exposed) return 'exposed';
    if (evidence >= EXPOSURE_THRESHOLDS.attributed) return 'attributed';
    if (evidence >= EXPOSURE_THRESHOLDS.suspected) return 'suspected';
    return 'invisible';
}

/**
 * The espionage system carries three states, the design describes four rungs.
 * `attributed` — the victim is privately certain but cannot prove it publicly —
 * maps onto `suspected` with a high probability on the attribution record.
 */
function attributionFor(step: ExposureStep): AttributionState {
    if (step === 'exposed') return 'exposed';
    if (step === 'invisible') return 'invisible';
    return 'suspected';
}

function adjustWing(org: PirateOrganization, doctrine: PirateDoctrine, delta: number): void {
    const wing = org.factions.find(f => f.doctrine === doctrine);
    if (wing) wing.satisfaction = Math.max(0, Math.min(100, wing.satisfaction + delta));
}

function escalationBetween(world: GameWorldState, a: string, b: string): number {
    for (const rivalry of world.rivalries?.values() ?? []) {
        const pair = (rivalry.empireAId === a && rivalry.empireBId === b)
            || (rivalry.empireAId === b && rivalry.empireBId === a);
        if (pair) return rivalry.escalationLevel ?? 0;
    }
    return 0;
}

// ─── Opening and closing ─────────────────────────────────────────────────────

export interface SponsorshipOptions {
    targetFactionId?: string | null;
    intensity?: OperationIntensity;
    fundingPerHour?: number;
    supplies?: { ammo?: number; hulls?: number; intelReports?: number };
    covert?: boolean;
}

export function openSponsorship(
    world: GameWorldState,
    org: PirateOrganization,
    sponsorFactionId: string,
    options: SponsorshipOptions = {}
): Sponsorship | null {
    if (org.dissolvedAtSeconds) return null;
    const piracy = ensurePiracyState(world);

    // Amending an existing arrangement rather than stacking a second one.
    const existing = sponsorshipsOf(world, org.id)
        .find(s => s.sponsorFactionId === sponsorFactionId);
    if (existing) {
        if (options.targetFactionId !== undefined) existing.targetFactionId = options.targetFactionId;
        if (options.intensity) existing.intensity = options.intensity;
        if (options.fundingPerHour !== undefined) existing.fundingPerHour = options.fundingPerHour;
        if (options.supplies) existing.supplies = { ...existing.supplies, ...options.supplies };
        return existing;
    }

    const sponsorship: Sponsorship = {
        id: `pspon-${org.id}-${sponsorFactionId}-${world.nowSeconds}`,
        organizationId: org.id,
        sponsorFactionId,
        targetFactionId: options.targetFactionId ?? null,
        intensity: options.intensity ?? 'harassment',
        fundingPerHour: options.fundingPerHour ?? 500,
        supplies: options.supplies ?? {},
        covert: options.covert ?? true,
        startedAtSeconds: world.nowSeconds,
        evidence: 0,
        attributionState: 'invisible',
    };
    piracy.sponsorships.set(sponsorship.id, sponsorship);

    // Money and guns buy influence with the wing that wanted contracts, and
    // resentment from the one that wanted to answer to nobody.
    adjustWing(org, 'corsair', 10);
    adjustWing(org, 'traditionalist', -12);

    const relation = org.relations[sponsorFactionId];
    if (relation) {
        relation.standing = Math.min(100, relation.standing + 20);
        relation.secret = sponsorship.covert;
    } else {
        org.relations[sponsorFactionId] = {
            factionId: sponsorFactionId,
            standing: 20,
            agreements: [sponsorship.covert ? 'secretContract' : 'privateering'],
            lastContactTick: world.nowSeconds,
            secret: sponsorship.covert,
        };
    }

    console.log(
        `[Piracy] ${sponsorFactionId} ${sponsorship.covert ? 'quietly funds' : 'commissions'} ${org.name}`
        + (sponsorship.targetFactionId ? ` against ${sponsorship.targetFactionId}` : '')
    );
    return sponsorship;
}

/** Set what the sponsor is paying for. The band still chooses how. */
export function setOperation(
    world: GameWorldState,
    sponsorshipId: string,
    intensity: OperationIntensity,
    targetFactionId: string | null
): boolean {
    const sponsorship = ensurePiracyState(world).sponsorships.get(sponsorshipId);
    if (!sponsorship || sponsorship.revokedAtSeconds) return false;
    sponsorship.intensity = intensity;
    sponsorship.targetFactionId = targetFactionId;
    return true;
}

/**
 * Walk away. The band keeps what it has and remembers being dropped — an
 * organization dropped twice stops taking sponsors at all.
 */
export function cutSponsorship(world: GameWorldState, sponsorshipId: string): boolean {
    const piracy = ensurePiracyState(world);
    const sponsorship = piracy.sponsorships.get(sponsorshipId);
    if (!sponsorship) return false;

    const org = piracy.organizations.get(sponsorship.organizationId);
    piracy.sponsorships.delete(sponsorshipId);
    if (!org) return true;

    const relation = org.relations[sponsorship.sponsorFactionId];
    if (relation) relation.standing = Math.max(-100, relation.standing - 25);

    // An abandoned corsair wing is a humiliated corsair wing, and an armed,
    // organized fleet with no income is how the worst outbreaks start.
    adjustWing(org, 'corsair', -25);
    adjustWing(org, 'raider', 15);
    console.log(`[Piracy] ${sponsorship.sponsorFactionId} drops ${org.name}`);
    return true;
}

// ─── Privateering ────────────────────────────────────────────────────────────

/**
 * The daylight version: an open commission against a named enemy. No
 * deniability, no evidence, legal port access — and a war record the band can
 * point at afterwards when it asks to be recognized as a state.
 */
export function issueMarque(
    world: GameWorldState,
    org: PirateOrganization,
    sponsorFactionId: string,
    targetFactionId: string
): Sponsorship | null {
    if (escalationBetween(world, sponsorFactionId, targetFactionId) < MARQUE_MIN_ESCALATION) {
        return null;   // a marque without a war is just a confession
    }

    const sponsorship = openSponsorship(world, org, sponsorFactionId, {
        targetFactionId,
        intensity: 'economicDisruption',
        covert: false,
    });
    if (!sponsorship) return null;

    sponsorship.covert = false;
    // Nothing to hide means nothing to find.
    sponsorship.evidence = 0;
    sponsorship.attributionState = 'invisible';

    const relation = org.relations[sponsorFactionId];
    if (relation) {
        relation.secret = false;
        if (!relation.agreements.includes('privateering')) relation.agreements.push('privateering');
    }
    adjustWing(org, 'corsair', 15);
    console.log(`[Piracy] ${sponsorFactionId} issues ${org.name} a letter of marque against ${targetFactionId}`);
    return sponsorship;
}

/**
 * Peace is signed and the commission ends. What is left is an armed, organized,
 * well-supplied fleet with no income and a detailed knowledge of the sponsor's
 * ports — which is historically exactly how this goes wrong.
 */
export function revokeMarque(world: GameWorldState, sponsorshipId: string): boolean {
    const piracy = ensurePiracyState(world);
    const sponsorship = piracy.sponsorships.get(sponsorshipId);
    if (!sponsorship || sponsorship.covert) return false;

    sponsorship.revokedAtSeconds = world.nowSeconds;
    const org = piracy.organizations.get(sponsorship.organizationId);
    if (org) {
        adjustWing(org, 'raider', 25);
        adjustWing(org, 'corsair', -20);
        org.crewLoyalty = Math.max(0, org.crewLoyalty - 5);
        console.log(`[Piracy] ${org.name}'s marque is revoked — an armed fleet with no employer`);
    }
    piracy.sponsorships.delete(sponsorshipId);
    return true;
}

// ─── Exposure ────────────────────────────────────────────────────────────────

/** How badly a band leaks: unhappy crews and burned bases talk. */
function pirateSloppiness(world: GameWorldState, org: PirateOrganization): number {
    const loyaltyTerm = 1 - org.crewLoyalty / 100;
    const bases = basesOf(world, org);
    const cover = bases.length > 0
        ? bases.reduce((sum, b) => sum + b.concealment, 0) / bases.length
        : 0.5;
    return Math.max(0, Math.min(1, loyaltyTerm * 0.6 + (1 - cover) * 0.4));
}

function sponsorTradecraft(world: GameWorldState, factionId: string): number {
    const intel = world.espionage?.factionIntel?.get(factionId);
    const counter = intel?.counterIntelStrength ?? 0;
    const internal = intel?.internalSecurity ?? 0;
    return Math.max(0, Math.min(0.9, (counter + internal) / 200));
}

function victimPressure(world: GameWorldState, factionId: string | null): number {
    if (!factionId) return 0;
    const intel = world.espionage?.factionIntel?.get(factionId);
    return Math.max(0, Math.min(1, (intel?.counterIntelStrength ?? 0) / 100));
}

/**
 * Publish. Everything here runs through systems that already exist: the press
 * decides how loudly to carry it, diplomacy turns it into tension, and the
 * sponsor's own public trust pays for it at home.
 */
function applyExposure(world: GameWorldState, sponsorship: Sponsorship, org: PirateOrganization): void {
    const sponsor = sponsorship.sponsorFactionId;
    const victim = sponsorship.targetFactionId;

    pushWorldStory(world, {
        targetEmpireId: sponsor,
        subject: `Evidence ties ${sponsor} to the ${org.name} raids`
            + (victim ? ` on ${victim} shipping` : ''),
        magnitude: sponsorship.intensity === 'blockade' ? 85
            : sponsorship.intensity === 'economicDisruption' ? 60 : 40,
        source: StorySource.ESPIONAGE_LEAK,
        truth: StoryTruth.TRUE,
        evidence: Math.round(sponsorship.evidence * 100),
    });
    adjustPublicTrust(world, sponsor, -EXPOSURE_TRUST_HIT);

    // The victim now has a grievance the diplomacy system understands.
    if (victim) {
        for (const rivalry of world.rivalries?.values() ?? []) {
            const pair = (rivalry.empireAId === sponsor && rivalry.empireBId === victim)
                || (rivalry.empireAId === victim && rivalry.empireBId === sponsor);
            if (!pair) continue;
            rivalry.rivalryScore = Math.min(100, (rivalry.rivalryScore ?? 0) + EXPOSURE_RIVALRY_JUMP);
            rivalry.escalationLevel = Math.min(7, (rivalry.escalationLevel ?? 0) + EXPOSURE_ESCALATION_JUMP);
        }
    }

    // The band pays too: its corsair wing is humiliated and the wing that said
    // taking a patron was a mistake has just been proved right.
    adjustWing(org, 'corsair', -30);
    adjustWing(org, 'traditionalist', 25);
    org.heat = Math.min(100, org.heat + 15);

    const records = world.espionage?.attributionRecords;
    if (Array.isArray(records)) {
        records.push({
            operationId: sponsorship.id,
            suspectedFactionId: sponsor,
            attributionState: 'exposed',
            probability: 1,
            tensionApplied: EXPOSURE_RIVALRY_JUMP,
            resolvedAt: new Date(world.nowSeconds * 1000).toISOString(),
        });
    }

    console.log(`[Piracy] EXPOSED: ${sponsor} was funding ${org.name}`);
}

/** A private certainty: the victim knows, and can act, but cannot publish. */
function applyAttribution(world: GameWorldState, sponsorship: Sponsorship): void {
    const records = world.espionage?.attributionRecords;
    if (!Array.isArray(records)) return;
    if (records.some(r => r.operationId === sponsorship.id && r.attributionState === 'suspected')) return;

    records.push({
        operationId: sponsorship.id,
        suspectedFactionId: sponsorship.sponsorFactionId,
        attributionState: 'suspected',
        probability: Math.round(sponsorship.evidence * 100) / 100,
        tensionApplied: 0,
        resolvedAt: new Date(world.nowSeconds * 1000).toISOString(),
    });
}

// ─── Step 11h — the sponsorship tick ─────────────────────────────────────────

export function tickSponsorship(world: GameWorldState, deltaSeconds: number): void {
    const piracy = ensurePiracyState(world);
    const hours = Math.max(0, deltaSeconds / 3600);
    if (hours <= 0) return;

    for (const sponsorship of [...piracy.sponsorships.values()]) {
        const org = piracy.organizations.get(sponsorship.organizationId);
        if (!org || org.dissolvedAtSeconds) {
            piracy.sponsorships.delete(sponsorship.id);
            continue;
        }

        // 1. Pay. A sponsor who cannot pay is not a sponsor.
        const due = sponsorship.fundingPerHour * hours;
        const reserves = world.economy?.factions?.get(sponsorship.sponsorFactionId)?.reserves as
            Record<string, number> | undefined;
        if (!reserves || (reserves[Resource.CREDITS] ?? 0) < due) {
            cutSponsorship(world, sponsorship.id);
            continue;
        }
        reserves[Resource.CREDITS] -= due;
        org.treasury += due;

        // Supplies arrive as materiel the band would otherwise have to steal.
        if (sponsorship.supplies.ammo) org.treasury += sponsorship.supplies.ammo * hours;

        // 2. Being somebody's creature costs standing with your own crews, and
        //    running hot costs heat whoever is paying for it.
        org.crewLoyalty = Math.max(0, org.crewLoyalty - SPONSOR_LOYALTY_DRAG_PER_HOUR * hours);
        org.heat = Math.min(100, org.heat + INTENSITY_HEAT[sponsorship.intensity] * hours);
        const relation = org.relations[sponsorship.sponsorFactionId];
        if (relation) relation.standing = Math.min(100, relation.standing + SPONSOR_STANDING_PER_TICK * hours);

        // 3. Evidence. An open commission has nothing to find.
        if (!sponsorship.covert) {
            sponsorship.evidence = 0;
            sponsorship.attributionState = 'invisible';
            continue;
        }

        // Investigations always go stale; an active operation just produces new
        // material faster than the old material rots.
        sponsorship.evidence = Math.max(0, sponsorship.evidence - EVIDENCE_DECAY_PER_HOUR * hours);

        const active = world.nowSeconds - org.lastRaidAtSeconds <= ACTIVITY_WINDOW_SECONDS;
        if (active) {
            const gain = INTENSITY_EVIDENCE[sponsorship.intensity]
                * (1 - sponsorTradecraft(world, sponsorship.sponsorFactionId))
                * (1 + victimPressure(world, sponsorship.targetFactionId))
                * (1 + pirateSloppiness(world, org))
                * hours;
            sponsorship.evidence += gain;
        }

        // 4. Leaks are step changes, not drift. A base somebody has turned is
        //    the single fastest way for a sponsor to be found out.
        const compromised = basesOf(world, org).filter(b => b.compromisedByFactionId);
        if (compromised.length > 0) {
            sponsorship.evidence += LEAK_COMPROMISED_BASE * compromised.length;
        }
        if (org.crewLoyalty < LOYALTY_LEAK_THRESHOLD) {
            const rng = new RNG(seedFromString(`piracy|leak|${sponsorship.id}|${world.nowSeconds}`));
            if (rng.check(0.15 * hours)) sponsorship.evidence += LEAK_MUTINOUS_CREW;
        }

        sponsorship.evidence = Math.max(0, Math.min(1, sponsorship.evidence));

        // 5. Transitions.
        const step = exposureStep(sponsorship.evidence);
        const nextState = attributionFor(step);
        if (nextState !== sponsorship.attributionState) {
            sponsorship.attributionState = nextState;
            // Exposure happens ONCE. Evidence dips below the line whenever the
            // band goes quiet for a few ticks, and without this guard the next
            // raid re-crossed it and re-ran the whole payload: another press
            // story, another trust hit, another rivalry jump, indefinitely.
            if (step === 'exposed' && !sponsorship.exposedAtSeconds) {
                sponsorship.exposedAtSeconds = world.nowSeconds;
                applyExposure(world, sponsorship, org);
            } else if (nextState === 'suspected') {
                applyAttribution(world, sponsorship);
            }
        } else if (step === 'attributed') {
            applyAttribution(world, sponsorship);
        }
    }
}

// ─── Pirate diplomacy ────────────────────────────────────────────────────────

export interface NegotiationOffer {
    kind: PirateAgreementKind;
    /** Credits per hour offered, where the agreement takes a payment. */
    paymentPerHour?: number;
    /** Whether the arrangement is to be kept quiet. */
    secret?: boolean;
}

export interface NegotiationResult {
    accepted: boolean;
    reason?: string;
    /** What the band asked for, when it refused the offer as made. */
    counterPerHour?: number;
}

/**
 * Bands are counterparties, not monsters. Hostility is a relation, and
 * relations are purchasable — which is why an empire may rationally tolerate,
 * and eventually legitimize, an organization it could have destroyed.
 */
export function negotiate(
    world: GameWorldState,
    org: PirateOrganization,
    factionId: string,
    offer: NegotiationOffer
): NegotiationResult {
    if (org.dissolvedAtSeconds) return { accepted: false, reason: 'nobody left to talk to' };

    const relation = org.relations[factionId];
    const standing = relation?.standing ?? 0;

    // Negotiating strength: they fear you, they need you, minus the fact that
    // everyone can see the fleet coming for them.
    const leverage = org.infamy + org.networkControl - org.heat;

    switch (offer.kind) {
        case 'nonAggression':
        case 'protection':
        case 'tribute': {
            const asking = Math.max(50, Math.round(leverage * 4));
            const offered = offer.paymentPerHour ?? 0;
            if (offered < asking) return { accepted: false, reason: 'not enough', counterPerHour: asking };
            break;
        }
        case 'recognition': {
            // Only a state can be recognized as one.
            if (org.stage < 5) return { accepted: false, reason: 'not a state yet' };
            break;
        }
        case 'privateering': {
            if (standing < 0) return { accepted: false, reason: 'they do not trust you' };
            break;
        }
        case 'intelExchange':
        case 'trade':
        case 'secretContract':
        case 'hostageDeal':
            if (standing <= -80) return { accepted: false, reason: 'blood feud' };
            break;
    }

    const next = relation ?? {
        factionId,
        standing: 0,
        agreements: [] as PirateAgreementKind[],
        lastContactTick: world.nowSeconds,
        secret: offer.secret ?? true,
    };
    if (!next.agreements.includes(offer.kind)) next.agreements.push(offer.kind);
    next.standing = Math.min(100, next.standing + 15);
    next.lastContactTick = world.nowSeconds;
    if (offer.secret !== undefined) next.secret = offer.secret;
    if (offer.paymentPerHour !== undefined) next.tributePerTick = offer.paymentPerHour;
    org.relations[factionId] = next;

    // Whoever signs, somebody inside is unhappy about it.
    if (offer.kind === 'recognition' || offer.kind === 'privateering') {
        adjustWing(org, 'corsair', 12);
        adjustWing(org, 'traditionalist', -15);
    }

    console.log(`[Piracy] ${org.name} agrees ${offer.kind} with ${factionId}`);
    return { accepted: true };
}

/** Factions that have formally recognized this band as a state. */
export function recognizedBy(org: PirateOrganization): string[] {
    return Object.values(org.relations)
        .filter(r => r.agreements.includes('recognition'))
        .map(r => r.factionId);
}

// ─── Sponsor interference ────────────────────────────────────────────────────

/**
 * Putting your own man on the throne of a confederacy: the cheapest strategic
 * asset in the game and the easiest to expose. Requires a patron's standing.
 */
export function backSuccessor(
    world: GameWorldState,
    org: PirateOrganization,
    sponsorFactionId: string,
    doctrine: PirateDoctrine
): boolean {
    if ((org.relations[sponsorFactionId]?.standing ?? 0) < 60) return false;

    const wing = org.factions.find(f => f.doctrine === doctrine);
    if (!wing) return false;

    // Money moves pressure toward the wing the sponsor wants in charge.
    const gain = Math.min(20, 100 - wing.pressure);
    wing.pressure += gain;
    const others = org.factions.filter(f => f.doctrine !== doctrine);
    for (const other of others) other.pressure = Math.max(0, other.pressure - gain / others.length);

    // The people who wanted no patron at all can see exactly what is happening.
    adjustWing(org, 'traditionalist', -10);

    // Meddling is itself evidence.
    for (const sponsorship of sponsorshipsOf(world, org.id)) {
        if (sponsorship.sponsorFactionId === sponsorFactionId && sponsorship.covert) {
            sponsorship.evidence = Math.min(1, sponsorship.evidence + 0.08);
        }
    }
    return true;
}

/**
 * The sponsor-set posture override. A band paid to blockade a rival strangles
 * the lane whatever its own wings would have preferred — and takes the heat.
 */
export function sponsoredIntensity(
    world: GameWorldState,
    org: PirateOrganization,
    victimFactionId?: string
): OperationIntensity | null {
    for (const sponsorship of sponsorshipsOf(world, org.id)) {
        if (!sponsorship.targetFactionId) continue;
        if (victimFactionId && sponsorship.targetFactionId !== victimFactionId) continue;
        return sponsorship.intensity;
    }
    return null;
}
