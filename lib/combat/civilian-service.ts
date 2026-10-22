// lib/combat/civilian-service.ts
// Stars of Dominion — what the unarmed ships do (lib/combat/civilian-ships.ts).
//
//   refreshDockedCivilians  every worker cycle: which freighters and builders
//                           are docked at which of their owner's worlds (taxes,
//                           build sites and orbital speed read it), and which
//                           systems each empire's spy ships can see.
//   tickCivilianShips       every strategic cycle: freighter routes and foreign
//                           trade, spy ships caught in foreign space, and
//                           unescorted civilian fleets taken by an enemy at war.
//   foundOutpost            a builder ship spent to claim an empty world.
//
// Worker-side: imports the diplomacy and colonization services.

import type { GameWorldState } from '../game-world-state';
import type { Fleet } from '../movement/types';
import {
    civilianCount, isCivilianFleet, BUILDER_DOCK_MAX, FREIGHTER_DOCK_MAX, FOREIGN_TRADE_CREDITS,
    ROUTE_CARGO_PER_FREIGHTER, ROUTE_CREDITS_PER_UNIT, SPY_CATCH_CHANCE, OUTPOST_COST, type DockedCivilians,
} from './civilian-ships';
import { isAtWar, shiftRivalry } from '../diplomacy/offer-service';
import { changeFleetCourse } from '../movement/movement-service';
import { colonizePlanet } from '../exploration/colonize-service';
import { fireNotification } from '../time/notification-hooks';
import { RNG, seedFromString } from '../trade-system/rng';
import { createOutpostState } from '../outposts/outpost-map';
import { outpostSightSystems } from '../outposts/outpost-service';
import { CHARTERS } from '../outposts/outpost-catalog';
import type { CharterId } from '../outposts/outpost-types';

const parked = (f: Fleet) => !!f.currentSystemId && !f.destinationSystemId;

function notify(world: GameWorldState, factionId: string, id: string, title: string, body: string): void {
    try {
        fireNotification({
            id, factionId, category: 'combat', priority: 'normal', title, body,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(), read: false,
        } as any);
    } catch { /* notification queue absent in probes */ }
}

// ─── Every cycle ─────────────────────────────────────────────────────────────

export function refreshDockedCivilians(world: GameWorldState): void {
    const docked = new Map<string, DockedCivilians>();
    const sight = new Map<string, Set<string>>();
    for (const fleet of world.movement.fleets.values()) {
        if (!parked(fleet)) continue;
        const freighters = civilianCount(fleet.composition, 'freighter');
        const builders = civilianCount(fleet.composition, 'builder');
        const spies = civilianCount(fleet.composition, 'spy');
        if ((freighters || builders) && fleet.orbitingPlanetId) {
            const planet = world.construction.planets.get(fleet.orbitingPlanetId);
            if (planet && planet.ownerId === fleet.factionId && planet.systemId === fleet.currentSystemId && !fleet.tradeRoute) {
                const d = docked.get(planet.id) ?? { freighters: 0, builders: 0 };
                d.freighters += freighters;
                d.builders += builders;
                docked.set(planet.id, d);
            }
        }
        if (spies) {
            const set = sight.get(fleet.factionId) ?? new Set<string>();
            set.add(fleet.currentSystemId!);
            for (const n of world.movement.systems.get(fleet.currentSystemId!)?.hyperlaneNeighbors ?? []) set.add(n);
            sight.set(fleet.factionId, set);
        }
    }
    for (const planet of world.construction.planets.values()) {
        const d = docked.get(planet.id);
        const capped = d ? { freighters: Math.min(FREIGHTER_DOCK_MAX, d.freighters), builders: Math.min(BUILDER_DOCK_MAX, d.builders) } : undefined;
        if (capped || planet.dockedCivilians) planet.dockedCivilians = capped;
        const eco = world.economy.planets.get(planet.id);
        if (eco) eco.dockedFreighters = capped?.freighters ?? 0;
    }
    for (const [factionId, faction] of world.economy.factions) {
        // Outpost sensor masts see too (lib/outposts).
        const masts = outpostSightSystems(world, factionId);
        if (masts.size) { const set = sight.get(factionId) ?? new Set<string>(); for (const id of masts) set.add(id); sight.set(factionId, set); }
        const set = sight.get(factionId);
        (faction as any).spySight = set ? [...set] : undefined;
    }
}

/** Systems where this empire has a spy ship parked (for network growth and trace). */
export function spyShipSystems(world: GameWorldState, factionId: string): Set<string> {
    const out = new Set<string>();
    for (const f of world.movement.fleets.values()) {
        if (f.factionId === factionId && parked(f) && civilianCount(f.composition, 'spy') > 0) out.add(f.currentSystemId!);
    }
    return out;
}

// ─── Every strategic cycle ───────────────────────────────────────────────────

const STORABLE = ['metals', 'chemicals', 'food', 'energy', 'rare'] as const;

function runTradeRoute(world: GameWorldState, fleet: Fleet): void {
    const route = fleet.tradeRoute!;
    const from = world.construction.planets.get(route.fromPlanetId);
    const to = world.construction.planets.get(route.toPlanetId);
    if (!from || !to || from.ownerId !== fleet.factionId || to.ownerId !== fleet.factionId) {
        fleet.tradeRoute = undefined; // a world on the route was lost
        notify(world, fleet.factionId, `route-end-${fleet.id}-${world.nowSeconds}`, 'Trade route closed', `${fleet.name} lost one end of its route and is holding position.`);
        return;
    }
    if (!parked(fleet)) return;
    const here = fleet.currentSystemId === from.systemId ? from : fleet.currentSystemId === to.systemId ? to : null;
    if (!here) {
        // Off the route (sent away by hand): head back to the loading end.
        const moved = changeFleetCourse(fleet, from.systemId, 'hyperlane', world.movement);
        moved.arrivalOrbitPlanetId = from.id;
        world.movement.fleets.set(fleet.id, moved);
        return;
    }
    // Both ends in one system: no voyage, the goods change hands every cycle.
    const sameSystem = from.systemId === to.systemId;
    const there = here === from ? to : from;
    const freighters = civilianCount(fleet.composition, 'freighter');

    const deliver = (at: typeof here) => {
        const cargo = route.cargo;
        if (!cargo || !(cargo.amount > 0) || cargo.loadedAt === at.id) return;
        const eco = world.economy.planets.get(at.id);
        if (eco) {
            const key = cargo.resource as keyof typeof eco.stockpile;
            eco.stockpile[key] = (eco.stockpile[key] ?? 0) + cargo.amount;
            const reserves = world.economy.factions.get(fleet.factionId)?.reserves as Record<string, number> | undefined;
            if (reserves) reserves.CREDITS = (reserves.CREDITS ?? 0) + cargo.amount * ROUTE_CREDITS_PER_UNIT;
            route.delivered = (route.delivered ?? 0) + cargo.amount;
        }
        route.cargo = undefined;
    };
    // Load what this end has most of and the other end lacks most.
    const load = (at: typeof here, other: typeof here) => {
        const src = world.economy.planets.get(at.id)?.stockpile ?? {};
        const dst = world.economy.planets.get(other.id)?.stockpile ?? {};
        let best: { resource: string; amount: number; gap: number } | null = null;
        for (const res of STORABLE) {
            const gap = (src[res] ?? 0) - (dst[res] ?? 0);
            const amount = Math.floor(Math.min(ROUTE_CARGO_PER_FREIGHTER * freighters, (src[res] ?? 0) * 0.5));
            if (gap > 0 && amount > 0 && (!best || gap > best.gap)) best = { resource: res, amount, gap };
        }
        if (!best) return;
        (src as any)[best.resource] = (src[best.resource as keyof typeof src] ?? 0) - best.amount;
        route.cargo = { resource: best.resource, amount: best.amount, loadedAt: at.id };
    };

    if (sameSystem) {
        load(from, to);
        deliver(to);
        return;
    }
    deliver(here);
    // Cargo still aboard was loaded here and the last departure failed: just sail.
    if (!route.cargo) load(here, there);
    const moved = changeFleetCourse(fleet, there.systemId, 'hyperlane', world.movement);
    if (moved !== fleet) {
        moved.orbitingPlanetId = null;
        moved.arrivalOrbitPlanetId = there.id;
        world.movement.fleets.set(fleet.id, moved);
    }
}

function hasTradePact(world: GameWorldState, a: string, b: string): boolean {
    for (const pact of world.tradePacts?.values?.() ?? []) {
        if ((pact.empireAId === a && pact.empireBId === b) || (pact.empireAId === b && pact.empireBId === a)) return true;
    }
    return false;
}

export function tickCivilianShips(world: GameWorldState): void {
    const fleets = [...world.movement.fleets.values()];
    const armedBySystem = new Map<string, Fleet[]>();
    for (const f of fleets) {
        if (!parked(f) || isCivilianFleet(f) || !(f.basePower > 0)) continue;
        const list = armedBySystem.get(f.currentSystemId!) ?? [];
        list.push(f);
        armedBySystem.set(f.currentSystemId!, list);
    }

    for (const fleet of fleets) {
        if (!world.movement.fleets.has(fleet.id)) continue;
        if (!isCivilianFleet(fleet)) continue;
        const live = world.movement.fleets.get(fleet.id)!;

        // An unescorted civilian fleet meeting an armed enemy at war is taken.
        if (parked(live)) {
            const armed = armedBySystem.get(live.currentSystemId!) ?? [];
            const escorted = armed.some(f => f.factionId === live.factionId);
            const raider = armed.find(f => f.factionId !== live.factionId && isAtWar(world, f.factionId, live.factionId));
            if (raider && !escorted) {
                world.movement.fleets.delete(live.id);
                const where = world.movement.systems.get(live.currentSystemId!)?.name ?? live.currentSystemId;
                notify(world, live.factionId, `civ-lost-${live.id}`, `${live.name} lost`, `Enemy warships caught ${live.name} unescorted at ${where}.`);
                notify(world, raider.factionId, `civ-taken-${live.id}`, 'Enemy ships destroyed', `${raider.name} caught an unescorted ${live.name} at ${where}.`);
                continue;
            }
        }

        // Freighters: a route, or trade at a partner's world.
        if (civilianCount(live.composition, 'freighter') > 0) {
            if (live.tradeRoute) {
                runTradeRoute(world, live);
            } else if (parked(live) && live.orbitingPlanetId) {
                const host = world.construction.planets.get(live.orbitingPlanetId)?.ownerId;
                if (host && host !== live.factionId && hasTradePact(world, live.factionId, host)) {
                    const n = civilianCount(live.composition, 'freighter');
                    const own = world.economy.factions.get(live.factionId)?.reserves as Record<string, number> | undefined;
                    const theirs = world.economy.factions.get(host)?.reserves as Record<string, number> | undefined;
                    if (own) own.CREDITS = (own.CREDITS ?? 0) + FOREIGN_TRADE_CREDITS.owner * n;
                    if (theirs) theirs.CREDITS = (theirs.CREDITS ?? 0) + FOREIGN_TRADE_CREDITS.host * n;
                    shiftRivalry(world, live.factionId, host, -0.5, 'trade_visit');
                }
            }
        }

        // Spy ships in someone else's space can be caught.
        if (civilianCount(live.composition, 'spy') > 0 && parked(live)) {
            const owner = world.movement.systems.get(live.currentSystemId!)?.ownerFactionId;
            if (owner && owner !== live.factionId && (world as any).government?.has?.(owner)) {
                const rng = new RNG(seedFromString(`${live.id}|spy-catch|${Math.floor(world.nowSeconds / 21600)}`));
                if (rng.check(SPY_CATCH_CHANCE)) {
                    world.movement.fleets.delete(live.id);
                    const where = world.movement.systems.get(live.currentSystemId!)?.name ?? live.currentSystemId;
                    shiftRivalry(world, owner, live.factionId, 5, 'spy_ship_caught');
                    notify(world, live.factionId, `spy-caught-${live.id}`, 'Spy ship caught', `${live.name} was found and seized at ${where}.`);
                    notify(world, owner, `spy-found-${live.id}`, 'Foreign spy ship seized', `Your patrols seized a spy ship at ${where}. Its owners are known to you.`);
                }
            }
        }
    }
}

// ─── Outposts ────────────────────────────────────────────────────────────────

export interface OutpostResult { ok: boolean; reason?: string }

/** Spend one builder ship from fleetId to claim planetId as an outpost. Charges OUTPOST_COST. */
export function foundOutpost(world: GameWorldState, factionId: string, fleetId: string, planetId: string, charter: CharterId = 'settlement'): OutpostResult {
    const fleet = world.movement.fleets.get(fleetId);
    if (!fleet || fleet.factionId !== factionId) return { ok: false, reason: 'No such fleet under your command.' };
    if (civilianCount(fleet.composition, 'builder') < 1) return { ok: false, reason: 'That fleet has no builder ship.' };
    const planet = world.construction.planets.get(planetId);
    if (!planet) return { ok: false, reason: 'No such world.' };
    if (!parked(fleet) || fleet.currentSystemId !== planet.systemId) return { ok: false, reason: 'The builder ship must be parked in that world’s system.' };
    if (planet.ownerId && planet.ownerId !== 'faction-neutral') return { ok: false, reason: `${planet.name} already belongs to someone.` };
    if ((planet as any).destroyed) return { ok: false, reason: `${planet.name} is a debris field: there is nothing to build on.` };
    const reserves = world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined;
    for (const [key, amt] of Object.entries(OUTPOST_COST)) {
        if ((reserves?.[key] ?? 0) < amt) return { ok: false, reason: `An outpost needs ${amt.toLocaleString()} ${key.toLowerCase()}.` };
    }
    // Outposts may stand on worlds no colony can (rock, ice, gas): the tag
    // that forbids settlement is lifted for an outpost.
    // In place: colonizePlanet hands the same tag array to the economy record.
    if (!Array.isArray(planet.tags)) planet.tags = [];
    const deadAt = planet.tags.indexOf('dead_matter');
    if (deadAt >= 0) planet.tags.splice(deadAt, 1);
    const result = colonizePlanet(world, factionId, planetId);
    if (deadAt >= 0) planet.tags.push('dead_matter'); // still no place for a colony
    if (!result.ok) return { ok: false, reason: result.reason };
    for (const [key, amt] of Object.entries(OUTPOST_COST)) reserves![key] -= amt;
    if (!planet.tags.includes('outpost')) planet.tags.push('outpost');
    planet.population = 1;
    planet.popCapacity = 5;
    const eco = world.economy.planets.get(planetId);
    if (eco) { eco.demographics.population = 1; eco.demographics.housingCapacity = 5; }
    // The outpost itself: a small grid run by shifts until it grows into a colony.
    (planet as any).outpost = createOutpostState(planet, world.nowSeconds, CHARTERS[charter] ? charter : 'settlement');

    const left = civilianCount(fleet.composition, 'builder') - 1;
    for (const key of Object.keys(fleet.composition)) if (key.toLowerCase() === 'builder') delete fleet.composition[key];
    if (left > 0) fleet.composition.builder = left;
    if (!Object.values(fleet.composition).some(n => (Number(n) || 0) > 0)) world.movement.fleets.delete(fleet.id);
    return { ok: true };
}
