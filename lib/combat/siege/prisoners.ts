// lib/combat/siege/prisoners.ts
//
// Prisoners of war. Soldiers who break rather than die end up in the winner's
// hands, and what he does with them is a political decision, not a bookkeeping
// one: ransom them back for credits, work them, turn them, cage them, or shoot
// them. Every path buys something and costs something else.

import type { GroundUnitType, UnitComposition } from './siege-types';

export type PrisonerDisposition =
    | 'ransom'      // sold back to their empire for credits
    | 'labour'      // put to work — metals, at a humanitarian price
    | 'recruit'     // turned into your own militia
    | 'imprison'    // held as leverage, fed at your expense
    | 'execute';    // killed

export interface PrisonerGroup {
    id: string;
    /** The empire these soldiers belong to. */
    ownerEmpireId: string;
    /** The empire currently holding them. */
    captorEmpireId: string;
    planetId: string;
    planetName: string;
    unitType: GroundUnitType;
    count: number;
    capturedAtSeconds: number;
    /** Set once a disposition has been carried out. */
    resolved?: PrisonerDisposition;
}

export interface PrisonerLedger {
    groups: PrisonerGroup[];
}

/** Fraction of a defeated force that surrenders instead of dying, per unit type. */
const CAPTURE_RATE: Record<GroundUnitType, number> = {
    MILITIA: 0.45,      // conscripts give up readily
    INFANTRY: 0.3,
    ARTILLERY: 0.3,     // crews overrun at their guns
    ANTI_ARMOR: 0.25,
    AIRBORNE: 0.2,
    ARMOR: 0.15,        // crews burn with their vehicles
    SPECIAL_OPS: 0.08,  // they do not surrender
};

/**
 * How many of this cycle's casualties are taken alive. Broken morale means
 * more surrenders; a force fighting with its back to the wall yields fewer.
 */
export function capturedFromLosses(
    losses: Partial<UnitComposition>,
    moralePercent: number,
): Partial<UnitComposition> {
    // 100 morale → ×0.6 of the base rate; 0 morale → ×1.6.
    const moraleFactor = 1.6 - Math.max(0, Math.min(100, moralePercent)) / 100;
    const out: Partial<UnitComposition> = {};
    for (const [type, lost] of Object.entries(losses) as Array<[GroundUnitType, number]>) {
        if (!lost || lost <= 0) continue;
        const taken = Math.floor(lost * CAPTURE_RATE[type] * moraleFactor);
        if (taken > 0) out[type] = taken;
    }
    return out;
}

export interface DispositionOutcome {
    /** Resources the captor gains (positive) or spends (negative). */
    credits?: number;
    metals?: number;
    /** Militia added to the captor's garrison on that planet. */
    recruits?: number;
    /** Stability change on the holding planet. */
    stability?: number;
    /** Unrest change on the holding planet. */
    unrest?: number;
    /**
     * Diplomatic damage toward the prisoners' empire — fed to shiftRivalry.
     * Positive = relations worsen.
     */
    rivalry?: number;
    /** Empire-wide reputation hit (atrocities are remembered by everyone). */
    infamy?: number;
    /** Human-readable summary for the log and the press. */
    summary: string;
}

const RANSOM_PER_HEAD = 45;
const LABOUR_METALS_PER_HEAD = 8;

/**
 * Resolves a disposition. Pure — the caller applies the numbers to world state.
 */
export function resolveDisposition(
    group: PrisonerGroup,
    disposition: PrisonerDisposition,
): DispositionOutcome {
    const n = group.count;
    switch (disposition) {
        case 'ransom':
            return {
                credits: n * RANSOM_PER_HEAD,
                rivalry: -6,   // returning prisoners cools a war slightly
                summary: `${n} prisoners ransomed back for ${n * RANSOM_PER_HEAD} credits.`,
            };
        case 'labour':
            return {
                metals: n * LABOUR_METALS_PER_HEAD,
                unrest: 6,
                rivalry: 10,
                infamy: 4,
                summary: `${n} prisoners put to forced labour — ${n * LABOUR_METALS_PER_HEAD} metals, and the news travels.`,
            };
        case 'recruit':
            // Only a fraction can be turned; the rest are useless to you.
            return {
                recruits: Math.floor(n * 0.4),
                unrest: 3,
                rivalry: 12,
                infamy: 3,
                summary: `${Math.floor(n * 0.4)} of ${n} prisoners took the oath; the rest were interned.`,
            };
        case 'imprison':
            return {
                credits: -Math.ceil(n * 6),  // upkeep
                rivalry: 2,
                summary: `${n} prisoners held pending negotiation.`,
            };
        case 'execute':
            return {
                stability: 4,     // terror cows the occupied population, briefly
                unrest: 14,       // and then it doesn't
                rivalry: 35,
                infamy: 20,
                summary: `${n} prisoners executed. The galaxy will hear of it.`,
            };
    }
}

export function ensureLedger(container: any): PrisonerLedger {
    if (!container.prisoners || !Array.isArray(container.prisoners.groups)) {
        container.prisoners = { groups: [] } as PrisonerLedger;
    }
    return container.prisoners as PrisonerLedger;
}

/** Live (unresolved) prisoner groups held by a faction. */
export function heldBy(ledger: PrisonerLedger, captorEmpireId: string): PrisonerGroup[] {
    return ledger.groups.filter(g => !g.resolved && g.captorEmpireId === captorEmpireId);
}

/** Total unresolved head count held by a faction. */
export function totalHeld(ledger: PrisonerLedger, captorEmpireId: string): number {
    return heldBy(ledger, captorEmpireId).reduce((s, g) => s + g.count, 0);
}
