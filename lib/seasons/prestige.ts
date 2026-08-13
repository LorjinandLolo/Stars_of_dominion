// lib/seasons/prestige.ts
// The galaxy's power ranking. Formula preserved verbatim from the retired
// MilestoneService.calculateFactionPrestige — it was sound; it just lived in a
// module that also tried to end seasons.
//
// Prestige is the leaderboard beneath the crowns: it breaks ties at a season
// close and fills the ranks below the top three. It is not a title source.

import type { GameWorldState } from '../game-world-state';
import { Resource } from '../trade-system/types';

/** Factions that exist to make the galaxy hostile, not to compete in it. */
export function isRankedFaction(factionId: string): boolean {
    return factionId !== 'faction-pirates' && factionId !== 'faction-neutral';
}

export function calculateFactionPrestige(factionId: string, world: GameWorldState): number {
    const econ = world.economy.factions.get(factionId);
    if (!econ) return 0;

    // 1. Economic score — production weighs more than a hoard.
    const creditProd = econ.production?.[Resource.CREDITS] || 0;
    const creditReserves = econ.reserves[Resource.CREDITS] || 0;
    const econScore = (creditProd * 0.5) + (creditReserves * 0.01);

    // 2. Military score — fleets in commission plus ground held.
    let fleetPower = 0;
    for (const fleet of world.movement.fleets.values()) {
        if (fleet.factionId === factionId) {
            fleetPower += (fleet.basePower || 0) * (fleet.strength || 1);
        }
    }
    const ownedSystems = Array.from(world.movement.systems.values())
        .filter(s => s.ownerFactionId === factionId).length;
    const militaryScore = (fleetPower * 0.2) + (ownedSystems * 50);

    // 3. Scientific score.
    const techState = world.tech.get(factionId);
    const techScore = (techState?.unlockedTechIds?.length || 0) * 100;

    // 4. Stability bonus.
    const happiness = Array.from(world.construction.planets.values())
        .filter(p => p.ownerId === factionId)
        .reduce((acc, p) => acc + (p.happiness || 80), 0);
    const avgHappiness = ownedSystems > 0 ? happiness / ownedSystems : 0;
    const stabilityScore = avgHappiness * 2;

    return Math.floor(econScore + militaryScore + techScore + stabilityScore);
}

/** Every ranked faction, best first. */
export function rankFactions(world: GameWorldState): Array<{ factionId: string; prestige: number }> {
    const rankings: Array<{ factionId: string; prestige: number }> = [];
    for (const factionId of world.economy.factions.keys()) {
        if (!isRankedFaction(factionId)) continue;
        rankings.push({ factionId, prestige: calculateFactionPrestige(factionId, world) });
    }
    // Ties break on faction id so the order is stable across worker restarts.
    rankings.sort((a, b) => b.prestige - a.prestige || a.factionId.localeCompare(b.factionId));
    return rankings;
}
