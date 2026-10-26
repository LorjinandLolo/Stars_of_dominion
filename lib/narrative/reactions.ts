// lib/narrative/reactions.ts
// Stars of Dominion — what a court can do about a story.
//
// The gazette is read-only until a player can answer it. This is the one
// function that turns an article into at most three buttons: each is an
// EXISTING priced order (or a panel to open) picked from the lead event's
// kind and the reader's place in it — the loser blames the admiral, the
// bystander condemns, the accused denies. Nothing here is new power: a
// reaction is the same click as the panel's, dispatched through PRESS_REACT
// so the chronicle remembers it was an answer to the news and the narrator
// writes the follow-up next cycle. Pure and client-safe: the relations the
// rules need (at war, rivalry) come in as a small context the caller builds
// from the synced world.
//
// Fog: the events arrive through the public ceiling (app/api/gazette): an
// actor is named only when the attribution is 'exposed', a suspect when
// 'suspected:<id>'. A reaction never targets a hand the galaxy cannot see.

import { POLITICAL_CAPITAL_COSTS } from '@/lib/actions/political-costs';

/** An event as the gazette route hands it to the client: the public view only. */
export interface PublicEvent {
    id: string;
    type: string;
    day: number;
    /** Named actors — empty unless the attribution was 'exposed'. */
    actorIds: string[];
    /** A whispered name, when the attribution was 'suspected:<id>'. */
    suspectedId: string | null;
    targetIds: string[];
    location: string | null;
    facts: Record<string, unknown>;
}

export interface ReactionContext {
    readerFactionId: string;
    /** At war with this faction right now. */
    isAtWar(factionId: string): boolean;
    /** 0–100 rivalry toward this faction; 20 is the default. */
    rivalry(factionId: string): number;
    /** A faction the galaxy knows by name (exists in the economy). */
    exists(factionId: string): boolean;
    /** Political capital in hand; a reaction above it is shown greyed. */
    politicalCapital: number;
}

export interface Reaction {
    id: string;
    label: string;
    /** One line: what it does and what it costs. */
    detail: string;
    tone: 'hostile' | 'friendly' | 'neutral';
    /** An order to dispatch through PRESS_REACT. */
    actionId?: string;
    payload?: Record<string, unknown>;
    /** Or a panel to open, for answers that need more than one click. */
    openTab?: string;
    /** Political capital the inner order costs. */
    pcCost: number;
    /** Set when the reader cannot pay it now. */
    disabled?: string;
}

const MAX_REACTIONS = 3;

function priced(r: Omit<Reaction, 'pcCost' | 'disabled'>, ctx: ReactionContext): Reaction {
    const pcCost = r.actionId ? (POLITICAL_CAPITAL_COSTS[r.actionId] ?? 0) : 0;
    const detail = pcCost > 0 ? `${r.detail} ${pcCost} political capital.` : r.detail;
    return { ...r, detail, pcCost, disabled: pcCost > ctx.politicalCapital ? `Needs ${pcCost} political capital; you hold ${Math.floor(ctx.politicalCapital)}.` : undefined };
}

/** The other party in an event, from the reader's side: the first named id that is not the reader. */
function otherOf(ids: string[], me: string): string | undefined {
    return ids.find(id => id && id !== me);
}

/**
 * Up to three reactions to an article, from its lead event. The lead is the
 * first event; the rest only widen who is "in" the story.
 */
export function reactionsFor(events: PublicEvent[], ctx: ReactionContext): Reaction[] {
    const lead = events[0];
    if (!lead) return [];
    const me = ctx.readerFactionId;
    const actors = lead.actorIds.filter(id => ctx.exists(id));
    const targets = lead.targetIds.filter(id => ctx.exists(id));
    const iActed = actors.includes(me);
    const iWasHit = targets.includes(me);
    const actor = otherOf(actors, me);
    const target = otherOf(targets, me);
    const suspect = lead.suspectedId && lead.suspectedId !== me && ctx.exists(lead.suspectedId) ? lead.suspectedId : undefined;
    const out: Array<Omit<Reaction, 'pcCost' | 'disabled'>> = [];

    const envoy = (to: string, why: string) => out.push({ id: `envoy-${to}`, label: 'Send an envoy', detail: `${why}`, tone: 'friendly', actionId: 'DIP_SEND_ENVOY', payload: { targetFactionId: to } });
    const condemn = (who: string, why: string) => { if (!ctx.isAtWar(who)) out.push({ id: `sanction-${who}`, label: 'Condemn with sanctions', detail: why, tone: 'hostile', actionId: 'DIP_IMPOSE_SANCTIONS', payload: { targetFactionId: who } }); };
    const rumour = (who: string, why: string) => out.push({ id: `rumour-${who}`, label: 'Plant a rumour', detail: why, tone: 'hostile', actionId: 'DIP_PLANT_RUMOR', payload: { targetFactionId: who } });
    const peace = (who: string) => { if (ctx.isAtWar(who)) out.push({ id: `peace-${who}`, label: 'Sue for terms', detail: 'Offer peace. They may refuse.', tone: 'friendly', actionId: 'DIP_OFFER_PEACE', payload: { targetFactionId: who } }); };
    const campaign = (who: string, why: string) => out.push({ id: `campaign-${who}`, label: 'Rally the press', detail: why, tone: 'hostile', actionId: 'PRESS_LAUNCH_CAMPAIGN', payload: { targetFactionId: who, objective: 'credibility' } });
    const open = (id: string, label: string, detail: string, tab: string, tone: Reaction['tone'] = 'neutral') => out.push({ id, label, detail, tone, openTab: tab });

    switch (lead.type) {
        case 'war_declared': {
            if (iWasHit && actor) { peace(actor); campaign(actor, 'A campaign against the aggressor’s standing at home.'); open('arm', 'To the fleet', 'Open the military desk.', 'military'); }
            else if (iActed) { open('fleet', 'To the fleet', 'The war is yours now.', 'military'); if (target) rumour(target, 'Undercut them abroad while the fleets move.'); }
            else { if (actor) condemn(actor, 'Sanctions on the aggressor; the galaxy reads where you stand.'); if (target) envoy(target, 'Stand with the attacked; rivalry eases.'); open('out', 'Stay out of it', 'Watch from the sidelines.', 'diplomacy'); }
            break;
        }
        case 'battle_resolved': case 'fleet_destroyed': case 'system_captured': case 'capital_captured': case 'siege_started': case 'planet_bombarded': {
            const winner = iWasHit ? actor : iActed ? undefined : actor;
            if (iWasHit) {
                out.push({ id: 'blame', label: 'Blame the admiral', detail: 'Dismiss the Minister of Defence. Legitimacy survives; the minister does not.', tone: 'hostile', actionId: 'GOV_DISMISS_MINISTER', payload: { portfolio: 'defence' } });
                if (winner) peace(winner);
                open('regroup', 'Regroup the fleet', 'Open the military desk.', 'military');
            } else if (iActed) {
                open('press', 'Press the advantage', 'Open the military desk.', 'military');
                if (target) campaign(target, 'Tell the galaxy how it went.');
            } else {
                if (actor) envoy(actor, 'Court the winner.');
                if (target) envoy(target, 'Console the loser; a friend in need.');
            }
            break;
        }
        case 'operation_exposed': case 'scandal_confirmed': case 'investigation_published': case 'agent_captured': {
            const hand = actor ?? suspect;
            if (iActed || suspect === undefined && lead.suspectedId === me) {
                open('deny', 'Deny everything', 'Open the press desk and run a counter-narrative.', 'press', 'hostile');
                if (target) envoy(target, 'Make amends before it hardens.');
            } else if (iWasHit) {
                open('investigate', 'Open a case', 'The intelligence desk works the file.', 'intelligence');
                if (hand) condemn(hand, suspect && !actor ? 'Sanctions on the suspected hand; you may be wrong.' : 'Sanctions on the exposed hand.');
            } else {
                if (hand) condemn(hand, 'The galaxy saw it too.');
                if (hand) rumour(hand, 'Spread it further.');
                if (target) envoy(target, 'Sympathy is cheap and remembered.');
            }
            break;
        }
        case 'treaty_signed': case 'alliance_formed': case 'tribute_imposed': {
            if (iActed || iWasHit) { const other = actor ?? target; if (other) envoy(other, 'Keep it warm.'); }
            else { if (actor) envoy(actor, 'Get close to the new bloc.'); if (target) rumour(target, 'Whisper doubt into the new friendship.'); if (actor) rumour(actor, 'Whisper doubt into the new friendship.'); }
            break;
        }
        case 'treaty_broken': case 'alliance_dissolved': {
            if (iWasHit && actor) { condemn(actor, 'An oathbreaker, publicly named.'); campaign(actor, 'Their word is worth nothing; say so.'); }
            else if (!iActed) { if (target) envoy(target, 'A jilted court looks for new friends.'); if (actor) condemn(actor, 'Oathbreakers should hear it from everyone.'); }
            break;
        }
        case 'civil_war_started': case 'secession_declared': case 'breakaway_claimed': {
            const rebel = lead.type === 'civil_war_started' || lead.type === 'breakaway_claimed' ? actor : undefined;
            // The parent may be the reader: read it raw, not "the other party".
            const parentRaw = lead.type === 'civil_war_started' ? lead.targetIds[0] : lead.actorIds[0];
            const parent = parentRaw === me ? me : (lead.type === 'civil_war_started' ? target : actor);
            if (parent === me) { open('crush', 'Crush it', 'Open the military desk.', 'military', 'hostile'); if (rebel) peace(rebel); }
            else { if (rebel) out.push({ id: `recognise-${rebel}`, label: 'Recognise the breakaway', detail: 'Legitimacy for the new state; a grievance for its parent.', tone: 'hostile', actionId: 'DIP_RECOGNIZE_BREAKAWAY', payload: { rebelFactionId: rebel } }); if (parent) envoy(parent, 'Stand by the old order.'); open('fund', 'Fund the rebels', 'The intelligence desk sponsors cells.', 'intelligence', 'hostile'); }
            break;
        }
        case 'coup_attempted': case 'government_changed': case 'leader_rose': case 'leader_died': {
            const court = actor ?? target;
            if (court && court !== me) { envoy(court, 'A new hand on the tiller; be the first to shake it.'); if (ctx.rivalry(court) >= 50) rumour(court, 'A weak moment is a moment.'); }
            break;
        }
        case 'rebel_act': case 'crackdown': {
            const host = lead.type === 'crackdown' ? actor : target;
            if (host === me) open('cases', 'Work the case', 'The intelligence desk.', 'intelligence');
            else { open('sponsor', 'Sponsor the cell', 'The intelligence desk pays rebels abroad.', 'intelligence', 'hostile'); if (host && lead.type === 'crackdown') condemn(host, 'Condemn the crackdown.'); }
            break;
        }
        case 'pirate_raid': case 'blockade_started': case 'trade_route_lost': {
            if (iWasHit) { open('hunt', 'Hunt them', 'Open the military desk.', 'military', 'hostile'); open('escort', 'Pay for escorts', 'The economy desk assigns escorts.', 'economy'); }
            else if (target) envoy(target, 'Offer to help.');
            break;
        }
        case 'enlightenment_transcending': {
            if (!iActed && actor) { condemn(actor, 'Everyone who is not transcending has a reason.'); rumour(actor, 'Undercut the bid.'); open('coalition', 'Build a coalition', 'Open diplomacy.', 'diplomacy'); }
            break;
        }
        default: {
            const other = actor ?? target ?? suspect;
            if (other) envoy(other, 'Open a line about it.');
            break;
        }
    }

    const seen = new Set<string>();
    return out.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true))).slice(0, MAX_REACTIONS).map(r => priced(r, ctx));
}
