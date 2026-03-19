// lib/combat/ship-registry.ts
import { HullDefinition, ComponentDefinition, ShipStats } from './ship-types';

export const SHIP_HULLS: HullDefinition[] = [
    {
        id: 'hull-interceptor',
        name: 'Interceptor',
        size: 'S',
        baseStats: {
            baseForce: 50,
            damage: 10,
            shields: 5,
            speed: 80,
            powerDraw: 5
        },
        slots: [
            { id: 'w1', type: 'weapon' },
            { id: 'u1', type: 'utility' },
            { id: 'c1', type: 'core' }
        ]
    },
    {
        id: 'hull-destroyer',
        name: 'Destroyer',
        size: 'M',
        baseStats: {
            baseForce: 150,
            damage: 40,
            shields: 20,
            speed: 50,
            powerDraw: 15
        },
        slots: [
            { id: 'w1', type: 'weapon' },
            { id: 'w2', type: 'weapon' },
            { id: 'u1', type: 'utility' },
            { id: 'c1', type: 'core' }
        ]
    },
    {
        id: 'hull-cruiser',
        name: 'Cruiser',
        size: 'L',
        baseStats: {
            baseForce: 450,
            damage: 120,
            shields: 80,
            speed: 30,
            powerDraw: 40
        },
        slots: [
            { id: 'w1', type: 'weapon' },
            { id: 'w2', type: 'weapon' },
            { id: 'w3', type: 'weapon' },
            { id: 'u1', type: 'utility' },
            { id: 'u2', type: 'utility' },
            { id: 'c1', type: 'core' }
        ]
    }
];

export const SHIP_COMPONENTS: ComponentDefinition[] = [
    // Weapons
    {
        id: 'comp-pulse-laser',
        name: 'Pulse Laser',
        type: 'weapon',
        stats: { damage: 15, powerDraw: 5 },
        description: '[ENERGY] Rapid-fire coherent light. Strong vs Shields.'
    },
    {
        id: 'comp-railgun',
        name: 'Gauss Railgun',
        type: 'weapon',
        stats: { damage: 30, powerDraw: 12, speed: -5 },
        description: '[KINETIC] High-velocity penetrator. Strong vs Armor.'
    },
    {
        id: 'comp-torpedo',
        name: 'Plasma Torpedo',
        type: 'weapon',
        stats: { damage: 50, powerDraw: 15, speed: -15 },
        description: '[EXPLOSIVE] Heavy thermal payload. Strong vs Hull.'
    },
    // Utilities
    {
        id: 'comp-deflector',
        name: 'Deflector Screen',
        type: 'utility',
        stats: { shields: 20, powerDraw: 10 },
        description: '[SHIELD] Electrostatic barrier. Blocks Kinetic.'
    },
    {
        id: 'comp-plating',
        name: 'Ablative Plating',
        type: 'utility',
        stats: { baseForce: 100, speed: -5 },
        description: '[ARMOR] Reinforced composite layers. Resists Energy.'
    },
    {
        id: 'comp-afterburner',
        name: 'Afterburners',
        type: 'utility',
        stats: { speed: 20, powerDraw: 8 },
        description: '[EVASION] Emergency combustion. Evades Explosives.'
    },
    // Cores
    {
        id: 'comp-fission-core',
        name: 'Fission Core',
        type: 'core',
        stats: { powerDraw: -50 }, // Negative draw = production
        description: '[STANDARD] Reliable nuclear power source.'
    },
    {
        id: 'comp-fusion-reactor',
        name: 'Fusion Reactor',
        type: 'core',
        stats: { powerDraw: -100 },
        description: '[ADVANCED] High-output magnetic confinement.'
    },
    {
        id: 'comp-singularity-core',
        name: 'Singularity Core',
        type: 'core',
        stats: { powerDraw: -200, baseForce: -50 },
        description: '[EXPERIMENTAL] Massive power at a structural cost.'
    }
];

export function calculateDesignStats(hullId: string, componentMap: Record<string, string>): ShipStats {
    const hull = SHIP_HULLS.find(h => h.id === hullId);
    if (!hull) throw new Error(`Hull ${hullId} not found`);

    const stats: ShipStats = { ...hull.baseStats };

    Object.values(componentMap).forEach(compId => {
        const comp = SHIP_COMPONENTS.find(c => c.id === compId);
        if (comp && comp.stats) {
            Object.entries(comp.stats).forEach(([key, value]) => {
                if (value !== undefined) {
                    (stats as any)[key] += value;
                }
            });
        }
    });

    return stats;
}
