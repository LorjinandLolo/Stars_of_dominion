import fs from 'node:fs';
import path from 'node:path';
import { Client, Databases } from 'node-appwrite';

const envPath = path.resolve(process.cwd(), '.env.local');
const schemaPath = path.resolve(process.cwd(), 'appwrite/collections.json');

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

async function setup() {
    const env = loadEnv();
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    const client = new Client()
        .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
        .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
        .setKey(env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const dbId = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;

    console.log(`Setting up database ${dbId}...`);

    for (const coll of schema.collections) {
        console.log(`Processing collection ${coll.name} (${coll.id})...`);
        if (coll.id === 'events') {
            try {
                console.log(`  - Deleting existing events collection to reset attributes...`);
                await db.deleteCollection(dbId, coll.id);
            } catch (e) {
                // Ignore if not found
            }
        }

        try {
            await db.getCollection(dbId, coll.id);
            console.log(`  - Collection exists.`);
        } catch (e) {
            if (e.code === 404) {
                console.log(`  - Creating collection...`);
                await db.createCollection(dbId, coll.id, coll.name);
            } else {
                throw e;
            }
        }

        // Attributes
        // We need to list existing attributes to avoid duplicates or errors
        // But Appwrite errors if we try to create duplicate. We can just try/catch.

        for (const attr of coll.attributes) {
            try {
                console.log(`  - Creating attribute ${attr.key} (${attr.type})...`);
                switch (attr.type) {
                    case 'string':
                        // Guess size
                        let size = 255;
                        if (attr.key === 'body') size = 2000;
                        if (attr.key === 'lede') size = 500;
                        if (attr.key === 'image') size = 1000;
                        await db.createStringAttribute(dbId, coll.id, attr.key, size, attr.required);
                        break;
                    case 'integer':
                        await db.createIntegerAttribute(dbId, coll.id, attr.key, attr.required);
                        break;
                    case 'boolean':
                        await db.createBooleanAttribute(dbId, coll.id, attr.key, attr.required);
                        break;
                    case 'json':
                        await db.createStringAttribute(dbId, coll.id, attr.key, 1000, attr.required);
                        break;
                    default:
                        console.warn(`Unknown type ${attr.type} for ${attr.key}`);
                }
            } catch (e) {
                // Ignore if attribute already exists
                if (e.code === 409) {
                    console.log(`    - Attribute already exists.`);
                } else {
                    console.error(`    - Error creating attribute: ${e.message}`);
                }
            }
            // Sleep a bit to avoid rate limits
            await new Promise(r => setTimeout(r, 200));
        }
    }
    console.log('Setup complete!');
}

setup().catch(console.error);
