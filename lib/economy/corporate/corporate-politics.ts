/**
 * lib/economy/corporate/corporate-politics.ts
 * The company as a political actor.
 *
 * Lobbying, sovereignty demands, foreign-host policy, and what a company does
 * once it stops recognising the charter. This is where the economy stops being
 * arithmetic: the player is no longer optimising a number, they are managing a
 * relationship with something that has its own interests.
 */

import type { GameWorldState } from '../../game-world-state';
import type { CharteredCompany } from './company-types';
import type { CorporateWorldState } from './company-registry';
import type {
    CorporateDemand,
    CorporateDemandType,
    HostPolicyStance,
} from './charter-types';
import { SOVEREIGNTY_DEMANDS } from './charter-types';
import { DEMAND_DEFS } from './charter-catalog';
import {
    TERRITORY_LADDER,
    computeInfluence,
    computeStanding,
    personalityOf,
    pushCompanyEvent,
    seededRandom,
    weightedPick,
} from './charter-service';

// ─── Configuration ───────────────────────────────────────────────────────────

/** Base sim-seconds between lobbying attempts, before personality scaling. */
export const DEMAND_INTERVAL_SECONDS = 4 * 86_400;
/** How long a demand sits on the desk before it lapses. */
export const DEMAND_WINDOW_SECONDS = 3 * 86_400;
/** Refusals in a row before a powerful company starts acting on its own. */
export const HOSTILE_REFUSAL_STREAK = 3;

// ─── Government helpers ──────────────────────────────────────────────────────

function govOf(world: GameWorldState, factionId: string) {
    return world.government?.get?.(factionId);
}

function creditFaction(world: GameWorldState, factionId: string, amount: number): void {
    const reserves = world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined;
    if (!reserves) return;
    reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + amount;
}

/** Apply a demand's government-side effects. */
function applyStateEffects(
    world: GameWorldState,
    factionId: string,
    effects: { approval?: number; politicalCapital?: number; credits?: number; stability?: number }
): void {
    const gov = govOf(world, factionId);
    if (gov) {
        if (effects.approval) gov.approval = Math.max(0, Math.min(100, gov.approval + effects.approval));
        if (effects.politicalCapital) {
            gov.politicalCapital = Math.max(0, Math.min(gov.politicalCapitalCap ?? 100, gov.politicalCapital + effects.politicalCapital));
        }
    }
    if (effects.credits) creditFaction(world, factionId, effects.credits);
    if (effects.stability) {
        world.shared.stability = Math.max(0, Math.min(1, world.shared.stability + effects.stability));
    }
}

/** Apply a demand's company-side effects. */
function applyCompanyEffects(
    company: CharteredCompany,
    effects: { autonomy?: number; loyalty?: number; influence?: number; treasury?: number; corruption?: number }
): void {
    if (effects.autonomy) company.autonomyLevel = Math.max(0, Math.min(100, company.autonomyLevel + effects.autonomy));
    if (effects.loyalty) company.loyalty = Math.max(0, Math.min(100, (company.loyalty ?? 50) + effects.loyalty));
    if (effects.influence) company.influence = Math.max(0, Math.min(100, (company.influence ?? 0) + effects.influence));
    if (effects.treasury) company.treasury += effects.treasury;
    if (effects.corruption) company.corruptionIndex = Math.max(0, Math.min(100, company.corruptionIndex + effects.corruption));
}

// ─── Lobbying ────────────────────────────────────────────────────────────────

/**
 * Decide whether the company raises something with its government this cycle,
 * and what. Companies only ask for what their weight can carry: a small firm
 * asks for tax relief, a dominant one asks for a seat in the Senate.
 */
export function maybeIssueDemand(
    company: CharteredCompany,
    corpState: CorporateWorldState,
    world: GameWorldState,
    nowSeconds: number
): CorporateDemand | null {
    if (company.nationalized || company.charterRevocationPending) return null;

    const personality = personalityOf(company);
    const interval = DEMAND_INTERVAL_SECONDS / Math.max(0.2, personality.demandRate);
    if (nowSeconds - (company.lastDemandAt ?? 0) < interval) return null;

    // One outstanding demand per company at a time — a queue of ultimatums is
    // noise, not pressure.
    for (const demand of corpState.demands.values()) {
        if (demand.companyId === company.id && demand.status === 'pending') return null;
    }

    const influence = company.influence ?? 0;
    const autonomy = company.autonomyLevel ?? 0;
    const roll = seededRandom(`${company.id}:demand:${Math.floor(nowSeconds / interval)}`);

    // A weightless company can lobby, but rarely gets round to it.
    const chance = Math.min(0.85, 0.1 + influence / 140) * personality.demandRate;
    if (roll() > chance) {
        company.lastDemandAt = nowSeconds;
        return null;
    }

    const eligible: Partial<Record<CorporateDemandType, number>> = {};
    for (const def of Object.values(DEMAND_DEFS)) {
        if (influence < def.minInfluence || autonomy < def.minAutonomy) continue;
        // Sovereignty demands come late and weigh more the further the company
        // has already drifted.
        const isSovereignty = SOVEREIGNTY_DEMANDS.includes(def.type);
        const weight = isSovereignty
            ? 1 + (autonomy - def.minAutonomy) * 0.08 + (100 - (company.loyalty ?? 50)) * 0.03
            : 3;
        eligible[def.type] = weight;
    }
    // A loyal company does not ask for pieces of the state.
    if ((company.loyalty ?? 50) > 70) {
        for (const type of SOVEREIGNTY_DEMANDS) delete eligible[type];
    }

    const type = weightedPick(eligible, roll());
    company.lastDemandAt = nowSeconds;
    if (!type) return null;

    const def = DEMAND_DEFS[type];
    const demand: CorporateDemand = {
        id: `cdem-${company.id}-${nowSeconds}`,
        companyId: company.id,
        factionId: company.foundingFactionId,
        type,
        text: def.text,
        severity: def.severity,
        issuedAt: nowSeconds,
        expiresAt: nowSeconds + DEMAND_WINDOW_SECONDS,
        status: 'pending',
        concession: def.concession,
        threat: def.threat,
    };
    corpState.demands.set(demand.id, demand);
    pushCompanyEvent(corpState.eventLog, company, 'demand_issued', {
        demandId: demand.id, type, severity: def.severity, text: def.text,
    }, nowSeconds);
    return demand;
}

export type DemandResponse = 'accept' | 'reject' | 'negotiate';

/**
 * The government answers. Accepting buys loyalty at the price of control;
 * refusing keeps control at the price of loyalty. Negotiating splits both, and
 * costs political capital for the privilege.
 */
export function resolveDemand(
    corpState: CorporateWorldState,
    demandId: string,
    response: DemandResponse,
    world: GameWorldState,
    nowSeconds: number
): { ok: true; demand: CorporateDemand } | { ok: false; error: string } {
    const demand = corpState.demands.get(demandId);
    if (!demand) return { ok: false, error: 'That demand is no longer on the table.' };
    if (demand.status !== 'pending') return { ok: false, error: 'That demand has already been answered.' };

    const company = corpState.companies.get(demand.companyId);
    if (!company) return { ok: false, error: 'The company no longer exists.' };
    const def = DEMAND_DEFS[demand.type];

    if (response === 'negotiate') {
        const gov = govOf(world, demand.factionId);
        const cost = 5 * demand.severity;
        if (!gov || gov.politicalCapital < cost) {
            return { ok: false, error: `Negotiating this requires ${cost} political capital.` };
        }
        gov.politicalCapital -= cost;
        applyCompanyEffects(company, halve(def.onAccept));
        applyStateEffects(world, demand.factionId, halve(def.stateOnAccept));
        applyCharterConcession(company, demand.type, 0.5);
        company.loyalty = Math.min(100, (company.loyalty ?? 50) + 3);
        demand.status = 'negotiated';
    } else if (response === 'accept') {
        applyCompanyEffects(company, def.onAccept);
        applyStateEffects(world, demand.factionId, def.stateOnAccept);
        applyCharterConcession(company, demand.type, 1);
        company.grantedDemands = (company.grantedDemands ?? 0) + 1;
        company.refusedDemands = 0;
        demand.status = 'accepted';
    } else {
        applyCompanyEffects(company, def.onReject);
        applyStateEffects(world, demand.factionId, def.stateOnReject);
        company.refusedDemands = (company.refusedDemands ?? 0) + 1;
        demand.status = 'rejected';

        // Refuse a powerful company often enough and it stops asking.
        if ((company.refusedDemands ?? 0) >= HOSTILE_REFUSAL_STREAK && (company.influence ?? 0) >= 45) {
            company.autonomyLevel = Math.min(100, company.autonomyLevel + 10);
            company.loyalty = Math.max(0, (company.loyalty ?? 50) - 15);
            applyRogueRetaliation(company, world, nowSeconds);
        }
    }

    company.influence = computeInfluence(company);
    company.standing = computeStanding(company);
    pushCompanyEvent(corpState.eventLog, company, 'demand_resolved', {
        demandId, type: demand.type, response, standing: company.standing,
    }, nowSeconds);
    return { ok: true, demand };
}

function halve<T extends Record<string, number | undefined>>(effects: T): T {
    const out: Record<string, number | undefined> = {};
    for (const [key, value] of Object.entries(effects)) {
        out[key] = typeof value === 'number' ? value / 2 : value;
    }
    return out as T;
}

/**
 * Some concessions change the charter itself, not just the mood. This is where
 * "accept too much and you have built a state inside your state" is actually
 * implemented.
 */
function applyCharterConcession(company: CharteredCompany, type: CorporateDemandType, scale: number): void {
    switch (type) {
        case 'lower_taxes':
            company.profitShareToState = Math.max(0, (company.profitShareToState ?? 0.15) - 0.05 * scale);
            break;
        case 'expansion_rights': {
            const index = TERRITORY_LADDER.indexOf(company.territory ?? 'domestic');
            if (scale >= 1 && index >= 0 && index < TERRITORY_LADDER.length - 1) {
                company.territory = TERRITORY_LADDER[index + 1];
            }
            break;
        }
        case 'monopoly_protection':
            // Exclusivity in its own systems: the nominal HQ monopoly widens to
            // everywhere the company actually operates.
            for (const key of Object.keys(company.monopolyRights) as (keyof typeof company.monopolyRights)[]) {
                company.monopolyRights[key] = [...new Set([
                    ...(company.monopolyRights[key] ?? []),
                    ...(company.presenceSystemIds ?? []),
                ])];
            }
            break;
        case 'deregulation':
            if (scale >= 1) (company.rights ??= []).push('purchase_land');
            break;
        case 'territorial_administration':
            if (scale >= 1 && !(company.rights ?? []).includes('administer_territories')) {
                (company.rights ??= []).push('administer_territories');
            }
            break;
        case 'customs_authority':
            if (scale >= 1 && !(company.rights ?? []).includes('collect_tariffs')) {
                (company.rights ??= []).push('collect_tariffs');
            }
            break;
        case 'senate_representation':
            if (scale >= 1 && !(company.rights ?? []).includes('negotiate_agreements')) {
                (company.rights ??= []).push('negotiate_agreements');
            }
            break;
        default:
            break;
    }
}

/** Lapse demands nobody answered. Silence reads as refusal, at half weight. */
export function expireDemands(corpState: CorporateWorldState, world: GameWorldState, nowSeconds: number): void {
    for (const demand of corpState.demands.values()) {
        if (demand.status !== 'pending' || nowSeconds < demand.expiresAt) continue;
        demand.status = 'expired';
        const company = corpState.companies.get(demand.companyId);
        if (!company) continue;
        applyCompanyEffects(company, halve(DEMAND_DEFS[demand.type].onReject));
        company.refusedDemands = (company.refusedDemands ?? 0) + 1;
    }
    // Bound the ledger: keep pending business plus a short tail of history.
    const settled = [...corpState.demands.values()]
        .filter(d => d.status !== 'pending')
        .sort((a, b) => a.issuedAt - b.issuedAt);
    while (settled.length > 40) {
        const oldest = settled.shift();
        if (oldest) corpState.demands.delete(oldest.id);
    }
    void world;
}

// ─── Going rogue ─────────────────────────────────────────────────────────────

/**
 * What a company does when it decides the government is an obstacle: it moves
 * money out of reach, pays for a friendlier opposition, and lets the frontier
 * get difficult to govern.
 */
export function applyRogueRetaliation(company: CharteredCompany, world: GameWorldState, nowSeconds: number): void {
    const gov = govOf(world, company.foundingFactionId);

    // Capital flight: the treasury moves offshore, out of the state's reach.
    const flight = company.treasury * 0.15;
    company.treasury -= flight;

    // Funding the opposition.
    if (gov) {
        gov.approval = Math.max(0, gov.approval - 3);
        gov.legitimacy = Math.max(0, gov.legitimacy - 2);
        gov.history.push({
            timestamp: nowSeconds,
            event: `${company.charter.fullName} moved capital offshore and began funding opposition figures.`,
        });
        if (gov.history.length > 60) gov.history.splice(0, gov.history.length - 60);
    }

    // Frontier unrest where the company, not the state, is the real authority.
    for (const planet of world.economy.planets.values()) {
        if (!company.corporateColonies.includes(planet.systemId)) continue;
        planet.instability = Math.min(100, (planet.instability ?? 0) + 5);
    }
    world.shared.stability = Math.max(0, world.shared.stability - 0.01);
}

/**
 * A rogue company stops remitting, stops obeying embargoes, and keeps arming.
 * Called each corporate tick for companies past the rogue line.
 */
export function tickRogueBehaviour(
    company: CharteredCompany,
    world: GameWorldState,
    nowSeconds: number
): void {
    if (!company.hasGoneRogue || company.nationalized) return;
    company.profitShareToState = 0;
    company.loyalty = Math.max(0, (company.loyalty ?? 0) - 0.5);
    const gov = govOf(world, company.foundingFactionId);
    if (gov) gov.approval = Math.max(0, gov.approval - 0.05);
    void nowSeconds;
}

// ─── Remittance ──────────────────────────────────────────────────────────────

/**
 * The clause that made the whole arrangement attractive: a share of profit
 * returns to the government that granted the charter. A rogue company pays
 * nothing, which is exactly what makes the loss of control expensive.
 */
export function remitToState(
    company: CharteredCompany,
    world: GameWorldState,
    profit: number
): number {
    const rate = company.hasGoneRogue ? 0 : (company.profitShareToState ?? 0);
    if (profit <= 0 || rate <= 0) return 0;
    const amount = profit * rate;
    company.treasury -= amount;
    // Remitted profit is no longer distributable — take it off the dividend
    // pool too, or shareholders would be paid on money already sent to the state.
    company.pendingProfit = Math.max(0, company.pendingProfit - amount);
    company.stateRemittanceTotal = (company.stateRemittanceTotal ?? 0) + amount;
    creditFaction(world, company.foundingFactionId, amount);
    return amount;
}

// ─── Foreign hosts ───────────────────────────────────────────────────────────

/**
 * How a government treats a foreign-chartered company inside its borders.
 * `nationalized` seizes the company's local holdings outright — profitable,
 * and an act the founding empire will not forget.
 */
export function setHostPolicy(
    corpState: CorporateWorldState,
    world: GameWorldState,
    factionId: string,
    companyId: string,
    stance: HostPolicyStance,
    tariffRate: number,
    nowSeconds: number
): { ok: true } | { ok: false; error: string } {
    const company = corpState.companies.get(companyId);
    if (!company) return { ok: false, error: 'Company not found.' };
    if (company.foundingFactionId === factionId) {
        return { ok: false, error: 'Use charter powers to govern a company you chartered.' };
    }
    if (!(company.operatingFactionIds ?? []).includes(factionId)) {
        return { ok: false, error: 'That company does not operate in your space.' };
    }

    const key = `${factionId}:${companyId}`;
    corpState.hostPolicies.set(key, {
        factionId,
        companyId,
        stance,
        tariffRate: Math.max(0, Math.min(0.5, tariffRate)),
        setAt: nowSeconds,
    });

    if (stance === 'banned' || stance === 'nationalized') {
        // Local assets are surrendered. Nationalisation transfers their value to
        // the host treasury; a ban merely expels them.
        const localSystems = new Set(
            [...world.movement.systems.values()]
                .filter(s => s.ownerFactionId === factionId)
                .map(s => s.id)
        );
        const seized = (company.assets ?? []).filter(a => localSystems.has(a.systemId));
        const seizedValue = seized.reduce((s, a) => s + a.value, 0);
        company.assets = (company.assets ?? []).filter(a => !localSystems.has(a.systemId));
        company.infrastructureOwned = company.infrastructureOwned.filter(
            id => !seized.some(a => a.id === id)
        );
        company.presenceSystemIds = (company.presenceSystemIds ?? []).filter(id => !localSystems.has(id));
        company.corporateColonies = company.corporateColonies.filter(id => !localSystems.has(id));
        company.operatingFactionIds = (company.operatingFactionIds ?? []).filter(id => id !== factionId);

        if (stance === 'nationalized' && seizedValue > 0) {
            creditFaction(world, factionId, seizedValue * 0.6);
        }
        // Seizure is an act against the chartering empire, not just the company.
        company.loyalty = Math.max(0, (company.loyalty ?? 50) - 5);
        pushCompanyEvent(corpState.eventLog, company, 'host_policy_changed', {
            factionId, stance, seizedAssets: seized.length, seizedValue: Math.round(seizedValue),
        }, nowSeconds);
    } else {
        pushCompanyEvent(corpState.eventLog, company, 'host_policy_changed', {
            factionId, stance, tariffRate,
        }, nowSeconds);
    }

    company.influence = computeInfluence(company);
    company.standing = computeStanding(company);
    return { ok: true };
}

/**
 * Per-tick effect of host policies: tariffs move credits from the company to
 * the host, restrictions throttle what the company earns there.
 */
export function tickHostPolicies(
    corpState: CorporateWorldState,
    world: GameWorldState
): void {
    for (const policy of corpState.hostPolicies.values()) {
        const company = corpState.companies.get(policy.companyId);
        if (!company) continue;

        const localAssets = (company.assets ?? []).filter(a => {
            const owner = world.movement.systems.get(a.systemId)?.ownerFactionId;
            return owner === policy.factionId;
        });
        if (localAssets.length === 0) continue;

        const localIncome = localAssets.reduce((s, a) => s + a.incomePerTick, 0);
        if (policy.stance === 'taxed') {
            const tariff = localIncome * policy.tariffRate;
            company.treasury -= tariff;
            creditFaction(world, policy.factionId, tariff);
        } else if (policy.stance === 'restricted') {
            // Permits, inspections and delays: the company earns less here.
            company.treasury -= localIncome * 0.25;
        }
    }
}
