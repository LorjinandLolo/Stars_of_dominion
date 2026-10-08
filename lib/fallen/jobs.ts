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

import type { CellActKind, CompanionSkill, JobApproach } from '../rebellion/rebellion-types';

export type JobEnd = 'success' | 'partial' | 'failure';
export type Difficulty = 'easy' | 'fair' | 'hard' | 'desperate';

export type FateKind = 'wound' | 'capture' | 'death';

export interface JobStep {
    text: string;
    /** Next scene id, or how the job ends. */
    next: string | JobEnd;
    /** How much attention this drew (0–3): costs cover when the job ends. */
    noise?: number;
    /** 14d: what happens to whoever handles this skill on the job. Permanent when it is death. */
    fate?: { kind: FateKind; skill: CompanionSkill } | null;
}

export interface JobChoice {
    id: string;
    label: string;
    /** No check: always the success step. */
    check?: { skill: CompanionSkill; difficulty: Difficulty } | null;
    /** 14d: what this choice may cost, said before it is taken (a template). */
    risk?: string | null;
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
    // 14c: planning
    /** What it is aimed at: one of the conqueror's worlds, one of its fleets, or nothing in particular. */
    target?: 'world' | 'fleet' | 'none';
    /** Recon levels needed before it can be attempted. */
    minRecon?: number;
    /** A big job takes more than a raid on a payroll. */
    takeMultiplier?: number;
    /** The approach chooses where the job begins. */
    starts?: Partial<Record<JobApproach, string>>;
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
                        risk: 'If it fails, {talk} will not get away.',
                        success: { text: '{talk} is so tired, so bored and so sure of themselves that the sergeant apologises.', next: 'out' },
                        failure: { text: 'The sergeant does not believe a word. The rest of you get out; {talk} does not.', next: 'failure', noise: 2, fate: { kind: 'capture', skill: 'talk' } } },
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
                        risk: '{violence} goes first through the gate, and may not come out.',
                        success: { text: 'Somehow, through the gate, into the dark, with the prisoners. {violence} is bleeding.', next: 'partial', noise: 3, fate: { kind: 'wound', skill: 'violence' } },
                        failure: { text: 'The gate holds. {violence} holds the corridor while the rest go over the wall, and is taken.', next: 'failure', noise: 3, fate: { kind: 'capture', skill: 'violence' } } },
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

// ─── Item 14c: planning ──────────────────────────────────────────────────────

/** Sim seconds one level of reconnaissance takes (a sim day, about an hour and a half). */
export const RECON_SECONDS = 86400;
export const MAX_RECON = 2;
/** Every level of recon helps every check. */
export const RECON_STEP = 0.05;
/** Cover a watch costs: somebody might notice the watcher. */
export const RECON_COVER_COST = 0.02;
/** A companion given a part of the job focuses on it. */
export const ROLE_EDGE = 0.05;
/** Gear bought where the conqueror cannot see costs this much of the price. */
export const BLACK_MARKET_DISCOUNT = 0.7;

export interface GearDefinition {
    id: string;
    label: string;
    price: number;
    /** Checks it helps, and by how much. */
    helps: Partial<Record<CompanionSkill, number>>;
    /** Leaves something behind for the investigators when used in a fight. */
    traceable?: boolean;
}

export const GEAR: GearDefinition[] = [
    { id: 'papers', label: 'Forged papers and uniforms', price: 400, helps: { talk: 0.1, infiltration: 0.1 } },
    { id: 'weapons', label: 'Weapons', price: 600, helps: { violence: 0.1 }, traceable: true },
    { id: 'slicer', label: 'A slicer kit', price: 500, helps: { tech: 0.1 } },
    { id: 'skiff', label: 'A fast skiff', price: 800, helps: { piloting: 0.1 } },
];
export const GEAR_BY_ID: Record<string, GearDefinition> = Object.fromEntries(GEAR.map(g => [g.id, g]));

export const APPROACH_LABEL: Record<JobApproach, string> = {
    quiet: 'Quiet: in and out, unseen',
    loud: 'Loud: speed and force',
    inside: 'An inside man: someone on their side opens the door',
};

/** What an approach does to a check of this skill. */
export function approachBonus(approach: JobApproach | null | undefined, skill: CompanionSkill): number {
    if (approach === 'quiet') return skill === 'infiltration' ? 0.05 : -0.05;
    if (approach === 'loud') return skill === 'violence' || skill === 'piloting' ? 0.1 : 0;
    if (approach === 'inside') return skill === 'talk' || skill === 'infiltration' ? 0.12 : 0;
    return 0;
}

/** Noise a step makes under this approach. */
export function approachNoise(approach: JobApproach | null | undefined, noise: number): number {
    if (approach === 'quiet') return Math.floor(noise / 2);
    if (approach === 'loud') return noise > 0 ? noise + 1 : 0;
    return noise;
}

/** Why an approach cannot be used, or null. */
export function approachBlocker(approach: JobApproach, recon: number, roles: Partial<Record<CompanionSkill, string>>): string | null {
    if (approach === 'inside' && recon < 1) return 'An inside man needs at least one watch first: we have to find someone to turn.';
    if (approach === 'inside' && !roles.talk) return 'An inside man needs someone to do the talking.';
    return null;
}

/** Everything a plan adds to one check. */
export function planBonus(skill: CompanionSkill, p: { approach?: JobApproach | null; recon?: number; gear?: string[]; hasRole?: boolean }): number {
    const gear = (p.gear ?? []).reduce((n, id) => n + (GEAR_BY_ID[id]?.helps[skill] ?? 0), 0);
    return approachBonus(p.approach, skill) + (p.recon ?? 0) * RECON_STEP + gear + (p.hasRole ? ROLE_EDGE : 0);
}

// ─── Item 14c: the planned jobs ──────────────────────────────────────────────

JOBS.push(
    {
        id: 'cutter',
        title: 'The cutter',
        pitch: 'A warship of {conqueror} takes on supplies near {world}. Take it, and hide it until we have a navy to put it in.',
        act: 'hijack',
        maxCrew: 3,
        target: 'fleet',
        start: 'berth',
        starts: { quiet: 'berth', loud: 'assault', inside: 'crewman' },
        scenes: {
            berth: {
                id: 'berth',
                text: 'The ship sits in the resupply berth, hatches open, crew ashore for the night. {infiltration} walks up the ramp with a crate on one shoulder.',
                choices: [
                    { id: 'slip', label: 'Slip aboard with the stores', check: { skill: 'infiltration', difficulty: 'fair' },
                        success: { text: 'Nobody counts the people carrying crates.', next: 'bridge' },
                        failure: { text: 'A deck officer asks for a manifest. {infiltration} hands one over; it will not survive a second look.', next: 'bridge', noise: 1 } },
                ],
            },
            assault: {
                id: 'assault',
                text: 'Five minutes before the crew comes back. The airlock guard is bored and alone.',
                choices: [
                    { id: 'storm', label: 'Storm the airlock', check: { skill: 'violence', difficulty: 'hard' },
                        success: { text: '{violence} is through before the guard has finished turning round.', next: 'bridge', noise: 2 },
                        failure: { text: 'The guard gets a shot off, and {violence} takes it. Every light in the berth comes on.', next: 'bridge', noise: 3, fate: { kind: 'wound', skill: 'violence' } } },
                ],
            },
            crewman: {
                id: 'crewman',
                text: 'The engineer we turned is waiting at the service hatch, sweating. {talk} has the money; the engineer wants more.',
                choices: [
                    { id: 'pay', label: 'Pay what they ask', check: { skill: 'talk', difficulty: 'easy' },
                        success: { text: 'The hatch opens. The engineer walks away and does not look back.', next: 'bridge' },
                        failure: { text: 'The engineer takes the money and runs, leaving the hatch half open and an alarm half tripped.', next: 'bridge', noise: 1 } },
                ],
            },
            bridge: {
                id: 'bridge',
                text: 'The bridge. A launch lockout, a docking clamp, and a navigation core that phones home.',
                choices: [
                    { id: 'override', label: 'Override the lockout and pull the core', check: { skill: 'tech', difficulty: 'fair' },
                        success: { text: '{tech} kills the transponder and frees the clamps in one move.', next: 'launch' },
                        failure: { text: 'The clamps release, but the transponder keeps talking for ninety seconds.', next: 'launch', noise: 2 } },
                    { id: 'cut', label: 'Cut the clamps by hand', check: { skill: 'violence', difficulty: 'hard' },
                        success: { text: 'Sparks, a scream of metal, and the ship is free.', next: 'launch', noise: 1 },
                        failure: { text: 'The clamp holds. Boots on the ramp.', next: 'abandon', noise: 2 } },
                ],
            },
            launch: {
                id: 'launch',
                text: 'Engines hot, berth doors closing. {piloting} has the stick.',
                choices: [
                    { id: 'run', label: 'Run for the traffic lanes', check: { skill: 'piloting', difficulty: 'fair' },
                        success: { text: 'Into the lanes, transponder dark, one more freighter among thousands.', next: 'success' },
                        failure: { text: 'Pursuit for an hour. You lose them, but the ship is scarred and the cameras have its picture.', next: 'partial', noise: 1 } },
                    { id: 'doors', label: 'Through the closing doors', check: { skill: 'piloting', difficulty: 'hard' },
                        success: { text: 'With a hand\'s breadth to spare. Nobody follows that.', next: 'success' },
                        failure: { text: 'The doors take a strip off the hull, and the ship limps home.', next: 'partial', noise: 2 } },
                ],
            },
            abandon: {
                id: 'abandon',
                text: 'The ship is not going anywhere. Neither, soon, are you.',
                choices: [
                    { id: 'out', label: 'Get everyone off',
                        success: { text: 'Over the side and into the dark. Empty-handed.', next: 'failure', noise: 1 } },
                    { id: 'cover', label: 'Hold the ramp so the clamp can be cut', check: { skill: 'violence', difficulty: 'desperate' },
                        risk: 'Whoever holds the ramp may not come back. It will be {violence}.',
                        success: { text: '{violence} holds the ramp. The clamp gives. {violence} is the last aboard, hit twice.', next: 'launch', noise: 2, fate: { kind: 'wound', skill: 'violence' } },
                        failure: { text: '{violence} holds the ramp long enough for the rest of you to get off the ship. Not long enough to follow.', next: 'failure', noise: 2, fate: { kind: 'death', skill: 'violence' } } },
                ],
            },
        },
        endings: {
            success: 'A warship of {conqueror} is gone from its berth near {world}, and lies in our hidden dock.',
            partial: 'The ship is ours, but {conqueror} saw it go, and saw our faces.',
            failure: 'The ship stays where it was, and {conqueror} doubles the guard on every berth near {world}.',
        },
    },
    {
        id: 'vault',
        title: 'The garrison vault',
        pitch: 'Once a quarter the garrison on {world} holds the whole sector\'s pay in one vault, for one night. Months of planning, one chance.',
        act: 'heist',
        maxCrew: 5,
        target: 'world',
        minRecon: 2,
        takeMultiplier: 6,
        start: 'payday',
        starts: { quiet: 'payday', loud: 'convoy', inside: 'clerk' },
        scenes: {
            payday: {
                id: 'payday',
                text: 'Festival night on {world}. The garrison drinks; the vault fills. You are in their uniforms, in their ranks, at their parade.',
                choices: [
                    { id: 'march', label: 'March in with the relief column', check: { skill: 'infiltration', difficulty: 'fair' },
                        success: { text: 'Nobody looks at faces on a parade ground.', next: 'vault' },
                        failure: { text: 'An officer stops {infiltration}: wrong insignia. A long moment, then a shrug.', next: 'vault', noise: 1 } },
                ],
            },
            convoy: {
                id: 'convoy',
                text: 'The pay comes in by armoured convoy. One bridge, one bend, one chance to stop it.',
                choices: [
                    { id: 'ambush', label: 'Blow the bridge and take the convoy', check: { skill: 'violence', difficulty: 'hard' },
                        success: { text: 'The bridge goes down, the convoy stops, and {violence} is on the lead truck before the dust settles.', next: 'vault', noise: 2 },
                        failure: { text: 'The charge goes early, too close to {violence}. The convoy scatters, and every soldier on {world} hears it.', next: 'siege', noise: 3, fate: { kind: 'wound', skill: 'violence' } } },
                ],
            },
            clerk: {
                id: 'clerk',
                text: 'The paymaster\'s clerk is ours, and has been for a month. Tonight they write the vault codes on a napkin.',
                choices: [
                    { id: 'codes', label: 'Take the codes and go in', check: { skill: 'talk', difficulty: 'fair' },
                        success: { text: 'The napkin is real. So are the codes.', next: 'vault' },
                        failure: { text: 'The clerk loses their nerve and gives you half the codes.', next: 'vault', noise: 1 } },
                ],
            },
            vault: {
                id: 'vault',
                text: 'The vault. More money than {empire} raised in its last year. A time lock, and a guard post above.',
                choices: [
                    { id: 'lock', label: 'Beat the time lock', check: { skill: 'tech', difficulty: 'hard' },
                        success: { text: '{tech} works for eleven minutes. The door opens on the twelfth.', next: 'load' },
                        failure: { text: 'The lock will not move. You will have to cut it, and cutting is loud.', next: 'siege', noise: 2 } },
                    { id: 'guard', label: 'Make the guard open it', check: { skill: 'talk', difficulty: 'hard' },
                        success: { text: 'The guard believes {talk} is the inspector-general. Or wants to.', next: 'load' },
                        failure: { text: 'The guard does not believe a word, and hits the alarm.', next: 'siege', noise: 2 } },
                ],
            },
            siege: {
                id: 'siege',
                text: 'Alarms. The garrison is coming, drunk or not. Someone has to hold the stairs while the rest carry.',
                choices: [
                    { id: 'hold', label: 'Hold the stairs', check: { skill: 'violence', difficulty: 'desperate' },
                        risk: 'Whoever holds the stairs may not walk out. It will be {violence}.',
                        success: { text: '{violence} holds the stairs for long enough, and walks out last, bleeding.', next: 'load', noise: 2, fate: { kind: 'wound', skill: 'violence' } },
                        failure: { text: '{violence} holds the stairs until the end. The rest of you get out with what was in your hands, and without {violence}.', next: 'partial', noise: 2, fate: { kind: 'death', skill: 'violence' } } },
                    { id: 'go', label: 'Grab what you can and go',
                        success: { text: 'Two bags, not twenty. It will have to do.', next: 'partial', noise: 1 } },
                ],
            },
            load: {
                id: 'load',
                text: 'The vault is open. Out is a cargo shuttle on the parade ground, and {piloting} at its controls.',
                choices: [
                    { id: 'lift', label: 'Lift off with all of it', check: { skill: 'piloting', difficulty: 'fair' },
                        success: { text: 'Over the festival lights and into the dark, heavy with a quarter\'s pay.', next: 'success', noise: 1 },
                        failure: { text: 'The shuttle takes fire and sheds half its load over the parade ground.', next: 'partial', noise: 2 } },
                ],
            },
        },
        endings: {
            success: 'The garrison on {world} will not be paid this quarter, and every soldier there knows who took it. {conqueror} will never say how much.',
            partial: 'You have some of it, and {conqueror} has the rest of the night to count what is missing.',
            failure: 'Nothing. And {conqueror} knows exactly what you were after.',
        },
    },
);
for (const j of JOBS) if (!j.target) j.target = j.act === 'heist' ? 'world' : 'none';
for (const j of JOBS) JOB_BY_ID[j.id] = j;

// ─── Item 14e: the hunter ────────────────────────────────────────────────────

JOBS.push({
    id: 'inspector',
    title: 'The inspector',
    pitch: '{hunter} has hunted us long enough. Learn their routine, and end it.',
    act: 'ambush',
    maxCrew: 3,
    target: 'none',
    minRecon: 1,
    start: 'road',
    starts: { quiet: 'road', loud: 'office', inside: 'driver' },
    scenes: {
        road: {
            id: 'road',
            text: '{hunter} takes the same road to the security bureau every morning, one escort car behind. {infiltration} knows the crossing where they slow down.',
            choices: [
                { id: 'wait', label: 'Wait at the crossing among the morning crowd', check: { skill: 'infiltration', difficulty: 'fair' },
                    success: { text: 'Nobody notices one more worker waiting for the tram.', next: 'strike' },
                    failure: { text: 'A patrol asks {infiltration} for papers, and takes too long reading them. The car is already coming.', next: 'strike', noise: 1 } },
            ],
        },
        office: {
            id: 'office',
            text: 'The security bureau on {world}. {hunter} works late, and the night guard is two people and a dog.',
            choices: [
                { id: 'storm', label: 'Go in through the front', check: { skill: 'violence', difficulty: 'hard' },
                    success: { text: '{violence} is up the stairs before the alarm finishes its first note.', next: 'strike', noise: 2 },
                    failure: { text: 'The guards are better than they looked. {violence} is hit on the stairs, and keeps climbing.', next: 'strike', noise: 3, fate: { kind: 'wound', skill: 'violence' } } },
            ],
        },
        driver: {
            id: 'driver',
            text: '{hunter}\'s driver has a family on a world {conqueror} burned. {talk} has been talking to them for a month.',
            choices: [
                { id: 'turn', label: 'Ask the driver to take the long way tonight', check: { skill: 'talk', difficulty: 'fair' },
                    success: { text: 'The driver says nothing, and takes the long way.', next: 'strike' },
                    failure: { text: 'The driver takes the long way, and tells the escort car why.', next: 'strike', noise: 2 } },
            ],
        },
        strike: {
            id: 'strike',
            text: '{hunter}. Close enough to see their face, the one from every report.',
            choices: [
                { id: 'shoot', label: 'Now', check: { skill: 'violence', difficulty: 'fair' },
                    success: { text: 'It is over in a second. It took a year.', next: 'escape', noise: 1 },
                    failure: { text: 'The shot goes wide. The escort is out of its car.', next: 'missed', noise: 2 } },
            ],
        },
        missed: {
            id: 'missed',
            text: '{hunter} is down behind the car, alive, shouting into a radio.',
            choices: [
                { id: 'again', label: 'Go in after them', check: { skill: 'violence', difficulty: 'desperate' },
                    risk: '{violence} goes in alone. They may not come back out.',
                    success: { text: '{violence} goes round the car. It ends there.', next: 'escape', noise: 2 },
                    failure: { text: '{violence} goes round the car, and does not come back. {hunter} is carried away alive.', next: 'failure', noise: 2, fate: { kind: 'death', skill: 'violence' } } },
                { id: 'run', label: 'Get out while you can',
                    success: { text: 'You run. Behind you, {hunter} is already giving orders.', next: 'failure', noise: 1 } },
            ],
        },
        escape: {
            id: 'escape',
            text: 'Sirens. {piloting} has a car two streets away.',
            choices: [
                { id: 'drive', label: 'Drive', check: { skill: 'piloting', difficulty: 'fair' },
                    risk: 'If the car is boxed in, {piloting} will not get out of it.',
                    success: { text: 'Through the market, under the old rail bridge, and gone.', next: 'success' },
                    failure: { text: 'The car is boxed in at the bridge. The rest of you get out on foot; {piloting} does not.', next: 'partial', noise: 2, fate: { kind: 'capture', skill: 'piloting' } } },
            ],
        },
    },
    endings: {
        success: '{hunter} is dead. {conqueror} will send someone else, and they will want it more.',
        partial: '{hunter} is dead, and {conqueror} knows exactly who did it.',
        failure: '{hunter} lives, and has seen our faces now.',
    },
});
JOB_BY_ID.inspector = JOBS[JOBS.length - 1];
