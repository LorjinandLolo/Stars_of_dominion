// lib/db.ts — PostgreSQL access via Prisma (replaces lib/appwrite*.ts).
// Server-only: import from API routes, server actions, and worker scripts.

// Relative import (not @/) so worker scripts run under tsx resolve it too.
import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is not set — see .env.local (docker compose up -d starts the database).');
    }
    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({ adapter });
}

// Lazy singleton behind a Proxy: worker scripts load dotenv AFTER their import
// statements are hoisted, so DATABASE_URL must not be read at module-init time.
// Also reused across Next.js hot reloads (dev) to avoid connection leaks.
let _client: PrismaClient | undefined;

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
    get(_target, prop) {
        if (!_client) {
            _client = globalForPrisma.prisma ?? createClient();
            if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = _client;
        }
        const value = (_client as any)[prop];
        return typeof value === 'function' ? value.bind(_client) : value;
    },
});

/**
 * Compatibility shim for code written against Appwrite documents: adds `$id`
 * and `$createdAt` aliases so UI code reading those keys keeps working.
 */
export function withDocAliases<T extends { id: string; createdAt?: Date | null }>(row: T): T & { $id: string; $createdAt?: string } {
    return {
        ...row,
        $id: row.id,
        ...(row.createdAt ? { $createdAt: row.createdAt.toISOString() } : {}),
    };
}
