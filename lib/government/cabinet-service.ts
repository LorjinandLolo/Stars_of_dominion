// lib/government/cabinet-service.ts
// Stars of Dominion — Government & Leadership, Phase 3 (cabinet).
//
// Ministers are political actors, not passive stat lines: a competent one makes
// their brief work, a corrupt one bleeds the treasury, and an ambitious one with
// nothing to lose walks out — taking the government's standing with them.

import type { GameWorldState } from '@/lib/game-world-state';
import type { Leader } from '@/lib/leadership/types';
import type { CabinetAdvice, CabinetPortfolio, GovernmentState } from './types';
import { CABINET_PORTFOLIOS } from './types';
import { generateLeader, seedFromString } from '@/lib/leadership/leader-generator';
import { seatSkill, fitsSeat } from '@/lib/leadership/character';
import { RNG } from '@/lib/trade-system/rng';
import { fireNotification } from '@/lib/time/notification-hooks';
import { getGovernment } from './government-service';
import { refillRecruitmentPool } from './succession-service';
import { isFactionAtWar } from './cohesion-service';
import { isDelegated } from '@/lib/delegation/delegation-service';
import { espionagePressureOn } from '@/lib/espionage/pressure';
import { adminStatus } from './admin-capacity';
import { ministerLine, registerOf, seedOf, type Hook } from './minister-voices';
import { drawCastForClaimed } from '@/lib/leadership/cast';

/**
 * A delegated cabinet's loyalty floor. Above the coup-risk trigger for a
 * disloyal Defence Minister (35), so an absent player's own ministers do not
 * become the reason they are deposed.
 */
const DELEGATED_LOYALTY_FLOOR = 40;

/** Loyalty below this and a minister walks (or is walked out). */
const RESIGNATION_LOYALTY = 15;
/** Legitimacy cost when a minister resigns in protest. */
const RESIGNATION_LEGITIMACY_COST = 2;
/** Political capital to appoint / dismiss a minister. */
export const APPOINT_MINISTER_COST = 5;
export const DISMISS_MINISTER_COST = 10;

const PORTFOLIO_LABEL: Record<CabinetPortfolio, string> = {
    defence: 'Defence',
    economy: 'Economy',
    science: 'Science',
    intelligence: 'Intelligence',
    interior: 'Interior',
    foreign: 'Foreign Affairs',
};

/** Which recruitment-pool roles suit which brief, best match first. */
const PORTFOLIO_ROLE_FIT: Record<CabinetPortfolio, string[]> = {
    defence: ['General', 'Admiral'],
    economy: ['EconomicMinister', 'CharterCompanyExecutive'],
    science: ['Governor', 'EconomicMinister'],
    intelligence: ['IntelligenceDirector'],
    interior: ['Governor'],
    foreign: ['DiplomaticEnvoy'],
};

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

export function portfolioLabel(portfolio: CabinetPortfolio): string {
    return PORTFOLIO_LABEL[portfolio] ?? portfolio;
}

/** The minister holding a seat, if the seat is filled by a living leader. */
export function getMinister(
    world: GameWorldState,
    factionId: string,
    portfolio: CabinetPortfolio
): Leader | undefined {
    const id = getGovernment(world, factionId)?.cabinet?.[portfolio];
    if (!id) return undefined;
    const leader = world.leadership?.leaders?.get(id);
    return leader?.status === 'active' ? leader : undefined;
}

/** Fill every empty cabinet seat. Idempotent; call at world load. */
export function ensureCabinets(world: GameWorldState): void {
    if (!(world.government instanceof Map)) return;
    let appointed = 0;

    for (const gov of world.government.values()) {
        for (const portfolio of CABINET_PORTFOLIOS) {
            if (getMinister(world, gov.factionId, portfolio)) continue;
            appointMinisterInternal(world, gov, portfolio);
            appointed++;
        }
        gov.cabinetAdvice = generateCabinetAdvice(world, gov.factionId);
    }

    if (appointed > 0) console.log(`[Government] Filled ${appointed} cabinet seat(s).`);
    seatTheCast(world);
}

/** The written cabinet for every claimed empire that has not had its draw (lib/leadership/cast.ts). */
function seatTheCast(world: GameWorldState): void {
    for (const r of drawCastForClaimed(world)) {
        console.log(`[Government] ${r.factionId}: ${r.seated.map(s => `${s.characterId} (${s.portfolio})`).join(', ')} take their seats.`);
        const gov = getGovernment(world, r.factionId);
        if (gov) gov.cabinetAdvice = generateCabinetAdvice(world, r.factionId);
    }
}

/** Fill a vacant chair with the AI's pick (lib/government/human-ministers.ts uses it when a seat is given up). */
export function fillVacantSeat(world: GameWorldState, gov: GovernmentState, portfolio: CabinetPortfolio): Leader {
    return appointMinisterInternal(world, gov, portfolio);
}

/** Seat the best available candidate (or a fresh one) in a portfolio. */
function appointMinisterInternal(
    world: GameWorldState,
    gov: GovernmentState,
    portfolio: CabinetPortfolio
): Leader {
    const pool = world.leadership.recruitmentPool;
    const fit = PORTFOLIO_ROLE_FIT[portfolio] ?? [];

    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
        const candidate = pool[i];
        if (candidate.factionId !== gov.factionId) continue;
        const roleBonus = (fit.indexOf(candidate.role) >= 0 ? 25 - fit.indexOf(candidate.role) * 5 : 0)
            + (fitsSeat(candidate, portfolio) ? 15 : 0);
        const score = (candidate.competence ?? 50) + candidate.loyalty * 0.4 + roleBonus - (candidate.corruption ?? 0) * 0.5;
        if (score > bestScore) { bestScore = score; bestIndex = i; }
    }

    const minister = bestIndex >= 0
        ? pool.splice(bestIndex, 1)[0]
        : generateLeader({
            factionId: gov.factionId,
            role: 'Minister',
            seed: `cabinet-${gov.factionId}-${portfolio}-${world.nowSeconds}`,
            nowSeconds: world.nowSeconds,
            governmentTags: gov.tags,
        });

    minister.role = 'Minister';
    minister.portfolio = portfolio;
    minister.status = 'active';
    minister.history.push({
        timestamp: world.nowSeconds,
        description: `Appointed Minister of ${portfolioLabel(portfolio)}.`,
    });

    world.leadership.leaders.set(minister.id, minister);
    gov.cabinet[portfolio] = minister.id;
    refillRecruitmentPool(world, gov.factionId);

    return minister;
}

export interface CabinetActionResult {
    ok: boolean;
    message?: string;
    leaderId?: string;
}

/**
 * Player-driven appointment: move a leader from the recruitment pool (or an
 * unassigned post) into a cabinet seat. Capital is charged by the caller.
 */
export function appointMinister(
    world: GameWorldState,
    factionId: string,
    portfolio: CabinetPortfolio,
    leaderId: string
): CabinetActionResult {
    const gov = getGovernment(world, factionId);
    if (!gov) return { ok: false, message: 'This faction has no government.' };
    if (!CABINET_PORTFOLIOS.includes(portfolio)) return { ok: false, message: `Unknown portfolio "${portfolio}".` };

    const poolIndex = world.leadership.recruitmentPool.findIndex(l => l.id === leaderId && l.factionId === factionId);
    const candidate = poolIndex >= 0
        ? world.leadership.recruitmentPool[poolIndex]
        : world.leadership.leaders.get(leaderId);

    if (!candidate || candidate.factionId !== factionId) {
        return { ok: false, message: 'That candidate is not available to this government.' };
    }
    if (candidate.status !== 'active') return { ok: false, message: 'That candidate is no longer available.' };
    if (gov.headOfStateId === leaderId) return { ok: false, message: 'The head of state cannot hold a portfolio.' };

    // Vacate whatever they held before, and whoever held this seat.
    const outgoing = getMinister(world, factionId, portfolio);
    if (outgoing && outgoing.id !== leaderId) {
        outgoing.portfolio = undefined;
        outgoing.history.push({ timestamp: world.nowSeconds, description: `Left the ${portfolioLabel(portfolio)} brief.` });
    }
    if (candidate.portfolio && gov.cabinet[candidate.portfolio as CabinetPortfolio] === leaderId) {
        gov.cabinet[candidate.portfolio as CabinetPortfolio] = null;
    }
    if (poolIndex >= 0) world.leadership.recruitmentPool.splice(poolIndex, 1);

    candidate.role = 'Minister';
    candidate.portfolio = portfolio;
    candidate.history.push({ timestamp: world.nowSeconds, description: `Appointed Minister of ${portfolioLabel(portfolio)}.` });
    world.leadership.leaders.set(candidate.id, candidate);
    gov.cabinet[portfolio] = candidate.id;
    gov.history.push({
        timestamp: world.nowSeconds,
        event: `${candidate.name} appointed Minister of ${portfolioLabel(portfolio)}.`,
    });
    refillRecruitmentPool(world, factionId);

    return { ok: true, leaderId: candidate.id };
}

/**
 * Dismiss a sitting minister. The seat refills from the bench immediately —
 * a government cannot simply run without an Economy Ministry.
 */
export function dismissMinister(
    world: GameWorldState,
    factionId: string,
    portfolio: CabinetPortfolio
): CabinetActionResult {
    const gov = getGovernment(world, factionId);
    if (!gov) return { ok: false, message: 'This faction has no government.' };

    const minister = getMinister(world, factionId, portfolio);
    if (!minister) return { ok: false, message: `The ${portfolioLabel(portfolio)} seat is already vacant.` };

    minister.portfolio = undefined;
    minister.loyalty = clamp100(minister.loyalty - 25);
    minister.history.push({ timestamp: world.nowSeconds, description: `Dismissed from the ${portfolioLabel(portfolio)} brief.` });
    gov.cabinet[portfolio] = null;
    gov.history.push({ timestamp: world.nowSeconds, event: `${minister.name} dismissed from ${portfolioLabel(portfolio)}.` });

    const replacement = appointMinisterInternal(world, gov, portfolio);
    return { ok: true, leaderId: replacement.id };
}

/**
 * Cabinet drift: loyalty follows the government's fortunes, corruption creeps
 * where oversight is weak, and ministers who lose faith resign.
 */
export function tickCabinets(world: GameWorldState, deltaSeconds: number): void {
    if (!(world.government instanceof Map)) return;
    const days = deltaSeconds / 86400;
    // A faction claimed since the last tick gets its written people now.
    seatTheCast(world);

    for (const gov of world.government.values()) {
        const intelligence = getMinister(world, gov.factionId, 'intelligence');
        // A working intelligence service is what keeps the others honest.
        const oversight = ((intelligence?.competence ?? 40) - 40) / 100;

        let corruptionSum = 0;
        let seated = 0;

        for (const portfolio of CABINET_PORTFOLIOS) {
            const minister = getMinister(world, gov.factionId, portfolio);
            if (!minister) {
                appointMinisterInternal(world, gov, portfolio);
                continue;
            }
            // A friend in the chair (lib/government/human-ministers.ts): their
            // loyalty and honesty are their own choices, not a drift.
            if (minister.seatId) { seated++; continue; }

            // Loyalty tracks the government's standing; the ambitious sour fastest.
            const drive = (minister.ambitionDrive ?? 50) / 100;
            const standing = (gov.approval - 45) / 45;
            const drift = (standing * (1.5 - drive) * 2) * days;
            // A delegated cabinet is a cabinet that is being ASKED — its own
            // ministers are running the empire. They still sour as standing
            // falls, but not past the point where the Defence Minister starts
            // counting friends in the general staff (Item 2 of the casual-play
            // spec). Take government back and the old slide returns.
            const floor = isDelegated(world as any, gov.factionId, 'government')
                ? DELEGATED_LOYALTY_FLOOR
                : 0;
            minister.loyalty = clamp100(
                drift < 0 ? Math.max(floor, minister.loyalty + drift) : minister.loyalty + drift,
            );

            // Corruption creeps upward unless someone is watching.
            const creep = (drive * 0.6 - oversight * 1.2) * days;
            minister.corruption = clamp100((minister.corruption ?? 0) + creep);

            corruptionSum += minister.corruption;
            seated++;

            if (minister.loyalty <= RESIGNATION_LOYALTY) {
                const rng = new RNG(seedFromString(`${minister.id}|resign|${Math.floor(world.nowSeconds / 3600)}`));
                if (rng.check(0.25 * days)) resignMinister(world, gov, portfolio, minister);
            }
        }

        gov.corruption = seated > 0 ? clamp100(corruptionSum / seated) : gov.corruption;

        // Snapshot the debate so the client can render it without pulling in
        // the fs-backed services this module depends on.
        gov.cabinetAdvice = generateCabinetAdvice(world, gov.factionId);
    }
}

function resignMinister(
    world: GameWorldState,
    gov: GovernmentState,
    portfolio: CabinetPortfolio,
    minister: Leader
): void {
    minister.portfolio = undefined;
    minister.status = 'retired';
    minister.history.push({ timestamp: world.nowSeconds, description: `Resigned as Minister of ${portfolioLabel(portfolio)}.` });
    gov.cabinet[portfolio] = null;
    gov.legitimacy = clamp100(gov.legitimacy - RESIGNATION_LEGITIMACY_COST);
    gov.history.push({
        timestamp: world.nowSeconds,
        event: `${minister.name} resigned as Minister of ${portfolioLabel(portfolio)}.`,
    });

    const replacement = appointMinisterInternal(world, gov, portfolio);

    try {
        fireNotification({
            id: `resign-${gov.factionId}-${portfolio}-${world.nowSeconds}`,
            factionId: gov.factionId,
            category: 'politics',
            priority: 'normal',
            title: 'Cabinet Resignation',
            body: `${minister.name} resigned as Minister of ${portfolioLabel(portfolio)}. ${replacement.name} takes the brief.`,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'government',
            payload: { portfolio },
        });
    } catch { /* notification queue absent in tests */ }
}

export type { CabinetAdvice } from './types';

/**
 * What the cabinet is telling the head of state right now. Pure read over live
 * world state: no storage, no tick, safe to call from the UI path.
 */
export function generateCabinetAdvice(world: GameWorldState, factionId: string): CabinetAdvice[] {
    const gov = getGovernment(world, factionId);
    if (!gov) return [];

    const shared = world.shared;
    // RivalryState has no `atWar` flag — war is escalation 7, and the field
    // names are empireAId/empireBId. The original guess here read undefined and
    // silently made every cabinet talk as if the empire were always at peace.
    const atWar = isFactionAtWar(world, factionId);
    const out: CabinetAdvice[] = [];
    // The week the line rotates on, and who is in a plot (a plotter talks like Brutus whatever the number says).
    const week = Math.floor(Number((world as any).nowSeconds ?? 0) / (7 * 86400));
    const plots: Map<string, any> = (world as any).plots instanceof Map ? (world as any).plots : new Map();
    const plotting = (leaderId: string) => [...plots.values()].some(p => p.factionId === factionId && p.status === 'preparing' && (p.plotterLeaderId === leaderId || p.recruits?.[leaderId] === 'joined'));
    const admin = adminStatus(world.construction?.planets?.values?.() ?? [], factionId);
    const credits = Number((world.economy.factions.get(factionId) as any)?.reserves?.CREDITS ?? 0);

    for (const portfolio of CABINET_PORTFOLIOS) {
        const minister = getMinister(world, factionId, portfolio);
        if (!minister) continue;

        let advice = '';
        let suggestedPolicyId: string | undefined;
        let hook: Hook = 'routine';
        const vars: Record<string, string> = {};

        switch (portfolio) {
            case 'defence':
                if (gov.warFatigue > 60) {
                    advice = 'The fleet has been at readiness too long. Rotate crews or we lose them.';
                    hook = 'peace_proposal';
                } else if (atWar) {
                    advice = 'We are at war and still building at peacetime rates. Mobilise.';
                    suggestedPolicyId = 'war_mobilization';
                    hook = 'idle_war';
                } else {
                    advice = 'Yards are idle. A standing programme now saves us a scramble later.';
                    suggestedPolicyId = 'militarize';
                    hook = 'idle_peace';
                }
                break;
            case 'economy':
                if (admin.over > 0) {
                    advice = 'We govern more systems than the offices can hold. Build administration or stop taking worlds.';
                    hook = 'overextended';
                } else if (credits < 500) {
                    advice = 'The reserve is nearly empty. Nothing new this month.';
                    hook = 'reserves_low';
                } else if (shared.tradeEfficiency < 0.6) {
                    advice = 'Lanes are congested and revenue is falling with them. Open the corridors.';
                    suggestedPolicyId = 'open_trade';
                } else if (gov.corruption > 45) {
                    advice = 'A quarter of every appropriation disappears before it lands. Clean the ministries.';
                    suggestedPolicyId = 'civil_reforms';
                } else {
                    advice = 'Revenue is stable. This is the moment to invest, not to hoard.';
                    suggestedPolicyId = 'expand_frontier';
                }
                break;
            case 'science':
                advice = shared.commodityAccess < 0.5
                    ? 'Shortages are throttling the laboratories before the budget does.'
                    : 'Fund the academies now and we lead the next generation, not chase it.';
                suggestedPolicyId = 'research_push';
                break;
            case 'intelligence':
                if (espionagePressureOn(world, factionId) > 0.4) {
                    advice = 'Foreign networks are operating inside our institutions. I need authority to sweep.';
                    hook = 'networks_inside';
                } else {
                    advice = 'We are quiet, which is exactly when services get cut. Do not cut mine.';
                }
                break;
            case 'interior':
                if (gov.approval < 40) {
                    advice = 'The public has stopped believing us. Give them something material.';
                    suggestedPolicyId = 'welfare_expansion';
                    hook = 'approval_falling';
                } else if ((gov.cohesion ?? 100) < 40) {
                    advice = 'The outer worlds are drifting. Give them a reason to stay before they find one to go.';
                    hook = 'cohesion_falling';
                } else {
                    advice = 'Stability holds. Spend that credit on reform while it is worth something.';
                    suggestedPolicyId = 'civil_reforms';
                }
                break;
            case 'foreign':
                advice = atWar
                    ? 'Every month of this war costs us a friend abroad. Find me terms to offer.'
                    : 'Our word still carries. Treaties signed now cost nothing and buy years.';
                hook = atWar ? 'idle_war' : 'routine';
                break;
        }

        // A minister with a lot to gain gives advice you should weigh carefully.
        const reliability = clamp100(
            (minister.competence ?? 50) - (minister.corruption ?? 0) * 0.5 - Math.max(0, (minister.ambitionDrive ?? 50) - 60) * 0.3
        );

        // The minister says it in their own voice when the sheet has a line for
        // this moment; the plain sentence stays as the fallback.
        const register = registerOf(minister, plotting(minister.id));
        const voiced = ministerLine(portfolio, hook, register, vars, seedOf(factionId, portfolio, hook, week), minister.characterId);

        out.push({
            portfolio,
            portfolioLabel: portfolioLabel(portfolio),
            ministerName: minister.name,
            advice: voiced || advice,
            suggestedPolicyId,
            reliability: Math.round(reliability),
            register,
        });
    }

    return out;
}

/**
 * Continuous effects of the sitting cabinet, in the policy-effect vocabulary
 * plus `research_speed` (consumed by the research step in tick-processor).
 *
 *  economy      → production, tax_income          (and corruption skims tax)
 *  defence      → upkeep
 *  interior     → approval
 *  science      → research_speed
 *  foreign      → legitimacy_drift
 *  intelligence → suppresses corruption growth (see tickCabinets)
 */
export function getCabinetModifiers(world: GameWorldState, factionId: string): Record<string, number> {
    const gov = getGovernment(world, factionId);
    if (!gov) return {};

    const skill = (portfolio: CabinetPortfolio) => {
        const minister = getMinister(world, factionId, portfolio);
        // A minister whose career fits the seat counts SEAT_FIT_BONUS higher
        // (lib/leadership/character.ts): a career diplomat at Foreign Affairs.
        return minister ? (seatSkill(minister, portfolio) - 50) / 100 : 0; // -0.5..+0.6
    };

    // Corruption is a tax on the treasury before anything else touches it.
    const corruptionDrag = (gov.corruption ?? 0) / 100 * 0.25;

    return {
        production: skill('economy') * 0.2,
        tax_income: skill('economy') * 0.2 - corruptionDrag,
        upkeep: -skill('defence') * 0.2,
        approval: skill('interior') * 8,
        legitimacy_drift: skill('foreign') * 0.6,
        research_speed: skill('science') * 0.4,
    };
}
