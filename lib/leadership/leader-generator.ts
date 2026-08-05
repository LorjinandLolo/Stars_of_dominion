// lib/leadership/leader-generator.ts
// Stars of Dominion — Government & Leadership, Phase 2.
//
// Nothing in the game has ever created a Leader: world.leadership.leaders and
// recruitmentPool were seeded empty and never filled, so LEADER_RECRUIT could
// not succeed. This is the missing factory.
//
// Deterministic: every leader is derived from a seed string (faction + slot +
// sim clock), never Math.random, so a replayed tick produces the same people.

import type { Leader, LeaderRole } from './types';
import { RNG } from '../trade-system/rng';
import traitsData from './data/leader-traits.json';
import namesData from '../../data/leaders/leader-names.json';

const TRAIT_IDS: string[] = (traitsData as Array<{ id: string }>).map(t => t.id);
const GIVEN: string[] = namesData.given;
const FAMILY: string[] = namesData.family;
const TITLES: Record<string, string[]> = namesData.titles;

/** FNV-1a — stable across processes, unlike a hash built on object identity. */
export function seedFromString(seed: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/** Pick the honorific that fits the government's tags. */
export function titleForGovernment(governmentTags: string[], rng: RNG): string {
    for (const tag of governmentTags) {
        const pool = TITLES[tag];
        if (pool?.length) return pool[rng.nextInt(0, pool.length - 1)];
    }
    const fallback = TITLES.default;
    return fallback[rng.nextInt(0, fallback.length - 1)];
}

export interface GenerateLeaderOptions {
    factionId: string;
    role: LeaderRole;
    /** Distinct per leader — the same seed always yields the same person. */
    seed: string;
    nowSeconds: number;
    /** Government tags, used to pick a fitting title. */
    governmentTags?: string[];
    /** Override the rolled age (used when promoting a known successor). */
    age?: number;
}

/**
 * Build one leader. Statistically ordinary: most roll mid-range, with the tails
 * rare enough that a genuinely gifted (or catastrophic) leader is an event.
 */
export function generateLeader(opts: GenerateLeaderOptions): Leader {
    const rng = new RNG(seedFromString(`${opts.factionId}|${opts.role}|${opts.seed}`));

    const name = `${GIVEN[rng.nextInt(0, GIVEN.length - 1)]} ${FAMILY[rng.nextInt(0, FAMILY.length - 1)]}`;
    const age = opts.age ?? rng.nextInt(38, 68);

    // Two independent rolls averaged — a soft bell curve without a normal RNG.
    const bell = (min: number, max: number) =>
        Math.round((rng.nextInt(min, max) + rng.nextInt(min, max)) / 2);

    const traits: string[] = [];
    if (TRAIT_IDS.length > 0) {
        traits.push(TRAIT_IDS[rng.nextInt(0, TRAIT_IDS.length - 1)]);
        // A second trait is uncommon — it makes distinctive leaders memorable.
        if (rng.check(0.35)) {
            const second = TRAIT_IDS[rng.nextInt(0, TRAIT_IDS.length - 1)];
            if (!traits.includes(second)) traits.push(second);
        }
    }

    return {
        id: `leader-${opts.factionId}-${seedFromString(opts.seed).toString(36)}`,
        factionId: opts.factionId,
        name,
        role: opts.role,
        level: 1,
        xp: 0,
        loyalty: bell(40, 95),
        status: 'active',
        traits,
        history: [],
        title: opts.role === 'HeadOfState'
            ? titleForGovernment(opts.governmentTags ?? [], rng)
            : undefined,
        popularity: bell(35, 75),
        politicalSkill: bell(25, 90),
        competence: bell(25, 90),
        // Most public servants are broadly honest; the tail is where the
        // scandals come from.
        corruption: Math.max(0, bell(0, 55) - 10),
        ambitionDrive: bell(15, 85),
        // Older candidates start closer to their limits.
        health: Math.max(30, Math.min(100, bell(65, 100) - Math.max(0, age - 55))),
        age,
    };
}

const CANDIDATE_ROLES: LeaderRole[] = [
    'Admiral',
    'General',
    'Governor',
    'IntelligenceDirector',
    'DiplomaticEnvoy',
    'EconomicMinister',
];

/**
 * One recruitment-pool candidate. Deterministic per (factionId, generation,
 * index) — callers walk `index` upward to find one they have not seen.
 */
export function generateCandidate(
    factionId: string,
    generation: number,
    index: number,
    nowSeconds: number,
    governmentTags: string[] = []
): Leader {
    const rng = new RNG(seedFromString(`${factionId}|pool|${generation}|${index}`));
    return generateLeader({
        factionId,
        role: CANDIDATE_ROLES[rng.nextInt(0, CANDIDATE_ROLES.length - 1)],
        seed: `pool-${generation}-${index}`,
        nowSeconds,
        governmentTags,
    });
}

/** Generate `count` distinct candidates for a faction's recruitment pool. */
export function generateCandidatePool(
    factionId: string,
    count: number,
    generation: number,
    nowSeconds: number,
    governmentTags: string[] = []
): Leader[] {
    const pool: Leader[] = [];
    for (let i = 0; i < count; i++) {
        pool.push(generateCandidate(factionId, generation, i, nowSeconds, governmentTags));
    }
    return pool;
}
