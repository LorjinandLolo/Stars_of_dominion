
export type DefeatCategory =
    | 'TERMINAL'    // Game Ending
    | 'STRATEGIC'   // Economic/Military Decline
    | 'POLITICAL'   // Diplomatic Isolation
    | 'INTERNAL'    // Stability/Unrest
    | 'ESPIONAGE'   // Blindness/Sabotage
    | 'CRISIS'      // Mismanagement
    | 'TEMPORAL'    // Missed Windows
    | 'META';       // Psychological

export type DefeatSeverity = 'WARNING' | 'CRITICAL' | 'TERMINAL';

export interface DefeatCondition {
    id: string;
    name: string;
    description: string;
    category: DefeatCategory;
    severity: DefeatSeverity;
    trigger_threshold?: any; // Flexible for now
}

export interface ActiveDefeat {
    condition_id: string;
    triggered_at: string; // ISO Date
    status: 'ACTIVE' | 'RESOLVED' | 'PERMANENT';
    severity: DefeatSeverity;
    message: string;
}

export interface DefeatState {
    status: 'ALIVE' | 'DYING' | 'ELIMINATED';
    active_defeats: ActiveDefeat[];
    doom_score: number; // 0-100, aggregate measure of how close to defeat you are
}
