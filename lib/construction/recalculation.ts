import { Planet, PlanetStats, BuildingDefinition, PlanetTile, Modifier } from './construction-types';
import { BUILDINGS } from '../../data/buildings';

/**
 * Aggregates all modifiers and recalculates planet-wide stats.
 */
export function recalculatePlanetStats(planet: Planet): PlanetStats {
  const stats: PlanetStats = {
    metalsOutput: 0,
    chemicalsOutput: 0,
    foodOutput: 0,
    energyOutput: 0,
    manpowerOutput: 0,
    researchOutput: 0,
    stability: 50, // base
    happiness: 50, // base
    defenseStrength: 0,
    espionageResistance: 0,
    constructionSpeedModifier: 1.0,
    shipProductionModifier: 1.0,
    troopRecruitmentModifier: 1.0,
  };

  // 1. Process Active Buildings
  planet.tiles.forEach(tile => {
    if (tile.constructionState === 'active' && tile.buildingId) {
      const buildingDef = BUILDINGS.find(b => b.id === tile.buildingId);
      if (buildingDef) {
        // Enforce Tag Requirements
        if (buildingDef.tagRequirements && buildingDef.tagRequirements.length > 0) {
          const hasAllTags = buildingDef.tagRequirements.every(req => planet.tags.includes(req));
          if (!hasAllTags) return; // Skip effects if requirements not met
        }

        // Apply Base Effects
        applyBuildingEffects(stats, buildingDef);

        // Apply District Bonuses
        const districtBonus = getDistrictBonus(tile, buildingDef);
        applyDistrictBonus(stats, buildingDef, districtBonus);
      }
    }
  });

  // 2. Apply Planet Type Base Modifiers
  applyPlanetTypeBaseModifiers(stats, planet.planetType);

  // 3. Determine and Apply Specialization
  const spec = determinePlanetSpecialization(planet);
  planet.specialization = spec;
  if (spec) {
    applySpecializationModifier(stats, spec);
  }

  // 3. Apply Active Planet Modifiers (from events, etc.)
  planet.activeModifiers.forEach(mod => {
    applyModifier(stats, mod);
  });

  // Final Clamping
  stats.stability = Math.max(0, Math.min(100, stats.stability));
  stats.happiness = Math.max(0, Math.min(100, stats.happiness));

  return stats;
}

function applyBuildingEffects(stats: PlanetStats, building: BuildingDefinition) {
  building.effects.forEach(effect => {
    switch (effect.type) {
      case 'metals_output': stats.metalsOutput += effect.value; break;
      case 'chemicals_output': stats.chemicalsOutput += effect.value; break;
      case 'food_output': stats.foodOutput += effect.value; break;
      case 'energy_output': stats.energyOutput += effect.value; break;
      case 'manpower_output': stats.manpowerOutput += effect.value; break;
      case 'research_output': stats.researchOutput += effect.value; break;
      case 'stability': stats.stability += effect.value; break;
      case 'happiness': stats.happiness += effect.value; break;
      case 'defense_power': stats.defenseStrength += effect.value; break;
      case 'espionage_defense': stats.espionageResistance += effect.value; break;
      case 'construction_speed_percent': stats.constructionSpeedModifier += (effect.value / 100); break;
      case 'ship_production_speed': stats.shipProductionModifier += (effect.value / 100); break;
      case 'troop_recruitment_modifier': stats.troopRecruitmentModifier += (effect.value / 100); break;
      case 'troop_capacity': /* logic for capacity might happen elsewhere but we can track it here if needed */ break;
    }
  });
}

/**
 * District Bonus Logic:
 * - industrial building on industrial district = +15% output
 * - research building on research district = +15% research
 * - military building on military district = +15% training or defense
 * - society building on civilian district = +10 stability or happiness
 */
export function getDistrictBonus(tile: PlanetTile, buildingDef: BuildingDefinition): number {
  if (tile.districtType === 'any') return 0;

  if (buildingDef.category === 'resource' || buildingDef.category === 'industrial') {
    if (tile.districtType === 'industrial') return 0.15;
  }
  if (buildingDef.category === 'research' && tile.districtType === 'research') return 0.15;
  if (buildingDef.category === 'military' && tile.districtType === 'military') return 0.15;
  if (buildingDef.category === 'society' && tile.districtType === 'civilian') return 0.10;

  return 0;
}

function applyDistrictBonus(stats: PlanetStats, building: BuildingDefinition, bonus: number) {
  if (bonus === 0) return;

  building.effects.forEach(effect => {
    const bonusValue = effect.value * bonus;
    switch (effect.type) {
      case 'metals_output': stats.metalsOutput += bonusValue; break;
      case 'chemicals_output': stats.chemicalsOutput += bonusValue; break;
      case 'food_output': stats.foodOutput += bonusValue; break;
      case 'energy_output': stats.energyOutput += bonusValue; break;
      case 'research_output': stats.researchOutput += bonusValue; break;
    }
  });
}

/**
 * Pathfinding/Specialization Logic:
 * If a planet has 4 or more active buildings from the same strategic family, assign a specialization.
 */
export function determinePlanetSpecialization(planet: Planet): string | null {
  const categoryCounts: Record<string, number> = {};
  
  planet.tiles.forEach(tile => {
    if (tile.constructionState === 'active' && tile.buildingId) {
      const buildingDef = BUILDINGS.find(b => b.id === tile.buildingId);
      if (buildingDef) {
        categoryCounts[buildingDef.category] = (categoryCounts[buildingDef.category] || 0) + 1;
      }
    }
  });

  if (categoryCounts['industrial'] >= 4 || categoryCounts['resource'] >= 4) return 'Industrial World';
  if (categoryCounts['research'] >= 4) return 'Research World';
  if (categoryCounts['military'] >= 4 || categoryCounts['defense'] >= 4) return 'Fortress World';
  if (categoryCounts['resource'] >= 4 && categoryCounts['resource_type_food'] >= 2) return 'Agricultural World'; // Simplified
  if (categoryCounts['society'] >= 4) return 'Civilian Core';

  return null;
}

function applySpecializationModifier(stats: PlanetStats, spec: string) {
  switch (spec) {
    case 'Industrial World':
      stats.constructionSpeedModifier += 0.25;
      stats.shipProductionModifier += 0.20;
      break;
    case 'Research World':
      stats.researchOutput *= 1.25; // +25%
      break;
    case 'Fortress World':
      stats.defenseStrength *= 1.30; // +30%
      break;
    case 'Agricultural World':
      stats.foodOutput *= 1.25; // +25%
      break;
    case 'Civilian Core':
      stats.stability += 15;
      stats.happiness += 10;
      break;
  }
}

function applyPlanetTypeBaseModifiers(stats: PlanetStats, planetType: string) {
  switch (planetType) {
    case 'prison':
      stats.manpowerOutput += 30;
      stats.stability -= 15;
      break;
    case 'resort':
      stats.happiness += 20;
      stats.researchOutput += 10;
      stats.metalsOutput -= 15;
      stats.foodOutput -= 15;
      break;
    case 'hive':
      stats.manpowerOutput += 50;
      stats.metalsOutput += 20;
      stats.stability -= 20;
      stats.happiness -= 15;
      break;
    case 'tomb':
      stats.researchOutput += 30;
      stats.happiness -= 10;
      break;
    case 'ocean':
      stats.foodOutput += 30;
      stats.metalsOutput -= 10;
      break;
    case 'arctic':
      stats.chemicalsOutput += 25;
      stats.foodOutput -= 10;
      break;
    case 'desert':
      stats.metalsOutput += 25;
      stats.foodOutput -= 15;
      break;
  }
}

function applyModifier(stats: PlanetStats, mod: Modifier) {
  // Logic to apply various modifier types
  // This would depend on the modifier system's schema
}
