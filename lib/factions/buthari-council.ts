// lib/factions/buthari-council.ts
// The Council of Five — Gharnuq, Barra, Zughra, Rahla and Thamir.
//
// "Super-powered defenders, each representing a sacred mountain beast ... Once
// per galactic cycle, can deploy one or all of the Five in planetary defense or
// targeted missions."
//
// ── Provenance ───────────────────────────────────────────────────────────────
// The catalog below is folded in from lib/mechanics/hero-actions.ts, which held
// all five champions with correct names and descriptions, a cooldown, a cost —
// and five empty effect bodies, zero importers anywhere in the repo, and a
// factionId of 'buthari_council' that matches no faction the game actually runs.
// It was a specification, not a mechanic. That file is deleted; this is it.
//
// ── The cycle, compressed ────────────────────────────────────────────────────
// The original cooldown was 10,000 ticks, commented as "one Galactic Cycle". At
// six sim-hours per tick that is roughly 166 real days — a cooldown no player
// would ever see lapse. It is compressed to one season-length arc, matching the
// Bloodmoon cycle, and the cooldown is PER CHAMPION so all five are reachable
// across a season while each call remains a considered one.

import type { GameWorldState } from '../game-world-state';
import type { CouncilState } from './faction-traits-types';
import { emptyButhariTraitState, emptyCouncilState } from './faction-traits-types';
import { isButhari } from './civ-ids';
import { bumpMetric } from '../tech/history-ledger';
import { issueMoveOrder } from '../movement/movement-service';
import { applyOrbitalDamage } from '../orbital/orbital-service';

const TICK_SECONDS = 6 * 60 * 60;

/** One season-length arc between callings of the same champion. */
export const COUNCIL_COOLDOWN_SECONDS = 120 * TICK_SECONDS;

/** What one calling costs, in the Buthari's own sacred harvest. */
export const COUNCIL_COST_RESOURCE = 'SACRED_FLORA';
export const COUNCIL_COST_AMOUNT = 500;

export const DEPLOY_METRIC = 'but.councilDeployments';

export type ChampionId = 'gharnuq_leap' | 'barra_shadow' | 'zughra_flame' | 'rahla_vision' | 'thamir_sabotage';

/** What kind of thing a champion is aimed at, so the order can validate it. */
export type ChampionTarget = 'fleet' | 'system' | 'planet';

export interface Champion {
    id: ChampionId;
    name: string;
    beast: string;
    description: string;
    target: ChampionTarget;
    /** How long the effect lasts, where it lingers. 0 = instantaneous. */
    durationSeconds: number;
}

export const COUNCIL: Record<ChampionId, Champion> = {
    gharnuq_leap: {
        id: 'gharnuq_leap',
        name: "Gharnuq's Cosmic Leap",
        beast: 'Ibex',
        description: 'The Great Ibex grants agility. The target fleet breaks contact instantly and withdraws without casualties.',
        target: 'fleet',
        durationSeconds: 0,
    },
    barra_shadow: {
        id: 'barra_shadow',
        name: "Barra's Silent Shadow",
        beast: 'Snow Panther',
        description: 'The Snow Panther cloaks a system. Rivals lose all sight of it until the veil lifts.',
        target: 'system',
        durationSeconds: 20 * TICK_SECONDS,
    },
    zughra_flame: {
        id: 'zughra_flame',
        name: "Zughra's Radiant Flame",
        beast: 'Fire Bear',
        description: 'The Fire Bear manifests. Enemy ground forces besieging the target world burn away each tick.',
        target: 'planet',
        durationSeconds: 12 * TICK_SECONDS,
    },
    rahla_vision: {
        id: 'rahla_vision',
        name: "Rahla's Future Sight",
        beast: 'Hawk-Deer',
        description: 'The Hawk-Deer reveals the void. Every fleet in the target system is seen, however it hides.',
        target: 'system',
        durationSeconds: 16 * TICK_SECONDS,
    },
    thamir_sabotage: {
        id: 'thamir_sabotage',
        name: "Thamir's Seismic Sabotage",
        beast: 'Rock Serpent',
        description: 'The Rock Serpent strikes at the core. The target world\'s orbital works are shattered.',
        target: 'planet',
        durationSeconds: 0,
    },
};

/** Fraction of besieging troops Zughra burns away per strategic tick. */
export const ZUGHRA_ATTRITION = 0.20;
/** Orbital damage Thamir inflicts in one strike. */
export const THAMIR_VOLLEY = 5000;

export interface GateResult {
    allowed: boolean;
    reason?: string;
}

export function isChampionId(id: string): id is ChampionId {
    return Object.prototype.hasOwnProperty.call(COUNCIL, id);
}

function councilOf(world: GameWorldState, factionId: string): CouncilState | undefined {
    return world.factionTraits?.get(factionId)?.buthari?.council;
}

/** Ensure the council record exists, back-filling onto older trait state. */
export function ensureCouncil(world: GameWorldState, factionId: string): CouncilState | undefined {
    const traits = world.factionTraits?.get(factionId);
    if (!traits) return undefined;
    if (!traits.buthari) traits.buthari = emptyButhariTraitState();
    if (!traits.buthari.council) traits.buthari.council = emptyCouncilState();
    const c = traits.buthari.council;
    // Back-fill each bag individually — a snapshot written before one existed
    // would otherwise leave it undefined and every write would throw.
    if (!c.cooldowns) c.cooldowns = {};
    if (!c.cloakedSystems) c.cloakedSystems = {};
    if (!c.revealedSystems) c.revealedSystems = {};
    if (!c.scorchedPlanets) c.scorchedPlanets = {};
    return c;
}

/** Sim-seconds until this champion can be called again; 0 when ready. */
export function cooldownRemaining(world: GameWorldState, factionId: string, championId: ChampionId): number {
    const until = councilOf(world, factionId)?.cooldowns?.[championId] ?? 0;
    return Math.max(0, until - (world.nowSeconds ?? 0));
}

/** Can this faction call this champion right now? */
export function checkCouncilGate(world: GameWorldState, factionId: string, championId: string): GateResult {
    if (!isChampionId(championId)) {
        return { allowed: false, reason: 'No such member of the Council.' };
    }
    if (!isButhari(world, factionId)) {
        return { allowed: false, reason: 'Only Jabal may call upon the Five.' };
    }
    const remaining = cooldownRemaining(world, factionId, championId);
    if (remaining > 0) {
        const ticks = Math.ceil(remaining / TICK_SECONDS);
        return {
            allowed: false,
            reason: `${COUNCIL[championId].name} is still in seclusion — ${ticks} turn(s) remain.`,
        };
    }
    return { allowed: true };
}

export interface DeployResult {
    success: boolean;
    message: string;
}

/**
 * Call a champion.
 *
 * Payment is the caller's job (the order handler charges it), matching how
 * every other order in the worker settles its cost.
 */
export function deployChampion(
    world: GameWorldState,
    factionId: string,
    championId: string,
    targetId: string,
): DeployResult {
    const gate = checkCouncilGate(world, factionId, championId);
    if (!gate.allowed) return { success: false, message: gate.reason! };
    if (!isChampionId(championId)) return { success: false, message: 'No such champion.' };

    const council = ensureCouncil(world, factionId);
    if (!council) return { success: false, message: 'The Council has no seat in this world.' };

    const champion = COUNCIL[championId];
    const now = world.nowSeconds ?? 0;
    const expiresAt = now + champion.durationSeconds;

    switch (championId) {
        case 'gharnuq_leap': {
            // The Ibex carries a fleet clear. Reuses the same withdrawal the
            // Kaer'Ruun Fear Aura uses — a rout that does not physically move
            // the fleet is a no-op, because the next cycle simply re-engages.
            const fleet: any = world.movement?.fleets?.get(targetId);
            if (!fleet) return { success: false, message: 'No such fleet.' };
            if (fleet.factionId !== factionId) return { success: false, message: 'That fleet is not yours to move.' };

            const destination = fleet.originSystemId && fleet.originSystemId !== fleet.currentSystemId
                ? fleet.originSystemId
                : nearestOwnedSystem(world, factionId, fleet.currentSystemId);
            if (!destination) return { success: false, message: 'There is nowhere to leap to.' };

            try {
                const moved = issueMoveOrder(fleet, destination, 'hyperlane', world.movement);
                // Break contact: any engagement this fleet is in stops existing.
                for (const [id, combat] of [...(world.activeCombats ?? new Map())]) {
                    const c: any = combat;
                    if (c?.attacker?.factionId === factionId || c?.defender?.factionId === factionId) {
                        if (c?.target?.systemId === fleet.currentSystemId) world.activeCombats.delete(id);
                    }
                }
                world.movement.fleets.set(moved.id, moved);
            } catch (e) {
                return { success: false, message: 'The leap failed — no route out.' };
            }
            break;
        }

        case 'barra_shadow': {
            if (!world.movement?.systems?.has(targetId)) return { success: false, message: 'No such system.' };
            council.cloakedSystems[targetId] = expiresAt;
            break;
        }

        case 'rahla_vision': {
            if (!world.movement?.systems?.has(targetId)) return { success: false, message: 'No such system.' };
            council.revealedSystems[targetId] = expiresAt;
            break;
        }

        case 'zughra_flame': {
            const planet: any = world.construction?.planets?.get(targetId);
            if (!planet) return { success: false, message: 'No such world.' };
            council.scorchedPlanets[targetId] = expiresAt;
            break;
        }

        case 'thamir_sabotage': {
            const planet: any = world.construction?.planets?.get(targetId);
            if (!planet) return { success: false, message: 'No such world.' };
            if (planet.ownerId === factionId) {
                return { success: false, message: 'The Serpent does not strike Jabal\'s own works.' };
            }
            try {
                applyOrbitalDamage(planet, THAMIR_VOLLEY);
            } catch {
                return { success: false, message: 'There is nothing in that orbit to break.' };
            }
            break;
        }
    }

    council.cooldowns[championId] = now + COUNCIL_COOLDOWN_SECONDS;
    council.deployments += 1;
    bumpMetric(world as any, factionId, DEPLOY_METRIC, 1);
    console.log(`[Buthari] ${champion.name} answers the Council — target ${targetId}.`);
    return { success: true, message: `${champion.name} answers.` };
}

/** Closest system this faction holds a planet in, by lane hops. */
function nearestOwnedSystem(world: GameWorldState, factionId: string, fromSystemId: string | null): string | null {
    if (!fromSystemId) return null;
    const owned = new Set<string>();
    for (const planet of world.construction?.planets?.values() ?? []) {
        const p: any = planet;
        if (p.ownerId === factionId && p.systemId) owned.add(p.systemId);
    }
    if (!owned.size) return null;

    const seen = new Set([fromSystemId]);
    let frontier = [fromSystemId];
    for (let depth = 0; depth < 24 && frontier.length; depth++) {
        const next: string[] = [];
        for (const id of frontier) {
            for (const neighbour of world.movement.systems.get(id)?.hyperlaneNeighbors ?? []) {
                if (seen.has(neighbour)) continue;
                if (owned.has(neighbour)) return neighbour;
                seen.add(neighbour);
                next.push(neighbour);
            }
        }
        frontier = next;
    }
    return null;
}

// ─── What the engine asks, each tick ────────────────────────────────────────

/** Systems currently veiled by Barra, for every Buthari faction in the world. */
export function cloakedSystems(world: GameWorldState): Set<string> {
    const out = new Set<string>();
    const now = world.nowSeconds ?? 0;
    for (const traits of world.factionTraits?.values() ?? []) {
        const c = traits.buthari?.council;
        for (const [systemId, until] of Object.entries(c?.cloakedSystems ?? {})) {
            if (until > now) out.add(systemId);
        }
    }
    return out;
}

/** Systems Rahla is currently showing to THIS faction. */
export function revealedSystems(world: GameWorldState, factionId: string): Set<string> {
    const out = new Set<string>();
    const now = world.nowSeconds ?? 0;
    const c = councilOf(world, factionId);
    for (const [systemId, until] of Object.entries(c?.revealedSystems ?? {})) {
        if (until > now) out.add(systemId);
    }
    return out;
}

/** Is Zughra still burning the besiegers of this world? */
export function isPlanetScorched(world: GameWorldState, planetId: string): boolean {
    const now = world.nowSeconds ?? 0;
    for (const traits of world.factionTraits?.values() ?? []) {
        const until = traits.buthari?.council?.scorchedPlanets?.[planetId] ?? 0;
        if (until > now) return true;
    }
    return false;
}

/** Drop lapsed effects. Called from tickButhari; purely housekeeping. */
export function expireCouncilEffects(world: GameWorldState, factionId: string): void {
    const c = ensureCouncil(world, factionId);
    if (!c) return;
    const now = world.nowSeconds ?? 0;
    for (const bag of [c.cloakedSystems, c.revealedSystems, c.scorchedPlanets]) {
        for (const [key, until] of Object.entries(bag)) {
            if (until <= now) delete bag[key];
        }
    }
}
