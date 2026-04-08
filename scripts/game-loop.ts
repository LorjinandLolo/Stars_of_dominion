import { Client, Databases, Query, ID } from 'node-appwrite';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { deserializeWorld, serializeWorld, cleanWorldForSave, extractFactionShard, injectFactionShard } from '../lib/persistence/save-service';
import { advanceFleet, issueMoveOrder } from '../lib/movement/movement-service';
import { runStrategicTick } from '../lib/time/tick-processor';
import { TechEngine } from '../lib/tech/engine';
import { startOperation } from '../lib/intelligence/intelligence-service';
import { applyPolicyEffect } from '../lib/politics/politics-service';
import { LeadershipService } from '../lib/leadership/leadership-service';
import { calculateEscalationLevel } from '../lib/politics/cold-war-service';
import { processSectorCombats } from '../lib/combat/combat-manager';
import { initializeFactionHomeWorld } from '../lib/economy/services/initialization-service';
import { GroundSiegeEngine } from '../lib/combat/siege/siege-engine';
import { RecruitmentService } from '../lib/combat/recruitment-service';
import { tickConstructionGlobal } from '../lib/construction/construction-service';
import type { GroundSiegeState, PlanetaryDefenseState, GroundUnitType, TacticalStanceId } from '../lib/combat/siege/siege-types';
import type { GameWorldState } from '../lib/game-world-state';

// Ensure environment variables are loaded
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_SESSIONS = 'multiplayer_sessions';
const COLL_ORDERS = 'game_orders';
const SESSION_DOC_ID = 'default-session';

const POLL_INTERVAL_MS = 5000; // Run every 5 seconds
const TIME_STEP_SECONDS = 15;  // 15 seconds of game time per real tick

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '')
    .setKey(process.env.APPWRITE_API_KEY || '');

const db = new Databases(client);

async function runGameTick() {
    console.log(`\n[Tick Worker] Starting Cycle at ${new Date().toLocaleTimeString()}...`);

    try {
        // 1. Load authoritative session
        const doc: any = await db.getDocument(DB_ID, COLL_SESSIONS, SESSION_DOC_ID);
        const world = deserializeWorld(doc.snapshot);

        // Phase 4: Reconstruct World from Shards
        try {
            const factionDocs = await db.listDocuments(DB_ID, 'game_factions', [Query.limit(50)]);
            for (const fDoc of factionDocs.documents) {
                injectFactionShard(world, fDoc.data);
            }
        } catch (err) {
            console.log('[Tick Worker] Could not load game_factions shards, proceeding with main session.');
        }

        // Ensure collections required for combat exist (for 1.0 migration)
        if (!world.activeCombats) world.activeCombats = new Map();
        if (!world.rivalries) world.rivalries = new Map();
        if (!world.movement.sorties) world.movement.sorties = new Map();

        // 2. Advance Simulation Time
        const oldNow = world.nowSeconds;
        world.nowSeconds += TIME_STEP_SECONDS;

        // 3. Process Pending Player Orders
        const allOrders = await db.listDocuments(DB_ID, COLL_ORDERS, [
            Query.orderAsc('$createdAt'),
            Query.limit(50)
        ]);
        
        const pendingOrders = allOrders.documents.filter((doc: any) => doc.processed === false);

        if (pendingOrders.length > 0) {
            console.log(`[Tick Worker] Executing ${pendingOrders.length} player orders...`);
            for (const orderDoc of pendingOrders) {
                try {
                    const payload = JSON.parse(orderDoc.payload);
                    executeOrder(world, orderDoc.actionId, payload, orderDoc.factionId);
                    await db.updateDocument(DB_ID, COLL_ORDERS, orderDoc.$id, { processed: true });
                } catch (e) {
                    console.error(`[Tick Worker] Order ${orderDoc.$id} failed:`, e);
                }
            }
        }

        // 4. Real-time Physics: Fleet Movement
        let fleetsMoved = 0;
        for (const [fleetId, fleet] of world.movement.fleets) {
            if (fleet.destinationSystemId) {
                const updated = advanceFleet(fleet, TIME_STEP_SECONDS, world.movement);
                world.movement.fleets.set(fleetId, updated);
                fleetsMoved++;
            }
        }
        if (fleetsMoved > 0) console.log(`[Tick Worker] Advanced ${fleetsMoved} fleets in transit.`);

        // 4.5. Real-time Conflict: Sector Combats & Air Sorties
        processSectorCombats(world);
        
        // 4. Process Construction
        tickConstructionGlobal(world);

        // 5. Process Ground Recruitment
        RecruitmentService.tick(world);

        // 6. Final cleanup or logging
        import('../lib/combat/air-mission-service').then(({ advanceSorties }) => {
            advanceSorties(world);
        }).catch(e => console.warn('[Tick Worker] Could not load AirMissionService', e.message));

        // 5. Strategic Tick check (6-hour windows)
        const currentTickWindow = Math.floor(world.nowSeconds / (6 * 3600));
        const lastTickWindow = Math.floor(oldNow / (6 * 3600));
        
        if (currentTickWindow > lastTickWindow) {
            console.log(`[Tick Worker] STRATEGIC TICK TRIGGERED (#${currentTickWindow})`);
            await runStrategicTick(new Date(world.nowSeconds * 1000), currentTickWindow);
        }

        // 5.5. Faction Initialization Check (Ensures homeworlds exist for all players)
        // We run this every tick to catch new claimants or fresh game starts
        world.economy.factions.forEach((f, id) => {
            initializeFactionHomeWorld(world, id);
        });

        // 5.6. Multi-Planet Seeding — ensures every faction capital has ≥2 planets.
        // Idempotent: skips systems that already have orbit-2 planets.
        // Once seeded, the planets are part of the snapshot and synced to all clients.
        const SECONDARY_PLANET_SPECS: Record<string, Array<{ name: string; planetType: string; ownerId: string; tags: string[] }>> = {
            'alpha-5b34961e18bb6fd14903': [ // Aurelian Combine capital
                { name: 'Aurel Minor',  planetType: 'industrial',   ownerId: 'faction-aurelian',   tags: ['mining_world'] },
                { name: 'Aurel Prime II', planetType: 'agricultural', ownerId: 'faction-aurelian', tags: ['fertile_soil'] },
            ],
            'alpha-fe148b9a69a680fa14a3': [ // Vektori capital
                { name: 'Vek Station',  planetType: 'fortress',     ownerId: 'faction-vektori',    tags: ['fortified'] },
                { name: 'Vek Fringe',   planetType: 'moon',         ownerId: '',                   tags: ['barren'] },
            ],
            'alpha-1acb646b529592834b59': [ // Null Syndicate capital
                { name: 'Node-7',       planetType: 'research',     ownerId: 'faction-null-syndicate', tags: ['research_hub'] },
                { name: 'Null Drift',   planetType: 'standard',     ownerId: '',                   tags: ['arid'] },
            ],
            'alpha-10fae8cf89590243337b': [ // Covenant capital
                { name: 'Sanctum II',   planetType: 'standard',     ownerId: 'faction-covenant',   tags: ['holy_world'] },
                { name: 'The Void Eye', planetType: 'moon',         ownerId: 'faction-covenant',   tags: ['anomaly'] },
            ],
        };

        for (const [systemId, specs] of Object.entries(SECONDARY_PLANET_SPECS)) {
            for (let i = 0; i < specs.length; i++) {
                const planetId = `planet-${systemId}-orbit-${i + 2}`;
                if (!world.construction.planets.has(planetId)) {
                    const spec = specs[i];
                    world.construction.planets.set(planetId, {
                        id: planetId,
                        name: spec.name,
                        ownerId: spec.ownerId,
                        systemId,
                        planetType: spec.planetType as any,
                        infrastructureLevel: 1,
                        stability: 60 + Math.floor(Math.random() * 25),
                        happiness: 70,
                        specialization: null,
                        maxTiles: 6,
                        tiles: [
                            { tileId: `${planetId}-t1`, districtType: 'any', buildingId: null, constructionState: 'empty', constructionCompleteAt: null },
                            { tileId: `${planetId}-t2`, districtType: 'any', buildingId: null, constructionState: 'empty', constructionCompleteAt: null },
                        ],
                        buildQueue: [],
                        activeModifiers: [],
                        tags: spec.tags,
                        population: 10 + Math.floor(Math.random() * 30),
                        popCapacity: 50,
                        popGrowth: 0.02,
                        unrest: Math.floor(Math.random() * 20),
                        isOccupied: false,
                        demographics: [
                            { speciesId: 'species-colonist', name: 'Colonists', percentage: 80, socialClass: 'Citizen' },
                            { speciesId: 'species-labor',    name: 'Labor Caste', percentage: 20, socialClass: 'Resident' },
                        ],
                    });
                    console.log(`[Tick Worker] Seeded secondary planet "${spec.name}" in system ${systemId}.`);
                }
            }
        }


        // 4. Seeding & Administrative recalculations ────────────────────────
        processSieges(world);
        recalculateSystemControl(world);
        
        // Finalize state
        world.nowSeconds += 60; // 1 minute per tick (demo speed)
        await saveWorldState(world);

        // Save Faction Shards
        const factionsToSave = new Set([
            ...world.economy.factions.keys(),
            ...world.tech.keys(),
            ...Array.from(world.movement.fleets.values()).map(f => f.factionId)
        ]);

        for (const fId of factionsToSave) {
            if (!fId || fId === 'faction-neutral') continue;
            const shardStr = extractFactionShard(world, fId);
            try {
                await db.updateDocument(DB_ID, 'game_factions', fId, {
                    factionId: fId,
                    data: shardStr
                });
            } catch (e: any) {
                if (e.code === 404) {
                    await db.createDocument(DB_ID, 'game_factions', fId, {
                        factionId: fId,
                        data: shardStr
                    });
                }
            }
        }

        console.log(`[Tick Worker] Cycle Complete. Synced Main + ${factionsToSave.size} Shards.`);

    } catch (err: any) {
        console.error('[Tick Worker] Fatal loop error:', err.message);
    }
}

/**
 * Re-shards and saves the world state to the cloud.
 */
async function saveWorldState(world: any) {
    const cleanWorld = cleanWorldForSave(world);
    const newSnapshot = serializeWorld(cleanWorld);
    await db.updateDocument(DB_ID, COLL_SESSIONS, SESSION_DOC_ID, {
        snapshot: newSnapshot,
        lastTickAt: new Date().toISOString()
    });
}

/**
 * Recalculates star system ownership based on the ownership of its constituent planets.
 */
function recalculateSystemControl(world: any) {
    const systemToPlanets = new Map<string, any[]>();
    
    // Group all planets by their system
    for (const planet of world.construction.planets.values()) {
        const list = systemToPlanets.get(planet.systemId) || [];
        list.push(planet);
        systemToPlanets.set(planet.systemId, list);
    }
    
    // Process each system
    for (const [sysId, system] of world.movement.systems) {
        const planets = systemToPlanets.get(sysId) || [];
        if (planets.length === 0) {
            system.ownerFactionId = undefined;
            system.isContested = false;
            continue;
        }

        const owners = new Set<string>();
        for (const p of planets) {
            if (p.ownerId && p.ownerId !== 'faction-neutral') {
                owners.add(p.ownerId);
            }
        }

        if (owners.size === 0) {
            system.ownerFactionId = undefined;
            system.isContested = false;
        } else if (owners.size === 1) {
            system.ownerFactionId = Array.from(owners)[0];
            system.isContested = false;
        } else {
            system.ownerFactionId = undefined;
            system.isContested = true;
        }
    }
}


/**
 * Maps database orders to in-memory world state mutations.
 * includes server-side validation to ensure players only control their own assets.
 */
function executeOrder(world: any, actionId: string, payload: any, factionId: string) {
    console.log(`[Order] Validating ${actionId} for ${factionId}`);
    
    switch (actionId) {
        case 'MIL_MOVE_FLEET': {
            const fleet = world.movement.fleets.get(payload.fleetId);
            if (!fleet) return;
            if (fleet.factionId !== factionId) {
                console.error(`[Security] Unauthorized MOVE from ${factionId} on fleet ${payload.fleetId} (Owner: ${fleet.factionId})`);
                return;
            }
            const updated = issueMoveOrder(fleet, payload.destinationId, 'hyperlane', world.movement);
            world.movement.fleets.set(payload.fleetId, updated);
            break;
        }

        case 'MIL_INVASION_PLANET': {
            // payload: { fleetId, planetId, systemId }
            const planet = world.construction.planets.get(payload.planetId);
            const fleet = world.movement.fleets.get(payload.fleetId);
            
            if (!planet || !fleet || fleet.factionId !== factionId) return;
            if (planet.ownerId === factionId) return; // Already owner

            // Phase 16: Initialize or Reinforce Ground Siege
            if (!planet.siege) {
                const defenseState: PlanetaryDefenseState = (planet as any).garrison || {
                    planetId: planet.id,
                    ownerEmpireId: planet.ownerId,
                    garrisonTroops: 500,
                    unitComposition: { INFANTRY: 400, MILITIA: 100 } as any,
                    fortificationLevel: 2,
                    fortificationLayers: { orbitalSuppressed: false, outerDefenses: 100, innerDefenses: 100, commandBunkers: 100 },
                    supply: 1000,
                    maxSupply: 1000,
                    morale: 100,
                    maxMorale: 100,
                    cohesion: 100,
                    maxCohesion: 100,
                    resistance: 10,
                    stability: planet.stability,
                    infrastructureIntegrity: 100,
                    militiaAvailable: true,
                    occupationProgress: 0,
                    isUnderSiege: true
                };

                planet.siege = {
                    siegeId: `siege-${payload.planetId}-${Date.now()}`,
                    planetId: payload.planetId,
                    attackerEmpireId: factionId,
                    defenderEmpireId: planet.ownerId,
                    phase: 'LANDING',
                    tickCount: 0,
                    cycleCount: 0,
                    cycleLengthTicks: 4, // User Choice: 4 ticks
                    currentFrontage: 500,
                    maxFrontage: 1000,
                    attackerState: {
                        siegeId: `siege-${payload.planetId}-${Date.now()}`,
                        attackerEmpireId: factionId,
                        sourceFleetIds: [payload.fleetId],
                        totalLandedTroops: fleet.basePower * 5,
                        reserveTroops: 0,
                        unitComposition: { INFANTRY: fleet.basePower * 4, ARMOR: fleet.basePower * 1 } as any,
                        supply: 1000,
                        maxSupply: 1000,
                        morale: 100,
                        maxMorale: 100,
                        cohesion: 100,
                        maxCohesion: 100,
                        orbitalSupportPower: fleet.basePower,
                        retreatRequested: false,
                        reinforcementQueue: [],
                        occupationControl: 0,
                        devastationCaused: 0
                    },
                    defenderState: defenseState,
                    battleLog: [],
                    lastResolvedCycle: 0
                };
                (planet as any).garrison = defenseState;
                console.log(`[Tick Worker] SIEGE EXPANSIONS INITIATED on ${planet.name} by ${factionId}`);
            } else if (planet.siege.attackerEmpireId === factionId) {
                // Reinforce
                planet.siege.attackerState.unitComposition.INFANTRY += fleet.basePower * 5;
                planet.siege.attackerState.totalLandedTroops += fleet.basePower * 5;
                console.log(`[Tick Worker] SIEGE REINFORCED on ${planet.name} by ${factionId}`);
            }
            break;
        }

        case 'MIL_SET_GROUND_TACTIC': {
            const planet = world.construction.planets.get(payload.planetId);
            if (planet && planet.siege) {
                if (planet.siege.attackerEmpireId === factionId) {
                    planet.siege.attackerState.activeAttackerTactic = payload.tacticId as TacticalStanceId;
                } else if (planet.siege.defenderEmpireId === factionId) {
                    planet.siege.defenderState.activeDefenderTactic = payload.tacticId as TacticalStanceId;
                }
            }
            break;
        }

        case 'MIL_SET_GROUND_PREDICTION': {
            const planet = world.construction.planets.get(payload.planetId);
            if (planet && planet.siege) {
                if (planet.siege.attackerEmpireId === factionId) {
                    planet.siege.attackerState.attackerPrediction = payload.tacticId as TacticalStanceId;
                } else if (planet.siege.defenderEmpireId === factionId) {
                    planet.siege.defenderState.defenderPrediction = payload.tacticId as TacticalStanceId;
                }
            }
            break;
        }

        case 'MIL_LEAVE_SIEGE': {
             const planet = world.construction.planets.get(payload.planetId);
             if (planet && planet.siege && planet.siege.attackerEmpireId === factionId) {
                 console.log(`[Tick Worker] Siege of ${planet.name} ABANDONED by ${factionId}`);
                 planet.siege = null;
             }
             break;
        }

        case 'MIL_BOMBARD_PLANET': {
            const planet = world.construction.planets.get(payload.targetId || payload.planetId);
            if (planet && planet.siege && planet.siege.attackerEmpireId === factionId) {
                // If the user's previously added bombardment button exists, toggle bombardment status
                // But in Phase 16 we also have specific modes in the payload if provided
                const mode = payload.mode || 'FORTIFICATION'; // Default
                planet.siege.attackerState.orbitalSupportPower = (planet as any).bombardmentActive ? 100 : 0; // Simplified
                console.log(`[Tick Worker] Bombardment mode ${mode} active on ${planet.name}`);
            }
            break;
        }

        case 'MIL_ORBIT_PLANET': {
            // Client-local UX only — no world-state mutation needed.
            // Logged here for audit trail.
            console.log(`[Order] ${factionId} fleet ${payload.fleetId} established orbit around ${payload.planetId}.`);
            break;
        }

        case 'MIL_MOVE_ARMY': {
            // payload: { armyId, targetPlanetId }
            console.log(`[Order] Faction ${factionId} moving army ${payload.armyId} to planet ${payload.targetPlanetId}`);
            break;
        }

        case 'MIL_EMBARK_ARMY': {
            // payload: { armyId, fleetId }
            console.log(`[Order] Faction ${factionId} embarking army ${payload.armyId} onto fleet ${payload.fleetId}`);
            break;
        }

        case 'MIL_DISEMBARK_ARMY': {
            // payload: { armyId, planetId }
            console.log(`[Order] Faction ${factionId} disembarking army ${payload.armyId} to planet ${payload.planetId}`);
            break;
        }
        
        case 'PLANET_CONSTRUCT_BUILDING': {
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet) return;
            if (planet.ownerId !== factionId) {
                console.error(`[Security] Unauthorized BUILD from ${factionId} on planet ${payload.planetId} (Owner: ${planet.ownerId})`);
                return;
            }
            planet.buildQueue.push({
                id: `build-${Date.now()}`,
                buildingId: payload.buildingType,
                completesAtSeconds: world.nowSeconds + 3600,
                status: 'active'
            });
            break;
        }

        case 'PLANET_UPGRADE_BUILDING': {
             // payload: { buildingId }
             // Find building and increment level
             console.log(`[Order] Faction ${factionId} upgrading building ${payload.buildingId}`);
             break;
        }

        case 'PLANET_REPAIR_BUILDING': {
             // payload: { buildingId }
             console.log(`[Order] Faction ${factionId} repairing building ${payload.buildingId}`);
             break;
        }

        case 'PLANET_RECRUIT_UNITS': {
             // payload: { planetId, unitType, count }
             console.log(`[Order] Faction ${factionId} recruiting ${payload.count} ${payload.unitType} on ${payload.planetId}`);
             break;
        }

        case 'TECH_START_RESEARCH': {
            const techState = world.tech.get(factionId);
            if (techState) {
                try {
                    const emptySlot = techState.activeSlots.find((s: any) => s.status === 'empty' || s.techId === null);
                    if (emptySlot) {
                        const newState = TechEngine.assignResearch(techState, emptySlot.slotId, payload.techId, world.nowSeconds);
                        world.tech.set(factionId, newState);
                    }
                } catch (e: any) {
                    console.error(`[Tick Worker] Tech start failed:`, e.message);
                }
            }
            break;
        }

        case 'IDEO_ENACT_POLICY': {
            try {
                applyPolicyEffect(factionId, payload.policyId, world);
            } catch (e: any) {
                console.error(`[Tick Worker] Policy enact failed:`, e.message);
            }
            break;
        }

        case 'DIP_DECLARE_WAR': {
             const rivalryId = `rivalry-${factionId}-${payload.targetFactionId}`;
             const state = {
                 id: rivalryId,
                 empireAId: factionId,
                 empireBId: payload.targetFactionId,
                 rivalryScore: 100,
                 escalationLevel: 7,
                 activeSanctionIds: [],
                 proxyConflictsInvolved: [],
                 detenteActive: false
             };
             world.rivalries.set(rivalryId, state);
             const reverseRivalryId = `rivalry-${payload.targetFactionId}-${factionId}`;
             world.rivalries.set(reverseRivalryId, { ...state, id: reverseRivalryId, empireAId: payload.targetFactionId, empireBId: factionId });
             console.log(`[Order] Faction ${factionId} declared War on ${payload.targetFactionId}`);
             break;
        }

        case 'DIP_SEND_ENVOY': {
             const rivalryId = `rivalry-${factionId}-${payload.targetFactionId}`;
             let rivalry = world.rivalries.get(rivalryId);
             if (!rivalry) {
                 rivalry = {
                     id: rivalryId,
                     empireAId: factionId,
                     empireBId: payload.targetFactionId,
                     rivalryScore: 20,
                     escalationLevel: 0,
                     activeSanctionIds: [],
                     proxyConflictsInvolved: [],
                     detenteActive: false
                 };
                 world.rivalries.set(rivalryId, rivalry);
             } else {
                 rivalry.rivalryScore = Math.max(0, rivalry.rivalryScore - 15);
                 rivalry.escalationLevel = calculateEscalationLevel(rivalry.rivalryScore);
             }
             console.log(`[Order] Faction ${factionId} sent Envoy to ${payload.targetFactionId}`);
             break;
        }

        case 'DIP_OFFER_PEACE': {
             const rivalryId = `rivalry-${factionId}-${payload.targetFactionId}`;
             const rivalry = world.rivalries.get(rivalryId);
             if (rivalry) {
                  rivalry.rivalryScore = 50;
                  rivalry.escalationLevel = calculateEscalationLevel(50);
                  rivalry.detenteActive = true;
             }
             break;
        }

        case 'LEADER_RECRUIT': {
              LeadershipService.recruitLeader(world, payload.leaderId, factionId);
              break;
        }

        case 'LEADER_ASSIGN': {
              const leader = world.leadership.leaders.get(payload.leaderId);
              if (leader && leader.factionId === factionId) {
                  LeadershipService.assignLeader(world, payload.leaderId, payload.assignmentId);
              } else {
                  console.error(`[Security] Unauthorized LEADER_ASSIGN from ${factionId} on leader belonging to ${leader?.factionId}`);
              }
              break;
        }

        case 'SHIP_DESIGN_SAVE': {
            if (!world.shipDesigns) world.shipDesigns = new Map();
            const designId = payload.design.id || `design-${factionId}-${Date.now()}`;
            world.shipDesigns.set(designId, { 
                ...payload.design, 
                id: designId, 
                factionId 
            });
            console.log(`[Tick Worker] Saved Ship Design ${designId} for ${factionId}`);
            break;
        }

        case 'ESP_LAUNCH_OP': {
            import('../lib/espionage/espionage-service').then(({ launchOperation }) => {
                launchOperation(
                    factionId,
                    payload.targetFactionId,
                    payload.targetRegionId,
                    payload.domain,
                    payload.investmentLevel || 0.5,
                    payload.riskLevel || 0.5,
                    world
                );
                console.log(`[Tick Worker] Launched Espionage Op for ${factionId}`);
            });
            break;
        }

        case 'ESP_ASSIGN_AGENT': {
            import('../lib/espionage/agent-service').then(({ deployAgent }) => {
                const agent = world.espionage.agents.get(payload.agentId);
                if (agent && agent.ownerFactionId === factionId) {
                    deployAgent(agent, payload.systemId, payload.domain, world);
                    console.log(`[Tick Worker] Deployed Agent ${agent.codename} to ${payload.systemId}`);
                }
            });
            break;
        }

        case 'PLANET_RECRUIT_UNITS': {
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet) return;
            
            // Military facility check (Simplified requirement for Phase 16)
            const hasMilitaryFacility = planet.tiles.some((t: any) => 
                (t.buildingId === 'barracks' || t.buildingId === 'tank_foundry' || t.buildingId === 'military_academy') 
                && t.constructionState === 'active'
            );
            
            if (!hasMilitaryFacility && payload.unitType !== 'MILITIA') {
                console.warn(`[Security] Faction ${factionId} tried to recruit specialized units without military facility on ${payload.planetId}`);
                return;
            }

            const job = RecruitmentService.createJob(
                payload.planetId,
                factionId,
                payload.unitType as GroundUnitType,
                payload.count,
                world.nowSeconds
            );
            if (!world.combat) world.combat = {};
            if (!world.combat.recruitmentJobs) world.combat.recruitmentJobs = [];
            world.combat.recruitmentJobs.push(job);
            console.log(`[Order] Faction ${factionId} recruiting ${payload.count}x ${payload.unitType} on ${payload.planetId}`);
            break;
        }

        case 'ESP_INFILTRATE_NETWORK': {
             const networkId = `net-${factionId}-${payload.targetId}`;
             if (!world.espionage.intelNetworks) world.espionage.intelNetworks = new Map();
             world.espionage.intelNetworks.set(networkId, {
                 id: networkId,
                 ownerFactionId: factionId,
                 targetFactionId: payload.targetId,
                 intelLevel: 10,
                 networkStrength: 1.0,
                 isDetected: false
             });
             console.log(`[Order] Faction ${factionId} infiltrated network of ${payload.targetId}`);
             break;
        }

        case 'ESP_SABOTAGE_FACILITY': {
             // In a full impl, damage building state. For now, log.
             console.log(`[Order] Faction ${factionId} sabotaged building ${payload.targetBuildingId}`);
             break;
        }

        case 'ESP_STEAL_TECHNOLOGY': {
             console.log(`[Order] Faction ${factionId} attempting to steal tech from ${payload.targetFactionId}`);
             break;
        }

        case 'ESP_INCITE_UNREST': {
             const planet = world.construction.planets.get(payload.targetPlanetId);
             if (planet) {
                 planet.unrest = Math.min(100, (planet.unrest || 0) + 20);
                 console.log(`[Order] Faction ${factionId} incited unrest on ${planet.name}`);
             }
             break;
        }

        case 'PRESS_SUPPRESS_STORY': {
            if (world.press) {
                const pub = world.press.publishedStories.find((p: any) => p.storyId === payload.storyId);
                if (pub) {
                    pub.viralFactor = Math.max(0, pub.viralFactor - 0.5); // Suppress propagation speed
                    console.log(`[Tick Worker] Suppressed Story ${payload.storyId} by ${factionId}`);
                }
            }
            break;
        }

        case 'PRESS_INFLUENCE_NARRATIVE': {
            if (world.press) {
                const pub = world.press.publishedStories.find((p: any) => p.storyId === payload.storyId);
                if (pub) {
                    pub.viralFactor = Math.min(2.0, pub.viralFactor + 0.5); // Accelerate propagation
                    console.log(`[Tick Worker] Influenced Narrative ${payload.storyId} by ${factionId}`);
                }
            }
            break;
        }

        case 'MIL_BUILD_FLEET': {
            // payload: { planetId, systemId }
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet || planet.ownerId !== factionId) return;
            
            const fleetId = `fleet-${factionId}-${Date.now()}`;
            const newFleet = {
                id: fleetId,
                factionId,
                name: `Task Force ${Math.floor(Math.random() * 100)}`,
                currentSystemId: payload.systemId,
                destinationSystemId: null,
                activeLayer: null,
                transitProgress: 0,
                etaSeconds: 0,
                plannedPath: [],
                orders: [],
                doctrine: {
                    type: 'Offensive',
                    deviationFromPosture: 0,
                    preferredLayers: ['hyperlane', 'gate'],
                    retreatThreshold: 0.3,
                    logisticsStrain: 0,
                    moraleDrift: 0,
                    supplyLevel: 1.0
                },
                postureId: 'Expansionist',
                strength: 1.0,
                basePower: 100,
                composition: {},
                hyperdriveProfile: {
                    hyperlane: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
                    trade: { speedMultiplier: 1.2, detectabilityMultiplier: 1.5, supplyStrainMultiplier: 1.0 },
                    corridor: { speedMultiplier: 2.0, detectabilityMultiplier: 0.5, supplyStrainMultiplier: 1.0 },
                    gate: { speedMultiplier: 10.0, detectabilityMultiplier: 2.0, supplyStrainMultiplier: 1.0 },
                    deepSpace: { speedMultiplier: 0.5, detectabilityMultiplier: 0.2, supplyStrainMultiplier: 1.0 },
                },
                isDetectable: true
            };
            world.movement.fleets.set(fleetId, newFleet);
            console.log(`[Order] Faction ${factionId} commissioned new fleet ${fleetId} at ${payload.systemId}`);
            break;
        }

        case 'MIL_ATTACK_FLEET': {
            // payload: { attackerFleetId, defenderFleetId }
            const attacker = world.movement.fleets.get(payload.attackerFleetId);
            const defender = world.movement.fleets.get(payload.defenderFleetId);
            if (!attacker || !defender || attacker.factionId !== factionId) return;
            
            // Re-use logic from combat.ts but for the singleton world
            import('../app/actions/combat').then(({ attackFleetAction }) => {
                // Note: attackFleetAction currently mutates getGameWorldState() directly.
                // Since this script runs in a separate process, we must ensure it mutates the 'world' variable passed in.
                // However, the action is designed for the singleton.
                // For now, we manually inline the core logic to ensure it targets the correct 'world' instance.
                const combatId = `combat-${payload.attackerFleetId}-${payload.defenderFleetId}-${Date.now()}`;
                const { initiateCombat } = require('../lib/combat/combat-engine');
                
                const combatState = initiateCombat(combatId, 
                    { systemId: attacker.currentSystemId || '', terrainModifier: 1.0, infrastructureIntegrity: 1.0 },
                    { factionId: attacker.factionId, role: 'attacker', hp: attacker.strength * 1000, maxHp: attacker.strength * 1000, organization: 100, maxOrganization: 100, screeningEfficiency: 1.0, baseForceCount: attacker.strength * 100, composition: {}, intelLevel: 'observing', supply: 1.0, morale: 1.0, doctrine: 'aggressive', casualties: 0, predictionPoints: 0 },
                    { factionId: defender.factionId, role: 'defender', hp: defender.strength * 1000, maxHp: defender.strength * 1000, organization: 100, maxOrganization: 100, screeningEfficiency: 1.0, baseForceCount: defender.strength * 100, composition: {}, intelLevel: 'observing', supply: 1.0, morale: 1.0, doctrine: 'defensive', casualties: 0, military: 0, cost: { credits: 0, manpower: 0 } as any, predictionPoints: 0 } as any
                );
                world.activeCombats.set(combatId, combatState);
                console.log(`[Order] Combat ${combatId} initiated between ${attacker.factionId} and ${defender.factionId}`);
            });
            break;
        }

        case 'MIL_COMBAT_STANCE': {
            const combat = world.activeCombats.get(payload.combatId);
            if (!combat) return;
            if (combat.attacker.factionId === factionId) {
                combat.attacker.selectedStance = payload.stance;
                combat.attacker.selectedPrediction = payload.prediction;
            } else if (combat.defender.factionId === factionId) {
                combat.defender.selectedStance = payload.stance;
                combat.defender.selectedPrediction = payload.prediction;
            }
            break;
        }

        case 'MIL_COMBAT_DIRECTIVE': {
            const combat = world.activeCombats.get(payload.combatId);
            if (!combat) return;
            if (combat.attacker.factionId === factionId) combat.attacker.selectedStance = payload.stance;
            else if (combat.defender.factionId === factionId) combat.defender.selectedStance = payload.stance;
            break;
        }

        case 'DIP_PROPOSE_TREATY': {
            const treatyId = `treaty-${factionId}-${payload.targetFactionId}-${payload.treatyType}`;
            world.treaties.set(treatyId, {
                id: treatyId,
                type: payload.treatyType,
                signatories: [factionId, payload.targetFactionId],
                signedAtTick: world.nowSeconds,
                status: 'proposal'
            });
            break;
        }

        case 'DIP_DEMAND_TRIBUTE': {
            const tributeId = `tribute-${factionId}-${payload.targetFactionId}`;
            world.tributes.set(tributeId, {
                id: tributeId,
                vassalId: payload.targetFactionId,
                overlordId: factionId,
                resourceType: 'credits',
                amountPerTick: payload.amount,
                status: 'active'
            });
            break;
        }

        case 'DIP_TRADE_PACT': {
            const pactId = `pact-${factionId}-${payload.targetFactionId}`;
            world.tradePacts.set(pactId, {
                id: pactId,
                empireAId: factionId,
                empireBId: payload.targetFactionId,
                resourceAdjustments: {},
                tariffExemption: true,
                signedAtTick: world.nowSeconds
            });
            break;
        }

        case 'ECON_UPDATE_POLICY': {
             // payload: { updates }
             if (!world.economy.policies) world.economy.policies = new Map();
             let policy = world.economy.policies.get(factionId);
             if (!policy) {
                 policy = {
                     tariffsByResource: new Map(),
                     subsidiesByResource: new Map(),
                     sanctions: new Set(),
                     embargoes: [],
                     chokepointRules: new Map(),
                     productionFocus: null
                 };
                 world.economy.policies.set(factionId, policy);
             }
             if (payload.updates.tariffs) {
                 payload.updates.tariffs.forEach((t: any) => policy.tariffsByResource.set(t.resource, t.value));
             }
             console.log(`[Order] Faction ${factionId} updated Economic Policy`);
             break;
        }

        case 'ECON_SET_FOCUS': {
             if (!world.economy.policies) world.economy.policies = new Map();
             let policy = world.economy.policies.get(factionId);
             if (!policy) {
                 policy = {
                     tariffsByResource: new Map(),
                     subsidiesByResource: new Map(),
                     sanctions: new Set(),
                     embargoes: [],
                     chokepointRules: new Map(),
                     productionFocus: null
                 };
                 world.economy.policies.set(factionId, policy);
             }
             policy.productionFocus = payload.resource;
             console.log(`[Order] Faction ${factionId} set Production Focus to ${payload.resource}`);
             break;
        }

        case 'ECON_ESTABLISH_ROUTE': {
             // maps to the existing internal logic but using the new ordered entry point
             import('../lib/economy/trade-service').then(({ establishTradeRoute }) => {
                 establishTradeRoute(world, factionId, payload);
                 console.log(`[Order] Faction ${factionId} established Trade Route to ${payload.targetFactionId}`);
             }).catch(e => console.warn('[Tick Worker] Could not load Trade module.', e.message));
             break;
        }

        case 'MIL_BOMBARD_PLANET': {
             const planet = world.construction.planets.get(payload.targetId);
             if (planet) {
                 planet.stability = Math.max(0, (planet.stability || 60) - 10);
                 planet.unrest = Math.min(100, (planet.unrest || 0) + 5);
                 console.log(`[Order] Faction ${factionId} bombarded planet ${planet.name}`);
             }
             break;
        }

        case 'MIL_ESTABLISH_GARRISON': {
             const planet = world.construction.planets.get(payload.targetId);
             if (planet && planet.ownerId === factionId) {
                 planet.stability = Math.min(100, (planet.stability || 60) + 15);
                 planet.unrest = Math.max(0, (planet.unrest || 0) - 10);
                 console.log(`[Order] Faction ${factionId} established Garrison on ${planet.name}`);
             }
             break;
        }

        case 'ECON_ESTABLISH_COMPANY': {
             // payload: { name, sector, planetId }
             console.log(`[Order] Faction ${factionId} established company "${payload.name}" in ${payload.sector} sector.`);
             break;
        }

        case 'ECON_INVEST_COMPANY': {
             // payload: { companyId, amount }
             console.log(`[Order] Faction ${factionId} invested ${payload.amount} in company ${payload.companyId}`);
             break;
        }

        case 'ECON_LIQUIDATE_COMPANY': {
             console.log(`[Order] Faction ${factionId} liquidated company ${payload.companyId}`);
             break;
        }

        case 'ECON_GRANT_MONOPOLY': {
             console.log(`[Order] Faction ${factionId} granted monopoly to company ${payload.companyId} on ${payload.resource}`);
             break;
        }

        case 'ECON_ISSUE_SHARES': {
             console.log(`[Order] Faction ${factionId} issued shares for ${payload.companyId}`);
             break;
        }

        case 'ECON_COMMAND_PRIVATEERS': {
             console.log(`[Order] Faction ${factionId} commanded privateers for ${payload.companyId}`);
             break;
        }

        case 'ECON_TAX_COLONIES': {
             console.log(`[Order] Faction ${factionId} taxed colonies of ${payload.companyId}`);
             break;
        }

        case 'FACTION_JOIN': {
             console.log(`[Order] New Faction Join: ${payload.name}`);
             if (!world.factions) (world as any).factions = new Map();
             (world as any).factions.set(factionId, { id: factionId, name: payload.name, resources: {} });
             break;
        }

        case 'PLANET_CLAIM': {
             const planet = world.construction.planets.get(payload.planetId);
             if (planet) {
                 planet.ownerId = factionId;
                 console.log(`[Order] Faction ${factionId} claimed planet ${planet.name}`);
             }
             break;
        }

        case 'DISCOURSE_POST_OPINION': {
             // payload: { content, topic }
             console.log(`[Order] Faction ${factionId} posted opinion on ${payload.topic}`);
             break;
        }

        case 'DISCOURSE_VOTE_OPINION': {
             console.log(`[Order] Faction ${factionId} voted on discourse ${payload.opinionId}`);
             break;
        }

        case 'TRADE_ESTABLISH_ROUTE': {
            // Deduct freighter amount from faction's fleet and establish a background route
            import('@/lib/economy/trade-service').then(({ establishTradeRoute }) => {
                establishTradeRoute(world, factionId, payload);
                console.log(`[Tick Worker] Established Trade Route from ${payload.startSystemId} to ${payload.endSystemId}`);
            }).catch(e => console.warn('[Tick Worker] Could not load Trade module.', e.message));
            break;
        }

        case 'AIR_LAUNCH_SORTIE': {
            const { parentBaseId, targetId, missionType, numInterceptors, numBombers } = payload;
            const parent = world.movement.fleets.get(parentBaseId); // To support planets we'd check economy.planets
            if (parent && parent.factionId === factionId) {
                // Validate they have enough planes
                const comp = parent.composition || {};
                const availableInts = comp['interceptor'] || 0;
                const availableBombers = comp['bomber'] || 0;

                if (availableInts >= numInterceptors && availableBombers >= numBombers) {
                    // Deduct
                    if (numInterceptors > 0) comp['interceptor'] = availableInts - numInterceptors;
                    if (numBombers > 0) comp['bomber'] = availableBombers - numBombers;

                    // Spawn sortie
                    const sortieId = `sortie-${Date.now()}`;
                    world.movement.sorties.set(sortieId, {
                        id: sortieId,
                        factionId,
                        parentBaseId,
                        missionType,
                        composition: { interceptor: numInterceptors, bomber: numBombers },
                        originSystemId: parent.destinationSystemId || '', 
                        targetId,
                        status: 'outbound',
                        maxRadius: payload.maxRadius || 2, // Default 2 jump limit
                        currentSystemId: parent.destinationSystemId || '',
                        launchedAt: world.nowSeconds
                    });
                    console.log(`[Tick Worker] Launched Air Sortie ${sortieId} from ${parentBaseId} to execute ${missionType}`);
                }
            }
            break;
        }

        case 'INFRA_UPGRADE': {
            // payload: { planetId, serviceId }
            const planet = world.economy.planets.get(payload.planetId);
            if (planet && planet.factionId === factionId) {
                if (planet.services) {
                    const svc = planet.services[payload.serviceId];
                    if (svc) {
                        svc.level += 1;
                        console.log(`[Tick Worker] Upgraded ${svc.serviceId} on planet ${payload.planetId} to level ${svc.level}.`);
                    }
                }
            }
            break;
        }

        case 'INTERNAL_PURGE_FACTION': {
             // payload: { targetFactionId }
             // In a full impl, remove faction or reduce their influence.
             console.log(`[Order] Faction ${factionId} purged internal branch ${payload.targetFactionId}`);
             break;
        }

        case 'RENAME_PLANET': {
            // payload: { planetId, newName }
            const planet = world.economy.planets.get(payload.planetId);
            if (planet && planet.factionId === factionId) {
                planet.name = payload.newName;
                console.log(`[Tick Worker] Faction ${factionId} renamed planet ${payload.planetId} to ${payload.newName}`);
            }
            break;
        }

        default:
            console.warn(`[Tick Worker] No worker-side handler for action: ${actionId}`);
    }
}

/**
 * Authoritative Tick: Evaluates all active planetary sieges using Ground Combat logic.
 * Phase 16: Uses GroundSiegeEngine for complex logistics and tactical stances.
 */
function processSieges(world: GameWorldState) {
    for (const planet of world.construction.planets.values()) {
        const siege = planet.siege;
        if (!siege) continue;

        // Resolve common per-tick logic (attrition, cycle checks)
        const updatedSiege = GroundSiegeEngine.resolveTick(siege);
        planet.siege = updatedSiege;

        // Resolve Phase transitions
        if (updatedSiege.defenderState.garrisonTroops <= 0) {
            // Occupation phase start
            updatedSiege.phase = 'OCCUPATION';
            
            // Advance occupation progress based on surviving infantry
            const infantryCount = updatedSiege.attackerState.unitComposition.INFANTRY || 0;
            const progress = (infantryCount / 1000) * 1.5; // 0.15% per 100 infantry
            updatedSiege.defenderState.occupationProgress += progress;

            if (updatedSiege.defenderState.occupationProgress >= 100) {
                const oldOwner = planet.ownerId;
                planet.ownerId = updatedSiege.attackerEmpireId;
                planet.isOccupied = false;
                planet.siege = null;
                // Severe stability hit on capture
                planet.stability = Math.max(10, (planet.stability || 60) - 40);
                console.log(`[Tick Worker] PLANETARY CAPTURE: ${planet.name} taken by ${planet.ownerId}`);
            }
        } else if (updatedSiege.attackerState.totalLandedTroops <= 0) {
            console.log(`[Tick Worker] INVASION COLLAPSED: Attackers on ${planet.name} eliminated.`);
            planet.siege = null;
        }
    }
}

// Start
console.log('[Tick Worker] Galactic Heartbeat Started.');
setInterval(runGameTick, POLL_INTERVAL_MS);
