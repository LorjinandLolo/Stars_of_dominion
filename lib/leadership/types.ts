/**
 * lib/leadership/types.ts
 * Core data models for the Leadership System.
 */

export type LeaderRole =
    | 'HeadOfState'
    | 'Minister'
    | 'Admiral'
    | 'General'
    | 'Governor'
    | 'IntelligenceDirector'
    | 'DiplomaticEnvoy'
    | 'EconomicMinister'
    | 'CharterCompanyExecutive';

/** How a head of state left office. Drives the legitimacy cost of succession. */
export type DepartureCause =
    | 'death'
    | 'illness'
    | 'retirement'
    | 'resignation'
    | 'overthrown'
    | 'election_defeat';

export interface LeaderTrait {
    id: string;
    name: string;
    description: string;
    modifiers: Record<string, number>;
}

export interface LeaderHistoryEvent {
    timestamp: number;
    description: string;
}

export interface Leader {
    id: string;
    factionId: string;
    name: string;
    role: LeaderRole;
    level: number;
    xp: number;
    loyalty: number; // 0-100
    status: 'active' | 'retired' | 'deceased' | 'missing';
    traits: string[]; // trait IDs
    assignmentId?: string; // fleetId, planetId, etc.
    history: LeaderHistoryEvent[];

    // ── Government Phase 2 (optional: leaders saved before it lack them) ─────
    /** Formal style: "Chancellor", "Grand Admiral", "First Speaker". */
    title?: string;
    /** 0–100. How the public reads this person, distinct from the government's approval. */
    popularity?: number;
    /** 0–100. Ability to convert standing into passed policy (feeds capital accrual). */
    politicalSkill?: number;
    /** 0–100. Falls with age and stress; at 0 the leader dies in office. */
    health?: number;
    /** Years. Advances on the sim clock, not real time. */
    age?: number;
    /** Sim-clock seconds when this leader took office (head of state only). */
    tookOfficeAtSeconds?: number;
    /** Sim-clock seconds when they left office. */
    leftOfficeAtSeconds?: number;
    /** Why they left, once they have. */
    departureCause?: DepartureCause;

    // ── Government Phase 3 — ministers and governors ────────────────────────
    /** 0–100. How well they run their brief. */
    competence?: number;
    /** 0–100. How much of what passes through their hands sticks to them. */
    corruption?: number;
    /** 0–100. Appetite for more power than the office grants. */
    ambitionDrive?: number;
    /** Cabinet seat held, if any (a CabinetPortfolio id). */
    portfolio?: string;
}

export interface LeadershipWorldState {
    leaders: Map<string, Leader>;
    recruitmentPool: Leader[];
    nowSeconds: number;
}
