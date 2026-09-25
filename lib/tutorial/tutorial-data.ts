// lib/tutorial/tutorial-data.ts
// Stars of Dominion — the three-step tour.
//
// It used to be eighteen steps through every system in the game, which is a
// manual read aloud. A new player needs three things: where the galaxy is,
// where the controls are, and where to look each day. What to DO next is the
// first-week goal card's job (lib/goals/first-week-goals.ts), and everything
// else lives in the guidebook (GUIDE on the dock) for players who want depth.
//
// Each step spotlights a real element: galaxy-map-canvas (GalaxyShell),
// command-dock (CommandDock), daily-brief-button (TopNav).

import type { TutorialStep } from './tutorial-types';

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'galaxy-map',
        title: 'This Is Your Galaxy',
        body: 'Every star is a system; your empire starts from a single world. Drag to move, scroll to zoom, click a system to see what you can do there. The galaxy resolves a cycle every 24 minutes and keeps running while you are away.',
        targetElementId: 'galaxy-map-canvas',
        category: 'galaxy',
        requiredTab: 'galaxy',
    },
    {
        id: 'command-dock',
        title: 'The Command Dock',
        body: 'Everything you run is down here: your empire, economy, research, military, intelligence and diplomacy. Open one and it rises over the map; click it again to go back. GUIDE on the right explains any system in depth.',
        targetElementId: 'command-dock',
        category: 'navigation',
    },
    {
        id: 'daily-brief',
        title: 'Check In Once a Day',
        body: 'Your daily brief lives here: what happened while you were away, what is waiting on your answer, and the one thing worth doing next. Anything that needs you stays open for at least a full day. Your first goal is already on the map, bottom left.',
        targetElementId: 'daily-brief-button',
        category: 'time',
    },
];
