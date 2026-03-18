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
    effects: Record<string, number>;
    support_tags: string[];
    oppose_tags: string[];
}

export interface FactionDefinition {
    id: string;
    tags: string[];
    base_influence: number;
    favored_policies: string[];
}
