// lib/goals/dock-unlocks.ts
// Stars of Dominion — which parts of the Command Dock a new player grows into.
//
// A fresh player sees six dock buttons: GALAXY, SYSTEM, ECONOMY, MILITARY,
// DIPLOMACY, GUIDE. Everything else unlocks as the first-week goals are met,
// each goal opening the system it naturally leads into — charts lead to spies,
// a second world to governing and to companies, a Spaceyard to designing the
// hulls it can lay, a first contact to the press that will cover it. Until a
// system is unlocked it is left to the advisors (lib/delegation), so hiding it
// hides nothing the empire needs.
//
// Pure data, no React and no world: the dock config (components/shell/
// dockConfig.tsx) and the worker's goal notifications both read it.

import type { GoalId } from './first-week-goals';
import type { DelegatedSystem } from '@/lib/delegation/delegation-types';

export interface DockUnlock {
    /** Dock category id or sub-tab NavTab this entry governs. */
    id: string;
    /** 'category' = a dock button; 'tab' = a sub-tab inside a core category. */
    kind: 'category' | 'tab';
    /** What the player sees it called. */
    label: string;
    /** The first-week goal whose completion reveals it. */
    unlockedBy: GoalId;
    /** The advisors' system that runs it while it is hidden, if any. */
    delegates?: DelegatedSystem;
}

export const DOCK_UNLOCKS: readonly DockUnlock[] = [
    { id: 'research', kind: 'category', label: 'RESEARCH', unlockedBy: 'commission_ships', delegates: 'research' },
    { id: 'intelligence', kind: 'category', label: 'INTELLIGENCE', unlockedBy: 'survey_three' },
    { id: 'empire', kind: 'category', label: 'EMPIRE', unlockedBy: 'settle_world', delegates: 'government' },
    { id: 'corporate', kind: 'tab', label: 'CORPORATE', unlockedBy: 'settle_world', delegates: 'corporate' },
    { id: 'designer', kind: 'tab', label: 'SHIP DESIGNER', unlockedBy: 'build_shipyard' },
    { id: 'press', kind: 'category', label: 'COMMS', unlockedBy: 'reach_out', delegates: 'press' },
];

const BY_ID = new Map(DOCK_UNLOCKS.map(u => [u.id, u]));

/** The unlock rule for a dock item, or undefined for a core item (always shown). */
export function dockUnlockFor(id: string): DockUnlock | undefined {
    return BY_ID.get(id);
}

/** What completing this goal reveals, for the "Goal complete" note. */
export function unlocksForGoal(goalId: GoalId): DockUnlock[] {
    return DOCK_UNLOCKS.filter(u => u.unlockedBy === goalId);
}

export interface DockVisibilityContext {
    /** The player turned "Show everything" on (or is an account from before tiers). */
    showEverything: boolean;
    /** First-week goals this player has completed. Null = no record yet. */
    completedGoals: readonly GoalId[] | null;
}

/**
 * Is this dock item shown? Core items always; advanced items once their goal is
 * met or the player asked for everything.
 */
export function isDockItemUnlocked(id: string, ctx: DockVisibilityContext): boolean {
    const rule = BY_ID.get(id);
    if (!rule) return true;
    if (ctx.showEverything) return true;
    return !!ctx.completedGoals?.includes(rule.unlockedBy);
}
