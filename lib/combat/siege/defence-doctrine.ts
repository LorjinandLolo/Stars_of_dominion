// lib/combat/siege/defence-doctrine.ts
//
// What a garrison does when nobody is giving it orders. A defender who has
// not logged in yet — or an AI — still mans the capital and the strongpoints
// and holds the front with the rest. Without this the pieces sat wherever
// they were seeded and the invasion walked into an empty capital; with a bare
// front plan they all ran to the line and ALSO left the capital empty.
//
// Pure over the board. The worker applies it every cycle while
// `war.defenderAuto` is set (cleared by the first order the defending player
// gives); the AI applies it for its own sieges.

import type { PlanetSurface } from '../../planet-surface/types';
import type { DistrictWarState } from './siege-types';
import type { Formation } from './formations';
import { redeployRoute, legalMoves } from './formations';
import { CAPITAL_SECTOR, controllerOf } from './district-front';
import type { Strongpoint, StrongpointKind } from './strongpoints';
import { createPlan, type BattlePlan } from './battle-plans';

/** Districts the doctrine keeps a piece in, in priority order. */
export const PINNED_KINDS: StrongpointKind[] = ['capital', 'shield', 'fortress', 'barracks'];

/** A formation is not pulled off its post to go somewhere else below this organisation. */
const MIN_ORG_TO_MOVE = 40;
/** Pieces kept on the capital district. */
export const CAPITAL_PIECES = 2;
/** Plan kinds the doctrine owns; a player's own plans are never touched because the doctrine only runs while they have given no orders. */
const DOCTRINE_PLAN_KINDS: Array<BattlePlan['kind']> = ['front', 'offensive'];
/** The invader holding any district this close to the capital contracts the front onto the core. */
export const THREAT_RING = 3;

export interface DoctrineResult {
    /** Formation ids now standing on, or marching to, a pinned district. */
    pinned: Set<string>;
    /** Districts that wanted a piece and could not get one. */
    unmanned: number[];
    /** The standing front plan everything unpinned is assigned to. */
    plan: BattlePlan;
}

/**
 * Pin one piece to the capital and to each held, active strongpoint of the
 * pinned kinds; put every other defender formation on an executing front
 * plan. Pieces already on a wanted district stay; an empty district gets the
 * nearest unpinned piece that can reach it over friendly ground.
 */
export function applyDefaultDefence(
    surface: PlanetSurface,
    war: DistrictWarState,
    formations: Formation[],
    points: Strongpoint[],
    nowSeconds: number,
): DoctrineResult {
    const own = formations.filter(f => f.side === 'defender' && f.strength > 0);
    const pinned = new Set<string>();
    const unmanned: number[] = [];

    // Where we want pieces: the capital (always, while held — and two of
    // them, since losing it is losing the war), then one per strongpoint.
    // Posts are listed once each; `wantedCount` says how many pieces.
    const wanted: number[] = [];
    const wantedCount = new Map<number, number>();
    if (controllerOf(war, CAPITAL_SECTOR) === 'defender') { wanted.push(CAPITAL_SECTOR); wantedCount.set(CAPITAL_SECTOR, CAPITAL_PIECES); }
    for (const kind of PINNED_KINDS) {
        if (kind === 'capital') continue;
        for (const p of points) {
            if (p.kind === kind && p.active && p.holder === 'defender' && !wanted.includes(p.sectorIndex)) {
                wanted.push(p.sectorIndex);
                wantedCount.set(p.sectorIndex, 1);
            }
        }
    }

    const headingTo = (f: Formation, idx: number) =>
        f.sectorIndex === idx || f.moveTo === idx || (f.path?.length ? f.path[f.path.length - 1] === idx : false);

    // Pieces already standing on a wanted district, or already marching to one, hold it.
    for (const idx of wanted) {
        for (const f of own) if (headingTo(f, idx)) pinned.add(f.id);
    }
    // Under-manned posts get the nearest spare pieces that can get there.
    for (const idx of wanted) {
        const present = own.filter(f => pinned.has(f.id) && headingTo(f, idx)).length;
        for (let n = present; n < (wantedCount.get(idx) ?? 1); n++) {
            if (!assignNearest(idx)) { unmanned.push(idx); break; }
        }
    }
    function assignNearest(idx: number): boolean {
        let best: { f: Formation; route: number[] } | null = null;
        for (const f of own) {
            if (pinned.has(f.id) || (f.organization ?? 100) < MIN_ORG_TO_MOVE) continue;
            const route = redeployRoute(surface, war, f, idx);
            if (route && (!best || route.length < best.route.length)) best = { f, route };
        }
        if (!best) {
            // No rail route (cut off): try a plain march if it is adjacent.
            for (const f of own) {
                if (pinned.has(f.id)) continue;
                if (legalMoves(surface, war, f).some(o => o.sectorIndex === idx && !o.contested)) { best = { f, route: [idx] }; break; }
            }
        }
        if (!best) return false;
        best.f.planId = null;
        best.f.path = best.route;
        best.f.redeploying = best.route.length > 1;
        best.f.moveTo = null;
        pinned.add(best.f.id);
        return true;
    }

    // Everyone else holds the line — and when the invader is close to the
    // capital, only the part of the line around it: the defence contracts
    // onto the government rather than stringing itself along the whole front
    // while the enemy masses on one point. With the enemy IN the capital the
    // line no longer matters: everything that can move counter-attacks it,
    // because the government falls once it has been held CAPITAL_FALL_CYCLES.
    war.plans = war.plans ?? [];
    const capitalLost = controllerOf(war, CAPITAL_SECTOR) === 'attacker';
    let plan = war.plans.find(p => p.side === 'defender' && p.kind === (capitalLost ? 'offensive' : 'front'));
    if (!plan) {
        plan = createPlan(surface, war, 'defender', capitalLost ? 'offensive' : 'front', capitalLost ? [CAPITAL_SECTOR] : [], nowSeconds);
        war.plans.push(plan);
    }
    // Only one standing doctrine plan at a time; the other kind is dropped.
    const keep = plan.id;
    war.plans = war.plans.filter(p => p.side !== 'defender' || p.id === keep || !DOCTRINE_PLAN_KINDS.includes(p.kind));
    plan.executing = true;
    if (capitalLost) {
        plan.objectives = [CAPITAL_SECTOR];
        // A counter-attack needs men: the pinned pieces join it too.
        pinned.clear();
    }
    const threatened = surface.sectors.some(s => s.ring <= THREAT_RING && controllerOf(war, s.index) === 'attacker');
    plan.focus = !capitalLost && threatened ? 'core' : undefined;
    for (const f of own) {
        if (pinned.has(f.id)) {
            if (f.planId === plan.id) f.planId = null;
            continue;
        }
        if (f.planId !== plan.id) {
            f.planId = plan.id;
            f.moveTo = null;
            f.path = [];
        }
    }
    return { pinned, unmanned, plan };
}
