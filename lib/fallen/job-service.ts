/**
 * lib/fallen/job-service.ts
 * Items 14b and 14c: the server plans and plays the jobs. Server-only (reaches
 * the cell acts and the black market).
 *
 * The page sends only a job id and crew to start (or a plan), then one choice
 * id at a time. Every roll is drawn from the job's seed and the step it is on,
 * so the same seed and the same choices always play the same way, and nothing
 * the page sends can say how a roll came out. A job that ends in success or a
 * partial success lands as its cell act through commitAct, exactly as a
 * strike would; a loud job costs cover; a failed one costs cover and a little
 * strength.
 *
 * 14c: a job can be planned against a real target the cell can see (one of
 * the conqueror's worlds nearby, or one of its fleets), with watches that take
 * sim days, gear bought from the cell's own money (cheaper at a black market),
 * a part of the job for each companion, and an approach that changes where the
 * job begins and how loud it is. A hijacking moves a real ship out of the
 * conqueror's fleet into the exiles' hidden dock. What a job leaves behind
 * (witnesses, a camera, a dropped weapon) becomes clues on the conqueror's
 * file. Wounds, capture and death come with 14d.
 */

import type { GameWorldState } from '../game-world-state';
import {
    HELD_ACT_COOLDOWN_SECONDS, noteForSeat,
    type Companion, type CompanionSkill, type JobApproach, type JobBoardEntry, type JobPlan,
    type JobPlanView, type JobRun, type JobTrace, type JobView, type RebelCell,
} from '../rebellion/rebellion-types';
import { ACT_MIN_STRENGTH, activeSponsorshipsOf, commitAct } from '../rebellion/sponsor-service';
import {
    APPROACH_LABEL, BLACK_MARKET_DISCOUNT, GEAR, GEAR_BY_ID, JOBS, JOB_BY_ID, MAX_RECON, RECON_COVER_COST, RECON_SECONDS,
    approachBlocker, approachNoise, checkChance, fillTemplate, oddsWord, planBonus,
    type JobChoice, type JobDefinition, type JobEnd, type JobStep,
} from './jobs';
import { RNG, seedFromString } from '../trade-system/rng';
import { labelFor } from '../time/notification-names';
import { marketAt } from '../piracy/black-market-service';
import { unitConfigFor } from '../combat/ship-registry';
import { speciesLabel, withArticle, empiresOfSpecies } from '../espionage/dossier';
import { HOMEGROWN } from '../rebellion/rebellion-types';
import { applyFate, crewAfterJob, crewCheckModifier } from './crew-service';
import { hunterTargetBlocker, killHunter } from './hunter-service';
import { hunterLabel } from '../rebellion/rebellion-types';
import type { CaseClue, CovertCase } from '../espionage/espionage-types';
import { allyCellsOf, busyIds, ownerCellOf, pooledCrew } from './fellows-service';
import { SANCTUARY_STAGING, jobTravelEvidence } from './sanctuary-service';
import { inSanctuary } from '../rebellion/rebellion-types';

export type JobResult = { ok: true; message: string } | { ok: false; message: string };

/** Bond a companion gains from a job that came off. */
export const BOND_PER_SUCCESS = 6;
/** Cover lost per point of noise, at the end of a job. */
export const COVER_PER_NOISE = 0.05;
export const FAILURE_COVER_LOSS = 0.1;
export const FAILURE_STRENGTH_LOSS = 2;
export const PARTIAL_COVER_LOSS = 0.05;
/** A fleet must have at least this many ships for one to be taken unnoticed among the rest. */
export const HIJACK_MIN_FLEET_SHIPS = 2;
const SHIP_ORDER = ['corvette', 'frigate', 'destroyer', 'cruiser', 'battlecruiser', 'battleship'];
const SKILLS: CompanionSkill[] = ['infiltration', 'violence', 'piloting', 'talk', 'tech'];

/** The people on a job, from our crew and (14f) our fellow exiles'. */
function crewOf(world: GameWorldState, cell: RebelCell, ids: string[]): Companion[] {
    const crew = pooledCrew(world, cell);
    return ids.map(id => crew.find(c => c.id === id)).filter((c): c is Companion => !!c);
}

/** Who does this part of the job: the companion given it, or the crew's best at it. */
function personFor(crew: Companion[], roles: Partial<Record<CompanionSkill, string>> | undefined, skill: CompanionSkill): { who: Companion | null; assigned: boolean } {
    const assignedId = roles?.[skill];
    const assigned = assignedId ? crew.find(c => c.id === assignedId && c.status === 'free') : undefined;
    if (assigned) return { who: assigned, assigned: true };
    const best = [...crew].filter(c => c.status === 'free').sort((a, b) => b.skills[skill] - a.skills[skill])[0] ?? null;
    return { who: best, assigned: false };
}

/** Fill a job's text for this cell: the target world, the conqueror, the old empire, and who does what. */
export function jobContext(world: GameWorldState, cell: RebelCell, crew: Companion[], roles?: Partial<Record<CompanionSkill, string>>, targetPlanetId?: string | null): Record<string, string> {
    const planet: any = world.construction?.planets?.get?.(targetPlanetId ?? cell.planetId) ?? world.construction?.planets?.get?.(cell.planetId);
    const ctx: Record<string, string> = {
        world: String(planet?.name ?? 'the hideout world'),
        conqueror: cell.exile?.conquerorName ?? labelFor(cell.hostFactionId),
        empire: cell.exile?.fromName ?? 'the old empire',
        // 14e: the officer hunting us, by name.
        hunter: hunterLabel(cell) ?? cell.exile?.hunter?.name ?? 'the officer',
    };
    for (const s of SKILLS) ctx[s] = personFor(crew, roles, s).who?.name ?? crew[0]?.name ?? 'someone';
    return ctx;
}

/** The chance of one check, everything counted. */
function chanceOf(cell: RebelCell, crew: Companion[], check: NonNullable<JobChoice['check']>, plan: { approach?: JobApproach | null; recon?: number; gear?: string[]; roles?: Partial<Record<CompanionSkill, string>> }, consume = false): { chance: number; who: Companion | null } {
    const { who, assigned } = personFor(crew, plan.roles, check.skill);
    const base = checkChance(check.difficulty, who?.skills[check.skill] ?? 0, cell.safeHouse.concealment);
    // 14d: a traitor on the job, or a forged identity's one walk-in.
    const chance = base + planBonus(check.skill, { ...plan, hasRole: assigned }) + crewCheckModifier(crew, check.skill, consume);
    return { chance: Math.max(0.05, Math.min(0.95, chance)), who };
}

// ─── Targets (14c) ───────────────────────────────────────────────────────────

/** Systems the cell can reach: its own and the neighbouring ones. */
function reachOf(world: GameWorldState, cell: RebelCell): Set<string> {
    const here: any = world.movement?.systems?.get?.(cell.systemId);
    return new Set<string>([cell.systemId, ...((here?.hyperlaneNeighbors as string[]) ?? [])]);
}

function shipCount(fleet: any): number {
    return Object.values(fleet?.composition ?? {}).reduce((n: number, v: any) => n + Number(v ?? 0), 0);
}

/** What a job can be aimed at, as the cell can see it. */
export function targetsFor(world: GameWorldState, cell: RebelCell, def: JobDefinition): { id: string; label: string }[] {
    const reach = reachOf(world, cell);
    const host = cell.hostFactionId;
    if (def.target === 'world') {
        return [...((world.construction?.planets?.values?.() ?? []) as Iterable<any>)]
            .filter(p => p.ownerId === host && reach.has(p.systemId))
            .sort((a, b) => Number(b.population ?? 0) - Number(a.population ?? 0))
            .map(p => ({ id: p.id, label: `${p.name}${p.id === cell.planetId ? ' (here)' : ''}` }));
    }
    if (def.target === 'fleet') {
        return [...((world.movement?.fleets?.values?.() ?? []) as Iterable<any>)]
            .filter(f => f.factionId === host && reach.has(f.currentSystemId) && !f.destinationSystemId && shipCount(f) >= HIJACK_MIN_FLEET_SHIPS)
            .map(f => {
                const sys: any = world.movement?.systems?.get?.(f.currentSystemId);
                return { id: f.id, label: `${f.name ?? 'A squadron'} at ${sys?.name ?? 'a nearby system'} (${shipCount(f)} ships)` };
            });
    }
    return [];
}

// ─── Planning (14c) ──────────────────────────────────────────────────────────

/** Why a job cannot be taken now, plan or no plan, or null. */
export function jobBlocker(world: GameWorldState, cell: RebelCell, def: JobDefinition): string | null {
    if (!cell.exile) return 'Only a crew can take a job.';
    if (cell.status !== 'active') return 'The movement is gone.';
    if (cell.job?.status === 'running') return 'A job is already under way.';
    if (cell.lyingLow) return 'We are lying low.';
    if (cell.strength < ACT_MIN_STRENGTH) return `The movement needs strength ${ACT_MIN_STRENGTH} for a job.`;
    if ((cell.nextActAtSeconds ?? 0) > world.nowSeconds) return 'Too soon after the last job: let things go quiet first.';
    if (!pooledCrew(world, cell).some(c => c.status === 'free')) return 'Nobody is free to go.';
    if (def.target !== 'none' && targetsFor(world, cell, def).length === 0) return def.target === 'fleet' ? 'No ship of theirs is within reach.' : 'None of their worlds is within reach.';
    if (def.act === 'ambush') return hunterTargetBlocker(world, cell);
    return null;
}

function checkCrew(world: GameWorldState, cell: RebelCell, def: JobDefinition, ids: string[]): string | null {
    if (ids.length === 0) return 'Choose who goes.';
    if (ids.length > def.maxCrew) return `This job takes at most ${def.maxCrew}.`;
    const crew = pooledCrew(world, cell);
    // A fellow exile's people out on their own job or watch are not ours to send.
    const busy = new Set<string>();
    for (const a of allyCellsOf(world, cell)) for (const id of busyIds(world, a)) busy.add(id);
    for (const id of ids) {
        const c = crew.find(x => x.id === id);
        if (!c) return 'That person is not one of ours.';
        if (c.status !== 'free') return `${c.name} cannot go: ${c.status}.`;
        if (busy.has(id) && !cell.exile!.crew.some(x => x.id === id)) return `${c.name} is busy with their own people.`;
    }
    return null;
}

/** The fellow exiles' cells whose people are on this crew. */
function partyOf(world: GameWorldState, cell: RebelCell, ids: string[]): string[] {
    return [...new Set(ids.map(id => ownerCellOf(world, cell, id).id))].filter(id => id !== cell.id);
}

/** Plan a job: target, approach, who goes, who does what. Watches and gear carry over while the target stays the same. */
export function setPlan(world: GameWorldState, cell: RebelCell, input: { jobId?: unknown; targetId?: unknown; approach?: unknown; crewIds?: unknown; roles?: unknown }): JobResult {
    const def = JOB_BY_ID[String(input.jobId ?? '')];
    if (!def) return { ok: false, message: 'No such job.' };
    if (!cell.exile) return { ok: false, message: 'Only a crew can plan a job.' };
    const approach = String(input.approach ?? 'quiet') as JobApproach;
    if (!(approach in APPROACH_LABEL)) return { ok: false, message: 'Unknown approach.' };
    const ids = Array.isArray(input.crewIds) ? [...new Set(input.crewIds.map(String))] : [];
    const crewProblem = checkCrew(world, cell, def, ids);
    if (crewProblem) return { ok: false, message: crewProblem };
    const targetId = input.targetId ? String(input.targetId) : null;
    if (def.target !== 'none' && !targetsFor(world, cell, def).some(t => t.id === targetId)) return { ok: false, message: 'Pick a target within reach.' };
    const roles: Partial<Record<CompanionSkill, string>> = {};
    if (input.roles && typeof input.roles === 'object') {
        for (const [skill, who] of Object.entries(input.roles as Record<string, unknown>)) {
            if (SKILLS.includes(skill as CompanionSkill) && typeof who === 'string' && ids.includes(who)) roles[skill as CompanionSkill] = who;
        }
    }
    const old = cell.plan;
    const sameTarget = !!old && old.jobId === def.id && old.targetId === targetId;
    cell.plan = {
        jobId: def.id, targetId, approach, crewIds: ids, roles,
        recon: sameTarget ? old!.recon : 0,
        reconBy: sameTarget ? old!.reconBy ?? null : null,
        reconUntilSeconds: sameTarget ? old!.reconUntilSeconds ?? null : null,
        gear: old?.gear ?? [],
        // 14f: any change to the plan asks every fellow exile on it to commit again.
        party: partyOf(world, cell, ids),
        commits: [],
    };
    const party = cell.plan.party ?? [];
    return { ok: true, message: party.length ? `${def.title}: planned. Waiting on our fellow exiles to commit their people.` : `${def.title}: planned.` };
}

/** Send someone to watch the target. It takes a sim day, and a watcher can be noticed. */
export function startRecon(world: GameWorldState, cell: RebelCell, companionId: unknown): JobResult {
    const plan = cell.plan;
    if (!plan) return { ok: false, message: 'Plan a job first.' };
    if (plan.reconUntilSeconds) return { ok: false, message: 'Someone is already watching.' };
    if (plan.recon >= MAX_RECON) return { ok: false, message: 'We know all we are going to learn.' };
    const c = cell.exile?.crew.find(x => x.id === String(companionId ?? ''));
    if (!c || c.status !== 'free') return { ok: false, message: 'Send someone who is free.' };
    plan.reconBy = c.id;
    // 14f: from sanctuary, everyone travels: watches take longer to stage.
    plan.reconUntilSeconds = world.nowSeconds + Math.round(RECON_SECONDS * (inSanctuary(cell) ? SANCTUARY_STAGING : 1));
    cell.safeHouse.concealment = Math.max(0.1, cell.safeHouse.concealment - RECON_COVER_COST);
    return { ok: true, message: `${c.name} goes to watch.` };
}

/** A watch that has run its time reports. Returns the report, or null. */
export function tickRecon(world: GameWorldState, cell: RebelCell): string | null {
    const plan = cell.plan;
    if (!plan?.reconUntilSeconds || plan.reconUntilSeconds > world.nowSeconds) return null;
    plan.recon = Math.min(MAX_RECON, plan.recon + 1);
    const who = cell.exile?.crew.find(x => x.id === plan.reconBy)?.name ?? 'Our watcher';
    plan.reconBy = null;
    plan.reconUntilSeconds = null;
    return `${who} is back from watching the target: we know ${plan.recon === 1 ? 'the routine' : 'the routine, the guards and the gaps'}.`;
}

export function gearPrice(world: GameWorldState, cell: RebelCell, gearId: string): { price: number; blackMarket: boolean } {
    const g = GEAR_BY_ID[gearId];
    const blackMarket = !!marketAt(world, cell.systemId);
    return { price: Math.round((g?.price ?? 0) * (blackMarket ? BLACK_MARKET_DISCOUNT : 1)), blackMarket };
}

/** Buy gear for the plan from the movement's own money. */
export function buyGear(world: GameWorldState, cell: RebelCell, gearId: unknown): JobResult {
    const plan = cell.plan;
    if (!plan) return { ok: false, message: 'Plan a job first.' };
    const id = String(gearId ?? '');
    const g = GEAR_BY_ID[id];
    if (!g) return { ok: false, message: 'Nobody sells that.' };
    if (plan.gear.includes(id)) return { ok: false, message: 'We have that already.' };
    const { price, blackMarket } = gearPrice(world, cell, id);
    if ((cell.treasury ?? 0) < price) return { ok: false, message: `${g.label} costs ${price}; we have ${Math.round(cell.treasury ?? 0)}.` };
    cell.treasury = (cell.treasury ?? 0) - price;
    plan.gear.push(id);
    return { ok: true, message: `${g.label}, bought${blackMarket ? ' on the black market' : ''}.` };
}

// ─── Playing ─────────────────────────────────────────────────────────────────

export function startJob(world: GameWorldState, cell: RebelCell, jobId: string, crewIds: unknown): JobResult {
    const def = JOB_BY_ID[jobId];
    if (!def) return { ok: false, message: 'No such job.' };
    const blocked = jobBlocker(world, cell, def);
    if (blocked) return { ok: false, message: blocked };
    const plan = cell.plan?.jobId === jobId ? cell.plan : null;
    if (!plan && (def.target === 'fleet' || (def.minRecon ?? 0) > 0)) return { ok: false, message: 'A job this size needs a plan first.' };
    if (plan?.reconUntilSeconds) return { ok: false, message: 'Wait for the watcher to come back.' };
    if ((def.minRecon ?? 0) > (plan?.recon ?? 0)) return { ok: false, message: `We need ${def.minRecon} watches on the target first.` };
    const ids = plan ? plan.crewIds : (Array.isArray(crewIds) ? [...new Set(crewIds.map(String))] : []);
    const crewProblem = checkCrew(world, cell, def, ids);
    if (crewProblem) return { ok: false, message: crewProblem };
    // 14f: a joint job runs only once every fellow exile with people on it has committed.
    const party = partyOf(world, cell, ids);
    if (party.length && !plan) return { ok: false, message: 'A job with fellow exiles needs a plan they have agreed to.' };
    const waiting = party.filter(id => !(plan?.commits ?? []).includes(id));
    if (waiting.length) return { ok: false, message: `Waiting on ${waiting.map(id => allyCellsOf(world, cell).find(a => a.id === id)?.seat?.displayName ?? 'a fellow exile').join(' and ')} to commit.` };
    if (plan && def.target !== 'none' && !targetsFor(world, cell, def).some(t => t.id === plan.targetId)) return { ok: false, message: 'The target has moved on. Plan again.' };
    const approach = plan?.approach ?? null;
    if (plan) {
        const why = approachBlocker(plan.approach, plan.recon, plan.roles);
        if (why) return { ok: false, message: why };
    }
    const n = cell.jobsRun ?? 0;
    const traces: JobTrace[] = approach === 'loud' ? [{ kind: 'camera', companionId: null }] : [];
    cell.job = {
        jobId, seed: `${cell.id}|${n}|${world.nowSeconds}`, crewIds: ids,
        sceneId: (approach && def.starts?.[approach]) || def.start, step: 0, noise: 0,
        story: [], status: 'running', startedAtSeconds: world.nowSeconds, endedAtSeconds: null,
        approach, targetId: plan?.targetId ?? null, roles: plan?.roles ?? {}, gear: plan?.gear ?? [], recon: plan?.recon ?? 0, traces,
        party,
    };
    for (const a of allyCellsOf(world, cell)) if (party.includes(a.id)) noteForSeat(a, world.nowSeconds, `${def.title}, with ${cell.seat?.displayName ?? 'our fellow exile'}: under way. Any of us can make the calls.`);
    if (plan) cell.plan = null;
    return { ok: true, message: `${def.title}: under way.` };
}

/** The roll for one step of one job: the seed and the step decide it, nothing else. */
export function rollFor(seed: string, step: number): number {
    return new RNG(seedFromString(`${seed}|${step}`)).next();
}

function targetPlanetOf(world: GameWorldState, run: JobRun): string | null {
    if (!run.targetId) return null;
    return world.construction?.planets?.get?.(run.targetId) ? run.targetId : null;
}

export function chooseInJob(world: GameWorldState, cell: RebelCell, choiceId: unknown): JobResult {
    const run = cell.job;
    if (!run || run.status !== 'running') return { ok: false, message: 'No job is under way.' };
    const def = JOB_BY_ID[run.jobId];
    const scene = def?.scenes[run.sceneId];
    const choice = scene?.choices.find(c => c.id === String(choiceId));
    if (!def || !scene || !choice) return { ok: false, message: 'That is not a choice here.' };

    const crew = crewOf(world, cell, run.crewIds);
    const ctx = jobContext(world, cell, crew, run.roles, targetPlanetOf(world, run));
    let step: JobStep = choice.success;
    if (choice.check) {
        const { chance, who } = chanceOf(cell, crew, choice.check, run, true);
        const passed = rollFor(run.seed, run.step) < chance;
        step = passed ? choice.success : (choice.failure ?? choice.success);
        // What the conqueror's people will find: a face seen where a check went wrong,
        // a weapon dropped in a fight.
        if (!passed) (run.traces ??= []).push({ kind: 'witness', companionId: who?.id ?? null });
        if (choice.check.skill === 'violence' && (run.gear ?? []).includes('weapons') && !(run.traces ?? []).some(t => t.kind === 'weapon')) {
            (run.traces ??= []).push({ kind: 'weapon', companionId: who?.id ?? null });
        }
    }
    // 14d: what the step does to whoever handled it.
    if (step.fate) {
        const victim = personFor(crew, run.roles, step.fate.skill).who;
        if (victim) applyFate(world, cell, victim, step.fate.kind, ctx.world, fillTemplate(step.text, ctx));
    }
    const noise = approachNoise(run.approach, step.noise ?? 0);
    if (noise >= 2) (run.traces ??= []).push({ kind: 'witness', companionId: crew[run.step % Math.max(1, crew.length)]?.id ?? null });
    run.step++;
    run.noise += noise;
    run.story.push(`${fillTemplate(choice.label, ctx)}. ${fillTemplate(step.text, ctx)}`);

    if (step.next === 'success' || step.next === 'partial' || step.next === 'failure') {
        finishJob(world, cell, def, run, step.next, ctx);
        return { ok: true, message: fillTemplate(def.endings[run.status as JobEnd], ctx) };
    }
    if (!def.scenes[step.next]) { finishJob(world, cell, def, run, 'failure', ctx); return { ok: true, message: 'The job fell apart.' }; }
    run.sceneId = step.next;
    return { ok: true, message: 'On to the next part.' };
}

/** Take one ship, the smallest, out of a fleet. Returns the class taken, or null. */
function takeShip(world: GameWorldState, fleetId: string | null | undefined): string | null {
    const fleet: any = fleetId ? world.movement?.fleets?.get?.(fleetId) : null;
    if (!fleet || shipCount(fleet) < HIJACK_MIN_FLEET_SHIPS) return null;
    const cls = SHIP_ORDER.find(c => Number(fleet.composition?.[c] ?? 0) > 0)
        ?? Object.keys(fleet.composition ?? {}).find(c => Number(fleet.composition[c]) > 0);
    if (!cls) return null;
    fleet.composition[cls] = Number(fleet.composition[cls]) - 1;
    if (fleet.composition[cls] <= 0) delete fleet.composition[cls];
    const power = unitConfigFor(cls)?.power ?? 10;
    if (typeof fleet.basePower === 'number') fleet.basePower = Math.max(1, fleet.basePower - power);
    return cls;
}

const SHIP_NAMES = ['Last Light', 'Unbowed', 'Second Dawn', 'Ember', 'Old Flag', 'Return', 'Patience', 'Debt Paid'];

function finishJob(world: GameWorldState, cell: RebelCell, def: JobDefinition, run: JobRun, end: JobEnd, ctx: Record<string, string>): void {
    const sh = cell.safeHouse;
    let outcome = end;
    let opts: { takeMultiplier?: number; planetId?: string | null; effect?: string | null } = {
        takeMultiplier: def.takeMultiplier ?? 1,
        planetId: targetPlanetOf(world, run),
    };
    if (outcome !== 'failure' && def.act === 'ambush') {
        const killed = killHunter(world, cell);
        if (!killed) {
            outcome = 'failure';
            run.story.push('There was nobody there. The case has already passed to someone else.');
        } else {
            opts = { ...opts, effect: `${killed} of the security service killed` };
        }
    }
    if (outcome !== 'failure' && def.act === 'hijack') {
        const cls = takeShip(world, run.targetId);
        if (!cls) {
            outcome = 'failure';
            run.story.push('By the time you reach the dock, the ship is gone: its fleet moved on.');
        } else {
            const name = SHIP_NAMES[(cell.jobsRun ?? 0) % SHIP_NAMES.length];
            (cell.exile!.dock ??= []).push({ shipClass: cls, takenFromFactionId: cell.hostFactionId, takenAtSeconds: world.nowSeconds, name });
            opts = { ...opts, effect: `a ${cls} gone from its berth` };
            run.story.push(`The ${cls} is ours. In the hidden dock she has a new name: the ${name}.`);
        }
    }

    run.status = outcome;
    run.endedAtSeconds = world.nowSeconds;
    // 14d: rescues, settled threads, a traitor found out, loyalty that rises or falls.
    for (const line of crewAfterJob(world, cell, run, outcome)) run.story.push(line);
    run.story.push(fillTemplate(def.endings[outcome], ctx));
    cell.jobsRun = (cell.jobsRun ?? 0) + 1;
    // 14f: from sanctuary the next job takes longer to stage; a joint job rests every cell on it.
    const party = allyCellsOf(world, cell).filter(a => (run.party ?? []).includes(a.id));
    for (const c of [cell, ...party]) {
        c.nextActAtSeconds = Math.max(c.nextActAtSeconds ?? 0, world.nowSeconds + Math.round(HELD_ACT_COOLDOWN_SECONDS * (inSanctuary(c) ? SANCTUARY_STAGING : 1)));
        jobTravelEvidence(world, c);
    }
    for (const a of party) noteForSeat(a, world.nowSeconds, `${def.title}, with ${cell.seat?.displayName ?? 'our fellow exile'}: ${fillTemplate(def.endings[outcome], ctx)}`);
    sh.concealment = Math.max(0.1, sh.concealment - run.noise * COVER_PER_NOISE);

    if (outcome === 'failure') {
        sh.concealment = Math.max(0.1, sh.concealment - FAILURE_COVER_LOSS);
        cell.strength = Math.max(0, cell.strength - FAILURE_STRENGTH_LOSS);
        return;
    }
    // Success and a partial success are the job's act, exactly as a strike would be.
    const kase = commitAct(world, cell, def.act, activeSponsorshipsOf(world, cell.id), Math.random, opts);
    if (kase) leaveTraces(world, cell, run, kase, ctx);
    if (outcome === 'partial') sh.concealment = Math.max(0.1, sh.concealment - PARTIAL_COVER_LOSS);
    for (const c of crewOf(world, cell, run.crewIds)) c.bond = Math.min(100, c.bond + (outcome === 'success' ? BOND_PER_SUCCESS : Math.round(BOND_PER_SUCCESS / 2)));
}

/**
 * What the job left behind goes onto the conqueror's file as clues, released
 * like any other finding. Witnesses describe a species (pointing, as in 13b,
 * at every empire of that species among the suspects); a dropped weapon has a
 * maker; and someone always heard the old empire named.
 */
function leaveTraces(world: GameWorldState, cell: RebelCell, run: JobRun, kase: CovertCase, ctx: Record<string, string>): void {
    const now = world.nowSeconds;
    const factions: any = world.economy?.factions;
    const kinOf = (species: string | null) => species
        ? empiresOfSpecies((factions?.entries?.() ?? []) as any, species).filter((id: string) => kase.suspectIds.includes(id))
        : [];
    const out: CaseClue[] = [];
    const seen = new Set<string>();
    let n = 0;
    for (const t of run.traces ?? []) {
        const who = t.companionId ? pooledCrew(world, cell).find(c => c.id === t.companionId) : null;
        const key = `${t.kind}|${who?.id ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const kin = kinOf(who?.species ?? null);
        const weights = Object.fromEntries(kin.map((id: string) => [id, 0]));
        const id = `clue-trace-${run.seed}-${n++}`;
        if (t.kind === 'camera') {
            out.push({ id, source: 'sensors', tag: 'opportunity', text: `Security cameras at ${ctx.world} caught the whole thing: masked figures, moving like soldiers.`, pointsAt: [], weights: {}, arrivedAt: 0 });
        } else if (t.kind === 'weapon') {
            out.push({ id, source: 'method', tag: 'means', text: `A weapon was left behind at ${ctx.world}, bought on the black market, its markings filed off.`, pointsAt: [], weights: {}, arrivedAt: 0 });
        } else if (who) {
            out.push({ id, source: 'press', tag: 'opportunity', text: `Witnesses at ${ctx.world} describe ${withArticle(speciesLabel(who.species))} among them.`, pointsAt: kin, weights, arrivedAt: 0 });
        }
    }
    out.push({
        id: `clue-trace-${run.seed}-${n++}`, source: 'press', tag: 'motive',
        text: `Someone at ${ctx.world} heard them speak of ${ctx.empire} as if it still stood.`,
        pointsAt: [HOMEGROWN], weights: { [HOMEGROWN]: 0.4 }, arrivedAt: 0,
    });
    kase.pendingClues = [...out, ...(kase.pendingClues ?? [])];
    kase.nextClueAt = Math.min(kase.nextClueAt, now);
}

// ─── What the leader sees ────────────────────────────────────────────────────

export function jobView(world: GameWorldState, cell: RebelCell): JobView | null {
    const run = cell.job;
    if (!run) return null;
    const def = JOB_BY_ID[run.jobId];
    if (!def) return null;
    const crew = crewOf(world, cell, run.crewIds);
    const ctx = jobContext(world, cell, crew, run.roles, targetPlanetOf(world, run));
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
            odds: c.check ? oddsWord(chanceOf(cell, crew, c.check, run).chance) : null,
            risk: c.risk ? fillTemplate(c.risk, ctx) : null,
        })) : [],
        ending: run.status === 'running' ? null : fillTemplate(def.endings[run.status], ctx),
    };
}

export function jobBoard(world: GameWorldState, cell: RebelCell): JobBoardEntry[] {
    if (!cell.exile) return [];
    const ctx = jobContext(world, cell, cell.exile.crew.filter(c => c.status === 'free'));
    return JOBS.map(def => {
        const why = jobBlocker(world, cell, def);
        return {
            id: def.id, title: def.title, pitch: fillTemplate(def.pitch, ctx), maxCrew: def.maxCrew, open: !why, why,
            targetKind: def.target ?? 'none', minRecon: def.minRecon ?? 0,
        };
    });
}

export function planView(world: GameWorldState, cell: RebelCell): JobPlanView | null {
    if (!cell.exile) return null;
    const targets: Record<string, { id: string; label: string }[]> = {};
    for (const def of JOBS) targets[def.id] = targetsFor(world, cell, def);
    return {
        plan: cell.plan ?? null,
        targets,
        gear: GEAR.map(g => {
            const { price, blackMarket } = gearPrice(world, cell, g.id);
            return { id: g.id, label: g.label, price, owned: !!cell.plan?.gear.includes(g.id), blackMarket };
        }),
        treasury: Math.round(cell.treasury ?? 0),
        dock: cell.exile.dock ?? [],
    };
}

export type { JobPlan };
