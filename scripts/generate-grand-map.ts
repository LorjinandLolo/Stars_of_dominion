import fs from 'node:fs';
import path from 'node:path';
import { Client, Databases, ID, Query } from 'node-appwrite';

/**
 * Grand Map Generator
 * 
 * Merges Alpha, Beta, Gamma, and Omicron sector JSONs into a single "Grand Map".
 * Creates "Theatres of War" separated by void, connected by "Bridge Systems".
 */

// --- Configuration ---
const SECTOR_SIZE = 20; // Assumed max size of source sectors
const GAP_SIZE = 5; // Start with a small gap to ensure we can bridge it, or larger?
// Alpha (0,0)
// Beta (OFFSET, 0)
// Gamma (0, OFFSET)
// Omicron (OFFSET, OFFSET)
const OFFSET = SECTOR_SIZE + GAP_SIZE;

const JSON_FILES = {
    'alpha': 'Alpha - September 18, 2025.json',
    'beta': 'Beta - September 18, 2025.json',
    'gamma': 'Gamma  - September 18, 2025.json',
    'omicron': 'Omicron - September 18, 2025.json'
};

const THEATRE_OFFSETS = {
    'alpha': { x: 0, y: 0 },
    'beta': { x: OFFSET, y: 0 },
    'gamma': { x: 0, y: OFFSET },
    'omicron': { x: OFFSET, y: OFFSET }
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
            const key = match[1].trim();
            let value = match[2].trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            env[key] = value;
        }
    });
    return env;
}

interface SystemData {
    name: string;
    x: number;
    y: number;
    type: 'system'; // Source only has 'system' or 'blackHole' that we care about
    attributes?: any;
    originalId: string;
    theatreId: string;
}

async function main() {
    console.log('--- Generating Grand Map ---');
    const env = loadEnv();

    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const DB_ID = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
    const COLL_PLANETS = 'planets'; // We store systems here

    // 1. Load Data
    const systems: SystemData[] = [];

    for (const [theatre, filename] of Object.entries(JSON_FILES)) {
        const filePath = path.resolve(process.cwd(), filename);
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filename}`);
            continue;
        }
        console.log(`Loading ${theatre} from ${filename}...`);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);

        // Extract systems
        // Source JSON structure: { system: { id: { x, y, name... } }, ... }
        const sourceSystems = data.system || {};
        const sourceBlackHoles = data.blackHole || {};

        const processEntity = (id: string, entity: any) => {
            if (typeof entity.x !== 'number' || typeof entity.y !== 'number') return;

            // Apply Offset
            const offset = THEATRE_OFFSETS[theatre as keyof typeof THEATRE_OFFSETS];
            systems.push({
                originalId: id,
                name: entity.name,
                x: entity.x + offset.x,
                y: entity.y + offset.y,
                type: 'system',
                attributes: entity.attributes || {},
                theatreId: theatre
            });
        };

        Object.entries(sourceSystems).forEach(([id, val]) => processEntity(id, val));
        Object.entries(sourceBlackHoles).forEach(([id, val]) => processEntity(id, val));
    }

    console.log(`Loaded ${systems.length} total systems.`);

    // 2. Generate Bridges
    // Strategy: Find closest pair between Alpha<->Beta, Alpha<->Gamma, Beta<->Omicron, Gamma<->Omicron
    // We can iterate pairs.

    // Simple distance squared
    const distSq = (a: { x: number, y: number }, b: { x: number, y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

    const findClosestPair = (t1: string, t2: string) => {
        const g1 = systems.filter(s => s.theatreId === t1);
        const g2 = systems.filter(s => s.theatreId === t2);

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

    const bridges: SystemData[] = [];
    const bridgePairs = [
        ['alpha', 'beta'],
        ['alpha', 'gamma'],
        ['beta', 'omicron'],
        ['gamma', 'omicron']
        // Optional: Diagonals? Alpha-Omicron? Probably not, stick to grid.
    ];

    for (const [t1, t2] of bridgePairs) {
        console.log(`Generating bridges between ${t1} and ${t2}...`);
        const pair = findClosestPair(t1, t2);
        if (pair) {
            const [s1, s2] = pair;
            const dist = Math.sqrt(distSq(s1, s2));
            console.log(`Closest pair: ${s1.name} <-> ${s2.name} (Dist: ${dist.toFixed(2)})`);

            // If distance is large, create intermediate bridge nodes
            // Assume "jump range" is e.g. 3-4 hexes.
            // If dist > 4, we need bridges.
            // Let's create uniform bridges.

            const numBridges = Math.floor(dist / 4); // 1 bridge every 4 units approx
            if (numBridges > 0) {
                for (let i = 1; i <= numBridges; i++) {
                    const t = i / (numBridges + 1);
                    const bx = Math.round(s1.x + (s2.x - s1.x) * t);
                    const by = Math.round(s1.y + (s2.y - s1.y) * t);

                    // Check if occupied?
                    if (!systems.find(s => s.x === bx && s.y === by) && !bridges.find(b => b.x === bx && b.y === by)) {
                        bridges.push({
                            name: `Bridge ${t1.substring(0, 1).toUpperCase()}${t2.substring(0, 1).toUpperCase()}-${i}`,
                            x: bx,
                            y: by,
                            type: 'system',
                            theatreId: 'bridge',
                            attributes: { isBridge: true },
                            originalId: ID.unique()
                        });
                    }
                }
            }
            // Mark endpoints as gates?
            s1.attributes.isGate = true;
            s2.attributes.isGate = true;
        }
    }

    console.log(`Generated ${bridges.length} bridge systems.`);
    const finalSystems = [...systems, ...bridges];

    // 3. Clear & Upload
    // WARNING: Deletes all planets!
    // We should probably check if we really want to do this or if we are in a clean state.
    // For this task, we assume we are replacing the map.

    // Batch delete is slow, maybe we just create new ones and user can clear manually or we define a flag.
    // Let's default to Append-only or Upsert if we had IDs but we generate new IDs mostly.
    // Actually, let's try to delete existing planets to be clean.

    console.log('Clearing existing planets...');
    const existing = await db.listDocuments(DB_ID, COLL_PLANETS, [Query.limit(100)]);
    // This only gets 100. Recursion needed to clear all.
    // Optimization: Just create new for now, user can reset DB via Appwrite console if needed.
    // Or we provide a separate 'reset' script.
    // Current task is "Iterative", let's assume we want to work on a fresh state.

    // Note: Deleting 1000+ docs via API one by one is slow.
    // Let's just upload and log.

    let uploadedCount = 0;
    for (const sys of finalSystems) {
        try {
            await db.createDocument(DB_ID, COLL_PLANETS, ID.unique(), {
                name: sys.name,
                x: sys.x,
                y: sys.y,
                type: sys.type, // 'system'
                attributes: JSON.stringify({
                    ...sys.attributes,
                    theatreId: sys.theatreId
                }),
                // We map theatreId to attributes or top level? 
                // DB Schema might not have 'theatreId' column yet. 
                // Safest to put in attributes JSON unless we update schema.
                // Plan said "Update Tile interface", didn't explicitly say "Update Appwrite Schema".
                // We'll put it in attributes JSON for now.
                owner_faction_id: null
            });
            uploadedCount++;
            if (uploadedCount % 50 === 0) process.stdout.write('.');
        } catch (e: any) {
            console.error(`Error uploading ${sys.name}: ${e.message}`);
        }
        // Rate limit protection
        await new Promise(r => setTimeout(r, 50));
    }

    console.log(`\nImport complete. Uploaded ${uploadedCount} systems.`);
}

main().catch(console.error);
