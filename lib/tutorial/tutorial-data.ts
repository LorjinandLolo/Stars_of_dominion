// lib/tutorial/tutorial-data.ts
// Stars of Dominion — the guided tours.
//
// Three short tours instead of one long one. The first ("Your screen") starts
// by itself on a player's first visit and walks every part of the main screen
// once. The other two teach the two things testers got stuck on: how
// exploration works (ping, scan, survey, then settle) and what to build first.
// The ? button in the top bar replays any of them. What to DO next is still
// the goal card's job (lib/goals/first-week-goals.ts); depth lives in the
// guidebook (GUIDE on the dock).
//
// A step spotlights an element by id, or by data-tour when the element repeats
// (one per planet card). A step whose element is not on screen (a narrow
// window hides the resource bar) shows its card in the middle instead.
// `prepare` sets the scene before a step: the exploration tour opens a nearby
// uncharted system so the explore button is really there to point at.

import type { TutorialStep } from './tutorial-types';

export type TourId = 'screen' | 'exploration' | 'building';

export interface Tour {
    id: TourId;
    title: string;
    blurb: string;
    steps: TutorialStep[];
}

const SCREEN: TutorialStep[] = [
    {
        id: 'galaxy-map',
        title: 'This Is Your Galaxy',
        body: 'Every star is a system; your empire starts from a single world. Drag to move, scroll to zoom, click a system to see what you can do there. The galaxy keeps running while you are away.',
        targetElementId: 'galaxy-map-canvas',
        category: 'galaxy',
        requiredTab: 'galaxy',
        prepare: 'clear-selection',
    },
    {
        id: 'resources',
        title: 'Your Treasury',
        body: 'Credits, metals, chemicals, food and energy pay for everything. Each chip shows what you hold and what it earns per cycle; red means you are spending more than you make. Hover a chip for where it comes from.',
        targetElementId: 'resource-bar',
        category: 'economy',
    },
    {
        id: 'stability',
        title: 'Stability',
        body: 'How willing your worlds are to follow you. Hunger, war weariness and unpopular policies drag it down; low stability means unrest, then rebellion.',
        targetElementId: 'stability-meter',
        category: 'economy',
    },
    {
        id: 'season',
        title: 'The Season Clock',
        body: 'A season is one round of the game. This shows how long it has left. Everything runs in real time: a building takes minutes, research takes hours.',
        targetElementId: 'season-clock',
        category: 'time',
    },
    {
        id: 'daily-brief',
        title: 'Check In Once a Day',
        body: 'Your daily brief: what happened while you were away, what is waiting on your answer, and the one thing worth doing next.',
        targetElementId: 'daily-brief-button',
        category: 'time',
    },
    {
        id: 'notifications',
        title: 'Transmissions',
        body: 'Battles, finished buildings, crises and messages land here. Click one and it opens whatever it is about.',
        targetElementId: 'notification-bell',
        category: 'navigation',
    },
    {
        id: 'overlays',
        title: 'Map Overlays',
        body: 'Recolour the map: what you have charted, who is friend or foe, where you can settle, stability and trade. Charted and Settle are the ones to use while exploring.',
        targetElementId: 'galaxy-overlay-controls',
        category: 'galaxy',
    },
    {
        id: 'fleets',
        title: 'Your Fleets',
        body: 'Every fleet you own. Pick one, then click a system on the map to send it there. Fleets explore, escort, blockade and fight.',
        targetElementId: 'fleet-command-bar',
        category: 'galaxy',
    },
    {
        id: 'goal',
        title: 'Your Next Goal',
        body: 'Not sure what to do? This card always names one thing that moves your empire forward, how long it takes, and a button that opens the right screen.',
        targetElementId: 'goal-card',
        category: 'navigation',
    },
    {
        id: 'command-dock',
        title: 'The Command Dock',
        body: 'Everything you run is down here: economy, military, research, government, diplomacy and more. Open a panel and it rises over the map; click it again to go back. More panels unlock as you complete goals. GUIDE explains any system in depth.',
        targetElementId: 'command-dock',
        category: 'navigation',
    },
    {
        id: 'more-tours',
        title: 'More Tours',
        body: 'This button replays any tour. Next up: "Exploring the stars" shows how to chart systems and find worlds to settle, and "Building your worlds" shows what to build first.',
        targetElementId: 'tutorial-launcher',
        category: 'navigation',
    },
];

const EXPLORATION: TutorialStep[] = [
    {
        id: 'explore-intro',
        title: 'Exploring the Stars',
        body: 'Beyond your home the galaxy is dark, and only surveyed worlds can be settled. The quick way: send your exploration ship to a nearby system. The moment it arrives it surveys the system, for free, and you get a notice when its worlds are mapped (a few minutes).',
        targetElementId: null,
        category: 'galaxy',
        requiredTab: 'galaxy',
    },
    {
        id: 'explore-panel',
        title: 'A System Up Close',
        body: 'Clicking a star opens this panel: the star, its worlds and who holds them. This one is a neighbour you have not charted yet.',
        targetElementId: 'system-context-panel',
        category: 'galaxy',
        prepare: 'select-frontier',
    },
    {
        id: 'explore-action',
        title: 'Ping, Scan, Survey',
        body: 'Without an exploration ship, this button offers the next step. PING charts a far star in seconds, with no ship, so you can see what it is and plan a route; it never shows worlds, and costs more the further it goes. SCAN and SURVEY need a fleet in the system or one jump away, cost credits, and take a few minutes.',
        targetElementId: 'explore-action',
        category: 'galaxy',
    },
    {
        id: 'explore-ship',
        title: 'Exploration Ships',
        body: 'You start with one. Pick it in this fleet bar, click a star next door, and it flies there and surveys on arrival: no ping, no scan, no fee. Corsair Dens are safe to survey: pirates raid trade lanes, not passing ships. Want more? Lay another down at any world with a shipyard.',
        targetElementId: 'fleet-command-bar',
        category: 'galaxy',
    },
    {
        id: 'explore-settle',
        title: 'Settling a World',
        body: 'On a surveyed system, a world that can hold a colony shows SETTLE. Settling lands ten colonists as an outpost; a builder ship can also plant a small OUTPOST on any empty world, even a dead rock. The outpost screen opens as soon as they are down.',
        targetElementId: null,
        category: 'galaxy',
    },
    {
        id: 'explore-outpost',
        title: 'Outposts Grow into Colonies',
        body: 'An outpost runs in five-minute shifts: keep its air, food and power up and answer its crises. Meet the next tier and it grows; as a colony it gets its full surface and the normal BUILD menu. Every outpost is listed under Outposts on the dock.',
        targetElementId: null,
        category: 'galaxy',
        prepare: 'clear-selection',
    },
];

const BUILDING: TutorialStep[] = [
    {
        id: 'build-home',
        title: 'Your Home System',
        body: 'Each world you own has a card here. SURFACE shows its districts, BUILD opens the full construction screen, QUICK lists what to build next.',
        targetElementId: 'system-context-panel',
        category: 'economy',
        requiredTab: 'galaxy',
        prepare: 'select-home',
    },
    {
        id: 'build-quick',
        title: 'Build Next',
        body: 'Resources first: farms, mines, a reactor and a chemical plant, because everything else is paid in what they make. Then a shipyard and an exploration ship to find new worlds. Then more build slots, housing and research. One click each.',
        targetElementId: 'quick-build-menu',
        category: 'economy',
    },
    {
        id: 'build-slots',
        title: 'Build Slots and Time',
        body: 'A world builds two things at a time; each Builder Outpost adds one. Extra orders wait their turn. Buildings take real minutes, so queue a few and come back. Red cost numbers mean you are short of that resource.',
        targetElementId: null,
        category: 'economy',
    },
    {
        id: 'build-specialise',
        title: 'Later: Specialise',
        body: 'Once the essentials stand, the full BUILD screen holds the rest: factories, labs, defences, storage, and your civilization’s own unique building. A world that leans one way earns a specialization bonus.',
        targetElementId: null,
        category: 'economy',
        prepare: 'clear-selection',
    },
];

export const TOURS: Record<TourId, Tour> = {
    screen: { id: 'screen', title: 'Your screen', blurb: 'Every part of the main screen, once.', steps: SCREEN },
    exploration: { id: 'exploration', title: 'Exploring the stars', blurb: 'Ping, scan, survey, then settle.', steps: EXPLORATION },
    building: { id: 'building', title: 'Building your worlds', blurb: 'What to build first, and why.', steps: BUILDING },
};

export const TOUR_IDS = Object.keys(TOURS) as TourId[];

/** The tour that starts by itself on a first visit. */
export const TUTORIAL_STEPS: TutorialStep[] = SCREEN;
