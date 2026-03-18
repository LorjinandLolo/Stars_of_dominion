import { Planet, PlanetTile } from './construction-types';
import { canBuildOnTile, startConstruction, processConstructionQueue } from './construction-service';
import { recalculatePlanetStats } from './recalculation';
import { BUILDINGS } from '../../data/buildings';

function createTestPlanet(): Planet {
  const tiles: PlanetTile[] = [];
  for (let i = 0; i < 10; i++) {
    let districtType: any = 'any';
    if (i < 2) districtType = 'industrial';
    else if (i < 4) districtType = 'research';
    else if (i < 6) districtType = 'military';
    else if (i < 8) districtType = 'civilian';
    else if (i < 9) districtType = 'agricultural';

    tiles.push({
      tileId: `tile_${i}`,
      districtType,
      buildingId: null,
      constructionState: 'empty',
      constructionCompleteAt: null,
    });
  }

  return {
    id: 'test_planet_1',
    name: 'Neo Terra',
    ownerId: 'player_1',
    planetType: 'standard',
    infrastructureLevel: 2,
    stability: 50,
    happiness: 50,
    specialization: null,
    maxTiles: 10,
    tiles,
    buildQueue: [],
    activeModifiers: [],
  };
}

async function runTest() {
  console.log('--- Planetary Construction System Test ---');
  
  const planet = createTestPlanet();
  const resources = { metals: 2000, chemicals: 1000, food: 1000, manpower: 1000 };

  console.log('Initial Planet:', planet.name);
  console.log('Infrastructure Level:', planet.infrastructureLevel);

  // 1. Test build attempt (valid)
  const metalMine = BUILDINGS.find(b => b.id === 'metal_mine')!;
  const industrialTile = planet.tiles.find(t => t.districtType === 'industrial')!;
  
  const check = canBuildOnTile(planet, industrialTile, metalMine, resources);
  console.log('Can build Metal Mine on Industrial Tile:', check.canBuild);

  if (check.canBuild) {
    const start = startConstruction(planet, industrialTile.tileId, metalMine.id, 1000);
    console.log('Construction started:', start.success);
    console.log('Build Queue Size:', planet.buildQueue.length);
  }

  // 2. Test build attempt (invalid - infrastructure)
  const advancedInst = BUILDINGS.find(b => b.id === 'advanced_institute')!;
  const researchTile = planet.tiles.find(t => t.districtType === 'research')!;
  const check2 = canBuildOnTile(planet, researchTile, advancedInst, resources);
  console.log('Can build Advanced Institute (Req Level 4) on Level 2 Planet:', check2.canBuild, 'Reason:', check2.reason);

  // 3. Complete construction (Simulated)
  console.log('Simulating time passing...');
  processConstructionQueue(planet, 2000); // 1000 (start) + 300 (time) < 2000
  console.log('Construction State after time:', industrialTile.constructionState);
  console.log('Building ID on tile:', industrialTile.buildingId);

  // 4. Test Specialization
  console.log('Building 3 more industrial buildings to trigger specialization...');
  const habitat = BUILDINGS.find(b => b.id === 'habitat_block')!;
  const gym = BUILDINGS.find(b => b.id === 'media_network')!; // Society
  const factory = BUILDINGS.find(b => b.id === 'planetary_factory')!;
  
  // Quick hack to force buildings for test
  planet.tiles[1].buildingId = 'planetary_factory';
  planet.tiles[1].constructionState = 'active';
  planet.tiles[2].buildingId = 'metal_mine';
  planet.tiles[2].constructionState = 'active';
  planet.tiles[3].buildingId = 'chemical_plant';
  planet.tiles[3].constructionState = 'active';

  const statsAfter = recalculatePlanetStats(planet);
  console.log('--- Recalculated Stats ---');
  console.log('Metals Output:', statsAfter.metalsOutput);
  console.log('Specialization:', planet.specialization);
  console.log('Construction Speed Mod:', statsAfter.constructionSpeedModifier);

  // 5. Check District Bonus
  // Mine on industrial tile (tile[0]) gives 20 * 1.15 = 23?
  // Mine on non-industrial (tile[2]) gives 20
  // Total metals: 20 (tile 0) + 15% bonus + 20 (tile 2) = 23 + 20 = 43? 
  // Wait, my recalculateStats logic: stats.metalsOutput += effect.value; then applyDistrictBonus: stats.metalsOutput += effect.value * bonus;
  // So tile 0: 20 + (20 * 0.15) = 23.
  // Tile 2 (if not industrial): 20.
  // Total: 43.
  console.log('Expected Metals Output (2 mines, one with 15% bonus):', statsAfter.metalsOutput);
}

runTest();
