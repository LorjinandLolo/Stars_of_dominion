// lib/auth.ts — better-auth server instance (replaces Appwrite Account).
// Server-only: used by app/api/auth/[...all]/route.ts and identity checks.

import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@/lib/db';

export const auth = betterAuth({
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
