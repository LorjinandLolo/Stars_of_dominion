// lib/tactical/types.ts
// Real-time tactical ship combat — Version 2.
//
// Design pillars: position, facing, range, defensive orientation,
// reinforcement timing. Continuous 2D space, no hexes.
// V2 adds: directional shields (4 facings), directional armour, subsystem
// targeting on capital hulls, carrier-launched fighter squadrons, formation
// orders, environmental hazards (asteroid fields, nebulae), and fleet-command
// (admiral) abilities. Still deliberately absent: boarding, morale, electronic
// warfare, PvP live-sync (V3).

export type ShipClassId = 'corvette' | 'destroyer' | 'cruiser' | 'battleship' | 'carrier';

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
    /** 'beam' hits instantly (needs line of sight); 'torpedo' spawns a tracking projectile. */
    projectile: 'beam' | 'torpedo';
    projectileSpeed?: number;
    /** Point-defence weapons also engage enemy strike-craft squadrons. */
    antiSquadron?: boolean;
}

export interface AbilityDef {
    id: string;
    name: string;
    description: string;
    cooldown: number;
    duration: number;
}

/**
 * Directional armour: fraction of HULL damage absorbed by the plating on the
 * impacted aspect (shields are unaffected). fore = ±60° off the bow,
 * aft = ±60° off the stern, side = everything between.
 */
export interface ArmorProfile {
    fore: number;
    side: number;
    aft: number;
}

/** Squadron types a hangar can field. */
export type SquadronType = 'interceptor' | 'bomber';

export interface HangarDef {
    /** Squadrons this hull fields (launched at spawn, relaunched when lost). */
    squadrons: SquadronType[];
    /** Seconds to rebuild and relaunch a destroyed squadron. */
    relaunchSeconds: number;
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
    /** TOTAL shield pool; split evenly across the 4 facings at spawn. */
    maxShield: number;
    /** Shield points/s once regen kicks in (spread over damaged facings). */
    shieldRegen: number;
    /** Seconds without taking a hit before shields regenerate. */
    shieldRegenDelay: number;
    armor: ArmorProfile;
    /** Range the AI tries to hold against its target. */
    preferredRange: number;
    /** Points consumed against the side's deployment capacity while active. */
    deploymentCost: number;
    weapons: WeaponDef[];
    ability: AbilityDef;
    /** Capital hulls expose targetable subsystems. */
    hasSubsystems?: boolean;
    hangar?: HangarDef;
}

export interface SquadronDef {
    type: SquadronType;
    /** Craft per full squadron. */
    craft: number;
    hpPerCraft: number;
    speed: number;
    /** Engagement range. */
    range: number;
    /** Damage/s against SHIPS at full strength. */
    shipDps: number;
    /** Fraction of ship damage that bypasses shields (bombing runs). */
    shieldPierce: number;
    /** Damage/s against enemy SQUADRONS at full strength. */
    squadronDps: number;
}

// ─── Live battle state ────────────────────────────────────────────────────────

/** Shield facing indices. Bearing is measured relative to the SHIP's heading. */
export const FACING_FORE = 0;
export const FACING_STARBOARD = 1;
export const FACING_AFT = 2;
export const FACING_PORT = 3;
export type ShieldFacings = [number, number, number, number];

export type SubsystemId = 'engines' | 'shields' | 'weapons' | 'sensors';

/** Subsystem integrity, 0–1. At 0 the subsystem is disabled for the battle. */
export type SubsystemState = Record<SubsystemId, number>;

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
    /** Per-facing shields: [fore, starboard, aft, port]. */
    shields: ShieldFacings;
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
    /** Subsystem this ship's weapons aim for on the CURRENT target (capitals only). */
    targetSubsystem: SubsystemId | null;
    /** Present on capital hulls (hasSubsystems); absent on escorts. */
    subsystems?: SubsystemState;
    /** Per-squadron-type relaunch timers (carriers). */
    hangarCooldowns?: number[];
    status: ShipStatus;
    /** Sim time at which an 'arriving' ship becomes active. */
    arrivalAt: number;
}

export interface Squadron {
    id: string;
    side: TacticalSide;
    type: SquadronType;
    /** Carrier that fielded (and rebuilds) this squadron. */
    carrierId: string;
    x: number;
    y: number;
    /** Craft still flying; squadron dies at 0. */
    craft: number;
    /** Sub-craft damage carried between attrition ticks. */
    craftDamage: number;
    order: SquadronOrder;
    /** Attack order target / defend order ward. */
    targetShipId: string | null;
    /** Patrol point (patrol order). */
    patrolX: number;
    patrolY: number;
}

export type SquadronOrder = 'defend' | 'attack' | 'patrol' | 'return';

export interface Torpedo {
    id: string;
    side: TacticalSide;
    sourceId: string;
    targetId: string;
    x: number;
    y: number;
    speed: number;
    damage: number;
    /** Called shot carried to impact (torpedoes deliver subsystem damage). */
    subsystem?: SubsystemId | null;
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

// ─── Battlefield hazards ──────────────────────────────────────────────────────

export type HazardKind = 'asteroid' | 'nebula';

export interface Hazard {
    kind: HazardKind;
    x: number;
    y: number;
    r: number;
}

// ─── Formations ───────────────────────────────────────────────────────────────

export type FormationId = 'line' | 'column' | 'wedge' | 'screen' | 'circle';

// ─── Fleet command (admiral) abilities ────────────────────────────────────────

export type CommandAbilityId = 'coordinated_volley' | 'shield_pulse';

export interface CommandAbilityState {
    id: CommandAbilityId;
    cooldownRemaining: number;
}

// ─── Side / battle state ──────────────────────────────────────────────────────

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
    /** Fleet-command abilities; empty when the side has no admiral. */
    commandAbilities: CommandAbilityState[];
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
    squadrons: Squadron[];
    torpedoes: Torpedo[];
    beams: BeamShot[];
    explosions: ExplosionFx[];
    hazards: Hazard[];
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
