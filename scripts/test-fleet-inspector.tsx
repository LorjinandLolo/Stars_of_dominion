// scripts/test-fleet-inspector.tsx
// The card for a fleet that is not yours (components/galaxy/FleetInspector.tsx):
// what it shows for an empire and for a fleet with no government, and that the
// store keeps inspecting apart from commanding.
// Run: npx tsx scripts/test-fleet-inspector.tsx

import assert from 'assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useUIStore } from '../lib/store/ui-store';
import FleetInspector from '../components/galaxy/FleetInspector';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const allFactions = [{ id: 'faction-me', name: 'Aurelian' }, { id: 'faction-sarrak', name: 'Sarrak / Sil', civilizationId: 'civ-sarrak' }];
const s: any = useUIStore.getState();
useUIStore.setState({
    playerFactionId: 'faction-me',
    politicsState: { ...s.politicsState, allFactions },
    systems: [{ id: 'sys1', name: 'Kestrel' }],
    fleets: [
        { id: 'mine', factionId: 'faction-me', name: 'Home Fleet', currentSystemId: 'sys1', basePower: 100, strength: 1, composition: { cruiser: 2 } },
        { id: 'f1', factionId: 'faction-sarrak', name: 'Third Swamp Fleet', currentSystemId: 'sys1', basePower: 240, strength: 0.75, composition: { cruiser: 3, corvette: 1 } },
        { id: 'f2', factionId: 'pirates', name: 'Raiders', currentSystemId: 'sys1', basePower: 30, strength: 1, composition: { corvette: 1 } },
    ],
} as any);
// React's server render reads zustand's initial state: copy the live state into it.
const render = () => { Object.assign(useUIStore.getInitialState(), useUIStore.getState()); return renderToStaticMarkup(<FleetInspector />); };

test('nothing inspected, no card', () => {
    assert.strictEqual(render(), '');
});

test('an empire\'s fleet: owner, steward, relation, power, ships, profile and diplomacy', () => {
    useUIStore.getState().setInspectedFleetId('f1');
    const html = render();
    for (const want of ['Third Swamp Fleet', 'Sarrak', 'Sil', 'Kestrel', '180', '75%', '3 cruisers', '1 corvette', 'PROFILE', 'DIPLOMACY']) {
        assert.ok(html.includes(want), `${want} missing`);
    }
});

test('a fleet with no government: no buttons to nowhere', () => {
    useUIStore.getState().setInspectedFleetId('f2');
    const html = render();
    assert.ok(html.includes('Raiders') && html.includes('No one to talk to'));
    assert.ok(!html.includes('DIPLOMACY'));
});

test('inspecting never touches the fleet you command; commanding closes the card', () => {
    useUIStore.getState().setSelectedFleetId('mine');
    useUIStore.getState().setInspectedFleetId('f1');
    assert.strictEqual(useUIStore.getState().selectedFleetId, 'mine');
    useUIStore.getState().setSelectedFleetId('mine');
    assert.strictEqual(useUIStore.getState().inspectedFleetId, null);
});

test('a focus with a tab opens that card; a plain focus stays a reply', () => {
    useUIStore.getState().setDiplomacyFocusId('faction-sarrak', 'intel');
    assert.strictEqual(useUIStore.getState().diplomacyFocusTab, 'intel');
    useUIStore.getState().setDiplomacyFocusId(null);
    assert.strictEqual(useUIStore.getState().diplomacyFocusTab, 'intel', 'the panel reads it after clearing the id');
    useUIStore.getState().setDiplomacyFocusId('faction-sarrak');
    assert.strictEqual(useUIStore.getState().diplomacyFocusTab, null);
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
