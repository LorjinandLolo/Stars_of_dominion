/**
 * lib/ai/offence-ai.ts
 * The offensive toolkit a player has and an AI court never touched — tier 3 of
 * the AI parity work. Every move is the player's own order, queued through
 * lib/ai/ai-orders.ts, at the player's price and through the player's gates.
 * WORKER-SIDE ONLY.
 *
 *   - Press:     launch / cancel campaigns, amplify or defend a foreign crisis,
 *                leak intel it holds, fabricate a story.
 *   - Diplomacy: envoys, rumours, gambits (ultimatum, show of force, accusation),
 *                tribute demands, promises of non-aggression, recognising and
 *                guaranteeing a rival's breakaway state.
 *   - Pirates:   letters of marque in war, covert sponsorship in a cold war,
 *                bounties on a band that preys on it; revoke and cut when done.
 *   - Companies: subsidise its own charters, set host policy on a rival's
 *                company, sell shares when the treasury is dry.
 *   - The Banking Clan lends to the poor and forecloses on defaulters.
 *   - Unique rites: the Sarrak serum, the Gabagoonian capacola surge, the
 *                Buthari Council's champions — when its people are fighting.
 *   - Agents:    keep a small roster and put it to work in a rival's capital.
 *
 * Reads only what the empire could see: public rivalry and power, its own
 * press desk, its own reports, case files and ledgers, the pirate bands'
 * public standing toward it. Chance gates keep the herd from moving at once.
 */

import type { GameWorldState } from '../game-world-state';
import { queueAIOrder, hasQueuedAIOrder, type AIOrder } from './ai-orders';
import { checkOrderTechGate } from '../tech/order-gates';
import { POLITICAL_CAPITAL_COSTS } from '../actions/political-costs';
import { intelArchetypeOf } from './intelligence-ai-service';
import { isAtWar, ensureDiplomacyState, findActiveTreaty } from '../diplomacy/offer-service';
import { factionFleetPower } from '../diplomacy/gambit-service';
import { ensurePressState, getPublicTrust } from '../press-system/integration';
import { CampaignConfig } from '../press-system/campaigns';
import { CampaignObjective } from '../press-system/types';
import { getGovernment } from '../government/government-service';
import { RECOGNIZE_COST, GUARANTEE_COST } from '../government/foreign-interference-service';
import { ensurePiracyState } from '../piracy/organization-service';
import { ensureCases } from '../espionage/case-board';
import { generateRecruitPool } from '../espionage/agent-service';
import { bankingState, badDebtRatio } from '../factions/banking-clan';
import { CIV_BANKING, CIV_BUTHARI, CIV_GABAGOON, CIV_SARRAK } from '../factions/civ-ids';
import { CAPACOLA_KEY, SURGE_FULL_SERVING, SURGE_MIN_SERVING } from '../factions/gabagoon';

const DAY = 86400;
const EXCLUDED = new Set(['faction-pirates', 'faction-neutral']);

// ─── Shared reads ────────────────────────────────────────────────────────────

/**
 * Queue only what the court could legally order. A player cannot see an
 * Envoy or Spy button before the research behind it, so the AI does not try
 * either: a refused order costs nothing, but it fills the failure log and
 * wastes the turn's one move.
 */
function order(world: GameWorldState, o: AIOrder): boolean {
    if (!checkOrderTechGate(world as any, o.factionId, o.actionId).allowed) return false;
    // The authority price, with room left for the state desk's appointments
    // and a secession crisis: offence is never paid for with the ability to govern.
    const price = POLITICAL_CAPITAL_COSTS[o.actionId] ?? 0;
    const gov = getGovernment(world, o.factionId);
    if (price > 0 && gov && gov.politicalCapital - pcCommitted(world, o.factionId) < price + OFFENCE_PC_RESERVE) return false;
    if (!queueAIOrder(world, o)) return false;
    if (price > 0) committed.set(o.factionId, pcCommitted(world, o.factionId) + price);
    return true;
}

/** Political capital an AI keeps for governing; offence spends only above it. */
export const OFFENCE_PC_RESERVE = 20;
/** Capital already promised to orders queued this turn (the handler charges at drain). */
const committed = new Map<string, number>();
let committedAt = -1;
function pcCommitted(world: GameWorldState, factionId: string): number {
    if (committedAt !== world.nowSeconds) { committed.clear(); committedAt = world.nowSeconds; }
    return committed.get(factionId) ?? 0;
}

function rivalryOf(world: GameWorldState, a: string, b: string): { score: number; escalation: number } {
    const r: any = world.rivalries?.get?.(`rivalry-${a}-${b}`) ?? world.rivalries?.get?.(`rivalry-${b}-${a}`);
    return { score: r?.rivalryScore ?? 20, escalation: r?.escalationLevel ?? 0 };
}

function credits(world: GameWorldState, factionId: string): number {
    return Number((world.economy.factions.get(factionId)?.reserves as any)?.CREDITS ?? 0);
}

function politicalCapital(world: GameWorldState, factionId: string): number {
    return getGovernment(world, factionId)?.politicalCapital ?? 0;
}

function civOf(world: GameWorldState, factionId: string): string | undefined {
    return (world.economy.factions.get(factionId) as any)?.civilizationId;
}

function empiresBesides(world: GameWorldState, factionId: string): string[] {
    return [...world.economy.factions.keys()].filter(id => id !== factionId && !EXCLUDED.has(id)).sort();
}

/** Rivals worth hurting, worst first: enemies at war, then the bitterly hated. */
function rivalsOf(world: GameWorldState, factionId: string, minScore: number): string[] {
    return empiresBesides(world, factionId)
        .map(id => ({ id, war: isAtWar(world, factionId, id), score: rivalryOf(world, factionId, id).score }))
        .filter(r => r.war || r.score >= minScore)
        .sort((a, b) => Number(b.war) - Number(a.war) || b.score - a.score || a.id.localeCompare(b.id))
        .map(r => r.id);
}

/** AI-side memory for cadences the handlers do not enforce (envoys, subsidies). */
function memoryOf(world: GameWorldState, factionId: string): { last: Record<string, number> } {
    const root = ((world as any).aiOffence ??= {});
    return (root[factionId] ??= { last: {} });
}
function due(world: GameWorldState, factionId: string, key: string, everySeconds: number): boolean {
    return world.nowSeconds - (memoryOf(world, factionId).last[key] ?? -Infinity) >= everySeconds;
}
function stamp(world: GameWorldState, factionId: string, key: string): void {
    memoryOf(world, factionId).last[key] = world.nowSeconds;
}

/** AI_OFFENCE_SKIP also names sub-moves (envoy, rumour, gambit, tribute, promise) for tuning. */
const skipped = (label: string) => String(process.env.AI_OFFENCE_SKIP ?? '').split(',').map(s => s.trim()).includes(label);

const isCovertCourt = (factionId: string) =>
    ['shadow_empire', 'revolution_exporter', 'economic_subverter'].includes(intelArchetypeOf(factionId) ?? '');

/** Is this empire's own blood being spilled right now — a siege, or its fleets sharing a system with an enemy's? */
export function isEngaged(world: GameWorldState, factionId: string): boolean {
    for (const p of world.construction.planets.values() as Iterable<any>) {
        const s = p.siege;
        if (s && (s.attackerEmpireId === factionId || s.defenderEmpireId === factionId)) return true;
    }
    const enemySystems = new Set<string>();
    const mine: string[] = [];
    for (const f of world.movement.fleets.values() as Iterable<any>) {
        if (!f.currentSystemId) continue;
        if (f.factionId === factionId) mine.push(f.currentSystemId);
        else if (f.factionId && isAtWar(world, factionId, f.factionId)) enemySystems.add(f.currentSystemId);
    }
    return mine.some(s => enemySystems.has(s));
}

// ─── Press ───────────────────────────────────────────────────────────────────

/** Narrative influence kept back so the press office can still answer an attack. */
export const PRESS_DEFENCE_RESERVE = 10;
const REACTION_COST = 3;
const FABRICATE_COST = 10;

export function runPressOffence(world: GameWorldState, factionId: string): string[] {
    const done: string[] = [];
    const press = ensurePressState(world);
    const me = press.empires.get(factionId);
    if (!me) return done;
    let influence = Number(me.narrativeInfluence ?? 0) - PRESS_DEFENCE_RESERVE;

    const own = [...press.campaigns.values()].filter(c => c.active && c.attackerId === factionId);
    // Wind down a campaign about to be traced back, or against someone it no longer quarrels with.
    for (const c of own) {
        if ((c.signaled && c.exposure >= 70) || rivalryOf(world, factionId, c.targetEmpireId).score < 30 && !isAtWar(world, factionId, c.targetEmpireId)) {
            if (order(world, { factionId, actionId: 'PRESS_CANCEL_CAMPAIGN', payload: { campaignId: c.id }, reason: `winds down ${c.id}` })) done.push(`wound down the campaign against ${c.targetEmpireId}`);
        }
    }

    const maxCampaigns = isCovertCourt(factionId) ? 2 : 1;
    const targeted = new Set(own.map(c => c.targetEmpireId));
    if (own.length < maxCampaigns && influence >= CampaignConfig.launchCost) {
        const target = rivalsOf(world, factionId, 55).find(id => !targeted.has(id) && press.empires.has(id));
        if (target) {
            const objective = isAtWar(world, factionId, target) ? CampaignObjective.STOKE_UNREST
                : intelArchetypeOf(factionId) === 'economic_subverter' ? CampaignObjective.UNDERMINE_TRUST
                : CampaignObjective.DAMAGE_CREDIBILITY;
            influence -= CampaignConfig.launchCost;
            if (order(world, { factionId, actionId: 'PRESS_LAUNCH_CAMPAIGN', payload: { targetFactionId: target, objective }, reason: `${objective} vs ${target}` })) done.push(`launched a ${objective} campaign against ${target}`);
        }
    }

    // Take a side on rivals' and friends' media crises.
    for (const crisis of press.crises.values()) {
        if (crisis.resolved || crisis.targetEmpireId === factionId || crisis.reactions?.[factionId]) continue;
        if (influence < REACTION_COST) break;
        const them = crisis.targetEmpireId;
        const rel = rivalryOf(world, factionId, them).score;
        const reaction = (isAtWar(world, factionId, them) || rel >= 55) ? 'AMPLIFY'
            : (rel < 25 || findActiveTreaty(world, factionId, them, 'non_aggression')) ? 'DEFEND' : null;
        if (!reaction) continue;
        influence -= REACTION_COST;
        if (order(world, { factionId, actionId: 'PRESS_CRISIS_REACT', payload: { crisisId: crisis.id, reaction }, reason: `${reaction} on ${them}'s crisis` })) done.push(`${reaction.toLowerCase()}ed ${them}'s crisis`);
    }

    // Leak the best report it holds on a rival (costs nothing but the asset).
    if (Math.random() < 0.3) {
        const rivals = new Set(rivalsOf(world, factionId, 55));
        const report = [...world.espionage.reports.values()]
            .filter(r => r.ownerFactionId === factionId && rivals.has(r.targetFactionId) && r.confidence >= 0.7)
            .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))[0];
        if (report) {
            if (order(world, { factionId, actionId: 'PRESS_LEAK_INTEL', payload: { reportId: report.id }, reason: `leaks ${report.id}` })) done.push(`leaked a report on ${report.targetFactionId}`);
        }
    }

    // Covert courts make things up.
    if (isCovertCourt(factionId) && influence >= FABRICATE_COST && Math.random() < 0.15) {
        const target = rivalsOf(world, factionId, 65)[0];
        if (target && press.empires.has(target)) {
            if (order(world, { factionId, actionId: 'PRESS_FABRICATE_STORY', payload: { targetFactionId: target, subject: 'Officials Accused of Quiet Corruption' }, reason: `fabricates on ${target}` })) done.push(`fabricated a story about ${target}`);
        }
    }
    return done;
}

// ─── Diplomacy ───────────────────────────────────────────────────────────────

export const ENVOY_EVERY_SECONDS = 5 * DAY;
/** Rivalry before an AI smears a rival, how often it will, and its own trust floor for trying. */
export const RUMOUR_RIVALRY = 65;
export const RUMOUR_EVERY_SECONDS = 4 * DAY;
export const RUMOUR_MIN_OWN_TRUST = 45;
/** The rumour mill carries one AI story about an empire at a time (galaxy-wide). */
export const RUMOUR_MILL_BUSY_SECONDS = 2 * DAY;
export const ULTIMATUM_CREDITS = 3000;
export const TRIBUTE_PER_TICK = 150;
/** Political capital kept back when meddling in someone else's civil war. */
const MEDDLE_RESERVE = 20;

export function runDiplomaticOffence(world: GameWorldState, factionId: string): string[] {
    const done: string[] = [];
    const dip = ensureDiplomacyState(world);
    const myPower = Math.max(1, factionFleetPower(world, factionId));
    const others = empiresBesides(world, factionId);

    // Envoys to cool a quarrel it does not want — one at a time, never twice in five days.
    if (!skipped('envoy') && credits(world, factionId) >= 1000 && Math.random() < 0.25) {
        const target = others.find(id => {
            const { score } = rivalryOf(world, factionId, id);
            return score >= 35 && score < 60 && !isAtWar(world, factionId, id) && due(world, factionId, `envoy:${id}`, ENVOY_EVERY_SECONDS);
        });
        if (target) {
            stamp(world, factionId, `envoy:${target}`);
            if (order(world, { factionId, actionId: 'DIP_SEND_ENVOY', payload: { targetFactionId: target }, reason: `cools tension with ${target}` })) done.push(`sent an envoy to ${target}`);
        }
    }

    // A whisper about a rival. Rarely, and never piling on: every court that
    // hated the galaxy's pariah used to smear it daily and its public trust hit
    // zero (approval-probe). A rumour traced back costs the planter trust too,
    // so a court whose own name is already muddied keeps quiet.
    if (!skipped('rumour') && Math.random() < 0.15 && getPublicTrust(world, factionId) >= RUMOUR_MIN_OWN_TRUST) {
        const mill = ((world as any).aiOffence ??= {}).__rumourMill ??= {} as Record<string, number>;
        const target = rivalsOf(world, factionId, RUMOUR_RIVALRY).find(id => !isAtWar(world, factionId, id)
            && due(world, factionId, `rumour:${id}`, RUMOUR_EVERY_SECONDS)
            && world.nowSeconds - (mill[id] ?? -Infinity) >= RUMOUR_MILL_BUSY_SECONDS);
        if (target && order(world, { factionId, actionId: 'DIP_PLANT_RUMOR', payload: { targetFactionId: target }, reason: `rumour on ${target}` })) {
            stamp(world, factionId, `rumour:${target}`);
            mill[target] = world.nowSeconds;
            done.push(`planted a rumour about ${target}`);
        }
    }

    // Gambits: peacetime pressure on a rival it outguns, or a file it can back.
    const pendingGambit = (to: string) => [...dip.gambits.values()].some(g => g.status === 'pending' && g.initiatorId === factionId && g.targetId === to);
    if (!skipped('gambit') && Math.random() < 0.2) {
        for (const target of rivalsOf(world, factionId, 45)) {
            if (isAtWar(world, factionId, target) || pendingGambit(target)) continue;
            const { escalation } = rivalryOf(world, factionId, target);
            const ratio = myPower / Math.max(1, factionFleetPower(world, target));
            const suspected = [...ensureCases(world).values()].some(c => c.ownerFactionId === factionId && c.status === 'open' && c.suspectIds.includes(target));
            let payload: any = null;
            if (escalation >= 2 && ratio >= 1.3) payload = { kind: 'ultimatum', targetFactionId: target, demandCredits: ULTIMATUM_CREDITS, prediction: ratio >= 2 ? 'concede' : 'reject' };
            else if (escalation >= 1 && ratio >= 1.3) payload = { kind: 'show_of_force', targetFactionId: target, prediction: 'submit' };
            else if (suspected) payload = { kind: 'espionage_accusation', targetFactionId: target, prediction: 'deny' };
            if (!payload) continue;
            if (order(world, { factionId, actionId: 'DIP_LAUNCH_GAMBIT', payload, reason: `${payload.kind} on ${target}` })) done.push(`launched a ${payload.kind} against ${target}`);
            break;
        }
    }

    // Tribute from a much weaker neighbour it resents.
    if (!skipped('tribute') && Math.random() < 0.1) {
        const pendingTribute = new Set([...dip.offers.values()]
            .filter(o => o.status === 'pending' && o.kind === 'tribute_demand' && o.fromFactionId === factionId).map(o => o.toFactionId));
        const target = rivalsOf(world, factionId, 40).find(id => !isAtWar(world, factionId, id) && !pendingTribute.has(id)
            && myPower >= 2 * Math.max(1, factionFleetPower(world, id)));
        if (target) {
            if (order(world, { factionId, actionId: 'DIP_DEMAND_TRIBUTE', payload: { targetFactionId: target, amount: TRIBUTE_PER_TICK }, reason: `tribute from ${target}` })) done.push(`demanded tribute from ${target}`);
        }
    }

    // Appease a much stronger power that is turning hostile.
    if (!skipped('promise') && Math.random() < 0.2) {
        const promised = new Set([...((dip as any).promises?.values?.() ?? [])]
            .filter((p: any) => p.status === 'active' && p.promiserId === factionId).map((p: any) => p.beneficiaryId));
        const threat = others.find(id => {
            const { score } = rivalryOf(world, factionId, id);
            return score >= 50 && !isAtWar(world, factionId, id) && !promised.has(id)
                && !findActiveTreaty(world, factionId, id, 'non_aggression')
                && factionFleetPower(world, id) >= 1.5 * myPower;
        });
        if (threat) {
            if (order(world, { factionId, actionId: 'DIP_MAKE_PROMISE', payload: { kind: 'non_aggression', targetFactionId: threat, durationHours: 7 * 24 }, reason: `appeases ${threat}` })) done.push(`promised non-aggression to ${threat}`);
        }
    }

    // A rival's civil war: recognise the rebels, and guarantee them if at war with the parent.
    let capital = politicalCapital(world, factionId) - MEDDLE_RESERVE;
    for (const crisis of world.secessionCrises?.values() ?? []) {
        const rebel = crisis.rebelFactionId;
        if (!rebel || rebel === factionId || crisis.factionId === factionId || !world.economy.factions.has(rebel)) continue;
        const parent = crisis.factionId;
        const hostile = isAtWar(world, factionId, parent) || rivalryOf(world, factionId, parent).score >= 55;
        if (!hostile) continue;
        const rebelGov: any = getGovernment(world, rebel);
        if (!rebelGov) continue;
        if (!rebelGov.recognisedBy?.includes(factionId) && capital >= RECOGNIZE_COST) {
            capital -= RECOGNIZE_COST;
            if (order(world, { factionId, actionId: 'DIP_RECOGNIZE_BREAKAWAY', payload: { rebelFactionId: rebel }, reason: `recognises ${rebel} against ${parent}` })) done.push(`recognised ${rebel}`);
        } else if (isAtWar(world, factionId, parent) && rebelGov.recognisedBy?.includes(factionId)
            && !rebelGov.guaranteedBy?.includes(factionId) && capital >= GUARANTEE_COST) {
            capital -= GUARANTEE_COST;
            if (order(world, { factionId, actionId: 'DIP_GUARANTEE_BREAKAWAY', payload: { rebelFactionId: rebel }, reason: `guarantees ${rebel}` })) done.push(`guaranteed ${rebel}`);
        }
    }
    return done;
}

// ─── Pirates ─────────────────────────────────────────────────────────────────

export const MARQUE_MIN_CREDITS = 15000;
export const COVERT_SPONSOR_MIN_CREDITS = 25000;
export const BOUNTY_CREDITS = 2000;

function npcBands(world: GameWorldState, factionId: string): any[] {
    return [...ensurePiracyState(world).organizations.values()]
        .filter((o: any) => !o.dissolvedAtSeconds && !o.playerFactionId && (o.relations?.[factionId]?.standing ?? 0) > -20)
        .sort((a: any, b: any) => (b.fleetIds?.length ?? 0) - (a.fleetIds?.length ?? 0) || a.id.localeCompare(b.id));
}

export function runPirateOffence(world: GameWorldState, factionId: string): string[] {
    const done: string[] = [];
    const piracy = ensurePiracyState(world);
    const mine = [...piracy.sponsorships.values()].filter(s => s.sponsorFactionId === factionId && !s.revokedAtSeconds);

    for (const s of mine) {
        const target = s.targetFactionId;
        if (!s.covert && target && !isAtWar(world, factionId, target)) {
            if (order(world, { factionId, actionId: 'PIR_REVOKE_MARQUE', payload: { sponsorshipId: s.id }, reason: `war with ${target} is over` })) done.push(`revoked a marque against ${target}`);
        } else if (s.covert && (s.attributionState === 'exposed' || (target && rivalryOf(world, factionId, target).score < 40))) {
            if (order(world, { factionId, actionId: 'PIR_CUT_SPONSORSHIP', payload: { sponsorshipId: s.id }, reason: 'exposed or no longer needed' })) done.push(`cut a covert sponsorship`);
        }
    }

    const sponsoredAgainst = new Set(mine.map(s => s.targetFactionId));
    const bands = npcBands(world, factionId);
    // Letters of marque against an enemy at war (escalation 5+ is what the service demands).
    if (credits(world, factionId) >= MARQUE_MIN_CREDITS) {
        const enemy = rivalsOf(world, factionId, 100).find(id => isAtWar(world, factionId, id)
            && rivalryOf(world, factionId, id).escalation >= 5 && !sponsoredAgainst.has(id));
        const band = enemy && bands.find((o: any) => ![...piracy.sponsorships.values()].some(s => s.organizationId === o.id && s.sponsorFactionId === enemy));
        if (enemy && band) {
            if (order(world, { factionId, actionId: 'PIR_ISSUE_MARQUE', payload: { organizationId: band.id, targetFactionId: enemy }, reason: `${band.name} against ${enemy}` })) done.push(`issued ${band.name} a letter of marque against ${enemy}`);
        }
    }
    // A covert court funds a band against a rival it is not (yet) at war with.
    if (isCovertCourt(factionId) && credits(world, factionId) >= COVERT_SPONSOR_MIN_CREDITS && Math.random() < 0.1) {
        const target = rivalsOf(world, factionId, 65).find(id => !isAtWar(world, factionId, id) && !sponsoredAgainst.has(id));
        const band = bands[0];
        if (target && band) {
            if (order(world, {
                factionId, actionId: 'PIR_SPONSOR_ORG',
                payload: { organizationId: band.id, targetFactionId: target, intensity: 'harassment', fundingPerHour: 250, covert: true },
                reason: `quietly funds ${band.name} against ${target}`,
            })) done.push(`quietly funded ${band.name} against ${target}`);
        }
    }
    // A price on a band that preys on it.
    if (credits(world, factionId) >= BOUNTY_CREDITS * 5) {
        const open = new Set([...piracy.bounties.values()].filter(b => b.postedByFactionId === factionId && !b.claimedAtSeconds).map(b => b.targetOrganizationId));
        const predator = [...piracy.organizations.values()].find((o: any) => !o.dissolvedAtSeconds && (o.relations?.[factionId]?.standing ?? 0) <= -50 && !open.has(o.id));
        if (predator && !hasQueuedAIOrder(world, factionId, 'PIR_POST_BOUNTY')) {
            if (order(world, { factionId, actionId: 'PIR_POST_BOUNTY', payload: { targetOrgId: predator.id, credits: BOUNTY_CREDITS }, reason: `bounty on ${predator.name}` })) done.push(`posted a bounty on ${predator.name}`);
        }
    }
    return done;
}

// ─── Companies and the Banking Clan ──────────────────────────────────────────

export const SUBSIDY_CREDITS = 8000;
export const SUBSIDY_EVERY_SECONDS = 5 * DAY;
export const LOAN_MAX_PRINCIPAL = 15000;
export const LOAN_TERM_TICKS = 24;

export function runCorporateLevers(world: GameWorldState, factionId: string): string[] {
    const done: string[] = [];
    const corp: any = (world as any).corporate;
    if (!corp?.companies) return done;
    const treasury = credits(world, factionId);

    for (const company of corp.companies.values() as Iterable<any>) {
        if (company.dissolved || company.status === 'dissolved') continue;
        // Its own charter is struggling or drifting out of reach.
        if (company.foundingFactionId === factionId) {
            const struggling = (company.loyalty ?? 50) < 40 || (company.treasury ?? 0) < 2000;
            if (struggling && treasury >= SUBSIDY_CREDITS * 4 && due(world, factionId, `subsidy:${company.id}`, SUBSIDY_EVERY_SECONDS)) {
                stamp(world, factionId, `subsidy:${company.id}`);
                if (order(world, { factionId, actionId: 'CORP_SUBSIDIZE', payload: { companyId: company.id, amount: SUBSIDY_CREDITS }, reason: `props up ${company.id}` })) done.push(`subsidised ${company.charter?.fullName ?? company.id}`);
            }
            continue;
        }
        // A rival's company working its space.
        if ((company.operatingFactionIds ?? []).includes(factionId)) {
            const founder = company.foundingFactionId;
            const war = isAtWar(world, factionId, founder);
            const score = rivalryOf(world, factionId, founder).score;
            const want = war ? { stance: 'banned', tariffRate: 0 } : score >= 65 ? { stance: 'taxed', tariffRate: 0.2 } : null;
            const current = corp.hostPolicies?.get?.(`${factionId}:${company.id}`);
            if (want && current?.stance !== want.stance) {
                if (order(world, { factionId, actionId: 'CORP_SET_HOST_POLICY', payload: { companyId: company.id, ...want }, reason: `${want.stance} for ${founder}'s company` })) done.push(`${want.stance} ${company.charter?.fullName ?? company.id}`);
            }
        }
        // Broke: cash in half of a foreign stake.
        const held = Number(company.shareholders?.[factionId] ?? 0);
        if (treasury < 3000 && held >= 2 && company.foundingFactionId !== factionId) {
            if (order(world, { factionId, actionId: 'CORP_SELL_SHARES', payload: { companyId: company.id, shareCount: Math.floor(held / 2) }, reason: 'treasury dry' })) done.push(`sold shares in ${company.id}`);
        }
    }
    return done;
}

export function runBankingClan(world: GameWorldState, factionId: string): string[] {
    const done: string[] = [];
    if (civOf(world, factionId) !== CIV_BANKING) return done;
    const st: any = bankingState(world, factionId);
    if (!st) return done;
    const loans: any[] = Object.values(st.loans ?? {});
    for (const loan of loans) {
        if (loan.status === 'defaulted') {
            if (order(world, { factionId, actionId: 'BNK_FORECLOSE', payload: { loanId: loan.id }, reason: `${loan.borrowerFactionId} defaulted` })) done.push(`foreclosed on ${loan.borrowerFactionId}`);
        }
    }
    const vault = credits(world, factionId);
    if (badDebtRatio(world, factionId) < 0.25 && vault >= 60000 && Math.random() < 0.3) {
        const owing = new Set(loans.filter(l => l.status === 'active').map(l => l.borrowerFactionId));
        const borrower = empiresBesides(world, factionId).find(id => !owing.has(id) && credits(world, id) < 8000
            && !isAtWar(world, factionId, id) && rivalryOf(world, factionId, id).score < 45);
        if (borrower) {
            const principal = Math.floor(Math.min(LOAN_MAX_PRINCIPAL, vault * 0.15));
            if (order(world, { factionId, actionId: 'BNK_ISSUE_LOAN', payload: { targetFactionId: borrower, principal, termTicks: LOAN_TERM_TICKS }, reason: `lends ${principal} to ${borrower}` })) done.push(`lent ${principal} credits to ${borrower}`);
        }
    }
    return done;
}

// ─── Unique rites ────────────────────────────────────────────────────────────

export function runUniqueRites(world: GameWorldState, factionId: string): string[] {
    const done: string[] = [];
    const civ = civOf(world, factionId);
    if (civ !== CIV_SARRAK && civ !== CIV_GABAGOON && civ !== CIV_BUTHARI) return done;
    if (!isEngaged(world, factionId)) return done;

    if (civ === CIV_SARRAK) {
        // The gate refuses mid-withdrawal; a refused order costs nothing.
        if (order(world, { factionId, actionId: 'SAR_ADMINISTER_SERUM', payload: {}, reason: 'the legions are fighting' })) done.push('administered the Divine Serum');
    } else if (civ === CIV_GABAGOON) {
        const pantry = Number((world.economy.factions.get(factionId)?.reserves as any)?.[CAPACOLA_KEY] ?? 0);
        if (pantry >= SURGE_MIN_SERVING * 2) {
            const amount = pantry >= SURGE_FULL_SERVING * 1.5 ? SURGE_FULL_SERVING : Math.floor(pantry / 2);
            if (order(world, { factionId, actionId: 'GAB_CAPACOLA_SURGE', payload: { amount }, reason: 'feast before battle' })) done.push(`surged on ${amount} capacola`);
        }
    } else {
        // Buthari: the Fire Bear for a besieged world of its own, else the Ibex for a fleet about to break.
        const besieged: any = [...world.construction.planets.values()].find((p: any) => p.siege?.defenderEmpireId === factionId);
        if (besieged) {
            if (order(world, { factionId, actionId: 'BUT_DEPLOY_CHAMPION', payload: { championId: 'zughra_flame', targetId: besieged.id }, reason: `Fire Bear over ${besieged.id}` })) done.push(`called the Fire Bear upon ${besieged.name ?? besieged.id}`);
        } else {
            const enemyAt = new Set([...world.movement.fleets.values()].filter((f: any) => f.currentSystemId && f.factionId && isAtWar(world, factionId, f.factionId)).map((f: any) => f.currentSystemId));
            const breaking: any = [...world.movement.fleets.values()].find((f: any) => f.factionId === factionId && enemyAt.has(f.currentSystemId) && (f.strength ?? 1) < 0.4);
            if (breaking) {
                if (order(world, { factionId, actionId: 'BUT_DEPLOY_CHAMPION', payload: { championId: 'gharnuq_leap', targetId: breaking.id }, reason: `Ibex carries ${breaking.id} clear` })) done.push(`called the Ibex for ${breaking.id}`);
            }
        }
    }
    return done;
}

// ─── Agents ──────────────────────────────────────────────────────────────────

const ROSTER: Record<string, number> = {
    shadow_empire: 3, precision_assassin: 3, economic_subverter: 2, revolution_exporter: 2, paranoid_security_state: 1,
};
export const DEFAULT_ROSTER = 2;

export function runAgentRoster(world: GameWorldState, factionId: string): string[] {
    const done: string[] = [];
    const agents = [...world.espionage.agents.values()].filter((a: any) => a.ownerFactionId === factionId
        && ['available', 'deployed', 'on_cooldown'].includes(a.status));
    const want = ROSTER[intelArchetypeOf(factionId) ?? ''] ?? DEFAULT_ROSTER;

    if (agents.length < want && !hasQueuedAIOrder(world, factionId, 'ESP_RECRUIT_AGENT')) {
        const species = civOf(world, factionId) ?? null;
        const pick = generateRecruitPool(factionId, world.nowSeconds, species)
            .filter(c => !c.species || c.species === species)
            .sort((a, b) => a.recruitmentCost - b.recruitmentCost || a.id.localeCompare(b.id))[0];
        if (pick && credits(world, factionId) >= pick.recruitmentCost * 3) {
            if (order(world, { factionId, actionId: 'ESP_RECRUIT_AGENT', payload: { candidate: pick }, reason: `hires ${pick.codename}` })) done.push(`recruited agent ${pick.codename}`);
        }
    }

    // Idle agents build a network in the worst rival's capital system; with no rival, at home.
    const target = rivalsOf(world, factionId, 50)[0];
    const system = (target && (world.economy.factions.get(target) as any)?.capitalSystemId)
        ?? (world.economy.factions.get(factionId) as any)?.capitalSystemId;
    if (system && credits(world, factionId) >= 500) {
        for (const agent of agents.filter((a: any) => a.status === 'available')) {
            if (hasQueuedAIOrder(world, factionId, 'ESP_ASSIGN_AGENT', p => p?.agentId === agent.id)) continue;
            if (order(world, { factionId, actionId: 'ESP_ASSIGN_AGENT', payload: { agentId: agent.id, systemId: system }, reason: `${agent.codename} to ${system}` })) done.push(`sent ${agent.codename} to ${system}`);
            break; // one deployment fee a turn
        }
    }
    return done;
}

/** The whole offensive desk, one strategic turn. Each part fails alone. */
export function runOffenceDesk(world: GameWorldState, factionId: string, stance: 'survival' | 'consolidating' | 'normal'): string[] {
    const done: string[] = [];
    if (process.env.AI_OFFENCE === 'off') return done;
    const parts: Array<[string, () => string[]]> = [
        // A state fighting for its life still bleeds the enemy and answers in kind,
        // but does not go looking for new quarrels.
        ['rites', () => runUniqueRites(world, factionId)],
        ['pirates', () => runPirateOffence(world, factionId)],
        ['banking', () => runBankingClan(world, factionId)],
        ['companies', () => runCorporateLevers(world, factionId)],
        ...(stance === 'survival' ? [] : [
            ['press', () => runPressOffence(world, factionId)],
            ['diplomacy', () => runDiplomaticOffence(world, factionId)],
            ['agents', () => runAgentRoster(world, factionId)],
        ] as Array<[string, () => string[]]>),
    ];
    // Tuning lever: AI_OFFENCE=off silences the desk, AI_OFFENCE_SKIP=press,diplomacy one part.
    const skip = new Set(String(process.env.AI_OFFENCE_SKIP ?? '').split(',').map(s => s.trim()).filter(Boolean));
    for (const [label, run] of parts) {
        if (skip.has(label)) continue;
        try {
            done.push(...run());
        } catch (e) {
            console.error(`[AI] ${factionId} ${label} offence failed:`, e);
        }
    }
    return done;
}
