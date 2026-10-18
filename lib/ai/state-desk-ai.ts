/**
 * lib/ai/state-desk-ai.ts
 * The parts of running an empire a player does by order and an AI court never
 * did at all — every one of them through the player's own order handler
 * (lib/ai/ai-orders.ts), at the player's price. WORKER-SIDE ONLY.
 *
 *   - Counter-intelligence (ESP_SET_COUNTERINTEL). The budget started at zero
 *     and nothing raised it, so every AI empire's counter-intel strength sat at
 *     zero all season and a human service ran free inside it.
 *   - Press defence (PRESS_COUNTER_CAMPAIGN / _TRACE_ / _ACCUSE_). A human
 *     smear campaign against an AI drained it with no answer; a delegated human
 *     at least got the counter-message.
 *   - Staffing (GOV_APPOINT_MINISTER / GOV_APPOINT_GOVERNOR). Seats were filled
 *     only at worker boot, so a minister who resigned stayed gone and a
 *     conquered world stayed ungoverned until the next restart.
 *   - Secession (GOV_GRANT_CONCESSION / GOV_SUPPRESS_SECESSION). The caretaker
 *     (lib/government/caretaker.ts) never touches the constitutional demands —
 *     right for a delegated player, but an AI is the ruler: a crisis asking only
 *     for autonomy or a parliament escalated untouched.
 *   - Prisoners of war (POW_DISPOSE). AI-held prisoners were never decided.
 *
 * Reads only what the empire could see in its own UI: its open case files,
 * campaigns that have signalled, its own cabinet, bench and worlds.
 */

import type { GameWorldState } from '../game-world-state';
import { queueAIOrder, hasQueuedAIOrder } from './ai-orders';
import { intelArchetypeOf, type AIIntelligenceArchetype } from './intelligence-ai-service';
import { ensureCases } from '../espionage/case-board';
import { counterIntelUpkeepPerHour, holdsSystem, MAX_COVERED_SYSTEMS } from '../espionage/counter-intel';
import { getOrCreateFactionIntel } from '../espionage/faction-intel';
import { ensurePressState } from '../press-system/integration';
import { CampaignConfig } from '../press-system/campaigns';
import { getGovernment } from '../government/government-service';
import { isFactionAtWar } from '../government/cohesion-service';
import { getMinister, APPOINT_MINISTER_COST } from '../government/cabinet-service';
import { getGovernor, APPOINT_GOVERNOR_COST } from '../government/governor-service';
import { SUPPRESS_SECESSION_COST } from '../government/secession-service';
import { SECESSION_DEMANDS, type SecessionDemandId } from '../government/secession-types';
import { CABINET_PORTFOLIOS, type CabinetPortfolio } from '../government/types';
import { ensureLedger, heldBy } from '../combat/siege/prisoners';
import { isAtWar } from '../diplomacy/offer-service';

const HOUR = 3600;
const DAY = 86400;

// ─── Counter-intelligence ────────────────────────────────────────────────────

/** Service-wide budget an AI keeps in peacetime, by character. */
const CI_BASE: Partial<Record<AIIntelligenceArchetype, number>> = {
    paranoid_security_state: 0.6,
    shadow_empire: 0.4,
    precision_assassin: 0.35,
    economic_subverter: 0.3,
    revolution_exporter: 0.3,
};
export const CI_DEFAULT_BASE = 0.3;
/** Each open case file on its desk (a hostile op it caught) raises the budget this much… */
export const CI_PER_OPEN_CASE = 0.1;
/** …up to this much. */
export const CI_CASE_CAP = 0.3;
export const CI_AT_WAR = 0.1;
/**
 * Intel an AI will spend per hour on its own defence. Income is 1.5/h; the
 * rest is what its own operations and case leads run on.
 */
export const CI_MAX_UPKEEP_PER_HOUR = 1.0;
/** Coverage it puts on its capital and on systems where it caught an operation. */
export const CI_COVERAGE = 0.5;
/** Systems an AI covers at most (players may cover up to MAX_COVERED_SYSTEMS). */
export const CI_AI_COVERED_SYSTEMS = Math.min(4, MAX_COVERED_SYSTEMS);

const snap = (v: number, step: number) => Math.round(v / step) * step;

export interface CounterIntelPlan { budget: number; regions: Record<string, number> }

/** What an AI service would set its counter-intelligence to right now. Exported for probes. */
export function desiredCounterIntel(world: GameWorldState, factionId: string): CounterIntelPlan {
    const archetype = intelArchetypeOf(factionId);
    const openCases = [...ensureCases(world).values()].filter(c => c.ownerFactionId === factionId && c.status === 'open');
    let budget = (archetype && CI_BASE[archetype]) ?? CI_DEFAULT_BASE;
    budget += Math.min(CI_CASE_CAP, openCases.length * CI_PER_OPEN_CASE);
    if (isFactionAtWar(world, factionId)) budget += CI_AT_WAR;
    budget = Math.min(0.9, budget);

    const regions: Record<string, number> = {};
    const capital = (world.economy.factions.get(factionId) as any)?.capitalSystemId as string | undefined;
    const wanted = [capital, ...openCases.sort((a, b) => b.openedAt - a.openedAt).map(c => c.systemId)];
    for (const systemId of wanted) {
        if (!systemId || regions[systemId] !== undefined) continue;
        if (Object.keys(regions).length >= CI_AI_COVERED_SYSTEMS) break;
        if (holdsSystem(world, factionId, systemId)) regions[systemId] = CI_COVERAGE;
    }

    // Trim to what it can pay for: coverage first (furthest from the capital
    // goes first), then the budget.
    const keys = Object.keys(regions);
    while (counterIntelUpkeepPerHour(budget, regions) > CI_MAX_UPKEEP_PER_HOUR && keys.length > 1) {
        delete regions[keys.pop()!];
    }
    while (counterIntelUpkeepPerHour(budget, regions) > CI_MAX_UPKEEP_PER_HOUR && budget > 0) {
        budget = Math.max(0, budget - 0.05);
    }
    return { budget: snap(budget, 0.05), regions };
}

function samePlan(a: CounterIntelPlan, budget: number, regional: Record<string, number>): boolean {
    if (Math.abs(a.budget - budget) > 1e-6) return false;
    const ka = Object.keys(a.regions).sort();
    const kb = Object.keys(regional ?? {}).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && Math.abs(a.regions[k] - regional[k]) < 1e-6);
}

export function planCounterIntel(world: GameWorldState, factionId: string): string | null {
    const plan = desiredCounterIntel(world, factionId);
    const intel = getOrCreateFactionIntel(world, factionId);
    if (samePlan(plan, intel.counterIntelBudget ?? 0, intel.regionalCounterIntel ?? {})) return null;
    queueAIOrder(world, {
        factionId, actionId: 'ESP_SET_COUNTERINTEL',
        payload: { budget: plan.budget, regions: plan.regions },
        reason: `counter-intel ${Math.round(plan.budget * 100)}%, ${Object.keys(plan.regions).length} system(s)`,
    });
    return `counter-intelligence to ${Math.round(plan.budget * 100)}%`;
}

// ─── Press defence ───────────────────────────────────────────────────────────

/** Exposure at which an AI starts spending on a trace rather than only countering. */
export const TRACE_FROM_EXPOSURE = 40;

/**
 * Answer every hostile campaign the empire can see (it has signalled): accuse
 * the sponsor once its own trace has named them, trace once the trail is warm,
 * otherwise counter-message. One move per campaign per turn, within the
 * narrative influence it holds.
 */
export function defendPress(world: GameWorldState, factionId: string): string[] {
    const done: string[] = [];
    const press = ensurePressState(world);
    const me = press.empires.get(factionId);
    if (!me || !press.campaigns) return done;
    let influence = Number(me.narrativeInfluence ?? 0);

    for (const camp of press.campaigns.values()) {
        if (!camp.active || camp.targetEmpireId !== factionId || !camp.signaled) continue;
        if (camp.discoveredBy === factionId) {
            queueAIOrder(world, { factionId, actionId: 'PRESS_ACCUSE_CAMPAIGN', payload: { campaignId: camp.id, suspectFactionId: camp.attackerId }, reason: `names ${camp.attackerId} behind ${camp.id}` });
            done.push(`accused ${camp.attackerId} of ${camp.id}`);
            continue;
        }
        if (camp.exposure >= TRACE_FROM_EXPOSURE && influence >= CampaignConfig.traceCost) {
            influence -= CampaignConfig.traceCost;
            queueAIOrder(world, { factionId, actionId: 'PRESS_TRACE_CAMPAIGN', payload: { campaignId: camp.id }, reason: `traces ${camp.id}` });
            done.push(`traced ${camp.id}`);
            continue;
        }
        if (influence >= CampaignConfig.counterCost) {
            influence -= CampaignConfig.counterCost;
            queueAIOrder(world, { factionId, actionId: 'PRESS_COUNTER_CAMPAIGN', payload: { campaignId: camp.id }, reason: `counters ${camp.id}` });
            done.push(`countered ${camp.id}`);
        }
    }
    return done;
}

// ─── Staffing ────────────────────────────────────────────────────────────────

/** Most governors an AI appoints in one turn (each costs political capital). */
export const GOVERNORS_PER_TURN = 2;
/** Same per-faction ceiling governor-service applies at boot. */
const MAX_GOVERNORS = 12;

/** Which roles suit which brief, best first — governor-service/cabinet-service's own preference. */
const PORTFOLIO_ROLE_FIT: Record<CabinetPortfolio, string[]> = {
    defence: ['General', 'Admiral'],
    economy: ['EconomicMinister', 'CharterCompanyExecutive'],
    science: ['Governor', 'EconomicMinister'],
    intelligence: ['IntelligenceDirector'],
    interior: ['Governor'],
    foreign: ['DiplomaticEnvoy'],
};

function capitalOf(world: GameWorldState, factionId: string): number {
    const gov = getGovernment(world, factionId);
    return gov ? gov.politicalCapital : Number.POSITIVE_INFINITY;
}

/** Leaders this government could appoint: the bench, and its own active leaders with no post. */
function appointable(world: GameWorldState, factionId: string, taken: Set<string>): any[] {
    const gov = getGovernment(world, factionId);
    const bench = world.leadership.recruitmentPool.filter(l => l.factionId === factionId);
    const idle = [...world.leadership.leaders.values()].filter(l =>
        l.factionId === factionId && l.status === 'active' && !l.assignmentId && !l.portfolio
        && (l.role === 'Governor' || l.role === 'Minister'));
    return [...bench, ...idle].filter(l => !taken.has(l.id) && l.id !== gov?.headOfStateId && l.status === 'active');
}

const baseScore = (l: any) => (l.competence ?? 50) + (l.loyalty ?? 50) * 0.5 - (l.corruption ?? 0) * 0.5;

/** Political capital an AI keeps back for a secession crisis on its desk. */
function capitalReserve(world: GameWorldState, factionId: string): number {
    const crisisOpen = [...(world.secessionCrises?.values() ?? [])].some(c => c.factionId === factionId && c.status === 'open');
    return crisisOpen ? SUPPRESS_SECESSION_COST : 10;
}

export function staffGovernment(world: GameWorldState, factionId: string): string[] {
    const done: string[] = [];
    const gov = getGovernment(world, factionId);
    if (!gov) return done;
    // Repair: the old AI pointed a Governor's assignmentId at a planet without
    // telling the planet. Such a leader governs nothing; free them for the bench.
    for (const l of world.leadership.leaders.values()) {
        if (l.factionId !== factionId || l.role !== 'Governor' || !l.assignmentId) continue;
        const planet = world.construction.planets.get(l.assignmentId);
        if (planet && planet.governorId !== l.id) l.assignmentId = undefined;
    }
    const taken = new Set<string>();
    let capital = capitalOf(world, factionId) - capitalReserve(world, factionId);

    for (const portfolio of CABINET_PORTFOLIOS) {
        if (getMinister(world, factionId, portfolio)) continue;
        if (hasQueuedAIOrder(world, factionId, 'GOV_APPOINT_MINISTER', p => p?.portfolio === portfolio)) continue;
        if (capital < APPOINT_MINISTER_COST) break;
        const fit = PORTFOLIO_ROLE_FIT[portfolio] ?? [];
        const pick = appointable(world, factionId, taken)
            .map(l => ({ l, s: baseScore(l) + (fit.indexOf(l.role) >= 0 ? 25 - fit.indexOf(l.role) * 5 : 0) }))
            .sort((a, b) => b.s - a.s || a.l.id.localeCompare(b.l.id))[0]?.l;
        if (!pick) break;
        taken.add(pick.id);
        capital -= APPOINT_MINISTER_COST;
        queueAIOrder(world, { factionId, actionId: 'GOV_APPOINT_MINISTER', payload: { portfolio, leaderId: pick.id }, reason: `${pick.name} to ${portfolio}` });
        done.push(`appointed ${pick.name} to ${portfolio}`);
    }

    const worlds = [...world.construction.planets.values()]
        .filter(p => p.ownerId === factionId)
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || a.id.localeCompare(b.id));
    let staffed = worlds.filter(p => getGovernor(world, p.id)).length;
    let appointed = 0;
    for (const planet of worlds) {
        if (staffed >= MAX_GOVERNORS || appointed >= GOVERNORS_PER_TURN) break;
        if (getGovernor(world, planet.id)) continue;
        if (hasQueuedAIOrder(world, factionId, 'GOV_APPOINT_GOVERNOR', p => p?.planetId === planet.id)) continue;
        if (capital < APPOINT_GOVERNOR_COST) break;
        const pick = appointable(world, factionId, taken)
            .map(l => ({ l, s: baseScore(l) + (l.role === 'Governor' ? 20 : 0) }))
            .sort((a, b) => b.s - a.s || a.l.id.localeCompare(b.l.id))[0]?.l;
        if (!pick) break;
        taken.add(pick.id);
        capital -= APPOINT_GOVERNOR_COST;
        staffed++;
        appointed++;
        queueAIOrder(world, { factionId, actionId: 'GOV_APPOINT_GOVERNOR', payload: { planetId: planet.id, leaderId: pick.id }, reason: `${pick.name} governs ${planet.id}` });
        done.push(`appointed ${pick.name} governor of ${planet.name ?? planet.id}`);
    }
    return done;
}

// ─── Secession ───────────────────────────────────────────────────────────────

const CONSTITUTIONAL = new Set<SecessionDemandId>(['autonomy', 'local_parliament']);
/** Garrison loyalty at which an AI ruler would rather put a region down than hand it a constitution. */
export const SUPPRESS_LOYALTY = 70;
/** …and the loyalty it will gamble on when the deadline is close and it cannot afford to concede. */
export const SUPPRESS_LOYALTY_LAST_RESORT = 50;
/** A crisis is left to the caretaker's concessions for this long before the ruler steps in. */
export const RULER_STEPS_IN_AFTER = 12 * HOUR;

function demandCost(id: SecessionDemandId): number {
    return SECESSION_DEMANDS.find(d => d.id === id)?.politicalCapital ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The ruler's answer once the caretaker has conceded all it may: put the
 * region down while the garrison will still obey, otherwise give it the
 * cheapest constitutional thing it asked for, and as a last resort near the
 * deadline, gamble on the troops.
 */
export function answerSecession(world: GameWorldState, factionId: string): string[] {
    const done: string[] = [];
    for (const crisis of world.secessionCrises?.values() ?? []) {
        if (crisis.factionId !== factionId || crisis.status !== 'open') continue;
        if (world.nowSeconds - crisis.openedAtSeconds < RULER_STEPS_IN_AFTER) continue;
        const open = crisis.demands.filter(id => !crisis.granted.includes(id));
        if (open.length === 0 || open.some(id => !CONSTITUTIONAL.has(id))) continue; // caretaker's still working
        if (hasQueuedAIOrder(world, factionId, 'GOV_SUPPRESS_SECESSION', p => p?.crisisId === crisis.id)
            || hasQueuedAIOrder(world, factionId, 'GOV_GRANT_CONCESSION', p => p?.crisisId === crisis.id)) continue;

        const capital = capitalOf(world, factionId);
        const cheapest = [...open].sort((a, b) => demandCost(a) - demandCost(b))[0];
        const nearDeadline = crisis.deadlineSeconds - world.nowSeconds < 12 * HOUR;

        if (crisis.militaryLoyalty >= SUPPRESS_LOYALTY && capital >= SUPPRESS_SECESSION_COST) {
            queueAIOrder(world, { factionId, actionId: 'GOV_SUPPRESS_SECESSION', payload: { crisisId: crisis.id }, reason: `garrison loyal (${Math.round(crisis.militaryLoyalty)})` });
            done.push(`moved against ${crisis.name}`);
        } else if (capital >= demandCost(cheapest)) {
            queueAIOrder(world, { factionId, actionId: 'GOV_GRANT_CONCESSION', payload: { crisisId: crisis.id, demandId: cheapest }, reason: `concedes ${cheapest}` });
            done.push(`conceded ${cheapest} to ${crisis.name}`);
        } else if (nearDeadline && crisis.militaryLoyalty >= SUPPRESS_LOYALTY_LAST_RESORT && capital >= SUPPRESS_SECESSION_COST) {
            queueAIOrder(world, { factionId, actionId: 'GOV_SUPPRESS_SECESSION', payload: { crisisId: crisis.id }, reason: 'last resort before the deadline' });
            done.push(`moved against ${crisis.name} as a last resort`);
        }
    }
    return done;
}

// ─── Prisoners of war ────────────────────────────────────────────────────────

/** A captor decides after this long (a player sees the prisoners at once; the AI deliberates a day). */
export const POW_DECIDE_AFTER = DAY;

/**
 * What an AI does with prisoners. No atrocities: an AI court never executes
 * and never works prisoners to death — that is a player's choice to make and
 * be remembered for. At war with their empire and holding a garrison on the
 * world, it turns who it can; otherwise it ransoms them back, which also
 * cools the war a little.
 */
export function disposePrisoners(world: GameWorldState, factionId: string): string[] {
    const done: string[] = [];
    const ledger = ensureLedger((world as any).combat ?? ((world as any).combat = { recruitmentJobs: [] }));
    for (const group of heldBy(ledger, factionId)) {
        if (world.nowSeconds - group.capturedAtSeconds < POW_DECIDE_AFTER) continue;
        if (hasQueuedAIOrder(world, factionId, 'POW_DISPOSE', p => p?.groupId === group.id)) continue;
        const planet: any = world.construction.planets.get(group.planetId);
        const turn = isAtWar(world, factionId, group.ownerEmpireId) && planet?.ownerId === factionId && planet?.garrison;
        const disposition = turn ? 'recruit' : 'ransom';
        queueAIOrder(world, { factionId, actionId: 'POW_DISPOSE', payload: { groupId: group.id, disposition }, reason: `${group.count} prisoners: ${disposition}` });
        done.push(`${disposition} ${group.count} prisoners from ${group.ownerEmpireId}`);
    }
    return done;
}

/** The whole desk, one strategic turn. Each part fails alone. */
export function runStateDesk(world: GameWorldState, factionId: string): string[] {
    const done: string[] = [];
    const parts: Array<[string, () => string[] | string | null]> = [
        ['counter-intel', () => planCounterIntel(world, factionId)],
        ['press', () => defendPress(world, factionId)],
        ['staffing', () => staffGovernment(world, factionId)],
        ['secession', () => answerSecession(world, factionId)],
        ['prisoners', () => disposePrisoners(world, factionId)],
    ];
    for (const [label, run] of parts) {
        try {
            const out = run();
            if (Array.isArray(out)) done.push(...out);
            else if (out) done.push(out);
        } catch (e) {
            console.error(`[AI] ${factionId} ${label} desk failed:`, e);
        }
    }
    return done;
}
