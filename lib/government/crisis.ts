// lib/government/crisis.ts
// Stars of Dominion — the strike, and the days after it.
//
// A plot that may strike (lib/government/plots.ts strikeReadiness) opens a
// coup crisis (crisis-view.ts holds the shape and the arithmetic). For the
// length of the window both players give orders:
//   ruler   — CRISIS_SECURE (political capital buys an undecided actor),
//             CRISIS_ARREST (capital, a roll; a failed arrest hardens them),
//             CRISIS_FLEE (the throne goes to the fleet: the capital falls,
//             the deadline moves, once);
//   plotter — CRISIS_SECURE (a favour per conspirator buys an undecided
//             actor), CRISIS_SEIZE (the capital, with the larger weight);
//   a human minister who is neither — CRISIS_SIDE.
// Every strategic tick the window is checked: decisive before the deadline,
// else the deadline decides. The world-side consequences happen here; the
// claims (who logs in as what) are the worker's, handed over through
// world.pendingCrisisOutcomes (lib/breakaway/coup-claims.ts).
//
// Absent ruler: the actors start where their loyalty puts them, so a sound
// empire with a ruler away usually holds. That is the design: a good ruler
// with a treacherous friend survives, a bad one does not.

import type { GameWorldState } from '@/lib/game-world-state';
import type { Leader } from '@/lib/leadership/types';
import type { CabinetPortfolio } from './types';
import { CABINET_PORTFOLIOS } from './types';
import { getGovernment, spendPoliticalCapital } from './government-service';
import { getHeadOfState } from './succession-service';
import { fillVacantSeat, getMinister } from './cabinet-service';
import { fissionEmpire } from './civil-war-service';
import { plotBySeat, strikeReadiness, plotActors, ensurePlots, type Plot } from './plots';
import { seatLeaderId, seatsOf } from './human-ministers';
import {
    type CoupCrisis, type CrisisActor, type CrisisOutcome, type CrisisSide,
    CRISIS_WINDOW_SECONDS, FLEE_EXTENSION_SECONDS, SECURE_COST_PC, ARREST_COST_PC, ARREST_CHANCE, ARREST_FAIL_LEGITIMACY, WEIGHT,
    tally, decisiveSide, deadlineOutcome, canSeizeCapital, openCrisisOf,
} from './crisis-view';
import { RNG } from '@/lib/trade-system/rng';
import { seedFromString } from '@/lib/leadership/leader-generator';
import { fireNotification } from '@/lib/time/notification-hooks';
import { pushWorldStory } from '@/lib/press-system/integration';
import * as chronicle from '@/lib/narrative/chronicle';
import { recordPoliticalEvent } from './ideology-drift';

export type { CoupCrisis, CrisisActor, CrisisOutcome, CrisisSide } from './crisis-view';

/** What the worker must do to the claims table once a crisis resolves. */
export interface PendingCrisisOutcome {
    crisisId: string;
    factionId: string;
    outcome: CrisisOutcome;
    plotterSeatId: string;
    /** Seats to delete: exiled plotters, ministers who backed the losing side. */
    removeSeatIds: string[];
    /** plotter_wins: the plotter's account takes the faction; the ruler's account falls. */
    throne?: { factionId: string };
    /** civil_war: the plotter's account takes the new state. */
    rebelFactionId?: string;
}

type CrisisWorld = GameWorldState & { coupCrises?: Map<string, CoupCrisis>; pendingCrisisOutcomes?: PendingCrisisOutcome[] };

export function ensureCrises(world: GameWorldState): Map<string, CoupCrisis> {
    const w = world as CrisisWorld;
    if (!(w.coupCrises instanceof Map)) w.coupCrises = new Map(Object.entries(w.coupCrises ?? {}));
    return w.coupCrises;
}

export function openCrisis(world: GameWorldState, factionId: string): CoupCrisis | undefined {
    return openCrisisOf(ensureCrises(world).values(), factionId);
}

export interface CrisisResult { ok: boolean; message: string; crisis?: CoupCrisis }

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

function log(crisis: CoupCrisis, world: GameWorldState, text: string): void {
    crisis.log.push({ atSeconds: world.nowSeconds, text });
    if (crisis.log.length > 40) crisis.log.splice(0, crisis.log.length - 40);
}

function notifyBoth(world: GameWorldState, crisis: CoupCrisis, title: string, body: string, priority: 'urgent' | 'normal' = 'urgent'): void {
    try {
        fireNotification({
            id: `crisis-${crisis.id}-${world.nowSeconds}-${title.length}`,
            factionId: crisis.factionId, category: 'politics', priority, title, body,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(), read: false, linkToTab: 'government',
            payload: { crisisId: crisis.id },
        });
    } catch { /* notification queue absent in tests */ }
}

// ─── The strike ──────────────────────────────────────────────────────────────

/** Where an actor stands when the plot strikes. */
function startingSide(world: GameWorldState, factionId: string, plot: Plot, actorId: string, kind: CrisisActor['kind']): CrisisSide {
    if (plot.recruits[actorId] === 'joined') return 'plotter';
    if (kind === 'officers') {
        const sat = world.movement.empirePostures.get(factionId)?.blocs?.find(b => b.id === 'military')?.satisfaction ?? 60;
        return sat < 40 ? 'plotter' : sat > 60 ? 'ruler' : 'undecided';
    }
    if (kind === 'human') return 'undecided';
    const loyalty = world.leadership.leaders.get(actorId)?.loyalty ?? 50;
    return loyalty < 40 ? 'plotter' : loyalty > 60 ? 'ruler' : 'undecided';
}

export function strikePlot(world: GameWorldState, factionId: string, seatId: string): CrisisResult {
    const plot = plotBySeat(world, factionId, seatId);
    if (!plot) return { ok: false, message: 'You have no plot to strike with.' };
    if (openCrisis(world, factionId)) return { ok: false, message: 'The court is already in crisis. Pick a side in it.' };
    const ready = strikeReadiness(world, plot);
    if (!ready.ok) return { ok: false, message: ready.reasons.join(' ') };
    const gov = getGovernment(world, factionId);
    if (!gov) return { ok: false, message: 'No government to strike at.' };

    const plotterName = world.leadership.leaders.get(plot.plotterLeaderId)?.name ?? 'a minister';
    const rulerName = getHeadOfState(world, factionId)?.name ?? 'the head of state';
    const actors: CrisisActor[] = plotActors(world, factionId, plot).map(a => {
        const kind = a.kind;
        const holds = kind === 'governor' ? a.detail.replace(/^Governor of /, '') : kind === 'admiral' ? a.detail.replace(/^commands /, '') : undefined;
        return { id: a.id, name: a.name, kind, weight: WEIGHT[kind], side: startingSide(world, factionId, plot, a.id, kind), holds, humanSeatId: a.humanSeatId };
    });
    const favours = Object.values(plot.recruits).filter(s => s === 'joined').length;
    const crisis: CoupCrisis = {
        id: `crisis-${factionId}-${world.nowSeconds}`,
        factionId, plotId: plot.id, plotterSeatId: seatId, plotterLeaderId: plot.plotterLeaderId, plotterName, rulerName,
        openedAtSeconds: world.nowSeconds, deadlineSeconds: world.nowSeconds + CRISIS_WINDOW_SECONDS,
        actors, capitalHeldBy: 'ruler', rulerFled: false, favours, log: [], status: 'open',
    };
    ensureCrises(world).set(crisis.id, crisis);
    plot.status = 'struck';
    const t = tally(crisis);
    log(crisis, world, `${plotterName} moved against ${rulerName}. ${t.plotter} weight with the plotter, ${t.ruler} with the ruler, ${t.undecided} undecided.`);
    notifyBoth(world, crisis, 'THE CABINET HAS MOVED AGAINST YOU', `${plotterName} has struck for the throne. You have ${Math.round(CRISIS_WINDOW_SECONDS / 86400)} days to hold the state together: secure the undecided, arrest the disloyal, or take the throne to the fleet.`);
    try { pushWorldStory(world, { targetEmpireId: factionId, subject: `${plotterName} moves against ${rulerName}`, magnitude: 90 }); } catch { /* press absent */ }
    chronicle.record(world, {
        type: 'coup_attempted', actorIds: [factionId], targetIds: [],
        facts: { plotter: plotterName, deposedLeader: rulerName, cause: 'cabinet_plot', succeeded: false, inProgress: true },
    });
    return { ok: true, message: `You have struck. ${t.plotter} weight is yours, ${t.ruler} theirs, ${t.undecided} undecided. ${favours} favour(s) to spend.`, crisis };
}

// ─── The verbs ───────────────────────────────────────────────────────────────

export type CrisisRole = 'ruler' | 'plotter';

function roleGuard(crisis: CoupCrisis, role: CrisisRole, seatId?: string): string | null {
    if (crisis.status !== 'open') return 'That crisis is over.';
    if (role === 'plotter' && seatId !== crisis.plotterSeatId) return 'That is not your plot.';
    return null;
}

export function secureActor(world: GameWorldState, crisis: CoupCrisis, role: CrisisRole, actorId: string, seatId?: string): CrisisResult {
    const bad = roleGuard(crisis, role, seatId);
    if (bad) return { ok: false, message: bad };
    const actor = crisis.actors.find(a => a.id === actorId);
    if (!actor) return { ok: false, message: 'Nobody by that name is in the balance.' };
    if (actor.locked) return { ok: false, message: `${actor.name} has been settled already.` };
    if (actor.side !== 'undecided') return { ok: false, message: `${actor.name} has already chosen.` };
    if (actor.kind === 'human') return { ok: false, message: `${actor.name} is a player and will choose for themselves.` };
    if (role === 'ruler') {
        if (!spendPoliticalCapital(world, crisis.factionId, SECURE_COST_PC, 'crisis: securing an actor')) {
            return { ok: false, message: `Securing ${actor.name} needs ${SECURE_COST_PC} political capital.` };
        }
    } else {
        if (crisis.favours <= 0) return { ok: false, message: 'You have no favours left to call in.' };
        crisis.favours -= 1;
    }
    actor.side = role;
    actor.locked = true;
    log(crisis, world, `${actor.name} declared for the ${role === 'ruler' ? 'throne' : 'plot'}.`);
    return { ok: true, message: `${actor.name} is with you.`, crisis };
}

export function arrestActor(world: GameWorldState, crisis: CoupCrisis, actorId: string, rand?: () => number): CrisisResult {
    const bad = roleGuard(crisis, 'ruler');
    if (bad) return { ok: false, message: bad };
    const actor = crisis.actors.find(a => a.id === actorId);
    if (!actor) return { ok: false, message: 'Nobody by that name is in the balance.' };
    if (actor.locked) return { ok: false, message: `${actor.name} has been settled already.` };
    if (actor.side !== 'plotter') return { ok: false, message: `${actor.name} has not declared against you.` };
    if (actor.kind === 'officers') return { ok: false, message: 'You cannot arrest the officer corps. Purge it, if you dare.' };
    if (actor.kind === 'human' || actor.id === crisis.plotterLeaderId) return { ok: false, message: `${actor.name} is a player; settle it at the deadline.` };
    if (!spendPoliticalCapital(world, crisis.factionId, ARREST_COST_PC, 'crisis: an arrest')) {
        return { ok: false, message: `An arrest needs ${ARREST_COST_PC} political capital.` };
    }
    const roll = rand ?? (() => new RNG(seedFromString(`${crisis.id}|arrest|${actorId}|${world.nowSeconds}`)).next());
    if (roll() < ARREST_CHANCE) {
        actor.weight = 0;
        actor.locked = true;
        actor.side = 'ruler';
        const leader = world.leadership.leaders.get(actorId);
        if (leader) { leader.loyalty = 0; leader.history.push({ timestamp: world.nowSeconds, description: 'Arrested during the crisis.' }); }
        log(crisis, world, `${actor.name} was arrested.`);
        return { ok: true, message: `${actor.name} is in a cell.`, crisis };
    }
    const gov = getGovernment(world, crisis.factionId);
    if (gov) gov.legitimacy = clamp100(gov.legitimacy - ARREST_FAIL_LEGITIMACY);
    actor.locked = true;
    log(crisis, world, `The arrest of ${actor.name} failed; they are beyond reach now.`);
    return { ok: true, message: `${actor.name} slipped the net, and the court saw it.`, crisis };
}

export function seizeCapital(world: GameWorldState, crisis: CoupCrisis, seatId: string): CrisisResult {
    const bad = roleGuard(crisis, 'plotter', seatId);
    if (bad) return { ok: false, message: bad };
    if (crisis.capitalHeldBy === 'plotter') return { ok: false, message: 'The capital is already yours.' };
    if (!canSeizeCapital(crisis)) return { ok: false, message: 'You do not have the weight to take the capital yet.' };
    crisis.capitalHeldBy = 'plotter';
    log(crisis, world, `${crisis.plotterName} seized the capital.`);
    notifyBoth(world, crisis, 'THE CAPITAL HAS FALLEN TO THE PLOT', `${crisis.plotterName} holds the palace. Rally more of the state or the throne is lost at the deadline.`);
    return { ok: true, message: 'The palace is yours. Hold it.', crisis };
}

export function fleeToFleet(world: GameWorldState, crisis: CoupCrisis): CrisisResult {
    const bad = roleGuard(crisis, 'ruler');
    if (bad) return { ok: false, message: bad };
    if (crisis.rulerFled) return { ok: false, message: 'You have fled once already.' };
    crisis.rulerFled = true;
    crisis.capitalHeldBy = 'plotter';
    crisis.deadlineSeconds += FLEE_EXTENSION_SECONDS;
    log(crisis, world, `${crisis.rulerName} took the throne to the fleet. The capital is the plotter's; the window is longer.`);
    return { ok: true, message: 'You are with the fleet. Two more days, and the capital is theirs until you take it back at the deadline.', crisis };
}

export function chooseSide(world: GameWorldState, crisis: CoupCrisis, seatId: string, side: CrisisSide): CrisisResult {
    if (crisis.status !== 'open') return { ok: false, message: 'That crisis is over.' };
    if (seatId === crisis.plotterSeatId) return { ok: false, message: 'You are the plot.' };
    const actor = crisis.actors.find(a => a.humanSeatId === seatId);
    if (!actor) return { ok: false, message: 'You are not in the balance.' };
    if (side !== 'ruler' && side !== 'plotter') return { ok: false, message: 'Choose a side.' };
    actor.side = side;
    actor.locked = true;
    log(crisis, world, `${actor.name} declared for the ${side === 'ruler' ? 'throne' : 'plot'}.`);
    return { ok: true, message: `You stand with the ${side === 'ruler' ? 'throne' : 'plot'}.`, crisis };
}

// ─── Resolution ──────────────────────────────────────────────────────────────

/** Every strategic tick. Returns the crises resolved this tick. */
export function tickCoupCrises(world: GameWorldState): CoupCrisis[] {
    const out: CoupCrisis[] = [];
    for (const crisis of ensureCrises(world).values()) {
        if (crisis.status !== 'open') continue;
        const decisive = decisiveSide(crisis);
        if (decisive) { resolveCrisis(world, crisis, decisive === 'ruler' ? 'ruler_holds' : 'plotter_wins'); out.push(crisis); continue; }
        if (world.nowSeconds >= crisis.deadlineSeconds) { resolveCrisis(world, crisis, deadlineOutcome(crisis)); out.push(crisis); }
    }
    return out;
}

export function resolveCrisis(world: GameWorldState, crisis: CoupCrisis, outcome: CrisisOutcome): PendingCrisisOutcome {
    const w = world as CrisisWorld;
    const gov = getGovernment(world, crisis.factionId)!;
    const plot = ensurePlots(world).get(crisis.plotId);
    if (plot) plot.status = 'spent';
    ensurePlots(world).delete(crisis.plotId);

    let effective = outcome;
    let pending: PendingCrisisOutcome;
    if (effective === 'civil_war') {
        const split = splitEmpire(world, crisis);
        if (!split) effective = 'ruler_holds';
        else pending = { crisisId: crisis.id, factionId: crisis.factionId, outcome: 'civil_war', plotterSeatId: crisis.plotterSeatId, removeSeatIds: [crisis.plotterSeatId, ...humanSeatsOn(crisis, 'plotter')], rebelFactionId: split };
    }
    if (effective === 'ruler_holds') pending = rulerHolds(world, crisis, gov);
    else if (effective === 'plotter_wins') pending = plotterWins(world, crisis, gov);

    crisis.status = 'resolved';
    crisis.outcome = effective;
    crisis.resolvedAtSeconds = world.nowSeconds;
    (w.pendingCrisisOutcomes ??= []).push(pending!);
    return pending!;
}

function humanSeatsOn(crisis: CoupCrisis, side: CrisisSide): string[] {
    return crisis.actors.filter(a => a.kind === 'human' && a.humanSeatId && a.side === side).map(a => a.humanSeatId!);
}

function rulerHolds(world: GameWorldState, crisis: CoupCrisis, gov: ReturnType<typeof getGovernment> & object): PendingCrisisOutcome {
    const factionId = crisis.factionId;
    // The plotter leaves office; their network is purged.
    const plotter = world.leadership.leaders.get(crisis.plotterLeaderId);
    if (plotter) {
        plotter.status = 'retired';
        plotter.portfolio = undefined;
        plotter.history.push({ timestamp: world.nowSeconds, description: 'Exiled after a failed coup.' });
        for (const p of CABINET_PORTFOLIOS) if (gov.cabinet[p] === plotter.id) { gov.cabinet[p] = null; fillVacantSeat(world, gov, p); }
    }
    for (const actor of crisis.actors) {
        if (actor.side !== 'plotter') continue;
        if (actor.kind === 'officers') {
            const military = world.movement.empirePostures.get(factionId)?.blocs?.find(b => b.id === 'military');
            if (military) military.satisfaction = clamp100(military.satisfaction - 15);
            continue;
        }
        const leader = world.leadership.leaders.get(actor.id);
        if (!leader || leader.seatId) continue;
        leader.loyalty = clamp100(leader.loyalty - 30);
        if (leader.portfolio) {
            const p = leader.portfolio as CabinetPortfolio;
            if (gov.cabinet[p] === leader.id) { gov.cabinet[p] = null; leader.portfolio = undefined; leader.status = 'retired'; fillVacantSeat(world, gov, p); }
        }
    }
    gov.legitimacy = clamp100(gov.legitimacy + 5);
    gov.coupPressure = 30;
    gov.history.push({ timestamp: world.nowSeconds, event: `${crisis.plotterName}'s coup was put down.` });
    log(crisis, world, `The throne held. ${crisis.plotterName} is exiled.`);
    notifyBoth(world, crisis, 'THE PLOT IS BROKEN', `${crisis.plotterName} is exiled and their people purged. The state stands.`);
    try { pushWorldStory(world, { targetEmpireId: factionId, subject: `Coup by ${crisis.plotterName} put down`, magnitude: 85 }); } catch { /* press absent */ }
    chronicle.record(world, { type: 'coup_attempted', actorIds: [factionId], targetIds: [], facts: { plotter: crisis.plotterName, succeeded: false, cause: 'cabinet_plot' } });
    return { crisisId: crisis.id, factionId, outcome: 'ruler_holds', plotterSeatId: crisis.plotterSeatId, removeSeatIds: [crisis.plotterSeatId, ...humanSeatsOn(crisis, 'plotter')] };
}

function plotterWins(world: GameWorldState, crisis: CoupCrisis, gov: ReturnType<typeof getGovernment> & object): PendingCrisisOutcome {
    const factionId = crisis.factionId;
    const outgoing = getHeadOfState(world, factionId);
    if (outgoing && outgoing.status === 'active') {
        outgoing.status = 'retired';
        outgoing.leftOfficeAtSeconds = world.nowSeconds;
        outgoing.departureCause = 'overthrown';
        outgoing.history.push({ timestamp: world.nowSeconds, description: `Deposed by ${crisis.plotterName}.` });
    }
    const plotter = world.leadership.leaders.get(crisis.plotterLeaderId) as Leader | undefined;
    if (plotter) {
        for (const p of CABINET_PORTFOLIOS) if (gov.cabinet[p] === plotter.id) gov.cabinet[p] = null;
        plotter.role = 'HeadOfState';
        plotter.portfolio = undefined;
        plotter.seatId = undefined; // the throne is not a seat
        plotter.loyalty = 100;
        plotter.title = 'Protector';
        plotter.tookOfficeAtSeconds = world.nowSeconds;
        plotter.history.push({ timestamp: world.nowSeconds, description: `Took the throne from ${crisis.rulerName}.` });
        gov.headOfStateId = plotter.id;
    }
    // The old regime's ministers go; the plot's people keep their chairs.
    for (const actor of crisis.actors) {
        if (actor.side !== 'ruler' || actor.kind === 'officers') continue;
        const leader = world.leadership.leaders.get(actor.id);
        if (!leader || leader.seatId) continue;
        if (leader.portfolio) {
            const p = leader.portfolio as CabinetPortfolio;
            if (gov.cabinet[p] === leader.id) { gov.cabinet[p] = null; leader.portfolio = undefined; leader.status = 'retired'; }
        }
    }
    for (const p of CABINET_PORTFOLIOS) if (!getMinister(world, factionId, p)) fillVacantSeat(world, gov, p);
    gov.legitimacy = 35;
    gov.politicalCapital = 0;
    gov.coupPressure = 20;
    gov.termEndsAtSeconds = undefined;
    for (const bill of gov.bills) if (bill.status === 'pending') bill.status = 'failed';
    recordPoliticalEvent(world, factionId, 'coup_succeeded', 3);
    gov.history.push({ timestamp: world.nowSeconds, event: `${crisis.plotterName} took the throne from ${crisis.rulerName}.` });
    log(crisis, world, `${crisis.plotterName} took the throne.`);
    notifyBoth(world, crisis, 'THE THRONE HAS CHANGED HANDS', `${crisis.plotterName} rules. ${crisis.rulerName} is deposed.`);
    try { pushWorldStory(world, { targetEmpireId: factionId, subject: `${crisis.plotterName} takes the throne from ${crisis.rulerName}`, magnitude: 100 }); } catch { /* press absent */ }
    chronicle.record(world, { type: 'government_changed', actorIds: [factionId], targetIds: [], facts: { plotter: crisis.plotterName, deposedLeader: crisis.rulerName, succeeded: true, cause: 'cabinet_plot' } });
    return { crisisId: crisis.id, factionId, outcome: 'plotter_wins', plotterSeatId: crisis.plotterSeatId, removeSeatIds: [crisis.plotterSeatId, ...humanSeatsOn(crisis, 'ruler')], throne: { factionId } };
}

/**
 * Stalemate: the worlds whose governors stood with the plot break away under
 * the plotter (lib/government/civil-war-service.ts does the surgery). Null
 * when no governor did — then there is nothing to split and the throne holds.
 */
function splitEmpire(world: GameWorldState, crisis: CoupCrisis): string | null {
    const factionId = crisis.factionId;
    const planetIds: string[] = [];
    for (const actor of crisis.actors) {
        if (actor.kind !== 'governor' || actor.side !== 'plotter') continue;
        for (const planet of world.construction.planets.values() as Iterable<any>) {
            if (planet.ownerId === factionId && planet.governorId === actor.id && planet.planetType !== 'capital') planetIds.push(planet.id);
        }
    }
    if (planetIds.length === 0) return null;
    const systemIds = [...new Set(planetIds.map(id => (world.construction.planets.get(id) as any)?.systemId).filter(Boolean))] as string[];
    const rebelId = `rebel-${factionId.replace(/^faction-/, '')}-${world.nowSeconds}`;
    const crisisId = `secession-${crisis.id}`;
    if (!(world.secessionCrises instanceof Map)) world.secessionCrises = new Map();
    world.secessionCrises.set(crisisId, {
        id: crisisId, factionId, name: `${crisis.plotterName}'s Rising`, planetIds, systemIds,
        leaderId: crisis.plotterLeaderId, leaderName: crisis.plotterName,
        openedAtSeconds: crisis.openedAtSeconds, deadlineSeconds: world.nowSeconds,
        independenceSupport: 60, governorLoyalty: 30, militaryLoyalty: 40,
        demands: [], granted: [], causes: ['coup'], status: 'escalated', escalatedAtSeconds: world.nowSeconds, rebelFactionId: rebelId,
    } as any);
    const plotter = world.leadership.leaders.get(crisis.plotterLeaderId);
    if (plotter) plotter.seatId = undefined; // a head of state, not a seat, from here
    const split = fissionEmpire(world, crisisId);
    if (!split.ok) { world.secessionCrises.delete(crisisId); return null; }
    const gov = getGovernment(world, factionId);
    if (gov) {
        for (const p of CABINET_PORTFOLIOS) if (gov.cabinet[p] === crisis.plotterLeaderId) { gov.cabinet[p] = null; fillVacantSeat(world, gov, p); }
        gov.coupPressure = 30;
    }
    log(crisis, world, `Neither side could end it. ${split.rebelName} broke away under ${crisis.plotterName} with ${split.planetsTaken} world(s).`);
    notifyBoth(world, crisis, 'THE EMPIRE HAS SPLIT', `${crisis.plotterName} could not take the throne and would not give up: ${split.rebelName} is a state now, and at war with you.`);
    return rebelId;
}

/** For the panel: which seat (if any) a leader id belongs to. */
export function seatOfLeader(world: GameWorldState, factionId: string, leaderId: string): string | undefined {
    return seatsOf(world, factionId).find(s => seatLeaderId(s.id) === leaderId)?.id;
}
