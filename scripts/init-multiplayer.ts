import { Client, Databases, IndexType } from 'node-appwrite';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables manually since this is a naked node script
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '')
    .setKey(process.env.APPWRITE_API_KEY || '');

const databases = new Databases(client);

async function initMultiplayerDB() {
    console.log('[Init] Setting up Appwrite for Multiplayer...');

    try {
        // 1. Create Sessions Collection (The Singleton World State)
        console.log('[Init] Checking "multiplayer_sessions" collection...');
        try {
            await databases.createCollection(DB_ID, 'multiplayer_sessions', 'multiplayer_sessions');
            console.log('✅ Created multiplayer_sessions');
        } catch (e: any) {
            console.log('ℹ️ multiplayer_sessions collection already exists.');
        }

        // Add attributes to multiplayer_sessions
        try {
            await databases.createStringAttribute(DB_ID, 'multiplayer_sessions', 'snapshot', 5000000, true);
            await databases.createStringAttribute(DB_ID, 'multiplayer_sessions', 'lastTickAt', 50, false);
            console.log('✅ Updated attributes for multiplayer_sessions');
        } catch (e) { /* ignore if exists */ }

        // 2. Create Game Orders Collection (Action Queue)
        console.log('\n[Init] Checking "game_orders" collection...');
        try {
            await databases.createCollection(DB_ID, 'game_orders', 'Game Orders Queue');
            console.log('✅ Created game_orders collection');
        } catch (e: any) {
            console.log('ℹ️ game_orders collection already exists.');
        }

        // Add attributes to game_orders
        try {
            await databases.createStringAttribute(DB_ID, 'game_orders', 'factionId', 50, true);
            await databases.createStringAttribute(DB_ID, 'game_orders', 'actionId', 50, true);
            await databases.createStringAttribute(DB_ID, 'game_orders', 'payload', 50000, true);
            await databases.createBooleanAttribute(DB_ID, 'game_orders', 'processed', false, false);
            console.log('✅ Updated attributes for game_orders');
            
            // Wait for Appwrite to recognize attributes before indexing
            await new Promise(resolve => setTimeout(resolve, 3000));
            try {
                await databases.createIndex(DB_ID, 'game_orders', 'idx_processed', IndexType.Key, ['processed']);
                console.log('✅ Created index for game_orders:processed');
            } catch (e) { }
        } catch (e) { /* ignore if exists */ }

        // 3. Create Systems Collection
        console.log('\n[Init] Checking "systems" collection...');
        try {
            await databases.createCollection(DB_ID, 'systems', 'Star Systems');
            console.log('✅ Created systems');
        } catch (e) { console.log('ℹ️ systems collection already exists.'); }

        try {
            await databases.createStringAttribute(DB_ID, 'systems', 'name', 100, true);
            await databases.createIntegerAttribute(DB_ID, 'systems', 'q', true);
            await databases.createIntegerAttribute(DB_ID, 'systems', 'r', true);
            await databases.createIntegerAttribute(DB_ID, 'systems', 'security', false, 0, 100, 50);
            await databases.createIntegerAttribute(DB_ID, 'systems', 'tradeValue', false, 0, 100, 10);
            await databases.createStringAttribute(DB_ID, 'systems', 'regionId', 50, false);
            console.log('✅ Updated attributes for systems');
        } catch (e) { }

        // 4. Create Planets Collection
        console.log('\n[Init] Checking "planets" collection...');
        try {
            await databases.createCollection(DB_ID, 'planets', 'Planetary Records');
            console.log('✅ Created planets');
        } catch (e) { console.log('ℹ️ planets collection already exists.'); }

        try {
            await databases.createStringAttribute(DB_ID, 'planets', 'name', 100, true);
            await databases.createStringAttribute(DB_ID, 'planets', 'systemId', 50, true);
            await databases.createStringAttribute(DB_ID, 'planets', 'ownerId', 50, false, 'faction-neutral');
            await databases.createStringAttribute(DB_ID, 'planets', 'planetType', 50, false, 'standard');
            await databases.createFloatAttribute(DB_ID, 'planets', 'population', false, 1.0);
            console.log('✅ Updated attributes for planets');

            await new Promise(resolve => setTimeout(resolve, 3000));
            try {
                await databases.createIndex(DB_ID, 'planets', 'idx_systemId', IndexType.Key, ['systemId']);
                console.log('✅ Created index for planets:systemId');
            } catch (e) { }
        } catch (e) { }

        // 5. Create Player Profiles (Lobby Identity system)
        try {
            await databases.createCollection(DB_ID, 'player_profiles', 'player_profiles');
            console.log('✅ Created player_profiles collection');
            
            // Attributes: who is playing what
            await databases.createStringAttribute(DB_ID, 'player_profiles', 'userId', 255, true);
            await databases.createStringAttribute(DB_ID, 'player_profiles', 'factionId', 255, true);
            await databases.createStringAttribute(DB_ID, 'player_profiles', 'displayName', 255, false, 'Commander');
            
            console.log('✅ Updated attributes for player_profiles');
            
            // Add Index for fast lookup
            await new Promise(resolve => setTimeout(resolve, 3000));
            try {
                await databases.createIndex(DB_ID, 'player_profiles', 'idx_userId', IndexType.Key, ['userId']);
                console.log('✅ Created index for player_profiles:userId');
            } catch (e) { }
            
        } catch (e: any) {
             if (e.message?.includes('already exists')) {
                 console.log('ℹ️ player_profiles collection already exists.');
             }
        }

        // 6. Create Sharded Collections (Phase 4)
        console.log('\n[Init] Checking "game_fleets" collection...');
        try {
            await databases.createCollection(DB_ID, 'game_fleets', 'game_fleets');
            console.log('✅ Created game_fleets collection');
        } catch (e: any) {
             if (e.message?.includes('already exists')) {
                 console.log('ℹ️ game_fleets collection already exists.');
             }
        }
        try {
            await databases.createStringAttribute(DB_ID, 'game_fleets', 'factionId', 255, true);
            await databases.createStringAttribute(DB_ID, 'game_fleets', 'data', 500000, true);
            console.log('✅ Updated attributes for game_fleets');
        } catch (e) { /* ignore if exists */ }

        console.log('\n[Init] Checking "game_factions" collection...');
        try {
            await databases.createCollection(DB_ID, 'game_factions', 'game_factions');
            console.log('✅ Created game_factions collection');
        } catch (e: any) {
             if (e.message?.includes('already exists')) {
                 console.log('ℹ️ game_factions collection already exists.');
             }
        }
        try {
            await databases.createStringAttribute(DB_ID, 'game_factions', 'factionId', 255, true);
            await databases.createStringAttribute(DB_ID, 'game_factions', 'data', 500000, true);
            console.log('✅ Updated attributes for game_factions');
        } catch (e) { /* ignore if exists */ }

        console.log('\n========= ✅ MULTIPLAYER INIT COMPLETE =========');
        console.log('You are now ready to switch the front-end to Database Mode.');
    } catch (err: any) {
        console.error('Fatal initialization error:', err?.message);
    }
}

initMultiplayerDB();
