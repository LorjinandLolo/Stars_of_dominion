// @ts-nocheck

import { DefeatManager, DEFEAT_CONDITIONS } from '../lib/defeat/manager';
import { Faction, Planet } from '../types/game';
import { createTradeRoute } from '../lib/economy/trade';
import { triggerCrisis, getActiveCrises } from '../lib/economy/crisis';
import { ResourceId } from '../types';

// Mock Data
const mockFaction: Faction = {
    $id: 'faction_1',
    name: 'Test Empire',
    traits: {},
    resources: JSON.stringify({ credits: 100, metals: 50, happiness: 50, intel: 20 }),
    home_planet_id: 'planet_1'
};

const mockPlanets: Planet[] = [
    { $id: 'planet_1', name: 'Homeworld', x: 0, y: 0, type: 'planet', owner_faction_id: 'faction_1', resource_yield: {} },
    { $id: 'planet_2', name: 'Colony', x: 1, y: 1, type: 'planet', owner_faction_id: 'faction_1', resource_yield: {} }
];

function runTest() {
    console.log('=== DEFEAT SYSTEM TEST ===');

    // TEST 1: Baseline (Healthy, but Isolated)
    let defeats = DefeatManager.checkDefeatConditions(mockFaction, mockPlanets, { income_rates: { credits: 10 } });
    if (defeats.active_defeats.find(d => d.condition_id === DEFEAT_CONDITIONS['DIPLOMATIC_ISOLATION'].id)) {
        console.log('PASS: Baseline isolation check.');
    }

    // TEST 2: Homeworld Lost
    const lostPlanets = [...mockPlanets];
    lostPlanets[0].owner_faction_id = 'enemy_faction';
    defeats = DefeatManager.checkDefeatConditions(mockFaction, lostPlanets, { income_rates: {} });
    if (defeats.status === 'ELIMINATED') console.log('PASS: Homeworld Lost check.');

    // TEST 3: Economic Collapse
    const poorFaction = { ...mockFaction };
    poorFaction.resources = JSON.stringify({ credits: -6000, metals: 0 });
    defeats = DefeatManager.checkDefeatConditions(poorFaction, mockPlanets, { income_rates: { credits: -100 } });
    if (defeats.active_defeats.find(d => d.condition_id === DEFEAT_CONDITIONS['ECONOMIC_COLLAPSE'].id)) {
        console.log('PASS: Economic Collapse check.');
    }

    // TEST 4: Internal (Rebellion)
    const rebelliousFaction = { ...mockFaction };
    rebelliousFaction.resources = JSON.stringify({ credits: 100, happiness: 5 });
    defeats = DefeatManager.checkDefeatConditions(rebelliousFaction, mockPlanets, { income_rates: {} });
    if (defeats.active_defeats.find(d => d.condition_id === DEFEAT_CONDITIONS['REBELLION'].id)) {
        console.log('PASS: Rebellion check.');
    }

    // TEST 5: Espionage (Crisis Overwhelm)
    console.log('Triggering 3 Crises against ' + mockFaction.$id);
    triggerCrisis(mockFaction.$id, 'sabotage');
    triggerCrisis(mockFaction.$id, 'embargo');
    triggerCrisis(mockFaction.$id, 'blockade');

    defeats = DefeatManager.checkDefeatConditions(mockFaction, mockPlanets, { income_rates: {} });
    if (defeats.active_defeats.find(d => d.condition_id === DEFEAT_CONDITIONS['CRISIS_OVERWHELM'].id)) {
        console.log('PASS: Crisis Overwhelm check.');
    } else {
        console.error('FAIL: Crisis Overwhelm check failed.');
    }
}

runTest();

