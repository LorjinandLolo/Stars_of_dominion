// lib/time/tick-processor.ts
// Stars of Dominion — Strategic Tick Processor
// Orchestrates all 9 sub-systems defined in the time design spec.
// Called by tick-scheduler.ts on every 6-hour strategic tick.

import { getGameWorldState } from '../game-world-state-singleton';
import { tickEconomy } from '../economy/economy-service';
import { tickConstructionGlobal, getBuildingsForSystem } from '../construction/construction-service';
import { fireNotification } from './notification-hooks';
import { expireAllStaleCrises } from './crisis-engine';
import { computeVisibility } from '../movement/visibility-service';
import { processPirateTurn } from '../ai/pirate-ai-service';
import { issueMoveOrder } from '../movement/movement-service';
import { Fleet } from '../movement/types';
import { BUILDINGS } from '../../data/buildings';
import { tickIntelligence } from '../intelligence/intelligence-service';
import { processEmpireIntelligenceTurn } from '../ai/intelligence-ai-service';




// ─── Tick Delta ─────────────────────────────────────────────────────────────


/** 6 hours in seconds — the time span each tick represents. */
const TICK_DELTA_SECONDS = 6 * 60 * 60;

// ─── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * Execute a full strategic tick.
 * Order is deterministic and must remain stable for replayability.
 */
export async function runStrategicTick(now: Date, tickIndex: number): Promise<void> {
    const world = getGameWorldState();
    world.nowSeconds = Math.floor(now.getTime() / 1000);

    console.log(`[TickProcessor] Running tick #${tickIndex} at ${now.toISOString()}`);

    // 1 & 2: Planetary production + upkeep + construction (bundled in economy service)
    step1_economy(world, TICK_DELTA_SECONDS);

    // 3: Construction progress (separate pass — checks build queues by wall-clock time)
    step3_construction(world);

    // 4: Research progress
    step4_research(world);

    // 5: Recruitment / unit production
    step5_recruitment(world);

    // 6: Trade and logistics
    step6_trade(world, TICK_DELTA_SECONDS);

    // 7: Planetary social state
    step7_socialState(world);

    // 8: Intelligence refresh
    step8_intelligence(world, TICK_DELTA_SECONDS);

    // 9: Ongoing effects (sanctions, propaganda, rebellion, seasonal)
    step9_ongoingEffects(world);

    // 10: Visibility refresh (Fog of War)
    step10_visibility(world);
    step11_pirateSpawning(world);
    step12_pirateTacticalAI(world);
    step13_pirateSafeHavens(world);
    step14_empireFleetRepair(world);
    step15_intelligence(world, TICK_DELTA_SECONDS);




    // Post-tick: expire stale crises
    await expireAllStaleCrises(now);


    // Post-tick notification
    await fireNotification({
        id: `tick-${tickIndex}-${Date.now()}`,
        factionId: 'all',
        category: 'system',
        priority: 'low',
        title: 'Strategic Cycle Complete',
        body: `Cycle #${tickIndex} resolved. Resources, construction, and research updated.`,
        createdAt: now.toISOString(),
        read: false,
        linkToTab: 'economy',
        payload: { tickIndex },
    });

    console.log(`[TickProcessor] Tick #${tickIndex} complete.`);
}

// ─── Sub-steps ────────────────────────────────────────────────────────────────

function step1_economy(world: ReturnType<typeof getGameWorldState>, delta: number) {
    try {
        tickEconomy(world, delta);
    } catch (e) {
        console.error('[TickProcessor] step1_economy failed:', e);
    }
}

function step3_construction(world: ReturnType<typeof getGameWorldState>) {
    try {
        tickConstructionGlobal(world);
    } catch (e) {
        console.error('[TickProcessor] step3_construction failed:', e);
    }
}

function step4_research(world: ReturnType<typeof getGameWorldState>) {
    // Research is tracked via tech state per faction.
    // For each faction with active research slots, advance ticks completed.
    try {
        for (const [factionId, techState] of world.tech) {
            if (!techState.activeSlots) continue;
            for (const slot of techState.activeSlots) {
                if (slot.status !== 'researching') continue;
                slot.ticksCompleted = (slot.ticksCompleted ?? 0) + 1;
                if (slot.ticksRequired && slot.ticksCompleted >= slot.ticksRequired) {
                    slot.status = 'complete';
                    // Mark tech as unlocked
                    if (slot.techId && !techState.unlockedTechIds.includes(slot.techId)) {
                        techState.unlockedTechIds.push(slot.techId);
                    }
                    // Notification fired below
                    fireNotification({
                        id: `research-complete-${factionId}-${slot.techId}-${Date.now()}`,
                        factionId,
                        category: 'research',
                        priority: 'normal',
                        title: 'Research Complete',
                        body: `Technology "${slot.techId}" has been unlocked.`,
                        createdAt: new Date().toISOString(),
                        read: false,
                        linkToTab: 'tech',
                        payload: { techId: slot.techId },
                    });
                }
            }
        }
    } catch (e) {
        console.error('[TickProcessor] step4_research failed:', e);
    }
}

function step5_recruitment(world: ReturnType<typeof getGameWorldState>) {
    // Unit production is handled within the construction space build queue.
    // A dedicated recruitment queue can be added here when the unit system
    // exposes a tickRecruitment() function.
    // For now this is a no-op stub with logging.
    try {
        for (let i = world.construction.spaceBuildQueue.length - 1; i >= 0; i--) {
            const buildItem = world.construction.spaceBuildQueue[i];
            if (world.nowSeconds >= buildItem.completesAtSeconds) {
                // Construction complete
                fireNotification({
                    id: `ship-complete-${buildItem.orderId}-${Date.now()}`,
                    factionId: 'unknown', // factionId not in SpaceBuildOrder, could add it or leave unknown
                    category: 'construction',
                    priority: 'normal',
                    title: 'Ship Construction Complete',
                    body: `${buildItem.shipType ?? 'New ship'} is ready for deployment.`,
                    createdAt: new Date().toISOString(),
                    read: false,
                    linkToTab: 'war',
                    payload: { buildItemId: buildItem.orderId },
                });
                // Remove from queue
                world.construction.spaceBuildQueue.splice(i, 1);
            }
        }
    } catch (e) {
        console.error('[TickProcessor] step5_recruitment failed:', e);
    }
}

function step6_trade(world: ReturnType<typeof getGameWorldState>, delta: number) {
    // Trade flow is handled lazily inside tickEconomy.
    // Here we process tribute payments from vassal factions.
    try {
        for (const tribute of world.tributes.values()) {
            if (tribute.status !== 'active') continue;
            // Tribute is processed per tick — find vassal economy and deduct.
            const vassalEconFaction = world.economy.factions.get(tribute.vassalId);
            const overlordEconFaction = world.economy.factions.get(tribute.overlordId);
            if (vassalEconFaction && overlordEconFaction) {
                const amount = tribute.amountPerTick;
                const resourceKey = tribute.resourceType as keyof typeof vassalEconFaction.reserves;
                vassalEconFaction.reserves[resourceKey] =
                    Math.max(0, (vassalEconFaction.reserves[resourceKey] ?? 0) - amount);
                overlordEconFaction.reserves[resourceKey] =
                    (overlordEconFaction.reserves[resourceKey] ?? 0) + amount;
            }
        }
    } catch (e) {
        console.error('[TickProcessor] step6_trade failed:', e);
    }
}

function step7_socialState(world: ReturnType<typeof getGameWorldState>) {
    // Drift planet happiness and unrest toward equilibrium.
    try {
        for (const planet of world.construction.planets.values()) {
            const unrest = planet.stability < 50 ? (50 - planet.stability) * 0.5 : 0;
            let happinessDrift = 0;

            if (planet.stability < 30) {
                happinessDrift = -3;
            } else if (planet.stability > 70) {
                happinessDrift = 1;
            }

            planet.happiness = Math.min(100, Math.max(0, (planet.happiness ?? 80) + happinessDrift));

            // Unrest buildup from low stability
            if (planet.stability < 40 && Math.random() < 0.15) {
                fireNotification({
                    id: `unrest-${planet.id}-${Date.now()}`,
                    factionId: planet.ownerId ?? 'unknown',
                    category: 'politics',
                    priority: 'normal',
                    title: 'Civil Unrest Rising',
                    body: `${planet.name} stability is critically low. Secession risk increasing.`,
                    createdAt: new Date().toISOString(),
                    read: false,
                    linkToTab: 'government',
                    payload: { planetId: planet.id },
                });
            }
        }
    } catch (e) {
        console.error('[TickProcessor] step7_socialState failed:', e);
    }
}

function step8_intelligence(world: ReturnType<typeof getGameWorldState>, delta: number) {
    // Decay stale intel and passively grow espionage networks.
    try {
        const hours = delta / 3600;
        for (const network of world.espionage.intelNetworks.values()) {
            // Passive network growth
            network.strength = Math.min(1, network.strength + 0.01 * hours);
            // Decay old intel
            if (network.penetrationLevel === 'confirmed' && Math.random() < 0.05) {
                network.penetrationLevel = 'rumor';
            }
        }
    } catch (e) {
        console.error('[TickProcessor] step8_intelligence failed:', e);
    }
}

function step9_ongoingEffects(world: ReturnType<typeof getGameWorldState>) {
    // Apply propaganda campaigns, sanctions, and seasonal effects.
    try {
        // Propaganda: decay credibility on active campaigns
        for (const campaign of world.propagandaCampaigns.values()) {
            if (campaign.ticksRemaining > 0) {
                // Propaganda slowly erodes if not refreshed
                campaign.ticksRemaining = Math.max(0, campaign.ticksRemaining - 1);
            }
        }

        // Sanctions: apply per-tick economic pressure via rivalry score
        for (const rivalry of world.rivalries.values()) {
            if (rivalry.activeSanctionIds && rivalry.activeSanctionIds.length > 0) {
                // Sanctions drift shared stability
                world.shared.stability = Math.max(0, world.shared.stability - 0.005);
            }
        }
    } catch (e) {
        console.error('[TickProcessor] step9_ongoingEffects failed:', e);
    }
}

function step10_visibility(world: ReturnType<typeof getGameWorldState>) {
    // Recompute visibility for all active factions
    try {
        for (const factionId of world.economy.factions.keys()) {
            const visibility = computeVisibility(factionId, world.movement);
            world.movement.factionVisibility.set(factionId, visibility);
        }
    } catch (e) {
        console.error('[TickProcessor] step10_visibility failed:', e);
    }
}

/**
 * Step 11: Pirate Spawning
 * Spawns raider fleets in systems with low security or uncontrolled frontier zones.
 */
function step11_pirateSpawning(world: ReturnType<typeof getGameWorldState>) {
    const pirateFleetCount = Array.from(world.movement.fleets.values()).filter(f => f.factionId === 'faction-pirates').length;
    if (pirateFleetCount > 15) return; // Cap total raiders

    for (const [sysId, sys] of world.movement.systems) {
        // Chance to spawn increases as security drops
        const baseChance = 0.02; // 2% per tick
        const securityFactor = Math.max(0, (40 - (sys.security || 50)) / 100);
        const finalChance = baseChance + securityFactor;

        if (Math.random() < finalChance) {
            const fleetId = `pirate-raider-${sysId}-${Date.now()}`;
            const newFleet: Fleet = {
                id: fleetId,
                name: "Pirate Raider",
                factionId: 'faction-pirates',
                currentSystemId: sysId,
                destinationSystemId: null,
                plannedPath: [],
                transitProgress: 0,
                strength: 0.2 + Math.random() * 0.4, // 0-1 scale
                hyperdriveProfile: {
                    hyperlane: { speedMultiplier: 1.2, detectabilityMultiplier: 1.5, supplyStrainMultiplier: 1.0 },
                    trade: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
                    corridor: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
                    gate: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
                    deepSpace: { speedMultiplier: 0.8, detectabilityMultiplier: 0.5, supplyStrainMultiplier: 1.0 }
                },
                orders: [],
                etaSeconds: 0,
                activeLayer: null,
                isDetectable: true,
                postureId: 'Expansionist',
                doctrine: {
                    type: 'Raider',
                    deviationFromPosture: 0.5,
                    preferredLayers: ['hyperlane', 'deepSpace'],
                    retreatThreshold: 0.3,
                    logisticsStrain: 0,
                    moraleDrift: 0,
                    supplyLevel: 1.0
                }
            };
            world.movement.fleets.set(fleetId, newFleet);
            console.log(`[PIRATES] Spawned raider at ${sysId} (Security: ${sys.security || 'N/A'})`);
        }
    }
}


/**
 * Step 12: Pirate Tactical AI
 * Processes autonomous behavior for all pirate-faction fleets.
 */
function step12_pirateTacticalAI(world: ReturnType<typeof getGameWorldState>) {
    for (const [fleetId, fleet] of world.movement.fleets) {
        if (fleet.factionId !== 'faction-pirates') continue;

        const order = processPirateTurn(fleet, world);
        if (order) {
            if (order.type === 'move') {
                const updated = issueMoveOrder(fleet, order.targetSystemId, 'hyperlane', world.movement);
                world.movement.fleets.set(fleetId, updated);
            } else {
                // For blockade or withdraw, we directly update orders for now
                // In a more robust system, movement-service would handle this.
                fleet.orders = [...fleet.orders, order as any].slice(-5);
            }
        }
    }
}

/**
 * Step 13: Pirate Safe-Havens
 * Manages lawlessness progression and creates fixed pirate bases in weak empire margins.
 */
function step13_pirateSafeHavens(world: ReturnType<typeof getGameWorldState>) {
    // Count system ownership to identify "Large Empires"
    const empireSizes = new Map<string, number>();
    for (const sys of world.movement.systems.values()) {
        if (sys.ownerFactionId) {
            empireSizes.set(sys.ownerFactionId, (empireSizes.get(sys.ownerFactionId) || 0) + 1);
        }
    }

    for (const [sysId, sys] of world.movement.systems) {
        // Condition: Low security and border system of a large empire
        const ownerId = sys.ownerFactionId;
        const isLargeEmpire = ownerId && (empireSizes.get(ownerId) || 0) >= 8;
        
        if (isLargeEmpire && (sys.security || 50) < 25) {
            // Is it a border system? (Neighbor with different/no owner)
            const isBorder = sys.hyperlaneNeighbors.some(nId => {
                const neighbor = world.movement.systems.get(nId);
                return !neighbor || neighbor.ownerFactionId !== ownerId;
            });

            if (isBorder) {
                sys.lawlessness = (sys.lawlessness || 0) + 5;
                if (sys.lawlessness >= 100 && !sys.tags.includes('corsair_den')) {
                    sys.tags.push('corsair_den');
                    console.log(`[PIRATES] Safe-haven established at ${sys.name} (${sysId})`);
                }
            }
        }
    }

    // Passive Repair: Pirate fleets in havens recover strength
    for (const fleet of world.movement.fleets.values()) {
        if (fleet.factionId === 'faction-pirates' && fleet.currentSystemId) {
            const currentSys = world.movement.systems.get(fleet.currentSystemId);
            if (currentSys?.tags.includes('corsair_den')) {
                fleet.strength = Math.min(1.0, fleet.strength + 0.1);
            }
        }
    }
}

/**
 * Step 14: Empire Fleet Repair
 * Non-pirate fleets recover strength in owned systems, faster near spaceyards.
 */
function step14_empireFleetRepair(world: ReturnType<typeof getGameWorldState>) {
    for (const fleet of world.movement.fleets.values()) {
        // Only non-pirate fleets use this standard dock repair
        if (fleet.factionId === 'faction-pirates') continue;
        if (!fleet.currentSystemId) continue;

        const currentSys = world.movement.systems.get(fleet.currentSystemId);
        if (!currentSys || currentSys.ownerFactionId !== fleet.factionId) continue;

        // If we are already full strength, skip
        if (fleet.strength >= 1.0) continue;

        // Base repair: 0.05
        let repairRate = 0.05;

        // Check for Spaceyard/Drydock (Production buildings)
        const { buildings } = getBuildingsForSystem(fleet.currentSystemId, world.construction);
        const hasSpaceyard = buildings.some(pb => {
            const def = BUILDINGS.find(b => b.id === pb.buildingId);
            return def?.tags.includes('production') || def?.tags.includes('advanced');
        });

        if (hasSpaceyard) {
            repairRate = 0.15;
        }

        fleet.strength = Math.min(1.0, fleet.strength + repairRate);
        
        if (fleet.strength >= 1.0) {
            console.log(`[REPAIR] Fleet ${fleet.id} fully repaired at ${currentSys.name}`);
        }
    }
}

/**
 * Step 15: Intelligence Operations
 * Advance operation phases and regenerate intel points.
 */
function step15_intelligence(world: ReturnType<typeof getGameWorldState>, deltaSeconds: number) {
    // 1. Advance active operations
    tickIntelligence(world, deltaSeconds);

    // 2. AI Decision turn
    for (const factionId of world.economy.factions.keys()) {
        // Skip player if we have a way to identify one, for now all non-pirates
        if (factionId === 'faction-pirates') continue;
        processEmpireIntelligenceTurn(factionId, world);
    }
}




