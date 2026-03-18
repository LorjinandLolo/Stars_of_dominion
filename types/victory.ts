
export type VictoryType =
    | 'CONQUEST'
    | 'ECONOMIC_HEGEMONY'
    | 'DIPLOMATIC_ANNEXATION'
    | 'CULTURAL_DOMINANCE';

export interface VictoryCondition {
    id: string;
    type: VictoryType;
    name: string;
    description: string;
    threshold?: number;
}

export interface VictoryState {
    status: 'PENDING' | 'VICTORIOUS';
    type?: VictoryType;
    message?: string;
    victor_id?: string;
    timestamp?: string;
}
