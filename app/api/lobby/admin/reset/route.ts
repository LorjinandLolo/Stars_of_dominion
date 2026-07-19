import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ADMIN_SECRET = process.env.GAME_ADMIN_SECRET || 'overdominion'; // Set this in .env.local

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { factionId, userId, secret } = body;

        // 1. Validate Secret
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
