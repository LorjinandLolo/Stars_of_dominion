// lib/brief/daily-brief.ts
// Stars of Dominion — the daily brief projection.
//
// One pure function. It takes what the caller has already read (the world, the
// faction's own shard, its chronicle rows, the published headlines, the notes
// the worker left, and when this player last closed a brief) and returns the
// brief as plain data. It reads nothing, writes nothing and imports no `lib/db`
// — app/api/game/brief does the reading, tmp/test-daily-brief.ts drives it over
// a synthetic world.
//
// Attribution is respected here, not at the UI: a chronicle event the player
// was merely the TARGET of only names the other side when the galaxy knows who
// it was. The brief must not become the one screen that leaks a covert actor.

import { TICK_INTERVAL_HOURS, SIM_SECONDS_PER_REAL_SECOND } from '@/lib/time/time-config';
import type { GameNotification } from '@/lib/time/time-types';
import { formatRealDeadline } from '@/lib/time/galactic-time';
import { ROGUE_GRACE_SECONDS } from '@/lib/economy/corporate/charter-service';
import { currentGoal } from '@/lib/goals/first-week-goals';
import { empireWithPlayer, type HumanPlayers } from '@/lib/players/player-label';
import type {
    BriefAction,
    BriefDeadline,
    BriefDecision,
    BriefLine,
    BriefMessage,
    BriefSuggestion,
    DailyBrief,
} from './brief-types';

export type { DailyBrief } from './brief-types';

/** A chronicle row as the DB stores it: JSON-bearing columns are strings. */
export interface BriefChronicleRow {
    id: string;
    type: string;
    day: number;
    tick: number;
    importance: number;
    actorIds: string;
    targetIds: string;
    actorNames: string;
    targetNames: string;
    location?: string | null;
    facts: string;
    attribution: string;
    createdAt: Date | string;
}

/** A published headline — already public, so no filtering applies. */
export interface BriefHeadlineRow {
    id: string;
    headline: string;
    day: number;
    createdAt: Date | string;
    /** Chronicle event ids this article covers, JSON array, when known. */
    eventIds?: string | null;
}

export interface BriefInput {
    factionId: string;
    /** The live world. Only read from; never mutated. */
    world: any;
    /** The faction's own economy record (from its shard). */
    faction?: any;
    notifications?: GameNotification[];
    chronicle?: BriefChronicleRow[];
    headlines?: BriefHeadlineRow[];
    /** When this player last closed a brief. Null on their first. */
    lastSeenAt?: Date | string | null;
    /** factionId → claimant display name, for "played by" (Item 6b). Absent = AI. */
    players?: HumanPlayers;
    /** Real clock. Injected so tests are not wall-clock dependent. */
    now?: Date;
}

const MAX_HAPPENED = 5;
/** A player who has never seen a brief gets the last day, not the whole season. */
const DEFAULT_WINDOW_MS = 24 * 3600 * 1000;

// ─── Public entry point ───────────────────────────────────────────────────────

export function buildDailyBrief(input: BriefInput): DailyBrief {
    const now = toDate(input.now) ?? new Date();
    const nowSeconds: number = Number(input.world?.nowSeconds ?? 0);
    const lastSeen = toDate(input.lastSeenAt);
    const since = lastSeen ?? new Date(now.getTime() - DEFAULT_WINDOW_MS);

    const messages = collectMessages(input, since, now);
    const happened = collectHappened(input, since, now);
    const decisions = collectDecisions(input, nowSeconds, now);
    const suggestion = pickSuggestion(input);

    return {
        factionId: input.factionId,
        generatedAt: now.toISOString(),
        nowSeconds,
        since: lastSeen ? lastSeen.toISOString() : null,
        messages,
        happened,
        decisions,
        suggestion,
        nextTickInSeconds: realSecondsToNextTick(nowSeconds),
        empty: messages.length === 0 && happened.length === 0 && decisions.length === 0,
    };
}

// ─── Messages from other players ──────────────────────────────────────────────

const MAX_MESSAGE_SENDERS = 5;

/**
 * What other players wrote to this empire since the last brief: one entry per
 * sender — their latest message and a count of the ones before it — newest
 * first. A conversation is as long as it needs to be; the brief says who wrote
 * and what they said last, and DIPLOMACY holds the thread. Read from the
 * faction's own shard (`world.empireMessages`, which the worker fills from the
 * EmpireMessage table).
 */
export function collectMessages(input: BriefInput, since: Date, now: Date): BriefMessage[] {
    const own = input.world?.empireMessages?.get?.(input.factionId)
        ?? input.world?.empireMessages?.[input.factionId]
        ?? [];
    const latestBySender = new Map<string, BriefMessage>();
    for (const message of Array.isArray(own) ? own : []) {
        if (message?.toFactionId !== input.factionId) continue;
        const at = toDate(message.sentAt);
        if (!at || at < since || at > now) continue;
        const sender = String(message.fromFactionId);
        const seen = latestBySender.get(sender);
        const entry: BriefMessage = {
            id: String(message.id),
            fromFactionId: sender,
            from: counterpart(input, sender),
            body: String(message.body ?? ''),
            at: at.toISOString(),
            earlier: seen ? seen.earlier + 1 : 0,
        };
        if (!seen || Date.parse(entry.at) >= Date.parse(seen.at)) latestBySender.set(sender, entry);
        else latestBySender.set(sender, { ...seen, earlier: seen.earlier + 1 });
    }
    return [...latestBySender.values()]
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, MAX_MESSAGE_SENDERS);
}

// ─── What happened ────────────────────────────────────────────────────────────

/**
 * At most five lines, newest first. A narrated headline beats the raw event it
 * covers — when the narrator has done its work the player reads the galaxy's
 * version of the story, not the simulation's.
 */
export function collectHappened(input: BriefInput, since: Date, now: Date): BriefLine[] {
    const lines: BriefLine[] = [];
    const coveredEventIds = new Set<string>();

    // An article only belongs in THIS faction's brief if it covers an event this
    // faction was part of — the caller hands over the rows, the intersection
    // decides. Without it the brief becomes a galaxy-wide news ticker.
    const ownEventIds = new Set((input.chronicle ?? []).map(row => row.id));

    for (const article of input.headlines ?? []) {
        const at = toDate(article.createdAt);
        if (!at || at < since || at > now) continue;
        const ids = parseJsonArray(article.eventIds).map(String);
        if (!ids.some(id => ownEventIds.has(id))) continue;
        for (const id of ids) coveredEventIds.add(id);
        lines.push({
            id: `headline-${article.id}`,
            text: article.headline,
            at: at.toISOString(),
            source: 'headline',
        });
    }

    for (const row of input.chronicle ?? []) {
        const at = toDate(row.createdAt);
        if (!at || at < since || at > now) continue;
        if (coveredEventIds.has(row.id)) continue;
        const text = describeChronicleRow(row, input.factionId);
        if (!text) continue;
        lines.push({
            id: `event-${row.id}`,
            text,
            at: at.toISOString(),
            source: 'chronicle',
            urgent: row.importance >= 25,
        });
    }

    for (const note of input.notifications ?? []) {
        const at = toDate(note.createdAt);
        if (!at || at < since || at > now) continue;
        lines.push({
            id: `note-${note.id}`,
            text: note.body ? `${note.title}: ${note.body}` : note.title,
            at: at.toISOString(),
            source: 'notification',
            urgent: note.priority === 'urgent',
        });
    }

    lines.sort((a, b) => {
        if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
        return Date.parse(b.at) - Date.parse(a.at);
    });

    // Five identical lines is one line. Repeats are how a busy tick reads when
    // the same thing happened three times, and they crowd out everything else.
    const seen = new Set<string>();
    const unique: BriefLine[] = [];
    for (const line of lines) {
        if (seen.has(line.text)) continue;
        seen.add(line.text);
        unique.push(line);
        if (unique.length >= MAX_HAPPENED) break;
    }
    return unique;
}

/**
 * One sentence for a chronicle row. Returns null when the row says nothing this
 * faction may be told.
 */
export function describeChronicleRow(row: BriefChronicleRow, factionId: string): string | null {
    const actorIds = parseJsonArray(row.actorIds).map(String);
    const targetIds = parseJsonArray(row.targetIds).map(String);
    const actorNames = parseJsonArray(row.actorNames).map(String);
    const targetNames = parseJsonArray(row.targetNames).map(String);

    const isActor = actorIds.includes(factionId);
    const isTarget = targetIds.includes(factionId);
    if (!isActor && !isTarget) return null;

    // The player knows what they themselves did. Everyone else is subject to the
    // public attribution ceiling: the victim of a covert act learns the act, not
    // the hand behind it.
    const mayNameActor = isActor || row.attribution === 'exposed';
    const actor = mayNameActor ? (actorNames[0] || actorIds[0] || 'Someone') : 'An unknown hand';
    const target = targetNames[0] || targetIds[0] || 'a rival';
    const where = row.location ? ` at ${row.location}` : '';
    const facts = parseJsonObject(row.facts);

    switch (row.type) {
        case 'war_declared': return `${actor} declared war on ${target}.`;
        case 'war_ended': return `The war between ${actor} and ${target} ended.`;
        case 'battle_resolved': return `A battle${where} between ${actor} and ${target} was decided.`;
        case 'system_captured': return `${actor} took ${facts.systemName ?? (where.trim() || 'a system')} from ${target}.`;
        case 'capital_captured': return `${actor} took the capital of ${target}.`;
        case 'siege_started': return `${actor} laid siege${where}.`;
        case 'planet_bombarded': return `${actor} bombarded ${facts.planetName ?? 'a world'}${where}.`;
        case 'fleet_destroyed': return `A fleet was destroyed${where}.`;
        case 'treaty_signed': return `${actor} and ${target} signed a treaty.`;
        case 'treaty_broken': return `${actor} broke a treaty with ${target}.`;
        case 'alliance_formed': return `${actor} and ${target} formed an alliance.`;
        case 'alliance_dissolved': return `The alliance between ${actor} and ${target} dissolved.`;
        case 'tribute_imposed': return `${actor} imposed tribute on ${target}.`;
        case 'council_vote': return `A council vote was held.`;
        case 'operation_resolved': return `A covert operation against ${target} ran its course.`;
        case 'operation_exposed': return `A covert operation was exposed — ${actor} was named.`;
        case 'agent_captured': return `An agent was captured${where}.`;
        case 'investigation_published': return `The press published an investigation into ${target}.`;
        case 'scandal_confirmed': return `A scandal around ${target} was confirmed.`;
        case 'leader_rose': return `${facts.leaderName ?? 'A new leader'} took office in ${actor}.`;
        case 'leader_died': return `${facts.leaderName ?? 'A leader'} of ${actor} died.`;
        case 'coup_attempted': return `A coup was attempted in ${actor}.`;
        case 'government_changed': return `${actor} changed government.`;
        case 'secession_declared': return `${target} declared independence from ${actor}.`;
        case 'breakaway_claimed': return `${actor} has a new leader.`;
        case 'rebel_act': return `${facts.cellName ?? 'A rebel cell'} struck on ${facts.planetName ?? 'a world'} of ${target}.`;
        case 'crackdown': return `${actor} cracked down on ${facts.planetName ?? 'one of its worlds'}.`;
        case 'rebel_killed': return `A rebel was killed on ${facts.planetName ?? 'a world'} of ${target}.`;
        case 'sanctuary': return facts.phase === 'handed_over' ? `${actor} handed ${facts.exileName ?? 'a government in exile'} over to ${target}.`
            : facts.phase === 'refused' ? `${actor} refused to hand ${facts.exileName ?? 'a government in exile'} over to ${target}.`
            : facts.phase === 'exposed' ? `${actor} was found to be secretly sheltering ${facts.exileName ?? 'a government in exile'}.`
            : `${actor} gave sanctuary to ${facts.exileName ?? 'a government in exile'}.`;
        case 'enlightenment_transcending': return `${actor} has begun to transcend.`;
        case 'enlightenment_interrupted': return `${actor}'s Transcendence failed.`;
        case 'enlightenment_achieved': return `${actor} achieved Enlightenment.`;
        case 'civil_war_started': return `Civil war broke out in ${actor}.`;
        case 'defiance_event': return `Open defiance${where}.`;
        case 'trade_route_opened': return `A trade route opened between ${actor} and ${target}.`;
        case 'trade_route_lost': return `A trade route to ${target} was lost.`;
        case 'economic_crisis': return `An economic crisis struck ${actor}.`;
        case 'blockade_started': return `${actor} blockaded ${target}.`;
        case 'charter_granted': return `${actor} chartered ${facts.companyName ?? 'a company'}.`;
        case 'charter_revoked': return `${actor} revoked the charter of ${facts.companyName ?? 'a company'}.`;
        case 'company_nationalized': return `${actor} nationalised ${facts.companyName ?? 'a company'}.`;
        case 'company_went_rogue': return `${facts.companyName ?? 'A company'} repudiated its charter from ${actor}.`;
        case 'company_broke_away': return `${facts.companyName ?? 'A company'} broke with ${actor}.`;
        case 'company_acquired': return `${facts.buyerName ?? 'A company'} bought out ${facts.companyName ?? 'a rival'}.`;
        case 'corporate_crisis': return `${facts.companyName ?? 'A company'} of ${actor}: ${String(facts.headline ?? 'a crisis').toLowerCase()}.`;
        case 'megaproject_completed': return `${facts.companyName ?? 'A company'} completed the ${facts.projectName ?? 'works'} for ${actor}.`;
        case 'pirate_raid': return `Pirates raided${where}.`;
        case 'pirate_state_recognized': return `A pirate state was recognised${where}.`;
        case 'empire_eliminated': return `${target} was eliminated.`;
        case 'colony_founded': return `${actor} founded a colony${where}.`;
        case 'season_milestone': return String(facts.summary ?? 'The season turned.');
        default:
            return null;
    }
}

// ─── Decisions waiting ────────────────────────────────────────────────────────

export function collectDecisions(input: BriefInput, nowSeconds: number, _now: Date): BriefDecision[] {
    const decisions: BriefDecision[] = [
        ...diplomaticOffers(input, nowSeconds),
        ...gambits(input, nowSeconds),
        ...interventions(input, nowSeconds),
        ...debates(input, nowSeconds),
        ...defianceEvents(input, nowSeconds),
        ...secessionCrises(input, nowSeconds),
        ...corporateDemands(input, nowSeconds),
        ...corporateCrises(input, nowSeconds),
        ...rogueCompanies(input, nowSeconds),
        ...charterRenewals(input, nowSeconds),
        ...intelBoard(input, nowSeconds),
    ];

    // The world can carry two records with the same id — the client dedupes
    // open questions for the same reason. One row per id here as well.
    const byId = new Map<string, BriefDecision>();
    for (const decision of decisions) {
        if (!byId.has(decision.id)) byId.set(decision.id, decision);
    }
    decisions.length = 0;
    decisions.push(...byId.values());

    // Soonest deadline first; anything without one goes last.
    decisions.sort((a, b) => {
        const left = a.deadline?.realSecondsLeft ?? Number.POSITIVE_INFINITY;
        const right = b.deadline?.realSecondsLeft ?? Number.POSITIVE_INFINITY;
        return left - right;
    });
    return mergeRepeats(decisions);
}

/**
 * Five copies of "Espionage exposed on us", each answered in the same panel,
 * read as noise and push everything else off the screen. Items that only send
 * the player somewhere are collapsed into one row with a count. Anything the
 * brief answers inline stays separate — those buttons carry different ids.
 */
function mergeRepeats(decisions: BriefDecision[]): BriefDecision[] {
    const out: BriefDecision[] = [];
    const openOnlyIndex = new Map<string, number>();

    for (const decision of decisions) {
        const openOnly = decision.actions.length > 0 && decision.actions.every(a => !a.actionId);
        if (!openOnly) { out.push(decision); continue; }

        const key = `${decision.kind}|${decision.title}`;
        const seenAt = openOnlyIndex.get(key);
        if (seenAt === undefined) {
            openOnlyIndex.set(key, out.length);
            out.push({ ...decision });
            continue;
        }
        const first = out[seenAt];
        const count = (first as any)._count ? (first as any)._count + 1 : 2;
        out[seenAt] = {
            ...first,
            title: `${decision.title} ×${count}`,
            detail: first.detail,
            _count: count,
        } as BriefDecision & { _count: number };
    }

    return out.map(d => {
        const { _count, ...rest } = d as BriefDecision & { _count?: number };
        return rest as BriefDecision;
    });
}

// ─── The one suggested move ───────────────────────────────────────────────────

/**
 * The player's current first-week goal (lib/goals/first-week-goals.ts). Once
 * all five are done, or for a faction the worker keeps no goal record for: a
 * fleet, then charts, then a world.
 */
export function pickSuggestion(input: BriefInput): BriefSuggestion | null {
    const world = input.world ?? {};
    const factionId = input.factionId;

    // The first-week goal, when the player is on one (Item 4). The fallback
    // rules below only speak once all five are done.
    const goal = world?.firstWeekGoals?.has?.(factionId) ? currentGoal(world, factionId) : null;
    if (goal) {
        return {
            id: `goal-${goal.goal.id}`,
            title: goal.goal.title,
            detail: goal.goal.hint,
            action: { label: goal.deepLink.label, tone: 'open', deepLink: goal.deepLink },
            goal: { number: goal.number, total: goal.total, progress: goal.progress, target: goal.goal.target },
        };
    }

    const fleets = mapValues(world.movement?.fleets).filter((f: any) => f?.factionId === factionId);
    if (fleets.length === 0) {
        const yard = firstOwnedPlanet(world, factionId);
        return {
            id: 'suggest-fleet',
            title: 'Commission a fleet',
            detail: 'You have no fleet in service. Nothing can be surveyed, settled or defended without one.',
            action: yard
                ? { label: 'Open the shipyard', tone: 'open', openTab: 'military' }
                : { label: 'Open Military', tone: 'open', openTab: 'military' },
        };
    }

    const surveying = (world.movement?.explorationOrders ?? []).some(
        (o: any) => o?.factionId === factionId && o?.mode === 'survey'
    );
    if (!surveying) {
        const target = nearestUnsurveyedSystem(world, factionId);
        if (target) {
            return {
                id: 'suggest-survey',
                title: `Survey ${target.name ?? target.id}`,
                detail: 'Charts come before colonies — an unsurveyed system cannot be settled.',
                action: {
                    label: 'Survey it',
                    tone: 'accept',
                    actionId: 'EXPLORE_ISSUE_ORDER',
                    payload: { fleetId: fleets[0].id, targetSystemId: target.id, mode: 'survey' },
                },
            };
        }
    }

    const settle = settleTarget(world, factionId);
    if (settle) {
        return {
            id: 'suggest-settle',
            title: `Settle ${settle.name ?? settle.planetId}`,
            detail: 'A surveyed, unclaimed world is waiting. Settling it costs nothing but the charter.',
            action: {
                label: 'Settle it',
                tone: 'accept',
                actionId: 'PLANET_CLAIM',
                payload: { planetId: settle.planetId },
            },
        };
    }

    return null;
}

// ─── Decision collectors ──────────────────────────────────────────────────────
// Each one is defensive: the shapes below ride a shard that may be absent in a
// test world, and a brief that throws is worse than a brief that is short.

/** Offers addressed to this faction. Answered inline — DIP_RESPOND_OFFER. */
function diplomaticOffers(input: BriefInput, nowSeconds: number): BriefDecision[] {
    const offers = mapValues(input.world?.diplomacy?.offers)
        .filter((o: any) => o?.toFactionId === input.factionId && o?.status === 'pending');

    return offers.map((offer: any) => ({
        id: `offer-${offer.id}`,
        kind: 'diplomacy' as const,
        title: `${factionName(input.world, offer.fromFactionId)} proposes ${humanKind(offer.kind)}`,
        counterparts: [counterpart(input, offer.fromFactionId)],
        detail: offerTerms(offer),
        deadline: deadlineFrom(offer.expiresAtSeconds, nowSeconds, input.now),
        actions: [
            { label: 'Accept', tone: 'accept', actionId: 'DIP_RESPOND_OFFER', payload: { offerId: offer.id, response: 'accept' } },
            { label: 'Reject', tone: 'decline', actionId: 'DIP_RESPOND_OFFER', payload: { offerId: offer.id, response: 'reject' } },
            { label: 'Open', tone: 'open', openTab: 'diplomacy' },
        ],
    }));
}

/** Which answers a gambit of this kind accepts. Mirrors GambitResponse. */
const GAMBIT_RESPONSES: Record<string, Array<{ response: string; label: string; tone: BriefAction['tone'] }>> = {
    ultimatum: [
        { response: 'concede', label: 'Concede', tone: 'accept' },
        { response: 'reject', label: 'Refuse', tone: 'decline' },
        { response: 'stall', label: 'Stall', tone: 'open' },
    ],
    espionage_accusation: [
        { response: 'admit', label: 'Admit', tone: 'accept' },
        { response: 'deny', label: 'Deny', tone: 'decline' },
        { response: 'stall', label: 'Stall', tone: 'open' },
    ],
    show_of_force: [
        { response: 'submit', label: 'Back down', tone: 'accept' },
        { response: 'defy', label: 'Stand ground', tone: 'decline' },
        { response: 'stall', label: 'Stall', tone: 'open' },
    ],
};

/**
 * Gambits aimed at this faction. Silence is itself an answer here — the
 * deadline resolves them by doctrine — so they belong in the brief above most
 * other things.
 */
function gambits(input: BriefInput, nowSeconds: number): BriefDecision[] {
    const list = mapValues(input.world?.diplomacy?.gambits)
        .filter((g: any) => g?.targetId === input.factionId && g?.status === 'pending');

    return list.map((gambit: any) => {
        const from = factionName(input.world, gambit.initiatorId);
        const options = GAMBIT_RESPONSES[gambit.kind] ?? GAMBIT_RESPONSES.ultimatum;
        return {
            id: `gambit-${gambit.id}`,
            kind: 'gambit' as const,
            title: `${from}: ${humanKind(gambit.kind)}`,
            counterparts: [counterpart(input, gambit.initiatorId)],
            detail: gambit.demandCredits
                ? `They demand § ${Math.round(Number(gambit.demandCredits))}. Unanswered, your doctrine answers for you.`
                : 'Unanswered, your doctrine answers for you.',
            deadline: deadlineFrom(gambit.respondBySeconds, nowSeconds, input.now),
            actions: options.map(o => ({
                label: o.label,
                tone: o.tone,
                actionId: 'DIP_RESPOND_GAMBIT',
                payload: { gambitId: gambit.id, response: o.response },
            })),
        };
    });
}

/** Wars this faction can take a public position on, once each. */
function interventions(input: BriefInput, nowSeconds: number): BriefDecision[] {
    const me = input.factionId;
    const list = mapValues(input.world?.diplomacy?.interventions)
        .filter((w: any) => w?.status === 'open'
            && w.aggressorId !== me
            && w.defenderId !== me
            && !(w.responses ?? {})[me]);

    return list.map((window: any) => ({
        id: `intervention-${window.id}`,
        kind: 'diplomacy' as const,
        title: `${factionName(input.world, window.aggressorId)} is at war with ${factionName(input.world, window.defenderId)}`,
        counterparts: [counterpart(input, window.aggressorId), counterpart(input, window.defenderId)],
        detail: 'The galaxy is waiting to hear where you stand.',
        deadline: deadlineFrom(window.closesAtSeconds, nowSeconds, input.now),
        actions: [
            { label: 'Condemn', tone: 'decline', actionId: 'DIP_INTERVENE', payload: { windowId: window.id, stance: 'condemn' } },
            { label: 'Endorse', tone: 'accept', actionId: 'DIP_INTERVENE', payload: { windowId: window.id, stance: 'endorse' } },
            { label: 'Mediate', tone: 'open', actionId: 'DIP_INTERVENE', payload: { windowId: window.id, stance: 'mediate' } },
        ],
    }));
}

/**
 * Open political questions. The three resolutions carry forecasts the brief has
 * no room for, so this one sends the player to the panel rather than guessing
 * for them.
 */
function debates(input: BriefInput, nowSeconds: number): BriefDecision[] {
    const posture = input.world?.movement?.empirePostures?.get?.(input.factionId)
        ?? input.world?.movement?.empirePostures?.[input.factionId];
    const open = (posture?.openQuestions ?? []).filter((q: any) => (q?.status ?? 'open') === 'open');

    return open.map((question: any) => ({
        id: `debate-${question.id}`,
        kind: 'debate' as const,
        title: debateHeadline(question),
        detail: 'Your parliament is waiting on a line. Three answers, none of them free.',
        deadline: deadlineFrom(question.deadlineAtSeconds, nowSeconds, input.now),
        actions: [{ label: 'Open', tone: 'open', openTab: 'government' }],
    }));
}

/** A world refusing an order. Silence hands it the point. */
function defianceEvents(input: BriefInput, nowSeconds: number): BriefDecision[] {
    const list = mapValues(input.world?.defianceEvents)
        .filter((d: any) => d?.factionId === input.factionId && d?.status === 'open');

    return list.map((event: any) => ({
        id: `defiance-${event.id}`,
        kind: 'debate' as const,
        title: event.title ?? `${event.planetName ?? 'A world'} refuses`,
        detail: event.demand ?? 'Left unanswered, the refusal stands.',
        deadline: deadlineFrom(event.expiresAtSeconds, nowSeconds, input.now),
        actions: [{ label: 'Answer', tone: 'open', openTab: 'government' }],
    }));
}

/** Regions asking to leave. Conceding picks a specific demand — that is a panel job. */
function secessionCrises(input: BriefInput, nowSeconds: number): BriefDecision[] {
    const list = mapValues(input.world?.secessionCrises)
        .filter((c: any) => c?.factionId === input.factionId && c?.status === 'open');

    return list.map((crisis: any) => ({
        id: `secession-${crisis.id}`,
        kind: 'secession' as const,
        title: crisis.name ?? 'Worlds demand independence',
        detail: `${crisis.planetIds?.length ?? 0} worlds, ${Math.round(Number(crisis.independenceSupport ?? 0))}% for leaving.`,
        deadline: deadlineFrom(crisis.deadlineSeconds, nowSeconds, input.now),
        actions: [{ label: 'Open', tone: 'open', openTab: 'government' }],
    }));
}

/** Company lobbying. Accept or refuse inline; both have a price. */
function corporateDemands(input: BriefInput, nowSeconds: number): BriefDecision[] {
    const list = mapValues(input.world?.corporate?.demands)
        .filter((d: any) => d?.factionId === input.factionId && d?.status === 'pending');

    return list.map((demand: any) => ({
        id: `demand-${demand.id}`,
        kind: 'corporate' as const,
        title: `${companyName(input.world, demand.companyId)}: ${humanKind(demand.type)}`,
        detail: demand.text ?? demand.concession ?? 'A corporate demand is waiting on your answer.',
        deadline: deadlineFrom(demand.expiresAt, nowSeconds, input.now),
        actions: [
            { label: 'Accept', tone: 'accept', actionId: 'CORP_RESPOND_DEMAND', payload: { demandId: demand.id, response: 'accept' } },
            { label: 'Refuse', tone: 'decline', actionId: 'CORP_RESPOND_DEMAND', payload: { demandId: demand.id, response: 'reject' } },
            { label: 'Open', tone: 'open', openTab: 'corporate' },
        ],
    }));
}

/** A corporate crisis on the state's desk — the options are bespoke per crisis. */
function corporateCrises(input: BriefInput, nowSeconds: number): BriefDecision[] {
    const list = mapValues(input.world?.corporate?.crises)
        .filter((c: any) => c?.factionId === input.factionId && c?.status === 'pending');

    return list.map((crisis: any) => ({
        id: `corp-crisis-${crisis.id}`,
        kind: 'corporate' as const,
        title: crisis.headline ?? 'A corporate crisis',
        detail: crisis.description ?? 'The state has to answer for this one.',
        deadline: deadlineFrom(crisis.expiresAt, nowSeconds, input.now),
        actions: (crisis.options ?? []).slice(0, 2).map((option: any) => ({
            label: option.label ?? option.title ?? 'Choose',
            tone: 'accept' as const,
            actionId: 'CORP_RESOLVE_CRISIS',
            payload: { crisisId: crisis.id, optionId: option.id },
        })).concat([{ label: 'Open', tone: 'open' as any, openTab: 'corporate' } as any]),
    }));
}

/** A charter about to expire. Renewing as the board asks is the one-click answer. */
function charterRenewals(input: BriefInput, nowSeconds: number): BriefDecision[] {
    const list = mapValues(input.world?.corporate?.renewals)
        .filter((r: any) => r?.factionId === input.factionId && r?.status === 'pending');

    return list.map((renewal: any) => ({
        id: `renewal-${renewal.id}`,
        kind: 'corporate' as const,
        title: `${companyName(input.world, renewal.companyId)}: charter up for renewal`,
        detail: `${renewal.ask?.text ?? 'The board asks for its charter back.'} Unanswered, it renews on the board's terms.`,
        deadline: deadlineFrom(renewal.expiresAt, nowSeconds, input.now),
        actions: [
            { label: 'Renew', tone: 'accept' as const, actionId: 'CORP_RESPOND_RENEWAL', payload: { renewalId: renewal.id, response: 'company_terms' } },
            { label: 'Open', tone: 'open' as const, openTab: 'corporate' },
        ],
    }));
}

/** A rogue company on its founder's clock: seize it, or lose what it holds. */
function rogueCompanies(input: BriefInput, nowSeconds: number): BriefDecision[] {
    const list = mapValues(input.world?.corporate?.companies).filter((c: any) =>
        c?.foundingFactionId === input.factionId
        && c?.hasGoneRogue && !c?.nationalized
        && typeof c?.rogueSince === 'number'
        && (c?.rogueBrokeAt ?? -1) < c.rogueSince);

    return list.map((company: any) => ({
        id: `rogue-${company.id}-${company.rogueSince}`,
        kind: 'corporate' as const,
        title: `${company.charter?.fullName ?? 'A company'} has gone rogue`,
        detail: 'It no longer recognises its charter. Unanswered, it leaves with its colonies, its ships, or the charter itself.',
        deadline: deadlineFrom(company.rogueSince + ROGUE_GRACE_SECONDS, nowSeconds, input.now),
        // Seizing a company costs compensation and political capital the
        // brief cannot show; that decision is made in the ledger.
        actions: [{ label: 'Open', tone: 'open' as const, openTab: 'corporate' }],
    }));
}

/** The intelligence board: threats lapse into damage, opportunities into nothing. */
function intelBoard(input: BriefInput, nowSeconds: number): BriefDecision[] {
    const list = mapValues(input.world?.espionage?.boardOpportunities)
        .filter((o: any) => o?.ownerFactionId === input.factionId && o?.status === 'available');

    return list.map((entry: any) => ({
        id: `board-${entry.id}`,
        kind: 'crisis' as const,
        title: entry.title ?? (entry.kind === 'threat' ? 'Threat' : 'Opportunity'),
        detail: entry.description ?? '',
        deadline: deadlineFrom(entry.expiresAt, nowSeconds, input.now),
        actions: [
            { label: entry.kind === 'threat' ? 'Act on it' : 'Seize it', tone: 'accept', actionId: 'ESP_SEIZE_OPPORTUNITY', payload: { opportunityId: entry.id } },
            { label: 'Open', tone: 'open', openTab: 'intelligence' },
        ],
    }));
}

// ─── Small helpers ────────────────────────────────────────────────────────────

/**
 * The shared snapshot drops `economy.factions` on save, so a server-side caller
 * holding only the snapshot cannot look a rival's name up there. The worker
 * leaves a public id → name map on the world for exactly this
 * (scripts/game-loop.ts); the economy record is the fallback for the caller's
 * own faction and for tests.
 */
function factionName(world: any, factionId: string | undefined): string {
    if (!factionId) return 'Someone';
    const fromMap = world?.factionNames?.[factionId];
    if (fromMap) return fromMap;
    const rec = world?.economy?.factions?.get?.(factionId) ?? world?.economy?.factions?.[factionId];
    return rec?.name ?? factionId;
}

/** "<Empire> · played by <name>" or "<Empire> · AI", for a decision's other side. */
function counterpart(input: BriefInput, factionId: string): string {
    return empireWithPlayer(factionName(input.world, factionId), factionId, input.players);
}

function companyName(world: any, companyId: string | undefined): string {
    if (!companyId) return 'A company';
    const rec = world?.corporate?.companies?.get?.(companyId) ?? world?.corporate?.companies?.[companyId];
    return rec?.charter?.fullName ?? rec?.name ?? 'A company';
}

/** The terms in one line, per offer kind. */
function offerTerms(offer: any): string {
    switch (offer.kind) {
        case 'treaty':
            return `A ${humanKind(offer.treatyType ?? 'treaty')}.`;
        case 'trade_pact':
            return `${offer.volumePerHour ?? '?'} ${offer.resource ?? 'goods'} per hour.`;
        case 'tribute_demand':
            return `They demand ${offer.tributeAmountPerTick ?? '?'} ${offer.tributeResourceType ?? 'credits'} per tick. Refusal raises the pressure.`;
        case 'peace_offer':
            return 'An end to the war, on these terms.';
        case 'mercenary_contract':
            return `A retainer of ${offer.contractTerms?.retainerPerTick ?? '?'} ${offer.contractTerms?.resourceKey ?? 'credits'} per tick.`;
        default:
            return 'They are waiting on your answer.';
    }
}

/** `tribute_demand` → "tribute demand". Ids are for code, not for players. */
function humanKind(kind: unknown): string {
    return String(kind ?? 'a proposal').replace(/_/g, ' ');
}

/** The question catalog lives in lib/politics; the brief only needs a headline. */
function debateHeadline(question: any): string {
    const facts = question?.facts ?? {};
    const subject = facts.aggressorName ?? facts.placeName ?? facts.targetName;
    const kind = humanKind(question?.kind);
    return subject ? `${capitalize(kind)} — ${subject}` : capitalize(kind);
}

function capitalize(text: string): string {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * A sim-clock deadline in the player's own calendar ("today at 18:40",
 * "tomorrow at 09:15", "in 3 days"). Built server-side with the server's
 * clock; the client re-renders it from realSecondsLeft in the viewer's zone.
 */
export function deadlineFrom(atSimSeconds: unknown, nowSeconds: number, now?: Date): BriefDeadline | undefined {
    const at = Number(atSimSeconds);
    if (!Number.isFinite(at) || at <= 0) return undefined;
    const realSecondsLeft = (at - nowSeconds) / SIM_SECONDS_PER_REAL_SECOND;
    return { atSimSeconds: at, realSecondsLeft, label: realTimeLabel(realSecondsLeft, now) };
}

/** The one formatter (lib/time/galactic-time), kept under its old name for callers. */
export function realTimeLabel(realSecondsLeft: number, now?: Date): string {
    return formatRealDeadline(realSecondsLeft, { now });
}

/** Real seconds until the next strategic tick. */
export function realSecondsToNextTick(nowSeconds: number): number {
    const interval = TICK_INTERVAL_HOURS * 3600;
    const simLeft = interval - (nowSeconds % interval);
    return simLeft / SIM_SECONDS_PER_REAL_SECOND;
}

function firstOwnedPlanet(world: any, factionId: string): any | null {
    for (const planet of mapValues(world?.construction?.planets)) {
        if (planet?.ownerId === factionId) return planet;
    }
    return null;
}

function nearestUnsurveyedSystem(world: any, factionId: string): any | null {
    const visibility = world?.movement?.factionVisibility?.get?.(factionId)
        ?? world?.movement?.factionVisibility?.[factionId]
        ?? {};
    for (const system of mapValues(world?.systems ?? world?.galaxy?.systems)) {
        const stage = (visibility as any)[system.id]?.revealStage ?? (visibility as any)[system.id];
        if (stage === 'surveyed') continue;
        if (!stage || stage === 'unknown') continue; // never seen: ping it first
        return system;
    }
    return null;
}

function settleTarget(world: any, factionId: string): any | null {
    const visibility = world?.movement?.factionVisibility?.get?.(factionId)
        ?? world?.movement?.factionVisibility?.[factionId]
        ?? {};
    for (const planet of mapValues(world?.construction?.planets)) {
        if (!planet) continue;
        if (planet.ownerId && planet.ownerId !== 'unowned' && planet.ownerId !== null) continue;
        if (!planet.tags?.includes?.('colonizable')) continue;
        const stage = (visibility as any)[planet.systemId]?.revealStage ?? (visibility as any)[planet.systemId];
        if (stage !== 'surveyed') continue;
        return planet;
    }
    return null;
}

/** Map | Record | array | undefined → array of values. */
function mapValues(source: any): any[] {
    if (!source) return [];
    if (Array.isArray(source)) return source;
    if (typeof source.values === 'function') return Array.from(source.values());
    if (typeof source === 'object') return Object.values(source);
    return [];
}

function parseJsonArray(raw: unknown): unknown[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'string' || !raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function parseJsonObject(raw: unknown): Record<string, any> {
    if (raw && typeof raw === 'object') return raw as Record<string, any>;
    if (typeof raw !== 'string' || !raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function toDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type { BriefAction, BriefDecision, BriefLine, BriefSuggestion };
