// lib/tutorial/tutorial-data.ts
// Stars of Dominion — All 15 Tutorial Steps
// Each step maps to a real DOM element ID in the existing UI.

import type { TutorialStep } from './tutorial-types';

export const TUTORIAL_STEPS: TutorialStep[] = [
    // ── Navigation ──────────────────────────────────────────────────────────
    {
        id: 'welcome',
        title: 'Welcome, Commander',
        body: 'Stars of Dominion is a real-time asynchronous grand strategy. The galaxy updates every 6 hours in strategic cycles, while diplomacy, espionage, and crises unfold continuously. This tutorial will walk you through all major systems.',
        targetElementId: null,
        category: 'navigation',
    },
    {
        id: 'navbar',
        title: 'The Command Bar',
        body: 'This is your main navigation. Each icon corresponds to a strategic pillar: Galaxy, Economy, Government, Intelligence, Press, Council, Tech, Discourse, Corporate, War, and Diplomacy. You can access any of them at any time.',
        targetElementId: 'navbar-root',
        category: 'navigation',
    },
    {
        id: 'tick-countdown',
        title: 'The Strategic Cycle',
        body: 'The countdown you see is the time until the next 6-hour strategic tick. Every tick, your empire processes production, construction, research, and trade. Plan your actions around this rhythm.',
        targetElementId: 'tick-countdown',
        category: 'time',
    },
    {
        id: 'notification-bell',
        title: 'Transmissions',
        body: 'The bell shows incoming alerts: crises requiring your response, research completions, diplomatic offers, and enemy movements. Urgent events pulse red. Check them before your next tick!',
        targetElementId: 'notification-bell',
        category: 'navigation',
    },

    // ── Galaxy ───────────────────────────────────────────────────────────────
    {
        id: 'galaxy-map',
        title: 'The Galaxy Map',
        body: 'This is your primary strategic view. Star systems are your territories and potential conquests. Colored borders show faction ownership. Click any system to see its details: planets, defenses, and trade value.',
        targetElementId: 'galaxy-map-canvas',
        category: 'galaxy',
        requiredTab: 'galaxy',
    },
    {
        id: 'galaxy-overlay',
        title: 'Overlay Intelligence',
        body: 'Use overlays to reveal hidden strategic information: Trade Heat (economic flow), Instability (rebellion risk), Escalation (conflict intensity), and Deep Space (unexplored regions). Toggle them in the top-right of the map.',
        targetElementId: 'galaxy-overlay-controls',
        category: 'galaxy',
        requiredTab: 'galaxy',
    },

    // ── Economy ──────────────────────────────────────────────────────────────
    {
        id: 'economy-panel',
        title: 'Your Economy',
        body: 'The Economy panel shows your resource stockpiles, production rates, and upkeep costs. Credits, Metals, Chemicals, and Food all accumulate each strategic tick. Building the right structures drives your growth.',
        targetElementId: 'economy-tab',
        category: 'economy',
        requiredTab: 'economy',
    },
    {
        id: 'construction',
        title: 'Building & Construction',
        body: 'Click any planet from the galaxy map to open its build panel. Construct industrial facilities, research labs, defense installations, and more. Each building takes one or more strategic cycles to complete.',
        targetElementId: null,
        category: 'economy',
    },

    // ── Research ─────────────────────────────────────────────────────────────
    {
        id: 'tech-tree',
        title: 'The Tech Tree',
        body: 'Navigate to the Tech panel to research new technologies. Each faction has a unique research path. Technologies unlock new buildings, ship designs, espionage operations, and diplomatic options. Allocate your science points wisely.',
        targetElementId: 'tech-tab',
        category: 'research',
        requiredTab: 'tech',
    },

    // ── Diplomacy ────────────────────────────────────────────────────────────
    {
        id: 'diplomacy',
        title: 'Diplomacy & Statecraft',
        body: 'The Diplomacy panel lets you propose treaties, trade pacts, tribute demands, and war declarations. Sent offers expire after 48 hours if unanswered. Check "Incoming Offers" for pending offers from rivals.',
        targetElementId: 'diplomacy-tab',
        category: 'diplomacy',
        requiredTab: 'diplomacy',
    },
    {
        id: 'rivalries',
        title: 'Rivalries & Escalation',
        body: 'Each pair of factions has a Rivalry Score (0–100) and Escalation Level (0–7). Sending envoys reduces rivalry; proxy wars and sanctions increase it. Direct war breaks out at Escalation Level 7. Détente can slow this descent.',
        targetElementId: null,
        category: 'diplomacy',
        requiredTab: 'diplomacy',
    },

    // ── Espionage ────────────────────────────────────────────────────────────
    {
        id: 'intelligence',
        title: 'Intelligence Operations',
        body: 'The Intelligence panel manages your spy agents and active operations. Each agent can be deployed to a rival system for sabotage, surveillance, counterintel, or propaganda. Operations resolve over real time — some immediately, others trigger crisis windows.',
        targetElementId: 'intelligence-tab',
        category: 'espionage',
        requiredTab: 'intelligence',
    },

    // ── Crisis Response ───────────────────────────────────────────────────────
    {
        id: 'crisis-response',
        title: 'Crisis Windows',
        body: 'When you are attacked — by sabotage, blockade, or coup attempt — a timed Crisis Window opens. You have 6–24 hours to choose a response: Escalate, Fortify, Deceive, Negotiate, or Sacrifice. If you go offline, your empire\'s doctrine auto-responds.',
        targetElementId: null,
        category: 'crisis',
    },
    {
        id: 'attacker-prediction',
        title: 'Prediction Mechanic',
        body: 'When launching a hostile action, you can predict how your target will respond. If your prediction matches their actual choice, you gain a 35% bonus to your attack effect. Wrong predictions give the defender a defensive boost. This rewards reading your opponents.',
        targetElementId: null,
        category: 'crisis',
    },

    // ── Victory ───────────────────────────────────────────────────────────────
    {
        id: 'victory',
        title: 'Victory & Legacy',
        body: 'Win by achieving one of several victory conditions: Conquest (control key regions), Enlightenment (cultural/tech dominance), Economic Hegemony (control trade routes), or Political Victory (control the Galactic Council). Each season locks some regions permanently — race to secure yours.',
        targetElementId: null,
        category: 'victory',
    },
];
