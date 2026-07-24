// lib/tactical/sim.ts
// Tactical combat simulation V2 — fixed-timestep, mutation-in-place, renderer-agnostic.
//
// The battle runs client-side against the AI. The view owns a BattleState,
// calls update() with elapsed real seconds, and issues player commands through
// the exported order functions. When state.outcome is set, computeResult()
// produces the payload the strategic layer consumes.
//
// V2 systems on top of V1: directional shields (4 facings) + directional
// armour, subsystem targeting on capital hulls, carrier strike-craft
// squadrons, formation orders, asteroid/nebula hazards (line-of-sight,
// slow zones, sensor veils), and fleet-command (admiral) abilities.

import type {
    BattleState,
    BattleResult,
    BattlePlan,
    CommandAbilityId,
    FormationId,
    Hazard,
    ReserveEntry,
    ShipClassId,
    SideState,
    Squadron,
    SquadronType,
    SubsystemId,
    TacticalShip,
    TacticalSide,
    Torpedo,
    WeaponDef,
} from './types';
import {
    FACING_FORE,
    FACING_STARBOARD,
    FACING_AFT,
    FACING_PORT,
} from './types';
import { SHIP_CLASSES, SQUADRON_DEFS, freshSubsystems } from './ship-defs';

const STEP = 1 / 30;             // internal fixed step (seconds)
const ARRIVAL_DELAY = 4;         // reinforcement warp-in time
const AI_INTERVAL = 0.5;         // enemy controller cadence
const ARRIVE_DIST = 8;           // "close enough" to a move destination
const LOW_HULL_FRACTION = 0.3;   // below this, ships slow down (progressive damage)
const TORPEDO_LIFETIME = 12;
const EVENT_CAP = 40;

// Hazard tuning.
const ASTEROID_SPEED_MULT = 0.55;   // ships crawling through the rocks
const NEBULA_DETECT_RANGE = 180;    // targets inside a nebula are invisible beyond this
const NEBULA_TORPEDO_FIZZLE = 1.5;  // seconds a torpedo survives after its target enters a nebula

// Subsystem tuning.
const SUBSYSTEM_HP_FRACTION = 0.25;      // subsystem pool = 25% of maxHull worth of damage
const SUBSYSTEM_TARGET_MISS_CHANCE = 0.25; // accuracy trade-off for called shots
const SUBSYSTEM_DAMAGE_SHARE = 0.6;      // share of hull damage that also hits the called subsystem
const ENGINES_DISABLED_SPEED_MULT = 0.25;
const SENSORS_DISABLED_RANGE_MULT = 0.55;

// Formation spacing between slot centres.
const FORMATION_SPACING = 46;

// Fleet-command (admiral) abilities.
const COMMAND_ABILITY_COOLDOWNS: Record<CommandAbilityId, number> = {
    coordinated_volley: 60,
    shield_pulse: 90,
};
const SHIELD_PULSE_FRACTION = 0.3; // of maxShield, spread over the 4 facings

// ─── Angle helpers ────────────────────────────────────────────────────────────

/** Wrap to (-π, π]. */
export function normalizeAngle(a: number): number {
    while (a <= -Math.PI) a += Math.PI * 2;
    while (a > Math.PI) a -= Math.PI * 2;
    return a;
}

/** Signed shortest rotation from `from` to `to`. */
export function angleDiff(from: number, to: number): number {
    return normalizeAngle(to - from);
}

// ─── Construction ─────────────────────────────────────────────────────────────

export interface BattleConfig {
    width?: number;
    height?: number;
    playerReserves: ReserveEntry[];
    enemyReserves: ReserveEntry[];
    playerCapacity?: number;
    enemyCapacity?: number;
    /** Hull fraction multipliers carried in from the strategic fleets. */
    playerStrength?: number;
    enemyStrength?: number;
    enemyPlan?: BattlePlan;
    playerPlan?: BattlePlan;
    /** Battlefield features (asteroid fields, nebulae). */
    hazards?: Hazard[];
    /** Admirals unlock the side's fleet-command abilities. */
    playerHasAdmiral?: boolean;
    enemyHasAdmiral?: boolean;
    timeLimit?: number;
}

function makeSide(
    capacity: number,
    reserves: ReserveEntry[],
    plan: BattlePlan,
    strengthMult: number,
    hasAdmiral: boolean
): SideState & { startHull: number } {
    return {
        capacity,
        reserves: reserves.map(r => ({ ...r })),
        plan,
        withdrawing: false,
        strengthMult: Math.min(1, Math.max(0.3, strengthMult)),
        commandAbilities: hasAdmiral
            ? [
                { id: 'coordinated_volley', cooldownRemaining: 0 },
                { id: 'shield_pulse', cooldownRemaining: 0 },
            ]
            : [],
        startHull: 0,
    } as SideState & { startHull: number };
}

export function createBattle(config: BattleConfig): BattleState {
    const state: BattleState = {
        time: 0,
        width: config.width ?? 1600,
        height: config.height ?? 1000,
        edgeZone: 70,
        ships: [],
        squadrons: [],
        torpedoes: [],
        beams: [],
        explosions: [],
        hazards: (config.hazards ?? []).map(h => ({ ...h })),
        player: makeSide(
            config.playerCapacity ?? 12, config.playerReserves,
            config.playerPlan ?? { posture: 'balanced', retreatBelowFleetStrength: 0 },
            config.playerStrength ?? 1, config.playerHasAdmiral ?? false),
        enemy: makeSide(
            config.enemyCapacity ?? 12, config.enemyReserves,
            config.enemyPlan ?? { posture: 'balanced', retreatBelowFleetStrength: 0.2 },
            config.enemyStrength ?? 1, config.enemyHasAdmiral ?? false),
        outcome: null,
        events: [],
        timeLimit: config.timeLimit ?? 480,
        nextId: 1,
    };

    // Initial deployment: fill each side's capacity biggest-ship-first, no
    // arrival delay (phase 3 "Deployment" of the battle flow).
    autoDeployInitial(state, 'player');
    autoDeployInitial(state, 'enemy');
    logEvent(state, 'Fleets deployed. Engagement underway.');
    return state;
}

function side(state: BattleState, s: TacticalSide): SideState {
    return s === 'player' ? state.player : state.enemy;
}

/** Deployment points currently committed to the field. */
export function activeDeploymentPoints(state: BattleState, s: TacticalSide): number {
    return state.ships
        .filter(sh => sh.side === s && (sh.status === 'active' || sh.status === 'arriving' || sh.status === 'retreating'))
        .reduce((sum, sh) => sum + SHIP_CLASSES[sh.classId].deploymentCost, 0);
}

function autoDeployInitial(state: BattleState, s: TacticalSide) {
    const st = side(state, s);
    // Biggest first: lead with capital ships, screen with what fits after.
    const order = [...st.reserves].sort(
        (a, b) => SHIP_CLASSES[b.classId].deploymentCost - SHIP_CLASSES[a.classId].deploymentCost
    );
    for (const entry of order) {
        while (entry.count > 0) {
            const cost = SHIP_CLASSES[entry.classId].deploymentCost;
            if (activeDeploymentPoints(state, s) + cost > st.capacity) break;
            entry.count--;
            spawnShip(state, s, entry.classId, entry.sourceKey, st.strengthMult, /*instant*/ true);
        }
    }
    st.reserves = st.reserves.filter(r => r.count > 0);
}

function spawnShip(
    state: BattleState,
    s: TacticalSide,
    classId: ShipClassId,
    sourceKey: string,
    strengthMult: number,
    instant: boolean
): TacticalShip {
    const def = SHIP_CLASSES[classId];
    // Player enters on the left edge, enemy on the right; stagger vertically.
    const fielded = state.ships.filter(sh => sh.side === s && sh.status !== 'destroyed' && sh.status !== 'withdrawn').length;
    const x = s === 'player' ? state.edgeZone + 40 : state.width - state.edgeZone - 40;
    const y = state.height / 2 + (fielded % 2 === 0 ? 1 : -1) * Math.ceil(fielded / 2) * 70;
    const hullMult = Math.min(1, Math.max(0.3, strengthMult));
    const facing = def.maxShield / 4;
    const ship: TacticalShip = {
        id: `ship-${state.nextId++}`,
        side: s,
        classId,
        sourceKey,
        x,
        y: Math.min(state.height - 40, Math.max(40, y)),
        heading: s === 'player' ? 0 : Math.PI,
        speed: 0,
        hull: def.maxHull * hullMult,
        shields: [facing, facing, facing, facing],
        lastHitAt: -999,
        weaponCooldowns: def.weapons.map(() => 0),
        abilityCooldown: 0,
        abilityActiveUntil: 0,
        moveOrder: null,
        targetId: null,
        targetSubsystem: null,
        subsystems: def.hasSubsystems ? freshSubsystems() : undefined,
        hangarCooldowns: def.hangar ? def.hangar.squadrons.map(() => 0) : undefined,
        status: instant ? 'active' : 'arriving',
        arrivalAt: instant ? 0 : state.time + ARRIVAL_DELAY,
    };
    (side(state, s) as any).startHull += ship.hull;
    state.ships.push(ship);
    return ship;
}

function logEvent(state: BattleState, msg: string) {
    state.events.push(`[${Math.floor(state.time)}s] ${msg}`);
    if (state.events.length > EVENT_CAP) state.events.splice(0, state.events.length - EVENT_CAP);
}

// ─── Shield / armour facings ──────────────────────────────────────────────────

export function totalShield(ship: TacticalShip): number {
    return ship.shields[0] + ship.shields[1] + ship.shields[2] + ship.shields[3];
}

/**
 * Which shield facing an impact from (fromX, fromY) hits, relative to the
 * target's heading: fore ±45°, then starboard / aft / port quadrants.
 */
export function facingIndexForImpact(target: TacticalShip, fromX: number, fromY: number): number {
    const bearing = Math.atan2(fromY - target.y, fromX - target.x);
    const rel = angleDiff(target.heading, bearing);
    const a = Math.abs(rel);
    if (a <= Math.PI / 4) return FACING_FORE;
    if (a >= (3 * Math.PI) / 4) return FACING_AFT;
    return rel > 0 ? FACING_STARBOARD : FACING_PORT;
}

/** Armour aspect for the same impact bearing: fore ±60°, aft ±60°, else side. */
function armorFractionForImpact(target: TacticalShip, fromX: number, fromY: number): number {
    const def = SHIP_CLASSES[target.classId];
    const bearing = Math.atan2(fromY - target.y, fromX - target.x);
    const a = Math.abs(angleDiff(target.heading, bearing));
    if (a <= Math.PI / 3) return def.armor.fore;
    if (a >= (2 * Math.PI) / 3) return def.armor.aft;
    return def.armor.side;
}

// ─── Hazard queries ───────────────────────────────────────────────────────────

export function insideHazard(state: BattleState, kind: Hazard['kind'], x: number, y: number): boolean {
    for (const h of state.hazards) {
        if (h.kind !== kind) continue;
        if (Math.hypot(x - h.x, y - h.y) <= h.r) return true;
    }
    return false;
}

/** Beams cannot fire through asteroid fields. Torpedoes and strike craft can. */
export function hasLineOfSight(state: BattleState, x1: number, y1: number, x2: number, y2: number): boolean {
    for (const h of state.hazards) {
        if (h.kind !== 'asteroid') continue;
        // Segment-circle intersection with a slightly shrunk radius so shots
        // skimming the edge of a field stay legal.
        const r = h.r * 0.9;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq > 0 ? ((h.x - x1) * dx + (h.y - y1) * dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = x1 + dx * t;
        const cy = y1 + dy * t;
        if (Math.hypot(h.x - cx, h.y - cy) <= r) return false;
    }
    return true;
}

/**
 * Sensor veil: a nebula degrades sensors BOTH ways — a target tucked inside
 * can only be engaged from close range, and a ship hiding inside is equally
 * blind beyond that range (no free outbound sniping from cover).
 */
function targetVisible(state: BattleState, viewerX: number, viewerY: number, target: { x: number; y: number }): boolean {
    const dist = Math.hypot(target.x - viewerX, target.y - viewerY);
    if (dist <= NEBULA_DETECT_RANGE) return true;
    if (insideHazard(state, 'nebula', target.x, target.y)) return false;
    if (insideHazard(state, 'nebula', viewerX, viewerY)) return false;
    return true;
}

// ─── Player / AI orders ───────────────────────────────────────────────────────

export function issueMove(state: BattleState, shipIds: string[], x: number, y: number, face: number | null = null) {
    for (const id of shipIds) {
        const ship = state.ships.find(sh => sh.id === id);
        if (!ship || ship.status !== 'active') continue;
        ship.moveOrder = {
            x: Math.min(state.width, Math.max(0, x)),
            y: Math.min(state.height, Math.max(0, y)),
            face,
        };
    }
}

/**
 * Formation move: distribute the selection around (x, y) in the requested
 * shape, facing `face` (or the direction of travel). Capitals take the
 * protected slots; escorts screen.
 */
export function issueFormationMove(
    state: BattleState,
    shipIds: string[],
    x: number,
    y: number,
    face: number | null,
    formation: FormationId
) {
    const ships = shipIds
        .map(id => state.ships.find(sh => sh.id === id))
        .filter((sh): sh is TacticalShip => !!sh && sh.status === 'active');
    if (!ships.length) return;

    // Axis the formation is built along: explicit facing, else travel direction.
    const cx = ships.reduce((s, sh) => s + sh.x, 0) / ships.length;
    const cy = ships.reduce((s, sh) => s + sh.y, 0) / ships.length;
    const axis = face ?? Math.atan2(y - cy, x - cx);
    const ux = Math.cos(axis), uy = Math.sin(axis);       // along
    const px = -uy, py = ux;                              // perpendicular (starboard)
    const s = FORMATION_SPACING;

    // Heaviest hulls first so they take the anchored/protected slots.
    const ordered = [...ships].sort(
        (a, b) => SHIP_CLASSES[b.classId].deploymentCost - SHIP_CLASSES[a.classId].deploymentCost);
    const n = ordered.length;

    const offsets: Array<{ x: number; y: number }> = [];
    switch (formation) {
        case 'line': { // abreast, centred
            for (let i = 0; i < n; i++) {
                const k = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2);
                offsets.push({ x: px * k * s, y: py * k * s });
            }
            break;
        }
        case 'column': { // single file, lead at the point
            for (let i = 0; i < n; i++) offsets.push({ x: -ux * i * s, y: -uy * i * s });
            break;
        }
        case 'wedge': { // V, tip forward
            for (let i = 0; i < n; i++) {
                if (i === 0) { offsets.push({ x: 0, y: 0 }); continue; }
                const row = Math.ceil(i / 2);
                const sideSign = i % 2 === 1 ? 1 : -1;
                offsets.push({
                    x: -ux * row * s + px * sideSign * row * s * 0.8,
                    y: -uy * row * s + py * sideSign * row * s * 0.8,
                });
            }
            break;
        }
        case 'screen': { // capitals in the rear rank, escorts arced ahead
            const capitals = ordered.filter(sh => SHIP_CLASSES[sh.classId].deploymentCost >= 4);
            const escorts = ordered.filter(sh => SHIP_CLASSES[sh.classId].deploymentCost < 4);
            const slot = new Map<string, { x: number; y: number }>();
            capitals.forEach((sh, i) => {
                const k = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2);
                slot.set(sh.id, { x: px * k * s * 1.2, y: py * k * s * 1.2 });
            });
            escorts.forEach((sh, i) => {
                const k = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2);
                slot.set(sh.id, {
                    x: ux * s * 1.4 + px * k * s, y: uy * s * 1.4 + py * k * s,
                });
            });
            for (const sh of ordered) offsets.push(slot.get(sh.id)!);
            break;
        }
        case 'circle': { // defensive ring
            const r = Math.max(s, (n * s * 0.85) / (2 * Math.PI) + s * 0.5);
            for (let i = 0; i < n; i++) {
                const a = axis + (i / n) * Math.PI * 2;
                offsets.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
            }
            break;
        }
    }

    ordered.forEach((sh, i) => {
        issueMove(state, [sh.id], x + offsets[i].x, y + offsets[i].y, face);
    });
}

export function setTarget(state: BattleState, shipIds: string[], targetId: string | null) {
    for (const id of shipIds) {
        const ship = state.ships.find(sh => sh.id === id);
        if (!ship || ship.status === 'destroyed' || ship.status === 'withdrawn') continue;
        ship.targetId = targetId;
        // A new (or cleared) lock resets any called shot — the subsystem pick
        // belongs to the previous target.
        ship.targetSubsystem = null;
    }
}

/** Call a shot on a subsystem of the CURRENT target (capital hulls only). */
export function setTargetSubsystem(state: BattleState, shipIds: string[], subsystem: SubsystemId | null) {
    for (const id of shipIds) {
        const ship = state.ships.find(sh => sh.id === id);
        if (!ship || ship.status === 'destroyed' || ship.status === 'withdrawn') continue;
        if (subsystem) {
            const target = ship.targetId ? state.ships.find(sh => sh.id === ship.targetId) : null;
            if (!target?.subsystems) continue;
        }
        ship.targetSubsystem = subsystem;
    }
}

export function orderRetreat(state: BattleState, shipIds: string[]) {
    for (const id of shipIds) {
        const ship = state.ships.find(sh => sh.id === id);
        // 'arriving' ships stay in the warp gate — they complete (or abort)
        // their jump there; pulling them out early made mid-warp ships
        // targetable and able to fire before arrivalAt.
        if (!ship || ship.status !== 'active') continue;
        ship.status = 'retreating';
        ship.moveOrder = retreatPoint(state, ship);
    }
}

export function fleetWithdraw(state: BattleState, s: TacticalSide) {
    const st = side(state, s);
    if (st.withdrawing) return;
    // Reserves are NOT cleared: they never entered the field, so they survive
    // the withdrawal intact (computeResult counts them). deployReinforcement
    // refuses to field anything while withdrawing, and sideHasForces ignores
    // reserves for a withdrawing side, so the battle still concludes.
    st.withdrawing = true;
    orderRetreat(state, state.ships.filter(sh => sh.side === s).map(sh => sh.id));
    // Strike craft break off and follow their carriers home.
    for (const sq of state.squadrons) {
        if (sq.side === s) sq.order = 'return';
    }
    logEvent(state, s === 'player' ? 'Full fleet withdrawal ordered.' : 'Enemy fleet is withdrawing!');
}

/**
 * Deploy one ship of the given class from reserve. `sourceKey` disambiguates
 * when two strategic composition keys map to the same tactical class (e.g.
 * interceptor + bomber → corvette). Returns the ship or null.
 */
export function deployReinforcement(state: BattleState, s: TacticalSide, classId: ShipClassId, sourceKey?: string): TacticalShip | null {
    const st = side(state, s);
    if (st.withdrawing || state.outcome) return null;
    const entry = st.reserves.find(r =>
        r.classId === classId && r.count > 0 && (sourceKey === undefined || r.sourceKey === sourceKey));
    if (!entry) return null;
    const cost = SHIP_CLASSES[classId].deploymentCost;
    if (activeDeploymentPoints(state, s) + cost > st.capacity) return null;
    entry.count--;
    if (entry.count <= 0) st.reserves = st.reserves.filter(r => r !== entry);
    const ship = spawnShip(state, s, classId, entry.sourceKey, st.strengthMult, false);
    logEvent(state, `${s === 'player' ? 'Reinforcement' : 'Enemy reinforcement'} inbound: ${SHIP_CLASSES[classId].name}.`);
    return ship;
}

export function useAbility(state: BattleState, shipId: string): boolean {
    const ship = state.ships.find(sh => sh.id === shipId);
    if (!ship || ship.status !== 'active' || ship.abilityCooldown > 0) return false;
    const def = SHIP_CLASSES[ship.classId];
    ship.abilityCooldown = def.ability.cooldown;
    ship.abilityActiveUntil = state.time + def.ability.duration;

    if (def.ability.id === 'torpedo_salvo') {
        // Instant effect: three torpedoes at the current (or nearest) target.
        const target = resolveTarget(state, ship, def.weapons[1]);
        if (!target) { ship.abilityCooldown = 0; ship.abilityActiveUntil = 0; return false; }
        const calledShot = ship.targetSubsystem && target.id === ship.targetId && target.subsystems
            && target.subsystems[ship.targetSubsystem] > 0 ? ship.targetSubsystem : null;
        for (let i = 0; i < 3; i++) spawnTorpedo(state, ship, target, def.weapons[1], i * 14 - 14, calledShot);
        logEvent(state, `${def.name} launches a torpedo salvo!`);
    }

    if (def.ability.id === 'rapid_relaunch') {
        // Relaunch LOST squadrons immediately. Refund if nothing is missing —
        // pre-firing used to bank zeroed rebuild timers for an instant future
        // relaunch (and a free full-strength heal via 'return' recovery).
        const relaunched = relaunchMissingSquadrons(state, ship);
        if (relaunched === 0) { ship.abilityCooldown = 0; ship.abilityActiveUntil = 0; return false; }
        logEvent(state, 'Carrier deck crews surge — squadrons relaunching!');
    }
    return true;
}

/** Immediately field every hangar slot without a living squadron. */
function relaunchMissingSquadrons(state: BattleState, ship: TacticalShip): number {
    const def = SHIP_CLASSES[ship.classId];
    if (!def.hangar || !ship.hangarCooldowns) return 0;
    let launched = 0;
    for (let slot = 0; slot < def.hangar.squadrons.length; slot++) {
        const type = def.hangar.squadrons[slot];
        const alive = state.squadrons.some(sq => sq.carrierId === ship.id && sq.type === type && sq.craft > 0);
        if (alive) continue;
        launchSquadron(state, ship, type);
        ship.hangarCooldowns[slot] = def.hangar.relaunchSeconds;
        launched++;
    }
    return launched;
}

/** Squadron broad orders: defend a ship / attack a target / patrol / return. */
export function setSquadronOrder(
    state: BattleState,
    squadronIds: string[],
    order: Squadron['order'],
    targetShipId: string | null = null,
    patrolX?: number,
    patrolY?: number
) {
    for (const id of squadronIds) {
        const sq = state.squadrons.find(q => q.id === id);
        if (!sq) continue;
        sq.order = order;
        sq.targetShipId = targetShipId;
        if (order === 'patrol' && patrolX !== undefined && patrolY !== undefined) {
            // Clamp like issueMove does — an off-field patrol point (letterbox
            // margin click) would pin the squadron against the border forever.
            sq.patrolX = Math.min(state.width, Math.max(0, patrolX));
            sq.patrolY = Math.min(state.height, Math.max(0, patrolY));
        }
    }
}

/** Fleet-command (admiral) abilities. Returns false when unavailable. */
export function useCommandAbility(state: BattleState, s: TacticalSide, id: CommandAbilityId): boolean {
    if (state.outcome) return false;
    const st = side(state, s);
    const ability = st.commandAbilities.find(a => a.id === id);
    if (!ability || ability.cooldownRemaining > 0) return false;

    // No active ships (everything mid-warp or retreating) → the ability would
    // do nothing; don't burn the cooldown on a dead click.
    const ships = state.ships.filter(sh => sh.side === s && sh.status === 'active');
    if (!ships.length) return false;
    ability.cooldownRemaining = COMMAND_ABILITY_COOLDOWNS[id];

    if (id === 'coordinated_volley') {
        for (const sh of ships) sh.weaponCooldowns.fill(0);
        logEvent(state, s === 'player'
            ? 'Admiral: coordinated volley — all batteries fire as one!'
            : 'Enemy admiral coordinates a fleet-wide volley!');
    } else if (id === 'shield_pulse') {
        for (const sh of ships) {
            // A destroyed shield generator can't channel the pulse — the
            // opponent's called-shot investment stays meaningful.
            if (sh.subsystems && sh.subsystems.shields <= 0) continue;
            const def = SHIP_CLASSES[sh.classId];
            const perFacing = (def.maxShield * SHIELD_PULSE_FRACTION) / 4;
            const cap = def.maxShield / 4;
            for (let i = 0; i < 4; i++) sh.shields[i] = Math.min(cap, sh.shields[i] + perFacing);
        }
        logEvent(state, s === 'player'
            ? 'Admiral: emergency shield pulse ripples across the fleet.'
            : 'Enemy fleet shields surge!');
    }
    return true;
}

// ─── Core update ──────────────────────────────────────────────────────────────

export function update(state: BattleState, dtSeconds: number) {
    if (state.outcome) return;
    let remaining = Math.min(dtSeconds, 0.5); // clamp long frames (tab-away)
    while (remaining > 1e-6 && !state.outcome) {
        const h = Math.min(STEP, remaining);
        step(state, h);
        remaining -= h;
    }
}

const aiAccumulator = new WeakMap<BattleState, number>();

function step(state: BattleState, h: number) {
    state.time += h;

    // Enemy controller (throttled).
    const acc = (aiAccumulator.get(state) ?? AI_INTERVAL) + h;
    if (acc >= AI_INTERVAL) {
        aiAccumulator.set(state, 0);
        runEnemyAI(state);
        runAutoWithdrawal(state, 'player');
    } else {
        aiAccumulator.set(state, acc);
    }

    // Command ability cooldowns.
    for (const s of ['player', 'enemy'] as TacticalSide[]) {
        for (const a of side(state, s).commandAbilities) {
            if (a.cooldownRemaining > 0) a.cooldownRemaining = Math.max(0, a.cooldownRemaining - h);
        }
    }

    for (const ship of state.ships) {
        if (ship.status === 'destroyed' || ship.status === 'withdrawn') continue;

        // Reinforcement warp-in completes. If the side ordered a withdrawal
        // while this ship was still in warp, it drops out straight into the
        // retreat run instead of joining a fight its fleet is abandoning.
        if (ship.status === 'arriving') {
            if (state.time < ship.arrivalAt) continue;
            if (side(state, ship.side).withdrawing) {
                ship.status = 'retreating';
                ship.moveOrder = retreatPoint(state, ship);
            } else {
                ship.status = 'active';
            }
        }

        tickAbility(state, ship, h);
        tickMovement(state, ship, h);
        tickShields(state, ship, h);
        tickWeapons(state, ship, h);
        tickHangar(state, ship, h);

        // Retreat completes once the ship re-enters its own edge strip.
        if (ship.status === 'retreating' && inOwnEdgeZone(state, ship)) {
            ship.status = 'withdrawn';
            logEvent(state, `${SHIP_CLASSES[ship.classId].name} has left the battlefield.`);
        }
    }

    tickSquadrons(state, h);
    tickTorpedoes(state, h);

    state.beams = state.beams.filter(b => b.expiresAt > state.time);
    state.explosions = state.explosions.filter(e => e.expiresAt > state.time);

    checkOutcome(state);
}

// ─── Movement ─────────────────────────────────────────────────────────────────

function effectiveMaxSpeed(state: BattleState, ship: TacticalShip): number {
    const def = SHIP_CLASSES[ship.classId];
    let v = def.maxSpeed;
    if (ship.hull < def.maxHull * LOW_HULL_FRACTION) v *= 0.5;
    if (ship.subsystems && ship.subsystems.engines <= 0) v *= ENGINES_DISABLED_SPEED_MULT;
    if (insideHazard(state, 'asteroid', ship.x, ship.y)) v *= ASTEROID_SPEED_MULT;
    if (ship.abilityActiveUntil > state.time) {
        if (def.ability.id === 'afterburner') v *= 1.8;
        if (def.ability.id === 'emergency_repairs') v *= 0.5;
    }
    return v;
}

function tickMovement(state: BattleState, ship: TacticalShip, h: number) {
    const def = SHIP_CLASSES[ship.classId];
    const hullFrac = ship.hull / def.maxHull;
    const turnRate = def.turnRate * (hullFrac < LOW_HULL_FRACTION ? 0.7 : 1);
    const maxSpeed = effectiveMaxSpeed(state, ship);

    const order = ship.moveOrder;
    if (order) {
        const dx = order.x - ship.x;
        const dy = order.y - ship.y;
        const dist = Math.hypot(dx, dy);

        if (dist > ARRIVE_DIST) {
            const desired = Math.atan2(dy, dx);
            const diff = angleDiff(ship.heading, desired);
            const turn = Math.sign(diff) * Math.min(Math.abs(diff), turnRate * h);
            ship.heading = normalizeAngle(ship.heading + turn);

            // Throttle: full power when roughly aligned; drag the speed down
            // during hard turns so big ships carve wide, heavy arcs.
            const aligned = Math.abs(diff) < Math.PI / 2;
            const targetSpeed = aligned ? maxSpeed : maxSpeed * 0.35;
            // Brake in time to stop near the destination.
            const brakingDist = (ship.speed * ship.speed) / (2 * def.acceleration);
            const finalTarget = dist < brakingDist ? Math.max(20, maxSpeed * 0.2) : targetSpeed;
            ship.speed = approach(ship.speed, finalTarget, def.acceleration * h);
        } else {
            ship.speed = approach(ship.speed, 0, def.acceleration * h);
            if (order.face != null) {
                const diff = angleDiff(ship.heading, order.face);
                if (Math.abs(diff) > 0.02) {
                    ship.heading = normalizeAngle(ship.heading + Math.sign(diff) * Math.min(Math.abs(diff), turnRate * h));
                } else {
                    ship.moveOrder = null;
                }
            } else if (ship.speed < 1) {
                ship.moveOrder = null;
            }
        }
    } else {
        ship.speed = approach(ship.speed, 0, def.acceleration * h);
    }

    ship.x += Math.cos(ship.heading) * ship.speed * h;
    ship.y += Math.sin(ship.heading) * ship.speed * h;
    ship.x = Math.min(state.width, Math.max(0, ship.x));
    ship.y = Math.min(state.height, Math.max(0, ship.y));
}

function approach(current: number, target: number, maxDelta: number): number {
    if (current < target) return Math.min(target, current + maxDelta);
    return Math.max(target, current - maxDelta);
}

function inOwnEdgeZone(state: BattleState, ship: TacticalShip): boolean {
    return ship.side === 'player' ? ship.x <= state.edgeZone : ship.x >= state.width - state.edgeZone;
}

function retreatPoint(state: BattleState, ship: TacticalShip) {
    return {
        x: ship.side === 'player' ? state.edgeZone * 0.5 : state.width - state.edgeZone * 0.5,
        y: ship.y,
        face: null,
    };
}

// ─── Shields, abilities, damage ───────────────────────────────────────────────

function tickShields(state: BattleState, ship: TacticalShip, h: number) {
    const def = SHIP_CLASSES[ship.classId];
    // A disabled shield generator stops all regeneration.
    if (ship.subsystems && ship.subsystems.shields <= 0) return;
    if (state.time - ship.lastHitAt < def.shieldRegenDelay) return;

    const cap = def.maxShield / 4;
    const damaged = [0, 1, 2, 3].filter(i => ship.shields[i] < cap - 1e-9);
    if (!damaged.length) return;
    const per = (def.shieldRegen * h) / damaged.length;
    for (const i of damaged) ship.shields[i] = Math.min(cap, ship.shields[i] + per);
}

function tickAbility(state: BattleState, ship: TacticalShip, h: number) {
    if (ship.abilityCooldown > 0) ship.abilityCooldown = Math.max(0, ship.abilityCooldown - h);
    const def = SHIP_CLASSES[ship.classId];
    if (def.ability.id === 'emergency_repairs' && ship.abilityActiveUntil > state.time) {
        const rate = (def.maxHull * 0.2) / def.ability.duration;
        ship.hull = Math.min(def.maxHull, ship.hull + rate * h);
    }
}

export interface DamageOpts {
    /** Impact origin — selects the shield facing and armour aspect. Omitted → bow hit. */
    sourceX?: number;
    sourceY?: number;
    /** Fraction of the damage that bypasses shields entirely (bombing runs). */
    shieldPierce?: number;
    /** Called shot: a share of resulting hull damage also degrades this subsystem. */
    subsystem?: SubsystemId | null;
}

export function applyDamage(state: BattleState, target: TacticalShip, amount: number, opts: DamageOpts = {}) {
    const def = SHIP_CLASSES[target.classId];
    let dmg = amount;
    if (def.ability.id === 'overcharge_shields' && target.abilityActiveUntil > state.time) {
        dmg *= 0.4;
    }
    target.lastHitAt = state.time;

    const hasSource = opts.sourceX !== undefined && opts.sourceY !== undefined;
    const facing = hasSource
        ? facingIndexForImpact(target, opts.sourceX!, opts.sourceY!)
        : FACING_FORE;
    const armor = hasSource
        ? armorFractionForImpact(target, opts.sourceX!, opts.sourceY!)
        : def.armor.fore;

    // Split: pierce fraction skips shields; the rest chews the facing first.
    const pierce = Math.min(1, Math.max(0, opts.shieldPierce ?? 0));
    let hullDamage = dmg * pierce;
    let shieldBound = dmg * (1 - pierce);

    const absorbed = Math.min(target.shields[facing], shieldBound);
    target.shields[facing] -= absorbed;
    hullDamage += shieldBound - absorbed;

    if (hullDamage > 0) {
        const throughArmor = hullDamage * (1 - Math.min(0.9, Math.max(0, armor)));
        target.hull -= throughArmor;

        // Called shot: degrade the targeted subsystem alongside the hull.
        if (opts.subsystem && target.subsystems && target.subsystems[opts.subsystem] > 0) {
            const pool = def.maxHull * SUBSYSTEM_HP_FRACTION;
            target.subsystems[opts.subsystem] = Math.max(
                0, target.subsystems[opts.subsystem] - (throughArmor * SUBSYSTEM_DAMAGE_SHARE) / pool);
            if (target.subsystems[opts.subsystem] <= 0) {
                logEvent(state, `${target.side === 'player' ? 'Friendly' : 'Enemy'} ${def.name}: ${opts.subsystem} DISABLED!`);
            }
        }
    }

    if (target.hull <= 0 && target.status !== 'destroyed') {
        target.hull = 0;
        target.status = 'destroyed';
        state.explosions.push({ x: target.x, y: target.y, radius: def.radius * 2.4, expiresAt: state.time + 0.8 });
        logEvent(state, `${target.side === 'player' ? 'Friendly' : 'Enemy'} ${def.name} destroyed!`);
    }
}

// ─── Weapons ──────────────────────────────────────────────────────────────────

function isHostileTargetable(ship: TacticalShip, other: TacticalShip): boolean {
    return other.side !== ship.side && (other.status === 'active' || other.status === 'retreating');
}

/** Sensor-degraded ships engage at reduced range. */
function rangeMultiplier(ship: TacticalShip): number {
    return ship.subsystems && ship.subsystems.sensors <= 0 ? SENSORS_DISABLED_RANGE_MULT : 1;
}

export function inArcAndRange(ship: TacticalShip, weapon: WeaponDef, target: { x: number; y: number }, rangeMult = 1): boolean {
    const dx = target.x - ship.x;
    const dy = target.y - ship.y;
    if (Math.hypot(dx, dy) > weapon.range * rangeMult) return false;
    if (weapon.arc >= Math.PI * 2 - 1e-6) return true;
    const bearing = Math.atan2(dy, dx);
    const mountDir = normalizeAngle(ship.heading + weapon.mountAngle);
    return Math.abs(angleDiff(mountDir, bearing)) <= weapon.arc / 2;
}

/** Full firing check for a beam/torpedo weapon against a ship target. */
function canEngage(state: BattleState, ship: TacticalShip, weapon: WeaponDef, target: TacticalShip): boolean {
    if (!inArcAndRange(ship, weapon, target, rangeMultiplier(ship))) return false;
    if (!targetVisible(state, ship.x, ship.y, target)) return false;
    if (weapon.projectile === 'beam' && !hasLineOfSight(state, ship.x, ship.y, target.x, target.y)) return false;
    return true;
}

function resolveTarget(state: BattleState, ship: TacticalShip, weapon: WeaponDef): TacticalShip | null {
    // Explicit target first, if this weapon can bear on it.
    if (ship.targetId) {
        const t = state.ships.find(sh => sh.id === ship.targetId);
        if (t && isHostileTargetable(ship, t)) {
            if (canEngage(state, ship, weapon, t)) return t;
        } else {
            ship.targetId = null; // stale lock
            ship.targetSubsystem = null;
        }
    }
    // Weapons-free: nearest hostile this weapon can bear on.
    let best: TacticalShip | null = null;
    let bestDist = Infinity;
    for (const other of state.ships) {
        if (!isHostileTargetable(ship, other)) continue;
        if (!canEngage(state, ship, weapon, other)) continue;
        const d = Math.hypot(other.x - ship.x, other.y - ship.y);
        if (d < bestDist) { bestDist = d; best = other; }
    }
    return best;
}

/** Nearest hostile squadron a point-defence weapon can engage. */
function resolveSquadronTarget(state: BattleState, ship: TacticalShip, weapon: WeaponDef): Squadron | null {
    let best: Squadron | null = null;
    let bestDist = Infinity;
    for (const sq of state.squadrons) {
        if (sq.side === ship.side || sq.craft <= 0) continue;
        if (!inArcAndRange(ship, weapon, sq, rangeMultiplier(ship))) continue;
        if (!targetVisible(state, ship.x, ship.y, sq)) continue;
        const d = Math.hypot(sq.x - ship.x, sq.y - ship.y);
        if (d < bestDist) { bestDist = d; best = sq; }
    }
    return best;
}

function damageSquadron(state: BattleState, sq: Squadron, amount: number) {
    const def = SQUADRON_DEFS[sq.type];
    sq.craftDamage += amount;
    while (sq.craftDamage >= def.hpPerCraft && sq.craft > 0) {
        sq.craftDamage -= def.hpPerCraft;
        sq.craft--;
    }
    if (sq.craft <= 0) {
        state.explosions.push({ x: sq.x, y: sq.y, radius: 8, expiresAt: state.time + 0.5 });
    }
}

function tickWeapons(state: BattleState, ship: TacticalShip, h: number) {
    const def = SHIP_CLASSES[ship.classId];
    const overcharging = def.ability.id === 'overcharge_shields' && ship.abilityActiveUntil > state.time;
    const weaponsDisabled = !!ship.subsystems && ship.subsystems.weapons <= 0;

    for (let i = 0; i < def.weapons.length; i++) {
        if (ship.weaponCooldowns[i] > 0) {
            ship.weaponCooldowns[i] = Math.max(0, ship.weaponCooldowns[i] - h);
        }
        if (ship.weaponCooldowns[i] > 0 || overcharging || weaponsDisabled) continue;

        const weapon = def.weapons[i];

        // Point defence prioritizes strike craft — its designed role.
        if (weapon.antiSquadron) {
            const sq = resolveSquadronTarget(state, ship, weapon);
            if (sq) {
                ship.weaponCooldowns[i] = weapon.cooldown;
                damageSquadron(state, sq, weapon.damage);
                state.beams.push({
                    x1: ship.x, y1: ship.y, x2: sq.x, y2: sq.y,
                    side: ship.side, expiresAt: state.time + 0.1,
                });
                continue;
            }
        }

        const target = resolveTarget(state, ship, weapon);
        if (!target) continue;

        ship.weaponCooldowns[i] = weapon.cooldown;

        // Called shots trade accuracy for the subsystem hit. A call on an
        // already-destroyed subsystem is pure downside — clear it so the ship
        // doesn't keep paying the miss chance for nothing.
        let calledShot = ship.targetSubsystem && target.id === ship.targetId && target.subsystems
            ? ship.targetSubsystem : null;
        if (calledShot && target.subsystems![calledShot] <= 0) {
            ship.targetSubsystem = null;
            calledShot = null;
        }

        if (weapon.projectile === 'torpedo') {
            // Torpedoes carry the called shot to impact; their travel time is
            // the accuracy trade-off, so no launch-miss roll.
            spawnTorpedo(state, ship, target, weapon, 0, calledShot);
        } else {
            if (calledShot && Math.random() < SUBSYSTEM_TARGET_MISS_CHANCE) {
                continue; // clean miss
            }
            applyDamage(state, target, weapon.damage, {
                sourceX: ship.x, sourceY: ship.y, subsystem: calledShot,
            });
            state.beams.push({
                x1: ship.x, y1: ship.y, x2: target.x, y2: target.y,
                side: ship.side, expiresAt: state.time + 0.12,
            });
        }
    }
}

function spawnTorpedo(
    state: BattleState,
    ship: TacticalShip,
    target: TacticalShip,
    weapon: WeaponDef,
    lateralOffset: number,
    subsystem: SubsystemId | null = null
) {
    const perp = ship.heading + Math.PI / 2;
    state.torpedoes.push({
        id: `torp-${state.nextId++}`,
        side: ship.side,
        sourceId: ship.id,
        targetId: target.id,
        x: ship.x + Math.cos(perp) * lateralOffset,
        y: ship.y + Math.sin(perp) * lateralOffset,
        speed: weapon.projectileSpeed ?? 130,
        damage: weapon.damage,
        subsystem,
        expiresAt: state.time + TORPEDO_LIFETIME,
    });
}

function tickTorpedoes(state: BattleState, h: number) {
    for (const torp of state.torpedoes) {
        const target = state.ships.find(sh => sh.id === torp.targetId);
        if (!target || target.status === 'destroyed' || target.status === 'withdrawn') {
            torp.expiresAt = 0; // fizzle
            continue;
        }
        // Nebulae scramble missile locks: a target hiding inside one shakes
        // pursuing torpedoes within a couple of seconds.
        if (insideHazard(state, 'nebula', target.x, target.y)) {
            torp.expiresAt = Math.min(torp.expiresAt, state.time + NEBULA_TORPEDO_FIZZLE);
        }
        const dx = target.x - torp.x;
        const dy = target.y - torp.y;
        const dist = Math.hypot(dx, dy);
        const hitDist = SHIP_CLASSES[target.classId].radius + 5;
        if (dist <= hitDist) {
            applyDamage(state, target, torp.damage, {
                sourceX: torp.x, sourceY: torp.y, subsystem: torp.subsystem ?? null,
            });
            state.explosions.push({ x: torp.x, y: torp.y, radius: 10, expiresAt: state.time + 0.4 });
            torp.expiresAt = 0;
            continue;
        }
        // Pure pursuit.
        torp.x += (dx / dist) * torp.speed * h;
        torp.y += (dy / dist) * torp.speed * h;
    }
    state.torpedoes = state.torpedoes.filter(t => t.expiresAt > state.time);
}

// ─── Carriers & squadrons ─────────────────────────────────────────────────────

function launchSquadron(state: BattleState, ship: TacticalShip, type: SquadronType) {
    const sdef = SQUADRON_DEFS[type];
    state.squadrons.push({
        id: `sq-${state.nextId++}`,
        side: ship.side,
        type,
        carrierId: ship.id,
        x: ship.x,
        y: ship.y,
        craft: sdef.craft,
        craftDamage: 0,
        order: 'defend',
        targetShipId: ship.id,
        patrolX: ship.x,
        patrolY: ship.y,
    });
    logEvent(state, `${ship.side === 'player' ? 'Squadron' : 'Enemy squadron'} launched: ${type}s.`);
}

function tickHangar(state: BattleState, ship: TacticalShip, h: number) {
    const def = SHIP_CLASSES[ship.classId];
    if (!def.hangar || !ship.hangarCooldowns || ship.status !== 'active') return;

    for (let slot = 0; slot < def.hangar.squadrons.length; slot++) {
        const type = def.hangar.squadrons[slot];
        const alive = state.squadrons.some(sq => sq.carrierId === ship.id && sq.type === type && sq.craft > 0);
        if (alive) continue;
        if (ship.hangarCooldowns[slot] > 0) {
            ship.hangarCooldowns[slot] = Math.max(0, ship.hangarCooldowns[slot] - h);
            continue;
        }
        launchSquadron(state, ship, type);
        ship.hangarCooldowns[slot] = def.hangar.relaunchSeconds;
    }
}

function tickSquadrons(state: BattleState, h: number) {
    for (const sq of state.squadrons) {
        if (sq.craft <= 0) continue;
        const sdef = SQUADRON_DEFS[sq.type];
        const carrier = state.ships.find(sh => sh.id === sq.carrierId);
        const strengthRatio = sq.craft / sdef.craft;

        // Goal point by order.
        let goalX = sq.patrolX;
        let goalY = sq.patrolY;
        let ward = sq.targetShipId ? state.ships.find(sh => sh.id === sq.targetShipId) : null;

        // A dead/escaped attack target leaves the squadron with a stale order
        // idling at its old patrol point — fall back to defending the carrier
        // so it (and the carrier AI) can re-task it.
        if (sq.order === 'attack' && (!ward || ward.status === 'destroyed' || ward.status === 'withdrawn')) {
            sq.order = 'defend';
            sq.targetShipId = sq.carrierId;
            ward = carrier ?? null;
        }

        if (sq.order === 'return') {
            if (!carrier || carrier.status === 'destroyed' || carrier.status === 'withdrawn') {
                sq.craft = 0; // nowhere to land — written off
                continue;
            }
            goalX = carrier.x;
            goalY = carrier.y;
            if (Math.hypot(sq.x - goalX, sq.y - goalY) < SHIP_CLASSES[carrier.classId].radius + 6) {
                sq.craft = 0; // recovered aboard; hangar timer rebuilds the squadron
                continue;
            }
        } else if (sq.order === 'attack' && ward && ward.status !== 'destroyed' && ward.status !== 'withdrawn') {
            // Hold at strike range instead of hugging the hull centre — flying
            // to the exact centre parked bombers inside every PD blind spot
            // (and made the target un-clickable under the squadron sprite).
            const standoff = sdef.range * 0.7;
            const d = Math.hypot(sq.x - ward.x, sq.y - ward.y);
            if (d > 1e-6) {
                goalX = ward.x + ((sq.x - ward.x) / d) * standoff;
                goalY = ward.y + ((sq.y - ward.y) / d) * standoff;
            } else {
                goalX = ward.x + standoff;
                goalY = ward.y;
            }
        } else if (sq.order === 'defend') {
            const anchor = (ward && ward.status !== 'destroyed' && ward.status !== 'withdrawn') ? ward : carrier;
            if (anchor) {
                const orbit = state.time * 0.9 + (sq.type === 'bomber' ? Math.PI : 0);
                goalX = anchor.x + Math.cos(orbit) * 55;
                goalY = anchor.y + Math.sin(orbit) * 55;
            }
        }

        // Strike craft are agile: direct velocity, no inertia model.
        const dx = goalX - sq.x;
        const dy = goalY - sq.y;
        const d = Math.hypot(dx, dy);
        if (d > 4) {
            const v = sdef.speed * h;
            sq.x += (dx / d) * Math.min(1, v / d) * d;
            sq.y += (dy / d) * Math.min(1, v / d) * d;
        }
        sq.x = Math.min(state.width, Math.max(0, sq.x));
        sq.y = Math.min(state.height, Math.max(0, sq.y));

        if (sq.order === 'return') continue; // guns cold on the way home

        // Dogfighting first: interceptors hunt enemy squadrons.
        let engagedSquadron = false;
        if (sdef.squadronDps > sdef.shipDps) {
            let nearest: Squadron | null = null;
            let nd = Infinity;
            for (const other of state.squadrons) {
                if (other.side === sq.side || other.craft <= 0) continue;
                const dd = Math.hypot(other.x - sq.x, other.y - sq.y);
                if (dd < nd) { nd = dd; nearest = other; }
            }
            if (nearest && nd <= sdef.range * 1.5) {
                damageSquadron(state, nearest, sdef.squadronDps * strengthRatio * h);
                engagedSquadron = true;
            }
        }

        // Ship attacks: ordered target, else nearest hostile in reach.
        if (!engagedSquadron) {
            let shipTarget: TacticalShip | null = null;
            if (sq.order === 'attack' && ward && isSquadronTargetable(ward)) {
                shipTarget = ward;
            } else {
                let nd = Infinity;
                for (const other of state.ships) {
                    if (other.side === sq.side || !isSquadronTargetable(other)) continue;
                    const dd = Math.hypot(other.x - sq.x, other.y - sq.y);
                    // Defenders only engage hostiles near their ward.
                    const leash = sq.order === 'defend' ? 200 : sdef.range * 1.2;
                    if (dd < nd && dd <= leash) { nd = dd; shipTarget = other; }
                }
            }
            if (shipTarget && Math.hypot(shipTarget.x - sq.x, shipTarget.y - sq.y) <= sdef.range
                && targetVisible(state, sq.x, sq.y, shipTarget)) {
                applyDamage(state, shipTarget, sdef.shipDps * strengthRatio * h, {
                    sourceX: sq.x, sourceY: sq.y, shieldPierce: sdef.shieldPierce,
                });
            }
        }
    }

    state.squadrons = state.squadrons.filter(sq => sq.craft > 0);
}

function isSquadronTargetable(ship: TacticalShip): boolean {
    return ship.status === 'active' || ship.status === 'retreating';
}

// ─── Enemy AI ─────────────────────────────────────────────────────────────────

function fleetStrengthFraction(state: BattleState, s: TacticalSide): number {
    const st = side(state, s) as SideState & { startHull: number };
    if (!st.startHull) return 1;
    const currentFieldHull = state.ships
        .filter(sh => sh.side === s && sh.status !== 'destroyed')
        .reduce((sum, sh) => sum + sh.hull, 0);
    const reserveHull = st.reserves.reduce(
        (sum, r) => sum + SHIP_CLASSES[r.classId].maxHull * r.count, 0);
    return Math.min(1, (currentFieldHull + reserveHull) / (st.startHull + reserveHull || 1));
}

function runAutoWithdrawal(state: BattleState, s: TacticalSide) {
    const st = side(state, s);
    if (st.withdrawing || st.plan.retreatBelowFleetStrength <= 0) return;
    if (fleetStrengthFraction(state, s) < st.plan.retreatBelowFleetStrength) {
        fleetWithdraw(state, s);
    }
}

function runEnemyAI(state: BattleState) {
    runAutoWithdrawal(state, 'enemy');
    const st = state.enemy;
    if (st.withdrawing) return;

    // Reinforce: biggest affordable ship first.
    const deployable = [...st.reserves].sort(
        (a, b) => SHIP_CLASSES[b.classId].deploymentCost - SHIP_CLASSES[a.classId].deploymentCost);
    for (const entry of deployable) {
        deployReinforcement(state, 'enemy', entry.classId, entry.sourceKey);
    }

    const hostiles = state.ships.filter(sh => sh.side === 'player' && (sh.status === 'active' || sh.status === 'retreating'));
    if (!hostiles.length) return;

    // Admiral: volley when several batteries have a target; pulse when the
    // fleet's shields are cracking.
    if (st.commandAbilities.length) {
        const active = state.ships.filter(sh => sh.side === 'enemy' && sh.status === 'active');
        const engaged = active.filter(sh => sh.targetId).length;
        if (engaged >= 3) useCommandAbility(state, 'enemy', 'coordinated_volley');
        const shieldFrac = active.length
            ? active.reduce((s, sh) => s + totalShield(sh) / Math.max(1, SHIP_CLASSES[sh.classId].maxShield), 0) / active.length
            : 1;
        if (shieldFrac < 0.4) useCommandAbility(state, 'enemy', 'shield_pulse');
    }

    for (const ship of state.ships) {
        if (ship.side !== 'enemy' || ship.status !== 'active') continue;
        const def = SHIP_CLASSES[ship.classId];

        // Target: aggressive → weakest hull; otherwise nearest. Ignore ships
        // hidden deep inside nebulae.
        const visibleHostiles = hostiles.filter(hx => targetVisible(state, ship.x, ship.y, hx));
        if (!visibleHostiles.length) {
            // Sensor contacts lost (nebula campers). The fleet knows roughly
            // where the enemy is — advance to detection range so the veil
            // can't be farmed for a free stand-off win.
            const nearest = hostiles.reduce((a, b) =>
                Math.hypot(a.x - ship.x, a.y - ship.y) < Math.hypot(b.x - ship.x, b.y - ship.y) ? a : b);
            const bearingTo = Math.atan2(nearest.y - ship.y, nearest.x - ship.x);
            const closeTo = NEBULA_DETECT_RANGE * 0.75;
            ship.targetId = null;
            ship.targetSubsystem = null;
            issueMove(state, [ship.id],
                nearest.x - Math.cos(bearingTo) * closeTo,
                nearest.y - Math.sin(bearingTo) * closeTo, null);
            continue;
        }
        let target: TacticalShip;
        if (st.plan.posture === 'aggressive') {
            target = visibleHostiles.reduce((a, b) => (a.hull < b.hull ? a : b));
        } else {
            target = visibleHostiles.reduce((a, b) =>
                Math.hypot(a.x - ship.x, a.y - ship.y) < Math.hypot(b.x - ship.x, b.y - ship.y) ? a : b);
        }
        ship.targetId = target.id;

        // Called shots: aggressive destroyers/battleships go for the engines
        // of capital targets so nothing escapes.
        ship.targetSubsystem =
            st.plan.posture === 'aggressive'
                && target.subsystems && target.subsystems.engines > 0
                && (ship.classId === 'destroyer' || ship.classId === 'battleship')
                ? 'engines' : null;

        const dx = target.x - ship.x;
        const dy = target.y - ship.y;
        const dist = Math.hypot(dx, dy);
        const bearing = Math.atan2(dy, dx);
        const pref = def.preferredRange * (st.plan.posture === 'defensive' ? 1.15 : st.plan.posture === 'aggressive' ? 0.8 : 1);

        // Standoff point on the line to the target at preferred range. If an
        // asteroid field blocks the firing line from there, swing around the
        // ring until a clear angle is found — parking blind behind a rock was
        // a free kill for the player (beams need line of sight).
        let standX = target.x - Math.cos(bearing) * pref;
        let standY = target.y - Math.sin(bearing) * pref;
        if (!hasLineOfSight(state, standX, standY, target.x, target.y)) {
            for (const offset of [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6]) {
                const a = bearing + offset;
                const cx = target.x - Math.cos(a) * pref;
                const cy = target.y - Math.sin(a) * pref;
                if (hasLineOfSight(state, cx, cy, target.x, target.y)) {
                    standX = cx;
                    standY = cy;
                    break;
                }
            }
        }

        const broadsider = ship.classId === 'cruiser' || ship.classId === 'battleship';
        let face: number | null = null;
        if (broadsider) {
            // Battleship noses in for the spinal lance at long range; both
            // classes turn a flank once in battery range.
            const wantsSpinal = ship.classId === 'battleship' && dist > 360;
            if (!wantsSpinal) {
                const a = normalizeAngle(bearing + Math.PI / 2);
                const b = normalizeAngle(bearing - Math.PI / 2);
                face = Math.abs(angleDiff(ship.heading, a)) < Math.abs(angleDiff(ship.heading, b)) ? a : b;
            } else {
                face = bearing;
            }
        }
        issueMove(state, [ship.id], standX, standY, face);

        // Send bombers at the biggest player hull; keep interceptors home.
        if (ship.classId === 'carrier') {
            const big = [...visibleHostiles].sort((a, b) => SHIP_CLASSES[b.classId].maxHull - SHIP_CLASSES[a.classId].maxHull)[0];
            for (const sq of state.squadrons) {
                if (sq.side !== 'enemy' || sq.carrierId !== ship.id) continue;
                if (sq.type === 'bomber' && big && sq.order !== 'attack') {
                    setSquadronOrder(state, [sq.id], 'attack', big.id);
                }
            }
        }

        // Abilities.
        if (ship.abilityCooldown <= 0) {
            switch (def.ability.id) {
                case 'afterburner':
                    if (dist > pref * 2) useAbility(state, ship.id);
                    break;
                case 'torpedo_salvo': {
                    const big = target.classId === 'cruiser' || target.classId === 'battleship' || target.classId === 'carrier';
                    if (big && dist < def.weapons[1].range) useAbility(state, ship.id);
                    break;
                }
                case 'overcharge_shields':
                    if (totalShield(ship) < def.maxShield * 0.3) useAbility(state, ship.id);
                    break;
                case 'emergency_repairs':
                    if (ship.hull < def.maxHull * 0.5) useAbility(state, ship.id);
                    break;
                case 'rapid_relaunch': {
                    const lost = state.squadrons.filter(sq => sq.carrierId === ship.id).length
                        < (def.hangar?.squadrons.length ?? 0);
                    if (lost) useAbility(state, ship.id);
                    break;
                }
            }
        }
    }
}

// ─── Outcome & results ────────────────────────────────────────────────────────

function sideHasForces(state: BattleState, s: TacticalSide): boolean {
    const st = side(state, s);
    const onField = state.ships.some(sh =>
        sh.side === s && (sh.status === 'active' || sh.status === 'arriving' || sh.status === 'retreating'));
    // A withdrawing side's reserves never deploy — don't let them hold the
    // battle open after the last fielded ship has left. (Squadrons without a
    // living ship cannot win a battle either — carriers rebuild them, ships
    // don't come back.)
    return onField || (!st.withdrawing && st.reserves.length > 0);
}

function checkOutcome(state: BattleState) {
    if (state.outcome) return;
    const playerAlive = sideHasForces(state, 'player');
    const enemyAlive = sideHasForces(state, 'enemy');

    if (!playerAlive && !enemyAlive) {
        state.outcome = { winner: 'draw', reason: 'Mutual destruction — both fleets are gone.' };
    } else if (!enemyAlive) {
        state.outcome = {
            winner: 'player',
            reason: state.enemy.withdrawing ? 'Enemy fleet has withdrawn.' : 'Enemy fleet destroyed.',
        };
    } else if (!playerAlive) {
        state.outcome = {
            winner: 'enemy',
            reason: state.player.withdrawing ? 'Your fleet has withdrawn.' : 'Your fleet was destroyed.',
        };
    } else if (state.time >= state.timeLimit) {
        state.outcome = { winner: 'draw', reason: 'Engagement time expired — both fleets disengage.' };
    }
    if (state.outcome) logEvent(state, state.outcome.reason);
}

export function computeResult(state: BattleState): BattleResult {
    const sideResult = (s: TacticalSide) => {
        // Everything not destroyed survives the battle (withdrawn ships included;
        // reserves never fielded also survive).
        const st = side(state, s);
        const survivors = state.ships.filter(sh => sh.side === s && sh.status !== 'destroyed');
        const composition: Record<string, number> = {};
        let hullFracSum = 0;
        for (const sh of survivors) {
            composition[sh.sourceKey] = (composition[sh.sourceKey] ?? 0) + 1;
            hullFracSum += sh.hull / SHIP_CLASSES[sh.classId].maxHull;
        }
        for (const r of st.reserves) {
            composition[r.sourceKey] = (composition[r.sourceKey] ?? 0) + r.count;
            // Reserves took no NEW damage, but they carry the fleet's strategic
            // strength in — counting them at 1.0 let a damaged fleet heal by
            // keeping ships benched through a trivial fight.
            hullFracSum += r.count * st.strengthMult;
        }
        const totalSurvivors = survivors.length + st.reserves.reduce((a, r) => a + r.count, 0);
        return {
            composition,
            strength: totalSurvivors > 0 ? Math.max(0.05, Math.min(1, hullFracSum / totalSurvivors)) : 0,
            destroyed: totalSurvivors === 0,
        };
    };

    return {
        winner: state.outcome?.winner ?? 'draw',
        reason: state.outcome?.reason ?? 'Battle in progress.',
        player: sideResult('player'),
        enemy: sideResult('enemy'),
        durationSeconds: state.time,
    };
}
