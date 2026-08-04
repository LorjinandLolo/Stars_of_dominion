// ===== file: lib/press-system/crisis.ts =====
import {
    MediaCrisis,
    EmpireState,
    PublishedStory,
    Story,
    CrisisChoice,
    CrisisReaction,
    SimulationState
} from './types';
import { PressConfig } from './config';
import { RNG } from './utils';

const REACTION_COST = 3;           // narrative influence per foreign stance
const REACTION_SEVERITY_DELTA = 10;
const REACTION_PRESSURE_DELTA = 5;
const PREDICTION_CREDIBILITY_HIT = -8;  // extra damage when a rival called the response
const PREDICTION_INFLUENCE_REWARD = 5;

/**
 * Checks for new crises based on accumulated pressure and active stories.
 */
export function checkCrises(
    tick: number,
    empires: Map<string, EmpireState>,
    activeStories: PublishedStory[], // Stories currently circulating
    storyDetails: Map<string, Story>,
    rng: RNG
): MediaCrisis[] {
    const newCrises: MediaCrisis[] = [];

    for (const [empId, empire] of empires.entries()) {
        // Threshold Check
        if (empire.informationPressure > PressConfig.thresholds.crisisTriggerPressure) {
            // Check if already in crisis to avoid spam?
            if (empire.activeCrises.size > 0) continue;

            // Find a trigger story (highest viral factor targeting this empire)
            const triggers = activeStories.filter(p => {
                const s = storyDetails.get(p.storyId);
                return s && s.targetEmpireId === empId;
            });

            if (triggers.length > 0) {
                // Pick highest impact
                triggers.sort((a, b) => b.viralFactor - a.viralFactor);
                const trigger = triggers[0];

                newCrises.push({
                    id: `CRISIS_${tick}_${empId}`,
                    storyId: trigger.storyId,
                    targetEmpireId: empId,
                    deadlineTick: tick + 24, // 24 hour deadline
                    severity: empire.informationPressure,
                    resolved: false
                });
            }
        }
    }

    return newCrises;
}

const clamp01 = (v: number) => Math.max(0, Math.min(100, v));

/** Phase 2: a foreign faction publicly amplifies or defends. One stance per faction per crisis. */
export function reactToCrisis(
    crisis: MediaCrisis,
    actorId: string,
    actor: EmpireState,
    target: EmpireState,
    reaction: CrisisReaction
): { ok: boolean; outcome: string } {
    if (!crisis.reactions) crisis.reactions = {};
    if (crisis.reactions[actorId]) {
        return { ok: false, outcome: 'Stance already taken on this crisis.' };
    }
    if (reaction !== 'NEUTRAL') {
        if ((actor.narrativeInfluence ?? 0) < REACTION_COST) {
            return { ok: false, outcome: `Requires ${REACTION_COST} narrative influence.` };
        }
        actor.narrativeInfluence = clamp01(actor.narrativeInfluence - REACTION_COST);
    }
    crisis.reactions[actorId] = reaction;
    if (reaction === 'AMPLIFY') {
        crisis.severity = clamp01(crisis.severity + REACTION_SEVERITY_DELTA);
        target.informationPressure = clamp01(target.informationPressure + REACTION_PRESSURE_DELTA);
        return { ok: true, outcome: 'Your networks amplify the story.' };
    }
    if (reaction === 'DEFEND') {
        crisis.severity = clamp01(crisis.severity - REACTION_SEVERITY_DELTA);
        target.informationPressure = clamp01(target.informationPressure - REACTION_PRESSURE_DELTA);
        return { ok: true, outcome: 'Your networks defend the government line.' };
    }
    return { ok: true, outcome: 'You stay out of it.' };
}

/** Phase 3: score hidden predictions once the government commits. Returns faction ids that called it. */
export function applyPredictionPayouts(
    crisis: MediaCrisis,
    chosen: CrisisChoice,
    empires: Map<string, EmpireState>
): string[] {
    const winners: string[] = [];
    if (!crisis.predictions) return winners;
    const target = empires.get(crisis.targetEmpireId);
    for (const [factionId, predicted] of Object.entries(crisis.predictions)) {
        if (predicted !== chosen) continue;
        winners.push(factionId);
        // "We knew you'd deny it" — the pre-positioned reveal lands harder.
        if (target) target.credibility = clamp01((target.credibility ?? 60) + PREDICTION_CREDIBILITY_HIT);
        const predictor = empires.get(factionId);
        if (predictor) predictor.narrativeInfluence = clamp01((predictor.narrativeInfluence ?? 0) + PREDICTION_INFLUENCE_REWARD);
    }
    return winners;
}

/** Unanswered crises past deadline resolve as IGNORE — silence is read as confession. */
export function expireCrises(state: SimulationState, tick: number): void {
    for (const crisis of state.crises.values()) {
        if (crisis.resolved || tick <= crisis.deadlineTick) continue;
        const empire = state.empires.get(crisis.targetEmpireId);
        if (empire) {
            const result = resolveCrisis(crisis, CrisisChoice.IGNORE, empire);
            Object.assign(empire, result.empireDelta);
            applyPredictionPayouts(crisis, CrisisChoice.IGNORE, state.empires);
        }
        crisis.resolved = true;
        crisis.choiceMade = CrisisChoice.IGNORE;
        crisis.outcome = 'Deadline passed — official silence read as confession.';
    }
}

/**
 * Resolves a crisis based on player choice.
 * `story` is the triggering story; DENY outcomes hinge on its evidenceStrength.
 */
export function resolveCrisis(
    crisis: MediaCrisis,
    choice: CrisisChoice,
    empire: EmpireState,
    story?: Story
): { empireDelta: Partial<EmpireState>, outcome: string } {
    const effects = PressConfig.effects[choice];

    const credibility = empire.credibility ?? 60;
    const mediaFreedom = empire.mediaFreedom ?? 50;

    const newTrust = clamp01(empire.publicTrust + effects.trustCost);
    const newPressure = clamp01(empire.informationPressure + effects.pressureReduction);

    if (choice === CrisisChoice.SUPPRESS && empire.publicTrust < 30) {
        // Backlash!
        return {
            empireDelta: {
                publicTrust: Math.max(0, newTrust - 20), // Double penalty
                informationPressure: 100, // Explodes
                credibility: clamp01(credibility + PressConfig.credibility.suppressFailPenalty),
                mediaFreedom: clamp01(mediaFreedom + PressConfig.credibility.suppressMediaFreedomCost)
            },
            outcome: "Suppression Failed! Public Outrage!"
        };
    }

    if (choice === CrisisChoice.DENY) {
        const evidence = story?.evidenceStrength ?? 50;
        const denial = PressConfig.denial;
        if (evidence >= denial.exposureEvidenceThreshold) {
            // The receipts exist. Denial collapses on contact.
            return {
                empireDelta: {
                    publicTrust: clamp01(empire.publicTrust + denial.exposedTrustPenalty),
                    informationPressure: clamp01(empire.informationPressure + denial.exposedPressureSpike),
                    credibility: clamp01(credibility + denial.exposedCredibilityPenalty)
                },
                outcome: "Denial Exposed! Documents contradict the official line."
            };
        }
        return {
            empireDelta: {
                publicTrust: newTrust,
                informationPressure: newPressure,
                credibility: clamp01(credibility + denial.heldCredibilityBonus)
            },
            outcome: "Denial Holds — story dismissed as unsubstantiated."
        };
    }

    const delta: Partial<EmpireState> = {
        publicTrust: newTrust,
        informationPressure: newPressure
    };
    let outcome = "Crisis Resolved";

    switch (choice) {
        case CrisisChoice.ADMIT_REFORM:
            delta.credibility = clamp01(credibility + PressConfig.credibility.admitReformBonus);
            break;
        case CrisisChoice.SUPPRESS:
            delta.mediaFreedom = clamp01(mediaFreedom + PressConfig.credibility.suppressMediaFreedomCost);
            break;
        case CrisisChoice.JAM_SIGNAL:
            delta.mediaFreedom = clamp01(mediaFreedom + PressConfig.credibility.jamMediaFreedomCost);
            break;
        case CrisisChoice.DISTRACT:
            // Pressure relief only — the story stays in circulation and can re-trigger.
            outcome = "News Cycle Flooded — the story slips off the front page, for now.";
            break;
    }

    return { empireDelta: delta, outcome };
}
