import { Crisis, CrisisType, ResourceId } from '@/types';

// Mock DB
const activeCrises: Crisis[] = [];

export function triggerCrisis(targetFactionId: string, type: CrisisType, initiatorFactionId?: string): Crisis {
    const crisis: Crisis = {
        id: `cr-${Date.now()}`,
        type,
        target_faction_id: targetFactionId,
        initiator_faction_id: initiatorFactionId,
        severity: 'major',
        deadline: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
        description: `A ${type} has been initiated against you!`,
        consequences: [
            { resource: 'happiness' as ResourceId, amount: -20 },
            { resource: 'credits' as ResourceId, amount: -1000 }
        ],
        resolution_cost: [
            { resource: 'credits' as ResourceId, amount: 500 },
            { resource: 'intel' as any, amount: 50 } // cast for now
        ]
    };

    activeCrises.push(crisis);
    console.log(`[CRISIS] Triggered ${type} against ${targetFactionId} (Severity: ${crisis.severity})`);
    return crisis;
}

export function resolveCrisis(crisisId: string, success: boolean): void {
    const idx = activeCrises.findIndex(c => c.id === crisisId);
    if (idx === -1) return;

    if (success) {
        console.log(`[CRISIS] Crisis ${crisisId} AVERTED.`);
    } else {
        console.log(`[CRISIS] Crisis ${crisisId} FAILED. Consequences applied.`);
        // Logic to apply consequences would go here (e.g., deduct happiness)
    }

    activeCrises.splice(idx, 1);
}

export function getActiveCrises(factionId: string): Crisis[] {
    return activeCrises.filter(c => c.target_faction_id === factionId);
}
