const fs = require('fs');
const path = require('path');

const SECTORS = ['Alpha', 'Beta', 'Gamma', 'Omicron'];
const THEATRE_OFFSETS = {
    'Alpha': { x: 0, y: 0 },
    'Beta': { x: 120, y: 0 },
    'Gamma': { x: 0, y: 120 },
    'Omicron': { x: 120, y: 120 }
};

let allSystems = [];
let allLinks = [];

const tags = ['standard', 'fortress', 'void', 'basin', 'spine', 'crimson_expanse', 'veldt_dominion', 'nullward_fringe'];
const regions = ['core', 'fringe', 'border'];

SECTORS.forEach(sector => {
    // Determine exact filename based on the user's specific naming convention
    let filename = '';
    if (sector === 'Alpha') filename = 'Alpha - September 18, 2025.json';
    if (sector === 'Beta') filename = 'Beta - September 18, 2025.json';
    // Note: User's gamma file has a double space
    if (sector === 'Gamma') filename = 'Gamma  - September 18, 2025.json';
    if (sector === 'Omicron') filename = 'Omicron - September 18, 2025.json';

    const filePath = path.join(__dirname, '..', filename);
    if (!fs.existsSync(filePath)) {
        console.warn(`Could not find ${filename}`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const offset = THEATRE_OFFSETS[sector];
    let sectorSystems = [];

    // Pass 1: Extract all narrative World Tags from planets mapped by their parent system ID
    let systemTagsMap = {};
    if (data.planet) {
        Object.values(data.planet).forEach(p => {
            if (p.parentEntity === 'system' && p.attributes?.tags) {
                if (!systemTagsMap[p.parent]) systemTagsMap[p.parent] = new Set();
                p.attributes.tags.forEach(tag => {
                    const tagName = typeof tag === 'string' ? tag : (tag.name || null);
                    if (tagName) systemTagsMap[p.parent].add(tagName);
                });
            }
        });
    }

    // Pass 2: Parse 'system' entities and attach their mapping tags
    if (data.system) {
        Object.entries(data.system).forEach(([id, sys]) => {
            if (sys.x !== undefined && sys.y !== undefined) {
                // Scaling coordinate positions by 2.2 to breathe the clusters apart!
                const qPos = Math.floor(sys.x * 2.2) + offset.x;
                const rPos = Math.floor(sys.y * 2.2) + offset.y;

                let regionArchetype = 'veldt_dominion';
                if (sector === 'Alpha') regionArchetype = 'crimson_expanse';

                // Explicit Nullward Fringe assignment for Outskirts (expanded for 2.2x scale)
                if (qPos < 15 || qPos > 105 || rPos < 15 || rPos > 105) {
                    regionArchetype = 'nullward_fringe';
                }

                // Pull compiled narrative tags
                let narrativeTags = systemTagsMap[id] ? Array.from(systemTagsMap[id]) : [];

                const newSys = {
                    id: `${sector.toLowerCase()}-${id}`,
                    name: sys.name,
                    q: qPos,
                    r: rPos,
                    security: Math.floor(Math.random() * 50) + 20,
                    tradeValue: Math.floor(Math.random() * 80) + 10,
                    instability: Math.floor(Math.random() * 40) + 5,
                    escalationLevel: Math.floor(Math.random() * 3),
                    tags: ['standard', regionArchetype, ...narrativeTags],
                    regionId: regionArchetype.replace('_', '-') // Maps crimson_expanse to crimson-expanse
                };
                allSystems.push(newSys);
                sectorSystems.push(newSys);
            }
        });
    }

    // Generate ~1.5 links per system within the sector
    for (let i = 0; i < sectorSystems.length; i++) {
        const source = sectorSystems[i];
        const numLinks = Math.floor(Math.random() * 3) + 1; // 1 to 3 connections

        // Find closest nodes to link to make it look organic
        const distances = sectorSystems
            .filter(s => s.id !== source.id)
            .map(s => ({
                sys: s,
                dist: Math.sqrt(Math.pow(s.q - source.q, 2) + Math.pow(s.r - source.r, 2))
            }))
            .sort((a, b) => a.dist - b.dist);

        for (let j = 0; j < Math.min(numLinks, distances.length); j++) {
            const target = distances[j].sys;
            // Prevent duplicate bidirectional links
            const exists = allLinks.some(l =>
                (l.source === source.id && l.target === target.id) ||
                (l.source === target.id && l.target === source.id)
            );

            if (!exists && distances[j].dist < 15) { // Prevent cross-map crazy lines
                allLinks.push({
                    id: `link-${source.id}-${target.id}`,
                    fromSystemId: source.id,
                    toSystemId: target.id,
                    class: Math.random() > 0.8 ? 'gate' : 'base'
                });
            }
        }
    }
});

// --- Procedural Gap Generation ---
const gapArchetypes = ['middle_rim', 'crimson_expanse', 'veldt_dominion'];
const numGapSystems = 120; // Doubled procedural gap systems

for (let i = 0; i < numGapSystems; i++) {
    let q, r;
    const regionType = Math.floor(Math.random() * 5);
    // Because map is scaled heavily, gaps are larger and shifted
    // Gap 1: Bridge Alpha to Beta
    if (regionType === 0) { q = 50 + Math.random() * 35; r = 5 + Math.random() * 40; }
    // Gap 2: Bridge Alpha to Gamma
    else if (regionType === 1) { q = 5 + Math.random() * 40; r = 50 + Math.random() * 35; }
    // Gap 3: Bridge Beta to Omicron
    else if (regionType === 2) { q = 95 + Math.random() * 40; r = 50 + Math.random() * 35; }
    // Gap 4: Bridge Gamma to Omicron
    else if (regionType === 3) { q = 50 + Math.random() * 35; r = 95 + Math.random() * 40; }
    // Gap 5: Central Basin
    else { q = 50 + Math.random() * 35; r = 50 + Math.random() * 35; }

    const regionArchetype = Math.random() > 0.4 ? 'middle_rim' : gapArchetypes[Math.floor(Math.random() * gapArchetypes.length)];

    const id = `midrim-${i}`;
    const newSys = {
        id: id,
        name: `Rim Node ${i}`,
        q: Math.floor(q),
        r: Math.floor(r),
        security: Math.floor(Math.random() * 50) + 20,
        tradeValue: Math.floor(Math.random() * 80) + 10,
        instability: Math.floor(Math.random() * 40) + 5,
        escalationLevel: Math.floor(Math.random() * 3),
        tags: ['standard', regionArchetype],
        regionId: regionArchetype.replace('_', '-')
    };
    allSystems.push(newSys);

    // Link gap systems to nearest existing system
    const closest = allSystems
        .filter(s => s.id !== id)
        .map(s => ({ sys: s, dist: Math.sqrt(Math.pow(s.q - newSys.q, 2) + Math.pow(s.r - newSys.r, 2)) }))
        .sort((a, b) => a.dist - b.dist);

    for (let j = 0; j < Math.min(2, closest.length); j++) {
        const target = closest[j].sys;
        if (closest[j].dist < 30) { // Bumped link distance boundary to account for massive spacing
            allLinks.push({
                id: `link-${newSys.id}-${target.id}`,
                fromSystemId: newSys.id,
                toSystemId: target.id,
                class: 'base'
            });
        }
    }
}

// --- Pirate Havens (Omicron -> Beta Corridor) ---
// Explicitly building a hostile bridge from Bottom Right to Top Right
const numPirateHavens = 20;
let lastPirateNodeId = null;

for (let i = 0; i < numPirateHavens; i++) {
    // Linear regression from Omicron core (130, 130) up to Beta core (130, 20)
    const q = 130 + (Math.random() * 15 - 7.5); // Wiggle room on X
    const r = 130 - (i * (110 / numPirateHavens)) + (Math.random() * 10 - 5); // Stepping up Y

    const id = `pirate-${i}`;
    const newSys = {
        id: id,
        name: `Corsair Den ${i}`,
        q: Math.floor(q),
        r: Math.floor(r),
        security: Math.floor(Math.random() * 20),
        tradeValue: Math.floor(Math.random() * 30),
        instability: Math.floor(Math.random() * 50) + 50,
        escalationLevel: Math.floor(Math.random() * 3) + 7,
        tags: ['standard', 'nullward_fringe'], // Fringe worlds fit pirate dens perfectly
        regionId: 'nullward-fringe'
    };
    allSystems.push(newSys);

    // Link sequentially to form a coherent travel corridor
    if (lastPirateNodeId) {
        allLinks.push({
            id: `link-${lastPirateNodeId}-${id}`,
            fromSystemId: lastPirateNodeId,
            toSystemId: id,
            class: 'base'
        });
    }
    lastPirateNodeId = id;

    // Additionally link to nearest non-pirate node to connect the corridor to the real map gracefully
    if (i === 0 || i === numPirateHavens - 1 || Math.random() > 0.5) {
        const closestNeighbors = allSystems
            .filter(s => s.id !== id && !s.id.startsWith('pirate-'))
            .map(s => ({ sys: s, dist: Math.sqrt(Math.pow(s.q - newSys.q, 2) + Math.pow(s.r - newSys.r, 2)) }))
            .sort((a, b) => a.dist - b.dist);

        if (closestNeighbors.length > 0 && closestNeighbors[0].dist < 25) {
            allLinks.push({
                id: `link-${newSys.id}-${closestNeighbors[0].sys.id}`,
                fromSystemId: newSys.id,
                toSystemId: closestNeighbors[0].sys.id,
                class: 'gate'
            });
        }
    }
}

// --- Alpha -> Gamma Strategic Corridor ---
// Building a thick structured bridge down the left side (Top Left to Bottom Left)
const numCorridorNodes = 25;
let lastCorridorNodeId = null;

for (let i = 0; i < numCorridorNodes; i++) {
    // Linear regression from Alpha core (20, 20) down to Gamma core (20, 130)
    // Adding horizontal width for 'basins'
    const isBasin = Math.random() > 0.6;
    const q = 25 + (isBasin ? (Math.random() * 20 - 10) : (Math.random() * 6 - 3));
    const r = 20 + (i * (110 / numCorridorNodes)) + (Math.random() * 8 - 4);

    let archetype = 'spine';
    if (isBasin) archetype = 'basin';
    if (i === 0 || i === numCorridorNodes - 1) archetype = 'gate'; // Fortress gates at the entrances

    const id = `corridor-${i}`;
    const newSys = {
        id: id,
        name: `Westfold ${i}`,
        q: Math.floor(q),
        r: Math.floor(r),
        security: Math.floor(Math.random() * 50) + 20,
        tradeValue: Math.floor(Math.random() * 80) + 10,
        instability: Math.floor(Math.random() * 40) + 5,
        escalationLevel: Math.floor(Math.random() * 3),
        tags: ['standard', archetype],
        // infrastructure: { nodes: [] }, // Removed
        regionId: 'middle-rim' // Anchoring this structurally into the Middle Rim
    };
    allSystems.push(newSys);

    // Spine link logic
    if (lastCorridorNodeId && !isBasin) {
        allLinks.push({
            id: `link-${lastCorridorNodeId}-${id}`,
            fromSystemId: lastCorridorNodeId,
            toSystemId: id,
            class: 'base'
        });
        lastCorridorNodeId = id;
    } else if (!isBasin) {
        lastCorridorNodeId = id;
    }

    // Connect basins to the nearest spine
    if (isBasin) {
        const closestSpine = allSystems
            .filter(s => s.id !== id && s.tags.includes('spine'))
            .map(s => ({ sys: s, dist: Math.sqrt(Math.pow(s.q - newSys.q, 2) + Math.pow(s.r - newSys.r, 2)) }))
            .sort((a, b) => a.dist - b.dist);

        if (closestSpine.length > 0 && closestSpine[0].dist < 20) {
            allLinks.push({
                id: `link-${newSys.id}-${closestSpine[0].sys.id}`,
                fromSystemId: newSys.id,
                toSystemId: closestSpine[0].sys.id,
                class: 'base'
            });
        }
    }
}

// Stitch the 4 sectors together across the borders
const getClosestCrossSector = (sectorA, sectorB) => {
    const sysA = allSystems.filter(s => s.id.startsWith(sectorA.toLowerCase()));
    const sysB = allSystems.filter(s => s.id.startsWith(sectorB.toLowerCase()));

    if (!sysA.length || !sysB.length) return;

    // Pick a few boundary nodes and bridge them
    for (let i = 0; i < 3; i++) {
        const sA = sysA[Math.floor(Math.random() * sysA.length)];
        const sB = sysB[Math.floor(Math.random() * sysB.length)];
        allLinks.push({
            id: `link-${sA.id}-${sB.id}`,
            fromSystemId: sA.id,
            toSystemId: sB.id,
            class: 'gate' // Major long-distance crossings are usually wormholes or canals
        });
    }
}

getClosestCrossSector('Alpha', 'Beta');
getClosestCrossSector('Alpha', 'Gamma');
getClosestCrossSector('Beta', 'Omicron');
getClosestCrossSector('Gamma', 'Omicron');

// Export to file
fs.writeFileSync('generated-systems.json', JSON.stringify({
    systemNodes: allSystems,
    links: allLinks
}, null, 2));

console.log(`Generated Map: ${allSystems.length} systems, ${allLinks.length} links across ${SECTORS.join(', ')}`);
