'use server';
import { prisma, withDocAliases } from '@/lib/db';
import { FactionRole } from '@/types';

export async function getUserProfile(userId: string) {
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    return profile ? withDocAliases(profile) : null;
}

export async function getFactionMembers(factionId: string) {
    const members = await prisma.userProfile.findMany({ where: { factionId } });
    return members.map(withDocAliases);
}

export async function updateMemberRole(requesterUserId: string, profileId: string, newRole: FactionRole) {
    // Verify requester is Leader
    const requester = await getUserProfile(requesterUserId);
    if (!requester || requester.role !== 'Leader') {
        throw new Error('Unauthorized: Only the faction leader can change roles.');
    }

    const targetProfile = await prisma.userProfile.findUniqueOrThrow({ where: { id: profileId } });
    if (targetProfile.factionId !== requester.factionId) {
        throw new Error('Unauthorized: Target is in a different faction.');
    }

    await prisma.userProfile.update({
        where: { id: profileId },
        data: { role: newRole }
    });
}

export async function updateFaction(requesterUserId: string, factionId: string, updates: any) {
    // Verify requester is Leader
    const requester = await getUserProfile(requesterUserId);
    if (!requester || requester.factionId !== factionId || requester.role !== 'Leader') {
        throw new Error('Unauthorized: Only the faction leader can modify faction settings.');
    }

    await prisma.faction.update({ where: { id: factionId }, data: updates });
}

export async function generateInviteCode(factionId: string) {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    await prisma.faction.update({
        where: { id: factionId },
        data: { inviteCode: code }
    });
    return code;
}

export async function joinFaction(userId: string, inviteCode: string) {
    // 1. Find Faction by Invite Code
    const faction = await prisma.faction.findFirst({ where: { inviteCode } });
    if (!faction) {
        throw new Error('Invalid invite code');
    }

    // 2. Check if user already has a profile
    const existing = await getUserProfile(userId);
    if (existing) {
        throw new Error('User already in a faction');
    }

    // 3. Create User Profile
    await prisma.userProfile.create({
        data: {
            userId,
            factionId: faction.id,
            role: 'Citizen',
            permissions: JSON.stringify([])
        }
    });

    return withDocAliases(faction);
}

export async function createFactionWithLeader(userId: string, factionName: string) {
    // 1. Create Faction
    const faction = await prisma.faction.create({
        data: {
            name: factionName,
            resources: JSON.stringify({ economic: 100, military: 10, intel: 5 }),
            traits: JSON.stringify({}),
            inviteCode: Math.random().toString(36).substring(2, 10).toUpperCase(),
            governmentType: 'Democracy'
        }
    });

    // 2. Create Leader Profile
    await prisma.userProfile.create({
        data: {
            userId,
            factionId: faction.id,
            role: 'Leader',
            permissions: JSON.stringify(['all'])
        }
    });

    return withDocAliases(faction);
}
