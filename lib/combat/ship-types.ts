// lib/combat/ship-types.ts

export type HullSize = 'S' | 'M' | 'L' | 'XL';

export interface ShipStats {
    baseForce: number;      // Survival/HP equivalent
    damage: number;         // Offensive output
    shields: number;        // Damage mitigation
    speed: number;          // Initiative/Evasion
    powerDraw: number;      // Energy cost per tick (or internal reactor limit)
}

export type SlotType = 'weapon' | 'utility' | 'core';

export interface HullDefinition {
    id: string;
    name: string;
    size: HullSize;
    baseStats: ShipStats;
    slots: {
        id: string;
        type: SlotType;
    }[];
}

export interface ComponentDefinition {
    id: string;
    name: string;
    type: SlotType;
    stats: Partial<ShipStats>;
    techPrerequisite?: string;
    description: string;
}

export interface ShipDesign {
    id: string;
    name: string;
    hullId: string;
    components: Record<string, string>; // slotId -> componentId
    isDefault?: boolean;
}

export interface DesignStats extends ShipStats {
    totalPowerProduced: number;
    powerBalance: number;
}
