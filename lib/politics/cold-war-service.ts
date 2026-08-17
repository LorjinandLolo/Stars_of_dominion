import { RivalryState, PropagandaCampaign, ProxyConflict } from './cold-war-types';
import { IdeologyProfile } from './ideology-types';
import { ideologyDistance } from './ideology-service';

/**
 * Context payload required to accurately calculate dynamic rivalry score.
 */
export interface RivalryContext {
    sharedBorders: boolean;
    activePropagandaCamps: PropagandaCampaign[];
    activeProxyConflicts: ProxyConflict[];
    recentCrisisTension: number; // Tapering value from 0-30 based on recent events
    /**
     * Flat friction added when one side is a pariah civilization — a people
     * everyone fears on sight, independent of ideology. Zero for every ordinary
     * pair, so the baseline for the rest of the galaxy is unchanged.
     */
    pariahBias?: number;
}

/**
 * Updates or initializes a RivalryState between two empires based on ideological
 * friction and active systemic conflicts.
 */
export function updateRivalryScore(
    currentRivalry: RivalryState | undefined,
    empireAId: string,
    empireBId: string,
    ideologyA: IdeologyProfile,
    ideologyB: IdeologyProfile,
    context: RivalryContext
): RivalryState {

    // The "Infernoid Crusade is at total war with everyone" rule that used to
    // live here has been REMOVED, not moved. It keyed on 'infernoid_crusade' —
    // a society id that appears in no FACTION_DATA entry — so it never once
    // fired, and its absence left the Infernoids with no rivalry record at all.
    // Every reader then fell through to its `?? 20` default, which made the
    // xenocidal fire-worshippers the friendliest empire in the galaxy: an AI
    // would accept a mutual-defence treaty from them at threshold 30.
    //
    // Pariah status now arrives as context.pariahBias below, which drifts
    // through the normal system instead of bypassing it. An absolute 100 /
    // level-7 would have put them in shooting war with thirteen empires from
    // world start, because isAtWar returns true at escalation >= 7 and
    // combat-manager starts engagements off exactly that.

    // 1. Base friction derived entirely from mathematical ideological distance
    // Max theoretical distance is 1400. We scale it so 400 distance = ~40 tension.
    const distance = ideologyDistance(ideologyA, ideologyB);
    let baseFriction = (distance / 1400) * 100 * 1.5; // Modifier to make clashes pop more

    // 2. Add contextual systemic modifiers
    if (context.sharedBorders) {
        baseFriction += 15; // Border tension
    }

    // 3. Propaganda Friction
    // Count campaigns aimed at each other
    const hostileCampaigns = context.activePropagandaCamps.filter(c =>
        (c.senderId === empireAId && c.targetSystemId.includes(empireBId)) ||
        (c.senderId === empireBId && c.targetSystemId.includes(empireAId))
    );
    baseFriction += hostileCampaigns.length * 10;

    // 4. Proxy War Friction
    const proxyClashes = context.activeProxyConflicts.filter(p =>
        (p.sponsorIds.includes(empireAId) && p.targetEmpireId === empireBId) ||
        (p.sponsorIds.includes(empireBId) && p.targetEmpireId === empireAId)
    );
    baseFriction += proxyClashes.length * 20;

    // 5. Recent Event Memory (Crises)
    baseFriction += context.recentCrisisTension;

    // 5b. Pariah standing — fear of what they are, not of what they have done.
    baseFriction += context.pariahBias ?? 0;

    // 6. Detente Suppression
    if (currentRivalry && currentRivalry.detenteActive) {
        baseFriction *= 0.5; // Drops friction significantly
    }

    // Lock between 0 and 100
    const finalScore = Math.max(0, Math.min(100, Math.round(baseFriction)));

    return {
        id: currentRivalry?.id || `rivalry-${empireAId}-${empireBId}`,
        empireAId,
        empireBId,
        rivalryScore: finalScore,
        escalationLevel: calculateEscalationLevel(finalScore),
        activeSanctionIds: currentRivalry?.activeSanctionIds || [],
        proxyConflictsInvolved: proxyClashes.map(p => p.id),
        detenteActive: currentRivalry?.detenteActive || false
    };
}

/**
 * Maps the 0-100 Rivalry Score into the 7-step escalation ladder
 * that drives AI behavioral logic and Event Triggers.
 */
export function calculateEscalationLevel(score: number): number {
    if (score <= 20) return 0; // Calm competition
    if (score <= 40) return 1; // Hostile Messaging / Strategic Rivalry
    if (score <= 55) return 2; // Sanctions & Propaganda active
    if (score <= 70) return 3; // Proxy Intervention permitted
    if (score <= 80) return 4; // Major Covert War
    if (score <= 90) return 5; // Sustained Cold War
    if (score <= 98) return 6; // Near-Hot War
    return 7;                  // Direct War Trigger Risk
}
