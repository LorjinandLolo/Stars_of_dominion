// lib/government/empire-upkeep.ts
// Stars of Dominion — colonies cost their empire something to keep
// (lib/government/admin-capacity.ts). Each strategic cycle, right after the
// economy pays its taxes: every colony outside the home system costs
// colonyUpkeep(jumps from the capital, overextension). What the treasury
// cannot cover is not debt; it is neglect, and every colony's stability pays.
//
// The bill is recorded on the faction (`lastUpkeep`) and taken out of this
// cycle's credit income (`lastIncome`), so the top bar's rate is the net.

import type { GameWorldState } from '../game-world-state';
import { distancesFromCapital } from './capital-distance';
import { adminStatus, colonyUpkeep, countsAsHolding, UNPAID_UPKEEP_STABILITY } from './admin-capacity';

export interface UpkeepRecord {
    credits: number;
    paid: number;
    colonies: number;
    systems: number;
    capacity: number;
}

export function tickEmpireUpkeep(world: GameWorldState): void {
    const planets = [...world.construction.planets.values()] as any[];
    for (const [factionId, faction] of world.economy.factions) {
        if (factionId === 'faction-pirates' || factionId === 'faction-neutral') continue;
        const capitalSystem: string | undefined = (faction as any).capitalSystemId;
        const colonies = planets.filter(p => countsAsHolding(p, factionId) && p.systemId !== capitalSystem);
        if (!colonies.length) { (faction as any).lastUpkeep = undefined; continue; }

        const status = adminStatus(planets, factionId);
        const distances = distancesFromCapital(world, factionId).distances;
        let bill = 0;
        for (const p of colonies) bill += colonyUpkeep(distances.get(p.systemId) ?? 10, status);

        const reserves = faction.reserves as Record<string, number>;
        const paid = Math.max(0, Math.min(bill, reserves.CREDITS ?? 0));
        reserves.CREDITS = (reserves.CREDITS ?? 0) - paid;
        const income: any = (faction as any).lastIncome;
        if (income?.total) income.total.CREDITS = (income.total.CREDITS ?? 0) - paid;

        if (paid < bill) {
            for (const p of colonies) p.stability = Math.max(0, (p.stability ?? 60) - UNPAID_UPKEEP_STABILITY);
        }
        const record: UpkeepRecord = { credits: bill, paid, colonies: colonies.length, systems: status.systems, capacity: status.capacity };
        (faction as any).lastUpkeep = record;
    }
}
