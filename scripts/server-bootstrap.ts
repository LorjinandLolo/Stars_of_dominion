// scripts/server-bootstrap.ts — the `setup` step of compose.prod.yaml.
//
// Runs once on every `docker compose -f compose.prod.yaml up`, before the web
// app, the worker and the narrator are allowed to start (they wait for it to
// exit 0). On a clean machine it turns an empty database into a playable
// galaxy; on a running server it only applies new migrations.
//
//   1. check the four required variables (lib/server/server-env.ts) and stop
//      with a readable list when one is missing or still the example value
//   2. wait for Postgres to accept connections
//   3. prisma migrate deploy (committed migrations only, never authors one)
//   4. if there is no world yet: scripts/push-init-state.ts
//   5. if there are no accounts yet AND DEV_DUEL_PASSWORD is set:
//      scripts/setup-dev-duel.ts (DEV 1 / DEV 2 with that password)
//
// Steps 4 and 5 never touch a database that already has a world or accounts,
// so re-running this on the live server is always safe.
//
// Run by hand:  npx tsx scripts/server-bootstrap.ts

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import dotenv from 'dotenv';

// Outside a container (a dev machine, a probe) read the same files the other
// scripts do. Inside one there are none: compose passes the environment.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/db';
import { bootstrapPlan, checkServerEnv, formatEnvProblems } from '../lib/server/server-env';

const SESSION_DOC_ID = 'default-session';
const DB_WAIT_MS = 90_000;

const require = createRequire(import.meta.url);
/** Run a TypeScript script or the Prisma CLI with this same node, no npx. */
function run(label: string, args: string[]): void {
    console.log(`\n==> ${label}`);
    const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
    if (result.status !== 0) {
        throw new Error(`${label} failed (exit ${result.status ?? result.signal}).`);
    }
}
const tsx = (script: string) => [path.join(path.dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs'), script];
const prismaCli = (...args: string[]) => [path.join(path.dirname(require.resolve('prisma/package.json')), 'build', 'index.js'), ...args];

async function waitForDatabase(): Promise<void> {
    const until = Date.now() + DB_WAIT_MS;
    let lastError = '';
    while (Date.now() < until) {
        try {
            await prisma.$queryRawUnsafe('SELECT 1');
            return;
        } catch (e: any) {
            lastError = String(e?.message ?? e).split('\n')[0];
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    throw new Error(`Postgres did not accept connections within ${DB_WAIT_MS / 1000}s: ${lastError}`);
}

async function main(): Promise<void> {
    console.log('====================================================');
    console.log('  STARS OF DOMINION — server setup');
    console.log('====================================================');

    // 1. Configuration. Nothing else runs on a half-filled .env.
    if (process.env.SKIP_ENV_CHECK !== '1') {
        const problems = checkServerEnv(process.env);
        if (problems.length > 0) {
            console.error(formatEnvProblems(problems));
            process.exit(1);
        }
        console.log('✅ Required settings present.');
    }
    if (!process.env.DATABASE_URL) {
        console.error('✋ DATABASE_URL is not set. compose.prod.yaml builds it from POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB.');
        process.exit(1);
    }

    // 2. The database.
    console.log('\n==> waiting for Postgres');
    await waitForDatabase();
    console.log('✅ Postgres is up.');

    // 3. Schema.
    run('applying migrations (prisma migrate deploy)', prismaCli('migrate', 'deploy'));

    // 4 + 5. Contents — only into an empty database.
    const [session, userCount] = await Promise.all([
        prisma.multiplayerSession.findUnique({ where: { id: SESSION_DOC_ID }, select: { id: true } }),
        prisma.user.count(),
    ]);
    const plan = bootstrapPlan({
        hasWorld: !!session,
        userCount,
        devPasswordSet: !!process.env.DEV_DUEL_PASSWORD,
    });

    if (plan.seedWorld) {
        run('seeding the galaxy (first start)', tsx('scripts/push-init-state.ts'));
    } else {
        console.log('\nℹ️  A galaxy already exists — not reseeding.');
    }

    if (plan.seedDevAccounts) {
        run('creating dev accounts DEV 1 / DEV 2', tsx('scripts/setup-dev-duel.ts'));
    } else {
        console.log(`ℹ️  No dev accounts created: ${plan.devAccountsSkippedBecause}.`);
    }

    const narrator = process.env.NARRATOR_LLM || 'template';
    console.log(`\n✅ Setup complete. Narrator writes with: ${narrator}${narrator === 'template' ? ' (no LLM configured)' : ''}.`);
    console.log(`   Players open: ${process.env.BETTER_AUTH_URL ?? 'http://<server>:3000'}/login`);
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
        console.error(`\n❌ Server setup failed: ${err.message}`);
        await prisma.$disconnect().catch(() => {});
        process.exit(1);
    });
