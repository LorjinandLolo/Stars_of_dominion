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
    // Allow LAN playtesting (npm run dev:lan serves on 0.0.0.0).
    trustedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
});

export type AuthSession = typeof auth.$Infer.Session;
