import { SectorManager } from '../lib/sector-logic';
import { Entity, Sector } from '../types/index';

console.log('--- Testing Map Movement Logic ---');

const mockSector: Sector = {
    id: 'test-sector',
    name: 'Test Sector',
    type: 'core',
    rows: 20,
    columns: 20,
    neighbors: []
};

// Create entities
// System A at 0,0
const systemA: Entity = {
    id: 'sys-a',
    type: 'system',
    sectorId: 'test-sector',
    x: 0,
    y: 0,
    properties: { name: 'System A' }
};

// System B at 10,10 (Far away)
const systemB: Entity = {
    id: 'sys-b',
    type: 'system',
    sectorId: 'test-sector',
    x: 10,
    y: 10,
    properties: { name: 'System B' }
};

// Bridge at 3,3 (Within range of A)
const bridge: Entity = {
    id: 'bridge-1',
    type: 'bridge',
    sectorId: 'test-sector',
    x: 3,
    y: 3,
    properties: { name: 'Bridge 1' }
};

// Fleet at 0,0
const fleet: Entity = {
    id: 'fleet-1',
    type: 'ship',
    sectorId: 'test-sector',
    x: 0,
    y: 0
};

const entities = [systemA, systemB, bridge, fleet];
const manager = new SectorManager(mockSector, entities);

// Test 1: Move to Empty Space (Fail)
console.log('\nTest 1: Move to Empty Space (1,1)');
const res1 = manager.moveEntity(fleet.id, 1, 1);
console.log(`Result: ${res1} (Expected: false)`);

// Test 2: Move to Far System (Fail)
console.log('\nTest 2: Move to Far System (10,10)');
const res2 = manager.moveEntity(fleet.id, 10, 10);
console.log(`Result: ${res2} (Expected: false)`);

// Test 3: Move to Bridge (Success)
console.log('\nTest 3: Move to Bridge (3,3)');
const res3 = manager.moveEntity(fleet.id, 3, 3);
console.log(`Result: ${res3} (Expected: true)`);
if (res3) {
    console.log(`Fleet position: ${fleet.x},${fleet.y}`);
}
