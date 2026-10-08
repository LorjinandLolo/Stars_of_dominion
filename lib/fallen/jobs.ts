/**
 * lib/fallen/jobs.ts
 * Item 14b: jobs as choose-your-own-adventure. The format, the odds, and the
 * authored jobs. Browser-safe data and pure functions: the page renders from
 * here, the worker resolves from here (lib/fallen/job-service.ts), and the
 * page never decides an outcome.
 *
 *   A job      a branching set of scenes ending in success, a partial success
 *              (it happened, but it was loud) or failure. Success and partial
 *              land as the job's cell act (13b): a heist, a prison break, a
 *              broadcast is the same act a cell commits, nothing more.
 *   A scene    text and two to four choices. Text is a template filled from the
 *              world: {world}, {conqueror}, {empire}, and {skill} for the name
 *              of the crew member on the job best at that skill.
 *   A choice   safe (no roll) or a check of one skill at a difficulty. The
 *              page shows the odds as words, never numbers (agreed 2026-10-08):
 *              not knowing exactly is the thrill.
 */

import type { CellActKind, CompanionSkill } from '../rebellion/rebellion-types';

export type JobEnd = 'success' | 'partial' | 'failure';
export type Difficulty = 'easy' | 'fair' | 'hard' | 'desperate';

export interface JobStep {
    text: string;
    /** Next scene id, or how the job ends. */
    next: string | JobEnd;
    /** How much attention this drew (0–3): costs cover when the job ends. */
    noise?: number;
}

export interface JobChoice {
    id: string;
    label: string;
    /** No check: always the success step. */
    check?: { skill: CompanionSkill; difficulty: Difficulty } | null;
    success: JobStep;
    failure?: JobStep;
}

export interface JobScene {
    id: string;
    text: string;
    choices: JobChoice[];
}

export interface JobDefinition {
    id: string;
    title: string;
    /** One line for the job board. */
    pitch: string;
    act: CellActKind;
    /** Crew a job takes at most. */
    maxCrew: number;
    start: string;
    scenes: Record<string, JobScene>;
    endings: Record<JobEnd, string>;
}

// ─── Odds ────────────────────────────────────────────────────────────────────

/** Base chance by difficulty, before the crew. */
export const DIFFICULTY_BASE: Record<Difficulty, number> = { easy: 0.7, fair: 0.5, hard: 0.3, desperate: 0.15 };
/** Each point of the best crew member's skill. */
export const SKILL_STEP = 0.08;
/** Cover helps: a hidden cell moves more freely. */
export const COVER_WEIGHT = 0.1;

export function checkChance(difficulty: Difficulty, bestSkill: number, concealment: number): number {
    const raw = DIFFICULTY_BASE[difficulty] + Math.max(0, bestSkill) * SKILL_STEP + (concealment - 0.5) * COVER_WEIGHT;
    return Math.max(0.05, Math.min(0.95, raw));
}

/** The words a choice shows instead of a number. */
export function oddsWord(chance: number): string {
    if (chance < 0.3) return 'long odds';
    if (chance < 0.45) return 'against us';
    if (chance < 0.6) return 'a coin toss';
    if (chance < 0.8) return 'good odds';
    return 'near certain';
}

/** Fill a template from the job's context. Unknown placeholders are left as plain words. */
export function fillTemplate(text: string, ctx: Record<string, string>): string {
    return text.replace(/\{([a-z]+)\}/g, (_, key: string) => ctx[key] ?? 'someone');
}

// ─── The jobs ────────────────────────────────────────────────────────────────

export const JOBS: JobDefinition[] = [
    {
        id: 'payroll',
        title: 'The payroll ship',
        pitch: 'The garrison on {world} is paid in cash, once a month, off a courier ship. Take it.',
        act: 'heist',
        maxCrew: 3,
        start: 'approach',
        scenes: {
            approach: {
                id: 'approach',
                text: 'The courier sets down at the garrison pad at dusk. Four guards, one clerk, a strongbox bolted to the deck. {piloting} has a stolen maintenance tug; {infiltration} has a dock pass that might still work.',
                choices: [
                    { id: 'pass', label: 'Walk in on the dock pass', check: { skill: 'infiltration', difficulty: 'fair' },
                        success: { text: 'The guard reads the pass, yawns, and waves {infiltration} through.', next: 'deck' },
                        failure: { text: 'The guard reads the pass twice and reaches for the comm. {infiltration} walks away, fast. They are looking now.', next: 'deck', noise: 1 } },
                    { id: 'tug', label: 'Come in from below in the tug', check: { skill: 'piloting', difficulty: 'hard' },
                        success: { text: '{piloting} slides the tug under the courier\'s belly without a light showing.', next: 'deck' },
                        failure: { text: 'The tug scrapes the hull. Somewhere above, a guard shouts.', next: 'deck', noise: 2 } },
                ],
            },
            deck: {
                id: 'deck',
                text: 'The strongbox. A forty-second lock, and boots on the ramp.',
                choices: [
                    { id: 'crack', label: 'Crack it here', check: { skill: 'tech', difficulty: 'fair' },
                        success: { text: '{tech} has it open in thirty seconds. The money is real, and there is a lot of it.', next: 'out' },
                        failure: { text: 'The lock jams. {tech} swears and keeps working; the boots get closer.', next: 'standoff', noise: 1 } },
                    { id: 'whole', label: 'Take the whole box', check: { skill: 'violence', difficulty: 'hard' },
                        success: { text: '{violence} rips the bolts out of the deck. It takes two of you to carry it.', next: 'out', noise: 1 },
                        failure: { text: 'The bolts hold. The guards are on the ramp.', next: 'standoff', noise: 1 } },
                ],
            },
            standoff: {
                id: 'standoff',
                text: 'Four guards, weapons up, and the box still shut.',
                choices: [
                    { id: 'talk', label: 'Talk: you are the relief crew, and late', check: { skill: 'talk', difficulty: 'hard' },
                        success: { text: '{talk} is so tired, so bored and so sure of themselves that the sergeant apologises.', next: 'out' },
                        failure: { text: 'The sergeant does not believe a word.', next: 'failure', noise: 2 } },
                    { id: 'run', label: 'Leave the money and run',
                        success: { text: 'You get out with nothing but your lives. Tonight that is enough.', next: 'failure', noise: 1 } },
                ],
            },
            out: {
                id: 'out',
                text: 'Money in hand. The pad lights are coming on.',
                choices: [
                    { id: 'quiet', label: 'Walk out slowly, like workers going home', check: { skill: 'infiltration', difficulty: 'easy' },
                        success: { text: 'Nobody looks twice at people carrying bags at the end of a shift.', next: 'success' },
                        failure: { text: 'A patrol stops you at the gate. You get through, but they will remember faces.', next: 'partial', noise: 1 } },
                    { id: 'fly', label: 'Fly out in the tug, now', check: { skill: 'piloting', difficulty: 'fair' },
                        success: { text: '{piloting} has you off the pad and into the traffic lanes before the alarm sounds.', next: 'success', noise: 1 },
                        failure: { text: 'The tug is tracked half way home. You ditch it, and the money gets out on foot.', next: 'partial', noise: 2 } },
                ],
            },
        },
        endings: {
            success: 'The garrison on {world} will not be paid this month. {conqueror} will want to know why.',
            partial: 'You have the money. {conqueror} has descriptions.',
            failure: 'Nothing taken, and {conqueror} knows someone tried.',
        },
    },
    {
        id: 'detention',
        title: 'The detention block',
        pitch: 'People who spoke for {empire} are held in the old customs house on {world}. Get them out.',
        act: 'prison_break',
        maxCrew: 3,
        start: 'plan',
        scenes: {
            plan: {
                id: 'plan',
                text: 'The customs house has one gate, one shift change, and a records office nobody guards because nobody wants to work there. {tech} knows the old building plans; {talk} knows a guard who drinks.',
                choices: [
                    { id: 'papers', label: 'Forge transfer papers', check: { skill: 'tech', difficulty: 'fair' },
                        success: { text: '{tech} produces a transfer order with a seal that would fool its own author.', next: 'inside' },
                        failure: { text: 'The seal is wrong, and the duty officer notices. You are in, but on borrowed time.', next: 'inside', noise: 1 } },
                    { id: 'guard', label: 'Buy the guard who drinks', check: { skill: 'talk', difficulty: 'fair' },
                        success: { text: 'The guard takes the money and leaves a side door unlocked.', next: 'inside' },
                        failure: { text: 'The guard takes the money and tells his sergeant.', next: 'alarm', noise: 2 } },
                ],
            },
            inside: {
                id: 'inside',
                text: 'The cells. Eleven people, some of whom you know. One of them is too weak to walk.',
                choices: [
                    { id: 'all', label: 'Everyone comes, whatever it costs us in time', check: { skill: 'violence', difficulty: 'hard' },
                        success: { text: '{violence} carries the weak one on their back. Eleven people walk out.', next: 'success', noise: 1 },
                        failure: { text: 'It takes too long. The shift changes with half of them still in the corridor.', next: 'alarm', noise: 1 } },
                    { id: 'some', label: 'Take those who can run', check: { skill: 'infiltration', difficulty: 'fair' },
                        success: { text: 'Ten walk out. The one left behind watches you go, and does not call out.', next: 'partial' },
                        failure: { text: 'Even the quick ones are not quick enough.', next: 'alarm', noise: 1 } },
                ],
            },
            alarm: {
                id: 'alarm',
                text: 'The alarm. Doors closing, one by one, along the corridor.',
                choices: [
                    { id: 'fight', label: 'Fight through the gate', check: { skill: 'violence', difficulty: 'desperate' },
                        success: { text: 'Somehow, through the gate, into the dark, with the prisoners.', next: 'partial', noise: 3 },
                        failure: { text: 'The gate holds. You go over the wall alone.', next: 'failure', noise: 3 } },
                    { id: 'back', label: 'Abort, and get the crew out',
                        success: { text: 'You leave them. Every one of you will remember the faces at the bars.', next: 'failure', noise: 1 } },
                ],
            },
        },
        endings: {
            success: 'They are free, and hidden, and some of them will join us. {conqueror} has an empty block on {world} and no idea who emptied it.',
            partial: 'Most of them are free. {conqueror} is turning the city over looking for the rest.',
            failure: 'The block is still full, and now it is guarded twice over.',
        },
    },
    {
        id: 'broadcast',
        title: 'The broadcast',
        pitch: 'Take over the planetary channel on {world} for five minutes and remind people what {empire} was.',
        act: 'propaganda',
        maxCrew: 2,
        start: 'tower',
        scenes: {
            tower: {
                id: 'tower',
                text: 'The relay tower on the ridge. {tech} can splice into the feed from the maintenance hatch; {talk} wants to read the speech live, from the studio itself.',
                choices: [
                    { id: 'splice', label: 'Splice the feed from outside', check: { skill: 'tech', difficulty: 'fair' },
                        success: { text: 'Every screen on {world} goes dark, then shows the old flag.', next: 'speech' },
                        failure: { text: 'The splice trips a fault alarm. You have the feed, but a repair crew is coming.', next: 'speech', noise: 1 } },
                    { id: 'studio', label: 'Walk into the studio', check: { skill: 'talk', difficulty: 'hard' },
                        success: { text: '{talk} walks past the guard with a clipboard and a smile, and sits down in front of the camera.', next: 'speech' },
                        failure: { text: 'The guard knows every face in that building. {talk} gets out, but the feed is still {conqueror}\'s.', next: 'failure', noise: 1 } },
                ],
            },
            speech: {
                id: 'speech',
                text: 'You are on every screen on {world}. What do you say?',
                choices: [
                    { id: 'names', label: 'Read the names of the dead',
                        success: { text: 'Two minutes of names. In the market, people stop and listen. Some of them weep.', next: 'success', noise: 1 } },
                    { id: 'rise', label: 'Call them to rise', check: { skill: 'talk', difficulty: 'fair' },
                        success: { text: 'It is a good speech. Tomorrow there will be slogans on the walls.', next: 'success', noise: 2 },
                        failure: { text: 'The words come out wrong. People hear anger, not hope.', next: 'partial', noise: 2 } },
                ],
            },
        },
        endings: {
            success: '{world} heard {empire}\'s voice for the first time since the fall. {conqueror} heard it too.',
            partial: 'The broadcast went out, but not the way you meant it.',
            failure: 'The channel is still {conqueror}\'s. Next time.',
        },
    },
];

export const JOB_BY_ID: Record<string, JobDefinition> = Object.fromEntries(JOBS.map(j => [j.id, j]));
