import fs from 'node:fs';
import path from 'node:path';
import { Client, Databases, ID, Query } from 'node-appwrite';

const envPath = path.resolve(process.cwd(), '.env.local');

function loadEnv() {
    if (!fs.existsSync(envPath)) {
        console.error('.env.local not found!');
        process.exit(1);
    }
    const content = fs.readFileSync(envPath, 'utf-8');
    const env = {};
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

async function importGrandMap() {
    const env = loadEnv();
    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const dbId = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
    const collId = 'planets';

    // 1. Clear existing planets
    console.log('Clearing existing planets...');
    let existing = await db.listDocuments(dbId, collId, [Query.limit(100)]);
    while (existing.total > 0) {
        const promises = existing.documents.map(d => db.deleteDocument(dbId, collId, d.$id));
        await Promise.all(promises);
        console.log(`Deleted ${existing.documents.length} documents...`);
        existing = await db.listDocuments(dbId, collId, [Query.limit(100)]);
    }
    console.log('Collection cleared.');

    // 2. Define sectors and offsets
    const sectors = [
        { file: 'Alpha - September 18, 2025.json', offsetX: 0, offsetY: 0, name: 'Alpha Sector' },
        { file: 'Beta - September 18, 2025.json', offsetX: 25, offsetY: 0, name: 'Beta Sector' },
        { file: 'Gamma  - September 18, 2025.json', offsetX: 0, offsetY: 25, name: 'Gamma Sector' }, // Note the double space in filename if present
        { file: 'Omicron - September 18, 2025.json', offsetX: 25, offsetY: 25, name: 'Omicron Sector' },
    ];

    for (const sector of sectors) {
        console.log(`Importing ${sector.name} from ${sector.file}...`);
        try {
            const raw = fs.readFileSync(path.resolve(process.cwd(), sector.file), 'utf-8');
            const data = JSON.parse(raw);

            const entities = [];

            // Systems
            if (data.system) {
                Object.entries(data.system).forEach(([id, val]) => {
                    if (val.x !== undefined && val.y !== undefined) {
                        entities.push({
                            name: val.name,
                            x: val.x + sector.offsetX,
                            y: val.y + sector.offsetY,
                            type: 'system',
                            attributes: JSON.stringify({ ...val.attributes, original_sector: sector.name })
                        });
                    }
                });
            }

            // Black Holes
            if (data.blackHole) {
                Object.entries(data.blackHole).forEach(([id, val]) => {
                    if (val.x !== undefined && val.y !== undefined) {
                        entities.push({
                            name: val.name,
                            x: val.x + sector.offsetX,
                            y: val.y + sector.offsetY,
                            type: 'blackHole',
                            attributes: JSON.stringify({ ...val.attributes, original_sector: sector.name })
                        });
                    }
                });
            }

            console.log(`Found ${entities.length} entities in ${sector.name}. Uploading...`);

            // Batch upload
            for (let i = 0; i < entities.length; i += 10) {
                const batch = entities.slice(i, i + 10);
                await Promise.all(batch.map(ent =>
                    db.createDocument(dbId, collId, ID.unique(), ent)
                        .catch(e => console.error(`Failed to import ${ent.name}:`, e.message))
                ));
                process.stdout.write('.');
            }
            console.log('\nDone.');

        } catch (e) {
            console.error(`Error processing ${sector.file}:`, e.message);
        }
    }
    console.log('Grand Map Import Complete!');
}

importGrandMap();
