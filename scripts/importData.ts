// scripts/importData.ts — import gen-1 event definitions into PostgreSQL.
// Usage: npx tsx scripts/importData.ts [path/to/events.json]

import dotenv from 'dotenv';
import path from 'path';
import fs from 'node:fs/promises';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/db';

const file = process.argv[2] || 'data/events.json';

/** String columns hold JSON — stringify any structured value defensively. */
function asText(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    return typeof value === 'string' ? value : JSON.stringify(value);
}

async function main() {
    const raw = await fs.readFile(file, 'utf-8');
    const data = JSON.parse(raw);
    const events = data.events || data || [];
    for (const ev of events) {
        await prisma.gameEvent.upsert({
            where: { id: ev.id },
            update: {},
            create: {
                id: ev.id,
                title: ev.title,
                body: ev.body,
                triggers: asText(ev.triggers) ?? '{}',
                choices: asText(ev.choices) ?? '[]',
                effects: asText(ev.effects),
                cooldown_days: ev.cooldown_days ?? undefined,
                repeatable: ev.repeatable ?? undefined,
                tags: asText(ev.tags),
                newspaper: asText(ev.newspaper),
            },
        });
        console.log('Imported', ev.id || ev.title);
    }
}

main()
    .catch(err => { console.error(err); process.exit(1); })
    .finally(() => prisma.$disconnect());
