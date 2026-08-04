// ===== file: lib/press-system/investigations.ts =====
// Investigation track: Rumour → Inquiry → Evidence → Publication → Scandal.
// Spawned by information pressure, high-evidence stories, and active
// suppression (jams/quarantines breed whistleblowers). Advanced each press
// tick; publishing injects a story, a completed scandal burns trust and
// credibility. Government responses are applied worker-side via PRESS_INV_*
// orders (see scripts/game-loop.ts).

import {
    SimulationState,
    EmpireState,
    Investigation,
    InvestigationStage,
    Story,
    StorySource,
    StoryTruth,
} from './types';
import { RNG } from './utils';

const STAGE_ORDER: InvestigationStage[] = [
    InvestigationStage.RUMOUR,
    InvestigationStage.INQUIRY,
    InvestigationStage.EVIDENCE,
    InvestigationStage.PUBLICATION,
    InvestigationStage.SCANDAL,
];

export const InvestigationConfig = {
    /** Base per-tick spawn chance, scaled up by pressure/suppression. */
    baseSpawnChance: 0.01,
    pressureSpawnFactor: 0.0015,   // + per point of informationPressure
    suppressionSpawnBonus: 0.03,   // + when the empire is actively jamming/quarantining
    storyEvidenceThreshold: 60,    // active stories at/above this can seed a dig
    maxActivePerEmpire: 1,

    /** Progress per tick = base + mediaFreedom + evidence contributions. */
    baseRate: 4,
    mediaFreedomRateFactor: 0.08,  // free press digs faster
    evidenceRateFactor: 0.05,

    scandalTrustPenalty: -12,
    scandalCredibilityPenalty: -12,
    scandalPressureSpike: 30,
};

const clamp01 = (v: number) => Math.max(0, Math.min(100, v));

function pickInvestigator(empire: EmpireState): string {
    // A muzzled domestic press pushes the dig underground.
    return (empire.mediaFreedom ?? 50) < 40 ? 'free_signal' : 'galactic_wire';
}

/** Does this empire currently jam or quarantine anything it owns? */
function isSuppressing(state: SimulationState, empireId: string): boolean {
    for (const sysId of state.jammedSystems) {
        if (state.planets.get(`planet_${sysId}`)?.ownerId === empireId) return true;
    }
    for (const planetId of state.quarantinedPlanets) {
        if (state.planets.get(planetId)?.ownerId === empireId) return true;
    }
    return false;
}

const SUBJECTS = [
    'Missing Military Funds',
    'Secret Treaty Clauses',
    'Civilian Casualty Cover-Up',
    'Illegal Corporate Concessions',
    'Leadership Corruption Probe',
    'Hidden Resource Shortfalls',
];

/**
 * One tick of the investigation machine. Mutates nothing outside `state`
 * (same convention as the crisis/quarantine collections, which the worker
 * mutates in place between simulation ticks).
 */
export function tickInvestigations(state: SimulationState, tick: number, rng: RNG): void {
    // 1. Spawn
    for (const [empireId, empire] of state.empires.entries()) {
        const active = Array.from(state.investigations.values())
            .filter(i => !i.resolved && i.targetEmpireId === empireId);
        if (active.length >= InvestigationConfig.maxActivePerEmpire) continue;

        let chance = InvestigationConfig.baseSpawnChance
            + empire.informationPressure * InvestigationConfig.pressureSpawnFactor;
        if (isSuppressing(state, empireId)) chance += InvestigationConfig.suppressionSpawnBonus;

        // A well-documented story circulating about you invites deeper digging.
        const seedStory = Array.from(state.activeStories.values()).find(s =>
            s.targetEmpireId === empireId &&
            s.evidenceStrength >= InvestigationConfig.storyEvidenceThreshold);
        if (seedStory) chance += 0.02;

        if (!rng.check(chance)) continue;

        const id = `INV_${tick}_${empireId}`;
        state.investigations.set(id, {
            id,
            targetEmpireId: empireId,
            investigatorId: pickInvestigator(empire),
            subject: seedStory?.subject ?? SUBJECTS[rng.nextInt(0, SUBJECTS.length - 1)],
            storyId: seedStory?.id,
            stage: InvestigationStage.RUMOUR,
            progress: 0,
            evidence: seedStory ? Math.min(60, seedStory.evidenceStrength) : rng.nextInt(10, 30),
            startedTick: tick,
            updatedTick: tick,
            resolved: false,
        });
    }

    // 2. Advance
    for (const inv of state.investigations.values()) {
        if (inv.resolved) continue;
        const empire = state.empires.get(inv.targetEmpireId);
        if (!empire) { inv.resolved = true; inv.outcome = 'Target empire gone.'; continue; }

        const investigator = state.pressFactions.get(inv.investigatorId);
        const credFactor = (investigator?.credibility ?? 50) / 100; // shaky outlets dig slower
        const rate = (InvestigationConfig.baseRate
            + (empire.mediaFreedom ?? 50) * InvestigationConfig.mediaFreedomRateFactor
            + inv.evidence * InvestigationConfig.evidenceRateFactor) * (0.5 + credFactor / 2);

        inv.progress += rate;
        inv.updatedTick = tick;
        if (inv.progress < 100) continue;

        // Stage up
        const next = STAGE_ORDER[STAGE_ORDER.indexOf(inv.stage) + 1];
        inv.progress = 0;
        inv.evidence = clamp01(inv.evidence + rng.nextInt(5, 15));

        if (!next) { inv.resolved = true; continue; }
        inv.stage = next;

        if (next === InvestigationStage.PUBLICATION) {
            // The exposé hits the wires as a real story.
            const story: Story = {
                id: `EXPOSE_${inv.id}`,
                source: StorySource.ESPIONAGE_LEAK,
                truth: StoryTruth.TRUE,
                targetEmpireId: inv.targetEmpireId,
                subject: `Exposé: ${inv.subject}`,
                baseMagnitude: clamp01(40 + inv.evidence / 2),
                evidenceStrength: inv.evidence,
                tickCreated: tick,
            };
            state.activeStories.set(story.id, story);
            empire.informationPressure = clamp01(empire.informationPressure + 15);
        }

        if (next === InvestigationStage.SCANDAL) {
            empire.publicTrust = clamp01(empire.publicTrust + InvestigationConfig.scandalTrustPenalty);
            empire.credibility = clamp01((empire.credibility ?? 60) + InvestigationConfig.scandalCredibilityPenalty);
            empire.informationPressure = clamp01(empire.informationPressure + InvestigationConfig.scandalPressureSpike);
            inv.resolved = true;
            inv.outcome = `Scandal: ${inv.subject} confirmed.`;
        }
    }

    // 3. Prune long-resolved digs so the map doesn't grow unbounded.
    for (const [id, inv] of state.investigations.entries()) {
        if (inv.resolved && tick - inv.updatedTick > 50) state.investigations.delete(id);
    }
}

// ─── Government responses (called from the worker's PRESS_INV_* handlers) ────

export interface ResponseResult {
    ok: boolean;
    outcome: string;
}

export function respondCooperate(inv: Investigation, empire: EmpireState): ResponseResult {
    inv.resolved = true;
    inv.outcome = 'Government cooperated — story ran with context.';
    empire.publicTrust = clamp01(empire.publicTrust - 3);
    empire.credibility = clamp01((empire.credibility ?? 60) + 5);
    empire.informationPressure = clamp01(empire.informationPressure - 10);
    return { ok: true, outcome: inv.outcome };
}

export function respondObstruct(inv: Investigation, empire: EmpireState, rng: RNG): ResponseResult {
    empire.mediaFreedom = clamp01((empire.mediaFreedom ?? 50) - 3);
    inv.obstructions = (inv.obstructions ?? 0) + 1;
    // Obstruction is a coin you can only flip so often: the further along the
    // dig — and the more often you have already stonewalled — the likelier the
    // cover-up itself becomes the story. Without the repeat term, spamming this
    // order pinned any investigation at zero progress forever.
    const failChance = Math.min(0.95, 0.25 + inv.evidence / 200 + (inv.obstructions - 1) * 0.2);
    if (rng.check(failChance)) {
        inv.evidence = clamp01(inv.evidence + 20);
        inv.progress = Math.min(100, inv.progress + 10);
        return { ok: false, outcome: 'Obstruction leaked — the cover-up is now part of the story.' };
    }
    inv.progress = Math.max(0, inv.progress - 40);
    return { ok: true, outcome: 'Records sealed; the investigation stalls.' };
}

export function respondSacrificeOfficial(inv: Investigation, empire: EmpireState): ResponseResult {
    inv.resolved = true;
    inv.outcome = 'A senior official resigned; the story closes with them.';
    empire.publicTrust = clamp01(empire.publicTrust - 8);
    empire.informationPressure = clamp01(empire.informationPressure - 20);
    return { ok: true, outcome: inv.outcome };
}

export function respondPublishFirst(
    inv: Investigation,
    empire: EmpireState,
    state: SimulationState,
    tick: number
): ResponseResult {
    inv.resolved = true;
    inv.outcome = 'Government published first — controlled version leads.';
    empire.credibility = clamp01((empire.credibility ?? 60) + 8);
    empire.publicTrust = clamp01(empire.publicTrust - 5);
    const story: Story = {
        id: `PREEMPT_${inv.id}`,
        source: StorySource.ECONOMIC_DATA,
        truth: StoryTruth.TRUE,
        targetEmpireId: inv.targetEmpireId,
        subject: `Official Disclosure: ${inv.subject}`,
        baseMagnitude: clamp01(20 + inv.evidence / 4), // softer landing than an exposé
        evidenceStrength: Math.round(inv.evidence / 2),
        tickCreated: tick,
    };
    state.activeStories.set(story.id, story);
    return { ok: true, outcome: inv.outcome };
}
