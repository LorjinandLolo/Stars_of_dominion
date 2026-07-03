import { Client, Databases, Query, ID } from 'node-appwrite';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_PLANETS = 'planets';
const COLL_SYSTEMS = 'systems';
const COLL_FLEETS = 'game_fleets';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '')
    .setKey(process.env.APPWRITE_API_KEY || '');

const databases = new Databases(client);

async function run() {
    console.log('[Script] Cleaning up neutral and abandoned planet garrisons...');
    
    // First, fetch all systems to check for abandoned tag
    const systemsMap = new Map();
    let sysOffset = 0;
    while (true) {
        const res = await databases.listDocuments(DB_ID, COLL_SYSTEMS, [
            Query.limit(100),
            Query.offset(sysOffset)
        ]);
        if (res.documents.length === 0) break;
        for (const doc of res.documents) {
            let tags = [];
            try {
                if (doc.tags) tags = doc.tags.map((t: string) => t.toLowerCase());
            } catch (e) {}
            systemsMap.set(doc.$id, tags);
        }
        sysOffset += 100;
    }

    let offset = 0;
    const limit = 100;
    let totalCleaned = 0;

    while (true) {
        const res = await databases.listDocuments(DB_ID, COLL_PLANETS, [
            Query.limit(limit),
            Query.offset(offset)
        ]);

        if (res.documents.length === 0) break;

        for (const doc of res.documents) {
            let attrs: any = {};
            try {
                attrs = JSON.parse(doc.attributes || '{}');
            } catch (e) {}

            let planetTags = [];
            try {
                if (doc.tags) planetTags = doc.tags.map((t: string) => t.toLowerCase());
            } catch (e) {}

            const systemTags = systemsMap.get(doc.systemId) || [];
            const isAbandoned = planetTags.includes('abandoned') || systemTags.includes('abandoned');
            const isNeutral = !doc.ownerId || doc.ownerId === 'faction-neutral';

            if (isAbandoned || isNeutral) {
                // Remove garrison entirely
                if (attrs.garrison) {
                    delete attrs.garrison;
                    await databases.updateDocument(DB_ID, COLL_PLANETS, doc.$id, {
                        attributes: JSON.stringify(attrs)
                    });
                    totalCleaned++;
                }
            }
        }
        
        offset += limit;
    }
    console.log(`✅ Cleaned up ${totalCleaned} neutral/abandoned planet garrisons.`);

    console.log('[Script] Done!');
}

run().catch(console.error);
