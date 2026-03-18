import { ColdWarCrisisTemplate, ActiveColdWarCrisis, RivalryState } from './cold-war-types';

/**
 * Rolls for and potentially triggers a Cold War Crisis based on the current
 * Escalation Level of a RivalryState and the available Crisis Templates.
 * 
 * Returns an active crisis instance if triggered, or null.
 */
export function evaluateCrisisTrigger(
    rivalry: RivalryState,
    availableTemplates: ColdWarCrisisTemplate[],
    currentTick: number
): ActiveColdWarCrisis | null {
    // Only attempt crises if we are at Escalation Level 2 or higher
    if (rivalry.escalationLevel < 2) return null;

    // The chance of a crisis triggering per evaluation scales dramatically with Escalation Level
    // Level 2 -> 5% chance
    // Level 5 -> 20% chance
    // Level 7 -> 50% chance
    const triggerChance = rivalry.escalationLevel * 0.025; // Base 2.5% per level
    const probabilityModifier = rivalry.escalationLevel >= 6 ? 2.0 : 1.0;

    if (Math.random() > (triggerChance * probabilityModifier)) {
        return null;
    }

    // Filter templates to those matching or under our current Escalation requirements
    const validTemplates = availableTemplates.filter(t => t.requiredEscalationIndex <= rivalry.escalationLevel);

    if (validTemplates.length === 0) return null;

    // Select a random valid crisis
    const randomIdx = Math.floor(Math.random() * validTemplates.length);
    const selectedTemplate = validTemplates[randomIdx];

    return {
        id: `crisis-${selectedTemplate.id}-${Math.floor(Date.now() / 1000)}`,
        templateId: selectedTemplate.id,
        primaryEmpireId: rivalry.empireAId,
        secondaryEmpireId: rivalry.empireBId,
        triggeredAtTick: currentTick,
        resolved: false
    };
}
