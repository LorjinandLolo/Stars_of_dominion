import { Client, Databases, Query, ID } from 'node-appwrite';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { deserializeWorld, serializeWorld, cleanWorldForSave, extractFactionShard, injectFactionShard } from '../lib/persistence/save-service';
import { advanceFleet, issueMoveOrder, changeFleetCourse } from '../lib/movement/movement-service';
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
// Static imports for order handlers. These used to be fire-and-forget dynamic
// `import().then(...)` calls inside executeOrder — the mutation could land AFTER
// saveWorldState() had already serialized the world, silently losing the order.
import { launchOperation } from '../lib/espionage/espionage-service';
import { ACTION_DEFINITIONS } from '../lib/actions/registry';
import { deployAgent } from '../lib/espionage/agent-service';
import { establishTradeRoute } from '../lib/economy/trade-service';
import { advanceSorties } from '../lib/combat/air-mission-service';
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

// Overlap guard: a cycle that takes longer than POLL_INTERVAL_MS (big snapshot
// serialize, slow network) used to overlap the next setInterval firing — two
// concurrent cycles double-advancing time and racing each other's saves.
let cycleInProgress = false;

async function runGameTick() {
    if (cycleInProgress) {
        console.warn('[Tick Worker] Previous cycle still running — skipping this interval.');
        return;
    }
    cycleInProgress = true;
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

        // Normalize snapshot data: systems saved by older snapshots can be missing
        // array fields, which crashes tick steps that iterate them
        // (`hyperlaneNeighbors is not iterable`, `tags.includes` throws, etc.).
        for (const sys of world.movement.systems.values()) {
            if (!Array.isArray((sys as any).hyperlaneNeighbors)) (sys as any).hyperlaneNeighbors = [];
            if (!Array.isArray((sys as any).tags)) (sys as any).tags = [];
        }

        // 2. Advance Simulation Time
        const oldNow = world.nowSeconds;
        world.nowSeconds += TIME_STEP_SECONDS;

        // 3. Process Pending Player Orders
        // Filter server-side on processed=false. The old client-side filter over the
        // first 50 docs meant that once 50+ processed orders accumulated, NEW orders
        // never fit in the window and the queue silently starved forever.
        // If the live collection is missing the `processed` attribute (schema drift),
        // fall back to an unfiltered scan instead of crash-looping — safe, because
        // executed orders are deleted, so the queue can no longer starve.
        let allOrders;
        try {
            allOrders = await db.listDocuments(DB_ID, COLL_ORDERS, [
                Query.equal('processed', false),
                Query.orderAsc('$createdAt'),
                Query.limit(100)
            ]);
        } catch (e: any) {
            if (String(e.message).toLowerCase().includes('processed')) {
                console.warn('[Tick Worker] "processed" attribute missing in game_orders — using unfiltered scan.');
                console.warn('[Tick Worker] Fix permanently with:  node scripts/fix-orders-schema.mjs');
                allOrders = await db.listDocuments(DB_ID, COLL_ORDERS, [
                    Query.orderAsc('$createdAt'),
                    Query.limit(100)
                ]);
            } else {
                throw e;
            }
        }

        const pendingOrders = allOrders.documents.filter((d: any) => d.processed !== true);

        if (pendingOrders.length > 0) {
            console.log(`[Tick Worker] Executing ${pendingOrders.length} player orders...`);
            for (const orderDoc of pendingOrders) {
                try {
                    const payload = JSON.parse(orderDoc.payload);
                    executeOrder(world, orderDoc.actionId, payload, orderDoc.factionId);
                    // Delete on success — keeps the queue collection empty so it can
                    // never starve, and avoids unbounded growth.
                    await db.deleteDocument(DB_ID, COLL_ORDERS, orderDoc.$id);
                } catch (e) {
                    console.error(`[Tick Worker] Order ${orderDoc.$id} failed:`, e);
                    // Mark failed orders processed so they aren't retried in a loop.
                    try {
                        await db.updateDocument(DB_ID, COLL_ORDERS, orderDoc.$id, { processed: true });
                    } catch {
                        // Marking failed (e.g. `processed` attribute missing) — delete
                        // instead, so a poisoned order can't be retried forever.
                        try { await db.deleteDocument(DB_ID, COLL_ORDERS, orderDoc.$id); } catch { /* best effort */ }
                    }
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

        // 6. Advance air sorties (static import — runs before the save, always)
        try {
            advanceSorties(world);
        } catch (e: any) {
            console.warn('[Tick Worker] advanceSorties failed:', e.message);
        }

        // 5. Strategic Tick check (6-hour windows)
        const currentTickWindow = Math.floor(world.nowSeconds / (6 * 3600));
        const lastTickWindow = Math.floor(oldNow / (6 * 3600));

        if (currentTickWindow > lastTickWindow) {
            console.log(`[Tick Worker] STRATEGIC TICK TRIGGERED (#${currentTickWindow})`);
            // CRITICAL: pass `world` — without it the tick processor mutates the
            // worker's local singleton, and every strategic-tick result (economy,
            // research, population...) was thrown away instead of saved/synced.
            await runStrategicTick(new Date(world.nowSeconds * 1000), currentTickWindow, world);
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


        // 5.7 Starter Infrastructure — every capital gets a working shipyard and
        // barracks so the core loop (commission ships, recruit troops, repair)
        // functions out of the box. Idempotent: skips planets that have them.
        for (const [fId, f] of world.economy.factions) {
            const capSys = (f as any).capitalSystemId;
            if (!capSys) continue;
            const capPlanet = Array.from(world.construction.planets.values())
                .find((p: any) => p.systemId === capSys && p.ownerId === fId);
            if (!capPlanet) continue;
            for (const bId of ['orbital_shipyard', 'barracks']) {
                if (!Array.isArray((capPlanet as any).tiles)) (capPlanet as any).tiles = [];
                const has = (capPlanet as any).tiles.some((t: any) => t.buildingId === bId);
                if (!has) {
                    (capPlanet as any).tiles.push({
                        tileId: `${capPlanet.id}-starter-${bId}`,
                        districtType: 'any',
                        buildingId: bId,
                        constructionState: 'active',
                        constructionCompleteAt: null,
                    });
                    console.log(`[Tick Worker] Seeded starter ${bId} on ${capPlanet.name} (${fId})`);
                }
            }
        }

        // 5.8 Continuous dock repair — fleets holding (not moving) in a system
        // they own patch up a little every cycle. The old repair only ran on the
        // 6-hour strategic tick (~24 real minutes), far too slow to matter.
        for (const fleet of world.movement.fleets.values()) {
            if (fleet.factionId === 'faction-pirates') continue;
            if (!fleet.currentSystemId || fleet.destinationSystemId) continue;
            if ((fleet.strength ?? 1) >= 1.0) continue;
            const sys = world.movement.systems.get(fleet.currentSystemId);
            if (!sys || sys.ownerFactionId !== fleet.factionId) continue;
            fleet.strength = Math.min(1.0, (fleet.strength ?? 0) + 0.01);
            if (fleet.strength >= 1.0) console.log(`[REPAIR] ${fleet.name || fleet.id} fully repaired at ${sys.name}`);
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
    } finally {
        cycleInProgress = false;
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
 * Check & deduct an action's cost from the faction's LIVE economy reserves —
 * the same numbers the player's resource bar shows. Resources the economy
 * doesn't track yet (influence, manpower, intel...) are free for now.
 * Returns false (and skips the order) if an enforced resource is short.
 */
function chargeOrderCost(world: any, factionId: string, actionId: string): boolean {
    const def = (ACTION_DEFINITIONS as any)[actionId];
    const cost = def?.cost;
    if (!cost || Object.keys(cost).length === 0) return true;

    const econFaction = world.economy?.factions?.get?.(factionId);
    const reserves = econFaction?.reserves;
    if (!reserves) return true; // no economy record — don't block gameplay

    const charges: Array<[string, number]> = [];
    for (const [res, amt] of Object.entries(cost)) {
        const key = res.toUpperCase(); // Resource enum keys: CREDITS, METALS, ...
        if (reserves[key] === undefined) continue; // untracked resource → free
        if ((reserves[key] ?? 0) < (amt as number)) {
            console.warn(`[Order] ${factionId} cannot afford ${actionId}: needs ${amt} ${res}, has ${Math.floor(reserves[key] ?? 0)}`);
            return false;
        }
        charges.push([key, amt as number]);
    }
    charges.forEach(([key, amt]) => { reserves[key] = (reserves[key] ?? 0) - amt; });
    return true;
}

/**
 * Persist a human-readable failure reason onto the faction's economy record.
 * It rides the existing faction-shard sync back to the client (see
 * extractFactionShard → game_factions → useGameSync), which surfaces it in the
 * notification feed. The client dedupes by `id`, so re-writing the same failure
 * on later ticks is harmless. Without this, a rejected order was a bare `return`
 * and the queue loop deleted it as if it had succeeded — the player saw nothing.
 */
function recordOrderFailure(world: any, factionId: string, actionId: string, reason: string): void {
    const econFaction = world.economy?.factions?.get?.(factionId);
    if (!econFaction) return;
    econFaction.lastOrderError = {
        id: `ofail-${world.nowSeconds}-${actionId}-${Math.random().toString(36).slice(2, 7)}`,
        actionId,
        reason,
        at: new Date(world.nowSeconds * 1000).toISOString(),
    };
    console.warn(`[Order] ${factionId} order ${actionId} failed: ${reason}`);
}

/**
 * Maps database orders to in-memory world state mutations.
 * includes server-side validation to ensure players only control their own assets.
 */
function executeOrder(world: any, actionId: string, payload: any, factionId: string) {
    console.log(`[Order] Validating ${actionId} for ${factionId}`);

    // Affordability gate — deducts from the live economy on success.
    if (!chargeOrderCost(world, factionId, actionId)) {
        recordOrderFailure(world, factionId, actionId, 'Insufficient resources in the treasury.');
        return;
    }

    switch (actionId) {
        case 'MIL_MOVE_FLEET': {
            const fleet = world.movement.fleets.get(payload.fleetId);
            if (!fleet) return;
            if (fleet.factionId !== factionId) {
                console.error(`[Security] Unauthorized MOVE from ${factionId} on fleet ${payload.fleetId} (Owner: ${fleet.factionId})`);
                return;
            }

            // Dedupe: already heading there, or already parked there — no-op.
            if (fleet.destinationSystemId === payload.destinationId) {
                console.log(`[Order] Fleet ${payload.fleetId} already en route to ${payload.destinationId} — duplicate order skipped.`);
                return;
            }
            if (!fleet.destinationSystemId && fleet.currentSystemId === payload.destinationId) {
                console.log(`[Order] Fleet ${payload.fleetId} is already at ${payload.destinationId} — order skipped.`);
                return;
            }

            // changeFleetCourse handles both the parked case (plain move order)
            // and the mid-transit course change (finish current hop, then reroute
            // from that waypoint) — including return-to-origin, which is just a
            // move order targeting the fleet's recorded originSystemId.
            const updated = changeFleetCourse(fleet, payload.destinationId, 'hyperlane', world.movement);
            if (updated === fleet) {
                // Reference unchanged → no route could be plotted; the order had no
                // effect. Surface it instead of deleting it as a silent success.
                recordOrderFailure(world, factionId, actionId, `No route from the fleet's position to the target system.`);
                return;
            }
            world.movement.fleets.set(payload.fleetId, updated);
            if (!fleet.currentSystemId) {
                console.log(`[Order] Fleet ${payload.fleetId} rerouted mid-transit → ${payload.destinationId}.`);
            }
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
            // Merged handler (there used to be a second, unreachable duplicate case
            // below). Works with or without an active siege.
            const planet = world.construction.planets.get(payload.targetId || payload.planetId);
            if (!planet) return;
            if (planet.ownerId === factionId) {
                console.warn(`[Security] ${factionId} tried to bombard their own planet ${planet.name}`);
                return;
            }
            // General orbital bombardment: batter stability, stoke unrest.
            planet.stability = Math.max(0, (planet.stability || 60) - 10);
            planet.unrest = Math.min(100, (planet.unrest || 0) + 5);
            // If we're besieging this planet, bombardment also feeds the ground assault.
            if (planet.siege && planet.siege.attackerEmpireId === factionId) {
                const mode = payload.mode || 'FORTIFICATION';
                planet.siege.attackerState.orbitalSupportPower = 100;
                console.log(`[Tick Worker] Siege bombardment (${mode}) supporting assault on ${planet.name}`);
            }
            console.log(`[Order] Faction ${factionId} bombarded planet ${planet.name}`);
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
            // Real implementation (was a log-only stub): redeploy within the same
            // system directly; cross-system movement requires a transport fleet
            // (embark → move fleet → disembark).
            const army = world.movement.armies?.get(payload.armyId);
            const target = world.construction.planets.get(payload.targetPlanetId);
            if (!army || !target) return;
            if (army.factionId !== factionId) {
                console.error(`[Security] Unauthorized MOVE_ARMY from ${factionId} on army ${payload.armyId} (Owner: ${army.factionId})`);
                return;
            }
            if (army.transportFleetId) {
                console.warn(`[Order] Army ${payload.armyId} is embarked on a fleet — disembark it first.`);
                return;
            }
            const currentPlanet = army.currentPlanetId ? world.construction.planets.get(army.currentPlanetId) : null;
            if (currentPlanet && currentPlanet.systemId !== target.systemId) {
                console.warn(`[Order] Army ${payload.armyId} cannot cross systems on foot — embark it on a fleet.`);
                return;
            }
            army.currentPlanetId = payload.targetPlanetId;
            army.currentSystemId = target.systemId;
            console.log(`[Order] Faction ${factionId} redeployed army ${payload.armyId} to ${target.name}`);
            break;
        }

        case 'MIL_EMBARK_ARMY': {
            // payload: { armyId, fleetId }
            const army = world.movement.armies.get(payload.armyId);
            const fleet = world.movement.fleets.get(payload.fleetId);
            if (army && fleet && army.factionId === factionId && fleet.factionId === factionId) {
                army.transportFleetId = fleet.id;
                army.currentPlanetId = null;
                if (!fleet.transportedArmyIds) fleet.transportedArmyIds = [];
                if (!fleet.transportedArmyIds.includes(army.id)) {
                    fleet.transportedArmyIds.push(army.id);
                }
                console.log(`[Order] Faction ${factionId} embarked army ${payload.armyId} onto fleet ${payload.fleetId}`);
            }
            break;
        }

        case 'MIL_DISEMBARK_ARMY': {
            // payload: { armyId, planetId }
            const army = world.movement.armies.get(payload.armyId);
            if (army && army.factionId === factionId && army.transportFleetId) {
                const fleet = world.movement.fleets.get(army.transportFleetId);
                if (fleet) {
                    fleet.transportedArmyIds = fleet.transportedArmyIds?.filter((id: string) => id !== army.id) || [];
                }
                army.transportFleetId = null;
                army.currentPlanetId = payload.planetId;
                console.log(`[Order] Faction ${factionId} disembarking army ${payload.armyId} to planet ${payload.planetId}`);
            }
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

        // NOTE: PLANET_RECRUIT_UNITS is handled further down. A stub case here
        // used to SHADOW the real handler (first matching case wins in a switch),
        // which made all army recruitment silently do nothing.

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
            break;
        }

        case 'ESP_ASSIGN_AGENT': {
            const agent = world.espionage.agents.get(payload.agentId);
            if (agent && agent.ownerFactionId === factionId) {
                deployAgent(agent, payload.systemId, payload.domain, world);
                console.log(`[Tick Worker] Deployed Agent ${agent.codename} to ${payload.systemId}`);
            }
            break;
        }

        case 'PLANET_RECRUIT_UNITS': {
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet) return;
            
            // Military facility check (Simplified requirement for Phase 16).
            // Basic troops (INFANTRY, MILITIA) can always be raised — fresh
            // colonies have no barracks, and blocking their only recruitment
            // option made the button feel broken. Specialized units still
            // require a military facility.
            const BASIC_UNITS = ['MILITIA', 'INFANTRY'];
            const hasMilitaryFacility = planet.tiles.some((t: any) =>
                (t.buildingId === 'barracks' || t.buildingId === 'tank_foundry' || t.buildingId === 'military_academy')
                && t.constructionState === 'active'
            );

            if (!hasMilitaryFacility && !BASIC_UNITS.includes(payload.unitType)) {
                console.warn(`[Order] ${factionId} needs a barracks/foundry on ${payload.planetId} to recruit ${payload.unitType} — order skipped.`);
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
            if (!planet) {
                recordOrderFailure(world, factionId, actionId, 'Target planet not found — it may no longer exist.');
                return;
            }
            if (planet.ownerId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'You do not control the selected planet.');
                return;
            }
            
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
                isDetectable: true,
                transportedArmyIds: [],
                leaderId: undefined
            };
            world.movement.fleets.set(fleetId, newFleet);
            console.log(`[Order] Faction ${factionId} commissioned new fleet ${fleetId} at ${payload.systemId}`);
            break;
        }

        case 'MIL_CREATE_ARMY': {
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet) {
                recordOrderFailure(world, factionId, actionId, 'Target planet not found — it may no longer exist.');
                return;
            }
            if (planet.ownerId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'You do not control the selected planet.');
                return;
            }

            const armyId = `army-${factionId}-${Date.now()}`;
            if (!world.movement.armies) world.movement.armies = new Map();
            const newArmy = {
                id: armyId,
                factionId,
                name: `Army Group ${Math.floor(Math.random() * 100)}`,
                currentPlanetId: payload.planetId,
                currentSystemId: payload.systemId,
                transportFleetId: null,
                composition: {},
                stance: 'fortified',
                strength: 1.0,
                basePower: 100,
                supplyLevel: 1.0,
                morale: 100,
                leaderId: undefined
            };
            world.movement.armies.set(armyId, newArmy);
            console.log(`[Order] Faction ${factionId} raised new army ${armyId} at ${payload.planetId}`);
            break;
        }

        case 'MIL_RECRUIT_FORMATION_UNIT': {
            // Because recruitment takes time, we should queue it using RecruitmentService
            // However, we need a way for RecruitmentService to assign it to the formation directly.
            // For now, we will add it instantly for the prototype, or we can use the existing job system 
            // and attach `formationId` to the job. Let's mutate instantly for now to satisfy UI responsiveness,
            // OR use the queue but with formationId. The user said: "Production queue arrive over time. Should deduct resources"
            const job = RecruitmentService.createJob(
                'formation-' + payload.formationId, // Use formationId as planetId spoof
                factionId,
                payload.unitType as GroundUnitType,
                payload.count,
                world.nowSeconds
            );
            // We'll tag the job with the real formation ID
            (job as any).targetFormationId = payload.formationId;
            (job as any).isFleet = payload.isFleet;

            if (!world.combat) world.combat = {};
            if (!world.combat.recruitmentJobs) world.combat.recruitmentJobs = [];
            world.combat.recruitmentJobs.push(job);
            console.log(`[Order] Faction ${factionId} queued ${payload.count}x ${payload.unitType} into formation ${payload.formationId}`);
            break;
        }

        case 'MIL_ATTACK_FLEET': {
            // payload: { attackerFleetId, defenderFleetId }
            const attacker = world.movement.fleets.get(payload.attackerFleetId);
            const defender = world.movement.fleets.get(payload.defenderFleetId);
            if (!attacker || !defender || attacker.factionId !== factionId) return;

            // Attacking a fleet IS an act of war. Setting the rivalry to war level
            // makes the combat-manager start (and keep advancing) the engagement
            // this same cycle. The old inline initiateCombat created an orphan
            // combat that no system ever advanced — battles froze at round 1.
            const skirmishRivalryId = `rivalry-${attacker.factionId}-${defender.factionId}`;
            const existingRivalry = world.rivalries.get(skirmishRivalryId)
                || world.rivalries.get(`rivalry-${defender.factionId}-${attacker.factionId}`);
            if (!existingRivalry || (existingRivalry.escalationLevel ?? 0) < 7) {
                const warState = {
                    id: skirmishRivalryId,
                    empireAId: attacker.factionId,
                    empireBId: defender.factionId,
                    rivalryScore: 100,
                    escalationLevel: 7,
                    activeSanctionIds: [],
                    proxyConflictsInvolved: [],
                    detenteActive: false
                };
                world.rivalries.set(skirmishRivalryId, warState);
                world.rivalries.set(`rivalry-${defender.factionId}-${attacker.factionId}`,
                    { ...warState, id: `rivalry-${defender.factionId}-${attacker.factionId}`, empireAId: defender.factionId, empireBId: attacker.factionId });
                console.log(`[Order] SKIRMISH: ${attacker.factionId} opened fire on ${defender.factionId} — state of war declared.`);
            }
            console.log(`[Order] Engagement ordered: ${payload.attackerFleetId} vs ${payload.defenderFleetId} — combat begins this cycle.`);
            break;
        }

        case 'MIL_MERGE_FLEETS': {
            // payload: { sourceFleetId, targetFleetId } — source is absorbed into target.
            const src = world.movement.fleets.get(payload.sourceFleetId);
            const tgt = world.movement.fleets.get(payload.targetFleetId);
            if (!src || !tgt || src.id === tgt.id) return;
            if (src.factionId !== factionId || tgt.factionId !== factionId) {
                console.error(`[Security] ${factionId} tried to merge fleets they don't own.`);
                return;
            }
            if (!src.currentSystemId || src.currentSystemId !== tgt.currentSystemId) {
                console.warn(`[Order] MERGE rejected: fleets must be holding in the same system.`);
                return;
            }
            if (src.destinationSystemId || tgt.destinationSystemId) {
                console.warn(`[Order] MERGE rejected: fleets in transit cannot merge.`);
                return;
            }

            // Combine ship compositions
            if (!tgt.composition) tgt.composition = {};
            for (const [type, count] of Object.entries(src.composition || {})) {
                (tgt.composition as any)[type] = ((tgt.composition as any)[type] || 0) + (count as number);
            }

            // Strength becomes the power-weighted average; power adds up.
            const srcPower = src.basePower ?? 0;
            const tgtPower = tgt.basePower ?? 0;
            if (srcPower + tgtPower > 0) {
                tgt.strength = ((tgt.strength ?? 1) * tgtPower + (src.strength ?? 1) * srcPower) / (srcPower + tgtPower);
            }
            tgt.basePower = tgtPower + srcPower;
            tgt.originSystemId = null;

            // Carried armies transfer to the merged fleet
            if (src.transportedArmyIds?.length) {
                tgt.transportedArmyIds = [...(tgt.transportedArmyIds || []), ...src.transportedArmyIds];
                for (const armyId of src.transportedArmyIds) {
                    const army = world.movement.armies?.get(armyId);
                    if (army) army.transportFleetId = tgt.id;
                }
            }

            // In-flight ship recruitment aimed at the absorbed fleet retargets
            for (const job of (world.combat?.recruitmentJobs || [])) {
                if ((job as any).targetFormationId === src.id) (job as any).targetFormationId = tgt.id;
            }

            world.movement.fleets.delete(src.id);
            console.log(`[Order] ${factionId} merged ${src.name || src.id} into ${tgt.name || tgt.id} (power ${tgt.basePower}).`);
            break;
        }

        case 'MIL_SPLIT_FLEET': {
            // payload: { fleetId, composition?: {shipType: countToDetach}, name? }
            // Detaches ships into a NEW fleet in the same system. With no
            // composition (or a shipless fleet), splits base power 50/50.
            const src = world.movement.fleets.get(payload.fleetId);
            if (!src) return;
            if (src.factionId !== factionId) {
                console.error(`[Security] ${factionId} tried to split a fleet they don't own.`);
                return;
            }
            if (!src.currentSystemId || src.destinationSystemId) {
                console.warn(`[Order] SPLIT rejected: fleet must be holding in a system.`);
                return;
            }

            if (!src.composition) src.composition = {};
            const totalShips = Object.values(src.composition).reduce((a: number, b: any) => a + (Number(b) || 0), 0);

            const moved: Record<string, number> = {};
            let movedCount = 0;
            for (const [type, want] of Object.entries(payload.composition || {})) {
                const have = (src.composition as any)[type] || 0;
                const take = Math.max(0, Math.min(have, Math.floor(Number(want) || 0)));
                if (take > 0) { moved[type] = take; movedCount += take; }
            }
            if (movedCount > 0 && movedCount >= totalShips) {
                console.warn(`[Order] SPLIT rejected: cannot detach ALL ships — merge or rename instead.`);
                return;
            }

            const srcPower = src.basePower ?? 100;
            let newPower: number;
            if (movedCount > 0) {
                for (const [type, count] of Object.entries(moved)) {
                    (src.composition as any)[type] -= count;
                    if ((src.composition as any)[type] <= 0) delete (src.composition as any)[type];
                }
                const ratio = totalShips > 0 ? movedCount / totalShips : 0.5;
                newPower = Math.max(10, Math.round(srcPower * ratio));
            } else {
                newPower = Math.max(10, Math.round(srcPower / 2));
            }
            src.basePower = Math.max(10, srcPower - newPower);

            const newFleetId = `fleet-${factionId}-${Date.now()}`;
            world.movement.fleets.set(newFleetId, {
                ...src,
                id: newFleetId,
                name: payload.name || `${src.name || 'Task Force'} Detachment`,
                composition: moved,
                basePower: newPower,
                strength: src.strength ?? 1,
                transportedArmyIds: [],
                orders: [],
                plannedPath: [],
                destinationSystemId: null,
                originSystemId: null,
                transitProgress: 0,
                etaSeconds: 0,
                activeLayer: null,
            });
            console.log(`[Order] ${factionId} split ${movedCount > 0 ? `${movedCount} ships` : 'half power'} from ${src.name || src.id} into ${newFleetId}.`);
            break;
        }

        case 'MIL_COMBAT_RETREAT': {
            // Disengage: break off the battle and send this faction's fleets in
            // the contested system home to lick their wounds.
            const combat = world.activeCombats.get(payload.combatId);
            if (!combat) return;
            if (combat.attacker.factionId !== factionId && combat.defender.factionId !== factionId) {
                console.error(`[Security] ${factionId} tried to retreat from a battle they're not in.`);
                return;
            }
            const battleSystemId = combat.location?.systemId;
            const homeSystemId = world.economy.factions.get(factionId)?.capitalSystemId;
            if (battleSystemId && homeSystemId) {
                for (const [fid, fleet] of world.movement.fleets) {
                    if (fleet.factionId === factionId && fleet.currentSystemId === battleSystemId) {
                        const updated = issueMoveOrder(fleet, homeSystemId, 'hyperlane', world.movement);
                        world.movement.fleets.set(fid, updated);
                    }
                }
            }
            world.activeCombats.delete(payload.combatId);
            console.log(`[Order] ${factionId} DISENGAGED from battle ${payload.combatId} — fleets withdrawing home.`);
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
             try {
                 establishTradeRoute(world, factionId, payload);
                 console.log(`[Order] Faction ${factionId} established Trade Route to ${payload.targetFactionId}`);
             } catch (e: any) {
                 console.warn('[Tick Worker] establishTradeRoute failed:', e.message);
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
             if (!planet) return;
             // Only unowned/neutral planets can be claimed outright — owned worlds
             // must be taken by invasion. (Previously any faction could steal any
             // planet with a single order.)
             if (planet.ownerId && planet.ownerId !== 'faction-neutral' && planet.ownerId !== '') {
                 console.warn(`[Security] ${factionId} tried to claim ${planet.name}, already owned by ${planet.ownerId}`);
                 return;
             }
             planet.ownerId = factionId;
             console.log(`[Order] Faction ${factionId} claimed planet ${planet.name}`);
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
            try {
                establishTradeRoute(world, factionId, payload);
                console.log(`[Tick Worker] Established Trade Route from ${payload.startSystemId} to ${payload.endSystemId}`);
            } catch (e: any) {
                console.warn('[Tick Worker] establishTradeRoute failed:', e.message);
            }
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
            // Rename BOTH planet records — economy and construction hold separate
            // copies, and renaming only one made the new name show in some panels
            // but not on the map.
            const econPlanet = world.economy.planets.get(payload.planetId);
            if (econPlanet && econPlanet.factionId === factionId) {
                econPlanet.name = payload.newName;
            }
            const conPlanet = world.construction.planets.get(payload.planetId);
            if (conPlanet && conPlanet.ownerId === factionId) {
                conPlanet.name = payload.newName;
            }
            if (econPlanet || conPlanet) {
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
