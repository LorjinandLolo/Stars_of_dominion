// lib/auth.ts — better-auth server instance (replaces Appwrite Account).
// Server-only: used by app/api/auth/[...all]/route.ts and identity checks.

import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { prisma } from '@/lib/db';
import { inviteRequired, normaliseInviteCode } from '@/lib/invites/invite-rules';
import { inviteOpenForSignup, reserveInvite } from '@/lib/invites/invite-service';

/** The header the client puts a friend link's code in when registering. */
export const INVITE_CODE_HEADER = 'x-invite-code';

const SIGN_UP_PATH = '/sign-up/email';

export const auth = betterAuth({
    // Friend invites (casual-play spec, Item 6a). With INVITE_REQUIRED=true a
    // new account needs a live invite code; the check is here, on the server's
    // sign-up endpoint itself, so a hand-rolled request cannot skip it. With it
    // off (the default) a code is optional, but one that is sent is still
    // honoured and reserved for the new player.
    hooks: {
        before: createAuthMiddleware(async (ctx) => {
            if (ctx.path !== SIGN_UP_PATH) return;
            const code = normaliseInviteCode(ctx.headers?.get(INVITE_CODE_HEADER));
            if (!code) {
                if (inviteRequired()) {
                    throw new APIError('FORBIDDEN', { message: 'Registration is by invite only — ask a friend in the game for a link.' });
                }
                return;
            }
            const open = await inviteOpenForSignup(code);
            if (!open.ok && inviteRequired()) throw new APIError('FORBIDDEN', { message: open.error });
        }),
        after: createAuthMiddleware(async (ctx) => {
            if (ctx.path !== SIGN_UP_PATH) return;
            const code = normaliseInviteCode(ctx.headers?.get(INVITE_CODE_HEADER));
            const userId = ctx.context.newSession?.user?.id;
            if (code && userId) await reserveInvite(code, userId);
        }),
    },
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
        enabled: true,
        // Game accounts, not banking — keep friction low for playtests.
        minPasswordLength: 6,
    },
    // Allow LAN playtesting (npm run dev:lan serves on 0.0.0.0). In production
    // the public origin comes from BETTER_AUTH_URL (e.g. http://192.168.x.x:3000);
    // TRUSTED_ORIGINS can list extra comma-separated origins.
    trustedOrigins: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
        ...(process.env.TRUSTED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
    ],
});

export type AuthSession = typeof auth.$Infer.Session;
