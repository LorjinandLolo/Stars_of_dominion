// lib/government/arcs.ts
// Stars of Dominion — what a written minister does about what you did.
//
// A character's arc (data/leaders/cabinet-cast.json, docs/writing/named-cabinet.md)
// is a small state machine over things the simulation already records: a
// chronicle event the empire acted in or suffered, a government number
// falling below a line, how often the ruler took or ignored this office's
// advice, a dismissal, a number of days. Every response is an existing verb:
// a letter or a card line (say), a resignation through the cabinet's own
// path, a proposal in the brief for a policy (ask_for), or standing by the
// ruler (a loyalty floor while the stage holds). No new mechanics: if an arc
// needs something the game cannot do, the arc is wrong.
//
// Runs once per worker cycle, right before the chronicle flushes, so it sees
// each cycle's events exactly once. State lives on the leader record
// (`arc`), which rides the faction shard like the rest of the cabinet.

import type { GameWorldState } from '../game-world-state';
import type { Leader } from '../leadership/types';
import type { ChronicleRow } from '../narrative/chronicle-types';
import type { CabinetPortfolio } from './types';
import { characterOf, type CabinetCharacter } from '../leadership/cast';
import { getGovernment } from './government-service';
import { resignMinister, portfolioLabel } from './cabinet-service';
import { adviseOrder, advisorRecordFor } from '../delegation/advisor-proposals';
import { pushLetter } from './letters';
import type { DelegatedSystem } from '../delegation/delegation-types';

// ─── Data shape ──────────────────────────────────────────────────────────────

export type ArcTrigger =
    /** A chronicle event this empire acted in (`actor`), suffered (`target`), or either (`any`). */
    | { on: 'event'; type: string; role?: 'actor' | 'target' | 'any' }
    /** A government number under a line. */
    | { on: 'stat'; stat: 'approval' | 'legitimacy' | 'cohesion' | 'warFatigue'; below: number }
    /** This office's proposals declined or lapsed since the stage began. */
    | { on: 'advice_ignored'; count: number }
    /** This office's proposals approved (or run under a standing order) since the stage began. */
    | { on: 'advice_taken'; count: number }
    /** The ruler dismissed them. */
    | { on: 'dismissed' }
    /** Days in this stage. */
    | { on: 'day'; after: number };

export type ArcAction =
    | { do: 'say'; kind: 'letter' | 'card'; subject?: string; text: string }
    | { do: 'resign'; subject?: string; text: string }
    | { do: 'ask_for'; policyId: string; policyName: string; subject?: string; text: string }
    | { do: 'stand_by_you'; loyaltyFloor: number; subject?: string; text?: string };

export interface ArcTransition { when: ArcTrigger; to: string; does?: ArcAction | ArcAction[] }

export interface ArcStage {
    id: string;
    /** Runs when the stage begins (not for the first stage). */
    opening?: ArcAction | ArcAction[];
    on?: ArcTransition[];
    /** Standing effect while in the stage. */
    while?: { loyaltyFloor?: number };
    /** Nothing more happens. */
    end?: boolean;
}

export interface Arc { stages: ArcStage[] }

/** What is written on the leader. */
export interface ArcState {
    stage: string;
    sinceSeconds: number;
    /** The cabinet card's line while this stage holds (a `say` of kind card). */
    cardLine?: string;
    done?: boolean;
}

export interface ArcReport { factionId: string; leaderId: string; name: string; from: string; to: string; did: string[] }

const DAY = 86400;

/** Which delegated system this office's proposals file under (mirrors the brief's ledger map). */
const PORTFOLIO_SYSTEM: Record<string, DelegatedSystem> = { defence: 'military', foreign: 'diplomacy', economy: 'development' };
function systemOf(portfolio: string): DelegatedSystem { return PORTFOLIO_SYSTEM[portfolio] ?? 'government'; }

function stageOf(arc: Arc, id: string): ArcStage | undefined { return arc.stages.find(s => s.id === id); }

export function arcStateOf(leader: Leader): ArcState | undefined { return (leader as any).arc; }

// ─── Triggers ────────────────────────────────────────────────────────────────

function parseIds(json: string): string[] { try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; } }

function eventHits(row: ChronicleRow, factionId: string, role: 'actor' | 'target' | 'any'): boolean {
    const asActor = parseIds(row.actorIds).includes(factionId);
    const asTarget = parseIds(row.targetIds).includes(factionId);
    return role === 'actor' ? asActor : role === 'target' ? asTarget : asActor || asTarget;
}

function adviceCount(world: GameWorldState, factionId: string, portfolio: string, name: string, since: number, outcomes: string[]): number {
    const rec = advisorRecordFor(world as any, factionId);
    const system = systemOf(portfolio);
    // Defence, Foreign and the Treasury own a system each; the three offices
    // that share 'government' only count proposals made in their own name.
    const own = (e: { title: string }) => system !== 'government' || e.title.startsWith(name);
    return rec.ledger.filter(e => e.system === system && e.atSeconds >= since && outcomes.includes(e.outcome) && own(e)).length;
}

function fires(world: GameWorldState, leader: Leader, state: ArcState, trigger: ArcTrigger, rows: ChronicleRow[]): boolean {
    const factionId = leader.factionId;
    switch (trigger.on) {
        case 'event': return rows.some(r => r.type === trigger.type && eventHits(r, factionId, trigger.role ?? 'any'));
        case 'stat': { const gov: any = getGovernment(world, factionId); return !!gov && Number(gov[trigger.stat] ?? 100) < trigger.below; }
        case 'advice_ignored': return adviceCount(world, factionId, leader.portfolio ?? '', leader.name, state.sinceSeconds, ['declined', 'expired']) >= trigger.count;
        case 'advice_taken': return adviceCount(world, factionId, leader.portfolio ?? '', leader.name, state.sinceSeconds, ['approved', 'always', 'ran']) >= trigger.count;
        case 'dismissed': return leader.status === 'active' && !leader.portfolio && leader.history.some(h => h.timestamp >= state.sinceSeconds && /^Dismissed/.test(h.description));
        case 'day': return (world.nowSeconds - state.sinceSeconds) >= trigger.after * DAY;
    }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function letter(world: GameWorldState, leader: Leader, c: CabinetCharacter, portfolio: string, subject: string | undefined, body: string): void {
    pushLetter(world as any, leader.factionId, {
        fromLeaderId: leader.id, fromName: leader.name, portfolio, characterId: c.id,
        subject: subject ?? `From the Minister of ${portfolioLabel(portfolio as CabinetPortfolio)}`,
        body,
    });
}

function act(world: GameWorldState, leader: Leader, c: CabinetCharacter, state: ArcState, action: ArcAction, portfolio: string, did: string[]): void {
    switch (action.do) {
        case 'say':
            if (action.kind === 'letter') { letter(world, leader, c, portfolio, action.subject, action.text); did.push('letter'); }
            else { state.cardLine = action.text; did.push('card'); }
            return;
        case 'resign': {
            letter(world, leader, c, portfolio, action.subject ?? 'A letter of resignation', action.text);
            const gov = getGovernment(world, leader.factionId);
            if (gov && leader.portfolio && gov.cabinet?.[leader.portfolio as CabinetPortfolio] === leader.id) {
                resignMinister(world, gov, leader.portfolio as CabinetPortfolio, leader);
            }
            state.done = true;
            did.push('resigned');
            return;
        }
        case 'ask_for': {
            const result = adviseOrder(world as any, {
                system: 'government', factionId: leader.factionId, actionId: 'GOV_ENACT_POLICY', payload: { policyId: action.policyId },
                topic: `GOV_ENACT_POLICY:${action.policyId}:${c.id}`,
                title: `${leader.name} asks for ${action.policyName}`,
                detail: action.text,
            });
            if (action.subject) letter(world, leader, c, portfolio, action.subject, action.text);
            did.push(`asked:${action.policyId}:${result}`);
            return;
        }
        case 'stand_by_you':
            if (action.text) letter(world, leader, c, portfolio, action.subject, action.text);
            leader.loyalty = Math.max(leader.loyalty, action.loyaltyFloor);
            did.push('stands by you');
            return;
    }
}

function list<T>(v: T | T[] | undefined): T[] { return v === undefined ? [] : Array.isArray(v) ? v : [v]; }

// ─── The runner ──────────────────────────────────────────────────────────────

/**
 * Every written minister (and every written person the ruler dismissed, until
 * their arc ends) reads the cycle's events and the state of the government,
 * and moves one stage at most. Returns what moved, for the worker's log.
 */
export function runCharacterArcs(world: GameWorldState, rows: ChronicleRow[]): ArcReport[] {
    const out: ArcReport[] = [];
    const leaders = world.leadership?.leaders;
    if (!(leaders instanceof Map)) return out;
    for (const leader of leaders.values()) {
        const c = characterOf(leader);
        if (!c?.arc?.stages?.length) continue;
        if (leader.status !== 'active') continue;
        const portfolio = leader.portfolio ?? c.portfolio;
        let state = arcStateOf(leader);
        if (!state) { state = { stage: c.arc.stages[0].id, sinceSeconds: world.nowSeconds }; (leader as any).arc = state; }
        if (state.done) continue;
        const stage = stageOf(c.arc, state.stage);
        if (!stage || stage.end) { state.done = true; continue; }

        if (stage.while?.loyaltyFloor !== undefined) leader.loyalty = Math.max(leader.loyalty, stage.while.loyaltyFloor);

        const hit = (stage.on ?? []).find(t => fires(world, leader, state!, t.when, rows));
        if (!hit) continue;
        const next = stageOf(c.arc, hit.to);
        if (!next) continue;
        const did: string[] = [];
        for (const a of list(hit.does)) act(world, leader, c, state, a, portfolio, did);
        const from = state.stage;
        state.stage = next.id;
        state.sinceSeconds = world.nowSeconds;
        if (!state.done) for (const a of list(next.opening)) act(world, leader, c, state, a, portfolio, did);
        if (next.end) state.done = true;
        leader.history.push({ timestamp: world.nowSeconds, description: `${from} → ${next.id}` });
        out.push({ factionId: leader.factionId, leaderId: leader.id, name: leader.name, from, to: next.id, did });
    }
    return out;
}
