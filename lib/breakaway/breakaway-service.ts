// lib/breakaway/breakaway-service.ts
// Stars of Dominion — raising a breakaway state and handing it to a player
// (casual-play spec Item 7). WORKER-SIDE: mutates the live world only; the
// claim row is seat-service.ts's job.
//
// The agreed rules (docs/casual-play-build-spec.md, "Item 7 design decisions"):
//   1. no breakaway to take → the game raises one, told as an underground
//      movement that has organised for years and now declares itself;
//   2. 1–3 worlds and a weak fleet, but money for mercenaries, and capital
//      that comes looking for a young state's loose rules;
//   3. the parent may reconquer it — and its other provinces take heart, so it
//      fights while holding the rest together;
//   4. comeback perks only for a player whose own empire fell;
//   5. no renaming; the press reports that a new hand has taken the rebellion.
//
// A raised state is born through the same machinery as any other breakaway
// (secession-service openCrisis → civil-war-service fissionEmpire), so
// everything that already knows about breakaways — the war, recognition, the
// government panel, reconquest — applies to it unchanged.

import type { GameWorldState } from '@/lib/game-world-state';
import { Resource } from '@/lib/trade-system/types';
import { GALACTIC_DAY_SIM_SECONDS } from '@/lib/time/time-config';
import { openCrisis } from '@/lib/government/secession-service';
import { ensureGovernments, getGovernment } from '@/lib/government/government-service';
import { fissionEmpire } from '@/lib/government/civil-war-service';
import { materializeSystemBodies } from '@/lib/exploration/body-generator';
import { colonizePlanet } from '@/lib/exploration/colonize-service';
import { createOffer } from '@/lib/diplomacy/offer-service';
import { ensureCorporateState } from '@/lib/economy/corporate/company-registry';
import { fireNotification } from '@/lib/time/notification-hooks';
import { unitConfigFor } from '@/lib/combat/ship-registry';
import { TechEngine } from '@/lib/tech/engine';
import * as chronicle from '@/lib/narrative/chronicle';
import { startComeback, perkName } from '@/lib/comeback/comeback-service';
import { BREAKAWAY_PREFIX, empireName, isBreakawayFactionId, listBreakaways, rankUprisingSites, type UprisingSite } from './breakaway-rules';

/** The underground's own war chest, on top of whatever share of the parent's treasury it took. */
export const UPRISING_WAR_CHEST = 6000;
/** What each backing company puts in (capped by its treasury). */
export const BACKER_STAKE = 1500;
const MAX_BACKERS = 2;
/** Ships a state starts with when no fleet came over with its worlds. */
export const STARTING_CORVETTES = 3;
/** Cohesion the parent's remaining worlds lose when a rising succeeds (on top of fission's own shock). */
export const EMBOLDENED_SHOCK = 6;
/** Defiance pressure the parent's remaining worlds gain: other provinces take heart. */
export const EMBOLDENED_DEFIANCE = 15;

export interface RaiseResult {
    ok: boolean;
    message?: string;
    factionId?: string;
    name?: string;
    parentFactionId?: string;
    worlds?: number;
}

function stamp(world: GameWorldState): string {
    return new Date(world.nowSeconds * 1000).toISOString();
}

function notify(world: GameWorldState, factionId: string, id: string, title: string, body: string, priority: 'urgent' | 'normal' = 'urgent'): void {
    try {
        fireNotification({
            id: `${id}-${factionId}-${world.nowSeconds}`,
            factionId, category: 'politics', priority, title, body,
            createdAt: stamp(world), read: false, linkToTab: 'government',
        } as any);
    } catch { /* notification queue absent in tests */ }
}

/** A breakaway id for this system that is not already used. */
function freshRebelId(world: GameWorldState, systemId: string): string {
    let id = `${BREAKAWAY_PREFIX}${systemId}`;
    let n = 2;
    while (world.economy.factions.has(id) || [...(world.secessionCrises?.values() ?? [])].some(c => c.rebelFactionId === id)) {
        id = `${BREAKAWAY_PREFIX}${systemId}-${n++}`;
    }
    return id;
}

/**
 * Raise a breakaway nobody has made (decision 1). Walks the ranked sites until
 * one actually yields worlds — a frontier system can chart empty.
 */
export function raiseUprising(
    world: GameWorldState,
    options: { nearSystemId?: string | null; humanFactionIds: Iterable<string> },
): RaiseResult {
    const sites = rankUprisingSites(world, options);
    if (sites.length === 0) return { ok: false, message: 'No AI empire is in a position to lose a province.' };
    for (const site of sites.slice(0, 20)) {
        const result = raiseAt(world, site);
        if (result.ok) return result;
    }
    return { ok: false, message: 'No province could be found to rise.' };
}

/** Raise the uprising at one site. */
export function raiseAt(world: GameWorldState, site: UprisingSite): RaiseResult {
    const parentId = site.parentFactionId;
    const parent = world.economy.factions.get(parentId);
    if (!parent) return { ok: false, message: 'That empire no longer exists.' };
    const systemName = world.movement.systems.get(site.systemId)?.name ?? site.systemId;
    // A crisis needs the parent's government record. The worker builds them at
    // load; make sure here too, and refuse BEFORE touching the map — a failed
    // rising must not leave colonies behind.
    ensureGovernments(world);
    if (!getGovernment(world, parentId)) return { ok: false, message: 'That empire has no government to rebel against.' };

    let planetIds = site.planetIds;
    if (site.kind === 'frontier') {
        // Frontier settlers the parent counts as its own on paper: chart the
        // bodies (as a survey would), settle the habitable ones for the parent,
        // and let the movement take them in the same breath.
        materializeSystemBodies(world, site.systemId);
        const habitable = [...world.construction.planets.values()]
            .filter(p => p.systemId === site.systemId && !p.ownerId && p.tags?.includes('colonizable'))
            .slice(0, 3);
        if (habitable.length === 0) return { ok: false, message: `${systemName} has no habitable world.` };
        const vis = world.movement.factionVisibility.get(parentId) ?? {};
        vis[site.systemId] = {
            revealStage: 'surveyed', lastSeenAt: stamp(world),
            visibleTags: world.movement.systems.get(site.systemId)?.tags ?? [],
            observedFleetIds: [], movementIntentVisible: true,
        };
        world.movement.factionVisibility.set(parentId, vis);
        planetIds = [];
        for (const planet of habitable) {
            if (colonizePlanet(world, parentId, planet.id).ok) planetIds.push(planet.id);
        }
        if (planetIds.length === 0) return { ok: false, message: `${systemName} could not be settled.` };
    }
    if (planetIds.length === 0) return { ok: false, message: 'No worlds to take.' };

    // The crisis, framed as the underground it is, then straight to a state:
    // this movement has done its organising off-screen.
    const crisis = openCrisis(world, parentId, planetIds, {
        name: `The ${systemName} Underground`,
        causes: ['a movement that organised in secret for a generation'],
    });
    if (!crisis) return { ok: false, message: 'The movement could not be organised.' };
    crisis.status = 'escalated';
    crisis.escalatedAtSeconds = world.nowSeconds;
    crisis.resolvedAtSeconds = world.nowSeconds;
    crisis.rebelFactionId = freshRebelId(world, site.systemId);
    crisis.outcome = 'an underground movement declared itself';
    (crisis as any).raisedForPlayer = true;

    const fission = fissionEmpire(world, crisis.id);
    if (!fission.ok || !fission.rebelFactionId) {
        crisis.status = 'suppressed';
        return { ok: false, message: fission.message ?? 'The rising failed.' };
    }

    // The press already has it twice over: openCrisis recorded the movement's
    // demand (secession_declared) and fission the split (civil_war_started).

    return { ok: true, factionId: fission.rebelFactionId, name: fission.rebelName, parentFactionId: parentId, worlds: planetIds.length };
}

/**
 * Everything a breakaway needs before a person can play it: research, charts,
 * a fleet, a war chest, backers, and a Kaer'Ruun contract on the table. Safe to
 * call twice — it only fills what is missing.
 */
export function readyForPlayer(world: GameWorldState, rebelId: string): { backers: string[]; corvettes: number } {
    const rebel = world.economy.factions.get(rebelId);
    if (!rebel) return { backers: [], corvettes: 0 };
    const origin = [...(world.secessionCrises?.values() ?? [])].find(c => c.rebelFactionId === rebelId);
    const parentId = origin?.factionId;

    // Research: a province keeps what the empire knew.
    if (!world.tech.get(rebelId)) {
        const parentTech = parentId ? world.tech.get(parentId) : undefined;
        world.tech.set(rebelId, parentTech
            ? JSON.parse(JSON.stringify({ ...parentTech, factionId: rebelId }))
            // The same lazy init the player and AI paths use.
            : TechEngine.initPlayerState(rebelId));
    }

    // Charts: likewise. Without a map the player would start blind — and fog
    // is computed from this (lib/persistence/shard-privacy.ts).
    if (!world.movement.factionVisibility.has(rebelId)) {
        const parentVis = parentId ? world.movement.factionVisibility.get(parentId) : undefined;
        world.movement.factionVisibility.set(rebelId, parentVis ? JSON.parse(JSON.stringify(parentVis)) : {});
    }
    const vis = world.movement.factionVisibility.get(rebelId)!;
    for (const planet of world.construction.planets.values()) {
        if (planet.ownerId !== rebelId) continue;
        vis[planet.systemId] = {
            revealStage: 'surveyed', lastSeenAt: stamp(world),
            visibleTags: world.movement.systems.get(planet.systemId)?.tags ?? [],
            observedFleetIds: [], movementIntentVisible: true,
        };
    }

    // A weak fleet, if none came over with the worlds.
    let corvettes = 0;
    const hasFleet = [...world.movement.fleets.values()].some(f => f.factionId === rebelId);
    const capitalPlanet = [...world.construction.planets.values()]
        .filter(p => p.ownerId === rebelId)
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
    if (!hasFleet && capitalPlanet) {
        corvettes = STARTING_CORVETTES;
        const power = (unitConfigFor('corvette')?.power ?? 10) * corvettes + 10;
        const fleetId = `fleet-${rebelId}-militia`;
        world.movement.fleets.set(fleetId, {
            id: fleetId,
            factionId: rebelId,
            name: 'Freedom Militia',
            currentSystemId: capitalPlanet.systemId,
            arrivedAtSeconds: world.nowSeconds,
            orbitingPlanetId: capitalPlanet.id,
            destinationSystemId: null,
            activeLayer: null,
            transitProgress: 0,
            etaSeconds: 0,
            plannedPath: [],
            orders: [],
            doctrine: { type: 'Defensive', deviationFromPosture: 0, preferredLayers: ['hyperlane'], retreatThreshold: 0.3, logisticsStrain: 0, moraleDrift: 0, supplyLevel: 1.0 },
            postureId: 'Defensive',
            strength: 1.0,
            basePower: power,
            composition: { corvette: corvettes },
            hyperdriveProfile: {
                hyperlane: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
                trade: { speedMultiplier: 1.2, detectabilityMultiplier: 1.5, supplyStrainMultiplier: 1.0 },
                corridor: { speedMultiplier: 2.0, detectabilityMultiplier: 0.5, supplyStrainMultiplier: 1.0 },
                gate: { speedMultiplier: 10.0, detectabilityMultiplier: 2.0, supplyStrainMultiplier: 1.0 },
                deepSpace: { speedMultiplier: 0.5, detectabilityMultiplier: 0.2, supplyStrainMultiplier: 1.0 },
            },
            isDetectable: true,
            transportedArmyIds: [],
            leaderId: undefined,
        } as any);
    }

    // Money for mercenaries (decision 2), once.
    const reserves = (rebel.reserves ?? {}) as Record<string, number>;
    const backers: string[] = [];
    if (!(rebel as any).breakawayFunded) {
        reserves[Resource.CREDITS] = (reserves[Resource.CREDITS] ?? 0) + UPRISING_WAR_CHEST;

        // Capital that likes loose rules: the richest foreign companies put
        // real money in. Their treasuries pay; nothing is minted.
        const corp = ensureCorporateState(world);
        const candidates = [...corp.companies.values()]
            .filter(c => !c.nationalized && c.foundingFactionId !== parentId && c.foundingFactionId !== rebelId && (c.treasury ?? 0) > BACKER_STAKE)
            .sort((a, b) => (b.treasury ?? 0) - (a.treasury ?? 0) || a.id.localeCompare(b.id))
            .slice(0, MAX_BACKERS);
        for (const company of candidates) {
            company.treasury -= BACKER_STAKE;
            reserves[Resource.CREDITS] += BACKER_STAKE;
            backers.push(company.charter?.fullName ?? company.id);
        }
        rebel.reserves = reserves as any;
        (rebel as any).breakawayFunded = true;
        (rebel as any).breakawayBackers = backers;
    }

    // The Kaer'Ruun sell their wars to whoever can pay — offered, not imposed,
    // and only by an AI-run Kaer'Ruun (the game never speaks for a human).
    const claimed = new Set<string>((world as any).claimedFactionIds ?? []);
    for (const [fid, faction] of world.economy.factions) {
        if ((faction as any).civilizationId !== 'civ-kaerruun' || claimed.has(fid) || fid === rebelId) continue;
        try {
            createOffer(world, fid, {
                kind: 'mercenary_contract',
                toFactionId: rebelId,
                contractTerms: { resourceKey: 'CREDITS', retainerPerTick: 150, termSeconds: 7 * GALACTIC_DAY_SIM_SECONDS, againstFactionId: parentId },
            } as any);
        } catch { /* diplomacy not ready — the money is still there */ }
        break;
    }

    return { backers, corvettes };
}

export interface TakeResult {
    ok: boolean;
    message?: string;
    name?: string;
    parentFactionId?: string;
    comeback?: boolean;
}

/**
 * A person takes the helm (decisions 3–5). Called by the worker after the
 * claim row is written. `fromFactionId` is the fallen empire, for a comeback.
 */
export function takeBreakaway(
    world: GameWorldState,
    rebelId: string,
    options: { fromFactionId?: string | null; eliminated?: boolean },
): TakeResult {
    if (!isBreakawayFactionId(rebelId) || !world.economy.factions.has(rebelId)) {
        return { ok: false, message: 'That breakaway state no longer exists.' };
    }
    const summary = listBreakaways(world).find(b => b.factionId === rebelId);
    if (!summary) return { ok: false, message: 'That breakaway state holds no worlds.' };
    const parentId = summary.parentFactionId;
    const { backers, corvettes } = readyForPlayer(world, rebelId);

    // The parent's other provinces take heart (decision 3). Reconquest is
    // open — but not cheap in attention.
    for (const record of world.planetCohesion?.values() ?? []) {
        if (record.factionId !== parentId) continue;
        record.cohesion = Math.max(0, record.cohesion - EMBOLDENED_SHOCK);
        (record as any).defiancePressure = Math.min(100, ((record as any).defiancePressure ?? 0) + EMBOLDENED_DEFIANCE);
    }
    notify(world, parentId, 'breakaway-emboldened', 'THE PROVINCES ARE WATCHING',
        `${summary.name} has a new leader and the will to keep what it took. Every province that ever resented ${empireName(world, parentId)} is asking whether it could do the same. Retake it if you can — but hold the rest while you do.`);

    // Comeback perks: only for a player whose own empire fell (decision 4).
    let comeback = false;
    if (options.eliminated && options.fromFactionId) {
        const record = startComeback(world, rebelId, options.fromFactionId);
        comeback = !!record;
        if (record) {
            notify(world, rebelId, 'comeback-path', 'GUERRILLA DOCTRINE',
                `What was lost taught you how to fight from nothing. Unlocked: ${record.unlocked_perks.map(perkName).join(', ')}. Hold on, and more will follow.`, 'normal');
        }
    }

    const funding = backers.length
        ? `${backers.join(' and ')} put money in, expecting a young state's light rules.`
        : 'Private banks are already asking what a young state charges for a licence.';
    notify(world, rebelId, 'breakaway-taken', `YOU LEAD ${summary.name.toUpperCase()}`,
        `${summary.worlds} world${summary.worlds === 1 ? '' : 's'}${corvettes ? `, a militia of ${corvettes} corvettes` : ''}, a war chest for mercenaries, and ${empireName(world, parentId)} wanting it all back. ${funding}`);

    // The press (decision 5). The name stands; the story is the new hand.
    chronicle.record(world, {
        type: 'breakaway_claimed',
        actorIds: [rebelId],
        targetIds: [parentId],
        facts: { rebelName: summary.name, parentName: summary.parentName, worlds: summary.worlds, comeback, backers: backers.join(', ') },
    });

    return { ok: true, name: summary.name, parentFactionId: parentId, comeback };
}
