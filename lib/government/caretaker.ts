// lib/government/caretaker.ts
// Stars of Dominion — the answers a caretaker government gives.
//
// Worlds in open defiance and regions asking to leave both wait on an answer,
// and silence is what wounds: an ignored demand costs the world its stability
// and the next rung of the ladder is revolt. A cabinet nobody polices grows
// corrupt until the scandals start. A player answers all three by order. Two
// kinds of government have nobody to give one:
//
//   - a human empire whose cabinet is delegated (lib/delegation) — the staff
//     answer for the player;
//   - an AI empire — which until now had no answer at all, so the first world
//     that went defiant took the whole empire down the ladder with it.
//
// Both get the same conservative answers, from here, through the same services
// a player's order goes through: every cost, refusal and side effect is the one
// the game already knows about. WORKER-SIDE ONLY.

import type { GameWorldState } from '@/lib/game-world-state';
import { dismissMinister, getMinister, DISMISS_MINISTER_COST } from './cabinet-service';
import { answerDefiance } from './defiance-service';
import { getGovernment, spendPoliticalCapital } from './government-service';
import { grantConcession } from './secession-service';
import { SECESSION_DEMANDS, type SecessionDemandId } from './secession-types';
import { CABINET_PORTFOLIOS, type CabinetPortfolio } from './types';

/**
 * Concessions that change what the empire IS — a region governing itself, a
 * parliament of its own — are a ruler's to grant. A caretaker may only trade
 * money and manpower: tax relief, resource rights, exemption from the draft.
 */
const CONSTITUTIONAL_DEMANDS = new Set<SecessionDemandId>(['autonomy', 'local_parliament']);

/** Cheapest first: a caretaker spends the least political capital that answers. */
function secessionCost(demandId: SecessionDemandId): number {
    return SECESSION_DEMANDS.find(d => d.id === demandId)?.politicalCapital ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Answer what is on the government's desk. Returns one line per thing done.
 *
 * Defiance: negotiate if the capital can pay for it, otherwise threaten, which
 * is cheaper and sometimes works. Never nothing.
 *
 * Secession: concede the cheapest thing the region actually asked for, one
 * concession per tick, and never a sovereignty demand. Giving away senate seats
 * or customs authority is a decision with a season-long shadow; a caretaker
 * does not make it.
 *
 * Cabinet: see cleanCabinet.
 */
export function answerGovernmentDesk(world: GameWorldState, factionId: string): string[] {
    const done: string[] = [];

    for (const event of world.defianceEvents?.values() ?? []) {
        if (event.factionId !== factionId || event.status !== 'open') continue;
        const negotiated = answerDefiance(world, factionId, event.id, 'negotiate');
        if (negotiated.ok) {
            done.push(`negotiated with ${event.planetName}`);
            continue;
        }
        const threatened = answerDefiance(world, factionId, event.id, 'threaten');
        if (threatened.ok) done.push(`demanded compliance from ${event.planetName}`);
    }

    for (const crisis of world.secessionCrises?.values() ?? []) {
        if (crisis.factionId !== factionId || crisis.status !== 'open') continue;
        const asked = crisis.demands
            .filter(id => !crisis.granted.includes(id) && !CONSTITUTIONAL_DEMANDS.has(id))
            .map(id => ({ id, cost: secessionCost(id) }))
            .sort((a, b) => a.cost - b.cost);
        for (const demand of asked) {
            const result = grantConcession(world, factionId, crisis.id, demand.id);
            if (result.ok) {
                done.push(`conceded ${demand.id} to ${crisis.name}`);
                break; // One concession per tick; the region has to see it land.
            }
        }
    }

    const dismissed = cleanCabinet(world, factionId);
    if (dismissed) done.push(dismissed);

    return done;
}

/**
 * Government corruption at which a caretaker starts dismissing ministers, and
 * the least corrupt minister worth dismissing. Short of the 60 where scandals
 * begin, so it acts before the empire is paying for them.
 */
const CABINET_CLEANUP_AT = 50;

/**
 * Keep the cabinet honest. Ministers' corruption creeps upward all season where
 * oversight is weak, and a government past 60 pays for it in scandals — public
 * trust, then legitimacy, then the officers. A player answers that by
 * dismissing the worst offender. Same order, same price, for a government
 * nobody is running: one dismissal a turn, the most corrupt first. Returns what
 * was done, or null.
 */
export function cleanCabinet(world: GameWorldState, factionId: string): string | null {
    const gov = getGovernment(world, factionId);
    if (!gov || gov.corruption < CABINET_CLEANUP_AT) return null;

    let worst: { portfolio: CabinetPortfolio; name: string; corruption: number } | undefined;
    for (const portfolio of CABINET_PORTFOLIOS) {
        const minister = getMinister(world, factionId, portfolio);
        const corruption = minister?.corruption ?? 0;
        if (minister && corruption > (worst?.corruption ?? CABINET_CLEANUP_AT)) {
            worst = { portfolio, name: minister.name, corruption };
        }
    }
    if (!worst) return null;
    if (!spendPoliticalCapital(world, factionId, DISMISS_MINISTER_COST, 'cabinet dismissal')) return null;
    if (!dismissMinister(world, factionId, worst.portfolio).ok) return null;
    return `dismissed ${worst.name} (${worst.portfolio}, corruption ${Math.round(worst.corruption)})`;
}
