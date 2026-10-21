// lib/ai/advisor-desk.ts
// Stars of Dominion — what the advisors PROPOSE to a human player.
//
// The war AI knows when an empire should fight, make peace and arm; for an AI
// empire it just does. For a human it writes the same conclusion up as a
// proposal (lib/delegation/advisor-proposals.ts) and the daily brief asks.
// Every proposal is a real order with its real price: Approve runs it through
// executeOrder, nothing here is cheaper or stronger than the player's own
// click. Runs once per strategic tick, after the delegated systems.
//
// What is proposed, and the same gates the AI applies to itself:
//  - War, on the war AI's own candidate (grace, cooldown, fatigue, strength).
//  - Peace, when the court is weary, the campaign has stalled, or the enemy
//    outguns us two to one.
//  - A battle group, when at war (or a war is on the table) without one.
// Deliberately NOT proposed: offence-desk verbs (press campaigns, marques,
// sponsorships) — a feed that nags about twenty small levers is noise, and
// noise is what this exists to remove. Fog: the candidates are judged from
// the full world, as the AI judges them; the proposal text names only the
// target and the motive, never the numbers.

import type { GameWorldState } from '@/lib/game-world-state';
import { adviseOrder, type AdviceResult } from '@/lib/delegation/advisor-proposals';
import { isAtWar } from '@/lib/diplomacy/offer-service';
import { factionFleetPower } from '@/lib/diplomacy/gambit-service';
import { warEnemiesOf } from '@/lib/ai/belt-ambush-ai';
import { checkOrderTechGate } from '@/lib/tech/order-gates';
import { POLITICAL_CAPITAL_COSTS } from '@/lib/actions/political-costs';
import {
    WAR, aiWarWantsPeace, isWarfleetId, seasonAgeSeconds, warCandidates, warFatigueOf, warfleetQuoteFor,
    type WarMotive,
} from '@/lib/ai/war-ai';

const DAY = 86400;
/** Peace is advised when the enemy's fleets are this many times ours. */
const OUTGUNNED_RATIO = 2;
/** Carried from the war AI: the strongest standing battle group count it keeps. */
const MIN_BATTLE_GROUPS_AT_WAR = 1;

export interface AdvisorDeskReport { factionId: string; advice: string; result: AdviceResult }

/** Every human faction's advisors write up what they would do. */
export function runAdvisorDesk(world: GameWorldState): AdvisorDeskReport[] {
    const claimed: string[] = Array.isArray((world as any).claimedFactionIds) ? (world as any).claimedFactionIds : [];
    const out: AdvisorDeskReport[] = [];
    for (const factionId of [...claimed].sort()) {
        if (!world.economy.factions.has(factionId)) continue;
        try {
            adviseOnWar(world, factionId, out);
            adviseOnPeace(world, factionId, out);
            adviseOnArming(world, factionId, out);
        } catch (e: any) {
            console.error(`[Advisors] ${factionId} desk failed:`, e?.message ?? e);
        }
    }
    return out;
}

function nameOf(world: GameWorldState, id: string): string {
    return (world as any).factionNames?.[id] ?? (world.economy.factions.get(id) as any)?.name ?? id;
}

/** The order would be refused at the gate or cannot be paid in political capital: do not ask. */
function canBeOrdered(world: GameWorldState, factionId: string, actionId: string): boolean {
    if (!checkOrderTechGate(world as any, factionId, actionId).allowed) return false;
    const price = POLITICAL_CAPITAL_COSTS[actionId] ?? 0;
    const pc = Number((world as any).government?.get?.(factionId)?.politicalCapital);
    return !(price > 0 && Number.isFinite(pc) && pc < price);
}

const MOTIVE_LINE: Record<WarMotive, string> = {
    transcendence: 'is close to transcending, and will not stop on its own. A war now is the last chance to stop the clock.',
    grievance: 'has given us grievance enough, and our fleets outmatch theirs. The staff judge a war winnable.',
    opportunity: 'is a weak neighbour with worlds to lose, and we have the strength to take them.',
};

// ─── War ─────────────────────────────────────────────────────────────────────

function adviseOnWar(world: GameWorldState, factionId: string, out: AdvisorDeskReport[]): void {
    if (seasonAgeSeconds(world) < WAR.graceDays * DAY) return;
    if (warFatigueOf(world, factionId) >= 40) return;
    const enemies = [...warEnemiesOf(world as any, factionId)];
    if (enemies.length >= WAR.maxOwnWars) return;
    if (!canBeOrdered(world, factionId, 'DIP_DECLARE_WAR')) return;

    const candidate = warCandidates(world, factionId)[0];
    if (!candidate) return;
    const target = nameOf(world, candidate.targetId);
    const result = adviseOrder(world as any, {
        system: 'military',
        factionId,
        actionId: 'DIP_DECLARE_WAR',
        payload: { targetFactionId: candidate.targetId },
        title: `The Admiralty advises war on ${target}`,
        detail: `${target} ${MOTIVE_LINE[candidate.motive]} Declaring costs ${POLITICAL_CAPITAL_COSTS.DIP_DECLARE_WAR ?? 0} political capital and breaks any non-aggression pact.`,
        reason: `advises war of ${candidate.motive} on ${candidate.targetId}`,
    });
    out.push({ factionId, advice: `war on ${candidate.targetId} (${candidate.motive})`, result });
}

// ─── Peace ───────────────────────────────────────────────────────────────────

function adviseOnPeace(world: GameWorldState, factionId: string, out: AdvisorDeskReport[]): void {
    if (!canBeOrdered(world, factionId, 'DIP_OFFER_PEACE')) return;
    const ours = factionFleetPower(world, factionId);
    for (const enemyId of [...warEnemiesOf(world as any, factionId)].sort()) {
        if (!isAtWar(world, factionId, enemyId)) continue;
        const weary = warFatigueOf(world, factionId) >= 40;
        const stalled = aiWarWantsPeace(world, factionId, enemyId);
        const outgunned = factionFleetPower(world, enemyId) >= Math.max(1, ours) * OUTGUNNED_RATIO;
        if (!weary && !stalled && !outgunned) continue;
        const why = weary ? 'the people are tired of this war'
            : stalled ? 'the campaign has stalled and there is nothing left to win'
            : 'their fleets outgun ours two to one';
        const enemy = nameOf(world, enemyId);
        const result = adviseOrder(world as any, {
            system: 'diplomacy',
            factionId,
            actionId: 'DIP_OFFER_PEACE',
            payload: { targetFactionId: enemyId },
            title: `The Foreign Office advises peace with ${enemy}`,
            detail: `Sue ${enemy} for peace: ${why}. They may still refuse.`,
            reason: `advises peace with ${enemyId}: ${why}`,
        });
        out.push({ factionId, advice: `peace with ${enemyId}`, result });
    }
}

// ─── Arming ──────────────────────────────────────────────────────────────────

function adviseOnArming(world: GameWorldState, factionId: string, out: AdvisorDeskReport[]): void {
    const atWar = warEnemiesOf(world as any, factionId).size > 0;
    const threatened = !atWar && seasonAgeSeconds(world) >= WAR.graceDays * DAY && warCandidates(world, factionId).length > 0;
    if (!atWar && !threatened) return;
    const groups = [...world.movement.fleets.values()].filter(f => f.factionId === factionId && isWarfleetId(f.id)).length;
    if (groups >= MIN_BATTLE_GROUPS_AT_WAR) return;
    const quote = warfleetQuoteFor(world, factionId);
    if (!quote) return;
    const capital = (world.economy.factions.get(factionId) as any)?.capitalSystemId;
    const yard = [...world.construction.planets.values()].find((p: any) => p.ownerId === factionId && p.systemId === capital) as any;
    if (!yard) return;
    const mix = Object.entries(quote.composition).map(([cls, n]) => `${n} ${cls}${n === 1 ? '' : 's'}`).join(', ');
    const price = Object.entries(quote.cost).map(([k, v]) => `${Math.round(v)} ${k.toLowerCase()}`).join(', ');
    const result = adviseOrder(world as any, {
        system: 'military',
        factionId,
        actionId: 'MIL_BUILD_FLEET',
        payload: { planetId: yard.id, systemId: capital, composition: quote.composition },
        replay: 'warfleet',
        topic: 'MIL_BUILD_FLEET:warfleet',
        title: atWar ? 'The Admiralty asks for a battle group' : 'The Admiralty asks for a battle group before the storm',
        detail: `${atWar ? 'We are at war with no battle group.' : 'A war is on the table and we have no battle group.'} The capital yard can lay ${mix} for about ${price}; the hulls take their usual time to build.`,
        reason: 'advises a battle group',
    });
    out.push({ factionId, advice: 'battle group', result });
}
