// lib/government/types.ts
// Stars of Dominion — Government & Leadership, Phase 0 (foundation).
//
// Per-faction political container. Everything the government system needs that
// world.shared CANNOT hold: world.shared is a single galaxy-wide bag (one
// stability, one warFatigue for every empire at once), so approval, legitimacy
// and political capital — which are inherently per-government — live here.

/** Cabinet seats. Ministers are filled in Phase 3; the slots exist from Phase 0. */
export type CabinetPortfolio =
    | 'defence'
    | 'economy'
    | 'science'
    | 'intelligence'
    | 'interior'
    | 'foreign';

export const CABINET_PORTFOLIOS: CabinetPortfolio[] = [
    'defence',
    'economy',
    'science',
    'intelligence',
    'interior',
    'foreign',
];

export interface GovernmentEvent {
    /** Sim-clock unix seconds. */
    timestamp: number;
    event: string;
}

/**
 * What a minister is pressing the head of state to do. Derived every tick and
 * stored on the government so the client can render the cabinet debate without
 * importing the worker-side (fs-backed) services.
 */
export interface CabinetAdvice {
    portfolio: CabinetPortfolio;
    portfolioLabel: string;
    ministerName: string;
    advice: string;
    /** Policy the minister is arguing for, if their advice maps to one. */
    suggestedPolicyId?: string;
    /** 0–100. Competence tempered by what they personally stand to gain. */
    reliability: number;
}

/**
 * A parliamentary party. Derived from the interest-group blocs — the same
 * factions that drift in lib/politics, seen from the legislature's side.
 */
export interface Party {
    /** Bloc id this party speaks for. */
    id: string;
    name: string;
    /** Share of the chamber, 0–100 (sums to 100 across parties). */
    seats: number;
    /** -1..1 general disposition toward the sitting government. */
    stance: number;
}

/** A policy tabled before the legislature, awaiting a vote. */
export interface PendingBill {
    id: string;
    policyId: string;
    policyName: string;
    tabledAtSeconds: number;
    /** When the chamber divides. */
    resolvesAtSeconds: number;
    /** Projected seats voting yes, 0–100. Recomputed each tick until the vote. */
    projectedSupport: number;
    /** Party ids the government has spent capital lobbying. */
    lobbied: string[];
    status: 'pending' | 'passed' | 'failed';
}

/** What an ambition measures. Every metric is computable from world state. */
export type AmbitionMetric =
    | 'systems_owned'
    | 'planets_owned'
    | 'fleet_power'
    | 'credits_reserve'
    | 'techs_researched'
    | 'population';

/**
 * A personal ambition of the sitting head of state. Three are drawn when a
 * leader takes office; completing one leaves a permanent mark on the empire.
 */
export interface Ambition {
    /** Definition id from data/ambitions/*.json. */
    id: string;
    name: string;
    description: string;
    metric: AmbitionMetric;
    /**
     * 'absolute' — reach this value outright.
     * 'delta'    — improve on where the empire stood when the leader took office.
     */
    mode: 'absolute' | 'delta';
    /** Target value (absolute) or required improvement (delta). */
    target: number;
    /** Metric value when the ambition was assigned; only used in delta mode. */
    baseline: number;
    /** 0–1. */
    progress: number;
    completed: boolean;
    completedAtSeconds?: number;
    /** Prestige added to the empire's legacy on completion. */
    prestige: number;
    /** One-off political capital paid out on completion. */
    politicalCapital: number;
    /** One-off legitimacy granted on completion. */
    legitimacy: number;
    /**
     * Permanent empire modifier granted on completion, keyed with the same
     * vocabulary as policy effects (production, tax_income, …).
     */
    bonus?: Record<string, number>;
}

/**
 * What the empire keeps after a leader is gone. Survives succession — this is
 * the difference between a government and a dynasty.
 */
export interface LegacyState {
    /** Total prestige earned by every administration so far. */
    prestige: number;
    /** Ambition ids completed across all leaders. */
    completed: string[];
    /** Permanent stacked modifiers from completed ambitions. */
    bonuses: Record<string, number>;
    /** Short record of who achieved what. */
    chronicle: Array<{ timestamp: number; leaderName: string; ambition: string }>;
}

export interface GovernmentState {
    factionId: string;

    /** Profile id from data/governments/*.json (e.g. 'democratic_federation'). */
    governmentId?: string;
    /** Display name of the legislature/organ, from the profile ('Senate'). */
    institutionName: string;
    /** Tags of the government profile — drives ideology and later reform gating. */
    tags: string[];

    /** 0–100. Confidence in the CURRENT administration. Derived every tick. */
    approval: number;
    /** 0–100. Right to rule. Erodes with sustained low approval. */
    legitimacy: number;

    /** 0–100 (soft cap). Spent by GOV_* orders from Phase 1 on. */
    politicalCapital: number;
    politicalCapitalCap: number;

    /** 0–100. Fed by ministers/governors in Phase 3. */
    corruption: number;

    /** Policy ids currently in force (data/policies/*.json). */
    activePolicies: string[];

    /** From the government profile's base_values; unused before Phase 4. */
    senatePower: number;
    executivePower: number;

    /**
     * 0–100 per-faction mirrors of world.shared. NOT authoritative yet — they
     * are overwritten from world.shared on every tick so that the day a pillar
     * needs true per-empire values, only the writer changes, not the readers.
     */
    stability: number;
    warFatigue: number;

    /** Phase 2. */
    headOfStateId: string | null;
    /** Phase 3. Portfolio → leaderId. */
    cabinet: Record<CabinetPortfolio, string | null>;

    /** Last tick's cabinet debate. Derived; refreshed by tickCabinets. */
    cabinetAdvice: CabinetAdvice[];

    // ── Phase 4 — parliament, elections, coups ──────────────────────────────
    /** Chamber composition. Derived from the blocs; refreshed by tickParliament. */
    parties: Party[];
    /** Legislation awaiting a vote. Empty in governments that do not legislate. */
    bills: PendingBill[];
    /** Sim-clock seconds when the current term ends (elected governments only). */
    termEndsAtSeconds?: number;
    /**
     * 0–100. How close the officer corps is to moving against the government.
     * Built from military dissatisfaction, weak legitimacy, corruption and a
     * disloyal Defence Ministry; bled off by strong civilian institutions.
     */
    coupPressure: number;
    /** Sim-clock seconds of the last coup warning fired (dedupes notifications). */
    lastCoupWarningSeconds?: number;
    /**
     * 0–60. Foreign money and forged rolls working against the incumbent at the
     * next election (espionage `election_interference`). Consumed by the vote.
     */
    electionInterference?: number;

    /** The sitting leader's three ambitions (Legacy System). */
    ambitions: Ambition[];
    /** Everything past administrations left behind. */
    legacy: LegacyState;

    lastTickSeconds: number;
    /** Bounded ring of notable political events. */
    history: GovernmentEvent[];
}
