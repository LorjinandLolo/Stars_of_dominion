import { NextRequest, NextResponse } from 'next/server';
import { getServerClients } from '@/lib/appwrite';
import { Query } from 'node-appwrite';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_PROFILES = 'player_profiles';
const ADMIN_SECRET = process.env.GAME_ADMIN_SECRET || 'overdominion'; // Set this in .env.local

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { factionId, userId, secret } = body;

        // 1. Validate Secret
        if (secret !== ADMIN_SECRET) {
            return NextResponse.json({ error: 'Unauthorized: Invalid Admin Secret' }, { status: 401 });
        }

        const { db } = await getServerClients();

        // 2. Identify the profile to delete
        let query;
        if (factionId) {
            query = [Query.equal('factionId', factionId)];
        } else if (userId) {
            query = [Query.equal('userId', userId)];
        } else {
            return NextResponse.json({ error: 'Missing factionId or userId' }, { status: 400 });
        }

        const profiles = await db.listDocuments(DB_ID, COLL_PROFILES, query);

        if (profiles.total === 0) {
            return NextResponse.json({ message: 'No matching profile found to reset.' });
        }

        // 3. Delete the profile documents
        for (const doc of profiles.documents) {
            await db.deleteDocument(DB_ID, COLL_PROFILES, doc.$id);
        }

        return NextResponse.json({ 
            success: true, 
            message: `Successfully reset claims for ${factionId || userId}. Faction is now available.` 
        });

    } catch (err: any) {
        console.error('[API/lobby/admin/reset]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
