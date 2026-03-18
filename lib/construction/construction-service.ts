import { 
  BuildingDefinition, 
  Planet, 
  PlanetTile, 
  BuildOrder, 
  ConstructionOrder,
  ConstructionState,
  PlanetStats,
  Modifier,
  PlacedBuilding
} from './construction-types';
import { BUILDINGS } from '../../data/buildings';

/**
 * Validates if a building can be built on a specific tile.
 */
export function canBuildOnTile(
  planet: Planet,
  tile: PlanetTile,
  buildingDef: BuildingDefinition,
  empireResources: { metals: number; chemicals: number; food: number; manpower: number },
  unlockedTechIds: Set<string> = new Set()
): { canBuild: boolean; reason?: string } {
  // 0. Tech check
  if (buildingDef.techRequired && !unlockedTechIds.has(buildingDef.techRequired)) {
    return { canBuild: false, reason: `Technology '${buildingDef.techRequired}' required` };
  }

  // 1. Tile must be empty
  if (tile.constructionState !== 'empty' && tile.constructionState !== 'ruined') {
    return { canBuild: false, reason: 'Tile is not empty' };
  }

  // 2. Infrastructure level must meet requirement
  if (planet.infrastructureLevel < buildingDef.infrastructureRequired) {
    return { canBuild: false, reason: `Infrastructure level ${buildingDef.infrastructureRequired} required` };
  }

  // 3. Empire must have enough resources
  if (empireResources.metals < buildingDef.cost.metals) return { canBuild: false, reason: 'Insufficient metals' };
  if (empireResources.chemicals < buildingDef.cost.chemicals) return { canBuild: false, reason: 'Insufficient chemicals' };
  if (empireResources.food < buildingDef.cost.food) return { canBuild: false, reason: 'Insufficient food' };
  if (empireResources.manpower < buildingDef.cost.manpower) return { canBuild: false, reason: 'Insufficient manpower' };

  // 4. Building must be allowed in that district
  if (tile.districtType !== 'any' && !buildingDef.allowedDistricts.includes(tile.districtType) && !buildingDef.allowedDistricts.includes('any')) {
    return { canBuild: false, reason: `Building not allowed in ${tile.districtType} district` };
  }

  // 5. Unique per planet check
  if (buildingDef.uniquePerPlanet) {
    const alreadyExists = planet.tiles.some(t => t.buildingId === buildingDef.id && t.constructionState !== 'ruined');
    const inQueue = planet.buildQueue.some(q => q.buildingId === buildingDef.id);
    if (alreadyExists || inQueue) {
      return { canBuild: false, reason: 'Already exists on planet' };
    }
  }

  // 6. Unique per empire check (simplified: usually handled at a higher level, but included here for completeness)
  // This would require checking all planets, which we don't have access to here.
  // Assuming higher level logic handles this.

  return { canBuild: true };
}

/**
 * Starts construction on a tile.
 */
export function startConstruction(
  planet: Planet,
  tileId: string,
  buildingId: string,
  now: number
): { success: boolean; error?: string } {
  const tile = planet.tiles.find(t => t.tileId === tileId);
  if (!tile) return { success: false, error: 'Tile not found' };

  const buildingDef = BUILDINGS.find(b => b.id === buildingId);
  if (!buildingDef) return { success: false, error: 'Building definition not found' };

  // Note: Resource subtraction should happen in the calling action/service that has access to empire state.
  
  tile.constructionState = 'under_construction';
  tile.buildingId = buildingId;
  
  const buildTime = buildingDef.buildTimeSeconds; // TODO: Factor in planet construction speed mod
  const completionTime = now + buildTime;
  tile.constructionCompleteAt = completionTime;

  const order: BuildOrder = {
    orderId: `order_${Math.random().toString(36).substr(2, 9)}`,
    buildingId: buildingId,
    tileId: tileId,
    planetId: planet.id,
    startedAtSeconds: now,
    completesAtSeconds: completionTime
  };

  planet.buildQueue.push(order);

  return { success: true };
}

/**
 * Cancels construction.
 */
export function cancelConstruction(planet: Planet, tileId: string): boolean {
  const tile = planet.tiles.find(t => t.tileId === tileId);
  if (!tile || tile.constructionState !== 'under_construction') return false;

  tile.constructionState = 'empty';
  tile.buildingId = null;
  tile.constructionCompleteAt = null;

  planet.buildQueue = planet.buildQueue.filter(q => q.tileId !== tileId);

  return true;
}

/**
 * Completes construction on a tile.
 */
export function completeConstruction(planet: Planet, tileId: string): boolean {
  const tile = planet.tiles.find(t => t.tileId === tileId);
  if (!tile || tile.constructionState !== 'under_construction') return false;

  tile.constructionState = 'active';
  tile.constructionCompleteAt = null;
  
  planet.buildQueue = planet.buildQueue.filter(q => q.tileId !== tileId);

  // Stats should be recalculated after this
  return true;
}

/**
 * Processes completed construction orders.
 */
export function processConstructionQueue(planet: Planet, now: number): string[] {
  const completedTiles: string[] = [];
  const remainingQueue: BuildOrder[] = [];

  for (const order of planet.buildQueue) {
    if (now >= order.completesAtSeconds) {
      completeConstruction(planet, order.tileId);
      completedTiles.push(order.tileId);
    } else {
      remainingQueue.push(order);
    }
  }

  planet.buildQueue = remainingQueue;
  return completedTiles;
}

import { tickSpaceConstruction } from './ship-production-service';
import { GameWorldState } from '../game-world-state';

/**
 * Global tick for the construction system.
 * Processes the build queue for all planets and space build queue.
 */
export function tickConstructionGlobal(world: GameWorldState): void {
  const now = world.nowSeconds;
  
  // 1. Process planetary build queues
  for (const planet of world.construction.planets.values()) {
    processConstructionQueue(planet, now);
  }

  // 2. Process space build queue
  tickSpaceConstruction(world);
}

/**
 * Damages a building on a tile.
 */
export function ruinBuilding(planet: Planet, tileId: string): boolean {
  const tile = planet.tiles.find(t => t.tileId === tileId);
  if (!tile || tile.constructionState !== 'active') return false;

  tile.constructionState = 'ruined';
  return true;
}

/**
 * Returns all active buildings and queue items for a given system.
 * Aggregates across all planets in that system.
 */
export function getBuildingsForSystem(systemId: string, state: { planets: Map<string, Planet> }): { buildings: PlacedBuilding[]; queue: BuildOrder[] } {
  const buildings: PlacedBuilding[] = [];
  const queue: BuildOrder[] = [];

  for (const planet of state.planets.values()) {
    if (planet.systemId === systemId) {
      // Aggregate buildings from tiles
      for (const tile of planet.tiles) {
        if (tile.buildingId && (tile.constructionState === 'active' || tile.constructionState === 'ruined')) {
          buildings.push({
            id: `bldg_${tile.tileId}`,
            buildingId: tile.buildingId,
            type: tile.buildingId,
            tileId: tile.tileId,
            planetId: planet.id,
            status: tile.constructionState === 'active' ? 'operational' : 'ruined'
          });
        }
      }
      // Aggregate queue
      for (const order of planet.buildQueue) {
        queue.push({
          ...order,
          planetId: planet.id // Ensure planetId is included
        });
      }
    }
  }

  return { buildings, queue };
}

/**
 * Repairs a ruined building.
 */
export function repairBuilding(planet: Planet, tileId: string, now: number): boolean {
  const tile = planet.tiles.find(t => t.tileId === tileId);
  if (!tile || tile.constructionState !== 'ruined') return false;

  const buildingDef = BUILDINGS.find(b => b.id === tile.buildingId);
  if (!buildingDef) return false;

  // Repairs take half the time and cost? (Conceptual)
  const repairTime = buildingDef.buildTimeSeconds / 2;
  tile.constructionState = 'under_construction';
  tile.constructionCompleteAt = now + repairTime;

  planet.buildQueue.push({
    orderId: `repair_${Math.random().toString(36).substr(2, 9)}`,
    buildingId: tile.buildingId!,
    tileId: tileId,
    planetId: planet.id,
    startedAtSeconds: now,
    completesAtSeconds: now + repairTime
  });

  return true;
}

/**
 * Upgrades infrastructure level.
 */
export function upgradeInfrastructure(planet: Planet, now: number): boolean {
  if (planet.infrastructureLevel >= 5) return false;

  // conceptual: this would also be a build order
  planet.infrastructureLevel++;
  return true;
}
