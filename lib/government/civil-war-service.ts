// lib/government/civil-war-service.ts
// Stars of Dominion — Government & Leadership, Phase 6.4 (civil war).
//
// WORKER-SIDE. Stage 5: a region that stopped asking becomes a state. This is
// faction FISSION — the breakaway is not a rebel-army placeholder, it is a real
// empire with territory, an economy, a government, a leader, an ideology and a
// war. Every system that iterates world.economy.factions picks it up for free.
//
// Losing half an empire is not a game over. The parent keeps playing with what
// it still holds, and can reconquer, recognise, or come to terms later.

import type { GameWorldState } from '@/lib/game-world-state';
import type { SecessionCrisis } from './secession-types';
import type { Faction } from '@/lib/trade-system/types';
import { Resource } from '@/lib/trade-system/types';
import type { EmpirePosture, InfluenceBloc } from '@/lib/movement/types';
import { registerActOfWar } from '@/lib/diplomacy/offer-service';
import { fireNotification } from '@/lib/time/notification-hooks';
import { pushWorldStory } from '@/lib/press-system/integration';
import { getGovernment } from './government-service';
import { getGovernor } from './governor-service';
import { getPlanetCohesion } from './cohesion-service';
import { recordPoliticalEvent } from './ideology-drift';
import { CABINET_PORTFOLIOS } from './types';
import { emptyLegacyState } from './legacy-service';
import { generateLeader } from '@/lib/leadership/leader-generator';

/**
 * Grace period between a region going into open revolt (6.3) and declaring
 * itself a state. The last window in which force still ends it.
 */
const FISSION_GRACE_SECONDS = 2 * 86400;
/** Cohesion the breakaway's own worlds start with — they got what they wanted. */
const BREAKAWAY_STARTING_COHESION = 80;
/** Cohesion every remaining world of the parent loses when the empire splits. */
const FRAGMENTATION_SHOCK = 4;

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

export interface FissionResult {
    ok: boolean;
    message?: string;
    rebelFactionId?: string;
    rebelName?: string;
    planetsTaken?: number;
    fleetsDefected?: number;
}

/**
 * Name the new state after what drove it out. A region that left over
 * conscription and a disloyal garrison is not the same country as one that left
 * over distance and taxes.
 */
function nameBreakaway(world: GameWorldState, crisis: SecessionCrisis): { name: string; form: 'junta' | 'republic' | 'restoration' } {
    const causes = crisis.causes.join(' ').toLowerCase();
    const region = crisis.name.replace(/^The\s+/i, '').replace(/\s+Autonomy Crisis$/i, '');

    if (crisis.militaryLoyalty < 40 || causes.includes('war exhaustion')) {
        return { name: `${region} Military Directorate`, form: 'junta' };
    }
    if (causes.includes('corruption') || causes.includes('legitimacy')) {
        return { name: `${region} Restoration Front`, form: 'restoration' };
    }
    return { name: `${region} Republic`, form: 'republic' };
}

/** Blocs for the new state: the parent's roster, but content and locally rooted. */
function breakawayBlocs(parentPosture: EmpirePosture | undefined): InfluenceBloc[] {
    const source = parentPosture?.blocs ?? [];
    if (source.length === 0) return [];
    return source.map(bloc => ({
        ...bloc,
        // A successful independence movement starts united; the frontier and
        // colonial interests that drove it start ahead.
        satisfaction: ['frontier', 'colonists', 'workers'].includes(bloc.id) ? 85 : 65,
        trend: 0,
    }));
}

/**
 * Split the empire. Territory, population, treasury share, fleets in the
 * region, and the governor who led it all go to the new state, and the two are
 * at war from the moment it exists.
 */
export function fissionEmpire(world: GameWorldState, crisisId: string): FissionResult {
    const crisis = world.secessionCrises?.get(crisisId);
    if (!crisis) return { ok: false, message: 'No such crisis.' };
    if (crisis.status !== 'escalated') return { ok: false, message: 'That region has not broken away.' };
    if (!crisis.rebelFactionId) return { ok: false, message: 'The crisis never named a breakaway state.' };

    const parentId = crisis.factionId;
    const rebelId = crisis.rebelFactionId;
    if (world.economy.factions.has(rebelId)) return { ok: false, message: 'That state already exists.' };

    const parentEconomy = world.economy.factions.get(parentId);
    const parentGov = getGovernment(world, parentId);
    const parentPosture = world.movement.empirePostures.get(parentId);
    if (!parentEconomy) return { ok: false, message: 'The parent empire has no economy record.' };

    const { name, form } = nameBreakaway(world, crisis);

    // ── Territory ────────────────────────────────────────────────────────────
    const takenPlanets = crisis.planetIds.filter(id => world.construction.planets.get(id)?.ownerId === parentId);
    if (takenPlanets.length === 0) return { ok: false, message: 'The region was already lost or retaken.' };

    let rebelPopulation = 0;
    let parentPopulation = 0;
    for (const planet of world.construction.planets.values()) {
        if (planet.ownerId !== parentId) continue;
        const pop = Math.max(1, planet.population ?? 1);
        if (takenPlanets.includes(planet.id)) rebelPopulation += pop;
        else parentPopulation += pop;
    }
    const populationShare = rebelPopulation / Math.max(1, rebelPopulation + parentPopulation);

    // The capital of the new state is its most populous world's system.
    const capitalPlanet = takenPlanets
        .map(id => world.construction.planets.get(id)!)
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];

    // ── The new state's economy ──────────────────────────────────────────────
    const reserves: Record<string, number> = {};
    for (const [resource, amount] of Object.entries(parentEconomy.reserves ?? {})) {
        const taken = Math.floor((amount as number) * populationShare);
        reserves[resource] = taken;
        (parentEconomy.reserves as Record<string, number>)[resource] = (amount as number) - taken;
    }

    const rebelFaction: Faction = {
        id: rebelId,
        name,
        theatreId: parentEconomy.theatreId,
        backingRatioPolicy: parentEconomy.backingRatioPolicy ?? 0.5,
        reserves: reserves as Faction['reserves'],
        creditSupply: Math.floor((parentEconomy.creditSupply ?? 0) * populationShare),
        liquidity: Math.floor((parentEconomy.liquidity ?? 0) * populationShare),
        debt: 0, // a new state does not inherit the old one's debts
        stability: 60,
        ideology: parentEconomy.ideology ?? 0,
        centralization: form === 'junta' ? 80 : 35,
        economicModel: parentEconomy.economicModel ?? 0,
        civilizationId: parentEconomy.civilizationId,
        ideologyId: parentEconomy.ideologyId,
        capitalSystemId: capitalPlanet?.systemId ?? crisis.systemIds[0],
        metrics: { ...(parentEconomy.metrics ?? {}) } as Faction['metrics'],
    };
    world.economy.factions.set(rebelId, rebelFaction);

    // ── Hand over the worlds ─────────────────────────────────────────────────
    for (const planetId of takenPlanets) {
        const planet = world.construction.planets.get(planetId);
        if (planet) {
            planet.ownerId = rebelId;
            planet.unrest = clamp100((planet.unrest ?? 0) - 50); // they won
            planet.happiness = clamp100((planet.happiness ?? 50) + 20);
            delete (planet as any).rebelGarrison;
        }

        // The economy keeps its own copy of planet ownership.
        const econPlanet = world.economy.planets.get(planetId);
        if (econPlanet) econPlanet.factionId = rebelId;

        const record = getPlanetCohesion(world, planetId);
        if (record) {
            record.factionId = rebelId;
            record.cohesion = BREAKAWAY_STARTING_COHESION;
            record.autonomy = 0; // they no longer need it conceded
            record.defiancePressure = 0;
        }
    }

    // ── Forces in the region change sides ────────────────────────────────────
    const takenSystems = new Set(
        takenPlanets.map(id => world.construction.planets.get(id)?.systemId).filter(Boolean) as string[]
    );
    let fleetsDefected = 0;
    for (const fleet of world.movement.fleets.values()) {
        if (fleet.factionId !== parentId) continue;
        if (!fleet.currentSystemId || !takenSystems.has(fleet.currentSystemId)) continue;
        fleet.factionId = rebelId;
        fleetsDefected++;
    }

    // ── Its politics ─────────────────────────────────────────────────────────
    const posture: EmpirePosture = {
        factionId: rebelId,
        current: form === 'junta' ? 'Militarist' : 'Consolidating',
        pendingTarget: null,
        switchCompletesAt: null,
        transitionPenalty: 0,
        blocs: breakawayBlocs(parentPosture),
        societyId: parentPosture?.societyId,
        governmentId: form === 'junta' ? 'military_junta' : undefined,
        society_tags: parentPosture?.society_tags ?? [],
        government_tags: form === 'junta'
            ? ['military_junta', 'autocracy', 'authoritarian']
            : ['democracy', 'senate_system', 'elected_leadership'],
        ideology: { ...(parentPosture?.ideology ?? {}) } as EmpirePosture['ideology'],
    };
    // Independence movements are, by construction, less centralist than what
    // they left — and a junta is more authoritarian than what it overthrew.
    if (posture.ideology) {
        posture.ideology.centralization_autonomy = Math.max(-100, (posture.ideology.centralization_autonomy ?? 0) - 40);
        posture.ideology.authoritarianism_liberty = clampAxis(
            (posture.ideology.authoritarianism_liberty ?? 0) + (form === 'junta' ? 25 : -20)
        );
    }
    world.movement.empirePostures.set(rebelId, posture);

    // ── Its government, led by whoever led the revolt ────────────────────────
    const leader = crisis.leaderId ? world.leadership.leaders.get(crisis.leaderId) : undefined;
    const headOfState = leader ?? generateLeader({
        factionId: rebelId,
        role: 'HeadOfState',
        seed: `${rebelId}-founder`,
        nowSeconds: world.nowSeconds,
        governmentTags: posture.government_tags,
    });
    headOfState.factionId = rebelId;
    headOfState.role = 'HeadOfState';
    headOfState.status = 'active';
    headOfState.assignmentId = undefined;
    headOfState.portfolio = undefined;
    headOfState.loyalty = 100;
    headOfState.tookOfficeAtSeconds = world.nowSeconds;
    headOfState.title = form === 'junta' ? 'Director' : 'President';
    headOfState.history.push({
        timestamp: world.nowSeconds,
        description: `Declared the independence of ${name} and took office as its ${headOfState.title}.`,
    });
    world.leadership.leaders.set(headOfState.id, headOfState);

    // The world that leader governed no longer has one.
    for (const planetId of takenPlanets) {
        const planet = world.construction.planets.get(planetId);
        if (planet?.governorId === headOfState.id) planet.governorId = undefined;
    }

    world.government.set(rebelId, {
        factionId: rebelId,
        governmentId: posture.governmentId,
        institutionName: form === 'junta' ? 'Supreme Command Council' : 'Provisional Assembly',
        tags: posture.government_tags ?? [],
        approval: 75,          // the founding is popular
        legitimacy: 55,        // but nobody else recognises it yet
        politicalCapital: 20,
        politicalCapitalCap: 100,
        corruption: 5,
        cohesion: BREAKAWAY_STARTING_COHESION,
        cohesionTrend: 0,
        cohesionDrivers: [],
        activePolicies: [],
        senatePower: form === 'junta' ? 0 : 60,
        executivePower: form === 'junta' ? 95 : 40,
        stability: 60,
        warFatigue: 20,
        headOfStateId: headOfState.id,
        cabinet: CABINET_PORTFOLIOS.reduce((acc, p) => { acc[p] = null; return acc; }, {} as Record<string, string | null>) as any,
        cabinetAdvice: [],
        parties: [],
        bills: [],
        coupPressure: 0,
        ambitions: [],
        legacy: emptyLegacyState(),
        lastTickSeconds: world.nowSeconds,
        history: [{ timestamp: world.nowSeconds, event: `${name} declared independence from ${parentEconomy.name}.` }],
    });

    // ── The war ──────────────────────────────────────────────────────────────
    try {
        registerActOfWar(world, rebelId, parentId);
    } catch { /* diplomacy state not ready — the split still stands */ }

    // ── What it costs the parent ─────────────────────────────────────────────
    if (parentGov) {
        parentGov.legitimacy = clamp100(parentGov.legitimacy - 15);
        parentGov.history.push({
            timestamp: world.nowSeconds,
            event: `${name} broke away with ${takenPlanets.length} worlds.`,
        });
    }
    for (const record of world.planetCohesion?.values() ?? []) {
        if (record.factionId !== parentId) continue;
        record.cohesion = clamp100(record.cohesion - FRAGMENTATION_SHOCK);
    }
    recordPoliticalEvent(world, parentId, 'break_treaty', 2); // the constitutional order broke

    crisis.status = 'escalated';
    crisis.outcome = `${name} declared independence with ${takenPlanets.length} worlds`;

    const summary = `${name} has declared independence, taking ${takenPlanets.length} worlds${fleetsDefected > 0 ? ` and ${fleetsDefected} fleet(s)` : ''}.`;
    for (const audience of [parentId, rebelId]) {
        try {
            fireNotification({
                id: `fission-${rebelId}-${audience}-${world.nowSeconds}`,
                factionId: audience,
                category: 'politics',
                priority: 'urgent',
                title: audience === parentId ? 'THE EMPIRE HAS SPLIT' : 'INDEPENDENCE DECLARED',
                body: summary,
                createdAt: new Date(world.nowSeconds * 1000).toISOString(),
                read: false,
                linkToTab: 'government',
                payload: { rebelFactionId: rebelId, crisisId },
            });
        } catch { /* notification queue absent in tests */ }
    }

    try {
        pushWorldStory(world, { targetEmpireId: parentId, subject: summary, magnitude: 100 });
    } catch { /* press state absent on minimal worlds */ }

    console.log(`[Government] CIVIL WAR: ${summary}`);

    return {
        ok: true,
        rebelFactionId: rebelId,
        rebelName: name,
        planetsTaken: takenPlanets.length,
        fleetsDefected,
    };
}

function clampAxis(v: number): number { return Math.max(-100, Math.min(100, v)); }

/**
 * Turn regions that have been in open revolt long enough into actual states.
 * The grace period is the government's last chance to end it by force.
 */
export function tickCivilWar(world: GameWorldState, deltaSeconds: number): void {
    if (!(world.secessionCrises instanceof Map)) return;

    for (const crisis of world.secessionCrises.values()) {
        if (crisis.status !== 'escalated') continue;
        if (!crisis.rebelFactionId) continue;
        if (world.economy.factions.has(crisis.rebelFactionId)) continue; // already a state
        if (world.nowSeconds < (crisis.escalatedAtSeconds ?? crisis.resolvedAtSeconds ?? 0) + FISSION_GRACE_SECONDS) continue;

        try {
            fissionEmpire(world, crisis.id);
        } catch (e: any) {
            console.error(`[Government] Fission failed for ${crisis.id}:`, e?.message ?? e);
        }
    }
}

/**
 * Is this faction a state that broke away from someone, and how long ago?
 * Returns undefined for empires that were always their own country.
 */
export function breakawayOrigin(
    world: GameWorldState,
    factionId: string
): { parentFactionId: string; foundedAtSeconds: number; ageSeconds: number } | undefined {
    if (!(world.secessionCrises instanceof Map)) return undefined;
    for (const crisis of world.secessionCrises.values()) {
        if (crisis.rebelFactionId !== factionId) continue;
        const founded = crisis.escalatedAtSeconds ?? crisis.resolvedAtSeconds ?? crisis.openedAtSeconds;
        return {
            parentFactionId: crisis.factionId,
            foundedAtSeconds: founded,
            ageSeconds: Math.max(0, world.nowSeconds - founded),
        };
    }
    return undefined;
}

/** Breakaway states born of a given empire's collapse. */
export function breakawayStatesOf(world: GameWorldState, parentFactionId: string): string[] {
    if (!(world.secessionCrises instanceof Map)) return [];
    return [...world.secessionCrises.values()]
        .filter(c => c.factionId === parentFactionId && c.rebelFactionId)
        .filter(c => world.economy.factions.has(c.rebelFactionId!))
        .map(c => c.rebelFactionId!);
}
