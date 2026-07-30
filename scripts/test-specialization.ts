// scripts/test-specialization.ts
// Phase 5 verification — player-chosen planet specialization: qualification,
// declaring, retooling, lockout, empire-uniqueness, effects, and the hooks into
// stats, storage, haulage and orbital resilience.
// Run: npx tsx scripts/test-specialization.ts

import type { Planet as ConstructionPlanet, PlanetTile } from '../lib/construction/construction-types';
import type { PlanetProduction } from '../lib/economy/economy-types';
import type { SpecializationId } from '../lib/specialization/specialization-types';
import {
    censusBuildings,
    checkQualification,
    availableSpecializations,
    canDeclareSpecialization,
    declareSpecialization,
    clearSpecialization,
    suggestSpecialization,
} from '../lib/specialization/specialization-service';
import {
    isRetooling,
    computeSpecializationEffects,
    specializationMultiplier,
} from '../lib/specialization/specialization-effects';
import {
    TRANSITION_SECONDS,
    SWITCH_LOCKOUT_SECONDS,
    SWITCH_COST_MULTIPLIER,
    TRANSITION_EFFECT_SCALE,
    TRANSITION_STABILITY_PENALTY,
} from '../lib/specialization/specialization-types';
import { SPECIALIZATIONS, SPECIALIZATION_BY_ID } from '../data/specializations';
import { recalculatePlanetStats } from '../lib/construction/recalculation';
import { computeStorageCapacity } from '../lib/logistics/storage-service';
import { updatePlanetLogistics } from '../lib/logistics/distribution-service';
import {
    startOrbitalConstruction,
    processOrbitalQueue,
    applyOrbitalDamage,
} from '../lib/orbital/orbital-service';
import { ensureInfrastructureNetwork, recomputeInfrastructureLevel } from '../lib/infrastructure/infrastructure-service';
import { INFRASTRUCTURE_TRACK_IDS } from '../lib/infrastructure/infrastructure-types';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = '') {
    if (condition) {
        passed++;
        console.log(`  PASS  ${label}`);
    } else {
        failed++;
        console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

function near(actual: number, expected: number, tolerance = 0.01): boolean {
    return Math.abs(actual - expected) <= Math.abs(expected) * tolerance + 1e-6;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTile(tileId: string, buildingId: string | null): PlanetTile {
    return {
        tileId,
        districtType: 'any',
        buildingId,
        constructionState: buildingId ? 'active' : 'empty',
        constructionCompleteAt: null,
    };
}

function makePlanet(id: string, infraLevel = 4, buildingIds: (string | null)[] = []): ConstructionPlanet {
    const planet: ConstructionPlanet = {
        id,
        name: id,
        ownerId: 'faction-a',
        systemId: 'sys-1',
        planetType: 'standard',
        infrastructureLevel: infraLevel,
        stability: 60,
        happiness: 60,
        specialization: null,
        maxTiles: 20,
        tiles: buildingIds.map((b, i) => makeTile(`${id}-t${i}`, b)),
        buildQueue: [],
        activeModifiers: [],
        tags: [],
        population: 2000,
        popCapacity: 10000,
        popGrowth: 0,
        unrest: 0,
        isOccupied: false,
        demographics: [],
    };
    // Pin the derived level so requirements are deterministic.
    const network = ensureInfrastructureNetwork(planet);
    for (const t of INFRASTRUCTURE_TRACK_IDS) network.tracks[t].level = infraLevel;
    recomputeInfrastructureLevel(planet);
    return planet;
}

function makeEconomyPlanet(id: string): PlanetProduction {
    return {
        planetId: id,
        systemId: 'sys-1',
        factionId: 'faction-a',
        planetType: 'industrial',
        tags: [],
        services: {},
        demographics: {
            population: 2000, growthRate: 0, housingCapacity: 50000,
            serviceSatisfaction: 50, unrestRisk: 0, manpowerEfficiency: 1,
        },
        currentRates: {},
        stockpile: {},
        derived: { construction: 0, military: 0, research: 0, cultural: 0 },
        energyLoad: 0,
        energyProduced: 0,
        happiness: 60,
        instability: 0,
        commodityScarcity: false,
    };
}

function placeOrbital(planet: ConstructionPlanet, structureId: string) {
    startOrbitalConstruction(planet, structureId, 0);
    processOrbitalQueue(planet, 10_000_000);
}

// Building sets that satisfy each specialization's requirements.
const MINING_SET = ['metal_mine', 'metal_mine', 'chemical_plant'];
const FORGE_SET = ['planetary_factory', 'heavy_industry_complex', 'underhive_warren'];
const AGRI_SET = ['hydroponic_farm', 'hydroponic_farm', 'chemical_plant'];
const RESEARCH_SET = ['research_lab', 'advanced_institute', 'veil_node'];
const FORTRESS_SET = ['barracks', 'tank_foundry', 'shield_generator'];
const LOGISTICS_SET = ['storage_silo', 'logistics_depot'];
const CAPITAL_SET = ['administrative_center', 'media_network', 'metal_mine',
    'chemical_plant', 'hydroponic_farm', 'habitat_block'];

// ─── 1. Catalog ───────────────────────────────────────────────────────────────

console.log('\n1. Specialization catalog');
{
    check('all eight specializations exist', SPECIALIZATIONS.length === 8, `got ${SPECIALIZATIONS.length}`);
    check('the doc\'s worlds are all present',
        ['mining_world', 'forge_world', 'agricultural_world', 'research_world',
            'trade_world', 'fortress_world', 'shipyard_world', 'capital_world']
            .every(id => Boolean(SPECIALIZATION_BY_ID[id])));
    check('ids are unique',
        new Set(SPECIALIZATIONS.map(s => s.id)).size === SPECIALIZATIONS.length);
    check('every specialization costs credits to declare',
        SPECIALIZATIONS.every(s => s.declareCost > 0));
    check('every specialization states a tradeoff',
        SPECIALIZATIONS.every(s => s.tradeoff.length > 0));
    check('every specialization has requirements',
        SPECIALIZATIONS.every(s => Object.keys(s.requirements).length > 0));

    // Each must have at least one upside AND one downside — that is the design rule.
    const multiplierKeys = ['metalsOutput', 'chemicalsOutput', 'foodOutput', 'energyOutput',
        'manpowerOutput', 'researchOutput', 'constructionSpeed', 'shipProduction',
        'troopRecruitment', 'defenseStrength', 'storageCapacity', 'haulage',
        'tradeThroughput', 'orbitalDefense'] as const;
    const nonCapital = SPECIALIZATIONS.filter(s => s.id !== 'capital_world');
    check('every specialization has a real upside',
        SPECIALIZATIONS.every(s => multiplierKeys.some(k => (s.effects[k] ?? 1) > 1)));
    check('every specialization but the capital has a real downside',
        nonCapital.every(s =>
            multiplierKeys.some(k => (s.effects[k] ?? 1) < 1) ||
            (s.effects.happiness ?? 0) < 0),
        nonCapital.filter(s => !multiplierKeys.some(k => (s.effects[k] ?? 1) < 1) &&
            (s.effects.happiness ?? 0) >= 0).map(s => s.id).join(', '));
    check('only the capital world is empire-unique',
        SPECIALIZATIONS.filter(s => s.uniquePerEmpire).map(s => s.id).join() === 'capital_world');
}

// ─── 2. Building census ───────────────────────────────────────────────────────

console.log('\n2. Building census');
{
    const planet = makePlanet('p', 4, [...MINING_SET, null]);
    const census = censusBuildings(planet);
    check('active buildings are counted', census.total === 3, `got ${census.total}`);
    check('categories are counted', census.byCategory['resource'] === 3);
    check('tags are counted', census.byTag['metals'] === 2, `got ${census.byTag['metals']}`);

    planet.tiles[0].constructionState = 'under_construction';
    check('unfinished buildings do not count', censusBuildings(planet).total === 2);
    planet.tiles[0].constructionState = 'ruined';
    check('ruined buildings do not count', censusBuildings(planet).total === 2);
}

// ─── 3. Qualification ─────────────────────────────────────────────────────────

console.log('\n3. Qualification');
{
    check('an unknown specialization never qualifies',
        !checkQualification(makePlanet('p'), 'not_a_world').qualified);

    const bare = makePlanet('bare', 1, [null]);
    const bareCheck = checkQualification(bare, 'mining_world');
    check('an empty world qualifies for nothing', !bareCheck.qualified);
    check('the failure lists what is missing', bareCheck.missing.length > 0,
        bareCheck.missing.join('; '));

    const mining = makePlanet('mining', 2, MINING_SET);
    check('a mining world with the right buildings qualifies',
        checkQualification(mining, 'mining_world').qualified,
        checkQualification(mining, 'mining_world').missing.join('; '));

    // Infrastructure gates the higher roles.
    const lowInfraForge = makePlanet('lowforge', 2, FORGE_SET);
    check('low infrastructure blocks a forge world',
        !checkQualification(lowInfraForge, 'forge_world').qualified);
    const forge = makePlanet('forge', 3, FORGE_SET);
    check('adequate infrastructure allows a forge world',
        checkQualification(forge, 'forge_world').qualified,
        checkQualification(forge, 'forge_world').missing.join('; '));

    // Orbital requirements.
    const noStation = makePlanet('nostation', 3, LOGISTICS_SET);
    check('a trade world needs a station in orbit',
        !checkQualification(noStation, 'trade_world').qualified,
        checkQualification(noStation, 'trade_world').missing.join('; '));
    const withStation = makePlanet('station', 3, LOGISTICS_SET);
    placeOrbital(withStation, 'space_station');
    check('a trade world qualifies once a station stands',
        checkQualification(withStation, 'trade_world').qualified,
        checkQualification(withStation, 'trade_world').missing.join('; '));

    const yardWorld = makePlanet('yard', 3, [null]);
    placeOrbital(yardWorld, 'space_station');
    placeOrbital(yardWorld, 'spaceyard');
    check('a shipyard world needs tier 2, not tier 1',
        !checkQualification(yardWorld, 'shipyard_world').qualified,
        checkQualification(yardWorld, 'shipyard_world').missing.join('; '));
    placeOrbital(yardWorld, 'advanced_spaceyard');
    check('a shipyard world qualifies at tier 2',
        checkQualification(yardWorld, 'shipyard_world').qualified,
        checkQualification(yardWorld, 'shipyard_world').missing.join('; '));

    const capital = makePlanet('capital', 4, CAPITAL_SET);
    check('a capital world qualifies with breadth',
        checkQualification(capital, 'capital_world').qualified,
        checkQualification(capital, 'capital_world').missing.join('; '));

    check('availableSpecializations lists only qualified roles',
        availableSpecializations(mining).every(s => checkQualification(mining, s.id).qualified));
    check('a bare world has nothing available',
        availableSpecializations(bare).length === 0);
}

// ─── 4. Declaring, retooling and lockout ──────────────────────────────────────

console.log('\n4. Declaring, retooling and lockout');
{
    const planet = makePlanet('p', 3, [...MINING_SET, ...FORGE_SET]);
    const now = 100_000;

    const first = canDeclareSpecialization(planet, 'mining_world', now);
    check('a qualified declaration is allowed', first.allowed, first.reason);
    check('a first declaration is not a switch', first.isSwitch === false);
    check('the cost is the base cost',
        first.cost === SPECIALIZATION_BY_ID['mining_world']!.declareCost);

    const declared = declareSpecialization(planet, 'mining_world', now);
    check('declaring succeeds', declared.success);
    check('state records the specialization', planet.specializationState?.id === 'mining_world');
    check('the display field is kept in step', planet.specialization === 'Mining World');
    check('a retooling window is opened',
        planet.specializationState?.transitionEndsAtSeconds === now + TRANSITION_SECONDS);
    check('a switch lockout is opened',
        planet.specializationState?.lockedUntilSeconds === now + SWITCH_LOCKOUT_SECONDS);

    check('the world reports as retooling', isRetooling(planet.specializationState, now + 60));
    check('retooling ends on schedule',
        !isRetooling(planet.specializationState, now + TRANSITION_SECONDS + 1));

    check('redeclaring the same role is rejected',
        !canDeclareSpecialization(planet, 'mining_world', now + 1).allowed);
    check('switching during the lockout is rejected',
        !canDeclareSpecialization(planet, 'forge_world', now + 60).allowed,
        canDeclareSpecialization(planet, 'forge_world', now + 60).reason);

    const afterLockout = now + SWITCH_LOCKOUT_SECONDS + 1;
    const switchCheck = canDeclareSpecialization(planet, 'forge_world', afterLockout);
    check('switching is allowed after the lockout', switchCheck.allowed, switchCheck.reason);
    check('switching is flagged as a switch', switchCheck.isSwitch === true);
    check('switching costs the multiplier',
        switchCheck.cost === SPECIALIZATION_BY_ID['forge_world']!.declareCost * SWITCH_COST_MULTIPLIER);

    declareSpecialization(planet, 'forge_world', afterLockout);
    check('the switch takes effect', planet.specializationState?.id === 'forge_world');
    check('the switch reopens the retooling window',
        isRetooling(planet.specializationState, afterLockout + 60));

    // Abandoning.
    check('abandoning during the lockout is rejected',
        !clearSpecialization(planet, afterLockout + 60));
    const afterSecondLockout = afterLockout + SWITCH_LOCKOUT_SECONDS + 1;
    check('abandoning after the lockout works', clearSpecialization(planet, afterSecondLockout));
    check('abandoning clears the state', planet.specializationState === undefined);
    check('abandoning clears the display field', planet.specialization === null);
    check('abandoning nothing is a no-op', !clearSpecialization(planet, afterSecondLockout));

    // Unqualified declaration.
    const unqualified = makePlanet('unqualified', 1, [null]);
    check('an unqualified declaration is rejected',
        !canDeclareSpecialization(unqualified, 'forge_world', now).allowed);
    check('an unknown specialization is rejected',
        !canDeclareSpecialization(unqualified, 'nonsense', now).allowed);
}

// ─── 5. Empire uniqueness ─────────────────────────────────────────────────────

console.log('\n5. Empire uniqueness');
{
    const first = makePlanet('cap1', 4, CAPITAL_SET);
    const second = makePlanet('cap2', 4, CAPITAL_SET);
    const rival = makePlanet('cap3', 4, CAPITAL_SET);
    rival.ownerId = 'faction-b';

    const world = {
        nowSeconds: 0,
        construction: { planets: new Map([['cap1', first], ['cap2', second], ['cap3', rival]]) },
    } as any;

    declareSpecialization(first, 'capital_world', 0, world);
    check('the first capital is accepted', first.specializationState?.id === 'capital_world');
    check('a second capital in the same empire is rejected',
        !canDeclareSpecialization(second, 'capital_world', 0, world).allowed,
        canDeclareSpecialization(second, 'capital_world', 0, world).reason);
    check('a rival empire may still have its own capital',
        canDeclareSpecialization(rival, 'capital_world', 0, world).allowed,
        canDeclareSpecialization(rival, 'capital_world', 0, world).reason);
    check('uniqueness is not enforced without a world to check against',
        canDeclareSpecialization(second, 'capital_world', 0).allowed);

    // Non-unique roles stack freely.
    const forgeA = makePlanet('fa', 3, FORGE_SET);
    const forgeB = makePlanet('fb', 3, FORGE_SET);
    const forgeWorld = {
        nowSeconds: 0,
        construction: { planets: new Map([['fa', forgeA], ['fb', forgeB]]) },
    } as any;
    declareSpecialization(forgeA, 'forge_world', 0, forgeWorld);
    check('two forge worlds in one empire are fine',
        canDeclareSpecialization(forgeB, 'forge_world', 0, forgeWorld).allowed);
}

// ─── 6. Effects ───────────────────────────────────────────────────────────────

console.log('\n6. Effects');
{
    check('an unspecialized world has no effects',
        Object.keys(computeSpecializationEffects(makePlanet('p'), 0)).length === 0);
    check('an absent planet has no effects',
        Object.keys(computeSpecializationEffects(undefined, 0)).length === 0);
    check('an unspecialized multiplier defaults to 1',
        specializationMultiplier(makePlanet('p'), 'foodOutput', 0) === 1);

    const mining = makePlanet('mining', 2, MINING_SET);
    declareSpecialization(mining, 'mining_world', 0);
    const settled = TRANSITION_SECONDS + 1;

    const effects = computeSpecializationEffects(mining, settled);
    const def = SPECIALIZATION_BY_ID['mining_world']!;
    check('a settled world gets the full bonus',
        near(effects.metalsOutput ?? 0, def.effects.metalsOutput!));
    check('a settled world gets the full penalty',
        near(effects.foodOutput ?? 0, def.effects.foodOutput!));
    check('flat penalties apply too', near(effects.happiness ?? 0, def.effects.happiness!));

    // Retooling interpolates toward 1 — a bonus must never become a penalty.
    const retooling = computeSpecializationEffects(mining, 60);
    check('retooling reduces the bonus but keeps it a bonus',
        (retooling.metalsOutput ?? 0) > 1 &&
        (retooling.metalsOutput ?? 0) < (effects.metalsOutput ?? 0),
        `got ${retooling.metalsOutput}`);
    check('retooling softens the penalty too',
        (retooling.foodOutput ?? 0) > (effects.foodOutput ?? 0) &&
        (retooling.foodOutput ?? 0) < 1);
    check('retooling interpolates at the declared scale',
        near(retooling.metalsOutput ?? 0,
            1 + (def.effects.metalsOutput! - 1) * TRANSITION_EFFECT_SCALE));
    check('retooling costs stability',
        (retooling.stability ?? 0) <= -TRANSITION_STABILITY_PENALTY,
        `got ${retooling.stability}`);
    check('a settled world pays no retooling penalty',
        (effects.stability ?? 0) > (retooling.stability ?? 0));
}

// ─── 7. Stats integration ─────────────────────────────────────────────────────

console.log('\n7. Stats integration');
{
    const settled = TRANSITION_SECONDS + 1;

    // A declared role must not be overwritten by what happens to be built.
    const forge = makePlanet('forge', 3, [...FORGE_SET, ...RESEARCH_SET]);
    declareSpecialization(forge, 'forge_world', 0);
    recalculatePlanetStats(forge, settled);
    check('recalculating stats does NOT overwrite the declared role',
        forge.specializationState?.id === 'forge_world' && forge.specialization === 'Forge World');

    // Mining: more metals, less food than the same world unspecialized.
    const plainMine = makePlanet('plain', 2, MINING_SET);
    const specMine = makePlanet('spec', 2, MINING_SET);
    declareSpecialization(specMine, 'mining_world', 0);
    const plainStats = recalculatePlanetStats(plainMine, settled);
    const specStats = recalculatePlanetStats(specMine, settled);
    check('a mining world out-produces metals',
        specStats.metalsOutput > plainStats.metalsOutput,
        `${plainStats.metalsOutput} -> ${specStats.metalsOutput}`);
    check('a mining world is less happy',
        specStats.happiness < plainStats.happiness);

    // Fortress: harder, but dumber.
    const plainFort = makePlanet('pf', 3, FORTRESS_SET);
    const specFort = makePlanet('sf', 3, FORTRESS_SET);
    declareSpecialization(specFort, 'fortress_world', 0);
    const pfStats = recalculatePlanetStats(plainFort, settled);
    const sfStats = recalculatePlanetStats(specFort, settled);
    check('a fortress world defends harder', sfStats.defenseStrength > pfStats.defenseStrength);
    check('a fortress world recruits faster',
        sfStats.troopRecruitmentModifier > pfStats.troopRecruitmentModifier);
    check('a fortress world resists espionage better',
        sfStats.espionageResistance > pfStats.espionageResistance);

    // Research: smarter, softer.
    const plainLab = makePlanet('pl', 3, RESEARCH_SET);
    const specLab = makePlanet('sl', 3, RESEARCH_SET);
    declareSpecialization(specLab, 'research_world', 0);
    const plStats = recalculatePlanetStats(plainLab, settled);
    const slStats = recalculatePlanetStats(specLab, settled);
    check('a research world researches more', slStats.researchOutput > plStats.researchOutput);
    check('a research world recruits worse',
        slStats.troopRecruitmentModifier < plStats.troopRecruitmentModifier);

    // Agricultural: fed and content.
    const specFarm = makePlanet('sfa', 2, AGRI_SET);
    declareSpecialization(specFarm, 'agricultural_world', 0);
    const plainFarm = makePlanet('pfa', 2, AGRI_SET);
    check('an agricultural world grows more food',
        recalculatePlanetStats(specFarm, settled).foodOutput >
        recalculatePlanetStats(plainFarm, settled).foodOutput);
}

// ─── 8. Cross-system integration ──────────────────────────────────────────────

console.log('\n8. Cross-system integration');
{
    const settled = TRANSITION_SECONDS + 1;

    // Trade world: bigger stores, better haulage.
    const plainTrade = makePlanet('pt', 3, LOGISTICS_SET);
    placeOrbital(plainTrade, 'space_station');
    const specTrade = makePlanet('st', 3, LOGISTICS_SET);
    placeOrbital(specTrade, 'space_station');
    declareSpecialization(specTrade, 'trade_world', 0);

    const plainCap = computeStorageCapacity(plainTrade, settled);
    const specCap = computeStorageCapacity(specTrade, settled);
    check('a trade world holds more stock',
        (specCap.capacity.metals ?? 0) > (plainCap.capacity.metals ?? 0),
        `${plainCap.capacity.metals} -> ${specCap.capacity.metals}`);

    const plainLogi = updatePlanetLogistics(makeEconomyPlanet('pt'), plainTrade, plainCap, settled);
    const specLogi = updatePlanetLogistics(makeEconomyPlanet('st'), specTrade, specCap, settled);
    check('a trade world hauls more', specLogi.capacity > plainLogi.capacity,
        `${plainLogi.capacity} -> ${specLogi.capacity}`);

    // Research world: smaller stores than the same world unspecialized? No —
    // research does not touch storage, so it must be unchanged.
    const specLab = makePlanet('sl2', 3, RESEARCH_SET);
    declareSpecialization(specLab, 'research_world', 0);
    const plainLab = makePlanet('pl2', 3, RESEARCH_SET);
    check('a role that does not mention storage leaves it alone',
        near(computeStorageCapacity(specLab, settled).capacity.metals ?? 0,
            computeStorageCapacity(plainLab, settled).capacity.metals ?? 0));

    // Fortress world: its orbit takes less damage per volley.
    const plainOrbit = makePlanet('po', 3, FORTRESS_SET);
    placeOrbital(plainOrbit, 'space_station');
    placeOrbital(plainOrbit, 'orbital_defense_network');
    const fortOrbit = makePlanet('fo', 3, FORTRESS_SET);
    placeOrbital(fortOrbit, 'space_station');
    placeOrbital(fortOrbit, 'orbital_defense_network');
    declareSpecialization(fortOrbit, 'fortress_world', 0);

    const plainDamage = applyOrbitalDamage(plainOrbit, 1000, settled);
    const fortDamage = applyOrbitalDamage(fortOrbit, 1000, settled);
    check('a fortress world\'s orbit absorbs less hull damage',
        fortDamage.hullDamageApplied < plainDamage.hullDamageApplied,
        `${plainDamage.hullDamageApplied.toFixed(0)} vs ${fortDamage.hullDamageApplied.toFixed(0)}`);
    check('a fortress world\'s orbit ends the volley in better shape',
        (fortOrbit.orbital!.slots.find(s => s.structureId === 'space_station')?.integrity ?? 0) >
        (plainOrbit.orbital!.slots.find(s => s.structureId === 'space_station')?.integrity ?? 0));

    // Trade world: softer orbit, by its own admission.
    const tradeOrbit = makePlanet('to', 3, LOGISTICS_SET);
    placeOrbital(tradeOrbit, 'space_station');
    placeOrbital(tradeOrbit, 'orbital_defense_network');
    declareSpecialization(tradeOrbit, 'trade_world', 0);
    const tradeDamage = applyOrbitalDamage(tradeOrbit, 1000, settled);
    check('a trade world\'s orbit absorbs more damage than a neutral one',
        tradeDamage.hullDamageApplied > plainDamage.hullDamageApplied,
        `${plainDamage.hullDamageApplied.toFixed(0)} vs ${tradeDamage.hullDamageApplied.toFixed(0)}`);
}

// ─── 9. Suggestion hint ───────────────────────────────────────────────────────

console.log('\n9. Suggestion hint');
{
    check('an empty world suggests nothing', suggestSpecialization(makePlanet('p', 1, [null])) === null);
    check('a lab-heavy world suggests research',
        suggestSpecialization(makePlanet('r', 3, RESEARCH_SET)) === 'research_world');
    check('a factory-heavy world suggests forge',
        suggestSpecialization(makePlanet('f', 3, FORGE_SET)) === 'forge_world');
    check('a farm-heavy world suggests agriculture',
        suggestSpecialization(makePlanet('a', 2, AGRI_SET)) === 'agricultural_world');
    check('a garrison-heavy world suggests fortress',
        suggestSpecialization(makePlanet('m', 3, FORTRESS_SET)) === 'fortress_world');

    const yard = makePlanet('y', 3, [null]);
    placeOrbital(yard, 'space_station');
    placeOrbital(yard, 'spaceyard');
    placeOrbital(yard, 'advanced_spaceyard');
    check('a tier 2 yard suggests shipyard', suggestSpecialization(yard) === 'shipyard_world');

    // The hint must never mutate the planet.
    const untouched = makePlanet('u', 3, FORGE_SET);
    suggestSpecialization(untouched);
    check('the hint does not declare anything',
        untouched.specialization === null && untouched.specializationState === undefined);

    // And every suggestion must name a real specialization.
    const suggestions: (SpecializationId | null)[] = [
        suggestSpecialization(makePlanet('s1', 3, RESEARCH_SET)),
        suggestSpecialization(makePlanet('s2', 3, FORGE_SET)),
        suggestSpecialization(makePlanet('s3', 2, MINING_SET)),
    ];
    check('every suggestion names a catalogued role',
        suggestions.every(s => s === null || Boolean(SPECIALIZATION_BY_ID[s])));
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
