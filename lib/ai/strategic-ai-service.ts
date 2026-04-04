/**
 * lib/ai/strategic-ai-service.ts
 * Strategic decision-making for NPC empires.
 */

import { GameWorldState } from '../game-world-state';
import { LeadershipService } from '../leadership/leadership-service';
import { setEmpireDoctrine } from '../doctrine/doctrine-service';
import { DoctrineDomain } from '../doctrine/types';
import { launchOperation } from '../espionage/espionage-service';

import { CivilizationRegistry } from '../civilization/registry';

export class StrategicAIService {
    /**
     * Process a strategic turn for a faction.
     */
    static processEmpireTurn(factionId: string, world: GameWorldState): void {
        this.manageLeaders(factionId, world);
        this.manageDoctrines(factionId, world);
        this.manageConstruction(factionId, world);
        this.manageEspionage(factionId, world);
    }

    /**
     * AI logic for assigning and recruiting leaders.
     */
    private static manageLeaders(factionId: string, world: GameWorldState): void {
        const leaders = Array.from(world.leadership.leaders.values())
            .filter(l => l.factionId === factionId && l.status === 'active');

        // 1. Recruit aggressively if pool has someone useful (Hard Mode)
        const recruitPool = world.leadership.recruitmentPool.filter(l => l.factionId === factionId);
        if (recruitPool.length > 0 && leaders.length < 10) {
            // AI recruits up to 10 leaders to maximize bonuses
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

    /**
     * AI logic for constructing buildings on owned planets (Hard Mode macro).
     */
    private static manageConstruction(factionId: string, world: GameWorldState): void {
        const planets = Array.from(world.construction.planets.values()).filter(p => p.ownerId === factionId);
        planets.forEach(planet => {
            // Keep the build queue completely full to maximize economic output
            if (planet.buildQueue.length < 2) {
                let buildingType = 'factory';
                // React to instability
                if (planet.stability < 50) buildingType = 'security_hub';
                // Balance between research and production
                else if (Math.random() > 0.4) buildingType = 'research_lab';
                
                planet.buildQueue.push({
                    orderId: `ai-build-${factionId}-${Date.now()}-${Math.random()}`,
                    buildingId: buildingType,
                    tileId: `tile-${Math.floor(Math.random() * 1000)}`, // Assign to random tile for AI macro
                    planetId: planet.id,
                    startedAtSeconds: world.nowSeconds,
                    completesAtSeconds: world.nowSeconds + 3600 // 1 hour build
                });
            }
        });
    }

    /**
     * AI logic for espionage (Hard Mode aggression).
     * Automatically attempts to sabotage or subvert rivals.
     */
    private static manageEspionage(factionId: string, world: GameWorldState): void {
        const rivalries = Array.from(world.rivalries.values()).filter(r => r.empireAId === factionId || r.empireBId === factionId);
        
        for (const rival of rivalries) {
            // If tension is high, launch black ops
            if (rival.escalationLevel > 3 && Math.random() < 0.25) { 
                const targetId = rival.empireAId === factionId ? rival.empireBId : rival.empireAId;
                const targetSystem = Array.from(world.movement.systems.values())
                    .find(s => world.construction.planets.get(s.id)?.ownerId === targetId);
                
                if (targetSystem) {
                    launchOperation(
                        factionId,
                        targetId,
                        targetSystem.id,
                        'infrastructureSabotage', // AI defaults to sabotaging infra
                        0.9, // High investment
                        0.4, // Medium risk
                        world
                    );
                }
            }
        }
    }
}
