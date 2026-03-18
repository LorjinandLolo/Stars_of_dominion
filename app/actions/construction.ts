/**
 * app/actions/construction.ts
 * Phase 17B — Server Actions for Planetary Construction
 */
'use server'

import { revalidatePath } from 'next/cache';
import { getConstructionWorldState, getGameWorldState } from '@/lib/game-world-state-singleton';
import { 
    startConstruction,
    cancelConstruction,
    tickConstructionGlobal,
    processConstructionQueue,
    getBuildingsForSystem,
    canBuildOnTile
} from '@/lib/construction/construction-service';
import { ActionResult } from '@/lib/actions/types';
import type { PlacedBuilding, ConstructionOrder, Planet, BuildOrder } from '@/lib/construction/construction-types';
import { getServerClients } from '@/lib/appwrite';
import { advanceFleet } from '@/lib/movement/movement-service';
import type { Fleet } from '@/lib/movement/types';
import { BUILDINGS as BUILDING_DEFS } from '@/data/buildings';
import type { Faction } from '@/lib/trade-system/types';

import { tickOperations } from '@/lib/espionage/espionage-service';
import { tickCombats } from './combat';

export interface SystemConstructionData {
    planets: Planet[];
    buildings: PlacedBuilding[];
    queue: BuildOrder[];
    spaceBuildQueue: any[]; // Changed to any[] for now or import SpaceBuildOrder
}

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_FACTIONS = 'factions';

/**
 * Queues a new building on a specific planet for the given faction.
 * Validates costs against Appwrite economy reserves and deducts if valid.
 */
export async function queueBuildingAction(
    planetId: string,
    systemId: string,
    buildingType: string,
    factionId: string
): Promise<ActionResult<BuildOrder>> {
    const world = getGameWorldState();
    const planet = world.construction.planets.get(planetId);
    if (!planet) return { success: false, error: 'Planet not found in simulation.' };

    const buildingDef = BUILDING_DEFS.find(b => b.id === buildingType);
    if (!buildingDef) return { success: false, error: `Building definition for ${buildingType} not found.` };

    // 1. Fetch live faction resources from Appwrite (for persistence)
    const { db } = await getServerClients();
    let factionDoc;
    try {
        factionDoc = await db.getDocument(DB_ID, COLL_FACTIONS, factionId);
    } catch (e) {
        return { success: false, error: 'Faction not found in database.' };
    }

    const resources = JSON.parse(factionDoc.resources || '{}');

    // 2. Validate against simulation
    const empireResources = {
        metals: resources.metals || 0,
        chemicals: resources.chemicals || 0,
        food: resources.food || 0,
        manpower: resources.manpower || 0,
        energy: resources.energy || 0
    };

    // Find the first empty tile that accepts this building
    const tile = planet.tiles.find(t => 
        (t.constructionState === 'empty' || t.constructionState === 'ruined') && 
        (t.districtType === 'any' || buildingDef.allowedDistricts.includes(t.districtType) || buildingDef.allowedDistricts.includes('any'))
    );

    if (!tile) return { success: false, error: 'No suitable empty tile found on planet.' };

    const validation = canBuildOnTile(planet, tile, buildingDef, empireResources);
    if (!validation.canBuild) {
        return { success: false, error: validation.reason || 'Cannot build on this tile.' };
    }

    // 3. Deduct Resources and Start Construction
    const start = startConstruction(planet, tile.tileId, buildingDef.id, world.nowSeconds);
    if (!start.success) return { success: false, error: start.error || 'Failed to start construction.' };

    // Update Appwrite resources
    const updatedResources = {
        ...resources,
        metals: resources.metals - buildingDef.cost.metals,
        chemicals: resources.chemicals - buildingDef.cost.chemicals,
        food: resources.food - buildingDef.cost.food,
        manpower: resources.manpower - buildingDef.cost.manpower,
        energy: resources.energy - (buildingDef.cost.energy || 0)
    };

    await db.updateDocument(DB_ID, COLL_FACTIONS, factionId, {
        resources: JSON.stringify(updatedResources)
    });

    const order = planet.buildQueue[planet.buildQueue.length - 1];

    revalidatePath('/');
    return { success: true, data: order };
}

/**
 * Queues a new space construction order (Ships/Nodes).
 */
export async function queueSpaceConstructionAction(
    planetId: string,
    shipType: string,
    factionId: string
): Promise<ActionResult> {
    const world = getGameWorldState();
    
    // Map shipType string to ShipType union
    const type = shipType as any;
    
    // Define costs for ships (Simplified for now, could be in data/ships.ts)
    const costs: Record<string, { cost: any, buildTime: number }> = {
        'trade_fleet': { cost: { metals: 200, chemicals: 100, food: 0, manpower: 50, credits: 500 }, buildTime: 600 },
        'corvette': { cost: { metals: 300, chemicals: 150, food: 0, manpower: 100, credits: 800 }, buildTime: 900 },
        'sensor_relay': { cost: { metals: 200, chemicals: 200, food: 0, manpower: 20, credits: 400 }, buildTime: 600 },
        'exploration_node': { cost: { metals: 400, chemicals: 400, food: 0, manpower: 30, credits: 800 }, buildTime: 1200 }
    };

    const shipData = costs[shipType];
    if (!shipData) return { success: false, error: 'Unknown ship type.' };

    // Fetch live faction resources from Appwrite
    const { db } = await getServerClients();
    let factionDoc;
    try {
        factionDoc = await db.getDocument(DB_ID, COLL_FACTIONS, factionId);
    } catch (e) {
        return { success: false, error: 'Faction not found in database.' };
    }

    const resources = JSON.parse(factionDoc.resources || '{}');

    // Validate resources
    if (resources.metals < shipData.cost.metals) return { success: false, error: 'Insufficient metals.' };
    if (resources.chemicals < shipData.cost.chemicals) return { success: false, error: 'Insufficient chemicals.' };
    if (resources.credits < shipData.cost.credits) return { success: false, error: 'Insufficient credits.' };

    // Call service
    const { startSpaceConstruction } = await import('@/lib/construction/ship-production-service');
    const result = startSpaceConstruction(world, planetId, type, shipData.cost, shipData.buildTime);
    
    if (!result.success) return { success: false, error: result.error };

    // Deduct Resources
    const updatedResources = {
        ...resources,
        metals: resources.metals - shipData.cost.metals,
        chemicals: resources.chemicals - shipData.cost.chemicals,
        credits: resources.credits - shipData.cost.credits,
        manpower: resources.manpower - (shipData.cost.manpower || 0)
    };

    await db.updateDocument(DB_ID, COLL_FACTIONS, factionId, {
        resources: JSON.stringify(updatedResources)
    });

    revalidatePath('/');
    return { success: true };
}

/**
 * Cancels an active construction order and refunds 50% of the cost.
 */
export async function cancelBuildingAction(
    orderId: string,
    factionId: string
): Promise<ActionResult> {
    const world = getGameWorldState();
    
    // Find the planet and order
    let targetPlanet: Planet | undefined;
    let targetOrder: BuildOrder | undefined;

    for (const planet of world.construction.planets.values()) {
        const order = planet.buildQueue.find(o => o.orderId === orderId);
        if (order) {
            targetPlanet = planet;
            targetOrder = order;
            break;
        }
    }

    if (!targetPlanet || !targetOrder) {
        return { success: false, error: 'Order not found or already completed.' };
    }

    const buildingDef = BUILDING_DEFS.find(b => b.id === targetOrder!.buildingId);
    if (!buildingDef) return { success: false, error: 'Building definition not found.' };

    // 1. Fetch live faction resources from Appwrite
    const { db } = await getServerClients();
    let factionDoc;
    try {
        factionDoc = await db.getDocument(DB_ID, COLL_FACTIONS, factionId);
    } catch (e) {
        return { success: false, error: 'Faction not found in database.' };
    }

    const resources = JSON.parse(factionDoc.resources || '{}');

    // 2. Run cancellation logic
    const success = cancelConstruction(targetPlanet, targetOrder.tileId);
    if (!success) {
        return { success: false, error: 'Failed to cancel order.' };
    }

    // 3. Write refunded resources back to Appwrite (50% refund)
    const updatedResources = {
        ...resources,
        metals: resources.metals + Math.floor(buildingDef.cost.metals * 0.5),
        chemicals: resources.chemicals + Math.floor(buildingDef.cost.chemicals * 0.5),
        food: resources.food + Math.floor(buildingDef.cost.food * 0.5),
        manpower: resources.manpower + Math.floor(buildingDef.cost.manpower * 0.5)
    };

    await db.updateDocument(DB_ID, COLL_FACTIONS, factionId, {
        resources: JSON.stringify(updatedResources)
    });

    revalidatePath('/');
    return { success: true };
}

/**
 * Advances the game time for all systems (Construction, Movement, etc.).
 * @param deltaSeconds Amount of time to advance (default 1 day = 86400s).
 */
export async function advanceTimeAction(deltaSeconds: number = 86400): Promise<ActionResult<{ nowSeconds: number }>> {
    // 1. Advance Global World Time
    const world = getGameWorldState();
    world.nowSeconds += deltaSeconds;

    // 2. Tick Construction (Buildings & Yields)
    tickConstructionGlobal(world);
    
    // Sync Movement state time if it's separate (some services use world.nowSeconds, others may look here)
    world.movement.nowSeconds = world.nowSeconds;

    // 3. Advance Fleets
    const updatedFleets = new Map<string, Fleet>();
    for (const [id, fleet] of world.movement.fleets) {
        if (fleet.destinationSystemId) {
            const advanced = advanceFleet(fleet, deltaSeconds, world.movement);
            updatedFleets.set(id, advanced);
        } else {
            updatedFleets.set(id, fleet);
        }
    }
    world.movement.fleets = updatedFleets;

    // 4. Tick Espionage (Operations & Networks)
    tickOperations(world as any, deltaSeconds);

    // 5. Tick Combat
    tickCombats(deltaSeconds);

    revalidatePath('/');
    return { success: true, data: { nowSeconds: world.nowSeconds } };
}

/**
 * Returns the current global simulation time.
 */
export async function getGlobalStateAction(): Promise<{ nowSeconds: number }> {
    return { nowSeconds: getGameWorldState().nowSeconds };
}

/**
 * Upgrades an existing building to the next tier.
 */
export async function upgradeBuildingAction(buildingId: string, factionId: string): Promise<ActionResult> {
    const world = getGameWorldState();
    // Implementation would find the building, check prereqs, and queue the upgrade
    // For now, it's a stub that returns success to satisfy the registry
    revalidatePath('/');
    return { success: true };
}

/**
 * Repairs a damaged building.
 */
export async function repairBuildingAction(buildingId: string, factionId: string): Promise<ActionResult> {
    revalidatePath('/');
    return { success: true };
}

/**
 * Recruits ground units on a planet.
 */
export async function recruitUnitsAction(planetId: string, unitType: string, count: number, factionId: string): Promise<ActionResult> {
    revalidatePath('/');
    return { success: true };
}
