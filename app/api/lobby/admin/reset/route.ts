import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// No fallback: the old default ('overdominion') was committed to a repo the
// players themselves can read, which made "admin" mean "anyone". Unset env →
// the endpoint is disabled, not open.
const ADMIN_SECRET = process.env.GAME_ADMIN_SECRET;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { factionId, userId, secret } = body;

        // 1. Validate Secret
        if (!ADMIN_SECRET) {
            return NextResponse.json({ error: 'Admin endpoint disabled: GAME_ADMIN_SECRET is not set.' }, { status: 503 });
        }
        if (secret !== ADMIN_SECRET) {
            return NextResponse.json({ error: 'Unauthorized: Invalid Admin Secret' }, { status: 401 });
        }

        // 2. Identify the profiles to delete
        if (!factionId && !userId) {
            return NextResponse.json({ error: 'Missing factionId or userId' }, { status: 400 });
        }

        const { count } = await prisma.playerProfile.deleteMany({
            where: factionId ? { factionId } : { userId },
        });

        if (count === 0) {
            return NextResponse.json({ message: 'No matching profile found to reset.' });
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
