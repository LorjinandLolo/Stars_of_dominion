// lib/delegation/delegation-runner.ts
// Stars of Dominion — what the advisors actually do.
//
// Once per strategic tick, for every human faction, each DELEGATED system gets
// the conservative answer a competent staff would give: the thing that keeps
// the empire whole, never the thing that wins the game. A player who leaves
// everything delegated for a week comes back slower than a player who played
// every tick — and no poorer, no less legitimate, and not deposed.
//
// Three rules this file keeps:
//  1. Nothing here spends what the faction does not have. Every call goes
//     through the same service the player's order would, so every cost, refusal
//     and side effect is the one the game already knows about.
//  2. Nothing here is ambitious. No wars, no gambits, no covert operations, no
//     sponsorships, no territory. Those are the player's to start.
//  3. A system the player has taken back is never touched.
//
// Debates are the exception to "called from here": lib/politics/debate-service
// already answers questions for AI empires, so a delegated government simply
// counts as AI there (one branch, one behaviour, no second code path).

import type { GameWorldState } from '@/lib/game-world-state';
import { isDelegated } from './delegation-service';
import { DELEGATED_SYSTEMS, type DelegatedSystem } from './delegation-types';

import { answerDefiance } from '@/lib/government/defiance-service';


import { grantConcession } from '@/lib/government/secession-service';
import { resolveDemand } from '@/lib/economy/corporate/corporate-politics';
import { resolveCorporateCrisis } from '@/lib/economy/corporate/corporate-events';
import { SECESSION_DEMANDS, type SecessionDemandId } from '@/lib/government/secession-types';
import { counterCampaign, CampaignConfig } from '@/lib/press-system/campaigns';
import { signProtectionContract } from '@/lib/piracy/protection-service';
import { setAutomationDoctrine, tickAutomation } from '@/lib/exploration/exploration-service';
import { StrategicAIService } from '@/lib/ai/strategic-ai-service';

/** What the advisors did this tick, for the log and the probe. */
export interface DelegationReport {
    factionId: string;
    system: DelegatedSystem;
    action: string;
}

/**
 * Concessions that change what the empire IS — a region governing itself, a
 * parliament of its own — are the player's to grant. Staff may only trade
 * money and manpower: tax relief, resource rights, exemption from the draft.
 */
const CONSTITUTIONAL_DEMANDS = new Set<SecessionDemandId>(['autonomy', 'local_parliament']);
/** One refusal short of a company going rogue, the staff stop refusing. */
const ROGUE_STREAK_GUARD = 2;
/** Renew a protection contract this long before it lapses (sim seconds). */
const RENEW_WINDOW_SECONDS = 6 * 3600;

/**
 * Run every delegated system for every human faction. Called once per strategic
 * tick, after the simulation's own ticks have moved the world.
 */
export function runDelegatedSystems(world: GameWorldState, deltaSeconds: number): DelegationReport[] {
    const claimed: string[] = Array.isArray((world as any).claimedFactionIds)
        ? (world as any).claimedFactionIds
        : [];
    if (!claimed.length) return [];

    const reports: DelegationReport[] = [];
    for (const factionId of [...claimed].sort()) {
        if (!world.economy.factions.has(factionId)) continue;
        for (const system of DELEGATED_SYSTEMS) {
            if (!isDelegated(world, factionId, system)) continue;
            try {
                RUNNERS[system](world, factionId, deltaSeconds, reports);
            } catch (e: any) {
                console.error(`[Delegation] ${factionId}/${system} failed:`, e?.message ?? e);
            }
        }
    }
    return reports;
}

type Runner = (
    world: GameWorldState,
    factionId: string,
    deltaSeconds: number,
    reports: DelegationReport[],
) => void;

const RUNNERS: Record<DelegatedSystem, Runner> = {
    government: runGovernment,
    corporate: runCorporate,
    press: runPress,
    piracy: runPiracy,
    exploration: runExploration,
    research: runResearch,
};

// ─── Government ───────────────────────────────────────────────────────────────

/**
 * Answer what is on the desk. Debates are handled inside tickDebates (a
 * delegated government counts as AI there); here the staff deal with worlds in
 * open defiance and regions asking to leave.
 *
 * Defiance: negotiate if the capital can pay for it, otherwise threaten, which
 * is cheaper and sometimes works. Never nothing — silence is what wounds.
 *
 * Secession: concede the cheapest thing the region actually asked for, one
 * concession per tick, and never a sovereignty demand. Giving away senate seats
 * or customs authority is a decision with a season-long shadow; a caretaker
 * does not make it.
 */
function runGovernment(world: GameWorldState, factionId: string, _delta: number, reports: DelegationReport[]): void {
    for (const event of world.defianceEvents?.values() ?? []) {
        if (event.factionId !== factionId || event.status !== 'open') continue;
        const negotiated = answerDefiance(world, factionId, event.id, 'negotiate');
        if (negotiated.ok) {
            reports.push({ factionId, system: 'government', action: `negotiated with ${event.planetName}` });
            continue;
        }
        const threatened = answerDefiance(world, factionId, event.id, 'threaten');
        if (threatened.ok) {
            reports.push({ factionId, system: 'government', action: `demanded compliance from ${event.planetName}` });
        }
    }

    for (const crisis of world.secessionCrises?.values() ?? []) {
        if (crisis.factionId !== factionId || crisis.status !== 'open') continue;
        const asked = crisis.demands
            .filter(id => !crisis.granted.includes(id) && !CONSTITUTIONAL_DEMANDS.has(id))
            .map(id => ({ id, cost: secessionCost(id) }))
            .sort((a, b) => a.cost - b.cost);
        for (const demand of asked) {
            const result = grantConcession(world, factionId, crisis.id, demand.id);
            if (result.ok) {
                reports.push({ factionId, system: 'government', action: `conceded ${demand.id} to ${crisis.name}` });
                break; // One concession per tick; the region has to see it land.
            }
        }
    }
}

/** Cheapest first: a caretaker spends the least political capital that answers. */
function secessionCost(demandId: SecessionDemandId): number {
    return SECESSION_DEMANDS.find(d => d.id === demandId)?.politicalCapital ?? Number.MAX_SAFE_INTEGER;
}

// ─── Corporate ────────────────────────────────────────────────────────────────

/**
 * Decline what the companies ask for, and settle what lands on the state's
 * desk. One caveat the spec's "decline everything" cannot have meant: a
 * company that is refused three times in a row goes rogue, and a player who
 * was away would come back to a rogue conglomerate their staff created. So the
 * staff refuse until a company is one refusal short of that, then accept the
 * ordinary commercial demand — never a sovereignty demand, which they refuse
 * whatever the streak.
 */
function runCorporate(world: GameWorldState, factionId: string, _delta: number, reports: DelegationReport[]): void {
    const corpState: any = (world as any).corporate;
    if (!corpState?.demands) return;
    const now = world.nowSeconds;

    for (const demand of corpState.demands.values()) {
        if (demand.factionId !== factionId || demand.status !== 'pending') continue;
        const company = corpState.companies?.get?.(demand.companyId);
        const streak = Number(company?.refusedDemands ?? 0);
        const isSovereignty = SOVEREIGNTY_DEMAND_TYPES.has(demand.type);
        const wouldGoRogue = streak >= ROGUE_STREAK_GUARD;
        const response = (!isSovereignty && wouldGoRogue) ? 'accept' : 'reject';
        const result = resolveDemand(corpState, demand.id, response as any, world, now);
        if (result.ok) {
            reports.push({ factionId, system: 'corporate', action: `${response}ed ${demand.type} from ${demand.companyId}` });
        }
    }

    for (const crisis of corpState.crises?.values?.() ?? []) {
        if (crisis.factionId !== factionId || crisis.status !== 'pending') continue;
        // Cheapest lawful answer: least credits, then least political capital.
        const options = [...(crisis.options ?? [])].sort((a: any, b: any) =>
            (Number(a.creditCost ?? 0) - Number(b.creditCost ?? 0))
            || (Number(a.politicalCapitalCost ?? 0) - Number(b.politicalCapitalCost ?? 0)));
        for (const option of options) {
            const result = resolveCorporateCrisis(corpState, crisis.id, option.id, world, now);
            if (result.ok) {
                reports.push({ factionId, system: 'corporate', action: `settled ${crisis.type} with ${option.id}` });
                break;
            }
        }
    }
}

/** Demands that hand over a piece of the state. Staff never concede these. */
const SOVEREIGNTY_DEMAND_TYPES = new Set([
    'greater_autonomy', 'senate_representation', 'territorial_administration', 'customs_authority',
]);

// ─── Press ────────────────────────────────────────────────────────────────────

/**
 * Answer hostile campaigns the empire can actually see — a campaign only
 * becomes visible once it has signalled — with the cheapest response there is.
 * Counter-messaging costs influence and drags the campaign into the open; it
 * never starts one.
 */
function runPress(world: GameWorldState, factionId: string, _delta: number, reports: DelegationReport[]): void {
    const press: any = (world as any).press;
    const empire = press?.empires?.get?.(factionId);
    if (!empire || !press?.campaigns) return;

    for (const campaign of press.campaigns.values()) {
        if (!campaign.active || campaign.targetEmpireId !== factionId) continue;
        if (!campaign.signaled && Number(campaign.exposure ?? 0) < CampaignConfig.signalExposureThreshold) continue;
        if (Number(empire.narrativeInfluence ?? 0) < CampaignConfig.counterCost) break;
        const result = counterCampaign(campaign, empire);
        if (result.ok) {
            reports.push({ factionId, system: 'press', action: `countered campaign ${campaign.id}` });
        }
    }
}

// ─── Piracy ───────────────────────────────────────────────────────────────────

/**
 * Keep the standing arrangements standing. The staff do not sign new deals
 * with pirates, post bounties or sponsor anyone — all of those are the
 * player's politics. They renew a protection contract the player already
 * signed before it lapses, because a lapsed contract is an invitation.
 */
function runPiracy(world: GameWorldState, factionId: string, _delta: number, reports: DelegationReport[]): void {
    const piracy: any = (world as any).piracy;
    if (!piracy?.protectionContracts) return;
    const now = world.nowSeconds;

    const existing = [...piracy.protectionContracts.values()];
    for (const contract of existing) {
        if (contract.payerKind !== 'faction' || contract.payerId !== factionId) continue;
        if (contract.breachedAtSeconds) continue;
        const endsIn = Number(contract.expiresAtSeconds ?? 0) - now;
        if (endsIn > RENEW_WINDOW_SECONDS || endsIn < 0) continue;

        // Only once. The expiring contract stays in the map until it lapses, so
        // without this the staff would sign a fresh contract with the same band
        // every tick for the last six hours of the old one.
        const alreadyRenewed = existing.some((other: any) =>
            other !== contract
            && other.payerId === factionId
            && other.organizationId === contract.organizationId
            && Number(other.expiresAtSeconds ?? 0) > Number(contract.expiresAtSeconds ?? 0));
        if (alreadyRenewed) continue;

        const org = piracy.organizations?.get?.(contract.organizationId);
        if (!org) continue;
        const renewed = signProtectionContract(world, org, factionId, 'faction', contract.routeIds, {
            exclusiveDefence: contract.exclusiveDefence,
            secret: contract.secret,
            feePerHour: contract.feePerHour,
        });
        if (renewed) {
            reports.push({ factionId, system: 'piracy', action: `renewed protection with ${contract.organizationId}` });
        }
    }
}

// ─── Exploration ──────────────────────────────────────────────────────────────

/**
 * Keep idle fleets charting. The automation doctrine has existed since the
 * exploration system landed and nothing has ever used it; a delegated survey
 * office is what it was written for. Conservative risk tolerance, so scouts
 * are not sent into systems that are coming apart.
 */
function runExploration(world: GameWorldState, factionId: string, deltaSeconds: number, reports: DelegationReport[]): void {
    const movement: any = world.movement;
    if (!movement?.automationDoctrines) return;

    if (!movement.automationDoctrines.get(factionId)) {
        setAutomationDoctrine(factionId, { riskTolerance: 'conservative', active: true }, movement);
    }
    const orders = tickAutomation(factionId, movement, deltaSeconds);
    for (const order of orders) {
        reports.push({ factionId, system: 'exploration', action: `${order.mode} ${order.targetSystemId}` });
    }
}

// ─── Research ─────────────────────────────────────────────────────────────────

/**
 * Keep the research slot warm with the cheapest thing the engine will accept —
 * the same picker the AI empires use, so a delegated council is never better
 * informed than an AI rival, only never idle.
 */
function runResearch(world: GameWorldState, factionId: string, _delta: number, reports: DelegationReport[]): void {
    const before = world.tech.get(factionId);
    const activeBefore = countActive(before);
    StrategicAIService.manageResearch(factionId, world);
    const after = world.tech.get(factionId);
    if (countActive(after) > activeBefore) {
        const started = (after as any)?.activeSlots?.find((s: any) => s?.techId)?.techId;
        reports.push({ factionId, system: 'research', action: `started ${started ?? 'a project'}` });
    }
}

function countActive(techState: any): number {
    if (!techState?.activeSlots) return 0;
    return techState.activeSlots.filter((s: any) => s?.techId && s.status !== 'empty').length;
}
