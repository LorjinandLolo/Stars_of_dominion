// scripts/narrator.ts — the narrative worker.
// Run: npm run narrator     (or: npx tsx scripts/narrator.ts)
//
// Polls the chronicle for events nobody has written about yet, publishes
// articles, and sleeps. Deliberately a separate process from the game loop: the
// simulation must never wait on prose, and a narrator that dies must cost the
// galaxy its newspaper, not its physics.
//
// Environment:
//   NARRATOR_INTERVAL_MS   poll interval (default 60000)
//   NARRATOR_BATCH         max events examined per pass (default 25)
//   NARRATOR_THRESHOLD     minimum importance to narrate (default 15)
//   LLM_PROVIDER           phase 3 will read this; phase 1 always writes templates

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { prisma } from '../lib/db';
import { narrateOnce, retireUnnarratableEvents } from '../lib/narrative/narrator-service';
import { NARRATION_THRESHOLD } from '../lib/narrative/chronicle-types';

const INTERVAL_MS = Number(process.env.NARRATOR_INTERVAL_MS ?? 60_000);
const BATCH = Number(process.env.NARRATOR_BATCH ?? 25);
const THRESHOLD = Number(process.env.NARRATOR_THRESHOLD ?? NARRATION_THRESHOLD);

let running = true;

async function pass(): Promise<void> {
    const retired = await retireUnnarratableEvents(THRESHOLD);
    const summary = await narrateOnce({ threshold: THRESHOLD, limit: BATCH });

    if (summary.articles > 0) {
        console.log(
            `[Narrator] Published ${summary.articles} article(s) covering ${summary.eventsCovered} event(s); ` +
            `${summary.frontPage} reached the front page.`,
        );
    }
    if (retired > 0) {
        console.log(`[Narrator] ${retired} event(s) below the threshold retired to memory.`);
    }
}

async function main(): Promise<void> {
    console.log(
        `[Narrator] Watching the chronicle — interval ${INTERVAL_MS}ms, batch ${BATCH}, threshold ${THRESHOLD}.`,
    );

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
            console.log(`[Narrator] ${signal} — finishing the current pass and stopping.`);
            running = false;
        });
    }

    while (running) {
        try {
            await pass();
        } catch (e: any) {
            // The chronicle is durable; anything unwritten is simply still
            // queued. Log and keep going rather than dying on a transient
            // database or provider fault.
            console.error('[Narrator] Pass failed, retrying next interval:', e.message);
        }
        if (!running) break;
        await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
    }

    await prisma.$disconnect();
    console.log('[Narrator] Stopped.');
}

main().catch(async (err) => {
    console.error('[Narrator] Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
});
