/**
 * AI fleets are built the way a player builds them — through the player's own
 * orders (lib/ai/ai-orders.ts), never conjured.
 *
 * A player commissions a task force with MIL_BUILD_FLEET (the shell fee, the
 * yard gate at a world they hold, the first hull chained in as a recruitment
 * job) and fills it with MIL_RECRUIT_FORMATION_UNIT (per-hull price and build
 * timer, the same yard gate). The war AI's battle groups and the belt AI's
 * pickets used to appear finished, at the capital, the moment they were paid
 * for; now they go through exactly those two handlers:
 *
 *   1. MIL_BUILD_FLEET at a world the AI holds in its capital system, chaining
 *      the biggest hull of the plan. `before` snapshots the faction's fleet
 *      ids so `onDone` can tell which fleet the handler made.
 *   2. onDone gives that shell the AI's id (`-war-N`, `-trap-N`: the expansion
 *      and belt AIs tell battle groups and pickets apart by id) and its name,
 *      retargets the chained recruit job, and queues one
 *      MIL_RECRUIT_FORMATION_UNIT per remaining hull class. The drain runs
 *      those in the same pass.
 *
 * The fleet starts empty and is ready once no recruitment job targets it
 * (`hasPendingRecruits`). A refused order costs nothing and leaves no fleet.
 */
import type { Fleet } from '../movement/types';
import { queueAIOrder, hasQueuedAIOrder } from './ai-orders';
import { resolveRecruitSpec } from '../combat/ship-design-service';
import { minYardTierFor, systemYardFor } from '../combat/shipyard-gate';
import { SHIP_CLASS_IDS } from '../combat/ship-registry';

/** The shell fee MIL_BUILD_FLEET charges (lib/actions/registry.ts) and its rating (FLEET_SHELL_POWER). */
export const FLEET_SHELL_COST: Readonly<Record<string, number>> = { CREDITS: 1000, METALS: 500 };
export const FLEET_SHELL_POWER = 10;

/** Hull classes biggest first — the chained hull is the plan's biggest. */
const HULL_ORDER: readonly string[] = [...SHIP_CLASS_IDS].reverse();

/**
 * What MIL_BUILD_FLEET + the hull recruits will charge for `composition`, and
 * the rating the finished fleet carries. Priced by resolveRecruitSpec — the one
 * resolver both handlers price ships through — so the AI looks at the same
 * price tag the player's order will charge. Unknown hulls price as nothing (the
 * handler refuses them).
 */
export function fleetBuildQuote(composition: Record<string, number>): { cost: Record<string, number>; power: number; buildSeconds: number } {
    const cost: Record<string, number> = { ...FLEET_SHELL_COST };
    let power = FLEET_SHELL_POWER;
    let buildSeconds = 0;
    for (const [cls, n] of Object.entries(composition)) {
        if (!(n > 0)) continue;
        const r = resolveRecruitSpec(null, '', { unitType: cls }, 'fleet');
        if (!r.ok) continue;
        for (const [k, v] of Object.entries(r.spec.cost)) cost[k] = (cost[k] ?? 0) + v * n;
        power += r.spec.unitPower * n;
        buildSeconds = Math.max(buildSeconds, r.spec.buildTime * n);
    }
    return { cost, power, buildSeconds };
}

/** True while a recruitment job is still building ships for this fleet. */
export function hasPendingRecruits(world: any, fleetId: string): boolean {
    const jobs: any[] = world?.combat?.recruitmentJobs ?? [];
    return jobs.some(j => j?.targetFormationId === fleetId);
}

/** True while a build or recruit for this fleet id waits in the AI order outbox. */
export function hasQueuedFleetBuild(world: any, factionId: string, fleetId: string | RegExp): boolean {
    const is = (id: unknown) => typeof id === 'string' && (typeof fleetId === 'string' ? id === fleetId : fleetId.test(id));
    return hasQueuedAIOrder(world, factionId, 'MIL_BUILD_FLEET', p => is(p?.aiFleetId))
        || hasQueuedAIOrder(world, factionId, 'MIL_RECRUIT_FORMATION_UNIT', p => is(p?.formationId));
}

/** A world the faction holds in `systemId` to commission at — the capital world first. */
function yardWorldIn(world: any, factionId: string, systemId: string): any | null {
    const mine = [...world.construction.planets.values()]
        .filter((p: any) => p.ownerId === factionId && p.systemId === systemId)
        .sort((a: any, b: any) => (a.planetType === 'capital' ? 0 : 1) - (b.planetType === 'capital' ? 0 : 1) || a.id.localeCompare(b.id));
    return mine[0] ?? null;
}

/** The hull classes of `composition` the yard in `systemId` can lay. */
export function yardCanLay(world: any, factionId: string, systemId: string, composition: Record<string, number>): boolean {
    const tier = systemYardFor(world.construction.planets.values(), factionId, systemId, world.nowSeconds).tier;
    return Object.keys(composition).every(cls => minYardTierFor(cls) <= tier);
}

export interface AIFleetBuild {
    factionId: string;
    /** The id the fleet will carry (`fleet-<faction>-war-N`, `-trap-N`). */
    fleetId: string;
    name: string;
    /** Lowercase hull class → count. */
    composition: Record<string, number>;
    /** Where to build: a system the faction holds a world in. */
    systemId: string;
    /** Fields to set on the handler's shell once it is ours (doctrine, posture). */
    shapeFleet?: (shell: any) => Record<string, unknown>;
    reason?: string;
}

/**
 * Queue a fleet build through MIL_BUILD_FLEET and MIL_RECRUIT_FORMATION_UNIT.
 * Returns false (nothing queued) when the faction holds no world in the
 * system, the plan is empty, or it is a human's faction.
 */
export function queueAIFleetBuild(world: any, build: AIFleetBuild, enqueue: typeof queueAIOrder = queueAIOrder): boolean {
    const { factionId, fleetId } = build;
    const hulls = HULL_ORDER.filter(c => (build.composition[c] ?? 0) > 0)
        .concat(Object.keys(build.composition).filter(c => !HULL_ORDER.includes(c) && build.composition[c] > 0));
    if (hulls.length === 0) return false;
    const planet = yardWorldIn(world, factionId, build.systemId);
    if (!planet) return false;
    if (world.movement.fleets.has(fleetId) || hasQueuedFleetBuild(world, factionId, fleetId)) return false;

    const first = hulls[0];
    let before: Set<string> = new Set();
    // `enqueue` is queueAIOrder for an AI empire, queueAdvisorOrder when a
    // human approved the build (lib/delegation/advisor-proposals.ts).
    return enqueue(world, {
        factionId,
        actionId: 'MIL_BUILD_FLEET',
        // aiFleetId is ignored by the handler; it marks the order in the outbox.
        payload: { planetId: planet.id, systemId: planet.systemId, recruitUnitType: first.toUpperCase(), aiFleetId: fleetId },
        reason: build.reason ?? `commissions ${build.name}`,
        before: (w: any) => {
            before = new Set([...w.movement.fleets.values()].filter((f: any) => f.factionId === factionId).map((f: any) => f.id));
        },
        onDone: (w: any) => {
            const made = [...w.movement.fleets.values()].filter((f: any) => f.factionId === factionId && !before.has(f.id));
            if (made.length !== 1) {
                console.log(`[AI Fleets] ${factionId}'s MIL_BUILD_FLEET for ${fleetId} was refused.`);
                return;
            }
            adoptFleet(w, made[0], fleetId, build.name, build.shapeFleet?.(made[0]));
            // The chained hull is one ship; the rest of the plan is recruited
            // into the fleet by the player's per-hull order.
            for (const cls of hulls) {
                const n = (build.composition[cls] ?? 0) - (cls === first ? 1 : 0);
                if (n <= 0) continue;
                enqueue(w, {
                    factionId,
                    actionId: 'MIL_RECRUIT_FORMATION_UNIT',
                    payload: { formationId: fleetId, isFleet: true, unitType: cls.toUpperCase(), count: n },
                });
            }
        },
    });
}

/**
 * Queue recruits that bring an existing fleet (at a yard) up to `composition`.
 * Used when a build's follow-up recruits were refused and the shell sits
 * short. Returns how many recruit orders were queued.
 */
export function queueAIFleetTopUp(world: any, factionId: string, fleet: Fleet, composition: Record<string, number>): number {
    if (hasQueuedFleetBuild(world, factionId, fleet.id) || hasPendingRecruits(world, fleet.id)) return 0;
    let queued = 0;
    for (const [cls, want] of Object.entries(composition)) {
        const have = Number((fleet.composition as any)?.[cls] ?? 0);
        if (have >= want) continue;
        if (queueAIOrder(world, {
            factionId,
            actionId: 'MIL_RECRUIT_FORMATION_UNIT',
            payload: { formationId: fleet.id, isFleet: true, unitType: cls.toUpperCase(), count: want - have },
            reason: `tops up ${(fleet as any).name ?? fleet.id}`,
        })) queued++;
    }
    return queued;
}

/**
 * Give the handler's `fleet-<faction>-<timestamp>` shell the AI's id and name.
 * The chained recruit job follows it (its target and its `formation-` spoof).
 */
function adoptFleet(world: any, made: any, fleetId: string, name: string, shape?: Record<string, unknown>): void {
    const fleet = { ...made, ...(shape ?? {}), id: fleetId, name };
    world.movement.fleets.delete(made.id);
    world.movement.fleets.set(fleetId, fleet);
    for (const job of world.combat?.recruitmentJobs ?? []) {
        if (job.targetFormationId !== made.id) continue;
        job.targetFormationId = fleetId;
        job.planetId = `formation-${fleetId}`;
    }
}
