// lib/combat/air-mission-service.ts
import { GameWorldState } from '../game-world-state';
import { AirSortie } from '../movement/types';

export function advanceSorties(world: GameWorldState) {
    if (!world.movement.sorties) return;

    const completedIds: string[] = [];

    for (const [id, sortie] of world.movement.sorties.entries()) {
        if (sortie.status === 'outbound') {
            // Sorties travel extremely fast. For now, they reach their objective instantly in the next engine tick.
            sortie.status = 'executing';
            
            // Execute mission logic
            resolveStrike(world, sortie);

            if ((sortie.status as string) !== 'destroyed') {
                sortie.status = 'returning';
            }
        } else if (sortie.status === 'returning') {
            // Arrives back to parent Base
            mergeSortieBack(world, sortie);
            completedIds.push(id);
        }
    }

    for (const id of completedIds) {
        world.movement.sorties.delete(id);
    }
}

function resolveStrike(world: GameWorldState, sortie: AirSortie) {
    console.log(`[AirMissionService] Resolving ${sortie.missionType} on ${sortie.targetId}`);
    
    if (sortie.missionType === 'scout') {
        const sys = world.movement.systems.get(sortie.targetId);
        if (sys) {
            // Factions gain immediate 'survey' tag access inside this system
            sys.tagReveal.revealedAt['surveyed'] = [...sys.tagReveal.allTags];
            console.log(`[AirMissionService] Successfully scouted ${sys.name}`);
        }
    } else if (sortie.missionType === 'strike_fleet') {
        const targetFleet = world.movement.fleets.get(sortie.targetId);
        if (!targetFleet) {
            console.log(`[AirMissionService] Target fleet no longer exists.`);
            return;
        }

        // Dogfight with Target Fleet's Interceptors
        const enemyInterceptors = targetFleet.composition?.['interceptor'] || 0;
        let sortieInts = sortie.composition.interceptor || 0;
        let sortieBombers = sortie.composition.bomber || 0;

        // Sortie Interceptors engage defenders 1-to-1
        const intLoss = Math.min(sortieInts, enemyInterceptors);
        sortieInts -= intLoss;
        const remainingEnemyInts = enemyInterceptors - intLoss;

        // Update defender interceptors in real-time
        if (targetFleet.composition) {
            targetFleet.composition['interceptor'] = remainingEnemyInts;
        }

        // Remaining enemy interceptors strike bombers
        const bombLoss = Math.min(sortieBombers, remainingEnemyInts);
        sortieBombers -= bombLoss;

        sortie.composition.interceptor = sortieInts;
        sortie.composition.bomber = sortieBombers;

        // Striking the fleet
        if (sortieBombers > 0) {
            // 25 damage per bomber
            const rawDamage = sortieBombers * 25;
            // Drain strength 
            const damageRatio = rawDamage / Math.max(1, targetFleet.basePower);
            targetFleet.strength = Math.max(0, targetFleet.strength - damageRatio);
            console.log(`[AirMissionService] Heavy Strike landed! ${rawDamage} damage. Fleet down to ${(targetFleet.strength*100).toFixed(1)}%`);
        } else {
            console.log(`[AirMissionService] Sortie wings wiped out by fleet interceptors.`);
            // Sortie is essentially empty, meaning it was destroyed
            if (sortieInts === 0) sortie.status = 'destroyed';
        }

    } else if (sortie.missionType === 'strike_planet') {
        // Strike planet infrastructure natively permanently
        const planet = world.economy.planets.get(sortie.targetId);
        if (planet && planet.services && planet.services['energy_grid']) {
            // No native planet air defense for now without bases, assume full strike
            const bombers = sortie.composition.bomber || 0;
            if (bombers > 0) {
                // Every 10 bombers permanently shears off 1 level of the Energy Grid
                const levelsDestroyed = Math.max(1, Math.floor(bombers / 10));
                
                planet.services['energy_grid'].level = Math.max(1, planet.services['energy_grid'].level - levelsDestroyed);
                
                // Massive instability spike due to raw devastation
                planet.instability = Math.min(100, (planet.instability || 0) + (levelsDestroyed * 15));
                
                console.log(`[AirMissionService] Planet ${planet.planetId} Energy Grid sabotaged! Destroyed ${levelsDestroyed} levels.`);
            }
        }
    } else if (sortie.missionType === 'escort') {
        // Escort logic
        console.log(`[AirMissionService] Escorting trade route segment in sector.`);
    }
}

function mergeSortieBack(world: GameWorldState, sortie: AirSortie) {
    const parent = world.movement.fleets.get(sortie.parentBaseId);
    if (!parent || !parent.composition) {
        console.log(`[AirMissionService] Mother fleet destroyed. Sortie wings ditched.`);
        return;
    } 

    parent.composition['interceptor'] = (parent.composition['interceptor'] || 0) + (sortie.composition.interceptor || 0);
    parent.composition['bomber'] = (parent.composition['bomber'] || 0) + (sortie.composition.bomber || 0);
    console.log(`[AirMissionService] Sortie successfully recovered by Carrier group.`);
}
