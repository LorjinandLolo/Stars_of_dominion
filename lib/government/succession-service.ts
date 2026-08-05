// lib/government/succession-service.ts
// Stars of Dominion — Government & Leadership, Phase 2.
//
// Every government has a person at the top. They age on the sim clock, their
// health erodes, their standing tracks the government's fortunes, and when they
// go the empire keeps running under someone else — with the legitimacy cost of
// however they left.

import type { GameWorldState } from '@/lib/game-world-state';
import type { Leader, DepartureCause } from '@/lib/leadership/types';
import { generateLeader, generateCandidate, seedFromString } from '@/lib/leadership/leader-generator';
import { RNG } from '@/lib/trade-system/rng';
import { pushWorldStory } from '@/lib/press-system/integration';
import { fireNotification } from '@/lib/time/notification-hooks';
import { getGovernment } from './government-service';
import { assignAmbitions, tickAmbitions } from './legacy-service';

/** Sim years an incumbent ages per sim day. A season is an era, not a week. */
const AGE_YEARS_PER_DAY = 0.5;
/** Health lost per sim day at prime age, before the age and stress penalties. */
const BASE_HEALTH_DECLINE_PER_DAY = 0.15;
/** Candidates kept warm in the recruitment pool per faction. */
const POOL_TARGET = 3;
/** How far past the wanted count to search for candidates nobody has met yet. */
const MAX_CANDIDATE_PROBES = 24;

/** Legitimacy the government loses when a head of state leaves this way. */
const LEGITIMACY_COST: Record<DepartureCause, number> = {
    death: 12,
    illness: 8,
    retirement: 3,
    resignation: 6,
    overthrown: 25,
    // An orderly transfer of power is the cheapest kind — it proves the system
    // works, so it costs almost nothing.
    election_defeat: 1,
};

const DEPARTURE_LABEL: Record<DepartureCause, string> = {
    death: 'died in office',
    illness: 'succumbed to failing health',
    retirement: 'retired from office',
    resignation: 'resigned',
    overthrown: 'was removed from power',
    election_defeat: 'lost the election',
};

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

/** The sitting head of state, or undefined if the office is vacant. */
export function getHeadOfState(world: GameWorldState, factionId: string): Leader | undefined {
    const gov = getGovernment(world, factionId);
    if (!gov?.headOfStateId) return undefined;
    const leader = world.leadership?.leaders?.get(gov.headOfStateId);
    return leader?.status === 'active' ? leader : undefined;
}

/**
 * Seat a head of state for every government that lacks one and keep each
 * faction's recruitment pool stocked. Idempotent; call at world load.
 */
export function ensureHeadsOfState(world: GameWorldState): void {
    if (!world.leadership) {
        world.leadership = { leaders: new Map(), recruitmentPool: [], nowSeconds: world.nowSeconds };
    }
    if (!(world.leadership.leaders instanceof Map)) world.leadership.leaders = new Map();
    if (!Array.isArray(world.leadership.recruitmentPool)) world.leadership.recruitmentPool = [];
    if (!(world.government instanceof Map)) return;

    let seated = 0;
    let recruited = 0;

    for (const gov of world.government.values()) {
        if (!getHeadOfState(world, gov.factionId)) {
            const leader = generateLeader({
                factionId: gov.factionId,
                role: 'HeadOfState',
                seed: `founding-${gov.factionId}`,
                nowSeconds: world.nowSeconds,
                governmentTags: gov.tags,
            });
            leader.tookOfficeAtSeconds = world.nowSeconds;
            leader.history.push({ timestamp: world.nowSeconds, description: `Took office as ${leader.title}.` });
            world.leadership.leaders.set(leader.id, leader);
            gov.headOfStateId = leader.id;
            gov.ambitions = assignAmbitions(world, gov.factionId, leader);
            gov.history.push({
                timestamp: world.nowSeconds,
                event: `${leader.title} ${leader.name} took office.`,
            });
            seated++;
        }

        // Leaders seated before the Legacy System landed have no ambitions yet.
        if (!Array.isArray(gov.ambitions) || gov.ambitions.length === 0) {
            const sitting = getHeadOfState(world, gov.factionId);
            if (sitting) gov.ambitions = assignAmbitions(world, gov.factionId, sitting);
        }

        recruited += refillRecruitmentPool(world, gov.factionId);
    }

    if (seated > 0) console.log(`[Government] Seated ${seated} head(s) of state.`);
    if (recruited > 0) console.log(`[Government] Added ${recruited} candidate(s) to recruitment pools.`);
}

/**
 * Top a faction's recruitment pool back up to POOL_TARGET. Returns how many
 * candidates were added. This is what finally makes LEADER_RECRUIT usable.
 */
export function refillRecruitmentPool(world: GameWorldState, factionId: string): number {
    const pool = world.leadership.recruitmentPool;
    const existing = pool.filter(l => l.factionId === factionId);
    const missing = POOL_TARGET - existing.length;
    if (missing <= 0) return 0;

    const gov = getGovernment(world, factionId);
    // Generation advances with the sim clock so refills produce new people
    // rather than regenerating the same candidates the player just hired.
    const generation = Math.floor(world.nowSeconds / 86400);
    const known = new Set([...pool.map(l => l.id), ...world.leadership.leaders.keys()]);

    // Walk the candidate index upward past anyone already hired or on the
    // bench: the ids are deterministic, so a naive regenerate returns the same
    // people and adds nobody.
    let added = 0;
    for (let index = 0; added < missing && index < missing + MAX_CANDIDATE_PROBES; index++) {
        const candidate = generateCandidate(factionId, generation, index, world.nowSeconds, gov?.tags ?? []);
        if (known.has(candidate.id)) continue;
        pool.push(candidate);
        known.add(candidate.id);
        added++;
    }

    return added;
}

/**
 * Age the sitting heads of state, erode their health, drift their popularity
 * toward the government's fortunes, and resolve any that leave office.
 */
export function tickLeadership(world: GameWorldState, deltaSeconds: number): void {
    if (!(world.government instanceof Map)) return;
    const days = deltaSeconds / 86400;

    for (const gov of world.government.values()) {
        const leader = getHeadOfState(world, gov.factionId);
        if (!leader) {
            // Office fell vacant without a succession (leader killed elsewhere).
            resolveSuccession(world, gov.factionId, 'death');
            continue;
        }

        // Legacy: measure the ambitions this administration was sworn in on.
        tickAmbitions(world, gov, leader);

        leader.age = (leader.age ?? 50) + AGE_YEARS_PER_DAY * days;

        // Stress: an unpopular government wears its leader down faster.
        const stress = gov.approval < 40 ? (40 - gov.approval) / 40 : 0;
        const ageStrain = Math.max(0, (leader.age - 60)) * 0.02;
        const decline = (BASE_HEALTH_DECLINE_PER_DAY + ageStrain + stress * 0.2) * days;
        leader.health = clamp100((leader.health ?? 80) - decline);

        // Popularity tracks approval but lags it — the person and the
        // administration are judged separately.
        const target = gov.approval;
        const pull = 0.15 * days;
        leader.popularity = clamp100((leader.popularity ?? 50) + (target - (leader.popularity ?? 50)) * Math.min(1, pull));

        const rng = new RNG(seedFromString(`${leader.id}|${Math.floor(world.nowSeconds / 3600)}`));

        if (leader.health <= 0) {
            resolveSuccession(world, gov.factionId, 'death');
            continue;
        }
        // Frail and old: an illness can end a reign before the health bar does.
        if (leader.age > 70 && leader.health < 40 && rng.check(0.05 * days)) {
            resolveSuccession(world, gov.factionId, 'illness');
            continue;
        }
        // A leader who has had enough steps down rather than dying at the desk.
        if ((leader.age > 78 || leader.health < 25) && rng.check(0.15 * days)) {
            resolveSuccession(world, gov.factionId, 'retirement');
        }
    }
}

/**
 * Retire the incumbent and seat a successor: promote the strongest candidate
 * from the recruitment pool, or generate one if the bench is empty.
 */
export function resolveSuccession(
    world: GameWorldState,
    factionId: string,
    cause: DepartureCause
): Leader | undefined {
    const gov = getGovernment(world, factionId);
    if (!gov) return undefined;

    const outgoing = gov.headOfStateId ? world.leadership.leaders.get(gov.headOfStateId) : undefined;
    if (outgoing && outgoing.status === 'active') {
        outgoing.status = cause === 'death' || cause === 'illness' ? 'deceased' : 'retired';
        outgoing.leftOfficeAtSeconds = world.nowSeconds;
        outgoing.departureCause = cause;
        outgoing.history.push({
            timestamp: world.nowSeconds,
            description: `${DEPARTURE_LABEL[cause]} after ${yearsInOffice(outgoing, world.nowSeconds)} years in office.`,
        });
    }

    const successor = promoteSuccessor(world, gov.factionId, gov.tags);
    successor.role = 'HeadOfState';
    successor.status = 'active';
    successor.assignmentId = undefined;
    successor.tookOfficeAtSeconds = world.nowSeconds;
    if (!successor.title) {
        successor.title = generateLeader({
            factionId,
            role: 'HeadOfState',
            seed: `title-${successor.id}`,
            nowSeconds: world.nowSeconds,
            governmentTags: gov.tags,
        }).title;
    }
    successor.history.push({ timestamp: world.nowSeconds, description: `Took office as ${successor.title}.` });
    world.leadership.leaders.set(successor.id, successor);
    gov.headOfStateId = successor.id;
    // A new administration brings its own ambitions; what the last one achieved
    // is already banked in gov.legacy and stays there.
    gov.ambitions = assignAmbitions(world, gov.factionId, successor);

    // An interregnum costs the state standing, and the new administration does
    // not inherit its predecessor's accumulated political capital in full.
    gov.legitimacy = clamp100(gov.legitimacy - LEGITIMACY_COST[cause]);
    gov.politicalCapital = gov.politicalCapital * 0.5;
    gov.history.push({
        timestamp: world.nowSeconds,
        event: outgoing
            ? `${outgoing.title ?? 'The head of state'} ${outgoing.name} ${DEPARTURE_LABEL[cause]}; ${successor.title} ${successor.name} succeeded.`
            : `${successor.title} ${successor.name} took office.`,
    });

    refillRecruitmentPool(world, factionId);
    announceSuccession(world, factionId, outgoing, successor, cause);

    return successor;
}

/** Pull the best available candidate, preferring political skill. */
function promoteSuccessor(world: GameWorldState, factionId: string, governmentTags: string[]): Leader {
    const pool = world.leadership.recruitmentPool;
    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
        const candidate = pool[i];
        if (candidate.factionId !== factionId) continue;
        const score = (candidate.politicalSkill ?? 50) + (candidate.popularity ?? 50) * 0.5 + candidate.loyalty * 0.25;
        if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }

    if (bestIndex >= 0) return pool.splice(bestIndex, 1)[0];

    // Empty bench: the state produces someone anyway.
    return generateLeader({
        factionId,
        role: 'HeadOfState',
        seed: `succession-${factionId}-${world.nowSeconds}`,
        nowSeconds: world.nowSeconds,
        governmentTags,
    });
}

function yearsInOffice(leader: Leader, nowSeconds: number): number {
    if (!leader.tookOfficeAtSeconds) return 0;
    const days = (nowSeconds - leader.tookOfficeAtSeconds) / 86400;
    return Math.max(0, Math.round(days * AGE_YEARS_PER_DAY));
}

function announceSuccession(
    world: GameWorldState,
    factionId: string,
    outgoing: Leader | undefined,
    successor: Leader,
    cause: DepartureCause
): void {
    const headline = outgoing
        ? `${outgoing.title ?? 'Head of state'} ${outgoing.name} ${DEPARTURE_LABEL[cause]} — ${successor.title} ${successor.name} succeeds`
        : `${successor.title} ${successor.name} takes office`;

    try {
        pushWorldStory(world, {
            targetEmpireId: factionId,
            subject: headline,
            magnitude: cause === 'overthrown' ? 85 : cause === 'death' ? 70 : 45,
        });
    } catch { /* press state absent on minimal worlds */ }

    try {
        fireNotification({
            id: `succession-${factionId}-${world.nowSeconds}`,
            factionId,
            category: 'politics',
            priority: cause === 'overthrown' ? 'urgent' : 'normal',
            title: 'Succession',
            body: headline,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'government',
            payload: { successorId: successor.id, cause },
        });
    } catch { /* notification queue absent in tests */ }
}
