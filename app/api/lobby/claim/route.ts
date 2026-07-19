import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { factionId, displayName } = body;

        // Identity comes from the better-auth session cookie — the client can
        // no longer claim on behalf of an arbitrary userId.
        const session = await auth.api.getSession({ headers: req.headers });
        const userId = session?.user?.id;

        if (!userId) {
            return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
        }
        if (!factionId) {
            return NextResponse.json({ error: 'Missing factionId' }, { status: 400 });
        }

        // 1. Check if ANY user already claimed this faction
        const existingFactionClaim = await prisma.playerProfile.findUnique({ where: { factionId } });
        if (existingFactionClaim && existingFactionClaim.userId !== userId) {
            return NextResponse.json({
                error: 'Faction already claimed by another player.'
            }, { status: 403 });
        }

        // 2. Check if THIS user already has a profile (claimed a different faction)
        const myProfile = await prisma.playerProfile.findUnique({ where: { userId } });
        if (myProfile) {
            if (myProfile.factionId !== factionId) {
                return NextResponse.json({
                    error: `You are already locked into the ${myProfile.factionId}. Faction hopping is disabled to prevent espionage.`
                }, { status: 403 });
            }

            // If they are re-submitting for the same faction (maybe to update name), allow it
            await prisma.playerProfile.update({
                where: { id: myProfile.id },
                data: { displayName: displayName || myProfile.displayName },
            });
            return NextResponse.json({ success: true, message: 'Profile updated' });
        }

        // 3. Create fresh profile
        await prisma.playerProfile.create({
            data: {
                userId,
                factionId,
                displayName: displayName || 'Commander',
            },
        });

        return NextResponse.json({ success: true, message: 'Faction claimed successfully' });

    } catch (err: any) {
        console.error('[API/lobby/claim]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const profiles = await prisma.playerProfile.findMany();

        // Return a map of { factionId: { userId, displayName } } so the Lobby knows what's taken by whom
        const claimedFactions: Record<string, { userId: string, displayName: string }> = {};
        profiles.forEach(doc => {
             claimedFactions[doc.factionId] = {
                 userId: doc.userId,
                 displayName: doc.displayName ?? 'Commander'
             };
        });

        return NextResponse.json({ claimedFactions });
    } catch (err: any) {
         return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
