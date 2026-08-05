// lib/government/governor-service.ts
// Stars of Dominion — Government & Leadership, Phase 3 (governors).
//
// `governorId` has existed on the planet record since the construction pillar
// was written and nothing ever set it. Now every administered world has someone
// running it: competent governors hold their planet together, corrupt ones skim
// it, and disloyal ones let the unrest build that Phase 4 turns into revolt.

import type { GameWorldState } from '@/lib/game-world-state';
import type { Leader } from '@/lib/leadership/types';
import { generateLeader, seedFromString } from '@/lib/leadership/leader-generator';
import { RNG } from '@/lib/trade-system/rng';
import { fireNotification } from '@/lib/time/notification-hooks';
import { getGovernment } from './government-service';
import { refillRecruitmentPool } from './succession-service';

/**
 * Ceiling on appointed governors per faction. A sprawling empire cannot staff
 * every rock; worlds past the cap run under standing administration with no
 * governor bonuses or risks at all.
 */
const MAX_GOVERNORS_PER_FACTION = 12;
export const APPOINT_GOVERNOR_COST = 5;

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

/** The governor of a planet, if it has a living one. */
export function getGovernor(world: GameWorldState, planetId: string): Leader | undefined {
    const planet = world.construction?.planets?.get(planetId);
    if (!planet?.governorId) return undefined;
    const leader = world.leadership?.leaders?.get(planet.governorId);
    return leader?.status === 'active' ? leader : undefined;
}

/** Every planet a faction governs, most developed first. */
function governedPlanets(world: GameWorldState, factionId: string) {
    return [...world.construction.planets.values()]
        .filter(p => p.ownerId === factionId)
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
}

/**
 * Appoint governors for owned worlds that lack one, up to the per-faction cap.
 * Idempotent; call at world load and after conquest.
 */
export function ensureGovernors(world: GameWorldState): void {
    if (!(world.government instanceof Map)) return;
    if (!world.construction?.planets) return;
    let appointed = 0;

    for (const gov of world.government.values()) {
        const planets = governedPlanets(world, gov.factionId);
        let staffed = planets.filter(p => getGovernor(world, p.id)).length;

        for (const planet of planets) {
            if (staffed >= MAX_GOVERNORS_PER_FACTION) break;
            if (getGovernor(world, planet.id)) continue;

            const governor = takeGovernorCandidate(world, gov.factionId, planet.id);
            planet.governorId = governor.id;
            staffed++;
            appointed++;
        }
    }

    if (appointed > 0) console.log(`[Government] Appointed ${appointed} planetary governor(s).`);
}

/** Pull a governor from the bench, or produce one if the bench is empty. */
function takeGovernorCandidate(world: GameWorldState, factionId: string, planetId: string): Leader {
    const pool = world.leadership.recruitmentPool;

    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
        const candidate = pool[i];
        if (candidate.factionId !== factionId) continue;
        const roleBonus = candidate.role === 'Governor' ? 20 : 0;
        const score = (candidate.competence ?? 50) + candidate.loyalty * 0.5 + roleBonus - (candidate.corruption ?? 0) * 0.5;
        if (score > bestScore) { bestScore = score; bestIndex = i; }
    }

    const governor = bestIndex >= 0
        ? pool.splice(bestIndex, 1)[0]
        : generateLeader({
            factionId,
            role: 'Governor',
            seed: `governor-${planetId}`,
            nowSeconds: world.nowSeconds,
        });

    governor.role = 'Governor';
    governor.assignmentId = planetId;
    governor.status = 'active';
    governor.history.push({ timestamp: world.nowSeconds, description: `Appointed governor of ${planetId}.` });
    world.leadership.leaders.set(governor.id, governor);
    refillRecruitmentPool(world, factionId);

    return governor;
}

export interface GovernorActionResult {
    ok: boolean;
    message?: string;
    leaderId?: string;
}

/** Player-driven appointment of a planetary governor. */
export function appointGovernor(
    world: GameWorldState,
    factionId: string,
    planetId: string,
    leaderId: string
): GovernorActionResult {
    const planet = world.construction?.planets?.get(planetId);
    if (!planet) return { ok: false, message: 'Unknown planet.' };
    if (planet.ownerId !== factionId) return { ok: false, message: 'That world is not yours to administer.' };

    const poolIndex = world.leadership.recruitmentPool.findIndex(l => l.id === leaderId && l.factionId === factionId);
    const candidate = poolIndex >= 0
        ? world.leadership.recruitmentPool[poolIndex]
        : world.leadership.leaders.get(leaderId);

    if (!candidate || candidate.factionId !== factionId) {
        return { ok: false, message: 'That candidate is not available to this government.' };
    }
    if (candidate.status !== 'active') return { ok: false, message: 'That candidate is no longer available.' };

    const gov = getGovernment(world, factionId);
    if (gov?.headOfStateId === leaderId) return { ok: false, message: 'The head of state cannot govern a single world.' };
    if (candidate.portfolio) return { ok: false, message: `${candidate.name} holds a cabinet brief.` };

    const outgoing = getGovernor(world, planetId);
    if (outgoing && outgoing.id !== leaderId) {
        outgoing.assignmentId = undefined;
        outgoing.history.push({ timestamp: world.nowSeconds, description: `Recalled from ${planetId}.` });
    }
    if (poolIndex >= 0) world.leadership.recruitmentPool.splice(poolIndex, 1);

    candidate.role = 'Governor';
    candidate.assignmentId = planetId;
    candidate.history.push({ timestamp: world.nowSeconds, description: `Appointed governor of ${planetId}.` });
    world.leadership.leaders.set(candidate.id, candidate);
    planet.governorId = candidate.id;
    refillRecruitmentPool(world, factionId);

    return { ok: true, leaderId: candidate.id };
}

/**
 * Governors work their worlds: competence steadies stability and happiness,
 * corruption drags them, and a disloyal governor lets unrest run.
 */
export function tickGovernors(world: GameWorldState, deltaSeconds: number): void {
    if (!world.construction?.planets) return;
    const days = deltaSeconds / 86400;

    for (const planet of world.construction.planets.values()) {
        if (!planet.ownerId) continue;
        const governor = getGovernor(world, planet.id);
        if (!governor) {
            // The governor died or was reassigned elsewhere — clear the stale id
            // so ensureGovernors refills the post.
            if (planet.governorId) planet.governorId = undefined;
            continue;
        }

        const competence = ((governor.competence ?? 50) - 50) / 50;   // -1..1
        const corruption = (governor.corruption ?? 0) / 100;          // 0..1
        const gov = getGovernment(world, planet.ownerId);

        const stabilityDelta = (competence * 1.5 - corruption * 1.0) * days;
        planet.stability = clamp100((planet.stability ?? 50) + stabilityDelta);
        planet.happiness = clamp100((planet.happiness ?? 80) + (competence * 0.8 - corruption * 0.8) * days);

        // Loyalty erodes on neglected, unhappy worlds far from the capital.
        const neglect = planet.stability < 40 ? (40 - planet.stability) / 40 : 0;
        governor.loyalty = clamp100(governor.loyalty - neglect * 1.5 * days + (planet.stability > 70 ? 0.3 * days : 0));

        // A disloyal, ambitious governor stops suppressing unrest — and starts
        // building a base. Phase 4 turns this into an actual revolt.
        const drive = (governor.ambitionDrive ?? 50) / 100;
        if (governor.loyalty < 30) {
            planet.unrest = clamp100((planet.unrest ?? 0) + (30 - governor.loyalty) / 30 * drive * 2 * days);

            const rng = new RNG(seedFromString(`${governor.id}|defiance|${Math.floor(world.nowSeconds / 86400)}`));
            if (governor.loyalty < 15 && rng.check(0.1 * days)) {
                announceDefiance(world, planet.id, planet.ownerId, governor);
                if (gov) gov.legitimacy = clamp100(gov.legitimacy - 1);
            }
        }

        // Skimmed revenue shows up as empire-wide corruption pressure.
        if (gov && corruption > 0.5) {
            gov.corruption = clamp100(gov.corruption + (corruption - 0.5) * 0.5 * days);
        }
    }
}

function announceDefiance(world: GameWorldState, planetId: string, factionId: string, governor: Leader): void {
    governor.history.push({ timestamp: world.nowSeconds, description: `Openly defied the central government on ${planetId}.` });

    try {
        fireNotification({
            id: `governor-defiance-${planetId}-${world.nowSeconds}`,
            factionId,
            category: 'politics',
            priority: 'urgent',
            title: 'Governor Defiance',
            body: `Governor ${governor.name} is ignoring directives on ${planetId}. Unrest is climbing.`,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'government',
            payload: { planetId, governorId: governor.id },
        });
    } catch { /* notification queue absent in tests */ }
}
