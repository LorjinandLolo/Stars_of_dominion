// lib/government/plots.ts
// Stars of Dominion — a minister's plot against the ruler.
//
// A friend seated in the cabinet (lib/government/human-ministers.ts) may
// conspire. The loyalty number the court sees on them never moves: whether
// they are Brutus is their own choice, and the game's job is to make that
// choice possible, costly, detectable and consequential.
//
//  - PREPARE: the plotter sounds out one actor a sim day — an AI minister, a
//    governor, an admiral, the officer corps, or a fellow human minister. The
//    disloyal and the corrupt join; the loyal REPORT, and a report lands on
//    the ruler's loyalty desk (gov.loyaltyReports) as the one detection
//    mechanism there is. An actor already inside ANOTHER plot reports the
//    approach to that plot instead — conspirators protect their conspiracy.
//  - GATE: a plot may only STRIKE once the empire is already rotten, by the
//    same measures the AI coup uses (lib/government/coup-service.ts). A good
//    ruler with a treacherous friend survives; a bad ruler with Brutus dies.
//  - STRIKE: lib/government/crisis.ts — the crisis window.
//
// No cap on plots: several ministers may plot the same thing, and the better
// prepared one usually wins. The record rides the faction shard; the sync
// route hands each plotter only their own plot and the ruler none of them
// (lib/persistence/shard-privacy.ts).
//
// No database here. Every mutation is an order (PLOT_* in scripts/game-loop.ts)
// issued through a seat, so the issuer is always a seated minister.

import type { GameWorldState } from '@/lib/game-world-state';
import type { Leader } from '@/lib/leadership/types';
import type { GovernmentState } from './types';
import { getGovernment } from './government-service';
import { getMinister } from './cabinet-service';
import {
    plotActorsView, strikeReadinessView, OFFICERS_ACTOR_ID, SOUND_OUT_EVERY_SECONDS, STRIKE_MIN_RECRUITS, STRIKE_COUP_PRESSURE, STRIKE_LEGITIMACY, STRIKE_COHESION,
    type Plot, type PlotActor, type PlotKind, type ActorKind, type RecruitState, type PlotWarning, type StrikeReadiness, type SeatNote,
} from './plot-view';
import { seatLeaderId, seatsOf } from './human-ministers';
import { RNG } from '@/lib/trade-system/rng';
import { seedFromString } from '@/lib/leadership/leader-generator';
import { fireNotification } from '@/lib/time/notification-hooks';
import { exposeSeat, EXPOSURE_ON_NAMED_REPORT } from './foreign-ministers';

export type { Plot, PlotActor, PlotKind, ActorKind, RecruitState, PlotWarning, StrikeReadiness, SeatNote };
export { OFFICERS_ACTOR_ID, SOUND_OUT_EVERY_SECONDS, STRIKE_MIN_RECRUITS, STRIKE_LEGITIMACY, STRIKE_COHESION };

/** A loyal actor's report, on the ruler's desk. */
export interface LoyaltyReport {
    id: string;
    atSeconds: number;
    reporterName: string;
    text: string;
    /** Named when the reporter could tell who approached them. */
    suspectLeaderId: string | null;
}

/** What a human minister sees of a plot that invited them. */
export interface PlotInvitation {
    plotId: string;
    kind: PlotKind;
    plotterName: string;
    invitedAtSeconds: number;
}

const MAX_WARNINGS = 12;
const MAX_REPORTS = 20;

type WorldLike = GameWorldState & { plots?: Map<string, Plot> };

export function ensurePlots(world: GameWorldState): Map<string, Plot> {
    const w = world as WorldLike;
    if (!(w.plots instanceof Map)) w.plots = new Map(Object.entries(w.plots ?? {}));
    return w.plots;
}

export function plotsOf(world: GameWorldState, factionId: string): Plot[] {
    return [...ensurePlots(world).values()].filter(p => p.factionId === factionId);
}

/** The one preparing plot this seat runs in this faction, if any. */
export function plotBySeat(world: GameWorldState, factionId: string, seatId: string): Plot | undefined {
    return plotsOf(world, factionId).find(p => p.plotterSeatId === seatId && p.status === 'preparing');
}

export function invitationsFor(world: GameWorldState, factionId: string, seatId: string): PlotInvitation[] {
    const me = seatLeaderId(seatId);
    return plotsOf(world, factionId)
        .filter(p => p.status === 'preparing' && p.recruits[me] === 'invited')
        .map(p => ({
            plotId: p.id, kind: p.kind,
            plotterName: world.leadership.leaders.get(p.plotterLeaderId)?.name ?? 'a colleague',
            invitedAtSeconds: p.openedAtSeconds,
        }));
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

// ─── Actors ──────────────────────────────────────────────────────────────────

/** Everyone in the empire a plot could turn, with the plot's books on them (plot-view.ts). */
export function plotActors(world: GameWorldState, factionId: string, plot?: Plot): PlotActor[] {
    return plotActorsView(world as any, factionId, plot);
}

// ─── Starting and ending ─────────────────────────────────────────────────────

export interface PlotResult { ok: boolean; message: string; plot?: Plot }

export function startPlot(world: GameWorldState, factionId: string, seatId: string, kind: PlotKind): PlotResult {
    if (!getGovernment(world, factionId)) return { ok: false, message: 'This faction has no government to plot against.' };
    if (!seatsOf(world, factionId).some(s => s.id === seatId)) return { ok: false, message: 'You hold no seat in this court.' };
    if (plotBySeat(world, factionId, seatId)) return { ok: false, message: 'You already have a plot in hand.' };
    if (kind !== 'coup' && kind !== 'secession') return { ok: false, message: 'Plot what, exactly?' };
    const plot: Plot = {
        id: `plot-${factionId}-${seatId}-${world.nowSeconds}`,
        factionId, plotterSeatId: seatId, plotterLeaderId: seatLeaderId(seatId), kind,
        openedAtSeconds: world.nowSeconds, recruits: {}, lastSoundOutSeconds: -Infinity, warnings: [], status: 'preparing',
    };
    ensurePlots(world).set(plot.id, plot);
    return { ok: true, message: `${kind === 'coup' ? 'The throne' : 'A province'} is on the table. Sound out one person a day.`, plot };
}

export function abandonPlot(world: GameWorldState, factionId: string, seatId: string): PlotResult {
    const plot = plotBySeat(world, factionId, seatId);
    if (!plot) return { ok: false, message: 'You have no plot to abandon.' };
    plot.status = 'spent';
    ensurePlots(world).delete(plot.id);
    return { ok: true, message: 'The plot is burned. Those who joined keep their silence.' };
}

// ─── Sounding out ────────────────────────────────────────────────────────────

/** The chance an AI actor joins, and the chance they report, from what they are. */
export function soundOutOdds(leader: Pick<Leader, 'loyalty' | 'corruption' | 'ambitionDrive'>): { join: number; report: number } {
    const loyalty = leader.loyalty ?? 50;
    const corruption = leader.corruption ?? 0;
    const ambition = leader.ambitionDrive ?? 50;
    const join = clamp01(((60 - loyalty) / 60) * 0.6 + (corruption / 100) * 0.3 + (ambition / 100) * 0.2);
    const report = clamp01(((loyalty - 50) / 50) * 0.7);
    return { join, report };
}

/**
 * One approach. Returns what happened, in the plotter's voice. An approach
 * that is reported reaches the ruler (or a rival plot), never silently.
 */
export function soundOut(world: GameWorldState, factionId: string, seatId: string, actorId: string, rand?: () => number): PlotResult {
    const plot = plotBySeat(world, factionId, seatId);
    if (!plot) return { ok: false, message: 'Start a plot first.' };
    if (world.nowSeconds - plot.lastSoundOutSeconds < SOUND_OUT_EVERY_SECONDS) {
        return { ok: false, message: 'One approach a day. Any more and the corridors talk.' };
    }
    const actor = plotActors(world, factionId, plot).find(a => a.id === actorId);
    if (!actor) return { ok: false, message: 'Nobody by that name is worth approaching.' };
    const prior = plot.recruits[actorId];
    if (prior === 'joined') return { ok: false, message: `${actor.name} is already with you.` };
    if (prior === 'refused' || prior === 'reported' || prior === 'declined') return { ok: false, message: `${actor.name} has already said no.` };
    if (prior === 'invited') return { ok: false, message: `${actor.name} has not answered yet.` };

    plot.lastSoundOutSeconds = world.nowSeconds;

    // A fellow human: the invitation is theirs to answer (PLOT_ANSWER).
    if (actor.kind === 'human') {
        plot.recruits[actorId] = 'invited';
        if (actor.humanSeatId) notifyInvitee(world, factionId, actor.humanSeatId, plot);
        return { ok: true, message: `${actor.name} has your invitation. They will answer in their own time.`, plot };
    }

    const roll = rand ?? (() => new RNG(seedFromString(`${plot.id}|${actorId}|${Math.floor(world.nowSeconds / 3600)}`)).next());

    // Already inside ANOTHER plot: conspirators protect their conspiracy. No
    // dice — they refuse, and the rival plot learns a name; the ruler does not.
    const rival = plotsOf(world, factionId).find(p => p.id !== plot.id && p.status === 'preparing' && p.recruits[actorId] === 'joined');
    if (rival) {
        plot.recruits[actorId] = 'reported';
        pushWarning(rival, world.nowSeconds, `${actor.name} says ${leaderName(world, plot.plotterLeaderId)} is sounding people out too.`);
        return { ok: true, message: `${actor.name} refused — and, you suspect, told somebody. Not the ruler.`, plot };
    }

    let joins: boolean;
    let reports: boolean;
    if (actor.kind === 'officers') {
        const sat = world.movement.empirePostures.get(factionId)?.blocs?.find(b => b.id === 'military')?.satisfaction ?? 60;
        joins = sat < 40;
        reports = !joins && sat > 70;
    } else {
        const leader = world.leadership.leaders.get(actorId)!;
        const odds = soundOutOdds(leader);
        const r = roll();
        joins = r < odds.join;
        reports = !joins && roll() < odds.report;
    }

    if (joins) {
        plot.recruits[actorId] = 'joined';
        return { ok: true, message: `${actor.name} is with you.`, plot };
    }
    if (!reports) {
        plot.recruits[actorId] = 'refused';
        return { ok: true, message: `${actor.name} would rather not have heard that, and says nothing.`, plot };
    }
    plot.recruits[actorId] = 'reported';
    reportToRuler(world, factionId, plot, actor, roll);
    return { ok: true, message: `${actor.name} refused, and will report it. Expect the desk to hear.`, plot };
}

function leaderName(world: GameWorldState, leaderId: string): string {
    return world.leadership.leaders.get(leaderId)?.name ?? 'a minister';
}

function pushWarning(plot: Plot, atSeconds: number, text: string): void {
    plot.warnings.push({ atSeconds, text });
    if (plot.warnings.length > MAX_WARNINGS) plot.warnings.splice(0, plot.warnings.length - MAX_WARNINGS);
}

function reportToRuler(world: GameWorldState, factionId: string, plot: Plot, actor: PlotActor, roll: () => number): void {
    const gov = getGovernment(world, factionId)!;
    const reporter = actor.kind === 'officers' ? null : world.leadership.leaders.get(actor.id);
    // Whether the reporter can NAME the plotter: the loyal and the sharp can.
    const named = roll() < 0.35 + ((reporter?.loyalty ?? 60) - 50) / 200 + ((getMinister(world, factionId, 'intelligence')?.competence ?? 50) - 50) / 200;
    const suspect = named ? plot.plotterLeaderId : null;
    const text = named
        ? `${actor.name} reports that ${leaderName(world, plot.plotterLeaderId)} sounded them out about ${plot.kind === 'coup' ? 'moving against you' : 'taking a province out'}.`
        : `${actor.name} reports being sounded out about ${plot.kind === 'coup' ? 'moving against you' : 'taking a province out'} — by someone in the cabinet, they would not say who.`;
    const report: LoyaltyReport = { id: `loyalty-${factionId}-${world.nowSeconds}-${actor.id}`, atSeconds: world.nowSeconds, reporterName: actor.name, text, suspectLeaderId: suspect };
    // A servant who can name the plotter sometimes knows more than a name:
    // whom the plotter truly serves (lib/government/foreign-ministers.ts).
    if (named && roll() < EXPOSURE_ON_NAMED_REPORT) exposeSeat(world, factionId, plot.plotterSeatId, 'report');
    const list = (gov.loyaltyReports ??= []);
    list.push(report);
    if (list.length > MAX_REPORTS) list.splice(0, list.length - MAX_REPORTS);
    try {
        fireNotification({
            id: report.id, factionId, category: 'politics', priority: 'urgent',
            title: 'A LOYAL SERVANT REPORTS', body: text,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(), read: false, linkToTab: 'government',
        });
    } catch { /* notification queue absent in tests */ }
}

function notifyInvitee(world: GameWorldState, factionId: string, seatId: string, plot: Plot): void {
    try {
        fireNotification({
            id: `plot-invite-${plot.id}-${seatId}`, factionId, category: 'politics', priority: 'urgent',
            title: 'A COLLEAGUE WANTS A WORD', body: `${leaderName(world, plot.plotterLeaderId)} has sounded you out about something that is not in your brief. Answer in the cabinet.`,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(), read: false, linkToTab: 'government',
            // Only the invitee's client should act on it; the ruler's bell
            // sees it too, but nothing it links to names the plot.
            payload: { forSeatId: seatId },
        });
    } catch { /* notification queue absent in tests */ }
}

// ─── A human minister answers ────────────────────────────────────────────────

export type InviteAnswer = 'join' | 'decline' | 'report';

export function answerInvitation(world: GameWorldState, factionId: string, seatId: string, plotId: string, answer: InviteAnswer): PlotResult {
    const plot = ensurePlots(world).get(plotId);
    const me = seatLeaderId(seatId);
    if (!plot || plot.factionId !== factionId || plot.recruits[me] !== 'invited') return { ok: false, message: 'Nobody has asked you anything.' };
    if (answer === 'join') {
        plot.recruits[me] = 'joined';
        return { ok: true, message: 'You are in. Your orders at the strike are theirs.', plot };
    }
    if (answer === 'decline') {
        plot.recruits[me] = 'declined';
        return { ok: true, message: 'You said no, and nothing more.', plot };
    }
    plot.recruits[me] = 'reported';
    const self = world.leadership.leaders.get(me);
    const actor: PlotActor = { id: me, kind: 'human', name: self?.name ?? 'A minister', detail: '' };
    reportToRuler(world, factionId, plot, actor, () => 0); // a human who reports always names the plotter
    return { ok: true, message: 'The ruler will hear of it, with the name attached.', plot };
}

// ─── The gate ────────────────────────────────────────────────────────────────

/** May this plot strike now? (plot-view.ts holds the rule; the worker and the plotter's screen share it.) */
export function strikeReadiness(world: GameWorldState, plot: Plot): StrikeReadiness {
    return strikeReadinessView(getGovernment(world, plot.factionId), plot);
}

/**
 * A private line from the worker to one seat: the result or refusal of a
 * PLOT_* order. Never recordOrderFailure — that rides the economy record
 * every poller of the faction reads, ruler included, and a refusal that
 * says "start a plot first" is a confession. The sync route hands each seat
 * only its own note (lib/persistence/shard-privacy.ts).
 */
export function noteSeat(world: GameWorldState, seatId: string, text: string, ok: boolean): void {
    const w = world as GameWorldState & { seatNotes?: Map<string, SeatNote> };
    if (!(w.seatNotes instanceof Map)) w.seatNotes = new Map(Object.entries(w.seatNotes ?? {}));
    w.seatNotes.set(seatId, { atSeconds: world.nowSeconds, text, ok });
}

export function governmentOf(world: GameWorldState, factionId: string): GovernmentState | undefined {
    return getGovernment(world, factionId);
}

