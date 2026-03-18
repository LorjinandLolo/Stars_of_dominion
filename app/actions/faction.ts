'use server';
import { getServerClients } from '@/lib/appwrite';
import { ID, Query } from 'node-appwrite';
import { FactionRole } from '@/types';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_FACTIONS = 'factions';
const COLL_PROFILES = 'user_profiles';

export async function getUserProfile(userId: string) {
    const { db } = await getServerClients();
    const res = await db.listDocuments(DB_ID, COLL_PROFILES, [
        Query.equal('userId', userId)
    ]);
    return res.documents[0] || null;
}

export async function getFactionMembers(factionId: string) {
    const { db } = await getServerClients();
    const res = await db.listDocuments(DB_ID, COLL_PROFILES, [
        Query.equal('factionId', factionId)
    ]);
    return res.documents;
}

export async function updateMemberRole(profileId: string, newRole: FactionRole) {
    const { db } = await getServerClients();
    // TODO: Verify requester has permission (e.g. is Leader)
    await db.updateDocument(DB_ID, COLL_PROFILES, profileId, {
        role: newRole
    });
}

export async function generateInviteCode(factionId: string) {
    const { db } = await getServerClients();
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    await db.updateDocument(DB_ID, COLL_FACTIONS, factionId, {
        inviteCode: code
    });
    return code;
}

export async function joinFaction(userId: string, inviteCode: string) {
    const { db } = await getServerClients();

    // 1. Find Faction by Invite Code
    const factions = await db.listDocuments(DB_ID, COLL_FACTIONS, [
        Query.equal('inviteCode', inviteCode)
    ]);

    if (factions.total === 0) {
        throw new Error('Invalid invite code');
    }

    const faction = factions.documents[0];

    // 2. Check if user already has a profile
    const existing = await getUserProfile(userId);
    if (existing) {
        throw new Error('User already in a faction');
    }

    // 3. Create User Profile
    await db.createDocument(DB_ID, COLL_PROFILES, ID.unique(), {
        userId,
        factionId: faction.$id,
        role: 'Citizen',
        permissions: JSON.stringify([])
    });

    return faction;
}

export async function createFactionWithLeader(userId: string, factionName: string) {
    const { db } = await getServerClients();

    // 1. Create Faction
    const faction = await db.createDocument(DB_ID, COLL_FACTIONS, ID.unique(), {
        name: factionName,
        resources: JSON.stringify({ economic: 100, military: 10, intel: 5 }),
        traits: JSON.stringify({}),
        inviteCode: Math.random().toString(36).substring(2, 10).toUpperCase(),
        governmentType: 'Democracy'
    });

    // 2. Create Leader Profile
    await db.createDocument(DB_ID, COLL_PROFILES, ID.unique(), {
        userId,
        factionId: faction.$id,
        role: 'Leader',
        permissions: JSON.stringify(['all'])
    });

    return faction;
}
