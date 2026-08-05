// lib/government/policy-service.ts
// Stars of Dominion — Government & Leadership, Phase 1 (political capital).
//
// SERVER/WORKER-SIDE (fs-backed policy registry). Owns the enact/repeal path:
// validation → political capital → active set → ideology shift → bloc reaction.
// Continuous policy effects are read back out through getPolicyModifiers.

import type { GameWorldState } from '@/lib/game-world-state';
import type { PolicyDefinition } from '@/lib/politics/registry-types';
import type { IdeologyAxis } from '@/lib/politics/ideology-types';
import { initRegistries, policyRegistry, governmentRegistry } from '@/lib/politics/registry';
import { applyIdeologyShift } from '@/lib/politics/ideology-service';
import { applyPolicyEffect } from '@/lib/politics/politics-service';
import { getGovernment, spendPoliticalCapital } from './government-service';
import { hasParliament, tableBill } from './parliament-service';

/**
 * Effect keys with a live consumer. Anything else in a policy's `effects` is
 * inert — keep this list and the consumers in step.
 *
 *  production       → getFactionEconomyMods().production   (economy tick)
 *  tax_income       → getFactionEconomyMods().tax
 *  upkeep           → getFactionEconomyMods().upkeep
 *  pop_growth       → getFactionEconomyMods().popGrowth
 *  approval         → flat approval shift          (tickGovernments)
 *  legitimacy_drift → legitimacy points per day    (tickGovernments)
 */
export const POLICY_EFFECT_KEYS = [
    'production',
    'tax_income',
    'upkeep',
    'pop_growth',
    'approval',
    'legitimacy_drift',
] as const;

export type PolicyEffectKey = typeof POLICY_EFFECT_KEYS[number];

export type PolicyRejection =
    | 'unknown_policy'
    | 'no_government'
    | 'already_active'
    | 'not_active'
    | 'restricted_by_government'
    | 'requires_government_tags'
    | 'insufficient_political_capital';

export interface PolicyActionResult {
    ok: boolean;
    reason?: PolicyRejection;
    /** Human-readable reason, suitable for recordOrderFailure. */
    message?: string;
    policyId: string;
    /** Political capital actually spent. */
    cost?: number;
    /**
     * True when the policy went to a chamber vote instead of taking effect
     * (Phase 4). The policy is NOT active yet — see gov.bills.
     */
    tabled?: boolean;
    billId?: string;
}

const DEFAULT_ENACT_COST = 20;

export function policyEnactCost(def: PolicyDefinition): number {
    return def.political_capital_cost ?? DEFAULT_ENACT_COST;
}

export function policyRepealCost(def: PolicyDefinition): number {
    return def.repeal_cost ?? Math.round(policyEnactCost(def) / 2);
}

/** Every policy the game knows about. Server-side only (reads data/policies). */
export function listPolicies(): PolicyDefinition[] {
    initRegistries();
    return policyRegistry.getAll();
}

/**
 * Why a faction can or cannot enact a policy right now — used by the UI to grey
 * out entries before the player spends an order on them.
 */
export function evaluatePolicy(
    world: GameWorldState,
    factionId: string,
    policyId: string
): PolicyActionResult {
    initRegistries();
    const def = policyRegistry.get(policyId);
    if (!def) return { ok: false, policyId, reason: 'unknown_policy', message: `Unknown policy "${policyId}".` };

    const gov = getGovernment(world, factionId);
    if (!gov) return { ok: false, policyId, reason: 'no_government', message: 'This faction has no government.' };

    if (gov.activePolicies.includes(policyId)) {
        return { ok: false, policyId, reason: 'already_active', message: `${label(def)} is already in force.` };
    }

    const profile = gov.governmentId ? governmentRegistry.get(gov.governmentId) : undefined;
    if (profile?.restricted_policies?.includes(policyId)) {
        return {
            ok: false,
            policyId,
            reason: 'restricted_by_government',
            message: `The ${gov.institutionName} cannot enact ${label(def)}.`,
        };
    }

    const govTags = gov.tags ?? [];
    if (def.forbidden_government_tags?.some(t => govTags.includes(t))) {
        return {
            ok: false,
            policyId,
            reason: 'restricted_by_government',
            message: `${label(def)} is incompatible with the ${gov.institutionName}.`,
        };
    }
    if (def.requires_government_tags?.length && !def.requires_government_tags.some(t => govTags.includes(t))) {
        return {
            ok: false,
            policyId,
            reason: 'requires_government_tags',
            message: `${label(def)} requires a different form of government.`,
        };
    }

    const cost = policyEnactCost(def);
    if (gov.politicalCapital < cost) {
        return {
            ok: false,
            policyId,
            reason: 'insufficient_political_capital',
            message: `Needs ${cost} political capital; the government has ${Math.floor(gov.politicalCapital)}.`,
            cost,
        };
    }

    return { ok: true, policyId, cost };
}

/**
 * Enact a policy: charge political capital, record it as active, shift the
 * empire's ideology, and let the interest groups react.
 */
export function enactPolicy(
    world: GameWorldState,
    factionId: string,
    policyId: string
): PolicyActionResult {
    const check = evaluatePolicy(world, factionId, policyId);
    if (!check.ok) return check;

    const def = policyRegistry.get(policyId)!;
    const gov = getGovernment(world, factionId)!;
    const cost = check.cost ?? policyEnactCost(def);

    if (!spendPoliticalCapital(world, factionId, cost, `enacted ${label(def)}`)) {
        return {
            ok: false,
            policyId,
            reason: 'insufficient_political_capital',
            message: `Needs ${cost} political capital; the government has ${Math.floor(gov.politicalCapital)}.`,
            cost,
        };
    }

    // Where the chamber has real power, the government proposes and the
    // legislature disposes — the capital is spent tabling it either way.
    if (hasParliament(gov)) {
        const tabled = tableBill(world, gov, policyId, label(def));
        if (!tabled.ok) {
            return { ok: false, policyId, reason: 'already_active', message: tabled.message, cost };
        }
        return { ok: true, policyId, cost, tabled: true, billId: tabled.billId };
    }

    gov.activePolicies.push(policyId);
    applyIdeologyShiftFor(world, factionId, def.ideology_shift);

    // Bloc reaction (support/oppose tags, flexibility, doctrine slowdown).
    try {
        applyPolicyEffect(factionId, policyId, world);
    } catch { /* posture absent on minimal worlds */ }

    return { ok: true, policyId, cost };
}

/** Repeal an active policy. Costs capital too — reversals are political acts. */
export function repealPolicy(
    world: GameWorldState,
    factionId: string,
    policyId: string
): PolicyActionResult {
    initRegistries();
    const def = policyRegistry.get(policyId);
    if (!def) return { ok: false, policyId, reason: 'unknown_policy', message: `Unknown policy "${policyId}".` };

    const gov = getGovernment(world, factionId);
    if (!gov) return { ok: false, policyId, reason: 'no_government', message: 'This faction has no government.' };

    const index = gov.activePolicies.indexOf(policyId);
    if (index === -1) {
        return { ok: false, policyId, reason: 'not_active', message: `${label(def)} is not in force.` };
    }

    const cost = policyRepealCost(def);
    if (!spendPoliticalCapital(world, factionId, cost, `repealed ${label(def)}`)) {
        return {
            ok: false,
            policyId,
            reason: 'insufficient_political_capital',
            message: `Repealing ${label(def)} needs ${cost} political capital; the government has ${Math.floor(gov.politicalCapital)}.`,
            cost,
        };
    }

    gov.activePolicies.splice(index, 1);

    // Undo half the ideological imprint — a repeal walks the empire back, but
    // the years under the policy still left a mark.
    if (def.ideology_shift) {
        const halved: Record<string, number> = {};
        for (const [axis, delta] of Object.entries(def.ideology_shift)) halved[axis] = -delta / 2;
        applyIdeologyShiftFor(world, factionId, halved);
    }

    return { ok: true, policyId, cost };
}

/**
 * Sum the continuous effects of a faction's active policies.
 * Values are additive deltas (0.12 = +12%), zero when no policy touches a key.
 */
export function getPolicyModifiers(world: GameWorldState, factionId: string): Record<PolicyEffectKey, number> {
    const totals = POLICY_EFFECT_KEYS.reduce((acc, key) => {
        acc[key] = 0;
        return acc;
    }, {} as Record<PolicyEffectKey, number>);

    const gov = getGovernment(world, factionId);
    if (!gov?.activePolicies?.length) return totals;

    initRegistries();
    for (const policyId of gov.activePolicies) {
        const def = policyRegistry.get(policyId);
        if (!def) continue;
        for (const key of POLICY_EFFECT_KEYS) {
            const value = def.effects?.[key];
            if (typeof value === 'number') totals[key] += value;
        }
    }

    return totals;
}

function applyIdeologyShiftFor(
    world: GameWorldState,
    factionId: string,
    shift: Record<string, number> | undefined
): void {
    if (!shift) return;
    const posture = world.movement.empirePostures.get(factionId);
    if (!posture?.ideology) return;
    for (const [axis, delta] of Object.entries(shift)) {
        if (!(axis in posture.ideology)) continue;
        applyIdeologyShift(posture.ideology, axis as IdeologyAxis, delta);
    }
}

function label(def: PolicyDefinition): string {
    return def.name ?? def.id;
}
