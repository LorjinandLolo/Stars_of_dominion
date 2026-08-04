// lib/press-system/integration.ts
// Stars of Dominion — Diplomacy Phase 4: the press system goes live.
//
// The full information-warfare model (types.ts, simulation.ts) existed but
// `tickPressSystem` was only ever called from tests, `world.press` started
// empty, and no event ever produced a story. This module:
//   1. seeds press state from the live world (empires, one press planet per
//      owned system — propagation keys planets as `planet_${systemId}` —
//      state media per empire + independent + pirate outlets),
//   2. lets other systems inject stories (war declarations, oathbreaking,
//      sanctions, exposed spies → ESPIONAGE_LEAK at last),
//   3. runs the simulation each strategic tick over hyperlane adjacency.
//
// WORKER-SIDE ONLY.

import type { GameWorldState } from '@/lib/game-world-state';
import {
    SimulationState,
    Story,
    StorySource,
    StoryTruth,
    PressFactionType,
} from './types';
import { tickPressSystem } from './simulation';

function ensureShape(world: GameWorldState): SimulationState {
    const w = world as any;
    if (!w.press) w.press = {};
    const p = w.press;
    if (typeof p.tick !== 'number') p.tick = 0;
    if (!(p.empires instanceof Map)) p.empires = new Map();
    if (!(p.planets instanceof Map)) p.planets = new Map();
    if (!(p.pressFactions instanceof Map)) p.pressFactions = new Map();
    if (!(p.activeStories instanceof Map)) p.activeStories = new Map();
    if (!Array.isArray(p.publishedStories)) p.publishedStories = [];
    if (!(p.crises instanceof Map)) p.crises = new Map();
    if (!(p.investigations instanceof Map)) p.investigations = new Map();
    if (!(p.campaigns instanceof Map)) p.campaigns = new Map();
    if (!(p.quarantinedPlanets instanceof Set)) p.quarantinedPlanets = new Set();
    if (!(p.jammedSystems instanceof Set)) p.jammedSystems = new Set();
    if (!(p.counterNarratives instanceof Map)) p.counterNarratives = new Map();
    return p as SimulationState;
}

/**
 * Seed press actors and per-system press planets for anything missing.
 * Idempotent; run at world load and before each press tick.
 */
export function ensurePressState(world: GameWorldState): SimulationState {
    const press = ensureShape(world);

    for (const factionId of world.economy.factions.keys()) {
        if (!press.empires.has(factionId)) {
            press.empires.set(factionId, {
                id: factionId,
                publicTrust: 60,
                informationPressure: 0,
                activeCrises: new Set(),
                credibility: 60,
                mediaFreedom: 50,
                narrativeInfluence: 30,
            });
        } else {
            // Backfill snapshots written before the media-value expansion.
            const emp = press.empires.get(factionId)!;
            if (typeof emp.credibility !== 'number') emp.credibility = 60;
            if (typeof emp.mediaFreedom !== 'number') emp.mediaFreedom = 50;
            if (typeof emp.narrativeInfluence !== 'number') emp.narrativeInfluence = 30;
        }
        const stateMediaId = `${factionId}_STATE`;
        if (!press.pressFactions.has(stateMediaId)) {
            press.pressFactions.set(stateMediaId, {
                id: stateMediaId,
                type: PressFactionType.STATE_MEDIA,
                affiliatedEmpireId: factionId,
                credibility: 60,
                bias: 100,
                cooldowns: new Map(),
            });
        }
    }
    if (!press.pressFactions.has('galactic_wire')) {
        press.pressFactions.set('galactic_wire', {
            id: 'galactic_wire',
            type: PressFactionType.INDEPENDENT_MEDIA,
            credibility: 75,
            bias: 0,
            cooldowns: new Map(),
        });
    }
    if (!press.pressFactions.has('free_signal')) {
        press.pressFactions.set('free_signal', {
            id: 'free_signal',
            type: PressFactionType.PIRATE_PRESS,
            credibility: 40,
            bias: -100,
            cooldowns: new Map(),
        });
    }

    // Propagation convention: one press planet per system, id `planet_${systemId}`.
    for (const sys of world.movement.systems.values()) {
        const ownerId = (sys as any).ownerFactionId ?? (sys as any).ownerId;
        if (!ownerId) continue;
        const planetId = `planet_${sys.id}`;
        const existing = press.planets.get(planetId);
        if (existing) {
            existing.ownerId = ownerId; // conquest moves audiences
        } else {
            press.planets.set(planetId, {
                id: planetId,
                ownerId,
                stability: 70,
                happiness: 60,
                fear: 10,
                radicalization: 5,
                position: { x: (sys as any).x ?? 0, y: (sys as any).y ?? 0 },
            });
        }
    }

    // Snapshots written before publishing picked a real epicenter carry
    // publications anchored to a 'GENERIC_CAPITAL' placeholder. They match no
    // planet, so they can never propagate or decay — they would sit in the feed
    // forever now that outlets no longer re-publish the same story each tick.
    if (press.publishedStories.length > 0) {
        const live = press.publishedStories.filter(p => press.planets.has(p.originPlanetId));
        if (live.length !== press.publishedStories.length) {
            console.log(`[Press] Dropped ${press.publishedStories.length - live.length} publications with a dead epicenter.`);
            press.publishedStories = live;
        }
    }

    return press;
}

/** System-level adjacency for viral spread (hyperlane graph). */
export function buildSystemAdjacency(world: GameWorldState): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    for (const sys of world.movement.systems.values()) {
        adj.set(sys.id, Array.isArray((sys as any).hyperlaneNeighbors) ? (sys as any).hyperlaneNeighbors : []);
    }
    return adj;
}

export interface WorldStoryInput {
    targetEmpireId: string;
    subject: string;
    magnitude: number; // 0-100
    source?: StorySource;
    truth?: StoryTruth;
    /** 0-100. How well-documented; gates DENY. Defaults per source. */
    evidence?: number;
}

const DEFAULT_EVIDENCE: Record<StorySource, number> = {
    [StorySource.ESPIONAGE_LEAK]: 75,
    [StorySource.ECONOMIC_DATA]: 65,
    [StorySource.WAR_REPORT]: 55,
    [StorySource.RUMOR_MILL]: 20,
};

/**
 * Inject a story into the active pool. Press factions decide next tick
 * whether (and how loudly) to run it.
 */
export function pushWorldStory(world: GameWorldState, input: WorldStoryInput): void {
    const press = ensureShape(world);
    const id = `story-${input.targetEmpireId}-${world.nowSeconds}-${press.activeStories.size}`;
    const source = input.source ?? StorySource.WAR_REPORT;
    const story: Story = {
        id,
        source,
        truth: input.truth ?? StoryTruth.TRUE,
        targetEmpireId: input.targetEmpireId,
        subject: input.subject,
        baseMagnitude: Math.max(0, Math.min(100, Math.round(input.magnitude))),
        evidenceStrength: Math.max(0, Math.min(100, Math.round(input.evidence ?? DEFAULT_EVIDENCE[source]))),
        tickCreated: press.tick,
    };
    press.activeStories.set(id, story);
}

/** Read an empire's public trust (defaults to the seeded 60). */
export function getPublicTrust(world: GameWorldState, factionId: string): number {
    return (world as any).press?.empires?.get?.(factionId)?.publicTrust ?? 60;
}

/** Nudge an empire's public trust (clamped 0-100). Seeds press state if needed. */
export function adjustPublicTrust(world: GameWorldState, factionId: string, delta: number): void {
    const press = ensurePressState(world);
    const empire = press.empires.get(factionId);
    if (!empire) return;
    empire.publicTrust = Math.max(0, Math.min(100, empire.publicTrust + delta));
}

const MAX_PUBLISHED = 50;
const MAX_ACTIVE = 100;

/**
 * Run one press tick over the live world. Strategic tick = 6 sim-hours.
 */
export function tickPress(world: GameWorldState, tickIndex: number, dtHours = 6): void {
    const press = ensurePressState(world);
    const adj = buildSystemAdjacency(world);
    const { newState } = tickPressSystem(press, dtHours, tickIndex, adj, []);

    // Cap unbounded pools before persisting into the world blob.
    if (newState.publishedStories.length > MAX_PUBLISHED) {
        newState.publishedStories = newState.publishedStories.slice(-MAX_PUBLISHED);
    }
    if (newState.activeStories.size > MAX_ACTIVE) {
        const excess = newState.activeStories.size - MAX_ACTIVE;
        const keys = [...newState.activeStories.keys()].slice(0, excess);
        for (const k of keys) newState.activeStories.delete(k);
    }

    (world as any).press = newState;
}
