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
import { recalculatePlanetStats } from './recalculation';
import { constructionLogisticsMultiplier } from '../logistics/distribution-service';
import { computeInfrastructureEffects } from '../infrastructure/infrastructure-service';
import { getTechModifier } from '../tech/modifiers';

/**
 * Validates if a building can be built on a specific tile.
 */
export function canBuildOnTile(
  planet: Planet,
  tile: PlanetTile,
  buildingDef: BuildingDefinition,
  empireResources: { metals: number; chemicals: number; food: number; manpower: number },
  unlockedTechIds: Set<string> = new Set(),
  playerCivilizationId?: string
): { canBuild: boolean; reason?: string } {
  // 0. Civilization check
  if (buildingDef.civilizationId && buildingDef.civilizationId !== playerCivilizationId) {
    return { canBuild: false, reason: `This building is unique to the ${buildingDef.civilizationId} civilization` };
  }

  // 1. Tech check
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

// ── Build slots ───────────────────────────────────────────────────────────────
// A world works on a few sites at once, not all of them. Every planet has two
// slots; each Builder Outpost (construction_yard) adds one, up to five more.
// Orders past the cap still go through — materials paid, tile reserved — but
// wait in the queue and start when a slot frees. Playtesters asked for exactly
// this: "only build a few things at a time, and outposts to raise it".
export const BASE_BUILD_SLOTS = 2;
export const BUILD_SLOT_BUILDING_ID = 'construction_yard';
export const MAX_EXTRA_BUILD_SLOTS = 5;

export function buildSlotsFor(planet: Planet): number {
  const yards = planet.tiles.filter(t => t.buildingId === BUILD_SLOT_BUILDING_ID && t.constructionState === 'active').length;
  return BASE_BUILD_SLOTS + Math.min(MAX_EXTRA_BUILD_SLOTS, yards);
}

/** Orders whose clock is running (not waiting for a slot). */
export function activeBuildCount(planet: Planet): number {
  return planet.buildQueue.filter(q => !q.queued).length;
}

/** Seconds a building takes on this planet right now, all speed modifiers applied. */
function buildSecondsFor(planet: Planet, buildingDef: BuildingDefinition, world?: any): number {
  const stats = recalculatePlanetStats(planet);
  // Clamp the speed modifier to a small positive floor. A modifier of 0 produced
  // Infinity (the building never completes); a negative one produced a completion time
  // in the past (instant build). Either way the queue broke.
  // Site haulage scales it: materials still have to reach the site.
  const buildSpeed = Math.max(0.05, stats.constructionSpeedModifier
    * constructionLogisticsMultiplier(planet)
    * computeInfrastructureEffects(planet).constructionSpeed
    * getTechModifier(world, planet.ownerId, 'construction_speed'));
  return buildingDef.buildTimeSeconds / buildSpeed;
}

/**
 * Starts construction on a tile — or queues it when every build slot is busy.
 */
export function startConstruction(
  planet: Planet,
  tileId: string,
  buildingId: string,
  now: number,
  /** Optional — supplies the owner's researched construction_speed modifier.
   *  Omitted by unit fixtures, which then build at the untouched base rate. */
  world?: any
): { success: boolean; error?: string; queued?: boolean } {
  const tile = planet.tiles.find(t => t.tileId === tileId);
  if (!tile) return { success: false, error: 'Tile not found' };

  const buildingDef = BUILDINGS.find(b => b.id === buildingId);
  if (!buildingDef) return { success: false, error: 'Building definition not found' };

  // Slots full: reserve the tile and wait. The tick promotes it when one frees.
  if (activeBuildCount(planet) >= buildSlotsFor(planet)) {
    tile.constructionState = 'under_construction';
    tile.buildingId = buildingId;
    tile.constructionCompleteAt = null;
    planet.buildQueue.push({
      orderId: `order_${Math.random().toString(36).substr(2, 9)}`,
      buildingId,
      tileId,
      planetId: planet.id,
      startedAtSeconds: now,
      completesAtSeconds: 0,
      queued: true,
    });
    return { success: true, queued: true };
  }

  // Note: Resource subtraction should happen in the calling action/service that has access to empire state.
  
  tile.constructionState = 'under_construction';
  tile.buildingId = buildingId;
  
  const buildTime = buildSecondsFor(planet, buildingDef, world);
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
export function processConstructionQueue(planet: Planet, now: number, world?: any): string[] {
  const completedTiles: string[] = [];
  const remainingQueue: BuildOrder[] = [];

  for (const order of planet.buildQueue) {
    if (!order.queued && now >= order.completesAtSeconds) {
      completeConstruction(planet, order.tileId);
      completedTiles.push(order.tileId);
    } else {
      remainingQueue.push(order);
    }
  }

  planet.buildQueue = remainingQueue;

  // Promote waiting orders, oldest first, into whatever slots just opened.
  // Build time is priced now, not at order time, so a Builder Outpost or a
  // road finished in the meantime shortens the wait.
  const slots = buildSlotsFor(planet);
  for (const order of planet.buildQueue) {
    if (!order.queued) continue;
    if (activeBuildCount(planet) >= slots) break;
    const def = BUILDINGS.find(b => b.id === order.buildingId);
    const tile = planet.tiles.find(t => t.tileId === order.tileId);
    if (!def || !tile) { order.queued = false; order.completesAtSeconds = now; continue; }
    const completesAt = now + buildSecondsFor(planet, def, world);
    order.queued = false;
    order.startedAtSeconds = now;
    order.completesAtSeconds = completesAt;
    tile.constructionCompleteAt = completesAt;
  }

  return completedTiles;
}

import { tickSpaceConstruction } from './ship-production-service';
import { tickOrbitalGlobal } from '../orbital/orbital-service';
import { GameWorldState } from '../game-world-state';

/**
 * Global tick for the construction system.
 * Processes the build queue for all planets, the orbital layer, and the space
 * build queue.
 */
export function tickConstructionGlobal(world: GameWorldState, deltaSeconds = 0): void {
  const now = world.nowSeconds;

  // 1. Process planetary build queues
  for (const planet of world.construction.planets.values()) {
    processConstructionQueue(planet, now, world);
  }

  // 2. Orbital layer: finish structures and repair battle damage
  tickOrbitalGlobal(world, deltaSeconds);

  // 3. Process space build queue
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
  const stats = recalculatePlanetStats(planet);
  const buildSpeed = Math.max(0.05, stats.constructionSpeedModifier
    * constructionLogisticsMultiplier(planet)
    * computeInfrastructureEffects(planet).constructionSpeed);
  const repairTime = (buildingDef.buildTimeSeconds / 2) / buildSpeed;
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
