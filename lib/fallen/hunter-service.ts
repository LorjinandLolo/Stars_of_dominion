/**
 * lib/fallen/hunter-service.ts
 * Item 14e: the hunter. Server-only.
 *
 * Against an AI conqueror, a named security officer takes the case of a
 * fallen empire's movement. They are driven by what really happens: every act
 * against their empire heats them up (sponsor-service commitAct), their
 * searches are real counter-intelligence sweeps of the hideout's system
 * (cell-service revealCellsBySweep, the same code a player's sweep runs), and
 * the crackdowns and interrogations the conqueror carries out appear in the
 * leader's story under their name. Against a human conqueror there is no
 * officer: the human is the hunter, working the case board without knowing a
 * person is on the other side.
 *
 * The movement can go after the officer (the "inspector" job). They can die;
 * a successor takes the case a few days later, angrier than the last.
 */

import type { GameWorldState } from '../game-world-state';
import { huntBeat, hunterLabel, isUndergroundSeatId, type Hunter, type RebelCell } from '../rebellion/rebellion-types';
import { revealCellsBySweep } from '../rebellion/cell-service';
import { generateLeader } from '../leadership/leader-generator';
import { RNG, seedFromString } from '../trade-system/rng';
import { labelFor } from '../time/notification-names';

/** Chance per strategic tick the hunter searches, before heat and their service's strength. */
export const SEARCH_BASE_CHANCE = 0.03;
/** Heat fades by this share every strategic tick. */
export const HEAT_DECAY = 0.1;
/** Days before a successor takes the case. */
export const SUCCESSOR_SECONDS = 3 * 86400;
/** A successor starts this much hotter than the one before ended. */
export const SUCCESSOR_HEAT = 25;
const TITLES = ['Inspector', 'Supervisor', 'Commissioner', 'Major', 'Prefect'];

function isHumanRun(world: GameWorldState, factionId: string): boolean {
    const claimed = (world as any).claimedFactionIds;
    return Array.isArray(claimed) && claimed.includes(factionId);
}

function planetName(world: GameWorldState, planetId: string): string {
    return String((world.construction?.planets?.get?.(planetId) as any)?.name ?? 'the hideout world');
}

/** A new officer on the case. */
export function makeHunter(world: GameWorldState, cell: RebelCell, generation: number, heat: number): Hunter {
    const host = cell.hostFactionId;
    const seed = `hunter|${cell.id}|${generation}`;
    const rng = new RNG(seedFromString(seed));
    const leader = generateLeader({ factionId: host, role: 'IntelligenceDirector', seed, nowSeconds: world.nowSeconds });
    return {
        name: leader.name,
        title: TITLES[rng.nextInt(0, TITLES.length - 1)],
        species: (world.economy?.factions?.get?.(host) as any)?.civilizationId ?? null,
        factionId: host,
        sinceSeconds: world.nowSeconds,
        heat: Math.max(0, Math.min(100, heat)),
        notes: [],
        generation,
        dead: false,
        diedAtSeconds: null,
        successorAtSeconds: null,
    };
}

/**
 * The officer this cell faces, if any: made when an AI conqueror first takes
 * the case, replaced after the last one died, and never against a human.
 */
export function ensureHunter(world: GameWorldState, cell: RebelCell): Hunter | null {
    const exile = cell.exile;
    if (!exile || cell.status !== 'active') return null;
    const host = cell.hostFactionId;
    if (isHumanRun(world, host) || isUndergroundSeatId(host)) return null;
    const h = exile.hunter;
    if (h && h.factionId === host && !h.dead) return h;
    if (h && h.dead && h.factionId === host && (h.successorAtSeconds ?? 0) > world.nowSeconds) return null;
    const next = makeHunter(world, cell, (h?.generation ?? 0) + 1, h?.dead ? (h.heat + SUCCESSOR_HEAT) : 10);
    exile.hunter = next;
    huntBeat(cell, world.nowSeconds, next.generation === 1
        ? `${next.title} ${next.name} of ${labelFor(host)}'s security service has taken our case. We have a name for the one hunting us now.`
        : `${next.title} ${next.name} has taken over the case. They knew the last one.`);
    return next;
}

/**
 * One strategic tick of the hunt: heat fades, and the officer may search the
 * hideout's system with a real sweep. A search that finds the cell is told by
 * the sweep itself (cell-service); one that finds nothing is told here.
 */
export function tickHunter(world: GameWorldState, cell: RebelCell, rand: () => number = Math.random): { searched: boolean; found: boolean } {
    const h = ensureHunter(world, cell);
    if (!h) return { searched: false, found: false };
    h.heat = Math.max(0, h.heat * (1 - HEAT_DECAY));
    const ci = Number(world.espionage?.factionIntel?.get?.(h.factionId)?.counterIntelStrength ?? 0);
    const chance = SEARCH_BASE_CHANCE + h.heat / 400 + ci / 500;
    if (rand() >= chance) return { searched: false, found: false };
    const wasKnown = cell.safeHouse.knownToFactionIds.includes(h.factionId);
    const found = revealCellsBySweep(world, h.factionId, cell.systemId, 1 + h.heat / 100, rand).some(c => c.id === cell.id);
    if (!found && !wasKnown) {
        huntBeat(cell, world.nowSeconds, `${h.title} ${h.name}'s people searched ${planetName(world, cell.planetId)} street by street, and found nothing. This time.`);
    } else if (!found && wasKnown) {
        huntBeat(cell, world.nowSeconds, `${h.title} ${h.name} had the safe house watched for three days. We moved before they came in.`);
    }
    return { searched: true, found };
}

/** The officer is dead. A successor takes the case in a few days. */
export function killHunter(world: GameWorldState, cell: RebelCell): string | null {
    const h = cell.exile?.hunter;
    if (!h || h.dead) return null;
    const label = hunterLabel(cell);
    h.notes.unshift({ at: world.nowSeconds, text: `${label} is dead.` });
    h.dead = true;
    h.diedAtSeconds = world.nowSeconds;
    h.successorAtSeconds = world.nowSeconds + SUCCESSOR_SECONDS;
    return label;
}

/** Why the movement cannot go after its hunter now, or null. */
export function hunterTargetBlocker(world: GameWorldState, cell: RebelCell): string | null {
    const h = cell.exile?.hunter;
    if (!h || h.dead) return isHumanRun(world, cell.hostFactionId)
        ? 'Nobody we can name is hunting us. Whoever it is, they are cleverer than an officer.'
        : 'There is nobody to go after: no officer has our case right now.';
    return null;
}
