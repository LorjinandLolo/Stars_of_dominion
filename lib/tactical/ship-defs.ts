// lib/tactical/ship-defs.ts
// Static ship class balance for tactical combat V2.
//
// Class fantasy (per design doc §6):
//   Corvette   — fast flanker, screens, dies to concentrated fire.
//   Destroyer  — aggressive forward damage, torpedoes, anti-capital.
//   Cruiser    — flexible line ship, broadsides, strong sustain. Subsystems.
//   Battleship — slow centrepiece, devastating spinal + broadsides, heavy
//                frontal armour, weak engines/rear. Subsystems.
//   Carrier    — stays behind the line, fields interceptor + bomber squadrons,
//                point-defence only. Subsystems. Depends on escorts.
//
// Numbers tuned so a corvette dies in ~4s of focus, a battleship survives
// ~40s of a cruiser's broadside — battles resolve in the 1–4 minute band.

import type { ArmorProfile, ShipClassDef, ShipClassId, SquadronDef, SquadronType } from './types';

const TURRET_ARC = Math.PI * 2;
const deg = (d: number) => (d * Math.PI) / 180;

const NO_ARMOR: ArmorProfile = { fore: 0, side: 0, aft: 0 };

export const SHIP_CLASSES: Record<ShipClassId, ShipClassDef> = {
    corvette: {
        id: 'corvette',
        name: 'Corvette',
        maxSpeed: 120,
        acceleration: 90,
        turnRate: 3.0,
        radius: 8,
        maxHull: 60,
        maxShield: 40,
        shieldRegen: 8,
        shieldRegenDelay: 4,
        armor: { fore: 0.1, side: 0.08, aft: 0.05 },
        preferredRange: 140,
        deploymentCost: 1,
        weapons: [
            {
                id: 'light-turret',
                name: 'Light Turret',
                mountAngle: 0,
                arc: TURRET_ARC,
                range: 180,
                damage: 4,
                cooldown: 0.5,
                projectile: 'beam',
                antiSquadron: true,
            },
        ],
        ability: {
            id: 'afterburner',
            name: 'Afterburner',
            description: '+80% speed for 5s.',
            cooldown: 20,
            duration: 5,
        },
    },

    destroyer: {
        id: 'destroyer',
        name: 'Destroyer',
        maxSpeed: 90,
        acceleration: 55,
        turnRate: 2.0,
        radius: 12,
        maxHull: 130,
        maxShield: 80,
        shieldRegen: 10,
        shieldRegenDelay: 4,
        armor: { fore: 0.18, side: 0.1, aft: 0.06 },
        preferredRange: 240,
        deploymentCost: 3,
        weapons: [
            {
                id: 'forward-guns',
                name: 'Forward Guns',
                mountAngle: 0,
                arc: deg(70),
                range: 260,
                damage: 9,
                cooldown: 1.0,
                projectile: 'beam',
                // Fast-tracking mounts — a destroyer that keeps its nose on a
                // bomber squadron can defend itself (its only anti-craft answer).
                antiSquadron: true,
            },
            {
                id: 'torpedo',
                name: 'Torpedo Launcher',
                mountAngle: 0,
                arc: deg(40),
                range: 420,
                damage: 45,
                cooldown: 9,
                projectile: 'torpedo',
                projectileSpeed: 130,
            },
        ],
        ability: {
            id: 'torpedo_salvo',
            name: 'Torpedo Salvo',
            description: 'Immediately launch 3 torpedoes at the current target.',
            cooldown: 32,
            duration: 0,
        },
    },

    cruiser: {
        id: 'cruiser',
        name: 'Cruiser',
        maxSpeed: 70,
        acceleration: 35,
        turnRate: 1.4,
        radius: 17,
        maxHull: 210,
        maxShield: 150,
        shieldRegen: 12,
        shieldRegenDelay: 5,
        armor: { fore: 0.22, side: 0.16, aft: 0.1 },
        preferredRange: 260,
        deploymentCost: 4,
        hasSubsystems: true,
        weapons: [
            {
                id: 'port-battery',
                name: 'Port Battery',
                mountAngle: -Math.PI / 2,
                arc: deg(100),
                range: 300,
                damage: 11,
                cooldown: 0.9,
                projectile: 'beam',
            },
            {
                id: 'starboard-battery',
                name: 'Starboard Battery',
                mountAngle: Math.PI / 2,
                arc: deg(100),
                range: 300,
                damage: 11,
                cooldown: 0.9,
                projectile: 'beam',
            },
            {
                id: 'point-defence',
                name: 'Point Defence',
                mountAngle: 0,
                arc: TURRET_ARC,
                range: 140,
                damage: 2.5,
                cooldown: 0.4,
                projectile: 'beam',
                antiSquadron: true,
            },
        ],
        ability: {
            id: 'overcharge_shields',
            name: 'Overcharge Shields',
            description: '-60% incoming damage for 8s; weapons offline while active.',
            cooldown: 34,
            duration: 8,
        },
    },

    battleship: {
        id: 'battleship',
        name: 'Battleship',
        maxSpeed: 50,
        acceleration: 18,
        turnRate: 0.8,
        radius: 24,
        maxHull: 400,
        maxShield: 240,
        shieldRegen: 14,
        shieldRegenDelay: 6,
        // The doc's flagship trade-off: dominant bow, soft stern.
        armor: { fore: 0.45, side: 0.25, aft: 0.1 },
        preferredRange: 340,
        deploymentCost: 7,
        hasSubsystems: true,
        weapons: [
            {
                id: 'spinal-lance',
                name: 'Spinal Lance',
                mountAngle: 0,
                arc: deg(14),
                range: 500,
                damage: 65,
                cooldown: 7,
                projectile: 'beam',
            },
            {
                id: 'port-battery',
                name: 'Port Battery',
                mountAngle: -Math.PI / 2,
                arc: deg(100),
                range: 320,
                damage: 12,
                cooldown: 1.0,
                projectile: 'beam',
            },
            {
                id: 'starboard-battery',
                name: 'Starboard Battery',
                mountAngle: Math.PI / 2,
                arc: deg(100),
                range: 320,
                damage: 12,
                cooldown: 1.0,
                projectile: 'beam',
            },
            {
                id: 'rear-turret',
                name: 'Rear Turret',
                mountAngle: Math.PI,
                arc: deg(90),
                range: 220,
                damage: 6,
                cooldown: 1.0,
                projectile: 'beam',
                antiSquadron: true,
            },
            {
                // Without a 360° PD net a battleship had literally no answer to
                // a bomber squadron parked off its bow (batteries can't target
                // strike craft) — a free 400-hull kill.
                id: 'point-defence',
                name: 'Point Defence Net',
                mountAngle: 0,
                arc: TURRET_ARC,
                range: 130,
                damage: 2,
                cooldown: 0.45,
                projectile: 'beam',
                antiSquadron: true,
            },
        ],
        ability: {
            id: 'emergency_repairs',
            name: 'Emergency Repairs',
            description: 'Restore 20% hull over 8s; -50% speed while repairing.',
            cooldown: 45,
            duration: 8,
        },
    },

    carrier: {
        id: 'carrier',
        name: 'Carrier',
        maxSpeed: 45,
        acceleration: 16,
        turnRate: 0.7,
        radius: 22,
        maxHull: 300,
        maxShield: 180,
        shieldRegen: 12,
        shieldRegenDelay: 6,
        armor: { fore: 0.15, side: 0.15, aft: 0.1 },
        // Stays behind the front line, controls space through strike craft.
        preferredRange: 430,
        deploymentCost: 6,
        hasSubsystems: true,
        hangar: {
            squadrons: ['interceptor', 'bomber'],
            relaunchSeconds: 25,
        },
        weapons: [
            {
                id: 'point-defence',
                name: 'Point Defence Grid',
                mountAngle: 0,
                arc: TURRET_ARC,
                range: 160,
                damage: 3,
                cooldown: 0.4,
                projectile: 'beam',
                antiSquadron: true,
            },
        ],
        ability: {
            id: 'rapid_relaunch',
            name: 'Rapid Relaunch',
            description: 'Instantly rebuild and relaunch all lost squadrons.',
            cooldown: 60,
            duration: 0,
        },
    },
};

/** Strike-craft squadron balance. */
export const SQUADRON_DEFS: Record<SquadronType, SquadronDef> = {
    interceptor: {
        type: 'interceptor',
        craft: 6,
        hpPerCraft: 10,
        speed: 165,
        range: 90,
        shipDps: 3,
        shieldPierce: 0,
        squadronDps: 14,
    },
    bomber: {
        type: 'bomber',
        craft: 6,
        hpPerCraft: 12,
        speed: 125,
        range: 80,
        shipDps: 13,
        // Bombing runs slip a share of their damage straight through shields.
        shieldPierce: 0.4,
        squadronDps: 3,
    },
};

/** Fresh subsystem block for capital hulls. */
export function freshSubsystems() {
    return { engines: 1, shields: 1, weapons: 1, sensors: 1 };
}

/** Map a strategic composition key to a tactical ship class (V2 mapping). */
export function classForCompositionKey(key: string): ShipClassId {
    switch (key.toLowerCase()) {
        case 'corvette':
        case 'interceptor':
        case 'bomber':
            return 'corvette';
        case 'destroyer':
            return 'destroyer';
        case 'cruiser':
            return 'cruiser';
        case 'carrier':
            return 'carrier';
        case 'battleship':
        case 'dreadnought':
            return 'battleship';
        default:
            return 'corvette';
    }
}
