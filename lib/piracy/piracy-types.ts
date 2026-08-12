// lib/piracy/piracy-types.ts
// Pirate system — the organization entity.
//
// Design: docs/pirate-system/organizations.md and docs/pirate-system/metrics.md.
//
// The unit of the pirate system is the organization, not the raider fleet.
// Fleets are what an organization spends; infamy, heat, network control,
// black-market liquidity and crew loyalty are what it *is*. Killing a fleet
// costs an organization an asset; killing an organization means dismantling a
// network.

import type { AttributionState } from '../espionage/espionage-types';

export type PirateStage = 1 | 2 | 3 | 4 | 5;

export type PirateDoctrine =
    | 'raider'          // expansion through violence
    | 'smuggler'        // stable illegal trade
    | 'corsair'         // government contracts
    | 'merchant'        // legitimate commerce
    | 'traditionalist'; // independence above all

export const PIRATE_DOCTRINES: PirateDoctrine[] = [
    'raider', 'smuggler', 'corsair', 'merchant', 'traditionalist'
];

export type PirateOrigin =
    | 'frontier_desperation'
    | 'war_refugee'
    | 'mutiny'
    | 'secession_remnant'
    | 'smuggler_syndicate'
    | 'sponsored'
    | 'corporate_deniable';

/** One wing of an organization's internal politics. Pressure shares sum to 100. */
export interface PirateInternalFaction {
    doctrine: PirateDoctrine;
    /** 0–100 share of internal influence. */
    pressure: number;
    /** 0–100. A furious minority is noise; a furious plurality is a civil war. */
    satisfaction: number;
}

export interface PirateLeader {
    id: string;
    name: string;
    /** Biases the organization's doctrine toward their own wing. */
    doctrine: PirateDoctrine;
    /** 0–100 — raid success and negotiation strength. */
    competence: number;
    /** 0–100 — loyalty held by fear rather than by profit. */
    ruthlessness: number;
    /** 0–100 — feeds organization infamy. */
    reputation: number;
    /** Set when this leader is a sponsor's creature. */
    boundToSponsorId?: string;
    /** Set when alive and in someone's custody. */
    capturedByFactionId?: string;
}

export type PirateAgreementKind =
    | 'nonAggression' | 'protection' | 'trade' | 'secretContract'
    | 'privateering' | 'intelExchange' | 'hostageDeal' | 'tribute'
    /** A real faction acknowledging the band as a state. Stage V only. */
    | 'recognition';

export interface PirateRelation {
    factionId: string;
    /** −100 (blood feud) … +100 (patron). */
    standing: number;
    agreements: PirateAgreementKind[];
    tributePerTick?: number;
    lastContactTick: number;
    /** Hidden from other factions until intel or exposure reveals it. */
    secret: boolean;
}

export interface PirateOrganization {
    id: string;                        // 'porg-crimson-corsairs'
    name: string;
    stage: PirateStage;
    origin: PirateOrigin;
    /** Sim clock (unix seconds), matching ForwardBase.establishedAtSeconds. */
    foundedAtSeconds: number;

    /** The region the organization considers its own water. Drives AI targeting. */
    homeSystemId: string;
    /** → PirateBase. Empty until the base network lands (Phase 3). */
    baseIds: string[];
    /** → Fleet ids under factionId 'faction-pirates'. */
    fleetIds: string[];

    // ── Power metrics — docs/pirate-system/metrics.md ────────────────────────
    /** 0–100. How famous and feared. Buys recruits and leverage; costs heat. */
    infamy: number;
    /** 0–100 aggregate. How hard governments are hunting them. */
    heat: number;
    /** Who specifically wants them dead. factionId → 0–100. */
    heatByFaction: Record<string, number>;
    /** 0–100. Share of the regional criminal economy. Grows from Phase 5. */
    networkControl: number;
    /** Credits of underground throughput per tick. Grows from Phase 6. */
    blackMarketLiquidity: number;
    /** 0–100. Whether the organization stays united at all. */
    crewLoyalty: number;
    treasury: number;

    // ── Internal politics ────────────────────────────────────────────────────
    factions: PirateInternalFaction[];
    /** The highest-pressure wing. An organization becomes what it earns from. */
    doctrine: PirateDoctrine;
    leader: PirateLeader | null;

    // ── External relations ───────────────────────────────────────────────────
    relations: Record<string, PirateRelation>;

    // ── Running counters, for metrics and for the tech web's History Ledger ──
    raidsLanded: number;
    lootTaken: number;
    fleetsLost: number;
    /** Sim clock of the last landed raid. Drives how fast heat cools. */
    lastRaidAtSeconds: number;
    /** Consecutive ticks spent below the current stage's gate. 3 = demotion. */
    stageStress: number;

    /**
     * Set when a human player IS this band rather than merely dealing with one.
     * A pirate player's orders arrive under their faction id; this is what makes
     * them authoritative over the organization.
     */
    playerFactionId?: string;
    /**
     * routeId → posture a pirate player has standing orders for. The raid pass
     * honours it instead of choosing by doctrine and heat.
     */
    posturePreference?: Record<string, 'skim' | 'prey' | 'strangle'>;
    /** Raid type a pirate player has ordered, overriding the wings' preference. */
    preferredRaidType?: RaidType;

    /** Set when the organization has become a recognized state (Phase 8). */
    legitimizedAsFactionId?: string;
    /** Set when dissolved; kept briefly so intel reports can still name it. */
    dissolvedAtSeconds?: number;
}

// ─── Raids ───────────────────────────────────────────────────────────────────

/**
 * How aggressive a raid is. Each is a different trade between profit, heat,
 * infamy and what the victim does next — see docs/pirate-system/operations.md §2.
 */
export type RaidType =
    | 'robbery'        // cargo only; ship and crew released
    | 'capture'        // the hull itself, which now flies against its owner
    | 'sabotage'       // nothing taken; the segment stays degraded
    | 'hostage'        // personnel, and a negotiation a great power must join
    | 'destruction'    // nothing taken; fear across the whole corridor
    | 'economicRaid';  // one resource the victim's economy cannot substitute

export type HostageStatus = 'held' | 'ransomed' | 'killed' | 'rescued';

/**
 * Hostage-taking is how a Stage III band forces a great power to talk to it.
 * Refusing costs the victim's government at home and turns the band permanently
 * hostile; paying legitimizes them a little.
 */
export interface HostageDeal {
    id: string;
    organizationId: string;
    victimFactionId: string;
    routeId: string;
    demandCredits: number;
    takenAtSeconds: number;
    expiresAtSeconds: number;
    status: HostageStatus;
}

// ─── The protection economy ──────────────────────────────────────────────────

export type ProtectionPayerKind = 'faction' | 'company';

/**
 * "Pay us and we won't attack you." The moment a band works out that taxing
 * commerce beats destroying it, it stops being a cost an empire absorbs and
 * becomes an institution its merchants use. See docs/pirate-system/operations.md §5.
 */
export interface ProtectionContract {
    id: string;
    organizationId: string;
    /** Who pays: a faction treasury or a chartered company. */
    payerId: string;
    payerKind: ProtectionPayerKind;
    /** Routes covered. A raid on any of them is a breach. */
    routeIds: string[];
    feePerHour: number;
    /**
     * Whether the band also promised to keep OTHER pirates off. This is the
     * point where pirate fleets start defending trade against pirate fleets.
     */
    exclusiveDefence: boolean;
    signedAtSeconds: number;
    expiresAtSeconds: number;
    /** Hidden from everyone but the two parties until intel exposes it. */
    secret: boolean;
    /** Set when the band raided a covered lane. Clients notice. */
    breachedAtSeconds?: number;
}

/**
 * The same mechanic at system scale, available once a band is a confederacy:
 * a system pays not to be raided at all. The owner books it as an expense; the
 * band books it as taxation.
 */
export interface TributeAgreement {
    id: string;
    organizationId: string;
    payerFactionId: string;
    systemId: string;
    creditsPerHour: number;
    signedAtSeconds: number;
    expiresAtSeconds: number;
}

// ─── Succession, capture and endings ─────────────────────────────────────────

/**
 * The most dangerous moment in a band's life. Each wing nominates; if nobody
 * holds a plurality the two strongest fight it out, and a contest that runs
 * while the crews are already unhappy becomes a civil war.
 * See docs/pirate-system/organizations.md §3.
 */
export interface SuccessionContest {
    organizationId: string;
    startedAtSeconds: number;
    resolvesAtSeconds: number;
    /** Wings with a candidate in the running, strongest first. */
    contenders: PirateDoctrine[];
}

export type CaptureDisposition =
    | 'execute' | 'imprison' | 'recruit' | 'amnesty' | 'conscript' | 'informant';

/**
 * Defeated pirates do not evaporate. What is done with them is a different
 * resource in each case — and a captain who is turned rather than hanged can
 * end up an admiral. See docs/pirate-system/counter-piracy.md §8.
 */
export interface PirateCapture {
    id: string;
    organizationId: string;
    captorFactionId: string;
    /** Set when the prize was the leader rather than a crew. */
    leaderId?: string;
    leaderName?: string;
    /** Crew strength taken, as a fraction of a fleet. */
    crewStrength: number;
    capturedAtSeconds: number;
    disposition?: CaptureDisposition;
    /** For informants: what they keep telling their handler. */
    informantForFactionId?: string;
}

/** Credits on a band, a captain, or a specific base. Anyone may claim it. */
export interface PirateBounty {
    id: string;
    postedByFactionId: string;
    targetOrganizationId?: string;
    targetLeaderId?: string;
    targetBaseId?: string;
    credits: number;
    postedAtSeconds: number;
    claimedByFactionId?: string;
    claimedAtSeconds?: number;
}

// ─── Sponsorship ─────────────────────────────────────────────────────────────

export type OperationIntensity = 'harassment' | 'economicDisruption' | 'blockade';

/**
 * Instead of declaring war, finance somebody else's. Cheap, reversible, and
 * deniable — until the evidence lands. See docs/pirate-system/sponsorship.md.
 */
export interface Sponsorship {
    id: string;
    organizationId: string;
    sponsorFactionId: string;
    /** Whom the band is being paid to hurt. Null = a general retainer. */
    targetFactionId: string | null;
    intensity: OperationIntensity;
    fundingPerHour: number;
    supplies: { ammo?: number; hulls?: number; intelReports?: number };
    /**
     * Covert sponsorship accrues evidence. An open letter of marque does not —
     * that is the entire difference between the two, and why a sponsor might
     * prefer the version everybody can see.
     */
    covert: boolean;
    startedAtSeconds: number;
    /** 0–1 accumulated proof against the sponsor. */
    evidence: number;
    /** Derived from `evidence`; rides the espionage system's own ladder. */
    attributionState: AttributionState;
    /** Set when a marque was revoked, so the fallout can be applied once. */
    revokedAtSeconds?: number;
    /**
     * Set the first time this became public. A cold trail can fall back below
     * the threshold and cross it again; the scandal only breaks once.
     */
    exposedAtSeconds?: number;
}

/** The four rungs the design describes, derived from the evidence score. */
export type ExposureStep = 'invisible' | 'suspected' | 'attributed' | 'exposed';

export const EXPOSURE_THRESHOLDS: Record<Exclude<ExposureStep, 'invisible'>, number> = {
    suspected: 0.25,
    attributed: 0.55,
    exposed: 0.85,
};

// ─── The shadow economy ──────────────────────────────────────────────────────

/**
 * A grey market hosted by an underground market or smuggler port. Stocked from
 * raid loot, priced below the legal market, and finite: buying more than the
 * market can clear moves the price and gets the buyer noticed.
 * See docs/pirate-system/shadow-economy.md §1.
 */
export interface BlackMarket {
    id: string;
    organizationId: string;
    hostBaseId: string;
    systemId: string;
    /** Resource → units on hand. */
    stock: Record<string, number>;
    /** 0.2–0.6 discount against the legal price for the same goods. */
    discount: number;
    /** Credits of throughput this market can clear per hour. */
    liquidity: number;
    /** 0–1 chance per purchase that the buyer is identified. */
    traceability: number;
    knownToFactionIds: string[];
}

/**
 * Cargo that cannot legally move, moving. The tighter the embargo, the richer
 * the smuggler — which is what gives economic warfare a downside.
 */
export interface SmugglingRun {
    id: string;
    organizationId: string;
    /** Who is paying to have this moved. */
    clientFactionId: string;
    resource: string;
    unitsPerHour: number;
    /** Credits per hour the band charges, scaled by the legal barrier. */
    freightPremiumPerHour: number;
    path: string[];
    startedAtSeconds: number;
    expiresAtSeconds: number;
    /** Set when customs caught it. */
    interceptedAtSeconds?: number;
    interceptedByFactionId?: string;
}

// ─── Bases ───────────────────────────────────────────────────────────────────

export type PirateBaseKind =
    | 'hideout'          // an asteroid, a debris field, a dead moon
    | 'derelict_station' // an abandoned station reactivated
    | 'frontier_port'    // a real settlement that looks the other way
    | 'secret_shipyard'
    | 'smuggler_port'
    | 'underground_market'
    | 'safe_house'       // planet-side, inside someone else's territory
    | 'hidden_lane';     // not a place — a route only they know

/**
 * Pirate infrastructure. No single kind provides everything, so an organization
 * is defined by the mix it owns: destroying one base removes some capabilities
 * and not others, which is what makes counter-piracy a campaign rather than a
 * battle. See docs/pirate-system/bases.md.
 */
export interface PirateBase {
    id: string;
    organizationId: string;
    kind: PirateBaseKind;
    systemId: string;
    /** For safe_house / underground_market — which world it hides on. */
    planetId?: string;
    /** For hidden_lane — the two systems it secretly connects. */
    laneEndpoints?: [string, string];
    /** For hidden_lane — the restricted Corridor that carries it. */
    corridorId?: string;

    /** 0–1. How hard it is to find. Falls with use, recovers while idle. */
    concealment: number;
    /** 0–1. Structural health. Raids and bombardment reduce it. */
    integrity: number;
    /** Fleets this base can support. Sets part of the organization's capacity. */
    berths: number;
    /** Loot held here awaiting sale. Lost if the base falls. */
    storedLoot: number;

    /** Factions that know where this is. They may not have acted on it. */
    knownToFactionIds: string[];
    /** Set when a faction infiltrated rather than destroyed it. */
    compromisedByFactionId?: string;

    establishedAtSeconds: number;
    /** Sim clock at which construction finishes; inert until then. */
    readyAtSeconds: number;
}

/**
 * Why a band appeared where it did. Written on every emergence so the game can
 * tell a player the truth about their own frontier — and so the blame for a
 * deliberately seeded haven lands on whoever seeded it.
 */
export interface EmergenceRecord {
    organizationId: string;
    systemId: string;
    atSeconds: number;
    /** The Piracy Opportunity Index reading that produced this band. */
    poi: number;
    dominantFactor: 'value' | 'exposure' | 'instability';
    /** e.g. 'escortLevel=0', 'ownerAtWar', 'sanctions', 'shadowEconomyNode'. */
    dominantInput: string;
    origin: PirateOrigin;
    /** Whose neglect, or whose deliberate act. */
    blamedFactionId?: string;
    /** True when an existing organization absorbed the party instead. */
    absorbed: boolean;
}

/**
 * Pirate aggregate on GameWorldState. Additive — no Prisma migration; the
 * serializer already carries whatever hangs off the world object.
 *
 * Later phases add: bases, blackMarkets, protectionContracts, sponsorships,
 * bounties (docs/pirate-system/systems.md §1).
 */
export interface PiracyWorldState {
    organizations: Map<string, PirateOrganization>;
    bases: Map<string, PirateBase>;
    hostages: Map<string, HostageDeal>;
    protectionContracts: Map<string, ProtectionContract>;
    tributes: Map<string, TributeAgreement>;
    blackMarkets: Map<string, BlackMarket>;
    smugglingRuns: Map<string, SmugglingRun>;
    sponsorships: Map<string, Sponsorship>;
    successions: Map<string, SuccessionContest>;
    captures: Map<string, PirateCapture>;
    bounties: Map<string, PirateBounty>;
    /** systemId → 0–100, recomputed each tick. A cache, not a source of truth. */
    opportunityIndex: Map<string, number>;
    /** Ring buffer of recent emergences. */
    emergenceLog: EmergenceRecord[];
}

/** How many emergence records to keep before the oldest are dropped. */
export const EMERGENCE_LOG_LIMIT = 200;

// ─── Stage gates ─────────────────────────────────────────────────────────────

export interface StageGate {
    stage: PirateStage;
    name: string;
    minFleets: number;
    minBases: number;
    minInfamy: number;
    minNetworkControl: number;
    minCrewLoyalty: number;
    /** Stage II+ needs someone actually in command. */
    requiresLeader: boolean;
    /** Stage III+ needs at least one non-hostile contact in the real galaxy. */
    requiresContact: boolean;
    /**
     * Stage IV+ needs the wings to agree. Traditionalists vote against becoming
     * anything larger than a network; raiders vote against becoming a state,
     * because states have obligations. See docs/pirate-system/organizations.md §4.3.
     */
    requiresVote: boolean;
    /**
     * Stage V needs somebody real to say out loud that this is a state. A band
     * can take the ports and the tribute on its own; the last thing it cannot
     * manufacture alone is a counterparty willing to sign.
     */
    requiresRecognition?: boolean;
}

/** How each wing votes on advancing to a given stage. */
export const STAGE_VOTES: Record<PirateDoctrine, Record<4 | 5, boolean>> = {
    raider: { 4: true, 5: false },
    smuggler: { 4: true, 5: true },
    corsair: { 4: true, 5: true },
    merchant: { 4: true, 5: true },
    traditionalist: { 4: false, 5: false },
};

/**
 * The five stages. Each changes the VERB, not the numbers: a gang steals, a
 * network taxes, a confederacy negotiates, a state governs.
 *
 * Stage V additionally requires formal recognition — a treaty with a real
 * faction — which arrives with pirate diplomacy in Phase 7.
 */
export const STAGE_GATES: StageGate[] = [
    {
        stage: 1, name: 'Pirate Gang',
        minFleets: 0, minBases: 0, minInfamy: 0, minNetworkControl: 0, minCrewLoyalty: 0,
        requiresLeader: false, requiresContact: false, requiresVote: false,
    },
    {
        stage: 2, name: 'Pirate Fleet',
        minFleets: 3, minBases: 0, minInfamy: 15, minNetworkControl: 0, minCrewLoyalty: 0,
        requiresLeader: true, requiresContact: false, requiresVote: false,
    },
    {
        stage: 3, name: 'Corsair Network',
        minFleets: 3, minBases: 3, minInfamy: 35, minNetworkControl: 0, minCrewLoyalty: 0,
        requiresLeader: true, requiresContact: true, requiresVote: false,
    },
    {
        stage: 4, name: 'Pirate Confederacy',
        minFleets: 8, minBases: 6, minInfamy: 35, minNetworkControl: 40, minCrewLoyalty: 50,
        requiresLeader: true, requiresContact: true, requiresVote: true,
    },
    {
        stage: 5, name: 'Pirate State',
        minFleets: 8, minBases: 6, minInfamy: 70, minNetworkControl: 65, minCrewLoyalty: 50,
        requiresLeader: true, requiresContact: true, requiresVote: true,
        requiresRecognition: true,
    },
];
