import { NextRequest, NextResponse } from 'next/server';
import { getServerClients } from '@/lib/appwrite';
import { Query } from 'node-appwrite';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_PROFILES = 'player_profiles';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userId, factionId, displayName } = body;

        if (!userId || !factionId) {
            return NextResponse.json({ error: 'Missing userId or factionId' }, { status: 400 });
        }

        const { db } = await getServerClients();

        // 1. Check if ANY user already claimed this faction
        const existingFactionClaims = await db.listDocuments(DB_ID, COLL_PROFILES, [
            Query.equal('factionId', factionId)
        ]);

        if (existingFactionClaims.total > 0 && existingFactionClaims.documents[0].userId !== userId) {
            return NextResponse.json({ 
                error: 'Faction already claimed by another player.' 
            }, { status: 403 });
        }

        // 2. Check if THIS user already has a profile (claimed a different faction)
        const myProfiles = await db.listDocuments(DB_ID, COLL_PROFILES, [
            Query.equal('userId', userId)
        ]);

        if (myProfiles.total > 0) {
            const existingFactionId = myProfiles.documents[0].factionId;
            if (existingFactionId !== factionId) {
                return NextResponse.json({ 
                    error: `You are already locked into the ${existingFactionId}. Faction hopping is disabled to prevent espionage.` 
                }, { status: 403 });
            }
            
            // If they are re-submitting for the same faction (maybe to update name), allow it
            const docId = myProfiles.documents[0].$id;
            await db.updateDocument(DB_ID, COLL_PROFILES, docId, {
                displayName: displayName || myProfiles.documents[0].displayName
            });
            return NextResponse.json({ success: true, message: 'Profile updated' });
        }

        // 3. Create fresh profile
        await db.createDocument(DB_ID, COLL_PROFILES, 'unique()', {
            userId,
            factionId,
            displayName: displayName || 'Commander'
        });

        return NextResponse.json({ success: true, message: 'Faction claimed successfully' });

    } catch (err: any) {
        console.error('[API/lobby/claim]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const { db } = await getServerClients();
        const profiles = await db.listDocuments(DB_ID, COLL_PROFILES);
        
        // Return a map of { factionId: userId } so the Lobby knows what's taken
        const claimedFactions: Record<string, string> = {};
        profiles.documents.forEach((doc: any) => {
             claimedFactions[doc.factionId] = doc.userId;
        });

        return NextResponse.json({ claimedFactions });
    } catch (err: any) {
         return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
