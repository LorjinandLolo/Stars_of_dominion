// lib/government/government-service.ts
// Stars of Dominion — Government & Leadership, Phase 0 (foundation).
//
// WORKER-SIDE (uses the fs-backed government registry, same as posture-bootstrap).
// Seeds and ticks one GovernmentState per faction. This phase only derives and
// accrues; nothing spends political capital yet — GOV_* orders land in Phase 1.

import type { GameWorldState } from '@/lib/game-world-state';
import type { GovernmentState, CabinetPortfolio } from './types';
import { CABINET_PORTFOLIOS } from './types';
import { initRegistries, governmentRegistry } from '@/lib/politics/registry';
import { getPublicTrust, adjustPublicTrust, pushWorldStory } from '@/lib/press-system/integration';
import { RNG } from '@/lib/trade-system/rng';
import { seedFromString } from '@/lib/leadership/leader-generator';
import { getGovernmentModifiers } from './modifiers';
import { getHeadOfState } from './succession-service';
import { emptyLegacyState } from './legacy-service';

const MAX_HISTORY = 50;

/** Approval blend: how much the interest blocs vs. the press cycle decide it. */
const APPROVAL_BLOC_WEIGHT = 0.7;
const APPROVAL_TRUST_WEIGHT = 0.3;
/** How far the head of state's personal standing moves approval (±10 points). */
const LEADER_POPULARITY_WEIGHT = 0.2;

/** Political capital accrual, per in-game day, before modifiers. */
const PC_BASE_PER_DAY = 5;
const PC_MAX_PER_DAY = 15;

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

function emptyCabinet(): Record<CabinetPortfolio, string | null> {
    return CABINET_PORTFOLIOS.reduce((acc, p) => {
        acc[p] = null;
        return acc;
    }, {} as Record<CabinetPortfolio, string | null>);
}

/** Read a faction's government, or undefined if it has none (AI shells, pirates). */
export function getGovernment(world: GameWorldState, factionId: string): GovernmentState | undefined {
    return world.government?.get(factionId);
}

/**
 * Influence-weighted satisfaction of a faction's blocs, 0–100.
 * Returns 50 (neutral) when the faction has no posture yet.
 */
export function weightedBlocSatisfaction(world: GameWorldState, factionId: string): number {
    const posture = world.movement.empirePostures.get(factionId);
    const blocs = posture?.blocs ?? [];
    if (blocs.length === 0) return 50;

    const totalInfluence = blocs.reduce((s, b) => s + b.influence, 0);
    if (totalInfluence <= 0) return 50;

    return clamp100(blocs.reduce((s, b) => s + b.satisfaction * b.influence, 0) / totalInfluence);
}

/**
 * Recompute public approval from the blocs, the press cycle's public trust and
 * the standing of active policies. Pure derivation — safe to call as often as
 * the UI needs.
 */
export function recomputeApproval(world: GameWorldState, factionId: string): number {
    const blocSat = weightedBlocSatisfaction(world, factionId);
    const trust = getPublicTrust(world, factionId);
    const policyApproval = getGovernmentModifiers(world, factionId).approval;

    // A liked head of state carries an administration some way past its record;
    // a despised one drags it down. ±10 at the extremes.
    const leader = getHeadOfState(world, factionId);
    const leaderPull = leader ? ((leader.popularity ?? 50) - 50) * LEADER_POPULARITY_WEIGHT : 0;

    return clamp100(blocSat * APPROVAL_BLOC_WEIGHT + trust * APPROVAL_TRUST_WEIGHT + policyApproval + leaderPull);
}

function pushHistory(gov: GovernmentState, timestamp: number, event: string): void {
    gov.history.push({ timestamp, event });
    if (gov.history.length > MAX_HISTORY) gov.history.splice(0, gov.history.length - MAX_HISTORY);
}

/**
 * Seed a GovernmentState for every faction that lacks one, and backfill fields
 * added after a snapshot was written. Idempotent; call at world load, right
 * after ensureEmpirePostures (it reads the posture's governmentId).
 */
export function ensureGovernments(world: GameWorldState): void {
    initRegistries();
    if (!(world.government instanceof Map)) world.government = new Map();

    let seeded = 0;

    for (const factionId of world.economy.factions.keys()) {
        const posture = world.movement.empirePostures.get(factionId);
        const profile = posture?.governmentId ? governmentRegistry.get(posture.governmentId) : undefined;

        const existing = world.government.get(factionId);
        if (existing) {
            // Backfill for snapshots written by an older build.
            if (!existing.cabinet) existing.cabinet = emptyCabinet();
            if (!Array.isArray(existing.history)) existing.history = [];
            if (!Array.isArray(existing.tags)) existing.tags = profile?.tags ?? [];
            if (!Array.isArray(existing.activePolicies)) existing.activePolicies = [];
            if (!Array.isArray(existing.ambitions)) existing.ambitions = [];
            if (!Array.isArray(existing.cabinetAdvice)) existing.cabinetAdvice = [];
            if (!Array.isArray(existing.parties)) existing.parties = [];
            if (!Array.isArray(existing.bills)) existing.bills = [];
            if (typeof existing.coupPressure !== 'number') existing.coupPressure = 0;
            if (!existing.legacy) existing.legacy = emptyLegacyState();
            if (!Array.isArray(existing.legacy.chronicle)) existing.legacy.chronicle = [];
            if (typeof existing.politicalCapitalCap !== 'number') {
                existing.politicalCapitalCap = capacityFor(existing.executivePower ?? 50);
            }
            continue;
        }

        const base = profile?.base_values;
        const gov: GovernmentState = {
            factionId,
            governmentId: profile?.id ?? posture?.governmentId,
            institutionName: profile?.institution_name ?? 'Executive Council',
            tags: profile?.tags ?? posture?.government_tags ?? [],
            approval: recomputeApproval(world, factionId),
            legitimacy: base?.legitimacy ?? 60,
            politicalCapital: 0,
            politicalCapitalCap: capacityFor(base?.executive_power ?? 50),
            corruption: 0,
            activePolicies: [],
            senatePower: base?.senate_power ?? 30,
            executivePower: base?.executive_power ?? 50,
            stability: clamp100((world.shared?.stability ?? 1) * 100),
            warFatigue: clamp100(world.shared?.warFatigue ?? 0),
            headOfStateId: null,
            cabinet: emptyCabinet(),
            cabinetAdvice: [],
            parties: [],
            bills: [],
            coupPressure: 0,
            ambitions: [],
            legacy: emptyLegacyState(),
            lastTickSeconds: world.nowSeconds,
            history: [],
        };
        pushHistory(gov, world.nowSeconds, `Government seated: ${gov.institutionName}.`);
        world.government.set(factionId, gov);
        seeded++;
    }

    if (seeded > 0) {
        console.log(`[Government] Seeded ${seeded} government state(s).`);
    }
}

/** Political capital ceiling scales with how much power the executive holds. */
function capacityFor(executivePower: number): number {
    return 100 + Math.round(executivePower / 2);
}

/**
 * Advance every government by deltaSeconds: approval derivation, legitimacy
 * drift, political-capital accrual, shared-state mirrors.
 */
export function tickGovernments(world: GameWorldState, deltaSeconds: number): void {
    if (!(world.government instanceof Map)) return;
    const days = deltaSeconds / 86400;

    for (const gov of world.government.values()) {
        const previousApproval = gov.approval;
        gov.approval = recomputeApproval(world, gov.factionId);
        const policyMods = getGovernmentModifiers(world, gov.factionId);

        // Legitimacy follows approval slowly and asymmetrically: a government
        // bleeds the right to rule faster than it earns it back.
        if (gov.approval < 30) {
            gov.legitimacy = clamp100(gov.legitimacy - 4 * days);
        } else if (gov.approval > 60) {
            gov.legitimacy = clamp100(gov.legitimacy + 1.5 * days);
        }
        // Constitutional policies push legitimacy on their own account.
        if (policyMods.legitimacy_drift !== 0) {
            gov.legitimacy = clamp100(gov.legitimacy + policyMods.legitimacy_drift * days);
        }

        // Capital accrues on the strength of the mandate, not on time alone —
        // and on how well the head of state converts standing into leverage.
        const approvalFactor = gov.approval / 50;
        const legitimacyFactor = gov.legitimacy / 60;
        const leader = getHeadOfState(world, gov.factionId);
        const skillFactor = leader ? 0.6 + (leader.politicalSkill ?? 50) / 125 : 1;
        const perDay = Math.max(0, Math.min(PC_MAX_PER_DAY, PC_BASE_PER_DAY * approvalFactor * legitimacyFactor * skillFactor));
        gov.politicalCapitalCap = capacityFor(gov.executivePower);
        gov.politicalCapital = Math.max(0, Math.min(gov.politicalCapitalCap, gov.politicalCapital + perDay * days));

        // Mirrors — see the note on GovernmentState.stability.
        gov.stability = clamp100((world.shared?.stability ?? 1) * 100);
        gov.warFatigue = clamp100(world.shared?.warFatigue ?? 0);

        // The press cycle feeds approval (recomputeApproval reads publicTrust);
        // this is the return leg — a government the public backs earns the
        // benefit of the doubt in coverage, and a hated one stops getting it.
        // Rates are small so the two do not run away with each other.
        try {
            if (gov.approval > 70) adjustPublicTrust(world, gov.factionId, 0.5 * days);
            else if (gov.approval < 30) adjustPublicTrust(world, gov.factionId, -0.8 * days);

            // Deep corruption eventually surfaces as a scandal.
            if (gov.corruption > 60) {
                const rng = new RNG(seedFromString(`${gov.factionId}|scandal|${Math.floor(world.nowSeconds / 86400)}`));
                if (rng.check(0.12 * days)) {
                    adjustPublicTrust(world, gov.factionId, -4);
                    gov.legitimacy = clamp100(gov.legitimacy - 2);
                    pushWorldStory(world, {
                        targetEmpireId: gov.factionId,
                        subject: `Corruption scandal engulfs the ${gov.institutionName}`,
                        magnitude: Math.min(90, 40 + gov.corruption / 2),
                    });
                    gov.history.push({ timestamp: world.nowSeconds, event: 'A corruption scandal broke in the press.' });
                }
            }
        } catch { /* press state absent on minimal worlds */ }

        if (previousApproval >= 30 && gov.approval < 30) {
            pushHistory(gov, world.nowSeconds, `Approval collapsed to ${Math.round(gov.approval)}%.`);
        } else if (previousApproval < 60 && gov.approval >= 60) {
            pushHistory(gov, world.nowSeconds, `Approval recovered to ${Math.round(gov.approval)}%.`);
        }

        gov.lastTickSeconds = world.nowSeconds;
    }
}

/**
 * Spend political capital. Returns false and changes nothing when the
 * government cannot afford it — callers decide whether to block the order.
 */
export function spendPoliticalCapital(
    world: GameWorldState,
    factionId: string,
    amount: number,
    reason: string
): boolean {
    const gov = getGovernment(world, factionId);
    if (!gov) return true; // Factions without a government (AI shells) are never gated.
    if (amount <= 0) return true;
    if (gov.politicalCapital < amount) return false;

    gov.politicalCapital -= amount;
    pushHistory(gov, world.nowSeconds, `Spent ${Math.round(amount)} political capital: ${reason}.`);
    return true;
}

/** Grant political capital (mandates, completed ambitions, crises weathered). */
export function grantPoliticalCapital(
    world: GameWorldState,
    factionId: string,
    amount: number,
    reason: string
): void {
    const gov = getGovernment(world, factionId);
    if (!gov || amount <= 0) return;
    gov.politicalCapital = Math.min(gov.politicalCapitalCap, gov.politicalCapital + amount);
    pushHistory(gov, world.nowSeconds, `Gained ${Math.round(amount)} political capital: ${reason}.`);
}

/**
 * Per-faction stability 0–100. Reads the government mirror where one exists and
 * falls back to the galaxy-wide scalar, so callers never need to know which
 * pillar owns the number.
 */
export function getFactionStability(world: GameWorldState, factionId: string): number {
    const gov = getGovernment(world, factionId);
    if (gov) return gov.stability;
    return clamp100((world.shared?.stability ?? 1) * 100);
}

/** Per-faction war fatigue 0–100, with the same fallback as getFactionStability. */
export function getFactionWarFatigue(world: GameWorldState, factionId: string): number {
    const gov = getGovernment(world, factionId);
    if (gov) return gov.warFatigue;
    return clamp100(world.shared?.warFatigue ?? 0);
}
