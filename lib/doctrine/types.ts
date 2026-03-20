/**
 * lib/doctrine/types.ts
 * Core data models for the 3-domain Doctrine System.
 */

export type DoctrineDomain = 'military' | 'economic' | 'intelligence';

export interface DoctrineDefinition {
    id: string;
    domain: DoctrineDomain;
    name: string;
    description: string;
    modifiers: Record<string, number>;
    enabledActions?: string[];
    disabledActions?: string[];
}

export interface EmpireDoctrines {
    factionId: string;
    activeDoctrines: Record<DoctrineDomain, string | null>; // domain -> doctrineId
    lastChangeTimestamps: Record<DoctrineDomain, number>; // domain -> unixSeconds
}
