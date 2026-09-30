// lib/server/server-env.ts
// Stars of Dominion — what a server needs in its .env before anything starts
// (casual-play spec Item 9).
//
// Four variables have no safe default. compose.prod.yaml refuses to start
// without them (`${VAR:?...}`), and scripts/server-bootstrap.ts checks them
// again inside the container, where it can also catch the placeholder values
// .env.server.example ships with. Pure: the bootstrap and the probe both call
// it, no database, no process exit.

export interface RequiredServerVar {
    name: string;
    /** What it is for, in one line. */
    purpose: string;
    /** How to make a good value. */
    howTo: string;
}

export const REQUIRED_SERVER_ENV: readonly RequiredServerVar[] = [
    {
        name: 'POSTGRES_PASSWORD',
        purpose: 'password of the game database (set once, when the database volume is first created)',
        howTo: 'openssl rand -hex 16',
    },
    {
        name: 'BETTER_AUTH_SECRET',
        purpose: 'signs every login session; anyone who knows it can forge one',
        howTo: 'openssl rand -hex 32',
    },
    {
        name: 'BETTER_AUTH_URL',
        purpose: 'the address players type in their browser, e.g. http://192.168.2.3:3000 or https://starsofdominion.com',
        howTo: 'the server IP with port 3000, or the public domain',
    },
    {
        name: 'GAME_ADMIN_SECRET',
        purpose: 'lets the host free a faction seat (POST /api/lobby/admin/reset)',
        howTo: 'openssl rand -hex 16',
    },
];

/** Values .env.server.example ships with, or that are obviously not filled in. */
const PLACEHOLDERS = new Set(['change_me', 'changeme', 'todo', 'xxx', 'secret', 'password']);

export interface EnvProblem {
    name: string;
    problem: 'missing' | 'placeholder' | 'too_short' | 'not_a_url';
    message: string;
}

/** Everything wrong with the server environment. Empty = good to start. */
export function checkServerEnv(env: Record<string, string | undefined>): EnvProblem[] {
    const problems: EnvProblem[] = [];
    for (const v of REQUIRED_SERVER_ENV) {
        const value = (env[v.name] ?? '').trim();
        if (!value) {
            problems.push({ name: v.name, problem: 'missing', message: `${v.name} is not set — ${v.purpose}. Make one with: ${v.howTo}` });
            continue;
        }
        if (PLACEHOLDERS.has(value.toLowerCase())) {
            problems.push({ name: v.name, problem: 'placeholder', message: `${v.name} is still the example value "${value}" — ${v.purpose}. Make one with: ${v.howTo}` });
            continue;
        }
        if (v.name === 'BETTER_AUTH_SECRET' && value.length < 32) {
            problems.push({ name: v.name, problem: 'too_short', message: `BETTER_AUTH_SECRET is ${value.length} characters; use at least 32. Make one with: ${v.howTo}` });
        }
        if (v.name === 'BETTER_AUTH_URL' && !/^https?:\/\/[^\s/]+/i.test(value)) {
            problems.push({ name: v.name, problem: 'not_a_url', message: `BETTER_AUTH_URL must start with http:// or https:// (got "${value}") — ${v.purpose}.` });
        }
    }
    return problems;
}

/** The problems as the operator reads them in `docker compose logs setup`. */
export function formatEnvProblems(problems: readonly EnvProblem[]): string {
    return [
        '',
        '✋ The server is not configured yet. Fix these in the .env file next to compose.prod.yaml:',
        '',
        ...problems.map(p => `   • ${p.message}`),
        '',
        '   Start from the template:  cp .env.server.example .env',
        '   Then run again:           docker compose -f compose.prod.yaml up',
        '   Details: SERVER.md, section 1.',
        '',
    ].join('\n');
}

/**
 * What the bootstrap does to a database, given what is already in it. Pure,
 * so the rule "seed only an empty database" is testable without one.
 */
export function bootstrapPlan(state: { hasWorld: boolean; userCount: number; devPasswordSet: boolean }): {
    seedWorld: boolean;
    seedDevAccounts: boolean;
    devAccountsSkippedBecause: string | null;
} {
    const seedWorld = !state.hasWorld;
    let devAccountsSkippedBecause: string | null = null;
    if (state.userCount > 0) devAccountsSkippedBecause = 'accounts already exist';
    else if (!state.devPasswordSet) devAccountsSkippedBecause = 'DEV_DUEL_PASSWORD is not set';
    return { seedWorld, seedDevAccounts: devAccountsSkippedBecause === null, devAccountsSkippedBecause };
}
