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
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            env[key] = value;
        }
    });
    return env;
}

async function verify() {
    const env = loadEnv();

    if (!env.NEXT_PUBLIC_APPWRITE_ENDPOINT || !env.NEXT_PUBLIC_APPWRITE_PROJECT || !env.APPWRITE_API_KEY) {
        console.error('Missing required environment variables in .env.local');
        console.log('Found:', Object.keys(env));
        process.exit(1);
    }

    console.log('Endpoint:', env.NEXT_PUBLIC_APPWRITE_ENDPOINT);
    console.log('Project:', env.NEXT_PUBLIC_APPWRITE_PROJECT);
    console.log('Database ID:', env.NEXT_PUBLIC_APPWRITE_DATABASE_ID);

    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const dbId = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';

    try {
        console.log(`Attempting to list collections in database '${dbId}'...`);
        const collections = await db.listCollections(dbId);
        console.log('Success! Connection established.');
        console.log(`Found ${collections.total} collections.`);
        collections.collections.forEach(c => console.log(`- ${c.name} (${c.$id})`));

    } catch (error) {
        console.error('Connection failed:', error.message);
        if (error.code === 404) {
            console.error(`Database '${dbId}' not found.`);
            try {
                console.log('Attempting to list all databases...');
                const dbs = await db.list();
                console.log(`Found ${dbs.total} databases:`);
                dbs.databases.forEach(d => console.log(`- ${d.name} (ID: ${d.$id})`));
                console.log('Please update NEXT_PUBLIC_APPWRITE_DATABASE_ID in .env.local with one of the above IDs.');
            } catch (listErr) {
                console.error('Could not list databases:', listErr.message);
            }
        } else if (error.code === 401) {
            console.error('Unauthorized. Please check your API Key and Project ID.');
        }
        process.exit(1);
    }
}

verify();
