import fs from 'node:fs';
import path from 'node:path';
import { Client, Databases, ID } from 'node-appwrite';

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

async function create() {
    const env = loadEnv();
    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const dbId = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
    const collId = 'world_state';

    console.log('Creating document in', dbId, collId);
    const data = {
        day: 1,
        resources: JSON.stringify({ economic: 200, military: 25, intel: 10, public_opinion: 50, science: 5 })
    };
    console.log('Data:', data);

    try {
        const doc = await db.createDocument(dbId, collId, ID.unique(), data);
        console.log('Success!', doc.$id);
    } catch (e) {
        console.error('Error:', e);
    }
}

create();
