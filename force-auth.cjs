const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });
const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT)
    .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);

async function forceFactionAureliaOwnership() {
    try {
        const sysRes = await db.listDocuments(process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID, 'systems');
        if (sysRes.documents.length === 0) return console.log('No systems found');
        const firstSysId = sysRes.documents[0].$id;
        console.log('Target system:', firstSysId);
        
        const planRes = await db.listDocuments(process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID, 'planets');
        const sysPlanets = planRes.documents.filter(p => p.systemId === firstSysId);
        
        for (const p of sysPlanets) {
            await db.updateDocument(process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID, 'planets', p.$id, {
                ownerId: 'faction-aurelian'
            });
            console.log('Transferred planet', p.$id, 'to faction-aurelian');
        }
        
        // Update default-session snapshot
        const sessDoc = await db.getDocument(process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID, 'multiplayer_sessions', 'default-session');
        const snapshot = JSON.parse(sessDoc.snapshot);
        let updated = false;
        sysPlanets.forEach(p => {
            if(snapshot.construction && snapshot.construction.planets && snapshot.construction.planets.data && snapshot.construction.planets.data[p.$id]) {
                snapshot.construction.planets.data[p.$id].ownerId = 'faction-aurelian';
                updated = true;
            }
        });
        if (updated) {
            await db.updateDocument(process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID, 'multiplayer_sessions', 'default-session', { snapshot: JSON.stringify(snapshot) });
            console.log('Updated session snapshot faction ownership!');
        }
        
    } catch(e) {
        console.log('Error:', e.message);
    }
}
forceFactionAureliaOwnership();
