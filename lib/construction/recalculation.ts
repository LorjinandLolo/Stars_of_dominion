import { Planet, PlanetStats, BuildingDefinition, PlanetTile, Modifier } from './construction-types';
import { BUILDINGS } from '../../data/buildings';
import { computeInfrastructureEffects } from '../infrastructure/infrastructure-service';
import { computeSpecializationEffects } from '../specialization/specialization-effects';

/**
 * Aggregates all modifiers and recalculates planet-wide stats.
 */
export function recalculatePlanetStats(planet: Planet, nowSeconds = 0): PlanetStats {
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

  // 3. Apply the world's DECLARED specialization.
  // This used to infer one from building counts and write it onto the planet as a
  // side effect of recomputing stats, which meant a player could never choose.
  // The inference survives as `suggestSpecialization`, an advisory hint only.
  applySpecializationEffects(stats, planet, nowSeconds);

  // 3½. Infrastructure network: a wired, powered, watered world is a calmer one.
  stats.stability += computeInfrastructureEffects(planet).stability;

  // 4. Apply Active Planet Modifiers (from events, etc.)
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
 * Apply the effects of the world's declared specialization to its stats.
 * Multipliers scale the output that buildings and planet type have already
 * produced; flats are added on top.
 */
function applySpecializationEffects(stats: PlanetStats, planet: Planet, nowSeconds: number) {
  const effects = computeSpecializationEffects(planet, nowSeconds);
  if (Object.keys(effects).length === 0) return;

  stats.metalsOutput *= effects.metalsOutput ?? 1;
  stats.chemicalsOutput *= effects.chemicalsOutput ?? 1;
  stats.foodOutput *= effects.foodOutput ?? 1;
  stats.energyOutput *= effects.energyOutput ?? 1;
  stats.manpowerOutput *= effects.manpowerOutput ?? 1;
  stats.researchOutput *= effects.researchOutput ?? 1;
  stats.defenseStrength *= effects.defenseStrength ?? 1;
  stats.constructionSpeedModifier *= effects.constructionSpeed ?? 1;
  stats.shipProductionModifier *= effects.shipProduction ?? 1;
  stats.troopRecruitmentModifier *= effects.troopRecruitment ?? 1;

  stats.stability += effects.stability ?? 0;
  stats.happiness += effects.happiness ?? 0;
  stats.espionageResistance += effects.espionageResistance ?? 0;
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
