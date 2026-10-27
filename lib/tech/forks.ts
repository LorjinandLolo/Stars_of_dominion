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

// ─── Held back until tier I ───────────────────────────────────────────────────
//
// A new player met a permanent three-way choice on their second project. Every
// fork now waits until its tree's tier I is finished: by then the player knows
// what the tree is for. The engine enforces it for every faction (the AI works
// tier by tier anyway, and the research council never picks a fork).

/** The tier I technologies of a tree that count toward opening its forks. */
export function tierOneOf(techs: readonly Tech[], tree: string): Tech[] {
    // The authored trees start at tier 1 (the _t1_ ids), not at the enum's
    // FOUNDATION = 0, so 'tier I' is the lowest tier the tree actually has.
    const own = techs.filter(t => t.tree === tree && !t.isHidden && !t.id.startsWith('emg_'));
    const first = Math.min(...own.map(t => t.tier));
    return own.filter(t => t.tier === first);
}

export interface ForkReadiness {
    /** True for every tech that is not a fork option. */
    open: boolean;
    /** Tier I technologies of the tree still to research (empty when open). */
    missing: Tech[];
}

/** Whether a fork option may be started yet: its tree's tier I must be done. */
export function forkReadiness(techs: readonly Tech[], unlockedIds: ReadonlySet<string> | readonly string[], tech: Tech): ForkReadiness {
    if (!tech.mutuallyExclusiveGroup) return { open: true, missing: [] };
    const has = Array.isArray(unlockedIds) ? new Set(unlockedIds) : unlockedIds as ReadonlySet<string>;
    const missing = tierOneOf(techs, tech.tree).filter(t => !has.has(t.id));
    return { open: missing.length === 0, missing };
}

/** Every technology that needs this one, directly or further down, in authored order. */
export function descendantsOf(techs: readonly Tech[], techId: string): Tech[] {
    const reach = new Set<string>([techId]);
    let grew = true;
    while (grew) {
        grew = false;
        for (const t of techs) {
            if (reach.has(t.id)) continue;
            if ((t.prerequisites ?? []).some(p => reach.has(p))) { reach.add(t.id); grew = true; }
        }
    }
    reach.delete(techId);
    return techs.filter(t => reach.has(t.id));
}
