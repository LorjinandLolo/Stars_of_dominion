"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_appwrite_1 = require("node-appwrite");
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
const OFFSET = 45; // Spacing between theatre origins
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
const envPath = node_path_1.default.resolve(process.cwd(), '.env.local');
function loadEnv() {
    if (!node_fs_1.default.existsSync(envPath)) {
        console.error('.env.local not found!');
        process.exit(1);
    }
    const content = node_fs_1.default.readFileSync(envPath, 'utf-8');
    const env = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
        }
    });
    return env;
}
const distSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
async function main() {
    console.log('--- Generating Strategic Graph Map ---');
    const env = loadEnv();
    const client = new node_appwrite_1.Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);
    const db = new node_appwrite_1.Databases(client);
    const DB_ID = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
    const COLL_PLANETS = 'planets';
    let systems = [];
    // 1. Load Core Sectors
    for (const [theatre, filename] of Object.entries(JSON_FILES)) {
        const filePath = node_path_1.default.resolve(process.cwd(), filename);
        if (!node_fs_1.default.existsSync(filePath))
            continue;
        console.log(`Loading ${theatre}...`);
        const data = JSON.parse(node_fs_1.default.readFileSync(filePath, 'utf-8'));
        const sourceSystems = data.system || {};
        const offset = THEATRE_OFFSETS[theatre];
        Object.entries(sourceSystems).forEach(([id, val]) => {
            if (typeof val.x !== 'number')
                return;
            systems.push({
                type: 'system',
                name: val.name,
                x: val.x + offset.x,
                y: val.y + offset.y,
                theatreId: theatre,
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
    const basinCenter = THEATRE_OFFSETS['central'];
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
    const getClosestPair = (r1, r2) => {
        const g1 = systems.filter(s => s.region_id === r1);
        const g2 = systems.filter(s => s.region_id === r2);
        let minD = Infinity;
        let pair = null;
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
    const createChain = (s1, s2, count, tag, namePrefix) => {
        const chain = [];
        for (let i = 1; i <= count; i++) {
            const t = i / (count + 1);
            const x = Math.round(s1.x + (s2.x - s1.x) * t);
            const y = Math.round(s1.y + (s2.y - s1.y) * t);
            if (!systems.find(s => s.x === x && s.y === y)) {
                const sys = {
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
    // 3. Generate Specific Connectors (Archetypes)
    // A. Hyperlane Throat (Alpha <-> Beta)
    console.log('Generating Hyperlane Throat (Alpha-Beta)...');
    const abPair = getClosestPair('alpha', 'beta');
    if (abPair) {
        // Narrow 1-wide chain
        createChain(abPair[0], abPair[1], 3, 'throat', 'Hormuz');
    }
    // B. Wormhole Canal (Alpha <-> Omicron)
    console.log('Generating Wormhole Canal (Alpha-Omicron)...');
    const aoPair = getClosestPair('alpha', 'omicron');
    if (aoPair) {
        // Direct link, modify attributes
        aoPair[0].archetype_tag = 'canal';
        aoPair[1].archetype_tag = 'canal';
        aoPair[0].name = "Panama Gate Alpha";
        aoPair[1].name = "Panama Gate Omicron";
        // Bidirectional link
        const link1 = { systemId: 'TBD', x: aoPair[1].x, y: aoPair[1].y }; // Will resolve IDs later if needed, or use coords
        const link2 = { systemId: 'TBD', x: aoPair[0].x, y: aoPair[0].y };
        if (!aoPair[0].hyperlaneTo)
            aoPair[0].hyperlaneTo = [];
        if (!aoPair[1].hyperlaneTo)
            aoPair[1].hyperlaneTo = [];
        aoPair[0].hyperlaneTo.push({ systemId: 'PENDING', x: aoPair[1].x, y: aoPair[1].y });
        aoPair[1].hyperlaneTo.push({ systemId: 'PENDING', x: aoPair[0].x, y: aoPair[0].y });
    }
    // C. Trade Spine (Beta <-> Omicron)
    console.log('Generating Trade Spine (Beta-Omicron)...');
    const boPair = getClosestPair('beta', 'omicron');
    if (boPair) {
        // Long chain
        const chain = createChain(boPair[0], boPair[1], 6, 'spine', 'SilkRoad');
        // Add trade weight
        chain.forEach(s => s.trade_weight = 2.0);
    }
    // D. Land Bridge (Alpha <-> Gamma)
    console.log('Generating Land Bridge (Alpha-Gamma)...');
    const agPair = getClosestPair('alpha', 'gamma');
    if (agPair) {
        // Mesh: 3 parallel lines approx
        // Main line
        createChain(agPair[0], agPair[1], 4, 'bridge', 'Poland');
        // Offset lines
        const s1_offset = { ...agPair[0], x: agPair[0].x + 2 };
        const s2_offset = { ...agPair[1], x: agPair[1].x + 2 };
        createChain(s1_offset, s2_offset, 4, 'bridge', 'Ukraine');
    }
    // E. Deep Void (Gamma <-> Omicron)
    console.log('Generating Deep Void (Gamma-Omicron)...');
    const goPair = getClosestPair('gamma', 'omicron');
    if (goPair) {
        // Sparse connection, high hazard
        const chain = createChain(goPair[0], goPair[1], 2, 'void', 'Sahara'); // Only 2 systems for large gap -> hard to jump?
        // Actually void means *hard* to cross. Maybe just 1 system in middle, creating big gaps.
        chain.forEach(s => {
            s.hazard_level = 0.8;
            s.name = `Void Outpost ${s.name.split('-')[2]}`;
        });
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
    const gateX = farGamma.x - 3;
    const gateY = farGamma.y;
    const gateSys = {
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
    // H. Long Bypass (Outer Rim)
    // Connect Alpha (Left) to Gamma (Bottom) via far outside path?
    // User requested "Cape of Good Hope".
    // Let's connect Beta -> Omicron via far right.
    // Standard spine is inner. Bypass is outer.
    const farBeta = systems.filter(s => s.region_id === 'beta').reduce((p, c) => c.x > p.x ? c : p);
    const farOmicron = systems.filter(s => s.region_id === 'omicron').reduce((p, c) => c.x > p.x ? c : p);
    // Create a curved path? Manually place a few waypoints.
    const midX = Math.max(farBeta.x, farOmicron.x) + 5;
    const midY = (farBeta.y + farOmicron.y) / 2;
    systems.push({ type: 'system', name: 'Cape 1', x: midX, y: (farBeta.y + midY) / 2, theatreId: 'bridge', archetype_tag: 'bridge' });
    systems.push({ type: 'system', name: 'Cape of Good Hope', x: midX, y: midY, theatreId: 'bridge', archetype_tag: 'bridge' });
    systems.push({ type: 'system', name: 'Cape 3', x: midX, y: (farOmicron.y + midY) / 2, theatreId: 'bridge', archetype_tag: 'bridge' });
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
            await db.createDocument(DB_ID, COLL_PLANETS, node_appwrite_1.ID.unique(), {
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
            if (count % 50 === 0)
                process.stdout.write('.');
        }
        catch (e) {
            // Ignore duplication errors if any
        }
        await new Promise(r => setTimeout(r, 20)); // Rate limit
    }
    console.log(`\nUploaded ${count} systems.`);
}
main().catch(console.error);
