// lib/leadership/leadership-view.ts
// Everyone who runs an empire for its player, read from a world: the head of
// state, the six cabinet ministers, every world's governor, and the bench of
// candidates they are drawn from. Pure and safe in the client bundle — it
// deliberately imports nothing from cabinet-service or governor-service, which
// reach the worker-only registries.
//
// The Leadership tab used to read a client-side store slice that nothing ever
// filled, so every player saw "0 active, 0 in the pool" while the simulation
// was running a whole cabinet and a governor on every world.

import type { GameWorldState } from '../game-world-state';
import type { Leader } from './types';
import { CABINET_PORTFOLIOS } from '../government/types';
import traitsData from './data/leader-traits.json';
import { backgroundOf, bioOf, potentialOf, skillTier, temperamentOf, fitsSeat, SEAT_FIT_BONUS, type SkillTier, type Temperament } from './character';

export { SEAT_FIT_BONUS };

/** Political capital per action. Mirrors cabinet-service and governor-service (worker-side). */
export const LEADERSHIP_COSTS = {
    appointMinister: 5,
    dismissMinister: 10,
    appointGovernor: 5,
} as const;

/** What a minister's competence moves, in a line (cabinet-service getCabinetModifiers). */
export const PORTFOLIO_INFO: Record<string, { label: string; drives: string }> = {
    defence: { label: 'Defence', drives: 'Military upkeep' },
    economy: { label: 'Economy', drives: 'Production and tax income' },
    science: { label: 'Science', drives: 'Research speed' },
    intelligence: { label: 'Intelligence', drives: 'Your spy service' },
    interior: { label: 'Interior', drives: 'Public approval' },
    foreign: { label: 'Foreign Affairs', drives: 'Legitimacy' },
};

const TRAIT_NAME: Record<string, string> = Object.fromEntries(
    (traitsData as Array<{ id: string; name: string }>).map(t => [t.id, t.name]),
);

export function traitLabel(id: string): string {
    if (TRAIT_NAME[id]) return TRAIT_NAME[id];
    const words = id.replace(/[_-]/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface PersonView {
    id: string;
    name: string;
    role: string;
    title?: string;
    competence: number;
    loyalty: number;
    corruption: number;
    ambition: number;
    traits: string[];
    age?: number;
    health?: number;
    popularity?: number;
    politicalSkill?: number;
    /** Character (lib/leadership/character.ts). */
    background: { label: string; fits: string[]; governs: boolean };
    bio: string;
    temperament: Temperament;
    tier: SkillTier;
    /** Tier they can grow to in office; equal to tier when they have peaked. */
    potentialTier: SkillTier;
    /** Two letters for the portrait. */
    initials: string;
}

export interface LeadershipView {
    headOfState: (PersonView & { yearsInOffice: number }) | null;
    cabinet: Array<{ portfolio: string; label: string; drives: string; minister: PersonView | null; fits: boolean }>;
    governors: Array<{ planetId: string; planetName: string; systemId: string; population: number; governor: PersonView | null }>;
    candidates: PersonView[];
    politicalCapital: number;
}

function person(l: Leader): PersonView {
    return {
        id: l.id,
        name: l.name,
        role: l.role,
        title: l.title,
        competence: Math.round(l.competence ?? 50),
        loyalty: Math.round(l.loyalty ?? 50),
        corruption: Math.round(l.corruption ?? 0),
        ambition: Math.round(l.ambitionDrive ?? 50),
        traits: l.traits ?? [],
        age: l.age !== undefined ? Math.round(l.age) : undefined,
        health: l.health !== undefined ? Math.round(l.health) : undefined,
        popularity: l.popularity !== undefined ? Math.round(l.popularity) : undefined,
        politicalSkill: l.politicalSkill !== undefined ? Math.round(l.politicalSkill) : undefined,
        background: (() => { const b = backgroundOf(l); return { label: b.label, fits: b.fits, governs: !!b.governs }; })(),
        bio: bioOf(l),
        temperament: temperamentOf(l),
        tier: skillTier(l.competence ?? 50),
        potentialTier: skillTier(potentialOf(l)),
        initials: l.name.split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase(),
    };
}

function valuesOf<T>(source: any): T[] {
    if (!source) return [];
    if (typeof source.values === 'function') return Array.from(source.values());
    return Object.values(source);
}

export function buildLeadershipView(world: GameWorldState, factionId: string): LeadershipView {
    const gov: any = (world as any).government?.get?.(factionId);
    const leaders = world.leadership?.leaders;
    const living = (id: string | null | undefined): Leader | undefined => {
        if (!id) return undefined;
        const l = leaders?.get?.(id);
        return l && l.status === 'active' ? l : undefined;
    };

    const hos = living(gov?.headOfStateId);
    const headOfState = hos
        ? {
            ...person(hos),
            // Sim clock: leaders age half a year per sim day (government Phase 2).
            yearsInOffice: hos.tookOfficeAtSeconds
                ? Math.max(0, Math.round(((world.nowSeconds ?? 0) - hos.tookOfficeAtSeconds) / 86400 * 0.5))
                : 0,
        }
        : null;

    const cabinet = CABINET_PORTFOLIOS.map(portfolio => {
        const minister = living(gov?.cabinet?.[portfolio]);
        return {
            portfolio,
            label: PORTFOLIO_INFO[portfolio]?.label ?? portfolio,
            drives: PORTFOLIO_INFO[portfolio]?.drives ?? '',
            minister: minister ? person(minister) : null,
            fits: minister ? fitsSeat(minister, portfolio) : false,
        };
    });

    const governors = valuesOf<any>(world.construction?.planets)
        .filter(p => p?.ownerId === factionId)
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
        .map(p => {
            const g = living(p.governorId);
            return {
                planetId: p.id,
                planetName: p.name ?? p.id,
                systemId: p.systemId,
                population: Math.round(p.population ?? 0),
                governor: g ? person(g) : null,
            };
        });

    const candidates = (world.leadership?.recruitmentPool ?? [])
        .filter(l => l.factionId === factionId && l.status === 'active')
        .map(person)
        .sort((a, b) => (b.competence + b.loyalty * 0.4 - b.corruption * 0.5) - (a.competence + a.loyalty * 0.4 - a.corruption * 0.5));

    return {
        headOfState,
        cabinet,
        governors,
        candidates,
        politicalCapital: Math.floor(gov?.politicalCapital ?? 0),
    };
}
