// lib/combat/siege/battle-plans.ts
//
// Battle plans, HOI4-style. Instead of shoving every formation by hand, a
// commander assigns them to a front line to hold, or draws an offensive at a
// set of objectives. Planned formations sit and prepare — accruing a planning
// bonus — until the plan is executed, then advance on their own.

import type { PlanetSurface } from '../../planet-surface/types';
import type { DistrictWarState } from './siege-types';
import type { Formation, FormationSide } from './formations';
import { buildAdjacency, controllerOf, isPassable } from './district-front';
import { legalMoves } from './formations';

export type PlanKind = 'front' | 'offensive';

export interface BattlePlan {
    id: string;
    side: FormationSide;
    kind: PlanKind;
    /** Districts the plan is anchored on: the front to hold, or the line of departure. */
    anchors: number[];
    /** Objectives for an offensive — where the arrows point. */
    objectives: number[];
    /** 0-100. Grows while formations sit on the plan; spent when it executes. */
    preparation: number;
    /** Until this is true the formations dig in and prepare instead of advancing. */
    executing: boolean;
    createdAtSeconds: number;
}

export const PLAN_PREP_PER_CYCLE = 9;
/** Combat bonus at full preparation. */
export const PLAN_MAX_BONUS = 0.25;

/** The planning bonus a formation carries into battle, 0..PLAN_MAX_BONUS. */
export function planningBonus(plan: BattlePlan | undefined): number {
    if (!plan) return 0;
    return (Math.min(100, plan.preparation) / 100) * PLAN_MAX_BONUS;
}

/**
 * The front line for a side: its own districts that touch enemy ground. This
 * is what "assign to front" spreads formations across.
 */
export function frontDistricts(
    surface: PlanetSurface,
    war: DistrictWarState,
    side: FormationSide,
): number[] {
    const adjacency = buildAdjacency(surface);
    return surface.sectors
        .filter(s =>
            isPassable(s)
            && controllerOf(war, s.index) === side
            && adjacency[s.index].some(n =>
                isPassable(surface.sectors[n]) && controllerOf(war, n) !== side))
        .map(s => s.index);
}

export function createPlan(
    surface: PlanetSurface,
    war: DistrictWarState,
    side: FormationSide,
    kind: PlanKind,
    objectives: number[],
    nowSeconds: number,
): BattlePlan {
    return {
        id: `plan-${side}-${kind}-${nowSeconds}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        side,
        kind,
        anchors: frontDistricts(surface, war, side),
        objectives: kind === 'offensive' ? objectives : [],
        preparation: 0,
        executing: false,
        createdAtSeconds: nowSeconds,
    };
}

/** Formations assigned to a plan. */
export const assignedTo = (formations: Formation[], planId: string) =>
    formations.filter(f => f.strength > 0 && f.planId === planId);

/**
 * Advances a plan by one cycle: unexecuted plans accumulate preparation while
 * their formations hold position; executing plans push their formations toward
 * the objectives (or spread them along the front to hold it).
 */
export function tickPlan(
    surface: PlanetSurface,
    war: DistrictWarState,
    plan: BattlePlan,
    formations: Formation[],
): string[] {
    const log: string[] = [];
    const mine = assignedTo(formations, plan.id);
    if (!mine.length) return log;

    // The front moves as the war moves.
    plan.anchors = frontDistricts(surface, war, plan.side);

    if (!plan.executing) {
        plan.preparation = Math.min(100, plan.preparation + PLAN_PREP_PER_CYCLE);
        // Preparing formations dig in where they are; they do not wander.
        for (const f of mine) { f.moveTo = null; f.path = []; }
        return log;
    }

    const adjacency = buildAdjacency(surface);
    const targets = plan.kind === 'offensive' && plan.objectives.length
        ? plan.objectives
        : plan.anchors;
    if (!targets.length) return log;

    for (const f of mine) {
        if (f.moveTo != null || (f.path?.length ?? 0) > 0) continue;
        // Head for the nearest objective by hop count over passable ground.
        const target = nearestTarget(surface, adjacency, f.sectorIndex, targets);
        if (target == null || target === f.sectorIndex) continue;
        const step = stepToward(surface, war, f, target, adjacency);
        if (step != null) f.moveTo = step;
    }
    log.push(`${plan.kind === 'offensive' ? 'Offensive' : 'Front'} plan advances with ${mine.length} formation${mine.length > 1 ? 's' : ''}.`);
    return log;
}

function nearestTarget(
    surface: PlanetSurface,
    adjacency: number[][],
    from: number,
    targets: number[],
): number | null {
    const goal = new Set(targets);
    if (goal.has(from)) return from;
    const seen = new Set([from]);
    const queue: number[] = [from];
    while (queue.length) {
        const cur = queue.shift()!;
        for (const n of adjacency[cur]) {
            if (seen.has(n) || !isPassable(surface.sectors[n])) continue;
            if (goal.has(n)) return n;
            seen.add(n);
            queue.push(n);
        }
    }
    return null;
}

/** The legal first step that gets this formation closest to its objective. */
function stepToward(
    surface: PlanetSurface,
    war: DistrictWarState,
    formation: Formation,
    target: number,
    adjacency: number[][],
): number | null {
    // Hop distance to the target from every district (BFS from the target).
    const dist = new Map<number, number>([[target, 0]]);
    const queue = [target];
    while (queue.length) {
        const cur = queue.shift()!;
        for (const n of adjacency[cur]) {
            if (dist.has(n) || !isPassable(surface.sectors[n])) continue;
            dist.set(n, (dist.get(cur) ?? 0) + 1);
            queue.push(n);
        }
    }
    const options = legalMoves(surface, war, formation);
    let best: number | null = null;
    let bestDist = dist.get(formation.sectorIndex) ?? Infinity;
    for (const o of options) {
        const d = dist.get(o.sectorIndex);
        if (d == null) continue;
        if (d < bestDist) { bestDist = d; best = o.sectorIndex; }
    }
    return best;
}
