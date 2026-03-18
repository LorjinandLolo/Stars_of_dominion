export interface Faction {
    $id: string;
    name: string;
    traits: Record<string, any>;
    resources: Record<string, number>;
    home_planet_id?: string;
    defeat_status?: import('./defeat').DefeatState;
}

export interface Army {
    $id: string;
    faction_id: string;
    location_planet_id: string;
    units: Record<string, number>;
    status: 'idle' | 'moving' | 'fighting';
}

export interface Planet {
    $id: string;
    name: string;
    x: number;
    y: number;
    type: string;
    owner_faction_id?: string;
    resource_yield: Record<string, number>;
}
