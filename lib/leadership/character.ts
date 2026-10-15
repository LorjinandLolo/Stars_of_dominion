// lib/leadership/character.ts
// Stars of Dominion — who a leader IS, beyond their numbers.
//
// Every minister, governor and head of state has a background (the career
// they came up through), a temperament (read from their loyalty, ambition and
// corruption), a skill tier, and a potential they grow toward while in office.
// Pure and client-safe: the Leadership panel and the worker both read it.
//
// Background and potential are derived deterministically from the leader's id
// and role when the record lacks them, so every leader saved before
// 2026-10-15 gets a stable character without a migration. The worker writes
// the potential onto the record the first time the leader grows
// (tickLeaderGrowth), and from then on it is fixed.

import type { Leader } from './types';

// ─── Skill tiers ─────────────────────────────────────────────────────────────

export interface SkillTier {
    id: 'novice' | 'capable' | 'seasoned' | 'expert' | 'legendary';
    label: string;
    /** 1–5, for the stars. */
    rank: number;
    /** Lowest skill value in the tier. */
    min: number;
}

export const SKILL_TIERS: readonly SkillTier[] = [
    { id: 'novice', label: 'Novice', rank: 1, min: 0 },
    { id: 'capable', label: 'Capable', rank: 2, min: 35 },
    { id: 'seasoned', label: 'Seasoned', rank: 3, min: 55 },
    { id: 'expert', label: 'Expert', rank: 4, min: 70 },
    { id: 'legendary', label: 'Legendary', rank: 5, min: 85 },
];

export function skillTier(value: number): SkillTier {
    let tier = SKILL_TIERS[0];
    for (const t of SKILL_TIERS) if (value >= t.min) tier = t;
    return tier;
}

// ─── Backgrounds ─────────────────────────────────────────────────────────────

export interface Background {
    id: string;
    label: string;
    /** Half a sentence: "rose through the fleet". */
    story: string;
    /** Cabinet seats this career prepares someone for. */
    fits: string[];
    /** Whether it prepares someone to run a world. */
    governs?: boolean;
}

export const BACKGROUNDS: readonly Background[] = [
    { id: 'career_officer', label: 'Career officer', story: 'rose through the general staff', fits: ['defence'] },
    { id: 'fleet_veteran', label: 'Fleet veteran', story: 'commanded a line squadron before entering politics', fits: ['defence'] },
    { id: 'merchant_house', label: 'Merchant house', story: 'ran a trading house across a dozen systems', fits: ['economy'] },
    { id: 'industrialist', label: 'Industrialist', story: 'built a foundry empire from one refinery', fits: ['economy'], governs: true },
    { id: 'academic', label: 'Academic', story: 'held a chair at the capital university', fits: ['science'] },
    { id: 'engineer', label: 'Engineer', story: 'designed half the orbital yards in service', fits: ['science'] },
    { id: 'intelligence', label: 'Former intelligence officer', story: 'spent twenty years in the service nobody names', fits: ['intelligence'] },
    { id: 'magistrate', label: 'Magistrate', story: 'sat on the bench of a frontier court', fits: ['interior'], governs: true },
    { id: 'party_organiser', label: 'Party organiser', story: 'can carry a district in a week', fits: ['interior'] },
    { id: 'diplomat', label: 'Career diplomat', story: 'served as envoy to three rival courts', fits: ['foreign'] },
    { id: 'old_nobility', label: 'Old nobility', story: 'carries a name older than the state', fits: ['foreign'], governs: true },
    { id: 'frontier_settler', label: 'Frontier settler', story: 'helped found a colony from bare rock', fits: [], governs: true },
];

const BACKGROUND_BY_ID = new Map(BACKGROUNDS.map(b => [b.id, b]));

/** Which careers a recruitment role draws on, most likely first. */
const ROLE_BACKGROUNDS: Record<string, string[]> = {
    Admiral: ['fleet_veteran', 'career_officer'],
    General: ['career_officer', 'fleet_veteran'],
    Governor: ['magistrate', 'frontier_settler', 'old_nobility', 'industrialist'],
    IntelligenceDirector: ['intelligence'],
    DiplomaticEnvoy: ['diplomat', 'old_nobility'],
    EconomicMinister: ['merchant_house', 'industrialist'],
    CharterCompanyExecutive: ['merchant_house', 'industrialist'],
};

function hash(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function backgroundOf(leader: Pick<Leader, 'id' | 'role'> & { background?: string }): Background {
    const stored = leader.background ? BACKGROUND_BY_ID.get(leader.background) : undefined;
    if (stored) return stored;
    const h = hash(`${leader.id}|background`);
    // A role usually brings its own career; one leader in three came another way.
    const own = ROLE_BACKGROUNDS[leader.role];
    if (own && h % 3 !== 0) return BACKGROUND_BY_ID.get(own[(h >>> 4) % own.length])!;
    return BACKGROUNDS[(h >>> 8) % BACKGROUNDS.length];
}

/** Bonus a minister's skill gets in a seat their career prepared them for. */
export const SEAT_FIT_BONUS = 10;

export function fitsSeat(leader: Pick<Leader, 'id' | 'role'> & { background?: string }, portfolio: string): boolean {
    return backgroundOf(leader).fits.includes(portfolio);
}

/** Skill as it counts in a seat: competence, plus the fit bonus where it applies. */
export function seatSkill(leader: Leader, portfolio: string): number {
    return Math.min(100, (leader.competence ?? 50) + (fitsSeat(leader, portfolio) ? SEAT_FIT_BONUS : 0));
}

// ─── Potential and growth ────────────────────────────────────────────────────

/** The highest skill this leader can grow to. */
export function potentialOf(leader: Pick<Leader, 'id' | 'competence'> & { potential?: number }): number {
    if (typeof leader.potential === 'number') return leader.potential;
    const competence = leader.competence ?? 50;
    // Most have room for one tier more; a few have a great deal; some none.
    const room = hash(`${leader.id}|potential`) % 31;
    return Math.min(95, Math.max(competence, competence + room - 3));
}

/** Skill gained per sim day in office, until potential. One tier is about a week of real time. */
export const SKILL_GROWTH_PER_DAY = 0.25;

// ─── Temperament ─────────────────────────────────────────────────────────────

export interface Temperament {
    label: string;
    line: string;
    tone: 'good' | 'neutral' | 'risk';
}

export function temperamentOf(leader: Pick<Leader, 'loyalty'> & { ambitionDrive?: number; corruption?: number; competence?: number }): Temperament {
    const loyalty = leader.loyalty ?? 50;
    const ambition = leader.ambitionDrive ?? 50;
    const corruption = leader.corruption ?? 0;
    if (ambition >= 70 && loyalty < 45) return { label: 'Schemer', line: 'Wants your chair, and is patient about it.', tone: 'risk' };
    if (corruption >= 40) return { label: 'Venal', line: 'Some of what passes through their hands stays there.', tone: 'risk' };
    if (ambition >= 70) return { label: 'Ambitious', line: 'Works hard, and keeps score.', tone: 'neutral' };
    if (loyalty >= 75) return { label: 'Loyalist', line: 'Will stand by you when it costs them.', tone: 'good' };
    if (ambition <= 30) return { label: 'Content', line: 'Happy where they are; no threat, little drive.', tone: 'neutral' };
    if ((leader.competence ?? 50) >= 70) return { label: 'Professional', line: 'Does the job well and asks for little.', tone: 'good' };
    return { label: 'Pragmatist', line: 'Goes where the wind is blowing.', tone: 'neutral' };
}

/** One line about who they are: "52, career diplomat — served as envoy to three rival courts." */
export function bioOf(leader: Leader & { background?: string }): string {
    const bg = backgroundOf(leader);
    const age = leader.age !== undefined ? `${Math.round(leader.age)}, ` : '';
    return `${age}${bg.label.toLowerCase()}: ${bg.story}.`;
}
