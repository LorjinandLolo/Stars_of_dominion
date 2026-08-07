/**
 * lib/economy/corporate/corporate-events.ts
 * Corporate crises and megaprojects.
 *
 * Crises are not random noise: which one fires is a function of how the company
 * has actually been run. A corrupt company generates scandals; an over-extended
 * one generates debt crises; a company with foreign money on the register
 * generates takeover fights. Megaprojects are the opposite direction of travel
 * — the company asking the state to help it build something permanent.
 */

import type { GameWorldState } from '../../game-world-state';
import type { CharteredCompany } from './company-types';
import type { CorporateWorldState } from './company-registry';
import type {
    CorporateCrisis,
    CorporateCrisisType,
    MegaprojectProposal,
} from './charter-types';
import { CRISIS_DEFS, MEGAPROJECT_DEFS } from './charter-catalog';
import {
    computeInfluence,
    computeStanding,
    maxFleetSize,
    ownershipPercent,
    pushCompanyEvent,
    seededRandom,
    weightedPick,
} from './charter-service';

// ─── Configuration ───────────────────────────────────────────────────────────

export const CRISIS_INTERVAL_SECONDS = 5 * 86_400;
export const CRISIS_WINDOW_SECONDS = 3 * 86_400;
export const PROPOSAL_INTERVAL_SECONDS = 8 * 86_400;
export const PROPOSAL_WINDOW_SECONDS = 4 * 86_400;

// ─── Crises ──────────────────────────────────────────────────────────────────

/**
 * Weight each crisis by the company's actual condition, so the crisis that
 * fires reads as a consequence rather than a dice roll.
 */
function crisisWeights(company: CharteredCompany): Partial<Record<CorporateCrisisType, number>> {
    const weights: Partial<Record<CorporateCrisisType, number>> = {};
    const assets = (company.assets ?? []).length;
    const corruption = company.corruptionIndex ?? 0;
    const autonomy = company.autonomyLevel ?? 0;
    const foreignStake = ownershipPercent(company, 'class:foreign_investors');
    const publicStake = ownershipPercent(company, 'class:public_shares');
    const netWorth = company.treasury + (company.assets ?? []).reduce((s, a) => s + a.value, 0);
    const upkeep = (company.assets ?? []).reduce((s, a) => s + a.upkeepPerTick, 0);

    for (const def of CRISIS_DEFS) {
        let w = def.baseWeight;
        switch (def.type) {
            case 'mining_disaster':
                w *= company.mission === 'mining' || company.mission === 'extraction' ? 2.5 : 0.4;
                w *= 1 + assets * 0.05;
                break;
            case 'worker_strike':
                w *= 1 + corruption / 60;
                w *= company.corporateColonies.length > 0 ? 1.6 : 0.8;
                break;
            case 'corruption_scandal':
                w *= corruption / 25;
                break;
            case 'accounting_fraud':
                w *= corruption / 35 + (publicStake > 10 ? 0.8 : 0.2);
                break;
            case 'executive_assassination':
                w *= 1 + autonomy / 80;
                break;
            case 'debt_crisis':
                w *= company.treasury < upkeep * 8 ? 3 : 0.3;
                w *= 1 + (company.debt ?? 0) / 40_000;
                break;
            case 'shareholder_revolt':
                w *= 100 - ownershipPercent(company, company.foundingFactionId) > 45 ? 2 : 0.4;
                break;
            case 'hostile_takeover_bid':
                w *= netWorth > 120_000 ? 1.6 : 0.5;
                break;
            case 'corporate_civil_war':
                w *= autonomy > 60 && assets > 6 ? 2.2 : 0.1;
                break;
            case 'foreign_acquisition':
                w *= foreignStake > 5 ? 2 : 0.3;
                break;
            case 'bankruptcy':
                w *= company.treasury <= 0 ? 8 : 0.05;
                break;
        }
        if (w > 0) weights[def.type] = w;
    }
    return weights;
}

/** Roll for a crisis. Returns the crisis if one opened. */
export function maybeSpawnCrisis(
    company: CharteredCompany,
    corpState: CorporateWorldState,
    nowSeconds: number
): CorporateCrisis | null {
    if (nowSeconds - (company.lastCrisisAt ?? 0) < CRISIS_INTERVAL_SECONDS) return null;

    // One live crisis per company. Two at once reads as a bug, not a story.
    for (const crisis of corpState.crises.values()) {
        if (crisis.companyId === company.id && crisis.status === 'pending') return null;
    }

    const roll = seededRandom(`${company.id}:crisis:${Math.floor(nowSeconds / CRISIS_INTERVAL_SECONDS)}`);
    company.lastCrisisAt = nowSeconds;

    // Big, badly-run companies generate incidents; small clean ones rarely do.
    const size = (company.assets ?? []).length + company.corporateColonies.length * 2;
    const chance = Math.min(0.7, 0.08 + size * 0.02 + (company.corruptionIndex ?? 0) / 250);
    if (roll() > chance) return null;

    const type = weightedPick(crisisWeights(company), roll());
    if (!type) return null;
    const def = CRISIS_DEFS.find(d => d.type === type);
    if (!def) return null;

    const crisis: CorporateCrisis = {
        id: `ccri-${company.id}-${nowSeconds}`,
        companyId: company.id,
        factionId: company.foundingFactionId,
        type: def.type,
        headline: def.headline,
        description: def.description,
        issuedAt: nowSeconds,
        expiresAt: nowSeconds + CRISIS_WINDOW_SECONDS,
        options: def.options,
        status: 'pending',
    };
    corpState.crises.set(crisis.id, crisis);
    pushCompanyEvent(corpState.eventLog, company, 'crisis_opened', {
        crisisId: crisis.id, type: def.type, headline: def.headline,
    }, nowSeconds);
    return crisis;
}

/** The government picks an option. Costs are charged before effects land. */
export function resolveCorporateCrisis(
    corpState: CorporateWorldState,
    crisisId: string,
    optionId: string,
    world: GameWorldState,
    nowSeconds: number
): { ok: true } | { ok: false; error: string } {
    const crisis = corpState.crises.get(crisisId);
    if (!crisis) return { ok: false, error: 'That crisis is no longer live.' };
    if (crisis.status !== 'pending') return { ok: false, error: 'That crisis has already been settled.' };
    const company = corpState.companies.get(crisis.companyId);
    if (!company) return { ok: false, error: 'The company no longer exists.' };
    const option = crisis.options.find(o => o.id === optionId);
    if (!option) return { ok: false, error: 'Unknown response.' };

    const reserves = world.economy.factions.get(crisis.factionId)?.reserves as Record<string, number> | undefined;
    const gov = world.government?.get?.(crisis.factionId);

    if (option.creditCost && (reserves?.['CREDITS'] ?? 0) < option.creditCost) {
        return { ok: false, error: `That response costs ${option.creditCost.toLocaleString()} credits.` };
    }
    if (option.politicalCapitalCost && (gov?.politicalCapital ?? 0) < option.politicalCapitalCost) {
        return { ok: false, error: `That response costs ${option.politicalCapitalCost} political capital.` };
    }
    if (option.creditCost && reserves) reserves['CREDITS'] -= option.creditCost;
    if (option.politicalCapitalCost && gov) gov.politicalCapital -= option.politicalCapitalCost;

    const e = option.effects;
    if (e.treasury) company.treasury += e.treasury;
    if (e.autonomy) company.autonomyLevel = Math.max(0, Math.min(100, company.autonomyLevel + e.autonomy));
    if (e.corruption) company.corruptionIndex = Math.max(0, Math.min(100, company.corruptionIndex + e.corruption));
    if (e.loyalty) company.loyalty = Math.max(0, Math.min(100, (company.loyalty ?? 50) + e.loyalty));
    if (e.influence) company.influence = Math.max(0, Math.min(100, (company.influence ?? 0) + e.influence));
    if (e.fleet) company.privateFleetSize = Math.max(0, Math.min(maxFleetSize(company), company.privateFleetSize + e.fleet));
    if (e.sharePriceMultiplier) {
        company.sharePricePrev = company.sharePrice;
        company.sharePrice = Math.max(0.01, company.sharePrice * e.sharePriceMultiplier);
    }
    if (e.approval && gov) gov.approval = Math.max(0, Math.min(100, gov.approval + e.approval));

    crisis.status = 'resolved';
    crisis.resolvedOptionId = optionId;
    company.influence = computeInfluence(company);
    company.standing = computeStanding(company);

    pushCompanyEvent(corpState.eventLog, company, 'crisis_resolved', {
        crisisId, type: crisis.type, optionId, label: option.label,
    }, nowSeconds);
    return { ok: true };
}

/**
 * An unanswered crisis resolves itself, badly. Doing nothing is a choice and it
 * costs the same as the worst option — the company handles it its own way.
 */
export function lapseCrises(corpState: CorporateWorldState, world: GameWorldState, nowSeconds: number): void {
    for (const crisis of corpState.crises.values()) {
        if (crisis.status !== 'pending' || nowSeconds < crisis.expiresAt) continue;
        crisis.status = 'lapsed';
        const company = corpState.companies.get(crisis.companyId);
        if (!company) continue;

        company.autonomyLevel = Math.min(100, company.autonomyLevel + 4);
        company.loyalty = Math.max(0, (company.loyalty ?? 50) - 6);
        company.corruptionIndex = Math.min(100, company.corruptionIndex + 4);
        company.sharePricePrev = company.sharePrice;
        company.sharePrice = Math.max(0.01, company.sharePrice * 0.9);
        const gov = world.government?.get?.(crisis.factionId);
        if (gov) gov.approval = Math.max(0, gov.approval - 2);
    }
    const settled = [...corpState.crises.values()]
        .filter(c => c.status !== 'pending')
        .sort((a, b) => a.issuedAt - b.issuedAt);
    while (settled.length > 30) {
        const oldest = settled.shift();
        if (oldest) corpState.crises.delete(oldest.id);
    }
}

// ─── Megaprojects ────────────────────────────────────────────────────────────

/**
 * A large, confident company proposes something permanent and asks the state to
 * underwrite part of it. Approving builds galactic infrastructure on somebody
 * else's balance sheet; refusing repeatedly is one of the things that turns a
 * partner into a rival.
 */
export function maybeProposeMegaproject(
    company: CharteredCompany,
    corpState: CorporateWorldState,
    nowSeconds: number
): MegaprojectProposal | null {
    if (company.nationalized || company.charterRevocationPending) return null;
    if (nowSeconds - (company.lastProposalAt ?? 0) < PROPOSAL_INTERVAL_SECONDS) return null;

    for (const proposal of corpState.megaprojects.values()) {
        if (proposal.companyId !== company.id) continue;
        if (proposal.status === 'proposed' || proposal.status === 'building' || proposal.status === 'approved') return null;
    }

    const influence = company.influence ?? 0;
    const built = new Set(
        [...corpState.megaprojects.values()]
            .filter(p => p.companyId === company.id && p.status === 'complete')
            .map(p => p.defId)
    );
    const eligible = MEGAPROJECT_DEFS.filter(def =>
        influence >= def.minInfluence &&
        !built.has(def.id) &&
        (def.missions.length === 0 || def.missions.includes(company.mission ?? 'trade')) &&
        // It must be able to fund its own share.
        company.treasury >= def.totalCost * (1 - def.stateShare) * 0.6
    );
    company.lastProposalAt = nowSeconds;
    if (eligible.length === 0) return null;

    const roll = seededRandom(`${company.id}:megaproject:${Math.floor(nowSeconds / PROPOSAL_INTERVAL_SECONDS)}`);
    if (roll() > 0.55) return null;
    const def = eligible[Math.floor(roll() * eligible.length)];

    const proposal: MegaprojectProposal = {
        id: `cmeg-${company.id}-${nowSeconds}`,
        defId: def.id,
        companyId: company.id,
        factionId: company.foundingFactionId,
        name: def.name,
        description: def.description,
        totalCost: def.totalCost,
        stateShare: def.stateShare,
        durationSeconds: def.durationDays * 86_400,
        proposedAt: nowSeconds,
        expiresAt: nowSeconds + PROPOSAL_WINDOW_SECONDS,
        status: 'proposed',
        progress: 0,
        benefit: def.benefit,
    };
    corpState.megaprojects.set(proposal.id, proposal);
    pushCompanyEvent(corpState.eventLog, company, 'megaproject_proposed', {
        proposalId: proposal.id, defId: def.id, name: def.name, totalCost: def.totalCost,
    }, nowSeconds);
    return proposal;
}

export type ProposalResponse = 'approve' | 'delay' | 'modify' | 'reject';

/**
 * The government answers a proposal.
 *
 * `approve` — the state pays its share now and construction starts.
 * `modify`  — the state halves its contribution; the company builds it slower
 *             and resents the haggling.
 * `delay`   — the decision is postponed; the window reopens.
 * `reject`  — nothing is built, and the company remembers.
 */
export function respondToMegaproject(
    corpState: CorporateWorldState,
    proposalId: string,
    response: ProposalResponse,
    world: GameWorldState,
    nowSeconds: number
): { ok: true } | { ok: false; error: string } {
    const proposal = corpState.megaprojects.get(proposalId);
    if (!proposal) return { ok: false, error: 'That proposal is no longer on the table.' };
    if (proposal.status !== 'proposed' && proposal.status !== 'delayed') {
        return { ok: false, error: 'That proposal has already been decided.' };
    }
    const company = corpState.companies.get(proposal.companyId);
    if (!company) return { ok: false, error: 'The company no longer exists.' };

    const reserves = world.economy.factions.get(proposal.factionId)?.reserves as Record<string, number> | undefined;

    if (response === 'delay') {
        proposal.status = 'delayed';
        proposal.expiresAt = nowSeconds + PROPOSAL_WINDOW_SECONDS;
        company.loyalty = Math.max(0, (company.loyalty ?? 50) - 3);
        return { ok: true };
    }

    if (response === 'reject') {
        proposal.status = 'rejected';
        company.loyalty = Math.max(0, (company.loyalty ?? 50) - 8);
        company.autonomyLevel = Math.min(100, company.autonomyLevel + 3);
        pushCompanyEvent(corpState.eventLog, company, 'megaproject_proposed', {
            proposalId, decision: 'rejected',
        }, nowSeconds);
        return { ok: true };
    }

    const stateShare = response === 'modify' ? proposal.stateShare * 0.5 : proposal.stateShare;
    const stateCost = Math.round(proposal.totalCost * stateShare);
    const companyCost = proposal.totalCost - stateCost;

    if ((reserves?.['CREDITS'] ?? 0) < stateCost) {
        return { ok: false, error: `The treasury needs ${stateCost.toLocaleString()} credits for the state's share.` };
    }
    if (company.treasury < companyCost * 0.5) {
        return { ok: false, error: 'The company cannot fund its own share on these terms.' };
    }

    if (reserves) reserves['CREDITS'] -= stateCost;
    // The company commits half its share up front and borrows the rest.
    company.treasury -= companyCost * 0.5;
    company.debt = (company.debt ?? 0) + companyCost * 0.5;

    proposal.stateShare = stateShare;
    proposal.status = 'building';
    proposal.progress = 0;
    if (response === 'modify') {
        proposal.durationSeconds = Math.round(proposal.durationSeconds * 1.4);
        company.loyalty = Math.max(0, (company.loyalty ?? 50) - 4);
    } else {
        company.loyalty = Math.min(100, (company.loyalty ?? 50) + 8);
    }

    pushCompanyEvent(corpState.eventLog, company, 'megaproject_started', {
        proposalId, name: proposal.name, stateCost, companyCost,
    }, nowSeconds);
    return { ok: true };
}

/** Advance construction and pay out the permanent effects on completion. */
export function tickMegaprojects(
    corpState: CorporateWorldState,
    world: GameWorldState,
    deltaSeconds: number,
    nowSeconds: number
): void {
    for (const proposal of corpState.megaprojects.values()) {
        if (proposal.status === 'proposed' || proposal.status === 'delayed') {
            if (nowSeconds >= proposal.expiresAt) {
                // Unanswered proposals lapse into rejection.
                proposal.status = 'rejected';
                const company = corpState.companies.get(proposal.companyId);
                if (company) {
                    company.loyalty = Math.max(0, (company.loyalty ?? 50) - 6);
                    company.autonomyLevel = Math.min(100, company.autonomyLevel + 2);
                }
            }
            continue;
        }
        if (proposal.status !== 'building') continue;

        const company = corpState.companies.get(proposal.companyId);
        if (!company) { proposal.status = 'rejected'; continue; }

        proposal.progress = Math.min(1, proposal.progress + deltaSeconds / proposal.durationSeconds);
        if (proposal.progress < 1) continue;

        proposal.status = 'complete';
        proposal.completedAt = nowSeconds;

        const def = MEGAPROJECT_DEFS.find(d => d.id === proposal.defId);
        if (!def) continue;
        const fx = def.onComplete;
        if (fx.companyIncomePerTick) company.megaprojectIncome = (company.megaprojectIncome ?? 0) + fx.companyIncomePerTick;
        if (fx.stateCreditsPerTick) company.stateMegaprojectIncome = (company.stateMegaprojectIncome ?? 0) + fx.stateCreditsPerTick;
        if (fx.companyInfluence) company.influence = Math.min(100, (company.influence ?? 0) + fx.companyInfluence);
        if (fx.companyAutonomy) company.autonomyLevel = Math.min(100, company.autonomyLevel + fx.companyAutonomy);
        if (fx.tradeEfficiency) {
            world.shared.tradeEfficiency = Math.max(0, Math.min(1, world.shared.tradeEfficiency + fx.tradeEfficiency));
        }
        if (fx.stateApproval) {
            const gov = world.government?.get?.(proposal.factionId);
            if (gov) gov.approval = Math.max(0, Math.min(100, gov.approval + fx.stateApproval));
        }
        // The megaproject is itself a corporate holding.
        company.infrastructureOwned.push(proposal.id);
        company.standing = computeStanding(company);

        pushCompanyEvent(corpState.eventLog, company, 'megaproject_completed', {
            proposalId: proposal.id, name: proposal.name, benefit: def.benefit,
        }, nowSeconds);
    }
}
