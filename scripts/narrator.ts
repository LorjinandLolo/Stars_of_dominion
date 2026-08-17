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
import { deriveFeuds } from '../lib/narrative/memory-service';
import { LlmWriter } from '../lib/narrative/prose/llm-writer';
import { writeRetrospectives } from '../lib/narrative/retrospective-service';
import { NARRATION_THRESHOLD } from '../lib/narrative/chronicle-types';

const INTERVAL_MS = Number(process.env.NARRATOR_INTERVAL_MS ?? 60_000);
const BATCH = Number(process.env.NARRATOR_BATCH ?? 25);
const THRESHOLD = Number(process.env.NARRATOR_THRESHOLD ?? NARRATION_THRESHOLD);

/**
 * Which writer produces the prose. `template` needs nothing; `ollama` and
 * `gemini` fall back to the template on any failure, so setting this can
 * degrade the writing but can never stop the paper.
 */
const writer = new LlmWriter();

let running = true;

async function pass(): Promise<void> {
    const retired = await retireUnnarratableEvents(THRESHOLD);

    // Recompute grudges before writing, so an article about the latest clash
    // can already describe it as part of the quarrel it belongs to.
    const feuds = await deriveFeuds();

    const summary = await narrateOnce({ threshold: THRESHOLD, limit: BATCH, writer });

    // Close the book on any era that has been quiet long enough to be history.
    // Almost always a no-op; ages do not end often.
    const retrospectives = await writeRetrospectives();
    if (retrospectives > 0) {
        console.log(`[Narrator] Named ${retrospectives} closed era(s).`);
    }

    if (summary.articles > 0) {
        console.log(
            `[Narrator] Published ${summary.articles} article(s) covering ${summary.eventsCovered} event(s); ` +
            `${summary.frontPage} reached the front page.` +
            (feuds > 0 ? ` ${feuds} feud(s) running.` : ''),
        );
    }
    if (retired > 0) {
        console.log(`[Narrator] ${retired} event(s) below the threshold retired to memory.`);
    }
}

async function main(): Promise<void> {
    const provider = process.env.NARRATOR_LLM ?? process.env.LLM_PROVIDER ?? 'template';
    console.log(
        `[Narrator] Watching the chronicle — interval ${INTERVAL_MS}ms, batch ${BATCH}, ` +
        `threshold ${THRESHOLD}, writer ${provider}.`,
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
