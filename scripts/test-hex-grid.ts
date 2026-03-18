
import { HexGrid } from '../lib/hex-grid';

const grid = new HexGrid(10, 10);

console.log("Testing Hex Grid Logic...");

// Test even row (0)
const neighbors00 = grid.getNeighbors(0, 0);
console.log("Neighbors of (0,0):", neighbors00);
// Expected for (0,0) (even row): (1,0), (0,-1) [invalid], (-1,-1) [invalid], (-1,0) [invalid], (-1,1) [invalid], (0,1)

// Test odd row (1) - offset
const neighbors01 = grid.getNeighbors(0, 1);
console.log("Neighbors of (0,1):", neighbors01);

// Test middle
const neighbors55 = grid.getNeighbors(5, 5);
console.log("Neighbors of (5,5):", neighbors55);
// Odd row logic for y=5?
// row 5 is odd.
// directions: { dx: 1, dy: 0 }, { dx: 1, dy: -1 }, { dx: 0, dy: -1 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }
// (6,5), (6,4), (5,4), (4,5), (5,6), (6,6)

console.log("Done.");
