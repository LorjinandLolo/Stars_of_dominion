import { RivalryState } from './cold-war-types';

export interface DetenteContext {
    empireAExhaustion: number; // 0-100 economic/military strain
    empireBExhaustion: number; // 0-100
    sharedThreatLevel: number; // 0-100 (e.g. mutual crisis or third-party invader)
    recentBlocCollaborations: number;
}

/**
 * Evaluates whether two mutually hostile empires will agree to formally suppress
 * their Rivalry Score, pulling themselves back from the brink of Direct War.
 * Returns true if both sides agree to Détente.
 */
export function evaluateDetenteAcceptance(
    rivalry: RivalryState,
    context: DetenteContext
): boolean {
    // Both sides must hit an internal threshold to accept cooling off
    // If one side feels they have total advantage, they will refuse detente.
    // If exhaustion is high, they are desperate for peace.

    // Shared threats artificially raise the willingness to compromise dramatically
    const aWillingness = context.empireAExhaustion + (context.sharedThreatLevel * 1.5) + (context.recentBlocCollaborations * 10);
    const bWillingness = context.empireBExhaustion + (context.sharedThreatLevel * 1.5) + (context.recentBlocCollaborations * 10);

    // If escalation is at max (7), the required willingness to step back is huge.
    // Base threshold to accept peace at Escalation 5 is around 60.
    const requiredWillingness = 20 + (rivalry.escalationLevel * 10);

    return (aWillingness >= requiredWillingness) && (bWillingness >= requiredWillingness);
}

/**
 * Checks if the Cold War tension has officially shattered into a catastrophic
 * pan-galactic Hot War. Used by the event bus to transition out of the cold-war
 * state and into the standard military-combat system.
 */
export function checkTotalWarTrigger(
    rivalry: RivalryState,
    baseVolatility: number // 0-100 environmental panic
): boolean {
    // Cannot start a direct hot war unless tensions are red-lining
    if (rivalry.escalationLevel < 7) return false;

    // Even at level 7, war requires a spark. 
    // Volatility > 80 almost guarantees war. Volatility < 20 might hold the peace.
    const breakingPoint = 95 - baseVolatility;

    // If rivalry score pushes past the breaking point, the Cold War goes Hot.
    return rivalry.rivalryScore >= breakingPoint;
}
