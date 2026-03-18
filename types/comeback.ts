
export type DefeatType =
    | 'MILITARY_DEFEAT'
    | 'ECONOMIC_COLLAPSE'
    | 'DIPLOMATIC_ISOLATION'
    | 'TECH_STAGNATION'
    | 'INTERNAL_UNREST'
    | 'INTEL_BLINDNESS';

export interface DefeatTrigger {
    id: DefeatType;
    name: string;
    description: string;
    window_days: number; // e.g. 30 days
    thresholds: Record<string, number>; // e.g. { 'income_trend': -0.5 }
    min_duration_hours: number;
    severity: number; // 1-5
    cooldown_days: number;
}

export interface ComebackPath {
    id: string;
    defeat_type: DefeatType;
    name: string;
    description: string;
    perks: ComebackPerk[];
}

export interface ComebackPerk {
    id: string;
    name: string;
    description: string;
    tier: number; // 1-5
    effect_type: 'PASSIVE' | 'ACTION' | 'CRISIS_MOD';
    effect_config: any;
    unlock_cost_xp: number;
}

export interface PlayerComebackState {
    active_defeats: {
        type: DefeatType;
        triggered_at: string;
        severity: number;
    }[];
    active_path_id?: string;
    path_started_at?: string;
    adaptation_xp: number;
    unlocked_perks: string[]; // Perk IDs
    history: {
        defeat_id: string;
        timestamp: string;
    }[];
}
