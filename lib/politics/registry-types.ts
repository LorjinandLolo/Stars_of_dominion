// lib/politics/registry-types.ts

export interface SocietyProfile {
    id: string;
    tags: string[];
    modifiers: Record<string, number>;
    policy_bias: string[];
    faction_weights: Record<string, number>;
}

export interface GovernmentProfile {
    id: string;
    tags: string[];
    base_values: {
        senate_power: number;
        executive_power: number;
        legitimacy: number;
    };
    modifiers: Record<string, number>;
    allowed_policies?: string[];
    restricted_policies?: string[];
    institution_name: string;
}

export interface PolicyDefinition {
    id: string;
    tags: string[];
    /**
     * Continuous modifiers while the policy is active. Only keys with a live
     * consumer do anything — see POLICY_EFFECT_KEYS in lib/government/policy-service.
     */
    effects: Record<string, number>;
    support_tags: string[];
    oppose_tags: string[];

    // ── Phase 1 fields (older policy files omit them and still load) ─────────
    /** UI label. Falls back to the id. */
    name?: string;
    description?: string;
    /** Grouping for the policy list: 'economy' | 'military' | 'social' | 'state'. */
    category?: string;
    /** Political capital charged at enactment. */
    political_capital_cost?: number;
    /** Political capital charged to repeal. Defaults to half the enact cost. */
    repeal_cost?: number;
    /** One-off ideology nudge applied when the policy is enacted. */
    ideology_shift?: Record<string, number>;
    /** Government tags required to enact (any match). Empty = no requirement. */
    requires_government_tags?: string[];
    /** Government tags that forbid enactment (any match). */
    forbidden_government_tags?: string[];
}

export interface FactionDefinition {
    id: string;
    tags: string[];
    base_influence: number;
    favored_policies: string[];
}

/** A leader ambition template (data/ambitions/*.json) — the Legacy System. */
export interface AmbitionDefinition {
    id: string;
    name: string;
    description: string;
    /** Must match an AmbitionMetric in lib/government/types. */
    metric: string;
    mode: 'absolute' | 'delta';
    target: number;
    prestige: number;
    political_capital: number;
    legitimacy: number;
    /** Permanent modifier granted on completion (policy-effect vocabulary). */
    bonus?: Record<string, number>;
}

/**
 * An internal interest group (data/blocs/*.json) — the political factions the
 * government has to keep on side. Superset of FactionDefinition: the extra
 * fields let a bloc drift without a hardcoded case in politics-service.
 */
export interface BlocDefinition extends FactionDefinition {
    /** Display name shown in the UI. */
    name: string;
    /**
     * Substrings matched against a faction's society tags at bootstrap. A hit
     * raises this bloc's starting influence.
     */
    society_hints?: string[];
    /**
     * Ideology axis → weight in -1..1. Positive weight = the bloc is happier
     * the further that axis runs positive (see IdeologyProfile for signs).
     */
    ideology_affinity?: Record<string, number>;
    /**
     * SharedState scalar → weight in -1..1. Positive weight = the bloc is
     * happier when that scalar is high.
     */
    signals?: Record<string, number>;
}
