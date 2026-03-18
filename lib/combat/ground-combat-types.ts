/**
 * Represents the entrenched defensive strength of a planetary system.
 */
export interface PlanetaryGarrison {
    troops: number;           // Raw HP of the planetary defenders
    fortificationLevel: number; // 0-10, provides percentage damage reduction
    supplyRemaining: number;  // Ticks before attrition bypasses shields
}

/**
 * Tracks an active orbital bombardment or ground invasion against a system.
 */
export interface SiegeState {
    id: string;                 // Siege instance ID
    systemId: string;           // The target planet/hex
    aggressorEmpireId: string;  // Who is invading
    defendingEmpireId: string;  // Who owns the planet currently
    invadingTroops: number;     // Raw HP of landed assailant forces
    bombardmentActive: boolean; // Is the invading fleet actively softening targets?
    occupationProgress: number; // 0-100% - Reaches 100 when defender troops hit 0
}

/**
 * Triggered when Local Systemic Unrest hits 100%, causing a violent breakaway.
 */
export interface SecessionEvent {
    id: string;
    systemId: string;
    originalOwnerId: string;
    newRebelFactionId: string;
    foreignSponsors: string[];  // Empires who funded this via Proxy Cold War ops
    spawnedGarrisonStrength: number;
}
