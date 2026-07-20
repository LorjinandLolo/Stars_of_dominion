// lib/tactical/sim.ts
// Tactical combat simulation — fixed-timestep, mutation-in-place, renderer-agnostic.
//
// The battle runs client-side against the AI (V1). The view owns a BattleState,
// calls update() with elapsed real seconds, and issues player commands through
// the exported order functions. When state.outcome is set, computeResult()
// produces the payload the strategic layer consumes.

import type {
    BattleState,
    BattleResult,
    BattlePlan,
    ReserveEntry,
    ShipClassId,
    SideState,
    TacticalShip,
    TacticalSide,
    Torpedo,
    WeaponDef,
} from './types';
import { SHIP_CLASSES } from './ship-defs';

const STEP = 1 / 30;             // internal fixed step (seconds)
const ARRIVAL_DELAY = 4;         // reinforcement warp-in time
const AI_INTERVAL = 0.5;         // enemy controller cadence
const ARRIVE_DIST = 8;           // "close enough" to a move destination
const LOW_HULL_FRACTION = 0.3;   // below this, ships slow down (progressive damage)
const TORPEDO_LIFETIME = 12;
const EVENT_CAP = 40;

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
    timeLimit?: number;
}

function makeSide(capacity: number, reserves: ReserveEntry[], plan: BattlePlan, strengthMult: number): SideState & { startHull: number } {
    return {
        capacity,
        reserves: reserves.map(r => ({ ...r })),
        plan,
        withdrawing: false,
        strengthMult: Math.min(1, Math.max(0.3, strengthMult)),
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
        torpedoes: [],
        beams: [],
        explosions: [],
        player: makeSide(config.playerCapacity ?? 12, config.playerReserves, config.playerPlan ?? { posture: 'balanced', retreatBelowFleetStrength: 0 }, config.playerStrength ?? 1),
        enemy: makeSide(config.enemyCapacity ?? 12, config.enemyReserves, config.enemyPlan ?? { posture: 'balanced', retreatBelowFleetStrength: 0.2 }, config.enemyStrength ?? 1),
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
        shield: def.maxShield,
        lastHitAt: -999,
        weaponCooldowns: def.weapons.map(() => 0),
        abilityCooldown: 0,
        abilityActiveUntil: 0,
        moveOrder: null,
        targetId: null,
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

export function setTarget(state: BattleState, shipIds: string[], targetId: string | null) {
    for (const id of shipIds) {
        const ship = state.ships.find(sh => sh.id === id);
        if (!ship || ship.status === 'destroyed' || ship.status === 'withdrawn') continue;
        ship.targetId = targetId;
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
        for (let i = 0; i < 3; i++) spawnTorpedo(state, ship, target, def.weapons[1], i * 14 - 14);
        logEvent(state, `${def.name} launches a torpedo salvo!`);
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

let aiAccumulator = new WeakMap<BattleState, number>();

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

        // Retreat completes once the ship re-enters its own edge strip.
        if (ship.status === 'retreating' && inOwnEdgeZone(state, ship)) {
            ship.status = 'withdrawn';
            logEvent(state, `${SHIP_CLASSES[ship.classId].name} has left the battlefield.`);
        }
    }

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
    if (state.time - ship.lastHitAt >= def.shieldRegenDelay && ship.shield < def.maxShield) {
        ship.shield = Math.min(def.maxShield, ship.shield + def.shieldRegen * h);
    }
}

function tickAbility(state: BattleState, ship: TacticalShip, h: number) {
    if (ship.abilityCooldown > 0) ship.abilityCooldown = Math.max(0, ship.abilityCooldown - h);
    const def = SHIP_CLASSES[ship.classId];
    if (def.ability.id === 'emergency_repairs' && ship.abilityActiveUntil > state.time) {
        const rate = (def.maxHull * 0.2) / def.ability.duration;
        ship.hull = Math.min(def.maxHull, ship.hull + rate * h);
    }
}

export function applyDamage(state: BattleState, target: TacticalShip, amount: number) {
    const def = SHIP_CLASSES[target.classId];
    let dmg = amount;
    if (def.ability.id === 'overcharge_shields' && target.abilityActiveUntil > state.time) {
        dmg *= 0.4;
    }
    target.lastHitAt = state.time;
    const absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    dmg -= absorbed;
    if (dmg > 0) target.hull -= dmg;
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

export function inArcAndRange(ship: TacticalShip, weapon: WeaponDef, target: TacticalShip): boolean {
    const dx = target.x - ship.x;
    const dy = target.y - ship.y;
    if (Math.hypot(dx, dy) > weapon.range) return false;
    if (weapon.arc >= Math.PI * 2 - 1e-6) return true;
    const bearing = Math.atan2(dy, dx);
    const mountDir = normalizeAngle(ship.heading + weapon.mountAngle);
    return Math.abs(angleDiff(mountDir, bearing)) <= weapon.arc / 2;
}

function resolveTarget(state: BattleState, ship: TacticalShip, weapon: WeaponDef): TacticalShip | null {
    // Explicit target first, if this weapon can bear on it.
    if (ship.targetId) {
        const t = state.ships.find(sh => sh.id === ship.targetId);
        if (t && isHostileTargetable(ship, t)) {
            if (inArcAndRange(ship, weapon, t)) return t;
        } else {
            ship.targetId = null; // stale lock
        }
    }
    // Weapons-free: nearest hostile this weapon can bear on.
    let best: TacticalShip | null = null;
    let bestDist = Infinity;
    for (const other of state.ships) {
        if (!isHostileTargetable(ship, other)) continue;
        if (!inArcAndRange(ship, weapon, other)) continue;
        const d = Math.hypot(other.x - ship.x, other.y - ship.y);
        if (d < bestDist) { bestDist = d; best = other; }
    }
    return best;
}

function tickWeapons(state: BattleState, ship: TacticalShip, h: number) {
    const def = SHIP_CLASSES[ship.classId];
    const overcharging = def.ability.id === 'overcharge_shields' && ship.abilityActiveUntil > state.time;

    for (let i = 0; i < def.weapons.length; i++) {
        if (ship.weaponCooldowns[i] > 0) {
            ship.weaponCooldowns[i] = Math.max(0, ship.weaponCooldowns[i] - h);
        }
        if (ship.weaponCooldowns[i] > 0 || overcharging) continue;

        const weapon = def.weapons[i];
        const target = resolveTarget(state, ship, weapon);
        if (!target) continue;

        ship.weaponCooldowns[i] = weapon.cooldown;
        if (weapon.projectile === 'torpedo') {
            spawnTorpedo(state, ship, target, weapon, 0);
        } else {
            applyDamage(state, target, weapon.damage);
            state.beams.push({
                x1: ship.x, y1: ship.y, x2: target.x, y2: target.y,
                side: ship.side, expiresAt: state.time + 0.12,
            });
        }
    }
}

function spawnTorpedo(state: BattleState, ship: TacticalShip, target: TacticalShip, weapon: WeaponDef, lateralOffset: number) {
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
        const dx = target.x - torp.x;
        const dy = target.y - torp.y;
        const dist = Math.hypot(dx, dy);
        const hitDist = SHIP_CLASSES[target.classId].radius + 5;
        if (dist <= hitDist) {
            applyDamage(state, target, torp.damage);
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

    for (const ship of state.ships) {
        if (ship.side !== 'enemy' || ship.status !== 'active') continue;
        const def = SHIP_CLASSES[ship.classId];

        // Target: aggressive → weakest hull; otherwise nearest.
        let target: TacticalShip;
        if (st.plan.posture === 'aggressive') {
            target = hostiles.reduce((a, b) => (a.hull < b.hull ? a : b));
        } else {
            target = hostiles.reduce((a, b) =>
                Math.hypot(a.x - ship.x, a.y - ship.y) < Math.hypot(b.x - ship.x, b.y - ship.y) ? a : b);
        }
        ship.targetId = target.id;

        const dx = target.x - ship.x;
        const dy = target.y - ship.y;
        const dist = Math.hypot(dx, dy);
        const bearing = Math.atan2(dy, dx);
        const pref = def.preferredRange * (st.plan.posture === 'defensive' ? 1.15 : st.plan.posture === 'aggressive' ? 0.8 : 1);

        // Standoff point on the line to the target at preferred range.
        const standX = target.x - Math.cos(bearing) * pref;
        const standY = target.y - Math.sin(bearing) * pref;

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

        // Abilities.
        if (ship.abilityCooldown <= 0) {
            switch (def.ability.id) {
                case 'afterburner':
                    if (dist > pref * 2) useAbility(state, ship.id);
                    break;
                case 'torpedo_salvo': {
                    const big = target.classId === 'cruiser' || target.classId === 'battleship';
                    if (big && dist < def.weapons[1].range) useAbility(state, ship.id);
                    break;
                }
                case 'overcharge_shields':
                    if (ship.shield < def.maxShield * 0.3) useAbility(state, ship.id);
                    break;
                case 'emergency_repairs':
                    if (ship.hull < def.maxHull * 0.5) useAbility(state, ship.id);
                    break;
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
    // battle open after the last fielded ship has left.
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
