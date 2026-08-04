// ===== file: lib/press-system/campaigns.ts =====
// Foreign information campaigns: press-vs-press. An attacker spends narrative
// influence to run a covert campaign draining a rival's media values; the
// target sees a signal story once exposure crosses the threshold, and can
// counter-message, trace the origin, or publicly accuse a suspect.
// Worker-side orders (PRESS_LAUNCH/COUNTER/TRACE/ACCUSE_CAMPAIGN) call the
// helpers below; per-tick drift runs inside tickPressSystem.

import {
    SimulationState,
    EmpireState,
    MediaCampaign,
    CampaignObjective,
    Story,
    StorySource,
    StoryTruth,
} from './types';
import { RNG } from './utils';

export const CampaignConfig = {
    launchCost: 15,           // narrative influence, up front
    upkeepPerTick: 0.5,       // narrative influence drained from the attacker
    counterCost: 5,           // narrative influence for one counter-message
    traceCost: 3,             // narrative influence per trace attempt — free retries would
                              // let a target re-roll the RNG until it always succeeded
    signalExposureThreshold: 30,
    accuseExposureThreshold: 30,

    strengthSpinUp: 5,        // per tick, to 100
    counterStrengthHit: -25,
    counterExposureBump: 10,  // counter-messaging drags the campaign into the light
    traceFailExposureBump: 5,

    maxEffectPerTick: 1.0,    // media-value drain at full strength

    accuseStickCredibilityHit: -15,  // attacker, when the accusation lands
    accuseBackfireCredibilityHit: -8, // accuser, when it doesn't
    predictionTargetCredibilityHit: -8,
    predictionRewardInfluence: 5,
};

const clamp01 = (v: number) => Math.max(0, Math.min(100, v));

/** Per-tick campaign drift: drain the target, spin up, leak exposure, bill the attacker. */
export function tickCampaigns(state: SimulationState, tick: number, rng: RNG): void {
    for (const camp of state.campaigns.values()) {
        if (!camp.active) continue;
        const attacker = state.empires.get(camp.attackerId);
        const target = state.empires.get(camp.targetEmpireId);
        if (!attacker || !target) {
            camp.active = false;
            camp.outcome = 'Participant empire gone.';
            continue;
        }

        // Upkeep — a broke attacker's network goes dark.
        attacker.narrativeInfluence = clamp01((attacker.narrativeInfluence ?? 0) - CampaignConfig.upkeepPerTick);
        if (attacker.narrativeInfluence <= 0) {
            camp.active = false;
            camp.outcome = 'Funding dried up — the network went silent.';
            continue;
        }

        camp.strength = clamp01(camp.strength + CampaignConfig.strengthSpinUp);
        const effect = CampaignConfig.maxEffectPerTick * (0.2 + (camp.strength / 100) * 0.8);

        switch (camp.objective) {
            case CampaignObjective.UNDERMINE_TRUST:
                target.publicTrust = clamp01(target.publicTrust - effect);
                break;
            case CampaignObjective.DAMAGE_CREDIBILITY:
                target.credibility = clamp01((target.credibility ?? 60) - effect);
                break;
            case CampaignObjective.STOKE_UNREST:
                target.informationPressure = clamp01(target.informationPressure + effect * 2);
                break;
        }

        // Running loud gets you noticed.
        camp.exposure = clamp01(camp.exposure + rng.nextInt(1, 4) + camp.strength / 50);

        if (!camp.signaled && camp.exposure >= CampaignConfig.signalExposureThreshold) {
            camp.signaled = true;
            const story: Story = {
                id: `SIGNAL_${camp.id}`,
                source: StorySource.RUMOR_MILL,
                truth: StoryTruth.UNKNOWN,
                targetEmpireId: camp.targetEmpireId,
                subject: 'Foreign-Origin Narratives Spreading Through Local Networks',
                baseMagnitude: 30,
                evidenceStrength: Math.round(camp.exposure),
                tickCreated: tick,
            };
            state.activeStories.set(story.id, story);
        }
    }

    // Prune dead campaigns after a grace window so outcomes stay readable.
    for (const [id, camp] of state.campaigns.entries()) {
        if (!camp.active && tick - camp.tickStarted > 200) state.campaigns.delete(id);
    }
}

export interface CampaignActionResult {
    ok: boolean;
    outcome: string;
}

/** Target counter-messaging: blunts the campaign, drags it further into the open. */
export function counterCampaign(camp: MediaCampaign, target: EmpireState): CampaignActionResult {
    if ((target.narrativeInfluence ?? 0) < CampaignConfig.counterCost) {
        return { ok: false, outcome: `Requires ${CampaignConfig.counterCost} narrative influence.` };
    }
    target.narrativeInfluence = clamp01(target.narrativeInfluence - CampaignConfig.counterCost);
    camp.strength = clamp01(camp.strength + CampaignConfig.counterStrengthHit);
    camp.exposure = clamp01(camp.exposure + CampaignConfig.counterExposureBump);
    if (camp.strength <= 0) {
        camp.active = false;
        camp.outcome = 'Counter-messaging drowned the campaign out.';
        return { ok: true, outcome: camp.outcome };
    }
    return { ok: true, outcome: 'Counter-narratives deployed; the campaign loses ground.' };
}

/** Trace attempt: success odds scale with exposure. Costs influence, so retries aren't free re-rolls. */
export function traceCampaign(
    camp: MediaCampaign,
    targetId: string,
    rng: RNG,
    tracer?: EmpireState
): CampaignActionResult {
    if (camp.discoveredBy) {
        return { ok: true, outcome: 'Origin already traced.' };
    }
    if (tracer) {
        if ((tracer.narrativeInfluence ?? 0) < CampaignConfig.traceCost) {
            return { ok: false, outcome: `Requires ${CampaignConfig.traceCost} narrative influence.` };
        }
        tracer.narrativeInfluence = clamp01(tracer.narrativeInfluence - CampaignConfig.traceCost);
    }
    if (rng.check(camp.exposure / 100)) {
        camp.discoveredBy = targetId;
        return { ok: true, outcome: 'Signal triangulated — origin network identified.' };
    }
    camp.exposure = clamp01(camp.exposure + CampaignConfig.traceFailExposureBump);
    return { ok: false, outcome: 'Trace inconclusive; the trail stays warm.' };
}

/**
 * Public accusation. Sticks when the suspect is right and the campaign is
 * exposed enough (or already traced); otherwise the accusation reads as
 * paranoia and burns the accuser.
 */
export function accuseCampaign(
    camp: MediaCampaign,
    accuser: EmpireState,
    suspectId: string,
    suspect: EmpireState | undefined
): CampaignActionResult {
    // A burned network can't be accused twice — otherwise the same landed
    // accusation could be replayed to drain a rival's credibility to zero.
    if (!camp.active) {
        return { ok: false, outcome: 'That campaign is already closed.' };
    }
    const provable = camp.discoveredBy === accuser.id
        || camp.exposure >= CampaignConfig.accuseExposureThreshold;
    if (suspectId === camp.attackerId && provable && suspect) {
        suspect.credibility = clamp01((suspect.credibility ?? 60) + CampaignConfig.accuseStickCredibilityHit);
        camp.active = false;
        camp.outcome = `Publicly attributed to ${suspectId} — network burned.`;
        return { ok: true, outcome: camp.outcome };
    }
    accuser.credibility = clamp01((accuser.credibility ?? 60) + CampaignConfig.accuseBackfireCredibilityHit);
    return { ok: false, outcome: 'Accusation failed to stick — it reads as paranoia.' };
}
