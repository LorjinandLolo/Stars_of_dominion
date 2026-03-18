import { PropagandaCampaign } from './cold-war-types';
import { IdeologyProfile } from './ideology-types';

export function createPropagandaCampaign(
    senderId: string,
    targetSystemId: string,
    tags: string[],
    intensity: number,
    baseDurationTicks: number,
    isCovert: boolean
): PropagandaCampaign {
    return {
        id: `prop-${senderId}-${targetSystemId}-${Math.floor(Date.now() / 1000)}`,
        senderId,
        targetSystemId,
        tags,
        intensity,
        baseDurationTicks,
        ticksRemaining: baseDurationTicks,
        isCovert
    };
}

/**
 * Returns the exact numeric shifts in local ideology axes and systemic unrest
 * that should be applied to a target system per tick while the campaign is active.
 * The intensity (1-10) scales the magnitude of the impact.
 */
export function evaluatePropagandaImpact(
    campaign: PropagandaCampaign,
    currentIdeology: IdeologyProfile
): {
    unrestDelta: number;
    ideologyShift: Partial<Record<keyof IdeologyProfile, number>>;
} {
    let unrestDelta = 0;
    const ideologyShift: Partial<Record<keyof IdeologyProfile, number>> = {};

    // Base unrest generation: active external propaganda always causes some friction
    unrestDelta += (campaign.intensity * 0.5);

    for (const tag of campaign.tags) {
        switch (tag) {
            case 'liberation_broadcast':
                ideologyShift.authoritarianism_liberty = (ideologyShift.authoritarianism_liberty || 0) + (campaign.intensity * 0.1);
                ideologyShift.order_chaos = (ideologyShift.order_chaos || 0) + (campaign.intensity * 0.05);
                // Heavy unrest if targeting an authoritarian society
                if (currentIdeology.authoritarianism_liberty > 20) {
                    unrestDelta += (campaign.intensity * 1.5);
                }
                break;

            case 'anti_corporate':
                ideologyShift.collectivism_individualism = (ideologyShift.collectivism_individualism || 0) + (campaign.intensity * 0.1);
                // Unrest spikes where corporate/individualist power is entrenched
                if (currentIdeology.collectivism_individualism < -20) {
                    unrestDelta += (campaign.intensity * 1.0);
                }
                break;

            case 'fear_campaign':
                ideologyShift.militarism_pacifism = (ideologyShift.militarism_pacifism || 0) + (campaign.intensity * 0.2);
                ideologyShift.authoritarianism_liberty = (ideologyShift.authoritarianism_liberty || 0) + (campaign.intensity * 0.1);
                unrestDelta += (campaign.intensity * 2.0); // Fear induces panic
                break;

            case 'scientific_utopian':
                ideologyShift.tradition_progress = (ideologyShift.tradition_progress || 0) - (campaign.intensity * 0.15); // Negative is progress
                if (currentIdeology.tradition_progress > 30) {
                    unrestDelta += (campaign.intensity * 0.5); // Traditionalists slightly upset
                }
                break;

            case 'nationalist_mythmaking':
                ideologyShift.expansionism_isolationism = (ideologyShift.expansionism_isolationism || 0) + (campaign.intensity * 0.1);
                ideologyShift.order_chaos = (ideologyShift.order_chaos || 0) + (campaign.intensity * 0.1);
                // Calms unrest by promoting internal unity against the outside
                unrestDelta -= (campaign.intensity * 0.5);
                break;
        }
    }

    return { unrestDelta, ideologyShift };
}
