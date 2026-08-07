// lib/government/secession-types.ts
// Stars of Dominion — Government & Leadership, Phase 6.3 (secession crisis).
//
// Stage 4 of imperial collapse. Individual worlds refusing the centre (6.2) is a
// discipline problem; a REGION asking to leave is a negotiation between two
// governments that happen to share a flag. The player answers with concessions,
// not with a "suppress rebels" button — though that button exists, and costs.

/** The concessions a breakaway region will accept instead of independence. */
export type SecessionDemandId =
    | 'autonomy'
    | 'tax_relief'
    | 'local_parliament'
    | 'resource_rights'
    | 'military_exemption';

export interface SecessionDemand {
    id: SecessionDemandId;
    label: string;
    description: string;
    /** Political capital to concede it. */
    politicalCapital: number;
    /** Independence support this removes when granted, in points. */
    support: number;
    /** What it permanently costs the empire, in plain language. */
    price: string;
}

/**
 * The five concessions from the design doc, cheapest first. Costs live here so
 * the client can price them without importing the worker-side service.
 */
export const SECESSION_DEMANDS: SecessionDemand[] = [
    {
        id: 'tax_relief',
        label: 'Lower Taxation',
        description: 'The region keeps more of what it earns.',
        politicalCapital: 10,
        support: 12,
        price: 'permanent revenue loss',
    },
    {
        id: 'resource_rights',
        label: 'Resource Rights',
        description: 'Local ownership of what comes out of local ground.',
        politicalCapital: 15,
        support: 15,
        price: 'permanent production loss',
    },
    {
        id: 'military_exemption',
        label: 'Military Exemption',
        description: 'No more conscripts drawn from these worlds.',
        politicalCapital: 15,
        support: 14,
        price: 'the officer corps takes it personally',
    },
    {
        id: 'local_parliament',
        label: 'Local Parliament',
        description: 'A chamber of their own, answerable to them and not to you.',
        politicalCapital: 25,
        support: 20,
        price: 'the centre governs less of its own empire',
    },
    {
        id: 'autonomy',
        label: 'Greater Autonomy',
        description: 'Self-rule in all but name. The flag stays; the authority does not.',
        politicalCapital: 30,
        support: 28,
        price: 'permanent revenue loss and a looser grip',
    },
];

export function secessionDemand(id: SecessionDemandId): SecessionDemand | undefined {
    return SECESSION_DEMANDS.find(d => d.id === id);
}

export interface SecessionCrisis {
    id: string;
    /** The empire that stands to lose them. */
    factionId: string;
    /** e.g. "The Orion Autonomy Crisis". */
    name: string;
    planetIds: string[];
    systemIds: string[];
    /** The governor fronting it, if one is leading. */
    leaderId?: string;
    leaderName?: string;

    openedAtSeconds: number;
    /** When patience runs out and the region stops asking. */
    deadlineSeconds: number;

    /** 0–100. Share of the region's population that wants out. */
    independenceSupport: number;
    /** 0–100. Aggregate loyalty of the region's governors. */
    governorLoyalty: number;
    /** 0–100. Whether the garrison would fire on its own neighbours. */
    militaryLoyalty: number;

    /** What they are asking for, in the order they want it. */
    demands: SecessionDemandId[];
    granted: SecessionDemandId[];
    /** Why this happened — carried from the worlds' cohesion drivers. */
    causes: string[];
    /**
     * Empires quietly paying for this movement (Phase 6.5). Hidden from the
     * target until an operation is exposed.
     */
    foreignSponsors?: string[];
    /** Sponsors the target has caught and can name publicly. */
    exposedSponsors?: string[];

    status: 'open' | 'settled' | 'escalated' | 'suppressed';
    resolvedAtSeconds?: number;
    /** When the region stopped asking — the handoff point for Phase 6.4. */
    escalatedAtSeconds?: number;
    outcome?: string;
    /**
     * Set when the region stopped asking. Phase 6.4 turns this into an actual
     * breakaway state; until then it marks worlds in open revolt.
     */
    rebelFactionId?: string;
}

/** Below this much support for independence, the region settles for terms. */
export const SECESSION_SETTLE_THRESHOLD = 40;
