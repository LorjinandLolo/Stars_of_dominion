/**
 * lib/ai/strategic-ai-service.ts
 * Strategic decision-making for NPC empires.
 */

import { GameWorldState } from '../game-world-state';
import { LeadershipService } from '../leadership/leadership-service';
import { setEmpireDoctrine } from '../doctrine/doctrine-service';
import { DoctrineDomain } from '../doctrine/types';

import { CivilizationRegistry } from '../civilization/registry';

export class StrategicAIService {
    /**
     * Process a strategic turn for a faction.
     */
    static processEmpireTurn(factionId: string, world: GameWorldState): void {
        this.manageLeaders(factionId, world);
        this.manageDoctrines(factionId, world);
    }

    /**
     * AI logic for assigning and recruiting leaders.
     */
    private static manageLeaders(factionId: string, world: GameWorldState): void {
        const leaders = Array.from(world.leadership.leaders.values())
            .filter(l => l.factionId === factionId && l.status === 'active');

        // 1. Recruit if pool has someone useful and we have space/need
        const recruitPool = world.leadership.recruitmentPool.filter(l => l.factionId === factionId);
        if (recruitPool.length > 0 && leaders.length < 5) {
            LeadershipService.recruitLeader(world, recruitPool[0].id, factionId);
        }

        // 2. Assign unassigned leaders
        leaders.forEach(leader => {
            if (leader.assignmentId) return;

            if (leader.role === 'Governor') {
                // Assign to planet with lowest stability or highest population
                const planets = Array.from(world.construction.planets.values())
                    .filter(p => p.ownerId === factionId);
                
                if (planets.length > 0) {
                    const target = planets.sort((a, b) => a.stability - b.stability)[0];
                    LeadershipService.assignLeader(world, leader.id, target.id);
                }
            } else if (leader.role === 'Admiral') {
                // Assign to strongest fleet
                const fleets = Array.from(world.movement.fleets.values())
                    .filter(f => f.factionId === factionId);
                
                if (fleets.length > 0) {
                    const target = fleets.sort((a, b) => b.strength - a.strength)[0];
                    LeadershipService.assignLeader(world, leader.id, target.id);
                }
            }
            // Other roles (IntelDirector, Diplomat, etc.) are currently "Empire-wide"
            // and don't need a specific target assignment in the current implementation level.
        });
    }

    /**
     * AI logic for doctrine selection based on current needs and civilization biases.
     */
    private static manageDoctrines(factionId: string, world: GameWorldState): void {
        const faction = world.economy.factions.get(factionId);
        const civId = faction?.civilizationId;
        const civ = civId ? CivilizationRegistry.getCivilization(civId) : null;
        const biases = civ?.doctrineBiases;

        const posture = world.movement.empirePostures.get(factionId);
        if (!posture) return;

        // 1. Military Doctrine
        let milDoctrine = 'doctrine_military_balanced';
        const milBiases = biases?.military || [];
        if (posture.current === 'Militarist' || milBiases.includes('aggressive') || milBiases.includes('mass_assault') || milBiases.includes('decisive_battle')) {
            milDoctrine = 'doctrine_military_offensive';
        } else if (posture.current === 'Pacifist' || milBiases.includes('defensive') || milBiases.includes('guerilla_warfare') || milBiases.includes('active_defense')) {
            milDoctrine = 'doctrine_military_defensive';
        }
        setEmpireDoctrine(world, factionId, 'military', milDoctrine);

        // 2. Economic Doctrine
        let ecoDoctrine = 'doctrine_economic_balanced';
        const ecoBiases = biases?.economic || [];
        if (posture.current === 'Expansionist' || ecoBiases.includes('expansionist') || ecoBiases.includes('biological_extraction')) {
            ecoDoctrine = 'doctrine_economic_expansion';
        } else if (posture.current === 'Consolidating' || ecoBiases.includes('mercantile') || ecoBiases.includes('free_market') || ecoBiases.includes('resource_tribute')) {
            ecoDoctrine = 'doctrine_economic_consolidation';
        }
        setEmpireDoctrine(world, factionId, 'economic', ecoDoctrine);

        // 3. Intelligence Doctrine
        let intelDoctrine = 'doctrine_intel_balanced';
        const intelBiases = biases?.intelligence || [];
        if (world.shared.stability < 0.6 || intelBiases.includes('defensive') || intelBiases.includes('internal_security')) {
            intelDoctrine = 'doctrine_intel_defensive';
        } else if (intelBiases.includes('aggressive') || intelBiases.includes('synaptic_infiltration') || intelBiases.includes('corporate_espionage') || intelBiases.includes('covert_ops')) {
            intelDoctrine = 'doctrine_intel_aggressive';
        }
        setEmpireDoctrine(world, factionId, 'intelligence', intelDoctrine);
    }
}
