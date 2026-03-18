export type PlotType =
    | 'SABOTAGE'      // Destroy buildings, lower production
    | 'THEFT'         // Steal resources
    | 'INSURRECTION'  // Lower happiness/stability
    | 'ASSASSINATION' // Remove leader/character (or attempt to)
    | 'PROPAGANDA'    // Alter reputation/diplomacy
    | 'ESPIONAGE';    // Gain intel/map visibility

export interface IntrigueContext {
    targetFaction: {
        id: string;
        name: string;
        traits: string[]; // e.g., "Authoritarian", "Industrialist"
    };
    targetEntity?: {
        name: string;
        type: 'planet' | 'station' | 'sector';
        tags: {
            occupation: string;
            situation: string;
        };
    };
    spyNetwork: {
        level: number; // 1-5
        location: string;
    };
}

export interface IntrigueOption {
    id: string; // Unique ID for selection
    title: string;
    description: string;
    plotType: PlotType;
    risk: 'LOW' | 'MEDIUM' | 'HIGH';
    cost: {
        resource: string; // 'credits', 'intel'
        amount: number;
    }[];
    // Deterministic effects are mapped server-side based on plotType + risk
}

export interface IntrigueResponse {
    options: IntrigueOption[];
    flavorText: string; // Brief narrative setting the scene
}
