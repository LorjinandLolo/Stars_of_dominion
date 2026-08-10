// lib/tech/emergent-service.ts
// Stars of Dominion — evaluation of conduct-driven technology.
//
// Runs once per strategic tick from step4b_emergentTech, immediately after
// research resolves so a tech completed this tick can satisfy a prerequisite.
//
// Two jobs:
//   1. refreshLedgerGauges — recompute the values that are cheaper to derive
//      from world state than to maintain at every event source.
//   2. evaluateEmergentTriggers — walk the catalog per faction and reveal (or,
//      for dedicated emg_ techs, grant) what a faction's history has earned.
//
// Deterministic: no randomness anywhere in this path, so a replayed world
// reaches the same reveals on the same ticks.

import { registry, applyUnlock } from './engine';
import { getLedger, getMetric, setGauge, updateStreak } from './history-ledger';
import {
    EMERGENT_TRIGGERS,
    REVEAL_DISCOUNT,
    DEEP_DISCOUNT,
    type EmergentTrigger,
} from './emergent-catalog';
import type { PlayerTechState } from './types';

export interface EmergentReveal {
    factionId: string;
    triggerId: string;
    techId: string;
    techName: string;
    narrative: string;
    /** Research cost multiplier awarded. */
    discount: number;
    /** True when the tech was granted outright rather than merely revealed. */
    granted: boolean;
}

// ─── Gauges ──────────────────────────────────────────────────────────────────

/**
 * Recompute derived metrics for every faction with a tech state.
 *
 * Every read is defensive: this runs inside the tick and a minimal or partially
 * deserialized world must never take the whole step down.
 */
export function refreshLedgerGauges(world: any): void {
    const factionIds = new Set<string>([
        ...(world.tech?.keys?.() ?? []),
        ...(world.economy?.factions?.keys?.() ?? []),
    ]);

    // Route and partner counts, attributed through the owning agreement.
    const routesByFaction = new Map<string, number>();
    const partnersByFaction = new Map<string, Set<string>>();
    try {
        const agreements = world.economy?.tradeAgreements;
        for (const route of world.economy?.tradeRoutes?.values?.() ?? []) {
            const agreement = agreements?.get?.(route.agreementId);
            if (!agreement) continue;
            for (const [side, other] of [
                [agreement.aFactionId, agreement.bFactionId],
                [agreement.bFactionId, agreement.aFactionId],
            ] as const) {
                if (!side) continue;
                routesByFaction.set(side, (routesByFaction.get(side) ?? 0) + 1);
                if (other) {
                    const set = partnersByFaction.get(side) ?? new Set<string>();
                    set.add(other);
                    partnersByFaction.set(side, set);
                }
            }
        }
    } catch { /* trade state absent on minimal worlds */ }

    // Factions currently under sanction by anyone.
    const sanctioned = new Set<string>();
    try {
        for (const record of world.diplomacy?.sanctions?.values?.() ?? []) {
            if (record?.targetId) sanctioned.add(record.targetId);
        }
    } catch { /* diplomacy state absent */ }

    for (const factionId of factionIds) {
        if (!factionId) continue;

        setGauge(world, factionId, 'trade.activeRoutes', routesByFaction.get(factionId) ?? 0);
        setGauge(world, factionId, 'trade.partnerCount', partnersByFaction.get(factionId)?.size ?? 0);

        let charters = 0;
        try {
            charters = world.corporate?.factionStates?.get?.(factionId)?.charteredCompanyIds?.length ?? 0;
        } catch { /* corporate state absent */ }
        setGauge(world, factionId, 'corp.activeCharters', charters);

        updateStreak(world, factionId, 'eco.sanctionedTicksStreak', sanctioned.has(factionId));
    }
}

// ─── Triggers ────────────────────────────────────────────────────────────────

/** A dedicated emergent tech may be granted outright; catalog techs never are. */
function isDedicatedEmergent(trigger: EmergentTrigger): boolean {
    return trigger.autoGrantable === true || trigger.techId.startsWith('emg_');
}

function conditionsHold(world: any, factionId: string, trigger: EmergentTrigger, multiple: number): boolean {
    return trigger.all.every(cond => {
        const value = getMetric(world, factionId, cond.metric);
        if (cond.gte !== undefined && value < cond.gte * multiple) return false;
        // An upper bound is a qualifier, not a threshold — it does not scale.
        if (cond.lte !== undefined && value > cond.lte) return false;
        return true;
    });
}

function recordReveal(state: PlayerTechState, trigger: EmergentTrigger, discount: number): void {
    const techId = trigger.techId;
    if (!state.revealedEmergentTechIds) state.revealedEmergentTechIds = [];
    if (!state.emergentDiscounts) state.emergentDiscounts = {};
    if (!state.revealedEmergentTechIds.includes(techId)) {
        state.revealedEmergentTechIds.push(techId);
    }
    // Deepening a discount is allowed; never let it get worse.
    const existing = state.emergentDiscounts[techId];
    state.emergentDiscounts[techId] = existing === undefined ? discount : Math.min(existing, discount);

    // Record which prerequisites conduct stands in for, so the engine can skip
    // them without importing this catalog (which would close an import cycle).
    if (trigger.waivePrerequisites) {
        const tech = registry.get(techId);
        const waived = trigger.waivePrerequisites === true
            ? [...(tech?.prerequisites ?? [])]
            : trigger.waivePrerequisites;
        if (waived.length > 0) {
            if (!state.emergentWaivedPrereqs) state.emergentWaivedPrereqs = {};
            const merged = new Set([...(state.emergentWaivedPrereqs[techId] ?? []), ...waived]);
            state.emergentWaivedPrereqs[techId] = [...merged];
        }
    }
}

/**
 * Walk the catalog for every faction holding a tech state.
 * Returns the reveals that fired this tick, for notification by the caller.
 */
export function evaluateEmergentTriggers(world: any): EmergentReveal[] {
    const reveals: EmergentReveal[] = [];
    if (!world.tech) return reveals;

    for (const [factionId, state] of world.tech as Map<string, PlayerTechState>) {
        if (!state) continue;
        const ledger = getLedger(world, factionId);

        for (const trigger of EMERGENT_TRIGGERS) {
            const tech = registry.get(trigger.techId);
            if (!tech) continue; // validated separately; never crash the tick

            const already = ledger.firedTriggerIds.includes(trigger.id);
            const deepMultiple = trigger.grantAtMultiple ?? 2;
            const atDeepThreshold = conditionsHold(world, factionId, trigger, deepMultiple);

            // Nothing to do until the base threshold is met.
            if (!already && !conditionsHold(world, factionId, trigger, 1)) continue;

            // Already researched, or locked out by a mutually exclusive choice:
            // a reveal would be meaningless. Suppress rather than mislead.
            if (state.unlockedTechIds?.includes(trigger.techId)) continue;
            if (state.lockedTechIds?.includes(trigger.techId)) continue;

            const dedicated = isDedicatedEmergent(trigger);

            if (atDeepThreshold && dedicated) {
                // Conduct has fully substituted for theory.
                if (!already) ledger.firedTriggerIds.push(trigger.id);
                applyUnlock(state, trigger.techId);
                reveals.push({
                    factionId, triggerId: trigger.id, techId: trigger.techId,
                    techName: tech.name, narrative: trigger.narrative,
                    discount: 0, granted: true,
                });
                continue;
            }

            const discount = atDeepThreshold ? DEEP_DISCOUNT : REVEAL_DISCOUNT;
            const priorDiscount = state.emergentDiscounts?.[trigger.techId];

            // Fire once on reveal, and once more if the discount deepens.
            const isNew = !already;
            const deepened = priorDiscount !== undefined && discount < priorDiscount;
            if (!isNew && !deepened) continue;

            if (isNew) ledger.firedTriggerIds.push(trigger.id);
            recordReveal(state, trigger, discount);
            reveals.push({
                factionId, triggerId: trigger.id, techId: trigger.techId,
                techName: tech.name, narrative: trigger.narrative,
                discount, granted: false,
            });
        }
    }

    return reveals;
}
