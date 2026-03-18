import fs from 'node:fs';
import path from 'node:path';
import { Client, Databases } from 'node-appwrite';

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

async function listDatabases() {
    const env = loadEnv();
    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);

    try {
        console.log('Listing all databases...');
        const dbs = await db.list();
        console.log(`Found ${dbs.total} databases:`);
        dbs.databases.forEach(d => console.log(`- ${d.name} (ID: ${d.$id})`));

        // Also check collections in the current configured DB
        const currentDbId = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
        if (currentDbId) {
            console.log(`\nChecking collections in configured DB '${currentDbId}':`);
            try {
                const colls = await db.listCollections(currentDbId);
                colls.collections.forEach(c => console.log(`  - ${c.name} (ID: ${c.$id})`));
            } catch (e) {
                console.log(`  Error listing collections: ${e.message}`);
            }
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

listDatabases();
