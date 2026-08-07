// lib/government/foreign-interference-service.ts
// Stars of Dominion — Government & Leadership, Phase 6.5 (foreign exploitation).
//
// WORKER-SIDE. The collapse ladder becomes galactic politics here: a rival's
// unhappy frontier is an opportunity, and you can take it covertly (fund the
// separatists, arm them, buy their governor) or openly (recognise the breakaway,
// guarantee its independence).
//
// Both directions carry risk. Covert work that is EXPOSED hands the target a
// rally-around-the-flag: cohesion rises, the government's approval rises with
// it, and the interference becomes a public grievance. Meddling in a collapse
// you cannot finish is worse than leaving it alone.

import type { GameWorldState } from '@/lib/game-world-state';
import type { SecessionCrisis } from './secession-types';
import { shiftRivalry } from '@/lib/diplomacy/offer-service';
import { fireNotification } from '@/lib/time/notification-hooks';
import { pushWorldStory } from '@/lib/press-system/integration';
import { getGovernment, spendPoliticalCapital } from './government-service';
import { getGovernor } from './governor-service';
import { getPlanetCohesion } from './cohesion-service';

/** Political capital to recognise a breakaway state. */
export const RECOGNIZE_COST = 15;
/** …and to guarantee its independence, which is a promise you may have to keep. */
export const GUARANTEE_COST = 35;

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

/** Crises covering a given system, open or already in revolt. */
function crisesInSystem(world: GameWorldState, systemId: string): SecessionCrisis[] {
    return [...(world.secessionCrises?.values() ?? [])]
        .filter(c => c.status === 'open' || c.status === 'escalated')
        .filter(c => c.systemIds.includes(systemId));
}

/** Worlds of a faction inside one system. */
function worldsIn(world: GameWorldState, systemId: string, factionId: string) {
    return [...world.construction.planets.values()]
        .filter(p => p.systemId === systemId && p.ownerId === factionId);
}

/** Record who paid for it, without telling the target yet. */
function recordSponsor(crisis: SecessionCrisis, sponsorId: string): void {
    if (!Array.isArray(crisis.foreignSponsors)) crisis.foreignSponsors = [];
    if (!crisis.foreignSponsors.includes(sponsorId)) crisis.foreignSponsors.push(sponsorId);
}

// ─── Covert instruments ───────────────────────────────────────────────────────

/**
 * Money and organisers for a rival's separatists. Pushes the region toward
 * leaving, and toward leaving sooner.
 */
export function applySeparatistFunding(
    world: GameWorldState,
    actorId: string,
    targetId: string,
    systemId: string,
    value: number
): void {
    for (const crisis of crisesInSystem(world, systemId)) {
        if (crisis.factionId !== targetId) continue;
        crisis.independenceSupport = clamp100(crisis.independenceSupport + value);
        // Foreign backing shortens the region's patience as well as stiffening it.
        crisis.deadlineSeconds = Math.max(world.nowSeconds, crisis.deadlineSeconds - 86400);
        recordSponsor(crisis, actorId);
    }

    // Even without an open crisis, funded agitation eats cohesion and hurries
    // the defiance countdown along.
    for (const planet of worldsIn(world, systemId, targetId)) {
        const record = getPlanetCohesion(world, planet.id);
        if (!record) continue;
        record.cohesion = clamp100(record.cohesion - value * 0.5);
        record.defiancePressure = (record.defiancePressure ?? 0) + value * 1.5;
        planet.unrest = clamp100((planet.unrest ?? 0) + value * 0.5);
    }
}

/**
 * Weapons to a region already in revolt. Makes the rebels militarily real and
 * makes the garrison think twice about moving on them.
 */
export function applyRebelArmament(
    world: GameWorldState,
    actorId: string,
    targetId: string,
    systemId: string,
    value: number
): void {
    for (const crisis of crisesInSystem(world, systemId)) {
        if (crisis.factionId !== targetId) continue;
        crisis.militaryLoyalty = clamp100(crisis.militaryLoyalty - value * 0.8);
        crisis.independenceSupport = clamp100(crisis.independenceSupport + value * 0.4);
        recordSponsor(crisis, actorId);
    }

    for (const planet of worldsIn(world, systemId, targetId)) {
        const garrison = (planet as any).rebelGarrison;
        if (garrison) {
            garrison.troops = Math.round(garrison.troops * (1 + value / 100));
            garrison.fortificationLevel = Math.min(5, garrison.fortificationLevel + 1);
            garrison.supplyRemaining += Math.round(value / 5);
        }
        planet.unrest = clamp100((planet.unrest ?? 0) + value * 0.3);
    }
}

/** Buy a rival's planetary governor. A bought governor stops holding the line. */
export function applyGovernorCorruption(
    world: GameWorldState,
    actorId: string,
    targetId: string,
    systemId: string,
    value: number
): void {
    for (const planet of worldsIn(world, systemId, targetId)) {
        const governor = getGovernor(world, planet.id);
        if (!governor) continue;
        governor.loyalty = clamp100(governor.loyalty - value);
        governor.corruption = clamp100((governor.corruption ?? 0) + value * 0.6);
        governor.ambitionDrive = clamp100((governor.ambitionDrive ?? 50) + value * 0.3);
    }

    for (const crisis of crisesInSystem(world, systemId)) {
        if (crisis.factionId === targetId) recordSponsor(crisis, actorId);
    }
}

// ─── Exposure ─────────────────────────────────────────────────────────────────

/**
 * The target caught someone meddling in its collapse. Nothing unites a
 * fracturing civilization like a foreign hand: cohesion and approval rise, the
 * sponsor is named, and the grievance is public and legitimate.
 *
 * Called from the espionage resolver when a political-warfare op is exposed.
 */
export function rallyAroundTheFlag(
    world: GameWorldState,
    targetId: string,
    sponsorId: string,
    magnitude = 6
): void {
    const gov = getGovernment(world, targetId);
    if (!gov) return;

    for (const record of world.planetCohesion?.values() ?? []) {
        if (record.factionId !== targetId) continue;
        record.cohesion = clamp100(record.cohesion + magnitude);
        // Anger at foreigners buys the capital time with its own separatists.
        record.defiancePressure = Math.max(0, (record.defiancePressure ?? 0) - magnitude * 3);
    }

    gov.legitimacy = clamp100(gov.legitimacy + magnitude * 0.5);
    gov.history.push({
        timestamp: world.nowSeconds,
        event: `Foreign interference by ${sponsorId} exposed — the country closed ranks.`,
    });

    // Open crises cool: it is harder to argue for leaving when the movement is
    // visibly foreign-funded.
    for (const crisis of world.secessionCrises?.values() ?? []) {
        if (crisis.factionId !== targetId || crisis.status !== 'open') continue;
        crisis.independenceSupport = clamp100(crisis.independenceSupport - magnitude);
        if (!Array.isArray(crisis.exposedSponsors)) crisis.exposedSponsors = [];
        if (!crisis.exposedSponsors.includes(sponsorId)) crisis.exposedSponsors.push(sponsorId);
    }

    try {
        shiftRivalry(world, targetId, sponsorId, 25, 'interference_exposed', 'caught funding separatists');
    } catch { /* diplomacy state not ready */ }

    try {
        fireNotification({
            id: `rally-${targetId}-${sponsorId}-${world.nowSeconds}`,
            factionId: targetId,
            category: 'politics',
            priority: 'urgent',
            title: 'Foreign Interference Exposed',
            body: `${sponsorId} was caught funding separatism. Public anger has closed ranks behind the government.`,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'government',
            payload: { sponsorId },
        });
    } catch { /* notification queue absent in tests */ }

    try {
        pushWorldStory(world, {
            targetEmpireId: sponsorId,
            subject: `${sponsorId} caught financing separatists inside ${targetId}`,
            magnitude: 85,
        });
    } catch { /* press state absent on minimal worlds */ }
}

// ─── Overt instruments ────────────────────────────────────────────────────────

export interface RecognitionResult {
    ok: boolean;
    message?: string;
    outcome?: string;
}

/** Breakaway states another empire could recognise. */
export function recognisableStates(world: GameWorldState, observerId: string): SecessionCrisis[] {
    return [...(world.secessionCrises?.values() ?? [])]
        .filter(c => c.rebelFactionId && world.economy.factions.has(c.rebelFactionId))
        .filter(c => c.factionId !== observerId && c.rebelFactionId !== observerId);
}

/**
 * Recognise a breakaway state. Cheap, public, and an act the parent will not
 * forget — legitimacy is exactly what a new state cannot manufacture alone.
 */
export function recognizeBreakaway(
    world: GameWorldState,
    actorId: string,
    rebelFactionId: string
): RecognitionResult {
    const crisis = [...(world.secessionCrises?.values() ?? [])].find(c => c.rebelFactionId === rebelFactionId);
    if (!crisis) return { ok: false, message: 'No such breakaway state.' };
    if (!world.economy.factions.has(rebelFactionId)) return { ok: false, message: 'That state does not exist yet.' };
    if (actorId === crisis.factionId) return { ok: false, message: 'An empire cannot recognise its own rebels.' };

    const rebelGov = getGovernment(world, rebelFactionId);
    if (!rebelGov) return { ok: false, message: 'That state has no government to recognise.' };
    if (rebelGov.recognisedBy?.includes(actorId)) return { ok: false, message: 'Already recognised.' };

    if (!spendPoliticalCapital(world, actorId, RECOGNIZE_COST, `recognised ${rebelGov.institutionName}`)) {
        const held = Math.floor(getGovernment(world, actorId)?.politicalCapital ?? 0);
        return { ok: false, message: `Recognition needs ${RECOGNIZE_COST} political capital; the government holds ${held}.` };
    }

    rebelGov.recognisedBy = [...(rebelGov.recognisedBy ?? []), actorId];
    rebelGov.legitimacy = clamp100(rebelGov.legitimacy + 8);
    for (const record of world.planetCohesion?.values() ?? []) {
        if (record.factionId !== rebelFactionId) continue;
        record.cohesion = clamp100(record.cohesion + 3);
    }

    try {
        shiftRivalry(world, crisis.factionId, actorId, 30, 'recognised_breakaway', 'recognised our rebels');
    } catch { /* diplomacy state not ready */ }

    const outcome = `${actorId} recognised the independence of ${rebelGov.institutionName}`;
    rebelGov.history.push({ timestamp: world.nowSeconds, event: `Recognised by ${actorId}.` });
    getGovernment(world, crisis.factionId)?.history.push({
        timestamp: world.nowSeconds,
        event: `${actorId} recognised the rebels as a state.`,
    });

    try {
        pushWorldStory(world, { targetEmpireId: crisis.factionId, subject: outcome, magnitude: 80 });
    } catch { /* press state absent */ }

    return { ok: true, outcome };
}

/**
 * Guarantee a breakaway's independence. Expensive, and a promise the parent
 * will read as a threat — which is the point.
 */
export function guaranteeBreakaway(
    world: GameWorldState,
    actorId: string,
    rebelFactionId: string
): RecognitionResult {
    const crisis = [...(world.secessionCrises?.values() ?? [])].find(c => c.rebelFactionId === rebelFactionId);
    if (!crisis) return { ok: false, message: 'No such breakaway state.' };
    const rebelGov = getGovernment(world, rebelFactionId);
    if (!rebelGov) return { ok: false, message: 'That state does not exist yet.' };
    if (actorId === crisis.factionId) return { ok: false, message: 'An empire cannot guarantee its own rebels.' };
    if (rebelGov.guaranteedBy?.includes(actorId)) return { ok: false, message: 'Already guaranteed.' };

    if (!spendPoliticalCapital(world, actorId, GUARANTEE_COST, `guaranteed ${rebelGov.institutionName}`)) {
        const held = Math.floor(getGovernment(world, actorId)?.politicalCapital ?? 0);
        return { ok: false, message: `A guarantee needs ${GUARANTEE_COST} political capital; the government holds ${held}.` };
    }

    // A guarantee implies recognition.
    if (!rebelGov.recognisedBy?.includes(actorId)) {
        rebelGov.recognisedBy = [...(rebelGov.recognisedBy ?? []), actorId];
    }
    rebelGov.guaranteedBy = [...(rebelGov.guaranteedBy ?? []), actorId];
    rebelGov.legitimacy = clamp100(rebelGov.legitimacy + 12);
    rebelGov.warFatigue = clamp100(rebelGov.warFatigue - 10); // someone else shares the burden

    for (const record of world.planetCohesion?.values() ?? []) {
        if (record.factionId !== rebelFactionId) continue;
        record.cohesion = clamp100(record.cohesion + 6);
    }

    try {
        shiftRivalry(world, crisis.factionId, actorId, 45, 'guaranteed_breakaway', 'guaranteed our rebels');
    } catch { /* diplomacy state not ready */ }

    const outcome = `${actorId} guaranteed the independence of ${rebelGov.institutionName}`;
    rebelGov.history.push({ timestamp: world.nowSeconds, event: `Independence guaranteed by ${actorId}.` });

    try {
        pushWorldStory(world, { targetEmpireId: crisis.factionId, subject: outcome, magnitude: 95 });
    } catch { /* press state absent */ }

    return { ok: true, outcome };
}
