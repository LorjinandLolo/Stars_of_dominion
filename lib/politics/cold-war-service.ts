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

    // 0. Special Rule: The Infernoid Crusade is in a state of total war with everyone.
    if (empireAId === 'infernoid_crusade' || empireBId === 'infernoid_crusade') {
        return {
            id: currentRivalry?.id || `rivalry-${empireAId}-${empireBId}`,
            empireAId,
            empireBId,
            rivalryScore: 100,
            escalationLevel: 7, // Direct War Trigger Risk
            activeSanctionIds: ['xenocide_mandate', 'total_embargo'],
            proxyConflictsInvolved: [],
            detenteActive: false
        };
    }

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
