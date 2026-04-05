// lib/construction/ship-production-service.ts

import { 
  SpaceBuildOrder, 
  ShipType, 
  ConstructionWorldState, 
  BuildingCost 
} from './construction-types';
import { MovementWorldState, Fleet, HyperdriveProfile } from '../movement/types';
import { GameWorldState } from '../game-world-state';

/**
 * Initiates a space construction order.
 */
export function startSpaceConstruction(
  world: GameWorldState,
  planetId: string,
  shipType: ShipType,
  cost: BuildingCost,
  buildTimeSeconds: number
): { success: boolean; order?: SpaceBuildOrder; error?: string } {
  const planet = world.construction.planets.get(planetId);
  if (!planet) return { success: false, error: 'Planet not found' };

  // Check if planet has a shipyard
  const hasShipyard = planet.tiles.some(t => 
    (t.buildingId === 'orbital_shipyard' || t.buildingId === 'fleet_drydock') && 
    t.constructionState === 'active'
  );

  if (!hasShipyard) {
    return { success: false, error: 'Planet does not have an active shipyard' };
  }

  // Resource subtraction should be handled by the caller (server action)

  const order: SpaceBuildOrder = {
    orderId: `ship_${Math.random().toString(36).substr(2, 9)}`,
    shipType,
    planetId,
    systemId: planet.systemId,
    startedAtSeconds: world.nowSeconds,
    completesAtSeconds: world.nowSeconds + buildTimeSeconds,
    cost
  };

  world.construction.spaceBuildQueue.push(order);

  return { success: true, order };
}

/**
 * Processes the space build queue.
 */
export function tickSpaceConstruction(world: GameWorldState): string[] {
  const completedOrders: SpaceBuildOrder[] = [];
  const remainingQueue: SpaceBuildOrder[] = [];

  for (const order of world.construction.spaceBuildQueue) {
    if (world.nowSeconds >= order.completesAtSeconds) {
      completedOrders.push(order);
      finalizeShipProduction(world, order);
    } else {
      remainingQueue.push(order);
    }
  }

  world.construction.spaceBuildQueue = remainingQueue;
  return completedOrders.map(o => o.orderId);
}

/**
 * Finalizes production by spawning the fleet or node in the movement system.
 */
function finalizeShipProduction(world: GameWorldState, order: SpaceBuildOrder): void {
  const factionId = world.construction.planets.get(order.planetId)?.ownerId || 'unknown';

  if (order.shipType === 'sensor_relay' || order.shipType === 'exploration_node') {
    // Logic for sensor relays: they might be static sensor sources or specific fleet types
    spawnSensorRelay(world, order.systemId, factionId);
  } else {
    // Normal fleet production
    spawnFleet(world, order.systemId, factionId, order.shipType);
  }
}

function spawnFleet(world: GameWorldState, systemId: string, factionId: string, shipType: ShipType): void {
  const fleetId = `fleet_${Math.random().toString(36).substr(2, 9)}`;
  
  const defaultProfile: HyperdriveProfile = {
    hyperlane: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 },
    trade: { speedMultiplier: 1.2, detectabilityMultiplier: 1, supplyStrainMultiplier: 0.8 },
    corridor: { speedMultiplier: 1.5, detectabilityMultiplier: 1, supplyStrainMultiplier: 1.2 },
    gate: { speedMultiplier: 10, detectabilityMultiplier: 1, supplyStrainMultiplier: 2 },
    deepSpace: { speedMultiplier: 0.5, detectabilityMultiplier: 1, supplyStrainMultiplier: 3 }
  };

  const newFleet: Fleet = {
    id: fleetId,
    factionId,
    name: `${shipType.replace('_', ' ').toUpperCase()} Task Force`,
    currentSystemId: systemId,
    destinationSystemId: null,
    activeLayer: null,
    transitProgress: 0,
    etaSeconds: 0,
    plannedPath: [],
    orders: [],
    doctrine: {
      type: 'Defensive',
      deviationFromPosture: 0,
      preferredLayers: ['hyperlane', 'trade'],
      retreatThreshold: 0.3,
      logisticsStrain: 0,
      moraleDrift: 0,
      supplyLevel: 1
    },
    postureId: 'Consolidating',
    strength: 1.0,
    basePower: 100,
    composition: {},
    hyperdriveProfile: defaultProfile,
    isDetectable: true
  };

  world.movement.fleets.set(fleetId, newFleet);
}

function spawnSensorRelay(world: GameWorldState, systemId: string, factionId: string): void {
    // Add a sensor source to the system
    const sensorId = `sensor_${Math.random().toString(36).substr(2, 9)}`;
    world.movement.sensorSources.push({
        id: sensorId,
        kind: 'outpost', // We treat stationary relays as outposts for simplicity
        factionId,
        systemId,
        detectionRadius: 2, // Large detection radius
        detectionStrength: 0.8
    });
}
