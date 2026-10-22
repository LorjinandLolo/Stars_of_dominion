// lib/combat/siege/chaos.ts
//
// Friction. No plan survives contact: orders go astray, a battalion takes the
// wrong road, an officer is hit at the worst moment, the weather turns. These
// are small, real effects on the board — a lost move, an organisation hit, a
// partisan band behind the lines — rolled once per cycle so that two identical
// sieges stop playing out identically and a commander has something to react
// to besides the casualty count.
//
// Pure over the board and the rng passed in. The worker calls rollWeather once
// per cycle, rollPreMoveChaos before orders resolve, and rollPostBattleChaos
// after the district battles; the events go into the cycle report.

import type { PlanetSurface, TerrainType } from '../../planet-surface/types';
import type { DistrictWarState, GroundUnitType, TacticalStanceId } from './siege-types';
import type { Formation, FormationSide } from './formations';
import { isHeavy, legalMoves } from './formations';
import { controllerOf, isPassable } from './district-front';

// ─── Weather ────────────────────────────────────────────────────────────────

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'fog' | 'dust' | 'blizzard' | 'ashfall';

export interface WeatherState {
    kind: WeatherKind;
    /** Last cycle this weather holds; a new roll comes after it. */
    untilCycle: number;
}

export const WEATHER_LABEL: Record<WeatherKind, string> = {
    clear: 'Clear skies', rain: 'Heavy rain', storm: 'Storm', fog: 'Thick fog',
    dust: 'Dust storm', blizzard: 'Blizzard', ashfall: 'Ashfall',
};

/** What a weather does to the fight. Multipliers are on strength; 1 is no effect. */
export interface WeatherEffect {
    /** Armor and artillery: mud, wind and white-out blunt the heavy formations. */
    heavy: number;
    /** Artillery specifically: spotters cannot see the fall of shot. */
    artillery: number;
    /** The ambush stance: poor visibility is an ambusher's friend. */
    ambush: number;
    /** Air drops (MIL_AIR_DROP) are grounded. */
    groundsDrops: boolean;
    /** Organisation recovered at rest is scaled by this. */
    recovery: number;
    /** Chance multiplier on friction events: bad weather breeds mistakes. */
    friction: number;
}

export const WEATHER_EFFECT: Record<WeatherKind, WeatherEffect> = {
    clear:    { heavy: 1,    artillery: 1,    ambush: 1,    groundsDrops: false, recovery: 1,    friction: 1 },
    rain:     { heavy: 0.85, artillery: 0.95, ambush: 1.05, groundsDrops: false, recovery: 0.9,  friction: 1.3 },
    storm:    { heavy: 0.75, artillery: 0.85, ambush: 1.1,  groundsDrops: true,  recovery: 0.8,  friction: 1.6 },
    fog:      { heavy: 0.95, artillery: 0.7,  ambush: 1.25, groundsDrops: false, recovery: 1,    friction: 1.5 },
    dust:     { heavy: 0.8,  artillery: 0.8,  ambush: 1.1,  groundsDrops: true,  recovery: 0.85, friction: 1.4 },
    blizzard: { heavy: 0.7,  artillery: 0.8,  ambush: 1.15, groundsDrops: true,  recovery: 0.6,  friction: 1.6 },
    ashfall:  { heavy: 0.85, artillery: 0.75, ambush: 1.15, groundsDrops: true,  recovery: 0.7,  friction: 1.4 },
};

/** The bad weather a world's ground breeds, by its dominant terrain. */
const LOCAL_WEATHER: Partial<Record<TerrainType, WeatherKind[]>> = {
    frozen: ['blizzard', 'fog', 'storm'],
    desert: ['dust', 'dust', 'storm'],
    volcanic: ['ashfall', 'ashfall', 'storm'],
    toxic: ['fog', 'ashfall', 'storm'],
    jungle: ['rain', 'rain', 'fog', 'storm'],
    forest: ['rain', 'fog', 'storm'],
    urban: ['rain', 'fog'],
    ocean: ['storm', 'rain', 'fog'],
};
const DEFAULT_WEATHER: WeatherKind[] = ['rain', 'fog', 'storm'];

function dominantTerrain(surface: PlanetSurface): TerrainType {
    const n = new Map<TerrainType, number>();
    for (const s of surface.sectors) if (s.terrain !== 'ocean') n.set(s.terrain, (n.get(s.terrain) ?? 0) + 1);
    let best: TerrainType = 'plains';
    let top = 0;
    for (const [t, c] of n) if (c > top) { best = t; top = c; }
    return best;
}

/**
 * The weather for this cycle: the current front holds until it runs out, then
 * a new one rolls — clear about half the time, otherwise whatever the world's
 * ground breeds, for 2-5 cycles (10-25 real minutes).
 */
export function rollWeather(
    surface: PlanetSurface,
    current: WeatherState | undefined,
    cycle: number,
    rng: () => number,
): WeatherState {
    if (current && cycle <= current.untilCycle) return current;
    const pool = LOCAL_WEATHER[dominantTerrain(surface)] ?? DEFAULT_WEATHER;
    const kind: WeatherKind = rng() < 0.5 ? 'clear' : pool[Math.floor(rng() * pool.length) % pool.length];
    return { kind, untilCycle: cycle + 1 + Math.floor(rng() * 4) };
}

/**
 * Strength multiplier the weather puts on one side's formations in a
 * district: the heavy share bogs down, artillery loses its spotters, an
 * ambusher gains. Folded into the district battle's per-side `dealt` trait.
 */
export function weatherMultiplier(
    kind: WeatherKind,
    units: Array<{ unitType: GroundUnitType; strength: number }>,
    stance: TacticalStanceId,
): number {
    const fx = WEATHER_EFFECT[kind];
    const total = units.reduce((s, u) => s + u.strength, 0);
    if (total <= 0) return 1;
    let heavy = 0, guns = 0;
    for (const u of units) {
        if (isHeavy(u.unitType)) heavy += u.strength;
        if (u.unitType === 'ARTILLERY') guns += u.strength;
    }
    const heavyShare = heavy / total;
    const gunShare = guns / total;
    let m = 1 - heavyShare * (1 - fx.heavy) - gunShare * (1 - fx.artillery);
    if (stance === 'MANEUVER_AMBUSH') m *= fx.ambush;
    return Math.max(0.5, m);
}

// ─── Friction events ────────────────────────────────────────────────────────

export type ChaosKind =
    | 'comms_jammed'    // orders never arrive: a formation holds where it is
    | 'lost_unit'       // a formation takes the wrong road
    | 'bogged_down'     // heavy formation stuck in the mud
    | 'officer_killed'  // organisation hit at the worst moment
    | 'friendly_fire'   // the guns hit their own
    | 'supply_dump'     // a depot goes up
    | 'partisans'       // a band rises behind the invader's line
    | 'deserters'       // a beaten army bleeds men
    | 'rally';          // someone stands up and the line steadies

export interface ChaosEvent {
    kind: ChaosKind;
    /** The side it happened TO. */
    side: FormationSide;
    sector?: number;
    formationId?: string;
    /** Men lost (or, for partisans, raised). */
    men?: number;
    text: string;
}

export interface ChaosContext {
    surface: PlanetSurface;
    war: DistrictWarState;
    formations: Formation[];
    cycle: number;
    weather: WeatherKind;
    rng: () => number;
    /** 0-100 per side, as the battle uses it. */
    morale: Record<FormationSide, number>;
    /**
     * Whether the defender has a population to raise partisans from. False on
     * contested ground (nobody lives on an empty world) and for natives'
     * own wars where the guerrillas are already on the board.
     */
    partisansAllowed: boolean;
}

/** Base chance per cycle of a friction event before moves and after battles. */
export const PRE_MOVE_CHANCE = 0.3;
export const POST_BATTLE_CHANCE = 0.45;
/** Partisans raised behind the line: militia, this many. */
export const PARTISAN_MEN: [number, number] = [40, 120];

const NOUN: Record<GroundUnitType, string> = {
    INFANTRY: 'infantry', ARMOR: 'armour', ARTILLERY: 'artillery', ANTI_ARMOR: 'anti-tank battalion',
    AIRBORNE: 'airborne', SPECIAL_OPS: 'commando team', MILITIA: 'militia', ELDER_INFERNOID: 'Elder',
};

function pick<T>(rng: () => number, xs: readonly T[]): T | undefined {
    return xs.length ? xs[Math.floor(rng() * xs.length) % xs.length] : undefined;
}

const live = (fs: Formation[]) => fs.filter(f => f.strength > 0);
const moving = (f: Formation) => f.moveTo != null || (f.path?.length ?? 0) > 0;

/**
 * Before orders resolve: the ways a move goes wrong. At most one event.
 * Mutates the formation's orders in place.
 */
export function rollPreMoveChaos(ctx: ChaosContext): ChaosEvent[] {
    const { rng, formations, surface, war } = ctx;
    const fx = WEATHER_EFFECT[ctx.weather];
    if (rng() >= PRE_MOVE_CHANCE * fx.friction) return [];
    const movers = live(formations).filter(f => moving(f) && !f.redeploying);
    if (!movers.length) return [];

    const roll = rng();
    const f = pick(rng, movers)!;
    const noun = NOUN[f.unitType];

    // Heavy formations off-road in bad weather: stuck.
    if (roll < 0.35 && isHeavy(f.unitType) && fx.heavy < 1) {
        f.moveTo = null;
        return [{ kind: 'bogged_down', side: f.side, sector: f.sectorIndex, formationId: f.id,
            text: `The ${noun} in district ${f.sectorIndex} bogs down — it will not move this cycle.` }];
    }
    // Wrong road: the step lands on another legal district instead.
    if (roll < 0.65) {
        const target = f.moveTo ?? f.path?.[0];
        const options = legalMoves(surface, war, f).filter(o => o.sectorIndex !== target && !o.contested);
        const alt = pick(rng, options);
        if (alt) {
            f.moveTo = alt.sectorIndex;
            f.path = [];
            return [{ kind: 'lost_unit', side: f.side, sector: alt.sectorIndex, formationId: f.id,
                text: `The ${noun} takes the wrong road and ends up in district ${alt.sectorIndex}.` }];
        }
    }
    // Orders never arrive.
    f.moveTo = null;
    f.path = [];
    return [{ kind: 'comms_jammed', side: f.side, sector: f.sectorIndex, formationId: f.id,
        text: `Orders for the ${noun} in district ${f.sectorIndex} never arrive — it holds where it is.` }];
}

/**
 * After the district battles: what the fighting left behind. At most one
 * event (two in foul weather). Mutates formations in place and returns any
 * NEW formations the caller must add to the board (partisans) — the caller
 * owns the list, and the pools are rewritten from it afterwards.
 */
export function rollPostBattleChaos(
    ctx: ChaosContext,
    fought: Set<number>,
): { events: ChaosEvent[]; spawned: Formation[] } {
    const { rng, formations, surface, war, cycle } = ctx;
    const fx = WEATHER_EFFECT[ctx.weather];
    const events: ChaosEvent[] = [];
    const spawned: Formation[] = [];
    const rolls = fx.friction >= 1.5 ? 2 : 1;

    for (let r = 0; r < rolls; r++) {
        if (rng() >= POST_BATTLE_CHANCE * Math.min(1.5, fx.friction)) continue;
        const inFight = live(formations).filter(f => fought.has(f.sectorIndex));
        const kinds: ChaosKind[] = [];
        if (inFight.length) kinds.push('officer_killed', 'rally');
        if (inFight.some(f => f.unitType === 'ARTILLERY')) kinds.push('friendly_fire');
        kinds.push('supply_dump');
        if (ctx.partisansAllowed && ctx.morale.defender >= 40) kinds.push('partisans', 'partisans');
        for (const side of ['attacker', 'defender'] as const) {
            if (ctx.morale[side] < 35 || live(formations).some(f => f.side === side && (f.starvedCycles ?? 0) > 0)) {
                kinds.push('deserters');
                break;
            }
        }
        const kind = pick(rng, kinds);
        if (!kind) continue;
        const ev = applyPostBattle(kind, inFight, spawned, cycle);
        if (ev && !events.some(e => e.kind === ev.kind)) events.push(ev);
    }
    return { events, spawned };

    function applyPostBattle(
        kind: ChaosKind,
        inFight: Formation[],
        out: Formation[],
        cyc: number,
    ): ChaosEvent | null {
        switch (kind) {
            case 'officer_killed': {
                const f = pick(rng, inFight);
                if (!f) return null;
                f.organization = Math.max(0, (f.organization ?? 100) - 25);
                return { kind, side: f.side, sector: f.sectorIndex, formationId: f.id,
                    text: `The ${NOUN[f.unitType]}'s commander is killed in district ${f.sectorIndex} — the unit wavers.` };
            }
            case 'rally': {
                const shaken = inFight.filter(f => (f.organization ?? 100) < 50);
                const f = pick(rng, shaken);
                if (!f) return null;
                f.organization = Math.min(100, (f.organization ?? 100) + 25);
                return { kind, side: f.side, sector: f.sectorIndex, formationId: f.id,
                    text: `A sergeant stands up in district ${f.sectorIndex} and the ${NOUN[f.unitType]} rallies around them.` };
            }
            case 'friendly_fire': {
                const guns = inFight.filter(f => f.unitType === 'ARTILLERY');
                const g = pick(rng, guns);
                if (!g) return null;
                const victims = inFight.filter(f => f.side === g.side && f.sectorIndex === g.sectorIndex && f.unitType !== 'ARTILLERY' && f.unitType !== 'ELDER_INFERNOID');
                const v = pick(rng, victims);
                if (!v) return null;
                const men = Math.max(1, Math.round(v.strength * (0.02 + rng() * 0.03)));
                v.strength -= men;
                v.organization = Math.max(0, (v.organization ?? 100) - 8);
                return { kind, side: v.side, sector: v.sectorIndex, formationId: v.id, men,
                    text: `Short rounds: the guns in district ${v.sectorIndex} hit their own ${NOUN[v.unitType]} — ${men} lost.` };
            }
            case 'supply_dump': {
                const side: FormationSide = rng() < 0.5 ? 'attacker' : 'defender';
                const depot = side === 'attacker'
                    ? war.landingZones.filter(i => controllerOf(war, i) === 'attacker')
                    : surface.sectors.filter(s => s.ring <= 1 && controllerOf(war, s.index) === 'defender').map(s => s.index);
                const at = pick(rng, depot);
                if (at == null) return null;
                const hit = live(formations).filter(f => f.side === side);
                for (const f of hit) f.supply = Math.max(0, f.supply - 15);
                return { kind, side, sector: at,
                    text: `A ${side === 'attacker' ? 'beachhead' : 'capital'} supply depot in district ${at} goes up — every ${side === 'attacker' ? 'invader' : 'defender'} formation goes short.` };
            }
            case 'partisans': {
                // Behind the invader's line: their ground, none of their pieces on it.
                const occupied = new Set(live(formations).map(f => f.sectorIndex));
                const behind = surface.sectors.filter(s =>
                    isPassable(s) && controllerOf(war, s.index) === 'attacker'
                    && !occupied.has(s.index) && !war.landingZones.includes(s.index));
                const s = pick(rng, behind);
                if (!s) return null;
                const [lo, hi] = PARTISAN_MEN;
                const men = Math.round(lo + rng() * (hi - lo));
                out.push({
                    id: `partisan-${cyc}-${s.index}`,
                    side: 'defender',
                    unitType: 'MILITIA',
                    strength: men,
                    maxStrength: men,
                    sectorIndex: s.index,
                    supply: 60,
                    organization: 70,
                });
                return { kind, side: 'defender', sector: s.index, men,
                    text: `Partisans rise in occupied district ${s.index} — ${men} armed locals behind the invader's line.` };
            }
            case 'deserters': {
                const side: FormationSide = ctx.morale.attacker < ctx.morale.defender ? 'attacker' : 'defender';
                const cand = live(formations).filter(f => f.side === side && f.unitType !== 'ELDER_INFERNOID');
                const f = pick(rng, cand.sort((a, b) => (b.starvedCycles ?? 0) - (a.starvedCycles ?? 0)).slice(0, 3));
                if (!f) return null;
                const men = Math.max(1, Math.round(f.strength * 0.08));
                f.strength -= men;
                return { kind, side, sector: f.sectorIndex, formationId: f.id, men,
                    text: `${men} ${NOUN[f.unitType]} slip away from district ${f.sectorIndex} in the night.` };
            }
            default:
                return null;
        }
    }
}
