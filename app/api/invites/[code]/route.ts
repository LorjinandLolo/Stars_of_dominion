// app/api/invites/[code]/route.ts
// Stars of Dominion — what a friend link says before anyone signs in.
//
// OPEN on purpose: the person holding the link has no account yet. It returns
// only what the lobby roster already makes public — the inviter's display name
// and empire — plus whether the link is still good. Unknown and malformed
// codes get the same answer, so the route cannot be used to probe accounts.

import { NextResponse } from 'next/server';
import { previewInvite } from '@/lib/invites/invite-service';
import { normaliseInviteCode, inviteRequired } from '@/lib/invites/invite-rules';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
    const { code: raw } = await params;
    const code = normaliseInviteCode(raw);
    try {
        const preview = code ? await previewInvite(code) : { valid: false, reason: 'That invite code does not exist.' };
        return NextResponse.json({ ...preview, code, inviteRequired: inviteRequired() });
    } catch (err: any) {
        console.error('[API/invites/[code]]', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
