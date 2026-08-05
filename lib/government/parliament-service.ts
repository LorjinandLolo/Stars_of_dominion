// lib/government/parliament-service.ts
// Stars of Dominion — Government & Leadership, Phase 4 (parliament + elections).
//
// `senate_power` and `executive_power` have sat in data/governments since the
// registry was written, read by nothing. They decide the shape of the game here:
// a chamber with real power means legislation is negotiated, not issued, and an
// elected leader eventually has to face the voters.

import type { GameWorldState } from '@/lib/game-world-state';
import type { GovernmentState, Party, PendingBill } from './types';
import type { Leader } from '@/lib/leadership/types';
import { RNG } from '@/lib/trade-system/rng';
import { seedFromString } from '@/lib/leadership/leader-generator';
import { initRegistries, policyRegistry, blocRegistry } from '@/lib/politics/registry';
import { fireNotification } from '@/lib/time/notification-hooks';
import { pushWorldStory } from '@/lib/press-system/integration';
import { getGovernment, spendPoliticalCapital } from './government-service';
import { getHeadOfState, resolveSuccession } from './succession-service';
import { policyEnactCost } from './policy-service';
import { recordPoliticalEvent } from './ideology-drift';

/** Above this senate_power, the chamber must approve legislation. */
export const PARLIAMENT_SENATE_THRESHOLD = 40;
/** Sim seconds a bill sits before the chamber divides (2 sim days). */
const BILL_DEBATE_SECONDS = 2 * 86400;
/** Seat share needed to pass. */
const PASS_THRESHOLD = 50;
/** Sim seconds in an elected term (20 sim days ≈ 10 sim years of ageing). */
const TERM_SECONDS = 20 * 86400;

/** Capital to whip one party. */
export const LOBBY_PARTY_COST = 8;
/** Seats a successful lobby swings. */
const LOBBY_SEAT_SWING = 12;
/** Multiplier on a policy's cost when the executive rules past the chamber. */
const DECREE_COST_MULTIPLIER = 1.5;

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

/** Does this government have to win votes? */
export function hasParliament(gov: GovernmentState): boolean {
    return (gov.senatePower ?? 0) >= PARLIAMENT_SENATE_THRESHOLD;
}

/** Does this government face the voters? */
export function isElected(gov: GovernmentState): boolean {
    const tags = gov.tags ?? [];
    return tags.includes('elected_leadership') || tags.includes('democracy') || tags.includes('senate_system');
}

/**
 * Chamber composition, derived from the interest-group blocs: seats follow
 * influence, disposition follows satisfaction.
 */
export function computeParties(world: GameWorldState, factionId: string): Party[] {
    const posture = world.movement.empirePostures.get(factionId);
    const blocs = posture?.blocs ?? [];
    if (blocs.length === 0) return [];

    const total = blocs.reduce((s, b) => s + b.influence, 0) || 1;
    return blocs.map(bloc => ({
        id: bloc.id,
        name: bloc.name,
        seats: (bloc.influence / total) * 100,
        stance: Math.max(-1, Math.min(1, (bloc.satisfaction - 50) / 50)),
    }));
}

/**
 * How each party reads a specific bill: its own interests first (policy
 * support/oppose tags against the bloc's tags), then how it feels about the
 * government in general, then the head of state's ability to sell it.
 */
function partyVoteScore(
    party: Party,
    policyId: string,
    gov: GovernmentState,
    leader: Leader | undefined,
    lobbied: boolean
): number {
    initRegistries();
    const policy = policyRegistry.get(policyId);
    const blocDef = blocRegistry.get(party.id);
    const blocTags = blocDef?.tags ?? [];

    let score = 0;
    if (policy) {
        if (blocDef?.favored_policies?.includes(policyId)) score += 0.8;
        if (policy.support_tags?.some(t => blocTags.includes(t))) score += 0.7;
        if (policy.oppose_tags?.some(t => blocTags.includes(t))) score -= 0.9;
    }

    // Goodwill toward the government carries a bill some way on its own.
    score += party.stance * 0.5;
    score += ((gov.approval ?? 50) - 50) / 100;
    score += (((leader?.politicalSkill ?? 50) - 50) / 100) * 0.6;
    if (lobbied) score += 0.9;

    return score;
}

/** Projected yes-seats for a bill, 0–100. */
export function projectSupport(
    world: GameWorldState,
    gov: GovernmentState,
    bill: PendingBill
): number {
    const leader = getHeadOfState(world, gov.factionId);
    let yes = 0;

    for (const party of gov.parties ?? []) {
        const score = partyVoteScore(party, bill.policyId, gov, leader, bill.lobbied.includes(party.id));
        if (score > 0.15) yes += party.seats;
        // A party that is merely lukewarm abstains rather than opposing; the
        // swing seats are what lobbying is for.
        else if (score > -0.15) yes += party.seats * 0.35;
        else if (bill.lobbied.includes(party.id)) yes += party.seats * (LOBBY_SEAT_SWING / 100);
    }

    return clamp100(yes);
}

export interface BillResult {
    ok: boolean;
    message?: string;
    billId?: string;
}

/** Table a policy before the chamber. Called by the policy service. */
export function tableBill(
    world: GameWorldState,
    gov: GovernmentState,
    policyId: string,
    policyName: string
): BillResult {
    if (gov.bills.some(b => b.policyId === policyId && b.status === 'pending')) {
        return { ok: false, message: `${policyName} is already before the ${gov.institutionName}.` };
    }

    const bill: PendingBill = {
        id: `bill-${gov.factionId}-${policyId}-${world.nowSeconds}`,
        policyId,
        policyName,
        tabledAtSeconds: world.nowSeconds,
        resolvesAtSeconds: world.nowSeconds + BILL_DEBATE_SECONDS,
        projectedSupport: 0,
        lobbied: [],
        status: 'pending',
    };
    bill.projectedSupport = projectSupport(world, gov, bill);
    gov.bills.push(bill);
    gov.history.push({ timestamp: world.nowSeconds, event: `${policyName} tabled before the ${gov.institutionName}.` });

    return { ok: true, billId: bill.id };
}

export interface LobbyResult {
    ok: boolean;
    message?: string;
    projectedSupport?: number;
}

/**
 * Spend capital whipping one party on one bill. Capital is charged here so a
 * refused lobby costs nothing.
 */
export function lobbyParty(
    world: GameWorldState,
    factionId: string,
    billId: string,
    partyId: string
): LobbyResult {
    const gov = getGovernment(world, factionId);
    if (!gov) return { ok: false, message: 'This faction has no government.' };

    const bill = gov.bills.find(b => b.id === billId && b.status === 'pending');
    if (!bill) return { ok: false, message: 'That bill is no longer before the chamber.' };
    if (!gov.parties.some(p => p.id === partyId)) return { ok: false, message: 'No such party sits in this chamber.' };
    if (bill.lobbied.includes(partyId)) return { ok: false, message: 'That party has already been whipped on this bill.' };

    if (!spendPoliticalCapital(world, factionId, LOBBY_PARTY_COST, `lobbied ${partyId} on ${bill.policyName}`)) {
        return { ok: false, message: `Lobbying needs ${LOBBY_PARTY_COST} political capital.` };
    }

    bill.lobbied.push(partyId);
    bill.projectedSupport = projectSupport(world, gov, bill);
    return { ok: true, projectedSupport: bill.projectedSupport };
}

/**
 * Resolve bills whose debate has run out, refresh party composition, and run
 * elections that have come due.
 */
export function tickParliament(world: GameWorldState, deltaSeconds: number): void {
    if (!(world.government instanceof Map)) return;

    for (const gov of world.government.values()) {
        if (!Array.isArray(gov.bills)) gov.bills = [];
        gov.parties = computeParties(world, gov.factionId);

        for (const bill of gov.bills) {
            if (bill.status !== 'pending') continue;
            bill.projectedSupport = projectSupport(world, gov, bill);
            if (world.nowSeconds < bill.resolvesAtSeconds) continue;
            resolveBill(world, gov, bill);
        }

        // Keep only the last handful of decided bills for the UI record.
        const decided = gov.bills.filter(b => b.status !== 'pending');
        if (decided.length > 8) {
            const keep = new Set(decided.slice(-8).map(b => b.id));
            gov.bills = gov.bills.filter(b => b.status === 'pending' || keep.has(b.id));
        }

        tickElection(world, gov, deltaSeconds);
    }
}

/** Divide the chamber on one bill and apply the outcome. */
export function resolveBill(world: GameWorldState, gov: GovernmentState, bill: PendingBill): void {
    const support = projectSupport(world, gov, bill);
    bill.projectedSupport = support;

    if (support >= PASS_THRESHOLD) {
        bill.status = 'passed';
        if (!gov.activePolicies.includes(bill.policyId)) gov.activePolicies.push(bill.policyId);
        gov.history.push({
            timestamp: world.nowSeconds,
            event: `${gov.institutionName} passed ${bill.policyName} (${Math.round(support)}% of seats).`,
        });
        applyBillIdeology(world, gov.factionId, bill.policyId, 1);
    } else {
        bill.status = 'failed';
        // A government that loses a division looks weak, and the chamber knows it.
        gov.legitimacy = clamp100(gov.legitimacy - 3);
        gov.history.push({
            timestamp: world.nowSeconds,
            event: `${gov.institutionName} rejected ${bill.policyName} (${Math.round(support)}% of seats).`,
        });
    }

    notify(world, gov.factionId, {
        id: `bill-${bill.id}`,
        title: bill.status === 'passed' ? 'Bill Passed' : 'Bill Defeated',
        body: `${bill.policyName}: ${Math.round(support)}% of the chamber in favour.`,
        priority: bill.status === 'passed' ? 'normal' : 'urgent',
    });
}

/** Shift the empire's ideology by a policy's imprint (scale 1 = full). */
function applyBillIdeology(world: GameWorldState, factionId: string, policyId: string, scale: number): void {
    initRegistries();
    const shift = policyRegistry.get(policyId)?.ideology_shift;
    const ideology = world.movement.empirePostures.get(factionId)?.ideology as unknown as Record<string, number> | undefined;
    if (!shift || !ideology) return;

    for (const [axis, delta] of Object.entries(shift)) {
        if (typeof ideology[axis] !== 'number') continue;
        ideology[axis] = Math.max(-100, Math.min(100, ideology[axis] + delta * scale));
    }
}

export interface DecreeResult {
    ok: boolean;
    message?: string;
    cost?: number;
}

/**
 * Rule past the chamber. Legal in proportion to executive_power, but it costs
 * more capital than legislation, spends legitimacy, and the officer corps takes
 * note that this government does not need institutions.
 */
export function decreePolicy(world: GameWorldState, factionId: string, policyId: string): DecreeResult {
    initRegistries();
    const gov = getGovernment(world, factionId);
    if (!gov) return { ok: false, message: 'This faction has no government.' };

    const def = policyRegistry.get(policyId);
    if (!def) return { ok: false, message: `Unknown policy "${policyId}".` };
    if (gov.activePolicies.includes(policyId)) return { ok: false, message: `${def.name ?? policyId} is already in force.` };

    const cost = Math.round(policyEnactCost(def) * DECREE_COST_MULTIPLIER);
    if (!spendPoliticalCapital(world, factionId, cost, `decreed ${def.name ?? policyId}`)) {
        return { ok: false, message: `A decree needs ${cost} political capital; the government holds ${Math.floor(gov.politicalCapital)}.` };
    }

    gov.activePolicies.push(policyId);
    applyBillIdeology(world, factionId, policyId, 1);

    // Ruling by decree is cheap once and expensive as a habit.
    const chamberInsult = (gov.senatePower ?? 0) / 100;
    gov.legitimacy = clamp100(gov.legitimacy - 5 * (0.5 + chamberInsult));
    gov.coupPressure = clamp100((gov.coupPressure ?? 0) + 4 * chamberInsult);
    gov.history.push({ timestamp: world.nowSeconds, event: `${def.name ?? policyId} enacted by executive decree.` });

    // A pending bill on the same policy is overtaken by events.
    for (const bill of gov.bills) {
        if (bill.policyId === policyId && bill.status === 'pending') bill.status = 'passed';
    }

    return { ok: true, cost };
}

// ─── Elections ────────────────────────────────────────────────────────────────

/** Run an election when the term expires. */
function tickElection(world: GameWorldState, gov: GovernmentState, deltaSeconds: number): void {
    if (!isElected(gov)) return;

    const leader = getHeadOfState(world, gov.factionId);
    if (!leader) return;

    if (!gov.termEndsAtSeconds) {
        gov.termEndsAtSeconds = (leader.tookOfficeAtSeconds ?? world.nowSeconds) + TERM_SECONDS;
        return;
    }
    if (world.nowSeconds < gov.termEndsAtSeconds) return;

    holdElection(world, gov, leader);
}

/**
 * Decide the election: the incumbent's record (approval, legitimacy) and their
 * personal standing against a challenger who is always fresh.
 */
export function holdElection(world: GameWorldState, gov: GovernmentState, incumbent: Leader): boolean {
    const rng = new RNG(seedFromString(`${gov.factionId}|election|${world.nowSeconds}`));

    const record = (gov.approval - 50) / 50;                       // -1..1
    const standing = ((incumbent.popularity ?? 50) - 50) / 50;     // -1..1
    const mandate = (gov.legitimacy - 50) / 100;                   // -0.5..0.5
    // Foreign interference (espionage) is bought against the incumbent and is
    // spent whether it decided the race or not.
    const interference = (gov.electionInterference ?? 0) / 100;
    gov.electionInterference = 0;
    const incumbentScore = 0.5 + record * 0.3 + standing * 0.25 + mandate * 0.2 - interference;

    const won = rng.next() < Math.max(0.05, Math.min(0.95, incumbentScore));

    // Holding a real election is itself a liberalizing act (Phase 5 drift).
    recordPoliticalEvent(world, gov.factionId, 'election_held');

    if (won) {
        gov.termEndsAtSeconds = world.nowSeconds + TERM_SECONDS;
        gov.legitimacy = clamp100(gov.legitimacy + 6);
        incumbent.history.push({ timestamp: world.nowSeconds, description: 'Re-elected.' });
        gov.history.push({
            timestamp: world.nowSeconds,
            event: `${incumbent.title ?? 'The incumbent'} ${incumbent.name} was re-elected.`,
        });
        notify(world, gov.factionId, {
            id: `election-${gov.factionId}-${world.nowSeconds}`,
            title: 'Election Won',
            body: `${incumbent.title ?? ''} ${incumbent.name} returned to office.`.trim(),
            priority: 'normal',
        });
        try {
            pushWorldStory(world, {
                targetEmpireId: gov.factionId,
                subject: `${incumbent.name} re-elected`,
                magnitude: 50,
            });
        } catch { /* press state absent on minimal worlds */ }
        return true;
    }

    // Defeat is an orderly transfer: it costs far less than a death in office.
    const successor = resolveSuccession(world, gov.factionId, 'election_defeat');
    gov.termEndsAtSeconds = world.nowSeconds + TERM_SECONDS;
    gov.legitimacy = clamp100(gov.legitimacy + 4); // a working democracy proves itself
    gov.history.push({
        timestamp: world.nowSeconds,
        event: `${incumbent.name} lost the election to ${successor?.name ?? 'the opposition'}.`,
    });
    return false;
}

function notify(
    world: GameWorldState,
    factionId: string,
    input: { id: string; title: string; body: string; priority: 'low' | 'normal' | 'urgent' }
): void {
    try {
        fireNotification({
            id: input.id,
            factionId,
            category: 'politics',
            priority: input.priority,
            title: input.title,
            body: input.body,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'government',
            payload: {},
        });
    } catch { /* notification queue absent in tests */ }
}
