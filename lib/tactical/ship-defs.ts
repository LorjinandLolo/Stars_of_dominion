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

import type { ArmorProfile, ShipArchetype, ShipClassDef, ShipClassId, SquadronDef, SquadronType, WeaponDef } from './types';

const TURRET_ARC = Math.PI * 2;
const deg = (d: number) => (d * Math.PI) / 180;

const NO_ARMOR: ArmorProfile = { fore: 0, side: 0, aft: 0 };

const BASE_CLASSES: Record<ShipArchetype, ShipClassDef> = {
    corvette: {
        id: 'corvette',
        archetype: 'corvette',
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
        archetype: 'destroyer',
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
                // Ship guns only: strike craft are the point-defence turret's
                // job now, so the guns never break off a hull to chase craft.
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
            {
                // One small turret on the spine that covers every angle, so a
                // destroyer no longer has to point its nose at a bomber run to
                // fight back. Craft only: it adds no ship-to-ship firepower,
                // and its damage is tuned so destroyers kill strike craft at
                // the rate their nose guns used to (destroyer probe, Oct 2026).
                id: 'point-defence',
                name: 'Point Defence',
                mountAngle: 0,
                arc: TURRET_ARC,
                range: 130,
                damage: 1.9,
                cooldown: 0.45,
                projectile: 'beam',
                antiSquadron: true,
                squadronOnly: true,
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
        archetype: 'cruiser',
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
        archetype: 'battleship',
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
        archetype: 'carrier',
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

/**
 * Every other hull gets its own battle slot built on a base behaviour: the
 * base's weapons, ability and AI, with its own name, size, speed, toughness
 * and deployment cost. `length` is the model length in battle units (the
 * loader fits a model to 2.5 × radius; docs/art/model-specs-new-classes.md).
 * The class's own mechanics (mines, stealth, interdiction...) come later
 * (docs/ship-design/ship-classes-plan.md).
 */
interface Derived {
    base: ShipArchetype;
    name: string;
    length: number;
    speed: number;
    hull: number;
    shield: number;
    deploymentCost: number;
}
const DERIVED: Record<Exclude<ShipClassId, ShipArchetype>, Derived> = {
    patrol: { base: 'corvette', name: 'Patrol Craft', length: 14, speed: 1.1, hull: 0.6, shield: 0.6, deploymentCost: 1 },
    scout: { base: 'corvette', name: 'Scout', length: 18, speed: 1.05, hull: 0.7, shield: 0.8, deploymentCost: 1 },
    raider: { base: 'corvette', name: 'Stealth Raider', length: 22, speed: 1.1, hull: 0.9, shield: 0.6, deploymentCost: 2 },
    commando: { base: 'corvette', name: 'Commando Ship', length: 22, speed: 0.95, hull: 1.2, shield: 1.0, deploymentCost: 2 },
    torpedo_boat: { base: 'destroyer', name: 'Torpedo Boat', length: 22, speed: 1.1, hull: 0.6, shield: 0.6, deploymentCost: 2 },
    frigate: { base: 'destroyer', name: 'Frigate', length: 24, speed: 1.0, hull: 0.85, shield: 1.2, deploymentCost: 2 },
    minelayer: { base: 'destroyer', name: 'Minelayer', length: 26, speed: 0.9, hull: 0.9, shield: 0.9, deploymentCost: 2 },
    ewar: { base: 'destroyer', name: 'Electronic Warfare Ship', length: 28, speed: 0.95, hull: 0.8, shield: 1.1, deploymentCost: 3 },
    assault: { base: 'destroyer', name: 'Assault Ship', length: 30, speed: 0.85, hull: 1.3, shield: 1.0, deploymentCost: 3 },
    tender: { base: 'destroyer', name: 'Tender', length: 36, speed: 0.8, hull: 1.2, shield: 1.2, deploymentCost: 3 },
    supply_ship: { base: 'destroyer', name: 'Supply Ship', length: 40, speed: 0.8, hull: 1.1, shield: 0.9, deploymentCost: 3 },
    interdictor: { base: 'cruiser', name: 'Interdictor', length: 44, speed: 0.9, hull: 1.1, shield: 1.2, deploymentCost: 5 },
    heavy_cruiser: { base: 'cruiser', name: 'Heavy Cruiser', length: 50, speed: 1.1, hull: 1.15, shield: 1.0, deploymentCost: 5 },
    troop_transport: { base: 'cruiser', name: 'Troop Transport', length: 52, speed: 0.8, hull: 1.3, shield: 1.1, deploymentCost: 5 },
    command_ship: { base: 'battleship', name: 'Command Ship', length: 56, speed: 0.95, hull: 0.9, shield: 1.1, deploymentCost: 6 },
    siege_ship: { base: 'battleship', name: 'Siege Ship', length: 58, speed: 0.8, hull: 0.95, shield: 0.9, deploymentCost: 6 },
    mobile_yard: { base: 'carrier', name: 'Mobile Shipyard', length: 75, speed: 0.7, hull: 1.4, shield: 1.2, deploymentCost: 7 },
    dreadnought: { base: 'battleship', name: 'Dreadnought', length: 80, speed: 0.85, hull: 1.6, shield: 1.5, deploymentCost: 10 },
};

function derive(id: ShipClassId, d: Derived): ShipClassDef {
    const base = BASE_CLASSES[d.base];
    return {
        ...base,
        id,
        name: d.name,
        archetype: d.base,
        radius: d.length / 2.5,
        maxSpeed: Math.round(base.maxSpeed * d.speed),
        acceleration: Math.round(base.acceleration * d.speed),
        maxHull: Math.round(base.maxHull * d.hull),
        maxShield: Math.round(base.maxShield * d.shield),
        deploymentCost: d.deploymentCost,
        // Copies, so a tuning pass on one class never edits its base.
        weapons: base.weapons.map(w => ({ ...w })),
        armor: { ...base.armor },
    };
}

export const SHIP_CLASSES: Record<ShipClassId, ShipClassDef> = {
    ...BASE_CLASSES,
    ...(Object.fromEntries(Object.entries(DERIVED).map(([id, d]) => [id, derive(id as ShipClassId, d)])) as Record<Exclude<ShipClassId, ShipArchetype>, ShipClassDef>),
};

/** Every class with a battle slot (and a model slot in public/models/manifest.json). */
export const TACTICAL_CLASS_IDS = Object.keys(SHIP_CLASSES) as ShipClassId[];

/** The base behaviour a class fights with. */
export function archetypeOf(classId: ShipClassId): ShipArchetype {
    return SHIP_CLASSES[classId]?.archetype ?? 'corvette';
}

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

/** Fresh per-mount integrity for a capital hull, one per class weapon. */
export function freshMounts(classId: ShipClassId): number[] {
    return SHIP_CLASSES[classId].weapons.map(() => 1);
}

/** Point defence and other strike-craft guns are light mounts: smaller hardpoints. */
export function isLightMount(weapon: WeaponDef): boolean {
    return !!weapon.antiSquadron;
}

/** Omnidirectional turrets (point defence nets) bear everywhere, so they have no flank. */
export function isOmniMount(weapon: WeaponDef): boolean {
    return weapon.arc >= Math.PI * 2 - 1e-6;
}

/**
 * Map a strategic composition key to its tactical ship class. Every hull has
 * its own slot; strike craft riding loose in a composition count as corvettes.
 */
export function classForCompositionKey(key: string): ShipClassId {
    const k = key.toLowerCase();
    if (k in SHIP_CLASSES) return k as ShipClassId;
    return 'corvette';
}
