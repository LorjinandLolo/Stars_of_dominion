/**
 * lib/mechanics/hero-actions.ts
 * 
 * Logic for 'Galactic Cycle' Hero Actions.
 * These are high-impact, high-cooldown strategic interventions.
 */

export type HeroActionId = 'gharnuq_leap' | 'barra_shadow' | 'zughra_flame' | 'rahla_vision' | 'thamir_sabotage';

export interface HeroAction {
    id: HeroActionId;
    name: string;
    description: string;
    factionId: string;
    cooldownTicks: number; // Represents one Galactic Cycle (e.g., 10,000 game ticks)
    cost: {
        resource: string;
        amount: number;
    };
    effect: (targetId: string, world: any) => void;
}

export const HERO_ACTIONS: Record<HeroActionId, HeroAction> = {
    gharnuq_leap: {
        id: 'gharnuq_leap',
        name: "Gharnuq's Cosmic Leap",
        description: "The Great Ibex grants agility. Target fleet can bypass blockades or retreat instantly without casualties.",
        factionId: 'buthari_council',
        cooldownTicks: 10000,
        cost: { resource: 'SACRED_FLORA', amount: 500 },
        effect: (fleetId, world) => {
            // Logic to set fleet.evasion = 100 and allow jump
        }
    },
    barra_shadow: {
        id: 'barra_shadow',
        name: "Barra's Silent Shadow",
        description: "The Snow Panther cloaks a system. All diplomatic and trade visibility of this system is lost to rivals for 500 ticks.",
        factionId: 'buthari_council',
        cooldownTicks: 10000,
        cost: { resource: 'SACRED_FLORA', amount: 500 },
        effect: (systemId, world) => {
            // Logic to set system.visibility = 'hidden'
        }
    },
    zughra_flame: {
        id: 'zughra_flame',
        name: "Zughra's Radiant Flame",
        description: "The Fire Bear manifests. Any enemy ground forces on the target planet take 20% attrition per tick.",
        factionId: 'buthari_council',
        cooldownTicks: 10000,
        cost: { resource: 'SACRED_FLORA', amount: 500 },
        effect: (planetId, world) => {
            // Logic to apply 'Scorched' debuff to planetary invaders
        }
    },
    rahla_vision: {
        id: 'rahla_vision',
        name: "Rahla's Future Sight",
        description: "The Hawk-Deer reveals the void. Instantly reveals all enemy fleet movements in the region for 1000 ticks.",
        factionId: 'buthari_council',
        cooldownTicks: 10000,
        cost: { resource: 'SACRED_FLORA', amount: 500 },
        effect: (regionId, world) => {
            // Logic to set region.fogOfWar = false
        }
    },
    thamir_sabotage: {
        id: 'thamir_sabotage',
        name: "Thamir's Seismic Sabotage",
        description: "The Rock Serpent strikes at the core. Target orbital station takes 50% hull damage and loses power.",
        factionId: 'buthari_council',
        cooldownTicks: 10000,
        cost: { resource: 'SACRED_FLORA', amount: 500 },
        effect: (stationId, world) => {
            // Logic to apply damage and 'Disabled' status
        }
    }
};
