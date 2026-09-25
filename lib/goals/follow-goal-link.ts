'use client';

// lib/goals/follow-goal-link.ts
// Stars of Dominion — act on a first-week goal's deep link.
//
// One place that turns "open your capital" / "show me a system to survey" into
// store changes, used by the goal card and the daily brief alike, so a goal's
// button behaves the same wherever it is pressed.

import { useUIStore } from '@/lib/store/ui-store';
import type { NavTab } from '@/types/ui-state';
import type { GoalDeepLink } from './first-week-goals';

export function followGoalLink(link: GoalDeepLink): void {
    const store = useUIStore.getState();
    // The build panel and the context panel both live on the galaxy view, so
    // a planet or system link always lands there with the map uncovered.
    store.setActiveTab(link.tab as NavTab);
    if (link.selectSystemId) {
        // GalaxyShell only mounts the build panel when a system is selected
        // too (it takes the panel's system from the selection), so a planet
        // link always carries its system and selects it first.
        store.setSystemView(null);
        store.setSelectedSystem(link.selectSystemId);
        const system = store.systems.find((s: any) => s.id === link.selectSystemId) as any;
        if (system) store.setFocusTarget({ x: system.q, y: system.r, zoom: 2 });
    }
    if (link.constructionPlanetId) store.setConstructionPlanet(link.constructionPlanetId);
}
