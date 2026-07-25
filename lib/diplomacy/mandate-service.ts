// lib/diplomacy/mandate-service.ts
// Stars of Dominion — Diplomacy Phase 3: support consequences + mandates.
//
// WORKER-SIDE ONLY. When a diplomatic order executes, this evaluates how the
// initiator's population reads the move (lib/politics/support-service.ts) and
// applies the political fallout:
//   - Unpopular actions are never blocked (§5: you can force policy through),
//     but opposing blocs sour, stability slips, and wars add exhaustion.
//   - Actions launched with ≥80% support grant a timed Mandate (§8) with an
//     immediate political dividend.

import type { GameWorldState } from '@/lib/game-world-state';
import { recomputeBlocSatisfaction, clampShared } from '@/lib/game-world-state';
import {
    computeActionSupport,
    DiplomaticActionKind,
    ActionSupportResult,
} from '@/lib/politics/support-service';
import { DiplomaticMandate, MandateKind, MANDATE_DURATION_SECONDS } from './diplomacy-types';
import { ensureDiplomacyState } from './offer-service';

const MANDATE_KIND_BY_ACTION: Record<DiplomaticActionKind, MandateKind> = {
    declare_war: 'war',
    offer_peace: 'peace',
    trade_pact: 'trade',
    treaty: 'trade',
    tribute_demand: 'coercion',
    ultimatum: 'coercion',
    accusation: 'coercion',
    show_of_force: 'coercion',
    break_treaty: 'coercion',
};

const MANDATE_LABELS: Record<MandateKind, string> = {
    war: 'War Mandate',
    peace: 'Peace Mandate',
    trade: 'Prosperity Mandate',
    coercion: 'Iron Mandate',
};

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

/**
 * Evaluate public support for a faction's diplomatic action and apply the
 * political consequences. Returns the support result (also used for logging).
 */
export function evaluateSupportAndApply(
    world: GameWorldState,
    factionId: string,
    kind: DiplomaticActionKind,
    targetFactionId?: string
): ActionSupportResult | null {
    const posture = world.movement.empirePostures.get(factionId);
    if (!posture?.blocs?.length) return null; // AI shells without politics: no meter

    const rivalry = targetFactionId
        ? (world.rivalries.get(`rivalry-${factionId}-${targetFactionId}`)
            ?? world.rivalries.get(`rivalry-${targetFactionId}-${factionId}`))
        : undefined;

    const result = computeActionSupport(posture.blocs, kind, {
        warFatigue: world.shared.warFatigue,
        rivalryScore: rivalry?.rivalryScore ?? 20,
    });

    if (result.band === 'unpopular' || result.band === 'opposition') {
        const hit = result.band === 'opposition' ? -6 : -4;
        for (const blocResult of result.blocs) {
            if (blocResult.stance >= 0) continue;
            const bloc = posture.blocs.find(b => b.id === blocResult.id);
            if (bloc) bloc.satisfaction = clamp100(bloc.satisfaction + hit);
        }
        world.shared.stability = clampShared(world.shared.stability + (result.band === 'opposition' ? -0.02 : -0.01));
        if (kind === 'declare_war') {
            world.shared.warFatigue = clamp100(world.shared.warFatigue + 5);
        }
        console.log(`[Politics] ${factionId} forced through ${kind} at ${result.total}% support (${result.band}) — blocs protest`);
    } else if (result.band === 'mandate') {
        grantMandate(world, factionId, kind, result.total);
        for (const blocResult of result.blocs) {
            if (blocResult.stance <= 0) continue;
            const bloc = posture.blocs.find(b => b.id === blocResult.id);
            if (bloc) bloc.satisfaction = clamp100(bloc.satisfaction + 3);
        }
    }

    recomputeBlocSatisfaction(world);
    return result;
}

function grantMandate(world: GameWorldState, factionId: string, action: DiplomaticActionKind, support: number): void {
    const dip = ensureDiplomacyState(world);
    const kind = MANDATE_KIND_BY_ACTION[action];
    const posture = world.movement.empirePostures.get(factionId);

    const mandate: DiplomaticMandate = {
        factionId,
        kind,
        label: MANDATE_LABELS[kind],
        supportAtGrant: support,
        grantedAtSeconds: world.nowSeconds,
        expiresAtSeconds: world.nowSeconds + MANDATE_DURATION_SECONDS,
    };
    dip.mandates.set(factionId, mandate); // newest wins

    // Immediate political dividend per §8.
    const boost = (blocId: string, amt: number) => {
        const bloc = posture?.blocs?.find(b => b.id === blocId);
        if (bloc) bloc.satisfaction = clamp100(bloc.satisfaction + amt);
    };
    switch (kind) {
        case 'war':
            world.shared.warFatigue = clamp100(world.shared.warFatigue - 10);
            boost('military', 6);
            break;
        case 'peace':
            world.shared.stability = clampShared(world.shared.stability + 0.03);
            posture?.blocs?.forEach(b => { b.satisfaction = clamp100(b.satisfaction + 4); });
            break;
        case 'trade':
            boost('trade', 6);
            break;
        case 'coercion':
            boost('military', 4);
            break;
    }
    console.log(`[Politics] ${factionId} earned ${mandate.label} at ${support}% support`);
}

/** Expire lapsed mandates. Called from the strategic tick. */
export function tickMandates(world: GameWorldState): void {
    const dip = ensureDiplomacyState(world);
    for (const [factionId, mandate] of [...dip.mandates.entries()]) {
        if (world.nowSeconds >= mandate.expiresAtSeconds) dip.mandates.delete(factionId);
    }
}
