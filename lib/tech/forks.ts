// lib/tech/forks.ts
// Forks of no return in the tech trees.
//
// A fork is a `mutuallyExclusiveGroup`: two or three options, of which an
// empire may only ever hold one. Every tree has two (Specialization and
// Transformation tiers). Committing to an option closes the others AND every
// technology further down that needs one of them — an all-prerequisites tree
// has no second road — and that closed set is what the player needs to see
// before they commit, and afterwards.
//
// Commitment happens when research STARTS (TechEngine.assignResearch locks the
// other options), because research cannot be cancelled. Pure functions over a
// tech list, so the worker, the tests and the Research panel agree.

import type { Tech } from './types';
import { TechTier } from './types';

export interface Fork {
    group: string;
    tier: TechTier;
    tree: string;
    /** The options, in authored order. */
    options: Tech[];
}

const TIER_LABEL: Record<number, string> = {
    [TechTier.FOUNDATION]: 'Foundation',
    [TechTier.EXPANSION]: 'Expansion',
    [TechTier.SPECIALIZATION]: 'Specialization',
    [TechTier.DOMINANCE]: 'Dominance',
    [TechTier.TRANSFORMATION]: 'Transformation',
};

/** Every fork, keyed by group id. */
export function forksOf(techs: readonly Tech[]): Map<string, Fork> {
    const out = new Map<string, Fork>();
    for (const tech of techs) {
        const group = tech.mutuallyExclusiveGroup;
        if (!group) continue;
        const fork = out.get(group) ?? { group, tier: tech.tier, tree: tech.tree, options: [] };
        fork.options.push(tech);
        fork.tier = Math.min(fork.tier, tech.tier) as TechTier;
        out.set(group, fork);
    }
    return out;
}

/** "Specialization fork" — what players call it; the group id is an internal name. */
export function forkLabel(fork: Pick<Fork, 'tier'>): string {
    return `${TIER_LABEL[fork.tier] ?? `Tier ${fork.tier}`} fork`;
}

/**
 * Everything closed for good: the locked options, plus every technology that
 * needs one of them (directly or further down). Prerequisites are all-of, so a
 * single closed prerequisite closes the tech.
 */
export function closedTechIds(techs: readonly Tech[], lockedIds: Iterable<string>): Set<string> {
    const closed = new Set<string>(lockedIds);
    let grew = true;
    while (grew) {
        grew = false;
        for (const tech of techs) {
            if (closed.has(tech.id)) continue;
            if ((tech.prerequisites ?? []).some(p => closed.has(p))) {
                closed.add(tech.id);
                grew = true;
            }
        }
    }
    return closed;
}

/** For a closed tech: the locked fork option that closed it (the nearest one up its chain). */
export function closedBy(techs: readonly Tech[], byId: ReadonlyMap<string, Tech>, techId: string, lockedIds: ReadonlySet<string>): Tech | null {
    if (lockedIds.has(techId)) return byId.get(techId) ?? null;
    const seen = new Set<string>();
    const queue = [...(byId.get(techId)?.prerequisites ?? [])];
    while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        if (lockedIds.has(id)) return byId.get(id) ?? null;
        queue.push(...(byId.get(id)?.prerequisites ?? []));
    }
    return null;
}

export interface ForkCost {
    fork: Fork;
    /** The other options, which committing closes. */
    rivals: Tech[];
    /** Technologies further down that need a rival, closed with it (rivals excluded). */
    downstream: Tech[];
}

/**
 * What committing to `techId` would close, on top of what is already closed.
 * Null when the tech is not a fork option.
 */
export function forkCost(techs: readonly Tech[], techId: string, lockedIds: Iterable<string>): ForkCost | null {
    const tech = techs.find(t => t.id === techId);
    const group = tech?.mutuallyExclusiveGroup;
    if (!tech || !group) return null;
    const fork = forksOf(techs).get(group)!;
    const already = closedTechIds(techs, lockedIds);
    const rivals = fork.options.filter(o => o.id !== techId);
    const after = closedTechIds(techs, [...already, ...rivals.map(r => r.id)]);
    const rivalIds = new Set(rivals.map(r => r.id));
    const downstream = techs.filter(t => after.has(t.id) && !already.has(t.id) && !rivalIds.has(t.id));
    return { fork, rivals: rivals.filter(r => !already.has(r.id)), downstream };
}

/**
 * For a tech that is still open but sits behind an undecided fork: the option
 * it needs (nearest up its chain), so the panel can say "needs the X path".
 */
export function requiredForkOption(byId: ReadonlyMap<string, Tech>, techId: string, decided: ReadonlySet<string>): Tech | null {
    const seen = new Set<string>();
    const queue = [...(byId.get(techId)?.prerequisites ?? [])];
    while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const t = byId.get(id);
        if (t?.mutuallyExclusiveGroup && !decided.has(t.mutuallyExclusiveGroup)) return t;
        queue.push(...(t?.prerequisites ?? []));
    }
    return null;
}

/** Which option of each fork an empire has committed to (researched or researching). */
export function forkChoices(forks: ReadonlyMap<string, Fork>, committedIds: ReadonlySet<string>): Map<string, Tech> {
    const out = new Map<string, Tech>();
    for (const fork of forks.values()) {
        const chosen = fork.options.find(o => committedIds.has(o.id));
        if (chosen) out.set(fork.group, chosen);
    }
    return out;
}
