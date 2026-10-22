// lib/camps/labour-camp.ts
// Stars of Dominion — the camp world: a whole planet turned into a prison,
// a slave labour camp, a test ground or a forge for soldiers.
//
// Any empire may designate one of its colonies (not its capital). Who is sent
// there: prisoners of war (POW_DISPOSE 'camp'), its own dissidents (a purge
// takes unrest off a home world), the people of a world it conquered
// (deport), and a beaten native people (their fate: 'camp').
//
// What it gives, by mode:
//   labour       mines, foundries and arsenals: metals, materiel, ammo each
//                strategic tick, and gangs that build the camp world's own
//                districts and ships faster.
//   experiments  research from testing on the inmates. They die fast; the
//                galaxy hears of it.
//   forge        the Salusa Secundus treatment: the harshest survivors become
//                elite soldiers (Special Ops) who muster on the camp world.
//                Harder worlds (ice, ash, poison) forge better.
// And at any time it can draft penal battalions (militia) from the inmates.
//
// The danger: too few guards for too many inmates and they break out. The
// breakout is a real siege on the camp world's district board, the inmates
// attacking under the pseudo-empire inmates:<planetId> (scripts/game-loop.ts
// startCampBreakout). If they take the capital the world breaks free and
// becomes an independent people of freed convicts (lib/natives).
//
// State on planet.camp. Pure apart from the world it is handed; no lib/db.

import type { GameWorldState } from '../game-world-state';
import { RNG, seedFromString } from '../trade-system/rng';
import { grantResearchHours } from '../natives/natives';

export const INMATES_PREFIX = 'inmates:';
export const inmatesIdFor = (planetId: string) => `${INMATES_PREFIX}${planetId}`;
export const isInmatesId = (id?: string | null): boolean => !!id && id.startsWith(INMATES_PREFIX);

export type CampMode = 'labour' | 'experiments' | 'forge';
export const CAMP_MODES: readonly CampMode[] = ['labour', 'experiments', 'forge'];
export type InmateOrigin = 'pow' | 'dissidents' | 'conquered' | 'natives';

export interface CampState {
    mode: CampMode;
    inmates: number;
    byOrigin: Record<InmateOrigin, number>;
    designatedAt: number;
    /** Last purge or deportation per source world (sim seconds). */
    lastTaken: Record<string, number>;
    /** Elite soldiers forged and waiting to muster (fractions carry over). */
    forging: number;
    breakouts: number;
    /** A breakout is being fought right now. */
    revolt?: boolean;
    /** Set by the strategic tick; the worker starts the breakout siege on its next loop. */
    pendingBreakout?: boolean;
}

// ─── Tuning ──────────────────────────────────────────────────────────────────

export const DESIGNATE_COST = { CREDITS: 6000 };
/** Per inmate per strategic tick (24 real minutes), labour mode. */
export const LABOUR_YIELD = { METALS: 0.02, MATERIEL: 0.002, AMMO: 0.002 };
/** Share of inmates who die per strategic tick, by mode. */
export const MORTALITY: Record<CampMode, number> = { labour: 0.01, experiments: 0.035, forge: 0.02 };
/** Research hours per 1,000 inmates per tick (experiments), capped. */
export const EXPERIMENT_HOURS_PER_1000 = 2.5;
export const EXPERIMENT_HOURS_CAP = 8;
/** Share of inmates forged into elite soldiers per tick (forge). */
export const FORGE_RATE = 0.005;
/** Inmates one guard can hold before the risk of a breakout climbs. */
export const INMATES_PER_GUARD = 3;
/** Build-speed multiplier on the camp world's own districts and ships. */
export const CAMP_BUILD_SPEED = 1.5;
export const PURGE_COOLDOWN = 86400;
export const DRAFT_MAX = 2000;

const ZERO_ORIGINS = (): Record<InmateOrigin, number> => ({ pow: 0, dissidents: 0, conquered: 0, natives: 0 });

// ─── Reads ───────────────────────────────────────────────────────────────────

export const campOf = (planet: any): CampState | null => planet?.camp ?? null;

/** Every camp world an empire runs. */
export function campsOf(world: GameWorldState, factionId: string): any[] {
    return [...world.construction.planets.values()].filter((p: any) => p.ownerId === factionId && p.camp);
}

/** Men guarding the camp: the garrison and the empire's own armies standing on it. */
export function guardsOf(world: GameWorldState, planet: any): number {
    let guards = Number(planet.garrison?.garrisonTroops) || 0;
    for (const a of (world.movement.armies?.values() ?? []) as Iterable<any>) {
        if (a.currentPlanetId !== planet.id || a.transportFleetId || a.factionId !== planet.ownerId) continue;
        guards += Object.values(a.composition ?? {}).reduce((s: number, n: any) => s + (Number(n) || 0), 0);
    }
    return guards;
}

/** Chance of a breakout this strategic tick. */
export function breakoutChance(inmates: number, guards: number): number {
    if (inmates < 200) return 0;
    const ratio = inmates / Math.max(1, guards * INMATES_PER_GUARD);
    return ratio <= 1 ? 0.004 : Math.min(0.5, 0.02 + (ratio - 1) * 0.2);
}

export function riskWord(p: number): string {
    return p >= 0.25 ? 'boiling over' : p >= 0.08 ? 'restless' : p > 0.005 ? 'tense' : 'held';
}

/** Harsh worlds forge harder soldiers. */
export function forgeMultiplier(planet: any): number {
    const t = (planet.tags ?? []).join(' ');
    return /archetype:(frozen|volcanic|toxic|arid)|irradiated/.test(t) ? 1.5 : 1;
}

/** Build-speed multiplier for a planet: the camp gangs. 1 elsewhere. */
export const campBuildSpeed = (planet: any): number => planet?.camp && !planet.camp.revolt ? CAMP_BUILD_SPEED : 1;

// ─── Orders (CAMP_ORDER) ─────────────────────────────────────────────────────

export interface CampResult { ok: boolean; reason?: string; message?: string; draft?: number }

function addInfamy(world: GameWorldState, factionId: string, n: number): void {
    const ps: any = (world as any).politics?.empires?.get?.(factionId);
    if (ps) ps.infamy = (ps.infamy ?? 0) + n;
}

function isCapitalWorld(world: GameWorldState, planet: any): boolean {
    if (planet.planetType === 'capital' || planet.isCapital || planet.isHomeworld) return true;
    const capSys = (world.economy.factions.get(planet.ownerId) as any)?.capitalSystemId;
    return !!capSys && capSys === planet.systemId && (planet.tags ?? []).includes('homeworld');
}

export function designateCamp(world: GameWorldState, factionId: string, planetId: string): CampResult {
    const planet: any = world.construction.planets.get(planetId);
    if (!planet || planet.ownerId !== factionId) return { ok: false, reason: 'That world is not ours.' };
    if (planet.camp) return { ok: false, reason: `${planet.name} is already a camp.` };
    if (isCapitalWorld(world, planet)) return { ok: false, reason: 'Not the capital.' };
    if (planet.outpost && !planet.outpost.graduated) return { ok: false, reason: 'An outpost has its own penal charter; a camp world needs a full colony.' };
    if (planet.siege) return { ok: false, reason: `${planet.name} is a battlefield.` };
    const r = world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined;
    if ((r?.CREDITS ?? 0) < DESIGNATE_COST.CREDITS) return { ok: false, reason: `Needs ${DESIGNATE_COST.CREDITS.toLocaleString()} credits.` };
    r!.CREDITS -= DESIGNATE_COST.CREDITS;
    planet.camp = { mode: 'labour', inmates: 0, byOrigin: ZERO_ORIGINS(), designatedAt: world.nowSeconds, lastTaken: {}, forging: 0, breakouts: 0 } as CampState;
    (planet.tags ?? (planet.tags = [])).push('labour_camp');
    planet.stability = Math.max(0, (planet.stability ?? 60) - 15);
    planet.happiness = Math.max(0, (planet.happiness ?? 50) - 20);
    addInfamy(world, factionId, 3);
    return { ok: true, message: `${planet.name} is fenced, towered and floodlit. It is a camp world now.` };
}

export function setCampMode(world: GameWorldState, factionId: string, planetId: string, mode: CampMode): CampResult {
    const planet: any = world.construction.planets.get(planetId);
    if (!planet?.camp || planet.ownerId !== factionId) return { ok: false, reason: 'No camp of ours there.' };
    if (!CAMP_MODES.includes(mode)) return { ok: false, reason: 'Unknown mode.' };
    planet.camp.mode = mode;
    return { ok: true, message: mode === 'labour' ? 'The camp works the mines and foundries.' : mode === 'experiments' ? 'The camp is turned over to the scientists.' : 'The camp becomes a forge for soldiers. Most will not survive it.' };
}

/** Add people to a camp. */
export function admit(planet: any, origin: InmateOrigin, n: number): number {
    const c: CampState = planet.camp;
    const count = Math.max(0, Math.round(n));
    c.inmates += count;
    c.byOrigin[origin] = (c.byOrigin[origin] ?? 0) + count;
    return count;
}

/** Pick the camp to send people to: the one named, or the empire's first. */
export function campFor(world: GameWorldState, factionId: string, campId?: string): any | null {
    const named: any = campId ? world.construction.planets.get(campId) : null;
    if (named?.camp && named.ownerId === factionId) return named;
    return campsOf(world, factionId)[0] ?? null;
}

/** Round up the malcontents of one of our worlds: unrest falls, the camp fills. */
export function purge(world: GameWorldState, factionId: string, campId: string | undefined, fromPlanetId: string): CampResult {
    const camp = campFor(world, factionId, campId);
    if (!camp) return { ok: false, reason: 'We have no camp world.' };
    const from: any = world.construction.planets.get(fromPlanetId);
    if (!from || from.ownerId !== factionId) return { ok: false, reason: 'That world is not ours.' };
    if (from.id === camp.id) return { ok: false, reason: 'They are already in the camp.' };
    const last = camp.camp.lastTaken[from.id] ?? -Infinity;
    if (world.nowSeconds - last < PURGE_COOLDOWN) return { ok: false, reason: `${from.name} was purged too recently.` };
    const unrest = from.unrest ?? 0;
    const taken = admit(camp, 'dissidents', 300 + unrest * 20);
    from.unrest = Math.max(0, unrest - 25);
    from.stability = Math.min(100, (from.stability ?? 60) + 5);
    from.happiness = Math.max(0, (from.happiness ?? 50) - 8);
    from.population = Math.max(1, (from.population ?? 1) * 0.99);
    camp.camp.lastTaken[from.id] = world.nowSeconds;
    addInfamy(world, factionId, 2);
    return { ok: true, message: `${taken.toLocaleString()} dissidents from ${from.name} were sent to ${camp.name}. The streets are quiet.` };
}

/** Deport part of the people of a world we conquered. */
export function deport(world: GameWorldState, factionId: string, campId: string | undefined, fromPlanetId: string): CampResult {
    const camp = campFor(world, factionId, campId);
    if (!camp) return { ok: false, reason: 'We have no camp world.' };
    const from: any = world.construction.planets.get(fromPlanetId);
    if (!from || from.ownerId !== factionId) return { ok: false, reason: 'That world is not ours.' };
    if (!from.conqueredFrom) return { ok: false, reason: `${from.name}'s people are our own; purge its dissidents instead.` };
    const last = camp.camp.lastTaken[from.id] ?? -Infinity;
    if (world.nowSeconds - last < PURGE_COOLDOWN) return { ok: false, reason: `${from.name} was emptied too recently.` };
    const pop = from.population ?? 0;
    if (pop < 2) return { ok: false, reason: 'There is hardly anyone left to take.' };
    const gone = pop * 0.15;
    from.population = pop - gone;
    from.unrest = Math.min(100, (from.unrest ?? 0) + 15);
    const taken = admit(camp, 'conquered', gone * 100);
    camp.camp.lastTaken[from.id] = world.nowSeconds;
    addInfamy(world, factionId, 5);
    return { ok: true, message: `${taken.toLocaleString()} people of ${from.name} were deported to ${camp.name}.` };
}

/** Draft penal battalions: inmates become militia standing on the camp world. */
export function draft(world: GameWorldState, factionId: string, campId: string): CampResult {
    const camp: any = world.construction.planets.get(campId);
    if (!camp?.camp || camp.ownerId !== factionId) return { ok: false, reason: 'No camp of ours there.' };
    if (camp.camp.revolt) return { ok: false, reason: 'The camp is in revolt.' };
    const n = Math.min(DRAFT_MAX, Math.floor(camp.camp.inmates * 0.5));
    if (n < 100) return { ok: false, reason: 'Too few inmates fit to fight.' };
    camp.camp.inmates -= n;
    return { ok: true, draft: n, message: `${n.toLocaleString()} inmates were handed rifles and formed into penal battalions on ${camp.name}.` };
}

// ─── The strategic tick ──────────────────────────────────────────────────────

export interface CampTickEvent {
    /** 'notify' a message; 'breakout' the caller starts the siege; 'forged' the caller musters soldiers. */
    kind: 'notify' | 'breakout' | 'forged';
    planetId: string;
    factionId: string;
    title?: string;
    body?: string;
    men?: number;
}

/** One strategic tick for every camp world. The caller applies breakouts and musters. */
export function tickCamps(world: GameWorldState): CampTickEvent[] {
    const out: CampTickEvent[] = [];
    for (const planet of world.construction.planets.values() as Iterable<any>) {
        const c: CampState | undefined = planet.camp;
        if (!c) continue;
        if (!planet.ownerId) { delete planet.camp; continue; }
        if (c.revolt) continue;
        const owner = planet.ownerId;
        const r = world.economy.factions.get(owner)?.reserves as Record<string, number> | undefined;

        if (c.inmates > 0 && r) {
            if (c.mode === 'labour') {
                for (const [k, per] of Object.entries(LABOUR_YIELD)) r[k] = (r[k] ?? 0) + Math.floor(c.inmates * per);
            } else if (c.mode === 'experiments') {
                grantResearchHours(world, owner, Math.min(EXPERIMENT_HOURS_CAP, (c.inmates / 1000) * EXPERIMENT_HOURS_PER_1000));
                addInfamy(world, owner, 1);
            } else if (c.mode === 'forge') {
                c.forging += c.inmates * FORGE_RATE * forgeMultiplier(planet);
                const men = Math.floor(c.forging);
                if (men >= 10) {
                    c.forging -= men;
                    c.inmates = Math.max(0, c.inmates - men);
                    out.push({ kind: 'forged', planetId: planet.id, factionId: owner, men });
                }
            }
            // The camps kill.
            c.inmates = Math.max(0, Math.floor(c.inmates * (1 - MORTALITY[c.mode])));
            planet.unrest = Math.min(100, (planet.unrest ?? 0) + 1);
        }

        // Too few guards: they break out.
        const p = breakoutChance(c.inmates, guardsOf(world, planet));
        const rng = new RNG(seedFromString(`${planet.id}|breakout|${Math.floor(world.nowSeconds / 1440)}|${c.breakouts}`));
        if (p > 0 && rng.check(p)) {
            out.push({ kind: 'breakout', planetId: planet.id, factionId: owner });
        }
    }
    return out;
}

/** Forged soldiers muster into one standing army on the camp world ("The Forged of ..."). */
export function musterForged(world: GameWorldState, planet: any, men: number): void {
    if (!world.movement.armies) (world.movement as any).armies = new Map();
    const id = `army-${planet.ownerId}-forged-${planet.id}`;
    const existing: any = world.movement.armies!.get(id);
    if (existing && existing.currentPlanetId === planet.id && !existing.transportFleetId) {
        existing.composition.SPECIAL_OPS = (existing.composition.SPECIAL_OPS ?? 0) + men;
        return;
    }
    // The last company shipped out: a new one forms (a fresh id, so the old one keeps its own).
    const fresh = existing ? `${id}-${world.nowSeconds}` : id;
    world.movement.armies!.set(fresh, {
        id: fresh, factionId: planet.ownerId, name: `The Forged of ${planet.name}`, currentPlanetId: planet.id, currentSystemId: planet.systemId,
        transportFleetId: null, composition: { SPECIAL_OPS: men }, stance: 'fortified', strength: 1, basePower: 100, supplyLevel: 1, morale: 90,
        stationedAt: world.nowSeconds, dugIn: 0,
    } as any);
}
