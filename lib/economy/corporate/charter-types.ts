/**
 * lib/economy/corporate/charter-types.ts
 * Charter Corporations — the VOC/CHOAM layer.
 *
 * Phase 14 gave a Chartered Company three quasi-sovereign powers and a toll
 * ledger. That made it a building with a share price. This layer turns it into
 * a geopolitical actor: it has a written charter (mission, territory, ownership,
 * rights), a personality that spends its own capital without being told to,
 * political influence that buys it a voice, and — past a point — ambitions of
 * its own.
 *
 * The design contract: the player writes the charter, but eventually has to
 * negotiate with what they wrote.
 */

// ─── Charter clauses ─────────────────────────────────────────────────────────

/** What the charter authorises the company to actually do for a living. */
export type CorporateMission =
    | 'mining'
    | 'colonization'
    | 'trade'
    | 'banking'
    | 'logistics'
    | 'shipbuilding'
    | 'research'
    | 'extraction';

export const CORPORATE_MISSIONS: CorporateMission[] = [
    'mining', 'colonization', 'trade', 'banking',
    'logistics', 'shipbuilding', 'research', 'extraction',
];

/** How far from home the charter lets the company operate. */
export type OperatingTerritory =
    | 'domestic'
    | 'frontier'
    | 'allied'
    | 'neutral'
    | 'galactic';

export const OPERATING_TERRITORIES: OperatingTerritory[] = [
    'domestic', 'frontier', 'allied', 'neutral', 'galactic',
];

/**
 * Individual privileges written into the charter. Each one the government
 * grants makes the company more capable — and harder to control later.
 */
export type CorporateRight =
    // Economic
    | 'build_infrastructure'
    | 'establish_colonies'
    | 'own_stations'
    | 'purchase_land'
    | 'collect_fees'
    // Military
    | 'armed_escorts'
    | 'security_forces'
    | 'mercenary_recruitment'
    | 'defensive_stations'
    | 'private_fleets'
    // Political
    | 'negotiate_agreements'
    | 'administer_territories'
    | 'collect_tariffs'
    | 'govern_colonies';

export type RightCategory = 'economic' | 'military' | 'political';

export const CORPORATE_RIGHTS: CorporateRight[] = [
    'build_infrastructure', 'establish_colonies', 'own_stations', 'purchase_land', 'collect_fees',
    'armed_escorts', 'security_forces', 'mercenary_recruitment', 'defensive_stations', 'private_fleets',
    'negotiate_agreements', 'administer_territories', 'collect_tariffs', 'govern_colonies',
];

/**
 * Ownership classes. Real faction ids are used as shareholder keys directly;
 * these synthetic keys stand in for holders that are not empires. They are
 * prefixed so `world.economy.factions.get(key)` can never accidentally match.
 */
export type ShareClassKey =
    | 'class:private_investors'
    | 'class:foreign_investors'
    | 'class:public_shares';

export const SHARE_CLASSES: ShareClassKey[] = [
    'class:private_investors', 'class:foreign_investors', 'class:public_shares',
];

/** The founding ownership split, in percent. Must total 100. */
export interface OwnershipPlan {
    /** Founding government's stake. */
    government: number;
    privateInvestors: number;
    foreignInvestors: number;
    publicShares: number;
}

// ─── Company personality ─────────────────────────────────────────────────────

/**
 * Drives every autonomous decision the company makes. Assigned at founding —
 * partly from the mission, partly from the ownership split (a company that is
 * 60% private money does not behave like a state instrument) — and it drifts
 * over the company's life.
 */
export type CorporatePersonality =
    | 'expansionist'
    | 'conservative'
    | 'innovative'
    | 'militarist'
    | 'monopolist'
    | 'humanitarian'
    | 'corrupt'
    | 'state_loyalist'
    | 'profit_driven';

export const CORPORATE_PERSONALITIES: CorporatePersonality[] = [
    'expansionist', 'conservative', 'innovative', 'militarist',
    'monopolist', 'humanitarian', 'corrupt', 'state_loyalist', 'profit_driven',
];

// ─── Assets the company builds for itself ────────────────────────────────────

export type CorporateAssetType =
    | 'trade_station'
    | 'mining_outpost'
    | 'warehouse'
    | 'shipyard'
    | 'research_lab'
    | 'bank_branch'
    | 'colony_seed'
    | 'defence_platform';

/**
 * A physical thing the company bought with its own money. Deliberately abstract:
 * corporate assets are a parallel private economy, not entries in the empire's
 * construction queue — the whole point is that the player did not place them.
 */
export interface CorporateAsset {
    id: string;
    type: CorporateAssetType;
    systemId: string;
    /** Credits sunk into it. Feeds net asset value → share price. */
    value: number;
    /** Credits per strategic tick this asset returns. */
    incomePerTick: number;
    /** Upkeep credits per strategic tick. */
    upkeepPerTick: number;
    builtAt: number;
}

// ─── Autonomous behaviour log ────────────────────────────────────────────────

export type CorporateActionType =
    | 'built_asset'
    | 'opened_route'
    | 'acquired_rival'
    | 'expanded_fleet'
    | 'hired_workers'
    | 'funded_research'
    | 'bribed_officials'
    | 'improved_colony'
    | 'hoarded_reserves'
    | 'entered_market'
    | 'price_war'
    | 'withheld_investment';

/** One decision the company made on its own, for the player's newsfeed. */
export interface CorporateActionRecord {
    type: CorporateActionType;
    companyId: string;
    /** Player-facing sentence. Written by the growth engine. */
    summary: string;
    timestamp: number;
}

// ─── Lobbying & political demands ────────────────────────────────────────────

export type CorporateDemandType =
    // Ordinary lobbying — a strong company asking for commercial favours.
    | 'lower_taxes'
    | 'monopoly_protection'
    | 'expansion_rights'
    | 'military_spending'
    | 'deregulation'
    | 'state_contract'
    // Late-game sovereignty demands — a company asking for pieces of the state.
    | 'greater_autonomy'
    | 'senate_representation'
    | 'territorial_administration'
    | 'customs_authority';

export const SOVEREIGNTY_DEMANDS: CorporateDemandType[] = [
    'greater_autonomy', 'senate_representation', 'territorial_administration', 'customs_authority',
];

export type DemandStatus = 'pending' | 'accepted' | 'rejected' | 'negotiated' | 'expired';

export interface CorporateDemand {
    id: string;
    companyId: string;
    /** Government being lobbied — usually the founder, but hosts get lobbied too. */
    factionId: string;
    type: CorporateDemandType;
    /** The company's own words. */
    text: string;
    /** 1–3. Higher demands cost more to refuse. */
    severity: number;
    issuedAt: number;
    expiresAt: number;
    status: DemandStatus;
    /** What the state gives up by accepting. */
    concession: string;
    /** What the company does if refused. */
    threat: string;
}

// ─── Corporate crises ────────────────────────────────────────────────────────

export type CorporateCrisisType =
    | 'mining_disaster'
    | 'bankruptcy'
    | 'corruption_scandal'
    | 'worker_strike'
    | 'executive_assassination'
    | 'accounting_fraud'
    | 'hostile_takeover_bid'
    | 'corporate_civil_war'
    | 'shareholder_revolt'
    | 'debt_crisis'
    | 'foreign_acquisition';

export interface CrisisOption {
    id: string;
    label: string;
    description: string;
    /** Credits the responding government pays. */
    creditCost?: number;
    /** Political capital the response burns. */
    politicalCapitalCost?: number;
    effects: {
        treasury?: number;
        autonomy?: number;
        corruption?: number;
        loyalty?: number;
        influence?: number;
        approval?: number;
        sharePriceMultiplier?: number;
        /** Fleet strength delta. */
        fleet?: number;
    };
}

export interface CorporateCrisis {
    id: string;
    companyId: string;
    /** Government whose desk this lands on. */
    factionId: string;
    type: CorporateCrisisType;
    headline: string;
    description: string;
    issuedAt: number;
    expiresAt: number;
    options: CrisisOption[];
    status: 'pending' | 'resolved' | 'lapsed';
    resolvedOptionId?: string;
}

// ─── Megaprojects ────────────────────────────────────────────────────────────

export type MegaprojectStatus =
    | 'proposed'
    | 'approved'
    | 'building'
    | 'complete'
    | 'rejected'
    | 'delayed';

export interface MegaprojectProposal {
    id: string;
    defId: string;
    companyId: string;
    factionId: string;
    name: string;
    description: string;
    /** Total build cost in credits. */
    totalCost: number;
    /** Share of the cost the state is asked to underwrite, 0–1. */
    stateShare: number;
    /** Sim-seconds of construction once approved. */
    durationSeconds: number;
    proposedAt: number;
    expiresAt: number;
    status: MegaprojectStatus;
    /** 0–1 build progress. */
    progress: number;
    completedAt?: number;
    /** Player-facing summary of what it does when finished. */
    benefit: string;
}

// ─── Foreign operations ──────────────────────────────────────────────────────

export type HostPolicyStance = 'allowed' | 'restricted' | 'taxed' | 'banned' | 'nationalized';

/**
 * How one government treats one foreign-chartered company operating inside its
 * borders. This is where economics turns into diplomacy: banning a company your
 * neighbour depends on is an act with consequences.
 */
export interface CorporateHostPolicy {
    factionId: string;
    companyId: string;
    stance: HostPolicyStance;
    /** 0–0.5. Only meaningful when stance === 'taxed'. */
    tariffRate: number;
    setAt: number;
}

// ─── Inter-corporate competition ─────────────────────────────────────────────

export interface CorporateRivalry {
    /** `${idA}|${idB}` with ids sorted, so the pair is stable. */
    id: string;
    companyAId: string;
    companyBId: string;
    /** 0–100. Rises while both chase the same mission and markets. */
    intensity: number;
    /** True while both are burning treasury to undercut each other. */
    priceWar: boolean;
    startedAt: number;
    lastEscalationAt: number;
}

// ─── Derived read-model ──────────────────────────────────────────────────────

/** Private-military ladder. Derived from fleet size, capped by granted rights. */
export interface MilitaryTier {
    tier: 0 | 1 | 2 | 3 | 4 | 5;
    label: string;
}

export const MILITARY_TIERS: Record<number, string> = {
    0: 'Unarmed',
    1: 'Security Personnel',
    2: 'Escort Corvettes',
    3: 'Trade Protection Fleet',
    4: 'Colonial Defence Force',
    5: 'Private Navy',
};

/** Where a company sits on the instrument → partner → rival arc. */
export type CorporateStanding =
    | 'instrument'   // fully controlled, does what it is told
    | 'partner'      // profitable, cooperative, starting to ask for things
    | 'power'        // politically significant; refusing it costs something
    | 'rival'        // pursuing its own foreign policy
    | 'rogue';       // no longer recognises the charter

/** The charter as written at founding, kept verbatim for the ledger UI. */
export interface CharterTerms {
    mission: CorporateMission;
    territory: OperatingTerritory;
    rights: CorporateRight[];
    ownership: OwnershipPlan;
    /** Share of profit returned to the founding government, 0–1. */
    profitShareToState: number;
}
