import fs from 'node:fs';
import path from 'node:path';
import { Client, Databases, Query } from 'node-appwrite';

const envPath = path.resolve(process.cwd(), '.env.local');
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

const client = new Client()
    .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
    .setKey(env.APPWRITE_API_KEY);

const db = new Databases(client);

const SECTORS = {
    Alpha: { xMin: 0, xMax: 20, yMin: 0, yMax: 20 },
    Beta: { xMin: 20, xMax: 40, yMin: 0, yMax: 20 },
    Gamma: { xMin: 0, xMax: 20, yMin: 20, yMax: 40 },
    Omicron: { xMin: 20, xMax: 40, yMin: 20, yMax: 40 },
};

async function countPlanets() {
    try {
        let allPlanets = [];
        let cursor = null;

        // Fetch all planets (pagination)
        while (true) {
            const queries = [Query.limit(100)];
            if (cursor) {
                queries.push(Query.cursorAfter(cursor));
            }

            const res = await db.listDocuments(env.NEXT_PUBLIC_APPWRITE_DATABASE_ID, 'planets', queries);
            allPlanets.push(...res.documents);

            if (res.documents.length < 100) break;
            cursor = res.documents[res.documents.length - 1].$id;
        }

        console.log(`Total Planets Fetched: ${allPlanets.length}`);

        const counts = { Alpha: 0, Beta: 0, Gamma: 0, Omicron: 0, OutOfBounds: 0 };

        allPlanets.forEach(p => {
            let placed = false;
            for (const [sector, bounds] of Object.entries(SECTORS)) {
                if (p.x >= bounds.xMin && p.x < bounds.xMax &&
                    p.y >= bounds.yMin && p.y < bounds.yMax) {
                    counts[sector]++;
                    placed = true;
                    break;
                }
            }
            if (!placed) counts.OutOfBounds++;
        });

        console.log('--- Planet Counts by Sector (20x20 Grid) ---');
        console.log(`Alpha:   ${counts.Alpha}`);
        console.log(`Beta:    ${counts.Beta}`);
        console.log(`Gamma:   ${counts.Gamma}`);
        console.log(`Omicron: ${counts.Omicron}`);
        console.log(`--------------------------------------------`);
        console.log(`Out of Bounds (Hidden): ${counts.OutOfBounds}`);

    } catch (e) {
        console.error(e);
    }
}

countPlanets();
