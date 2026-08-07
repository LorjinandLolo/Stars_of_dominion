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
import { getGovernment, getFactionStability } from '../government/government-service';
import { isFactionAtWar } from '../government/cohesion-service';
import { breakawayOrigin } from '../government/civil-war-service';
import { Resource } from '../trade-system/types';

/**
 * How an empire is playing right now. The default AI assumes a going concern
 * with room to expand and rivals to undermine; a two-world breakaway fighting
 * for its life is neither, and behaved absurdly under those assumptions.
 */
export type AIStance = 'survival' | 'consolidating' | 'normal';

export interface StanceAssessment {
    stance: AIStance;
    /** Plain-language causes, so AI behaviour is debuggable from the logs. */
    reasons: string[];
}

/** A breakaway is treated as newly founded for this long (10 sim days). */
const NEW_STATE_SECONDS = 10 * 86400;
/** Below this many worlds an empire cannot afford ambition. */
const SMALL_EMPIRE_WORLDS = 3;
/** Credits below which covert adventures are simply unaffordable. */
const ESPIONAGE_MIN_TREASURY = 5000;

/** Concurrent covert operations allowed per stance. */
const MAX_CONCURRENT_OPS: Record<AIStance, number> = {
    survival: 0,
    consolidating: 1,
    normal: 3,
};

/** How many leaders an empire in each stance tries to keep on the books. */
const LEADER_TARGET: Record<AIStance, number> = {
    survival: 4,
    consolidating: 7,
    normal: 10,
};

export class StrategicAIService {
    /**
     * Process a strategic turn for a faction.
     */
    static processEmpireTurn(factionId: string, world: GameWorldState): void {
        const { stance } = this.assessStance(factionId, world);
        this.manageLeaders(factionId, world, stance);
        this.manageDoctrines(factionId, world, stance);
        this.manageConstruction(factionId, world, stance);
        this.manageEspionage(factionId, world, stance);
    }

    /**
     * Decide how an empire should be playing. A young breakaway, a state that
     * has lost most of its worlds, or one whose civilization is coming apart is
     * not in a position to run black ops and build research labs.
     */
    static assessStance(factionId: string, world: GameWorldState): StanceAssessment {
        const reasons: string[] = [];
        const gov = getGovernment(world, factionId);
        const worlds = [...world.construction.planets.values()].filter(p => p.ownerId === factionId).length;
        const atWar = isFactionAtWar(world, factionId);
        const cohesion = gov?.cohesion ?? 70;
        const treasury = (world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined)?.[Resource.CREDITS] ?? 0;
        const origin = breakawayOrigin(world, factionId);
        const newborn = Boolean(origin && origin.ageSeconds < NEW_STATE_SECONDS);

        if (newborn) reasons.push(`newly independent from ${origin!.parentFactionId}`);
        if (atWar) reasons.push('at war');
        if (worlds <= SMALL_EMPIRE_WORLDS) reasons.push(`only ${worlds} world(s)`);
        if (cohesion < 40) reasons.push(`cohesion at ${Math.round(cohesion)}`);
        if (treasury < ESPIONAGE_MIN_TREASURY) reasons.push('treasury nearly empty');

        // Fighting for existence: small or fracturing, and under attack.
        if (atWar && (worlds <= SMALL_EMPIRE_WORLDS || cohesion < 40 || newborn)) {
            return { stance: 'survival', reasons };
        }
        // Holding together: not under immediate threat, but in no shape to reach outward.
        if (newborn || cohesion < 55 || worlds <= SMALL_EMPIRE_WORLDS || treasury < ESPIONAGE_MIN_TREASURY) {
            return { stance: 'consolidating', reasons };
        }
        return { stance: 'normal', reasons };
    }

    /**
     * AI logic for assigning and recruiting leaders.
     */
    private static manageLeaders(factionId: string, world: GameWorldState, stance: AIStance = 'normal'): void {
        const leaders = Array.from(world.leadership.leaders.values())
            .filter(l => l.factionId === factionId && l.status === 'active');

        // 1. Recruit toward the stance's target. A state fighting for its life
        //    does not staff a ten-person court.
        const recruitPool = world.leadership.recruitmentPool.filter(l => l.factionId === factionId);
        if (recruitPool.length > 0 && leaders.length < LEADER_TARGET[stance]) {
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
    private static manageDoctrines(factionId: string, world: GameWorldState, stance: AIStance = 'normal'): void {
        const faction = world.economy.factions.get(factionId);
        const civId = faction?.civilizationId;
        const civ = civId ? CivilizationRegistry.getCivilization(civId) : null;
        const biases = civ?.doctrineBiases;

        const posture = world.movement.empirePostures.get(factionId);
        if (!posture) return;

        // A state under existential threat holds what it has, whatever its
        // civilization's temperament says it would prefer to do.
        const besieged = stance === 'survival';

        // 1. Military Doctrine
        let milDoctrine = 'doctrine_military_balanced';
        const milBiases = biases?.military || [];
        if (besieged) {
            milDoctrine = 'doctrine_military_defensive';
        } else if (posture.current === 'Militarist' || milBiases.includes('aggressive') || milBiases.includes('mass_assault') || milBiases.includes('decisive_battle')) {
            milDoctrine = 'doctrine_military_offensive';
        } else if (posture.current === 'Pacifist' || milBiases.includes('defensive') || milBiases.includes('guerilla_warfare') || milBiases.includes('active_defense')) {
            milDoctrine = 'doctrine_military_defensive';
        }
        setEmpireDoctrine(world, factionId, 'military', milDoctrine);

        // 2. Economic Doctrine
        let ecoDoctrine = 'doctrine_economic_balanced';
        const ecoBiases = biases?.economic || [];
        if (stance !== 'normal') {
            // Consolidate before expanding — there is nothing to expand with.
            ecoDoctrine = 'doctrine_economic_consolidation';
        } else if (posture.current === 'Expansionist' || ecoBiases.includes('expansionist') || ecoBiases.includes('biological_extraction')) {
            ecoDoctrine = 'doctrine_economic_expansion';
        } else if (posture.current === 'Consolidating' || ecoBiases.includes('mercantile') || ecoBiases.includes('free_market') || ecoBiases.includes('resource_tribute')) {
            ecoDoctrine = 'doctrine_economic_consolidation';
        }
        setEmpireDoctrine(world, factionId, 'economic', ecoDoctrine);

        // 3. Intelligence Doctrine
        let intelDoctrine = 'doctrine_intel_balanced';
        const intelBiases = biases?.intelligence || [];
        // Per-faction stability, not the galaxy-wide scalar: since Government
        // Phase 6.1 an empire's own stability is a real number, and reading the
        // shared one made every AI react to everyone else's problems.
        const ownStability = getFactionStability(world, factionId);
        if (stance !== 'normal' || ownStability < 60 || intelBiases.includes('defensive') || intelBiases.includes('internal_security')) {
            intelDoctrine = 'doctrine_intel_defensive';
        } else if (intelBiases.includes('aggressive') || intelBiases.includes('synaptic_infiltration') || intelBiases.includes('corporate_espionage') || intelBiases.includes('covert_ops')) {
            intelDoctrine = 'doctrine_intel_aggressive';
        }
        setEmpireDoctrine(world, factionId, 'intelligence', intelDoctrine);
    }

    /**
     * AI logic for constructing buildings on owned planets (Hard Mode macro).
     */
    private static manageConstruction(factionId: string, world: GameWorldState, stance: AIStance = 'normal'): void {
        const planets = Array.from(world.construction.planets.values()).filter(p => p.ownerId === factionId);
        // A besieged state builds one thing at a time, and builds it to hold on.
        const queueDepth = stance === 'survival' ? 1 : 2;

        planets.forEach(planet => {
            if (planet.buildQueue.length < queueDepth) {
                let buildingType = 'factory';
                if (stance === 'survival') {
                    // Order first, industry later. Research labs do not hold worlds.
                    buildingType = 'security_hub';
                } else if (planet.stability < 50) {
                    buildingType = 'security_hub';
                } else if (stance === 'consolidating') {
                    // Rebuild the base before reaching for the frontier sciences.
                    buildingType = 'factory';
                } else if (Math.random() > 0.4) {
                    buildingType = 'research_lab';
                }

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
    private static manageEspionage(factionId: string, world: GameWorldState, stance: AIStance = 'normal'): void {
        // Covert adventures are the first thing a state in trouble gives up.
        const opCap = MAX_CONCURRENT_OPS[stance];
        if (opCap === 0) return;

        // The legacy launch path charges nothing and enforces no capacity, so
        // without these two gates an AI at war ran unlimited free operations
        // every tick — which is exactly what a fresh breakaway did.
        const activeOps = [...world.espionage.operations.values()]
            .filter(op => op.actorFactionId === factionId && op.status === 'active').length;
        if (activeOps >= opCap) return;

        const treasury = (world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined)?.[Resource.CREDITS] ?? 0;
        if (treasury < ESPIONAGE_MIN_TREASURY) return;

        const investment = stance === 'consolidating' ? 0.35 : 0.9;
        const chance = stance === 'consolidating' ? 0.1 : 0.25;

        const rivalries = Array.from(world.rivalries.values()).filter(r => r.empireAId === factionId || r.empireBId === factionId);

        for (const rival of rivalries) {
            // If tension is high, launch black ops
            if (rival.escalationLevel > 3 && Math.random() < chance) {
                const targetId = rival.empireAId === factionId ? rival.empireBId : rival.empireAId;
                // Find a system the target actually holds. The original lookup
                // asked the PLANET map for a SYSTEM id, which never matched, so
                // AI espionage silently never fired at all. Planet ownership is
                // the authoritative source; system.ownerFactionId is a derived
                // field the worker recomputes, so it is only a fallback.
                const targetPlanet = Array.from(world.construction.planets.values())
                    .find(p => p.ownerId === targetId);
                const targetSystemId = targetPlanet?.systemId
                    ?? Array.from(world.movement.systems.values()).find(s => s.ownerFactionId === targetId)?.id;
                const targetSystem = targetSystemId ? world.movement.systems.get(targetSystemId) : undefined;

                if (targetSystem) {
                    launchOperation(
                        factionId,
                        targetId,
                        targetSystem.id,
                        'infrastructureSabotage', // AI defaults to sabotaging infra
                        investment,
                        0.4, // Medium risk
                        world
                    );
                    return; // one operation per turn, whatever the stance
                }
            }
        }
    }
}
