import { GameWorldState } from '../game-world-state';
import { Resource } from '../trade-system/types';
import { SeasonRecord, SeasonFactionRecord } from '../seasons/season-types';
import { fireNotification } from '../time/notification-hooks';

export const MILESTONE_DEFINITIONS = [
    { id: 'HEGEMON_10_SYSTEMS', name: 'Galactic Hegemon', description: 'First to control 10 star systems.', threshold: 10, type: 'systems' },
    { id: 'TYCOON_50K_CREDITS', name: 'Economic Tycoon', description: 'First to reach 50,000 credits in reserves.', threshold: 50000, type: 'credits' },
    { id: 'ORACLE_15_TECHS', name: 'The Oracle', description: 'First to research 15 advanced technologies.', threshold: 15, type: 'tech' },
    { id: 'TITAN_1500_POWER', name: 'Military Titan', description: 'First to command a fleet with over 1500 total power.', threshold: 1500, type: 'power' }
];

export class MilestoneService {

    /**
     * Calculates the current Power Ranking / Prestige for a faction.
     * This is used for leaderboards and seasonal rewards.
     */
    static calculateFactionPrestige(factionId: string, world: GameWorldState): number {
        const econ = world.economy.factions.get(factionId);
        if (!econ) return 0;

        // 1. Economic Score (Production / 10 + Reserves / 100)
        const creditProd = econ.production?.[Resource.CREDITS] || 0;
        const creditReserves = econ.reserves[Resource.CREDITS] || 0;
        const econScore = (creditProd * 0.5) + (creditReserves * 0.01);

        // 2. Military Score (Fleet Power + Systems)
        let fleetPower = 0;
        for (const fleet of world.movement.fleets.values()) {
            if (fleet.factionId === factionId) {
                fleetPower += (fleet.basePower || 0) * (fleet.strength || 1);
            }
        }
        const ownedSystems = Array.from(world.movement.systems.values()).filter(s => s.ownerFactionId === factionId).length;
        const militaryScore = (fleetPower * 0.2) + (ownedSystems * 50);

        // 3. Scientific Score (Tech Count)
        const techState = world.tech.get(factionId);
        const techScore = (techState?.unlockedTechIds?.length || 0) * 100;

        // 4. Stability Bonus
        const happiness = Array.from(world.construction.planets.values())
            .filter(p => p.ownerId === factionId)
            .reduce((acc, p) => acc + (p.happiness || 80), 0);
        const avgHappiness = ownedSystems > 0 ? happiness / ownedSystems : 0;
        const stabilityScore = avgHappiness * 2;

        return Math.floor(econScore + militaryScore + techScore + stabilityScore);
    }

    /**
     * Checks if any factions have achieved unassigned milestones.
     */
    static checkMilestones(world: GameWorldState) {
        for (const factionId of world.economy.factions.keys()) {
            if (factionId === 'faction-pirates' || factionId === 'faction-neutral') continue;

            const techCount = world.tech.get(factionId)?.unlockedTechIds?.length || 0;
            const credits = world.economy.factions.get(factionId)?.reserves[Resource.CREDITS] || 0;
            const systems = Array.from(world.movement.systems.values()).filter(s => s.ownerFactionId === factionId).length;
            
            let maxFleetPower = 0;
            for (const fleet of world.movement.fleets.values()) {
                if (fleet.factionId === factionId) {
                    const p = (fleet.basePower || 0) * (fleet.strength || 1);
                    if (p > maxFleetPower) maxFleetPower = p;
                }
            }

            for (const def of MILESTONE_DEFINITIONS) {
                if (world.milestones.has(def.id)) continue;

                let achieved = false;
                if (def.type === 'systems' && systems >= def.threshold) achieved = true;
                if (def.type === 'credits' && credits >= def.threshold) achieved = true;
                if (def.type === 'tech' && techCount >= def.threshold) achieved = true;
                if (def.type === 'power' && maxFleetPower >= def.threshold) achieved = true;

                if (achieved) {
                    world.milestones.set(def.id, { 
                        factionId, 
                        unlockedAt: new Date().toISOString() 
                    });

                    fireNotification({
                        id: `milestone-${def.id}-${Date.now()}`,
                        factionId: 'all',
                        category: 'system',
                        priority: 'urgent',
                        title: 'GALACTIC MILESTONE',
                        body: `${factionId} has achieved "${def.name}": ${def.description}`,
                        createdAt: new Date().toISOString(),
                        read: false,
                        linkToTab: 'dashboard'
                    });
                }
            }
        }
    }

    /**
     * Handles the soft-reset at the end of a season.
     * Archives current state and applies bonuses for the next season.
     */
    static resolveSeasonTransition(world: GameWorldState) {
        const season = world.activeSeason;
        if (!season) return;

        // 1. Calculate final outcomes
        const outcomes: Record<string, SeasonFactionRecord> = {};
        const rankings: { factionId: string, prestige: number }[] = [];

        for (const factionId of world.economy.factions.keys()) {
            if (factionId === 'faction-pirates' || factionId === 'faction-neutral') continue;
            
            const prestige = this.calculateFactionPrestige(factionId, world);
            rankings.push({ factionId, prestige });
            
            outcomes[factionId] = {
                factionId,
                prestige,
                earnedTitles: [],
                bonusesApplied: []
            };
        }

        // Sort by prestige
        rankings.sort((a, b) => b.prestige - a.prestige);

        // 2. Assign Titles and Legacy Bonuses
        // Top 3 get significant effects
        const top3 = rankings.slice(0, 3);
        top3.forEach((r, idx) => {
            const bonuses: Record<string, number> = {};
            if (idx === 0) {
                outcomes[r.factionId].earnedTitles.push('Grand Sovereign');
                bonuses['credit_mult'] = 1.10; // +10% production
                bonuses['tech_mult'] = 1.15;   // +15% research
            } else if (idx === 1) {
                outcomes[r.factionId].earnedTitles.push('Exarch');
                bonuses['credit_mult'] = 1.05;
                bonuses['tech_mult'] = 1.10;
            } else if (idx === 2) {
                outcomes[r.factionId].earnedTitles.push('Legate');
                bonuses['tech_mult'] = 1.05;
            }
            world.legacyPrestigeBonuses.set(r.factionId, bonuses);
        });

        // 3. Archive to Hall of Fame
        const record: SeasonRecord = {
            id: season.id,
            seasonNumber: season.seasonNumber,
            modifiers: season.modifiers,
            completedAt: new Date().toISOString(),
            factionOutcomes: outcomes,
            narrative: `Season ${season.seasonNumber} has concluded. The ${rankings[0]?.factionId || 'Galaxy'} stands dominant.`
        };

        world.hallOfFame.push(record);
        world.seasonHistory.push(record); // History is local to world, HoF is global (in intent)

        // 4. Reset for new Season
        // We keep territory, fleets, and tech (Soft Reset).
        // We clear active season and milestones for the fresh start.
        world.activeSeason = null;
        world.milestones.clear();

        fireNotification({
            id: `season-end-${season.id}-${Date.now()}`,
            factionId: 'all',
            category: 'system',
            priority: 'urgent',
            title: `SEASON ${season.seasonNumber} CONCLUDED`,
            body: `The cycle has ended. Rankings have been archived to the Hall of Fame. Legacy bonuses applied.`,
            createdAt: new Date().toISOString(),
            read: false,
            linkToTab: 'dashboard'
        });
    }
}
