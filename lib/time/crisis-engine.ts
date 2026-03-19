// lib/time/crisis-engine.ts
// Stars of Dominion — Crisis Event Engine
// Creates, manages, expires, and resolves crisis events.

import { v4 as uuidv4 } from 'uuid';
import type { CrisisEvent, CrisisType, CrisisResponseOption, CrisisAutoResolvePolicy } from './time-types';
import {
    CRISIS_DURATION_HOURS, CRISIS_SEVERITY, CRISIS_RESPONSES,
    crisisDurationMultiplier
} from './time-config';
import { getCrisisExpiry, isExpired } from './time-helpers';
import { selectAutoResponse, calculateCrisisOutcome } from './auto-resolve';
import { fireNotification } from './notification-hooks';

// ─── In-Memory Crisis Store ───────────────────────────────────────────────────
// In production this mirrors Appwrite `crises` collection.

const _activeCrises = new Map<string, CrisisEvent>();

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateCrisisParams {
    attackerEmpireId: string;
    defenderEmpireId: string;
    targetId: string;
    targetType: CrisisEvent['targetType'];
    crisisType: CrisisType;
    attackerPrediction?: CrisisResponseOption;
    autoResolvePolicy?: CrisisAutoResolvePolicy;
    nowOverride?: Date;
}

/**
 * Create a new crisis event. Returns the created crisis.
 */
export function createCrisis(params: CreateCrisisParams): CrisisEvent {
    const now = params.nowOverride ?? new Date();
    const baseDuration = CRISIS_DURATION_HOURS[params.crisisType] ?? 12;
    const duration = baseDuration * crisisDurationMultiplier;

    const crisis: CrisisEvent = {
        id: `crisis-${uuidv4()}`,
        attackerEmpireId: params.attackerEmpireId,
        defenderEmpireId: params.defenderEmpireId,
        targetId: params.targetId,
        targetType: params.targetType,
        crisisType: params.crisisType,
        createdAt: now.toISOString(),
        expiresAt: getCrisisExpiry(duration, now),
        severity: CRISIS_SEVERITY[params.crisisType] ?? 'major',
        visibleToDefender: true,
        attackerPrediction: params.attackerPrediction,
        defenderResponse: null,
        autoResolvePolicy: params.autoResolvePolicy ?? 'use_doctrine',
        resolutionStatus: 'pending',
        availableResponses: CRISIS_RESPONSES[params.crisisType] ?? ['fortify', 'negotiate', 'sacrifice'],
    };

    _activeCrises.set(crisis.id, crisis);

    // Notify all parties
    fireNotification({
        id: `crisis-created-${crisis.id}`,
        factionId: params.defenderEmpireId,
        category: 'crisis',
        priority: 'urgent',
        title: `Crisis: ${formatCrisisType(params.crisisType)}`,
        body: `${params.attackerEmpireId} has initiated a ${crisis.severity} crisis against you. Respond before ${new Date(crisis.expiresAt).toUTCString()}.`,
        createdAt: now.toISOString(),
        read: false,
        linkToTab: 'war',
        payload: { crisisId: crisis.id },
    });

    return crisis;
}

// ─── Respond ─────────────────────────────────────────────────────────────────

/**
 * Record the defender's chosen response. Triggers immediate resolution.
 */
export function respondToCrisis(
    crisisId: string,
    response: CrisisResponseOption,
    respondingFactionId: string
): { success: boolean; crisis?: CrisisEvent; error?: string } {
    const crisis = _activeCrises.get(crisisId);
    if (!crisis) return { success: false, error: 'Crisis not found.' };
    if (crisis.defenderEmpireId !== respondingFactionId) {
        return { success: false, error: 'Only the defender can respond to this crisis.' };
    }
    if (crisis.resolutionStatus !== 'pending') {
        return { success: false, error: 'Crisis is no longer pending.' };
    }
    if (isExpired(new Date(), crisis.expiresAt)) {
        return { success: false, error: 'Crisis timer has expired.' };
    }

    crisis.defenderResponse = response;
    crisis.resolutionStatus = 'defender_responded';

    resolveCrisis(crisisId, response);
    return { success: true, crisis };
}

// ─── Expire ───────────────────────────────────────────────────────────────────

/**
 * Called by tick-processor to expire all crises past their deadline.
 */
export async function expireAllStaleCrises(now: Date): Promise<void> {
    for (const crisis of _activeCrises.values()) {
        if (crisis.resolutionStatus !== 'pending') continue;
        if (!isExpired(now, crisis.expiresAt)) continue;

        // Auto-resolve with offline defender logic
        const autoResponse = selectAutoResponse(crisis);
        crisis.defenderResponse = autoResponse;
        crisis.resolutionStatus = 'auto_resolved';
        resolveCrisis(crisis.id, autoResponse, true);
    }
}

// ─── Resolve ─────────────────────────────────────────────────────────────────

/**
 * Apply crisis outcome. Called after defender responds or on auto-resolve.
 */
function resolveCrisis(
    crisisId: string,
    defenderResponse: CrisisResponseOption,
    isAutoResolved = false
): void {
    const crisis = _activeCrises.get(crisisId);
    if (!crisis) return;

    const outcome = calculateCrisisOutcome(crisis, defenderResponse);
    crisis.outcomeText = outcome.outcomeText;
    crisis.predictionMatched = outcome.predictionMatched;
    crisis.resolutionStatus = isAutoResolved ? 'auto_resolved' : 'resolved';

    fireNotification({
        id: `crisis-resolved-${crisisId}-${Date.now()}`,
        factionId: crisis.attackerEmpireId,
        category: 'crisis',
        priority: 'normal',
        title: isAutoResolved ? 'Crisis Auto-Resolved' : 'Crisis Resolved',
        body: outcome.outcomeText,
        createdAt: new Date().toISOString(),
        read: false,
        linkToTab: 'war',
        payload: {
            crisisId,
            predictionMatched: outcome.predictionMatched,
            defenderResponse,
            attackerEffectMultiplier: outcome.attackerEffectMultiplier,
        },
    });

    fireNotification({
        id: `crisis-resolved-def-${crisisId}-${Date.now()}`,
        factionId: crisis.defenderEmpireId,
        category: 'crisis',
        priority: 'normal',
        title: isAutoResolved ? 'Crisis Auto-Resolved' : 'Crisis Response Applied',
        body: outcome.outcomeText,
        createdAt: new Date().toISOString(),
        read: false,
        linkToTab: 'war',
        payload: { crisisId, defenderResponse },
    });
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function getCrisis(id: string): CrisisEvent | undefined {
    return _activeCrises.get(id);
}

export function getActiveCrisesForFaction(factionId: string): CrisisEvent[] {
    return [..._activeCrises.values()].filter(
        c => (c.defenderEmpireId === factionId || c.attackerEmpireId === factionId) &&
             c.resolutionStatus === 'pending'
    );
}

export function getAllActiveCrises(): CrisisEvent[] {
    return [..._activeCrises.values()].filter(c => c.resolutionStatus === 'pending');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCrisisType(type: CrisisType): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
