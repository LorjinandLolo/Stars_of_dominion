/**
 * lib/leadership/types.ts
 * Core data models for the Leadership System.
 */

export type LeaderRole =
    | 'Admiral'
    | 'General'
    | 'Governor'
    | 'IntelligenceDirector'
    | 'DiplomaticEnvoy'
    | 'EconomicMinister'
    | 'CharterCompanyExecutive';

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
}

export interface LeadershipWorldState {
    leaders: Map<string, Leader>;
    recruitmentPool: Leader[];
    nowSeconds: number;
}
