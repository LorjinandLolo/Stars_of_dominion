/**
 * lib/fallen/job-service.ts
 * Item 14b: the server plays the jobs. Server-only (reaches the cell acts).
 *
 * The page sends only a job id and crew to start, then one choice id at a
 * time. Every roll is drawn from the job's seed and the step it is on, so the
 * same seed and the same choices always play the same way, and nothing the
 * page sends can say how a roll came out. A job that ends in success or a
 * partial success lands as its cell act through commitAct, exactly as a
 * strike would; a loud job costs cover; a failed one costs cover and a little
 * strength. Wounds, capture and death come with 14d.
 */

import type { GameWorldState } from '../game-world-state';
import {
    HELD_ACT_COOLDOWN_SECONDS,
    type Companion, type CompanionSkill, type JobBoardEntry, type JobRun, type JobView, type RebelCell,
} from '../rebellion/rebellion-types';
import { ACT_MIN_STRENGTH, activeSponsorshipsOf, commitAct } from '../rebellion/sponsor-service';
import { JOBS, JOB_BY_ID, checkChance, fillTemplate, oddsWord, type JobDefinition, type JobEnd, type JobStep } from './jobs';
import { RNG, seedFromString } from '../trade-system/rng';
import { labelFor } from '../time/notification-names';

export type JobResult = { ok: true; message: string } | { ok: false; message: string };

/** Bond a companion gains from a job that came off. */
export const BOND_PER_SUCCESS = 6;
/** Cover lost per point of noise, at the end of a job. */
export const COVER_PER_NOISE = 0.05;
export const FAILURE_COVER_LOSS = 0.1;
export const FAILURE_STRENGTH_LOSS = 2;
export const PARTIAL_COVER_LOSS = 0.05;

function crewOf(cell: RebelCell, run: JobRun): Companion[] {
    const crew = cell.exile?.crew ?? [];
    return run.crewIds.map(id => crew.find(c => c.id === id)).filter((c): c is Companion => !!c);
}

/** Fill a job's text for this cell: the world, the conqueror, the old empire, and who on the crew is best at what. */
export function jobContext(world: GameWorldState, cell: RebelCell, crew: Companion[]): Record<string, string> {
    const planet: any = world.construction?.planets?.get?.(cell.planetId);
    const ctx: Record<string, string> = {
        world: String(planet?.name ?? 'the hideout world'),
        conqueror: cell.exile?.conquerorName ?? labelFor(cell.hostFactionId),
        empire: cell.exile?.fromName ?? 'the old empire',
    };
    const skills: CompanionSkill[] = ['infiltration', 'violence', 'piloting', 'talk', 'tech'];
    for (const s of skills) {
        const best = [...crew].sort((a, b) => b.skills[s] - a.skills[s])[0];
        ctx[s] = best?.name ?? crew[0]?.name ?? 'someone';
    }
    return ctx;
}

function bestSkill(crew: Companion[], skill: CompanionSkill): number {
    return crew.reduce((m, c) => Math.max(m, c.status === 'free' ? c.skills[skill] : 0), 0);
}

/** Why this cell cannot take this job now, or null. */
export function jobBlocker(world: GameWorldState, cell: RebelCell, def: JobDefinition): string | null {
    if (!cell.exile) return 'Only a crew can take a job.';
    if (cell.status !== 'active') return 'The movement is gone.';
    if (cell.job?.status === 'running') return 'A job is already under way.';
    if (cell.lyingLow) return 'We are lying low.';
    if (cell.strength < ACT_MIN_STRENGTH) return `The movement needs strength ${ACT_MIN_STRENGTH} for a job.`;
    if ((cell.nextActAtSeconds ?? 0) > world.nowSeconds) return 'Too soon after the last job: let things go quiet first.';
    if (!cell.exile.crew.some(c => c.status === 'free')) return 'Nobody is free to go.';
    return null;
}

export function startJob(world: GameWorldState, cell: RebelCell, jobId: string, crewIds: unknown): JobResult {
    const def = JOB_BY_ID[jobId];
    if (!def) return { ok: false, message: 'No such job.' };
    const blocked = jobBlocker(world, cell, def);
    if (blocked) return { ok: false, message: blocked };
    const ids = Array.isArray(crewIds) ? [...new Set(crewIds.map(String))] : [];
    if (ids.length === 0) return { ok: false, message: 'Choose who goes.' };
    if (ids.length > def.maxCrew) return { ok: false, message: `This job takes at most ${def.maxCrew}.` };
    const crew = cell.exile!.crew;
    for (const id of ids) {
        const c = crew.find(x => x.id === id);
        if (!c) return { ok: false, message: 'That person is not one of ours.' };
        if (c.status !== 'free') return { ok: false, message: `${c.name} cannot go: ${c.status}.` };
    }
    const n = cell.jobsRun ?? 0;
    cell.job = {
        jobId, seed: `${cell.id}|${n}|${world.nowSeconds}`, crewIds: ids, sceneId: def.start, step: 0, noise: 0,
        story: [], status: 'running', startedAtSeconds: world.nowSeconds, endedAtSeconds: null,
    };
    return { ok: true, message: `${def.title}: under way.` };
}

/** The roll for one step of one job: the seed and the step decide it, nothing else. */
export function rollFor(seed: string, step: number): number {
    return new RNG(seedFromString(`${seed}|${step}`)).next();
}

export function chooseInJob(world: GameWorldState, cell: RebelCell, choiceId: unknown): JobResult {
    const run = cell.job;
    if (!run || run.status !== 'running') return { ok: false, message: 'No job is under way.' };
    const def = JOB_BY_ID[run.jobId];
    const scene = def?.scenes[run.sceneId];
    const choice = scene?.choices.find(c => c.id === String(choiceId));
    if (!def || !scene || !choice) return { ok: false, message: 'That is not a choice here.' };

    const crew = crewOf(cell, run);
    const ctx = jobContext(world, cell, crew);
    let step: JobStep = choice.success;
    if (choice.check) {
        const chance = checkChance(choice.check.difficulty, bestSkill(crew, choice.check.skill), cell.safeHouse.concealment);
        const passed = rollFor(run.seed, run.step) < chance;
        step = passed ? choice.success : (choice.failure ?? choice.success);
    }
    run.step++;
    run.noise += step.noise ?? 0;
    run.story.push(`${fillTemplate(choice.label, ctx)}. ${fillTemplate(step.text, ctx)}`);

    if (step.next === 'success' || step.next === 'partial' || step.next === 'failure') {
        finishJob(world, cell, def, run, step.next, ctx);
        return { ok: true, message: fillTemplate(def.endings[step.next], ctx) };
    }
    if (!def.scenes[step.next]) { finishJob(world, cell, def, run, 'failure', ctx); return { ok: true, message: 'The job fell apart.' }; }
    run.sceneId = step.next;
    return { ok: true, message: 'On to the next part.' };
}

function finishJob(world: GameWorldState, cell: RebelCell, def: JobDefinition, run: JobRun, end: JobEnd, ctx: Record<string, string>): void {
    run.status = end;
    run.endedAtSeconds = world.nowSeconds;
    run.story.push(fillTemplate(def.endings[end], ctx));
    cell.jobsRun = (cell.jobsRun ?? 0) + 1;
    cell.nextActAtSeconds = world.nowSeconds + HELD_ACT_COOLDOWN_SECONDS;
    const sh = cell.safeHouse;
    sh.concealment = Math.max(0.1, sh.concealment - run.noise * COVER_PER_NOISE);

    if (end === 'failure') {
        sh.concealment = Math.max(0.1, sh.concealment - FAILURE_COVER_LOSS);
        cell.strength = Math.max(0, cell.strength - FAILURE_STRENGTH_LOSS);
        return;
    }
    // Success and a partial success are the job's act, exactly as a strike would be.
    commitAct(world, cell, def.act, activeSponsorshipsOf(world, cell.id));
    if (end === 'partial') sh.concealment = Math.max(0.1, sh.concealment - PARTIAL_COVER_LOSS);
    for (const c of crewOf(cell, run)) c.bond = Math.min(100, c.bond + (end === 'success' ? BOND_PER_SUCCESS : Math.round(BOND_PER_SUCCESS / 2)));
}

// ─── What the leader sees ────────────────────────────────────────────────────

export function jobView(world: GameWorldState, cell: RebelCell): JobView | null {
    const run = cell.job;
    if (!run) return null;
    const def = JOB_BY_ID[run.jobId];
    if (!def) return null;
    const crew = crewOf(cell, run);
    const ctx = jobContext(world, cell, crew);
    const scene = run.status === 'running' ? def.scenes[run.sceneId] : null;
    return {
        jobId: def.id,
        title: def.title,
        status: run.status,
        crew: crew.map(c => c.name),
        story: run.story,
        sceneText: scene ? fillTemplate(scene.text, ctx) : null,
        choices: scene ? scene.choices.map(c => ({
            id: c.id,
            label: fillTemplate(c.label, ctx),
            odds: c.check ? oddsWord(checkChance(c.check.difficulty, bestSkill(crew, c.check.skill), cell.safeHouse.concealment)) : null,
        })) : [],
        ending: run.status === 'running' ? null : fillTemplate(def.endings[run.status], ctx),
    };
}

export function jobBoard(world: GameWorldState, cell: RebelCell): JobBoardEntry[] {
    if (!cell.exile) return [];
    const ctx = jobContext(world, cell, cell.exile.crew.filter(c => c.status === 'free'));
    return JOBS.map(def => {
        const why = jobBlocker(world, cell, def);
        return { id: def.id, title: def.title, pitch: fillTemplate(def.pitch, ctx), maxCrew: def.maxCrew, open: !why, why };
    });
}
