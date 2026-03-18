// @ts-nocheck
import { Client, Databases, Query } from 'node-appwrite';
import fs from 'node:fs';
import path from 'node:path';

// Mock environment
const envPath = path.resolve(process.cwd(), '.env.local');
const content = fs.readFileSync(envPath, 'utf-8');
const env: any = {};
content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
});

const client = new Client()
    .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
    .setKey(env.APPWRITE_API_KEY);

const db = new Databases(client);
const DB_ID = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;

async function main() {
    console.log('--- Inspecting Planet Data ---');

    const planets = await db.listDocuments(DB_ID, 'planets', [Query.limit(100)]); // Just check a sample
    console.log(`Checking ${planets.documents.length} planets...`);

    let withArchetype = 0;
    let withoutArchetype = 0;
    const coords = new Set();
    let duplicates = 0;

    for (const p of planets.documents) {
        const key = `${p.x},${p.y}`;
        if (coords.has(key)) duplicates++;
        coords.add(key);

        let attrs: any = {};
        if (typeof p.attributes === 'string') {
            try { attrs = JSON.parse(p.attributes); } catch (e) { }
        } else {
            attrs = p.attributes || {};
        }

        if (attrs.archetype_tag) {
            withArchetype++;
            console.log(`[${p.name}] Tag: ${attrs.archetype_tag} | Bridge: ${attrs.isBridge}`);
        } else {
            withoutArchetype++;
            console.log(`[${p.name}] NO TAG`);
        }
    }

    console.log(`\nResults:`);
    console.log(`Total Scanned: ${planets.documents.length}`);
    console.log(`With Archetype: ${withArchetype}`);
    console.log(`Without Archetype: ${withoutArchetype}`);
    console.log(`Duplicate Coords in Sample: ${duplicates}`);
}

main().catch(console.error);

