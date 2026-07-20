// lib/tactical/types.ts
// Real-time tactical ship combat — Version 1 vertical slice.
//
// Design pillars (see docs discussion): position, facing, range, defensive
// orientation, reinforcement timing. Continuous 2D space, no hexes.
// V1 scope: 4 ship classes, move+facing orders, firing arcs, single shield
// value + hull, reinforcement capacity, retreat zones, one ability per class,
// simple automated battle plans. No fighters / subsystems / directional
// shields / morale yet (V2+).

export type ShipClassId = 'corvette' | 'destroyer' | 'cruiser' | 'battleship';

export type TacticalSide = 'player' | 'enemy';

// ─── Static definitions ───────────────────────────────────────────────────────

export interface WeaponDef {
    id: string;
    name: string;
    /** Mount direction relative to ship heading, radians (0 = forward, +π/2 = starboard). */
    mountAngle: number;
    /** Full cone width in radians. 2π = omnidirectional turret. */
    arc: number;
    range: number;
    damage: number;
    /** Seconds between shots. */
    cooldown: number;
    /** 'beam' hits instantly; 'torpedo' spawns a tracking projectile. */
    projectile: 'beam' | 'torpedo';
    projectileSpeed?: number;
}

export interface AbilityDef {
    id: string;
    name: string;
    description: string;
    cooldown: number;
    duration: number;
}

export interface ShipClassDef {
    id: ShipClassId;
    name: string;
    maxSpeed: number;
    /** Units/s². */
    acceleration: number;
    /** Radians/s. */
    turnRate: number;
    radius: number;
    maxHull: number;
    maxShield: number;
    /** Shield points/s once regen kicks in. */
    shieldRegen: number;
    /** Seconds without taking a hit before shields regenerate. */
    shieldRegenDelay: number;
    /** Range the AI tries to hold against its target. */
    preferredRange: number;
    /** Points consumed against the side's deployment capacity while active. */
    deploymentCost: number;
    weapons: WeaponDef[];
    ability: AbilityDef;
}

// ─── Live battle state ────────────────────────────────────────────────────────

export interface MoveOrder {
    x: number;
    y: number;
    /** Desired final facing (radians); null = face direction of travel. */
    face: number | null;
}

export type ShipStatus =
    | 'arriving'    // reinforcement warping in — untargetable, uncontrollable
    | 'active'
    | 'retreating'  // ordered to the retreat zone; withdraws on reaching it
    | 'withdrawn'   // left the field alive
    | 'destroyed';

export interface TacticalShip {
    id: string;
    side: TacticalSide;
    classId: ShipClassId;
    /** Strategic composition key this ship came from (for mapping results back). */
    sourceKey: string;
    x: number;
    y: number;
    /** Radians. 0 = +x. */
    heading: number;
    speed: number;
    hull: number;
    shield: number;
    /** Sim time of the last hit taken (drives shield regen delay). */
    lastHitAt: number;
    /** Seconds remaining per weapon index. */
    weaponCooldowns: number[];
    abilityCooldown: number;
    /** Sim time until which the class ability is active (0 = inactive). */
    abilityActiveUntil: number;
    moveOrder: MoveOrder | null;
    /** Explicit target; when null, weapons auto-engage the nearest hostile in arc+range. */
    targetId: string | null;
    status: ShipStatus;
    /** Sim time at which an 'arriving' ship becomes active. */
    arrivalAt: number;
}

export interface Torpedo {
    id: string;
    side: TacticalSide;
    sourceId: string;
    targetId: string;
    x: number;
    y: number;
    speed: number;
    damage: number;
    /** Torpedoes self-destruct after this sim time (avoids immortal chasers). */
    expiresAt: number;
}

/** Transient beam visual: rendered for a fraction of a second, then dropped. */
export interface BeamShot {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    side: TacticalSide;
    expiresAt: number;
}

export interface ExplosionFx {
    x: number;
    y: number;
    radius: number;
    expiresAt: number;
}

export interface ReserveEntry {
    classId: ShipClassId;
    sourceKey: string;
    count: number;
}

export interface BattlePlan {
    posture: 'aggressive' | 'balanced' | 'defensive';
    /** Withdraw all ships when fleet strength (hull fraction of starting force) drops below this. 0 = fight to the end. */
    retreatBelowFleetStrength: number;
}

export interface SideState {
    /** Max concurrent deployment points on the field. */
    capacity: number;
    reserves: ReserveEntry[];
    /** Drives AI behaviour for this side (enemy always; player ships auto-fire only). */
    plan: BattlePlan;
    /** True once a full-fleet withdrawal has been ordered. */
    withdrawing: boolean;
    /**
     * Strategic strength carried in from the fleet (clamped 0.3–1). Applied to
     * EVERY spawned ship's hull — initial wave and reinforcements alike — and
     * to undeployed reserves in computeResult, so a damaged fleet can never
     * exit a battle stronger than it entered.
     */
    strengthMult: number;
}

export interface BattleOutcome {
    winner: TacticalSide | 'draw';
    reason: string;
}

export interface BattleState {
    /** Sim seconds since battle start. */
    time: number;
    width: number;
    height: number;
    /** Retreat/entry strip depth along each side's own edge. */
    edgeZone: number;
    ships: TacticalShip[];
    torpedoes: Torpedo[];
    beams: BeamShot[];
    explosions: ExplosionFx[];
    player: SideState;
    enemy: SideState;
    outcome: BattleOutcome | null;
    /** Rolling battle log (newest last, capped). */
    events: string[];
    /** Battles time out into a draw at this sim time. */
    timeLimit: number;
    nextId: number;
}

// ─── Results (fed back to the strategic layer) ────────────────────────────────

export interface SideResult {
    /** Surviving ships mapped back to strategic composition keys. */
    composition: Record<string, number>;
    /** Average hull fraction of survivors (strategic fleet `strength`), 0 if none. */
    strength: number;
    destroyed: boolean;
}

export interface BattleResult {
    winner: TacticalSide | 'draw';
    reason: string;
    player: SideResult;
    enemy: SideResult;
    durationSeconds: number;
}
