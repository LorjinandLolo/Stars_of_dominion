// lib/combat/planet-ruin.ts
// Stars of Dominion — bombarding a world to oblivion, in three steps.
//
//   terror bombing   MIL_BOMBARD_PLANET mode 'TERROR': every volley kills a
//                    share of the people, wrecks districts and breaks the
//                    world's spirit. Blunted by the orbital layer, the surface
//                    guns' screen and above all a planetary shield.
//   glassing         MIL_GLASS_PLANET: a fleet that holds the orbit burns the
//                    whole surface to glass over about two real hours of
//                    sustained fire (more power, faster; a shield slows it to
//                    a crawl). Lose the orbit and it pauses. At the end
//                    everyone is dead, every building is slag, nobody owns
//                    it, and it is dead rock only an outpost can use.
//   world breaker    MIL_BUILD_WORLDBREAKER at a top-tier yard (three real
//                    days, a fortune), then MIL_CRACK_PLANET: hold the orbit
//                    for half an hour while it charges and the world is gone.
//                    What is left is a debris field. A day to recharge.
//
// Anyone may do any of it. The galaxy remembers: infamy for the doer, and
// every other empire's rivalry rises. The victim is warned when glassing or a
// charge begins, so there is always a window to answer.
//
// Pure apart from the world it is handed; no lib/db. The worker's order
// handlers call in; the strategic tick advances glassing, charges and builds.

import type { GameWorldState } from '../game-world-state';
import { RNG, seedFromString } from '../trade-system/rng';
import { isOrbitSuppressed } from '../orbital/orbital-service';
import { isAtWar, shiftRivalry } from '../diplomacy/offer-service';
import { SIM_SECONDS_PER_REAL_SECOND } from '../time/time-config';
import { planetYardTier, MAX_YARD_TIER } from './shipyard-gate';

const REAL = (seconds: number) => seconds * SIM_SECONDS_PER_REAL_SECOND;

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** Terror bombing, per volley at full effect. */
export const TERROR_POP_LOSS = 0.06;
export const TERROR_STABILITY = 15;
export const TERROR_UNREST = 15;
export const TERROR_INFAMY = 2;
/** Fleet power at which glassing runs at its base pace (two real hours). */
export const GLASS_MIN_POWER = 400;
export const GLASS_SIM_SECONDS = REAL(2 * 3600);
/** A shield over the world: glassing at this share of its pace. */
export const SHIELD_GLASS_FACTOR = 0.25;
export const GLASS_INFAMY = 40;
export const GLASS_RIVALRY_ALL = 15;
export const GLASS_RIVALRY_VICTIM = 40;
export const BREAKER_COST: Record<string, number> = { CREDITS: 250000, METALS: 60000, MATERIEL: 8000 };
export const BREAKER_BUILD_SIM_SECONDS = REAL(3 * 86400);
export const CRACK_CHARGE_SIM_SECONDS = REAL(30 * 60);
export const BREAKER_RECHARGE_SIM_SECONDS = REAL(86400);
export const CRACK_INFAMY = 100;
export const CRACK_RIVALRY_ALL = 30;

export interface RuinResult { ok: boolean; reason?: string; message?: string }
/** [factionId, title, body] — the caller sends them. */
export type RuinNotice = [string, string, string];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addInfamy(world: GameWorldState, factionId: string, n: number): void {
    const ps: any = (world as any).politics?.empires?.get?.(factionId);
    if (ps) ps.infamy = (ps.infamy ?? 0) + n;
}

const parked = (f: any) => !!f.currentSystemId && !f.destinationSystemId && (f.strength ?? 1) > 0;
const powerOf = (f: any) => Math.max(0, Number(f.basePower) || 0) * Math.max(0, Math.min(1, Number(f.strength ?? 1)));

/** The doer's operational power parked over the world. */
export function powerOver(world: GameWorldState, factionId: string, systemId: string): number {
    let p = 0;
    for (const f of world.movement.fleets.values() as Iterable<any>) {
        if (f.factionId === factionId && f.currentSystemId === systemId && parked(f)) p += powerOf(f);
    }
    return p;
}

/**
 * Does this empire hold the sky over the world: its ships are there, no ship
 * of an empire at war with it (or of the world's owner) is, and the world's
 * own orbital defences are beaten down.
 */
export function holdsOrbit(world: GameWorldState, factionId: string, planet: any): boolean {
    if (powerOver(world, factionId, planet.systemId) <= 0) return false;
    for (const f of world.movement.fleets.values() as Iterable<any>) {
        if (f.factionId === factionId || f.currentSystemId !== planet.systemId || !parked(f)) continue;
        if (f.factionId === planet.ownerId || isAtWar(world, factionId, f.factionId)) return false;
    }
    return !planet.orbital || isOrbitSuppressed(planet);
}

const shieldUp = (planet: any) => (planet.tiles ?? []).some((t: any) => t.buildingId === 'shield_generator' && t.constructionState === 'active');

/** May this empire strike this world at all: never its own, and at war with the owner if it has one. */
function mayStrike(world: GameWorldState, factionId: string, planet: any): string | null {
    if (planet.destroyed) return 'There is nothing left there.';
    if (planet.ownerId === factionId) return 'That is our own world.';
    if (planet.ownerId && !isAtWar(world, factionId, planet.ownerId)) return 'We are not at war with its owner.';
    return null;
}

/** Every empire in the game (for galaxy-wide notices and rivalry). */
function allEmpires(world: GameWorldState): string[] {
    return [...world.economy.factions.keys()].filter(id => !id.startsWith('natives:') && !id.startsWith('inmates:'));
}

/**
 * Nobody owns this world any more: no owner, no economy record, no garrison.
 * Shared by camp breakouts that win, glassing and the world breaker.
 */
export function releasePlanet(world: GameWorldState, planet: any): void {
    planet.ownerId = '';
    planet.isOccupied = false;
    world.economy.planets.delete(planet.id);
    delete planet.garrison;
    planet.siege = null;
}

/** Everyone on the world dies and everything on it burns. */
function killWorld(world: GameWorldState, planet: any): void {
    for (const [id, a] of [...(world.movement.armies?.entries() ?? [])] as Array<[string, any]>) {
        if (a.currentPlanetId === planet.id && !a.transportFleetId) world.movement.armies!.delete(id);
    }
    for (const t of planet.tiles ?? []) if (t.buildingId) t.constructionState = 'ruined';
    planet.buildQueue = [];
    planet.population = 0;
    planet.popCapacity = 0;
    planet.popGrowth = 0;
    planet.demographics = [];
    delete planet.natives;
    delete planet.camp;
    delete planet.outpost;
    if (planet.orbital) planet.orbital.slots = [];
    releasePlanet(world, planet);
}

/** The galaxy turns on the doer. */
function outrage(world: GameWorldState, doer: string, victim: string | undefined, all: number, extraVictim: number, infamy: number, kind: string): void {
    addInfamy(world, doer, infamy);
    for (const f of allEmpires(world)) {
        if (f === doer) continue;
        try { shiftRivalry(world, doer, f, all + (f === victim ? extraVictim : 0), kind); } catch { /* diplomacy not ready */ }
    }
}

// ─── Terror bombing ──────────────────────────────────────────────────────────

/**
 * One volley of terror bombing. `factor` is what reaches the ground after the
 * orbital layer and the guns' screen (the bombard handler computes it); a
 * shield takes most of the rest. Returns what it did, for the log.
 */
export function terrorBombard(world: GameWorldState, factionId: string, planet: any, fleetPower: number, factor: number): { killedShare: number; ruined: number } {
    const f = Math.max(0, Math.min(1, factor)) * (shieldUp(planet) ? 0.2 : 1) * Math.min(1.5, Math.max(0.3, fleetPower / 200));
    const killedShare = TERROR_POP_LOSS * f;
    planet.population = Math.max(0, (planet.population ?? 0) * (1 - killedShare));
    const eco: any = world.economy.planets.get(planet.id);
    if (eco?.demographics) eco.demographics.population = Math.max(0, (eco.demographics.population ?? 0) * (1 - killedShare));
    planet.stability = Math.max(0, (planet.stability ?? 60) - TERROR_STABILITY * f);
    planet.unrest = Math.min(100, (planet.unrest ?? 0) + TERROR_UNREST * f);
    if (planet.garrison) planet.garrison.garrisonTroops = Math.max(0, Math.round((planet.garrison.garrisonTroops ?? 0) * (1 - 0.05 * f)));
    // Districts burn: one or two per volley, unless the shield holds them.
    const rng = new RNG(seedFromString(`${planet.id}|terror|${world.nowSeconds}`));
    const standing = (planet.tiles ?? []).filter((t: any) => t.buildingId && t.constructionState === 'active');
    let ruined = 0;
    const want = f >= 0.5 ? (fleetPower > 300 ? 2 : 1) : rng.check(f) ? 1 : 0;
    for (let i = 0; i < want && standing.length; i++) {
        standing.splice(Math.floor(rng.next() * standing.length), 1)[0].constructionState = 'ruined';
        ruined++;
    }
    addInfamy(world, factionId, TERROR_INFAMY);
    if (planet.ownerId) { try { shiftRivalry(world, factionId, planet.ownerId, 6, 'terror_bombing'); } catch { /* diplomacy not ready */ } }
    return { killedShare, ruined };
}

// ─── Glassing ────────────────────────────────────────────────────────────────

export interface GlassingState { factionId: string; progress: number; startedAt: number; lastAt: number; paused?: boolean; halfwayTold?: boolean }

export function startGlassing(world: GameWorldState, factionId: string, planetId: string): RuinResult & { notices?: RuinNotice[] } {
    const planet: any = world.construction.planets.get(planetId);
    if (!planet) return { ok: false, reason: 'No such world.' };
    const refusal = mayStrike(world, factionId, planet);
    if (refusal) return { ok: false, reason: refusal };
    if (planet.glassed) return { ok: false, reason: `${planet.name} is already glass.` };
    if (planet.glassing && planet.glassing.factionId !== factionId) return { ok: false, reason: 'Someone else is already burning it.' };
    if (planet.glassing) return { ok: false, reason: 'We are already burning it.' };
    if (powerOver(world, factionId, planet.systemId) < GLASS_MIN_POWER * 0.5) return { ok: false, reason: `It takes a battle fleet: at least ${GLASS_MIN_POWER / 2} power parked over it.` };
    if (!holdsOrbit(world, factionId, planet)) return { ok: false, reason: 'We must hold the orbit: no enemy ships, and its orbital defences beaten down.' };
    planet.glassing = { factionId, progress: 0, startedAt: world.nowSeconds, lastAt: world.nowSeconds } as GlassingState;
    const notices: RuinNotice[] = [];
    if (planet.ownerId) notices.push([planet.ownerId, `${planet.name} is being glassed`, `Enemy ships have begun burning ${planet.name} to glass. In about two hours nothing will be left alive. Break their hold on the orbit.`]);
    return { ok: true, message: `The fleet opens fire on everything on ${planet.name}. About two hours.`, notices };
}

export function stopGlassing(world: GameWorldState, factionId: string, planetId: string): RuinResult {
    const planet: any = world.construction.planets.get(planetId);
    if (!planet?.glassing || planet.glassing.factionId !== factionId) return { ok: false, reason: 'We are not burning it.' };
    delete planet.glassing;
    return { ok: true, message: `The guns over ${planet.name} fall silent.` };
}

/** The end of a world: glass. */
export function glassWorld(world: GameWorldState, planet: any, doer: string): RuinNotice[] {
    const victim = planet.ownerId || undefined;
    killWorld(world, planet);
    delete planet.glassing;
    planet.glassed = { by: doer, at: world.nowSeconds };
    planet.tags = (planet.tags ?? []).filter((t: string) => !['colony', 'colonizable', 'natives', 'labour_camp', 'outpost', 'fertile', 'pristine'].includes(t));
    for (const t of ['dead_matter', 'glassed']) if (!planet.tags.includes(t)) planet.tags.push(t);
    outrage(world, doer, victim, GLASS_RIVALRY_ALL, GLASS_RIVALRY_VICTIM, GLASS_INFAMY, 'glassing');
    const name = (world.economy.factions.get(doer) as any)?.name ?? doer;
    return allEmpires(world).map(f => [f, `${planet.name} has been glassed`, f === doer
        ? `${planet.name} is glass. Nothing lives there now. The galaxy knows who did it.`
        : `${name} burned ${planet.name} to glass. Everyone on it is dead.`] as RuinNotice);
}

// ─── The World Breaker ───────────────────────────────────────────────────────

export interface BreakerProject { factionId: string; startedAt: number; completesAt: number }

export function startWorldBreaker(world: GameWorldState, factionId: string, planetId: string): RuinResult {
    const planet: any = world.construction.planets.get(planetId);
    if (!planet || planet.ownerId !== factionId) return { ok: false, reason: 'That world is not ours.' };
    if (planetYardTier(planet, world.nowSeconds) < MAX_YARD_TIER) return { ok: false, reason: `It needs a tier ${MAX_YARD_TIER} shipyard (the one that lays battleships).` };
    for (const p of world.construction.planets.values() as Iterable<any>) {
        if (p.worldBreakerProject?.factionId === factionId) return { ok: false, reason: `We are already building one at ${p.name}.` };
    }
    const r = world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined;
    for (const [k, v] of Object.entries(BREAKER_COST)) if ((r?.[k] ?? 0) < v) return { ok: false, reason: `It needs ${v.toLocaleString()} ${k.toLowerCase()}.` };
    for (const [k, v] of Object.entries(BREAKER_COST)) r![k] -= v;
    planet.worldBreakerProject = { factionId, startedAt: world.nowSeconds, completesAt: world.nowSeconds + BREAKER_BUILD_SIM_SECONDS } as BreakerProject;
    return { ok: true, message: `The keel of a World Breaker is laid at ${planet.name}. Three days.` };
}

/** A finished World Breaker: one huge ship, a battleship to the battle engine. */
export function launchWorldBreaker(world: GameWorldState, planet: any, factionId: string): any {
    const id = `fleet-${factionId}-worldbreaker-${world.nowSeconds}`;
    const fleet: any = {
        id, factionId, name: 'World Breaker', currentSystemId: planet.systemId, arrivedAtSeconds: world.nowSeconds,
        orbitingPlanetId: planet.id, destinationSystemId: null, activeLayer: null, transitProgress: 0, etaSeconds: 0,
        plannedPath: [], orders: [],
        doctrine: { type: 'Defensive', deviationFromPosture: 0, preferredLayers: ['hyperlane', 'gate'], retreatThreshold: 0.3, logisticsStrain: 0, moraleDrift: 0, supplyLevel: 1.0 },
        postureId: 'Expansionist', strength: 1.0, basePower: 320, composition: { battleship: 2 },
        hyperdriveProfile: {
            hyperlane: { speedMultiplier: 0.6, detectabilityMultiplier: 2.0, supplyStrainMultiplier: 1.0 },
            trade: { speedMultiplier: 0.6, detectabilityMultiplier: 2.0, supplyStrainMultiplier: 1.0 },
            corridor: { speedMultiplier: 0.8, detectabilityMultiplier: 2.0, supplyStrainMultiplier: 1.0 },
            gate: { speedMultiplier: 5.0, detectabilityMultiplier: 3.0, supplyStrainMultiplier: 1.0 },
            deepSpace: { speedMultiplier: 0.3, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
        },
        isDetectable: true, transportedArmyIds: [], leaderId: undefined,
        worldBreaker: true,
        breakerReadyAt: world.nowSeconds,
    };
    world.movement.fleets.set(id, fleet);
    return fleet;
}

export function startCrack(world: GameWorldState, factionId: string, fleetId: string, planetId: string): RuinResult & { notices?: RuinNotice[] } {
    const fleet: any = world.movement.fleets.get(fleetId);
    const planet: any = world.construction.planets.get(planetId);
    if (!fleet || fleet.factionId !== factionId || !fleet.worldBreaker) return { ok: false, reason: 'That is not our World Breaker.' };
    if (!planet) return { ok: false, reason: 'No such world.' };
    const refusal = mayStrike(world, factionId, planet);
    if (refusal) return { ok: false, reason: refusal };
    if (!parked(fleet) || fleet.currentSystemId !== planet.systemId) return { ok: false, reason: `The World Breaker must be parked over ${planet.name}.` };
    if ((fleet.breakerReadyAt ?? 0) > world.nowSeconds) return { ok: false, reason: 'The World Breaker is still recharging.' };
    if (fleet.crackCharge) return { ok: false, reason: 'It is already charging.' };
    if (!holdsOrbit(world, factionId, planet)) return { ok: false, reason: 'We must hold the orbit while it charges.' };
    fleet.crackCharge = { planetId, startedAt: world.nowSeconds };
    const notices: RuinNotice[] = [];
    if (planet.ownerId) notices.push([planet.ownerId, `A World Breaker charges over ${planet.name}`, `An enemy World Breaker is charging over ${planet.name}. In about thirty minutes the world will be gone. Destroy it or drive it off.`]);
    return { ok: true, message: `The World Breaker begins to charge. Hold the orbit for thirty minutes.`, notices };
}

/** The world is gone. A debris field is all that is left. */
export function destroyWorld(world: GameWorldState, planet: any, doer: string): RuinNotice[] {
    const victim = planet.ownerId || undefined;
    killWorld(world, planet);
    delete planet.glassing;
    planet.destroyed = { by: doer, at: world.nowSeconds };
    planet.tiles = [];
    planet.maxTiles = 0;
    planet.tags = ['destroyed', 'dead_matter'];
    // Its moons now circle nothing.
    for (const p of world.construction.planets.values() as Iterable<any>) if (p.parentPlanetId === planet.id) delete p.parentPlanetId;
    outrage(world, doer, victim, CRACK_RIVALRY_ALL, CRACK_RIVALRY_ALL, CRACK_INFAMY, 'world_destroyed');
    const name = (world.economy.factions.get(doer) as any)?.name ?? doer;
    return allEmpires(world).map(f => [f, `${planet.name} is gone`, f === doer
        ? `The World Breaker fired. ${planet.name} is a field of debris.`
        : `${name} destroyed ${planet.name}. The world is gone: a field of debris where it was.`] as RuinNotice);
}

// ─── The strategic tick ──────────────────────────────────────────────────────

/** Advance glassing, World Breaker builds and charges. Returns notices to send. */
export function tickPlanetRuin(world: GameWorldState): RuinNotice[] {
    const out: RuinNotice[] = [];
    const now = world.nowSeconds;

    for (const planet of world.construction.planets.values() as Iterable<any>) {
        // Builds finishing.
        const proj: BreakerProject | undefined = planet.worldBreakerProject;
        if (proj && now >= proj.completesAt) {
            delete planet.worldBreakerProject;
            if (planet.ownerId === proj.factionId) {
                launchWorldBreaker(world, planet, proj.factionId);
                out.push([proj.factionId, 'The World Breaker is complete', `The World Breaker has left the yards at ${planet.name}. Park it over a world, hold the orbit, and charge it.`]);
            }
        }

        // Glassing.
        const g: GlassingState | undefined = planet.glassing;
        if (g) {
            const elapsed = Math.max(0, now - g.lastAt);
            g.lastAt = now;
            if (planet.destroyed || planet.ownerId === g.factionId || (planet.ownerId && !isAtWar(world, g.factionId, planet.ownerId))) { delete planet.glassing; continue; }
            if (!holdsOrbit(world, g.factionId, planet)) {
                if (!g.paused) out.push([g.factionId, `${planet.name}: the burning stops`, `We lost the orbit over ${planet.name}; the glassing is paused at ${Math.round(g.progress * 100)}%.`]);
                g.paused = true;
                continue;
            }
            g.paused = false;
            const pace = Math.min(2, powerOver(world, g.factionId, planet.systemId) / GLASS_MIN_POWER) * (shieldUp(planet) ? SHIELD_GLASS_FACTOR : 1);
            g.progress = Math.min(1, g.progress + (elapsed / GLASS_SIM_SECONDS) * pace);
            // The world dies by degrees while it burns.
            planet.population = Math.max(0, (planet.population ?? 0) * (1 - 0.15 * pace * (elapsed / GLASS_SIM_SECONDS) * 4));
            if (!g.halfwayTold && g.progress >= 0.5 && planet.ownerId) {
                g.halfwayTold = true;
                out.push([planet.ownerId, `${planet.name} is half glass`, `Half of ${planet.name} is burned. There is still time to break their orbit.`]);
            }
            if (g.progress >= 1) out.push(...glassWorld(world, planet, g.factionId));
        }
    }

    // World Breaker charges.
    for (const fleet of world.movement.fleets.values() as Iterable<any>) {
        const c = fleet.crackCharge;
        if (!fleet.worldBreaker || !c) continue;
        const planet: any = world.construction.planets.get(c.planetId);
        if (!planet || planet.destroyed || !parked(fleet) || fleet.currentSystemId !== planet.systemId || !holdsOrbit(world, fleet.factionId, planet)) {
            delete fleet.crackCharge;
            out.push([fleet.factionId, 'The charge is broken', `The World Breaker lost its hold${planet ? ` over ${planet.name}` : ''}; the charge is gone.`]);
            if (planet?.ownerId) out.push([planet.ownerId, `${planet.name} is saved`, `The World Breaker's charge over ${planet.name} was broken.`]);
            continue;
        }
        if (now - c.startedAt >= CRACK_CHARGE_SIM_SECONDS) {
            delete fleet.crackCharge;
            fleet.breakerReadyAt = now + BREAKER_RECHARGE_SIM_SECONDS;
            out.push(...destroyWorld(world, planet, fleet.factionId));
        }
    }
    return out;
}
