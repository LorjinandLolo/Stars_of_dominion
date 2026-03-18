// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { Client, Databases, ID, Query } from 'node-appwrite';
// import { System, ArchetypeTag } from '../types/index';

// --- Inline Types for Script Execution ---
export type ArchetypeTag = 'throat' | 'canal' | 'spine' | 'fortress' | 'void' | 'basin' | 'bridge' | 'standard' | 'gate' | 'crimson_expanse' | 'veldt_dominion' | 'nullward_fringe';
export type TheatreId = 'alpha' | 'beta' | 'gamma' | 'omicron' | 'bridge';

export interface Entity {
    id: string;
    type: 'ship' | 'station' | 'anomaly' | 'resource' | 'army' | 'system' | 'bridge';
    ownerId?: string; // Faction ID
    sectorId: string;
    x: number;
    y: number;
}

export interface System extends Entity {
    type: 'system';
    name: string;
    theatreId: TheatreId; // Keeping for backward compat, acts as region_id
    region_id?: string; // More specific region ID (e.g., 'central_basin', 'sigma_cluster')
    archetype_tag?: ArchetypeTag;
    defense_modifier?: number;
    hazard_level?: number;
    trade_weight?: number;
    isBridge?: boolean;
    attributes?: Record<string, any>;
    hyperlaneTo?: { systemId: string; x: number; y: number }[]; // Connections
}

/**
 * Strategic Graph Map Generator
 * 
 * Generates a galaxy map composed of clusters connected by specific graph archetypes.
 * 
 * Major Regions:
 * - Alpha (Top-Left)
 * - Beta (Top-Right)
 * - Gamma (Bottom-Left)
 * - Omicron (Bottom-Right)
 * - Central Basin (Center)
 * 
 * Connections:
 * 1. Alpha <-> Beta: Hyperlane Throat (Narrow choke)
 * 2. Alpha <-> Omicron: Wormhole Canal (Direct link)
 * 3. Beta <-> Omicron: Trade Spine (Long chain)
 * 4. Alpha <-> Gamma: Land Bridge (Mesh)
 * 5. Gamma <-> Omicron: Deep Void (High cost/sparse)
 * 6. Central Basin <-> All: Multiple routes (Hub)
 * 7. Long Bypass: Outer rim chain (Reliable but slow)
 * 8. Fortress Gate: Sub-region behind Gamma
 * 9. Treaty Gate: Specific choke logic (e.g. between Basin and Beta)
 */

// --- Configuration ---
const SECTOR_SIZE = 25;
const OFFSET = 41; // Spacing between theatre origins (Tightened by 4 hexes)

const THEATRE_OFFSETS = {
    'alpha': { x: 0, y: 0 },
    'beta': { x: OFFSET, y: 0 },
    'gamma': { x: 0, y: OFFSET },
    'omicron': { x: OFFSET, y: OFFSET },
    'central': { x: OFFSET / 2, y: OFFSET / 2 }
};

const JSON_FILES = {
    'alpha': 'Alpha - September 18, 2025.json',
    'beta': 'Beta - September 18, 2025.json',
    'gamma': 'Gamma  - September 18, 2025.json',
    'omicron': 'Omicron - September 18, 2025.json'
};

// --- Helpers ---
const envPath = path.resolve(process.cwd(), '.env.local');

function loadEnv() {
    if (!fs.existsSync(envPath)) {
        console.error('.env.local not found!');
        process.exit(1);
    }
    const content = fs.readFileSync(envPath, 'utf-8');
    const env: any = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
        }
    });
    return env;
}

interface SystemData extends Omit<System, 'id' | 'sectorId' | 'ownerId'> {
    originalId?: string;
}

const distSq = (a: { x: number, y: number }, b: { x: number, y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

async function main() {
    console.log('--- Generating Strategic Graph Map ---');
    const env = loadEnv();

    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const DB_ID = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
    const COLL_PLANETS = 'planets';

    let systems: SystemData[] = [];

    // 1. Load Core Sectors
    for (const [theatre, filename] of Object.entries(JSON_FILES)) {
        const filePath = path.resolve(process.cwd(), filename);
        if (!fs.existsSync(filePath)) continue;

        console.log(`Loading ${theatre}...`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const sourceSystems = data.system || {};

        const offset = THEATRE_OFFSETS[theatre as keyof typeof THEATRE_OFFSETS];

        Object.entries(sourceSystems).forEach(([id, val]: [string, any]) => {
            if (typeof val.x !== 'number') return;
            systems.push({
                type: 'system',
                name: val.name,
                x: val.x + offset.x,
                y: val.y + offset.y,
                theatreId: theatre as any,
                region_id: theatre,
                archetype_tag: 'standard',
                originalId: id,
                attributes: val.attributes || {},
                isBridge: false
            });
        });
    }

    // 2. Generate Central Basin (Procedural)
    console.log('Generating Central Basin...');
    // Shift center slightly towards Beta/Gamma (+X, +Y)
    const basinCenter = { x: THEATRE_OFFSETS['central'].x + 6, y: THEATRE_OFFSETS['central'].y + 6 };
    const basinRadius = 6;
    for (let i = 0; i < 15; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * basinRadius;
        const bx = Math.round(basinCenter.x + Math.cos(angle) * r);
        const by = Math.round(basinCenter.y + Math.sin(angle) * r);

        if (!systems.find(s => s.x === bx && s.y === by)) {
            systems.push({
                type: 'system',
                name: `Basin-Sigma-${i}`,
                x: bx,
                y: by,
                theatreId: 'bridge',
                region_id: 'central_basin',
                archetype_tag: 'basin',
                trade_weight: 1.5,
                hazard_level: 0.2
            });
        }
    }

    // Helper to find closest systems between regions
    const getClosestPair = (r1: string, r2: string) => {
        const g1 = systems.filter(s => s.region_id === r1);
        const g2 = systems.filter(s => s.region_id === r2);
        let minD = Infinity;
        let pair: [SystemData, SystemData] | null = null;
        for (const s1 of g1) {
            for (const s2 of g2) {
                const d = distSq(s1, s2);
                if (d < minD) {
                    minD = d;
                    pair = [s1, s2];
                }
            }
        }
        return pair;
    };

    // Helper to create line of systems
    const createChain = (s1: SystemData, s2: SystemData, count: number, tag: ArchetypeTag, namePrefix: string) => {
        const chain: SystemData[] = [];
        for (let i = 1; i <= count; i++) {
            const t = i / (count + 1);
            const x = Math.round(s1.x + (s2.x - s1.x) * t);
            const y = Math.round(s1.y + (s2.y - s1.y) * t);

            if (!systems.find(s => s.x === x && s.y === y)) {
                const sys: SystemData = {
                    type: 'system',
                    name: `${namePrefix}-${i}`,
                    x, y,
                    theatreId: 'bridge',
                    region_id: 'connector',
                    archetype_tag: tag,
                    isBridge: true
                };
                systems.push(sys);
                chain.push(sys);
            }
        }
        return chain;
    };

    // Helper to generate a ring
    const generateRing = (radius: number, count: number, namePrefix: string, baseTag: ArchetypeTag, region: string, pirateChance: number) => {
        const step = (Math.PI * 2) / count;
        for (let i = 0; i < count; i++) {
            const angle = step * i;
            const rx = Math.round(basinCenter.x + Math.cos(angle) * radius);
            const ry = Math.round(basinCenter.y + Math.sin(angle) * radius);

            if (!systems.find(s => s.x === rx && s.y === ry)) {
                // Determine archetype (Pirate/Smuggler chance)
                const isPirate = Math.random() < pirateChance;
                const sysTag = isPirate ? 'void' : baseTag; // 'void' renders dark red/black

                systems.push({
                    type: 'system',
                    name: `${namePrefix}-${i + 1}`,
                    x: rx, y: ry,
                    theatreId: 'bridge',
                    region_id: region,
                    archetype_tag: sysTag,
                    trade_weight: isPirate ? 0.2 : 1.2,
                    hazard_level: isPirate ? 0.8 : 0.0,
                    defense_modifier: isPirate ? 2.0 : 1.0
                });
            }
        }
    };

    // Generate Rings (Denser + Pirates)
    console.log('Generating Central Rings (Dense)...');
    generateRing(10, 24, 'Inner-Ring', 'standard', 'inner_ring', 0.3); // 30% Pirate
    generateRing(18, 48, 'Outer-Ring', 'standard', 'outer_ring', 0.4); // 40% Pirate

    // NEW: Smuggler Routes (Hidden Void Chains between Rings)
    console.log('Generating Smuggler Routes...');
    const innerRingSys = systems.filter(s => s.region_id === 'inner_ring');
    const outerRingSys = systems.filter(s => s.region_id === 'outer_ring');

    // Create 4 random smuggler paths
    for (let i = 0; i < 4; i++) {
        // Pick random start/end that are roughly aligned but offset
        const s1 = innerRingSys[Math.floor(Math.random() * innerRingSys.length)];
        // Find an outer system that is somewhat close but not direct radial line? 
        // Just random close one
        let closest = outerRingSys[0];
        let minD = Infinity;
        for (const s2 of outerRingSys) {
            const d = distSq(s1, s2);
            if (d < minD && d > 25) { // Ensure some distance for a chain
                minD = d; closest = s2;
            }
        }
        // Actually random pair might be better for "hard to find"
        const s2 = outerRingSys[Math.floor(Math.random() * outerRingSys.length)];

        if (distSq(s1, s2) < 200) { // Limit length
            const chain = createChain(s1, s2, 3, 'void', `Smuggler-Run-${i}`);
            chain.forEach(s => { s.hazard_level = 0.9; s.trade_weight = 2.0; }); // High risk high reward
        }
    }



    // 3. Generate Specific Connectors (Archetypes)

    // 3. Generate Global Connectivity
    console.log('Generating Global Trade Spines & Pirate Clusters...');

    const clusters = ['alpha', 'beta', 'omicron', 'gamma'];

    // Helper to get edge systems (Inner/Outer)
    const getEdgeSystem = (region: string, edge: 'inner' | 'outer') => {
        const RegSystems = systems.filter(s => s.region_id === region);
        if (RegSystems.length === 0) return null;

        // Simplified centroid logic
        const cx = RegSystems.reduce((sum, s) => sum + s.x, 0) / RegSystems.length;
        const cy = RegSystems.reduce((sum, s) => sum + s.y, 0) / RegSystems.length;

        // Sort by distance to center. Inner = closest, Outer = furthest
        RegSystems.sort((a, b) => distSq(a, { x: cx, y: cy }) - distSq(b, { x: cx, y: cy }));

        return edge === 'inner' ? RegSystems[0] : RegSystems[RegSystems.length - 1];
    };

    // REGIONAL FORTRESSES (Alpha, Beta, Omicron)
    // Gamma has Helms Deep separately.
    const regions = [
        { id: 'alpha', name: 'Iron Citadel', def: 3.5 },
        { id: 'beta', name: 'Obsidian Gate', def: 4.0 },
        { id: 'omicron', name: 'Skull Harbour', def: 2.5 }
    ];

    regions.forEach(reg => {
        const edge = getEdgeSystem(reg.id, 'inner');
        if (edge) {
            // Place towards center (0,0) approx, or just manual offset based on region typical pos
            // Alpha top left, Beta top right, Omicron bot right.
            // Vector to center:
            const steps = 3;
            const dx = -edge.x;
            const dy = -edge.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const ndx = dx / len;
            const ndy = dy / len;

            const fx = Math.round(edge.x + ndx * 5); // 5 units inward
            const fy = Math.round(edge.y + ndy * 5);

            systems.push({
                type: 'system', name: reg.name, x: fx, y: fy,
                theatreId: reg.id, region_id: 'fortress_gate', archetype_tag: 'fortress',
                defense_modifier: reg.def,
                hyperlaneTo: [{ systemId: 'PENDING', x: edge.x, y: edge.y }]
            });
            // Ensure backlink? (Will be handled by visualizer or requires explicit ID push if we had IDs)
            // For now just placement.
            // Let's create a chain to it for visual link
            createChain({ x: fx, y: fy } as SystemData, edge, 1, 'bridge', `${reg.name}-Aprch`);
        }
    });

    // A. Inner Trade Spine (Clockwise: A->B->O->G)
    for (let i = 0; i < 4; i++) {
        const r1 = clusters[i];
        const r2 = clusters[(i + 1) % 4];
        const s1 = getEdgeSystem(r1, 'inner');
        const s2 = getEdgeSystem(r2, 'inner');
        if (s1 && s2) createChain(s1, s2, 6, 'spine', `Inner-Spine-${r1}-${r2}`);
    }

    // B. Outer Trade Spine (Clockwise: A->B->O->G)
    for (let i = 0; i < 4; i++) {
        const r1 = clusters[i];
        const r2 = clusters[(i + 1) % 4];
        const s1 = getEdgeSystem(r1, 'outer');
        const s2 = getEdgeSystem(r2, 'outer');
        if (s1 && s2) createChain(s1, s2, 12, 'spine', `Outer-Spine-${r1}-${r2}`);
    }

    // B. Wormhole Canal (Alpha <-> Omicron)
    console.log('Generating Wormhole Canal...');
    const aoPair = getClosestPair('alpha', 'omicron');
    if (aoPair) createChain(aoPair[0], aoPair[1], 4, 'canal', 'Wormhole');

    // C. The "Gap" Pirate Clusters (Between Inner/Outer Spines)
    console.log('Generating Gap Pirate Clusters...');
    for (let i = 0; i < 6; i++) {
        // Random point between rings?
        // Or between spine nodes.
        // Let's just scatter them in the "Void" areas (Radius 25-35 approx)
        const angle = Math.random() * Math.PI * 2;
        const dist = 28 + Math.random() * 8;
        const px = Math.round(Math.cos(angle) * dist);
        const py = Math.round(Math.sin(angle) * dist);

        if (!systems.find(s => s.x === px && s.y === py)) {
            systems.push({
                type: 'system', name: `Gap-Raider-${i}`, x: px, y: py,
                theatreId: 'bridge', region_id: 'pirate_gap', archetype_tag: 'void',
                hazard_level: 0.7, trade_weight: 0.3
            });
            // Cluster effect
            systems.push({ type: 'system', name: `Gap-Outpost-${i}`, x: px + 1, y: py + 1, theatreId: 'bridge', region_id: 'pirate_gap', archetype_tag: 'void' });
        }
    }

    // D. Southern Raiders (Above Cape Horn)
    console.log('Generating Southern Raiders...');
    // Cape Horn is at bottom. Raiders above it (-y direction from bottom, so smaller y value than max)
    // Actually Cape Horn is around Y=40. Raiders at Y=30?
    const raiderY = 32;
    const raiderX = 0; // Center
    systems.push({ type: 'system', name: 'Raider King', x: raiderX, y: raiderY, theatreId: 'bridge', region_id: 'southern_raiders', archetype_tag: 'fortress' });
    createChain({ x: -5, y: raiderY } as SystemData, { x: 5, y: raiderY } as SystemData, 3, 'void', 'Raider-Line');

    // E. Caribbean Cluster (Gamma <-> Omicron)
    // Replaces Deep Void with a scattered pirate archipelago.
    console.log('Generating Caribbean Cluster (Gamma-Omicron)...');
    const goPair = getClosestPair('gamma', 'omicron');
    if (goPair) {
        const centerX = (goPair[0].x + goPair[1].x) / 2;
        const centerY = (goPair[0].y + goPair[1].y) / 2;

        // Generate scattered islands
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 3 + Math.random() * 6;
            const px = Math.round(centerX + Math.cos(angle) * dist);
            const py = Math.round(centerY + Math.sin(angle) * dist);

            if (!systems.find(s => s.x === px && s.y === py)) {
                systems.push({
                    type: 'system', name: `Tortuga-${i + 1}`, x: px, y: py,
                    theatreId: 'bridge', region_id: 'caribbean', archetype_tag: 'void', // Re-using void tag for now or 'standard'
                    hazard_level: 0.8,
                    trade_weight: 0.5
                });
            }
        }
    }

    // E. Northern Fortress Gate (Alpha-Beta)
    // Accessible only via Outer Ring
    console.log('Generating Northern Fortress...');
    const northX = (THEATRE_OFFSETS['alpha'].x + THEATRE_OFFSETS['beta'].x) / 2 + 12;
    const northY = -5;
    const northernGate: SystemData = {
        type: 'system', name: 'Northern Gate', x: northX, y: northY,
        theatreId: 'bridge', region_id: 'northern_fortress', archetype_tag: 'fortress', defense_modifier: 4.0
    };
    systems.push(northernGate);

    // Link ONLY to Outer Ring
    const outerRing = systems.filter(s => s.region_id === 'outer_ring');
    let closestRing = outerRing[0];
    let minD = Infinity;
    for (const r of outerRing) {
        const d = distSq(northernGate, r);
        if (d < minD) { minD = d; closestRing = r; }
    }
    if (closestRing) {
        if (!northernGate.hyperlaneTo) northernGate.hyperlaneTo = [];
        if (!closestRing.hyperlaneTo) closestRing.hyperlaneTo = [];
        northernGate.hyperlaneTo.push({ systemId: 'PENDING', x: closestRing.x, y: closestRing.y });
        closestRing.hyperlaneTo.push({ systemId: 'PENDING', x: northernGate.x, y: northernGate.y });
    }
    // Protected Northern Basin
    systems.push({ type: 'system', name: 'Valhalla', x: northX, y: northY - 4, theatreId: 'bridge', region_id: 'northern_basin', archetype_tag: 'basin' });

    // NEW: Radial Trade Lanes (Basin <-> Major Clusters)
    console.log('Generating Radial Trade Lanes...');

    // 1. Basin -> Alpha (Industrial)
    const basinAlphaPair = getClosestPair('central_basin', 'alpha');
    if (basinAlphaPair) createChain(basinAlphaPair[0], basinAlphaPair[1], 2, 'standard', 'Ind.Corridor');

    // 2. Basin -> Gamma (Supply)
    const basinGammaPair = getClosestPair('central_basin', 'gamma');
    if (basinGammaPair) createChain(basinGammaPair[0], basinGammaPair[1], 2, 'standard', 'Supply.Line');

    // 3. Basin -> Omicron (Smuggler)
    const basinOmicronPair = getClosestPair('central_basin', 'omicron');
    if (basinOmicronPair) {
        const chain = createChain(basinOmicronPair[0], basinOmicronPair[1], 2, 'void', 'Smuggler.Run');
        chain.forEach(s => s.hazard_level = 0.5);
    }

    // F. Treaty Gate (Basin <-> Beta)
    console.log('Generating Treaty Gate (Basin-Beta)...');
    const basinBetaPair = getClosestPair('central_basin', 'beta');
    if (basinBetaPair) {
        createChain(basinBetaPair[0], basinBetaPair[1], 1, 'gate', 'Bosporus');
    }

    // G. Fortress Gate (Gamma Extension)
    console.log('Generating Fortress Gate...');
    // Find edge of Gamma away from center
    const gammaSystems = systems.filter(s => s.region_id === 'gamma');
    const farGamma = gammaSystems.reduce((prev, curr) => curr.x < prev.x ? curr : prev); // Furthest left

    // Create Gate
    const gateX = farGamma.x + 3; // Shift Inward
    const gateY = farGamma.y - 3; // Shift Up/Inward
    const gateSys: SystemData = {
        type: 'system',
        name: 'Helms Deep',
        x: gateX, y: gateY,
        theatreId: 'gamma',
        region_id: 'fortress_gate',
        archetype_tag: 'fortress',
        defense_modifier: 3.0
    };
    systems.push(gateSys);

    // Create Sub-region behind gate
    const subX = gateX - 4;
    systems.push({
        type: 'system', name: 'Sanctuary 1', x: subX, y: gateY + 1, theatreId: 'gamma', region_id: 'fortress_inner', archetype_tag: 'standard'
    });
    systems.push({
        type: 'system', name: 'Sanctuary 2', x: subX, y: gateY - 1, theatreId: 'gamma', region_id: 'fortress_inner', archetype_tag: 'standard'
    });

    // SHIFT ALL SYSTEMS DOWN (Except Cape Horn which is not generated yet)
    // User requested move down by 3 hexes.
    systems.forEach(s => s.y += 3);

    // H. Long Bypass (Outer Rim) - Relocated to Bottom (Gamma-Omicron)
    // User requested "Cape Horn" basin connecting to Outer Ring.
    const deepGamma = systems.filter(s => s.region_id === 'gamma').reduce((p, c) => c.y > p.y ? c : p);
    const deepOmicron = systems.filter(s => s.region_id === 'omicron').reduce((p, c) => c.y > p.y ? c : p);

    const bottomMidX = (deepGamma.x + deepOmicron.x) / 2;
    const bottomMidY = Math.max(deepGamma.y, deepOmicron.y) + 2; // Reduced offset to keep Cape Horn roughly in place

    // Create the Passage
    const capeHorn: SystemData = {
        type: 'system', name: 'Cape Horn', x: bottomMidX, y: bottomMidY,
        theatreId: 'bridge', archetype_tag: 'basin', region_id: 'cape_horn'
    };
    systems.push(capeHorn);
    systems.push({ type: 'system', name: 'Cape West', x: (deepGamma.x + bottomMidX) / 2, y: (deepGamma.y + bottomMidY) / 2, theatreId: 'bridge', archetype_tag: 'bridge' });
    systems.push({ type: 'system', name: 'Cape East', x: (deepOmicron.x + bottomMidX) / 2, y: (deepOmicron.y + bottomMidY) / 2, theatreId: 'bridge', archetype_tag: 'bridge' });

    // Link Cape Horn to Outer Ring
    const outerRingSystems = systems.filter(s => s.region_id === 'outer_ring');
    let closestRingSys = outerRingSystems[0];
    let minDist = Infinity;
    for (const sys of outerRingSystems) {
        const d = distSq(capeHorn, sys);
        if (d < minDist) {
            minDist = d;
            closestRingSys = sys;
        }
    }

    if (closestRingSys) {
        // Create a visual Hyperlane link
        if (!capeHorn.hyperlaneTo) capeHorn.hyperlaneTo = [];
        if (!closestRingSys.hyperlaneTo) closestRingSys.hyperlaneTo = [];

        capeHorn.hyperlaneTo.push({ systemId: 'PENDING', x: closestRingSys.x, y: closestRingSys.y });
        closestRingSys.hyperlaneTo.push({ systemId: 'PENDING', x: capeHorn.x, y: capeHorn.y });
        console.log(`Linked Cape Horn to Outer Ring: ${closestRingSys.name}`);
    }

    console.log(`Total Systems: ${systems.length}`);

    // 4. Upload
    // We assume clean state conceptually, but practically we append/upsert.
    // For "Iterative" dev, we should probably clear.
    // But `count_sector_planets` showed 465.

    // Let's rely on DB clearing if needed, or just run this.
    // We won't clear in script to avoid mass accidental deletion unless flag passed.
    // But for this task, we want to SEE the result.
    // So let's delete briefly? No, Appwrite rate limits deletion.
    // We'll write new IDs. User can nuke collection in console if messy.

    // Batch upload
    let count = 0;
    for (const sys of systems) {
        try {
            await db.createDocument(DB_ID, COLL_PLANETS, ID.unique(), {
                name: sys.name,
                x: sys.x,
                y: sys.y,
                type: 'system',
                attributes: JSON.stringify({
                    region_id: sys.region_id,
                    archetype_tag: sys.archetype_tag,
                    defense_modifier: sys.defense_modifier,
                    active_hazards: sys.hazard_level ? ['high_gravity'] : [], // Mock hazard
                    trade_value: sys.trade_weight,
                    hyperlaneTo: sys.hyperlaneTo,
                    isBridge: sys.isBridge
                }),
                owner_faction_id: null
            });
            count++;
            if (count % 50 === 0) process.stdout.write('.');
        } catch (e) {
            // Ignore duplication errors if any
        }
        await new Promise(r => setTimeout(r, 20)); // Rate limit
    }
    console.log(`\nUploaded ${count} systems.`);
}

main().catch(console.error);

