// lib/combat/siege/contested-ground.ts
// Stars of Dominion — empty worlds as battlefields and staging grounds.
//
// A world nobody owns used to be a hole in the ground war: the only path
// onto it was MIL_INVASION_PLANET, which besieged nobody with 500 phantom
// defenders and, if it won, handed over a world with no economy. Now:
//
//   landing     an army can land on any empty world its empire has surveyed
//               (the invade order lands everything aboard; disembark lands
//               one army). It stands there as a stationed army.
//   staging     a stationed army digs in a little every strategic cycle
//               (`army.dugIn`, 0..1) and lives off its supply, which a friendly
//               fleet parked overhead refills and which otherwise runs down;
//               an army with none left wastes away. It can re-embark and strike
//               onward: a forward base without a colony.
//   contest     when armies of two empires at war stand on the same empty
//               world, a field battle starts on its 64-district board
//               (scripts/game-loop.ts startContest): whoever held the ground
//               first defends, dug in by how long they have been there.
//               Winning takes the field, not the planet: the survivors stand
//               as a stationed army and the world stays empty, there to be
//               settled or to plant an outpost on.
//
// Pure apart from the world it is handed; no lib/db.

import type { GameWorldState } from '../../game-world-state';

/** Dig-in gained per strategic cycle stationed on ground the army does not own. */
export const DIG_IN_PER_CYCLE = 0.1;
/** Fortification a fully dug-in holder brings to a contest (the same scale as fortificationLevelFor). */
export const DIG_IN_MAX_FORTIFICATION = 6;
/** Supply lost per strategic cycle without a friendly fleet overhead, and regained with one. */
export const STAGING_SUPPLY_DECAY = 0.05;
export const STAGING_SUPPLY_REFILL = 0.25;
/** An army out of supply loses this much strength and 5 morale each cycle. */
export const STARVING_STRENGTH_LOSS = 0.03;
/**
 * A field battle that neither side finishes is decided after this many siege
 * cycles (two real hours): whoever holds more of the surface takes the field.
 * An empty world's centre is wherever the generator put it (often mountains no
 * infantry can enter), so the capital-district rule invasions end on cannot
 * decide a contest.
 */
export const CONTEST_DECISION_CYCLES = 24;
/** The attacker's share of the surface, in percent, that takes the field at the decision. */
export const CONTEST_WIN_SHARE = 50;

type PlanetLike = { id: string; ownerId?: string | null; systemId: string; siege?: any; outpost?: unknown };

/** A world nobody owns, and so ground anyone may stand on. */
export function isEmptyWorld(planet: PlanetLike | null | undefined): boolean {
    return !!planet && (!planet.ownerId || planet.ownerId === 'faction-neutral');
}

/** Armies standing on this world (not aboard a transport). */
export function armiesOnGround(world: GameWorldState, planetId: string): any[] {
    const armies: Map<string, any> | undefined = (world as any).movement?.armies;
    if (!armies) return [];
    return [...armies.values()].filter(a => a.currentPlanetId === planetId && !a.transportFleetId);
}

/** The empire that has held this ground longest (the defender of a contest), excluding `except`. */
export function groundHolder(world: GameWorldState, planetId: string, candidates: string[]): string | null {
    const on = armiesOnGround(world, planetId).filter(a => candidates.includes(a.factionId));
    on.sort((a, b) => (a.stationedAt ?? 0) - (b.stationedAt ?? 0) || String(a.id).localeCompare(String(b.id)));
    return on[0]?.factionId ?? null;
}

/** How dug in an empire's men on this world are, as fortification for a contest. */
export function digInFortification(world: GameWorldState, planetId: string, factionId: string): number {
    const best = armiesOnGround(world, planetId)
        .filter(a => a.factionId === factionId)
        .reduce((m, a) => Math.max(m, Number(a.dugIn) || 0), 0);
    return Math.round(best * DIG_IN_MAX_FORTIFICATION);
}

/**
 * Each strategic cycle: armies standing on worlds they do not own dig in and
 * live off their supply. Armies inside a battle are on the board, not here.
 */
export function tickStagingArmies(world: GameWorldState): void {
    const armies: Map<string, any> | undefined = (world as any).movement?.armies;
    if (!armies) return;
    for (const army of armies.values()) {
        if (!army.currentPlanetId || army.transportFleetId) continue;
        const planet: any = world.construction.planets.get(army.currentPlanetId);
        if (!planet || planet.ownerId === army.factionId || planet.siege) continue;
        army.dugIn = Math.min(1, (Number(army.dugIn) || 0) + DIG_IN_PER_CYCLE);
        const overhead = [...world.movement.fleets.values()].some(f =>
            f.factionId === army.factionId && f.currentSystemId === planet.systemId && !f.destinationSystemId);
        const supply = Number(army.supplyLevel ?? 1);
        army.supplyLevel = Math.max(0, Math.min(1, overhead ? supply + STAGING_SUPPLY_REFILL : supply - STAGING_SUPPLY_DECAY));
        if (army.supplyLevel <= 0) {
            army.strength = Math.max(0.1, Number(army.strength ?? 1) - STARVING_STRENGTH_LOSS);
            army.morale = Math.max(0, Number(army.morale ?? 50) - 5);
        }
    }
}
