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

// Mock dependencies
const COLL_STATE = 'world_state';
const COLL_FACTIONS = 'factions';

async function main() {
    console.log('--- Verifying Server State Logic ---');

    console.log('1. Fetching State...');
    const stateRes = await db.listDocuments(DB_ID, COLL_STATE, [Query.limit(1)]);
    console.log(`State found: ${stateRes.total}`);

    console.log('2. Fetching Planets...');
    const planetsRes = await db.listDocuments(DB_ID, 'planets', [Query.limit(100)]);
    console.log(`Planets found: ${planetsRes.total}`);
    // Check for bad data
    planetsRes.documents.forEach(p => {
        if (!p.name) console.warn(`Planet ${p.$id} has no name`);
        if (p.attributes && typeof p.attributes === 'string') {
            try { JSON.parse(p.attributes) } catch (e) { console.error(`Planet ${p.$id} has invalid JSON attributes`); }
        }
    });

    console.log('3. Fetching Factions...');
    const factionsRes = await db.listDocuments(DB_ID, COLL_FACTIONS);
    console.log(`Factions found: ${factionsRes.total}`);

    console.log('4. Simulating Economy Update...');
    // We can't easily import the complex logic with deep dependencies in this simple script without compiling everything.
    // But we can check if the faction data crucial for it exists.
    const myFactionId = '692db2fa000cd91f9852';
    const myFaction = factionsRes.documents.find(f => f.$id === myFactionId);

    if (!myFaction) {
        console.error(`CRITICAL: Player faction ${myFactionId} NOT FOUND! This will crash getState.`);
    } else {
        console.log('Player faction found.');
        if (!myFaction.resources) console.error('Player faction has no resources field.');
        try {
            JSON.parse(myFaction.resources);
            console.log('Resources JSON is valid.');
        } catch (e) { console.error('Resources JSON invalid'); }
    }

    // Check for other collections used in getState
    try {
        console.log('5. Fetching Crises...');
        await db.listDocuments(DB_ID, 'crises', [Query.limit(1)]);
        console.log('Crises collection OK.');
    } catch (e: any) { console.error('FAILED to fetch crises:', e.message); }

    try {
        console.log('6. Fetching Events...');
        await db.listDocuments(DB_ID, 'events', [Query.limit(1)]);
        console.log('Events collection OK.');
    } catch (e: any) { console.error('FAILED to fetch events:', e.message); }

    console.log('Verification Complete.');
}

main().catch(console.error);

