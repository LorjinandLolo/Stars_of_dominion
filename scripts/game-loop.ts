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

        // 6. Push state back to Cloud (Sharded)
        const cleanWorld = cleanWorldForSave(world);
        const newSnapshot = serializeWorld(cleanWorld);
        await db.updateDocument(DB_ID, COLL_SESSIONS, SESSION_DOC_ID, {
            snapshot: newSnapshot,
            lastTickAt: new Date().toISOString()
        });

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

// Start
console.log('[Tick Worker] Galactic Heartbeat Started.');
setInterval(runGameTick, POLL_INTERVAL_MS);
