
import { SectorManager } from '../lib/sector-logic';
import { Sector, Entity } from '../types/index';

const mockSector: Sector = {
    id: "sec-01",
    name: "Test Sector",
    type: "core",
    rows: 5,
    columns: 5,
    neighbors: []
};

const ship: Entity = {
    id: "ship-01",
    type: "ship",
    sectorId: "sec-01",
    x: 0,
    y: 0,
    ownerId: "faction-blue"
};

console.log("Initializing SectorManager...");
const manager = new SectorManager(mockSector, [ship]);

// Verify placement
console.log("Verifying placement at (0,0)...");
const at00 = manager.getEntitiesAt(0, 0);
console.log(`Entities at (0,0): ${at00.length} (Expected 1)`);
if (at00.length !== 1 || at00[0].id !== "ship-01") {
    console.error("FAIL: Placement");
} else {
    console.log("PASS: Placement");
}

// Move
console.log("Moving ship to (1,0)...");
const moved = manager.moveEntity("ship-01", 1, 0);
console.log(`Move result: ${moved} (Expected true)`);

const at10 = manager.getEntitiesAt(1, 0);
const at00_new = manager.getEntitiesAt(0, 0);

if (moved && at10.length === 1 && at00_new.length === 0) {
    console.log("PASS: Movement");
} else {
    console.error("FAIL: Movement");
    console.log(`at10: ${at10.length}, at00_new: ${at00_new.length}`);
}

// Invalid Move
console.log("Attempting invalid move to (3,3)...");
const invalidMove = manager.moveEntity("ship-01", 3, 3);
console.log(`Invalid move result: ${invalidMove} (Expected false)`);
if (!invalidMove) {
    console.log("PASS: Invalid Move Blocked");
} else {
    console.error("FAIL: Invalid Move Allowed");
}

// Stacking
console.log("Testing Stacking: Adding second ship to (1,0)...");
const ship2: Entity = {
    id: "ship-02",
    type: "ship",
    sectorId: "sec-01",
    x: 1,
    y: 0,
    ownerId: "faction-red"
};
manager.addEntity(ship2);
const stack = manager.getEntitiesAt(1, 0);
console.log(`Entities at (1,0): ${stack.length} (Expected 2)`);
if (stack.length === 2) {
    console.log("PASS: Stacking");
} else {
    console.error("FAIL: Stacking");
}

console.log("Done.");
