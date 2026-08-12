// lib/piracy/pirate-view.ts
// Pirate system Phase 9 — what a faction is allowed to know.
//
// Design: docs/pirate-system/systems.md §8.
//
// This is the single most load-bearing file in the system for anything except
// the simulation itself. Every mechanic that matters — the exposure ladder,
// hidden bases, falsified intel, secret contracts — is a mechanic about
// ASYMMETRIC INFORMATION. Ship the raw aggregate to the client and all of it
// collapses at once: a player who can read `sponsorship.covert` in a network
// tab never has to investigate anything.
//
// So the rule here is deny-by-default. A faction sees: bands it has met, bases
// it has found, contracts it is a party to, its own sponsorships (and only the
// attribution state of other people's), and never the hidden truth flags.

import type { GameWorldState } from '../game-world-state';
import { ensurePiracyState } from './organization-service';
import { exposureStep } from './sponsorship-service';
import type {
    ExposureStep,
    PirateBase,
    PirateBounty,
    PirateDoctrine,
    PirateOrganization,
    PirateStage,
    ProtectionContract,
} from './piracy-types';

/** What one faction knows about one band. Deliberately less than the truth. */
export interface KnownOrganization {
    id: string;
    name: string;
    /** Best public estimate. A band nobody has fought reads as a rumour. */
    stage: PirateStage | null;
    /** Fame is public by definition. */
    infamy: number;
    /** How hard THIS faction is hunting them — not the aggregate. */
    heatToward: number;
    /** Only visible once they have started acting like an institution. */
    networkControl: number | null;
    doctrine: PirateDoctrine | null;
    knownBaseCount: number;
    /** Standing with us, if we have ever dealt with them. */
    standing: number | null;
    /** Agreements WE are party to. Never anyone else's. */
    ourAgreements: string[];
    dissolved: boolean;
}

export interface KnownBase {
    id: string;
    organizationId: string;
    kind: string;
    systemId: string;
    /** True when we have somebody inside rather than just a location. */
    compromisedByUs: boolean;
}

/** A sponsorship as seen from outside: a suspicion, not a ledger entry. */
export interface SuspectedSponsorship {
    organizationId: string;
    /** Only populated once the trail actually points somewhere. */
    suspectedFactionId: string | null;
    step: ExposureStep;
    /** 0–1, and only shown from `suspected` upward. */
    confidence: number | null;
}

/** Our own sponsorships, in full — we know what we are paying for. */
export interface OwnSponsorship {
    id: string;
    organizationId: string;
    targetFactionId: string | null;
    intensity: string;
    fundingPerHour: number;
    covert: boolean;
    /** How close we are to being caught. The whole tension surface. */
    exposure: ExposureStep;
    evidence: number;
}

export interface PirateView {
    organizations: KnownOrganization[];
    bases: KnownBase[];
    contracts: ProtectionContract[];
    ownSponsorships: OwnSponsorship[];
    suspectedSponsorships: SuspectedSponsorship[];
    bounties: PirateBounty[];
    /** systemId → 0–100 for bands we can see operating there. */
    influence: Record<string, number>;
    /** Set when this faction IS a band rather than merely dealing with one. */
    playedOrganizationId: string | null;
}

// ─── Contact ─────────────────────────────────────────────────────────────────

/**
 * Whether a faction has met a band at all. Being raided counts, so does having
 * found one of their bases, signing anything, or paying to have them hunted.
 */
export function hasContact(
    world: GameWorldState,
    org: PirateOrganization,
    factionId: string
): boolean {
    if (org.playerFactionId === factionId) return true;
    if (org.relations[factionId]) return true;
    if ((org.heatByFaction[factionId] ?? 0) > 0) return true;

    const piracy = ensurePiracyState(world);
    for (const base of piracy.bases.values()) {
        if (base.organizationId !== org.id) continue;
        if (base.knownToFactionIds.includes(factionId)) return true;
        if (base.compromisedByFactionId === factionId) return true;
    }
    for (const contract of piracy.protectionContracts.values()) {
        if (contract.organizationId === org.id && contract.payerId === factionId) return true;
    }
    for (const sponsorship of piracy.sponsorships.values()) {
        if (sponsorship.organizationId === org.id && sponsorship.sponsorFactionId === factionId) return true;
    }
    return false;
}

/** How much of a band's shape a faction can make out, by how well it knows them. */
function familiarity(world: GameWorldState, org: PirateOrganization, factionId: string): number {
    const piracy = ensurePiracyState(world);
    let score = 0;
    if (org.relations[factionId]) score += 2;
    if ((org.heatByFaction[factionId] ?? 0) > 0) score += 1;
    for (const base of piracy.bases.values()) {
        if (base.organizationId !== org.id) continue;
        if (base.compromisedByFactionId === factionId) score += 3;
        else if (base.knownToFactionIds.includes(factionId)) score += 1;
    }
    return score;
}

// ─── The projection ──────────────────────────────────────────────────────────

export function buildPirateView(world: GameWorldState, factionId: string): PirateView {
    const piracy = ensurePiracyState(world);

    const organizations: KnownOrganization[] = [];
    for (const org of piracy.organizations.values()) {
        if (!hasContact(world, org, factionId)) continue;
        const known = familiarity(world, org, factionId);
        const ourBases = [...piracy.bases.values()].filter(b =>
            b.organizationId === org.id
            && (b.knownToFactionIds.includes(factionId) || b.compromisedByFactionId === factionId)
        );
        const relation = org.relations[factionId];

        organizations.push({
            id: org.id,
            name: org.name,
            // A band you have merely been raided by is a rumour with a name.
            stage: known >= 2 ? org.stage : null,
            infamy: Math.round(org.infamy),
            heatToward: Math.round(org.heatByFaction[factionId] ?? 0),
            networkControl: known >= 3 ? Math.round(org.networkControl) : null,
            doctrine: known >= 3 ? org.doctrine : null,
            knownBaseCount: ourBases.length,
            standing: relation ? relation.standing : null,
            ourAgreements: relation ? [...relation.agreements] : [],
            dissolved: !!org.dissolvedAtSeconds,
        });
    }

    const bases: KnownBase[] = [];
    for (const base of piracy.bases.values()) {
        const compromised = base.compromisedByFactionId === factionId;
        if (!compromised && !base.knownToFactionIds.includes(factionId)) continue;
        bases.push({
            id: base.id,
            organizationId: base.organizationId,
            kind: base.kind,
            systemId: base.systemId,
            compromisedByUs: compromised,
        });
    }

    // Contracts we are a party to. A rival's protection arrangement is theirs.
    const contracts = [...piracy.protectionContracts.values()].filter(c =>
        c.payerId === factionId
        || (!c.secret && hasContactWithOrgId(world, c.organizationId, factionId))
    );

    const ownSponsorships: OwnSponsorship[] = [];
    const suspectedSponsorships: SuspectedSponsorship[] = [];
    for (const sponsorship of piracy.sponsorships.values()) {
        if (sponsorship.sponsorFactionId === factionId) {
            ownSponsorships.push({
                id: sponsorship.id,
                organizationId: sponsorship.organizationId,
                targetFactionId: sponsorship.targetFactionId,
                intensity: sponsorship.intensity,
                fundingPerHour: sponsorship.fundingPerHour,
                covert: sponsorship.covert,
                exposure: exposureStep(sponsorship.evidence),
                evidence: sponsorship.evidence,
            });
            continue;
        }

        // Somebody else's arrangement. An open commission is public; a covert
        // one is only as visible as the investigation into it has got.
        const step = sponsorship.covert ? exposureStep(sponsorship.evidence) : 'exposed';
        if (step === 'invisible') continue;
        const named = step === 'exposed' || step === 'attributed';
        suspectedSponsorships.push({
            organizationId: sponsorship.organizationId,
            suspectedFactionId: named ? sponsorship.sponsorFactionId : null,
            step,
            confidence: Math.round(sponsorship.evidence * 100) / 100,
        });
    }

    const influence: Record<string, number> = {};
    const visibleOrgIds = new Set(organizations.map(o => o.id));
    for (const sys of world.movement.systems.values()) {
        for (const [orgId, grip] of Object.entries(sys.pirateInfluence ?? {})) {
            if (!visibleOrgIds.has(orgId)) continue;
            influence[sys.id] = Math.max(influence[sys.id] ?? 0, Math.round(grip));
        }
    }

    const played = [...piracy.organizations.values()].find(o => o.playerFactionId === factionId);

    return {
        organizations,
        bases,
        contracts,
        ownSponsorships,
        suspectedSponsorships,
        bounties: [...piracy.bounties.values()].filter(b => !b.claimedByFactionId),
        influence,
        playedOrganizationId: played?.id ?? null,
    };
}

function hasContactWithOrgId(world: GameWorldState, orgId: string, factionId: string): boolean {
    const org = ensurePiracyState(world).organizations.get(orgId);
    return !!org && hasContact(world, org, factionId);
}

// ─── The band's own dashboard ────────────────────────────────────────────────

/**
 * Everything a pirate PLAYER sees about their own organization. Note what is
 * absent: a territory count. The entity is not measured that way, and showing
 * it would be a lie about what the player is playing.
 */
export interface PirateDashboard {
    organizationId: string;
    name: string;
    stage: PirateStage;
    doctrine: PirateDoctrine;
    leaderName: string | null;
    inSuccession: boolean;

    infamy: number;
    heat: number;
    heatByFaction: Record<string, number>;
    networkControl: number;
    blackMarketLiquidity: number;
    crewLoyalty: number;
    treasury: number;

    fleets: number;
    supportableFleets: number;
    bases: Array<{ id: string; kind: string; systemId: string; concealment: number; ready: boolean }>;
    wings: Array<{ doctrine: PirateDoctrine; pressure: number; satisfaction: number }>;
    contracts: ProtectionContract[];
    sponsors: Array<{ id: string; sponsorFactionId: string; intensity: string; exposure: ExposureStep }>;
    bountiesOnUs: PirateBounty[];
}

export function buildPirateDashboard(
    world: GameWorldState,
    organizationId: string
): PirateDashboard | null {
    const piracy = ensurePiracyState(world);
    const org = piracy.organizations.get(organizationId);
    if (!org) return null;

    const bases: PirateBase[] = org.baseIds
        .map(id => piracy.bases.get(id))
        .filter((b): b is PirateBase => !!b);

    return {
        organizationId: org.id,
        name: org.name,
        stage: org.stage,
        doctrine: org.doctrine,
        leaderName: org.leader?.name ?? null,
        inSuccession: piracy.successions.has(org.id),

        infamy: Math.round(org.infamy),
        heat: Math.round(org.heat),
        heatByFaction: { ...org.heatByFaction },
        networkControl: Math.round(org.networkControl),
        blackMarketLiquidity: Math.round(org.blackMarketLiquidity),
        crewLoyalty: Math.round(org.crewLoyalty),
        treasury: Math.round(org.treasury),

        fleets: org.fleetIds.length,
        supportableFleets: 2 + bases
            .filter(b => world.nowSeconds >= b.readyAtSeconds && b.integrity > 0)
            .reduce((sum, b) => sum + b.berths, 0),
        bases: bases.map(b => ({
            id: b.id,
            kind: b.kind,
            systemId: b.systemId,
            concealment: Math.round(b.concealment * 100) / 100,
            ready: world.nowSeconds >= b.readyAtSeconds,
        })),
        wings: org.factions.map(f => ({
            doctrine: f.doctrine,
            pressure: Math.round(f.pressure),
            satisfaction: Math.round(f.satisfaction),
        })),
        contracts: [...piracy.protectionContracts.values()]
            .filter(c => c.organizationId === org.id && !c.breachedAtSeconds),
        sponsors: [...piracy.sponsorships.values()]
            .filter(s => s.organizationId === org.id)
            .map(s => ({
                id: s.id,
                sponsorFactionId: s.sponsorFactionId,
                intensity: s.intensity,
                exposure: exposureStep(s.evidence),
            })),
        bountiesOnUs: [...piracy.bounties.values()]
            .filter(b => b.targetOrganizationId === org.id && !b.claimedByFactionId),
    };
}

/**
 * Strip the pirate aggregate down to what is safe to put in the SHARED session
 * snapshot every client reads. Anything asymmetric has to arrive through the
 * per-faction view instead.
 */
export function publicPiracyState(world: GameWorldState) {
    const piracy = ensurePiracyState(world);
    return {
        // Names and fame are public; everything operational is not.
        organizations: [...piracy.organizations.values()].map(org => ({
            id: org.id,
            name: org.name,
            infamy: Math.round(org.infamy),
            dissolved: !!org.dissolvedAtSeconds,
            legitimizedAsFactionId: org.legitimizedAsFactionId,
        })),
        // Bounties are advertisements. They are meant to be seen.
        bounties: [...piracy.bounties.values()].filter(b => !b.claimedByFactionId),
    };
}
