// lib/government/approval-repair.ts
// Stars of Dominion — undo what the approval collapse did to a running galaxy.
//
// Until October 2026 two loops ran away in every galaxy within its first days:
//
//   - bloc drift charged the galaxy-wide espionage scalar (pinned at its
//     maximum by any one live operation) to every interest group of every
//     empire, so every bloc sat at zero satisfaction;
//   - the press cycle republished every story from every outlet every tick, so
//     every empire sat at maximum information pressure, took an unanswerable
//     media crisis a week and a scandal a fortnight, and public trust sat at
//     zero.
//
// Approval is those two numbers, so approval was zero everywhere, legitimacy
// bled out at four points a day, political capital stopped accruing, cohesion
// followed and empires came apart with nobody at war with them.
//
// The loops are fixed, and left alone a galaxy would climb back out — but
// slowly: trust regains 0.4 a day and legitimacy half a point, so an empire the
// bug flattened would spend most of a season getting back to where a new one
// starts. This puts the stocks the bug destroyed back to their resting values,
// once. It deliberately does NOT rewrite history: juntas stay in office, states
// that broke away stay independent, lost worlds stay lost, and open secession
// crises and defiance still have to be answered.
//
// It only ever moves a damaged value back TO its resting level, and only for
// empires showing the collapse signature (interest groups on the floor), so on
// a healthy galaxy it changes nothing. It runs once per
// world — the id is recorded in world.appliedRepairs, which rides the snapshot.
//
// WORKER-SIDE ONLY: the bloc model reads the fs-backed registries.

import type { GameWorldState } from '@/lib/game-world-state';
import { computeBlocOutlook } from '@/lib/politics/politics-service';
import { seatedInfluence } from '@/lib/politics/posture-bootstrap';
import { PressConfig } from '@/lib/press-system/config';
import type { SimulationState } from '@/lib/press-system/types';
import { computeCohesionDrivers } from './cohesion-service';
import { getGovernor } from './governor-service';
import {
    NEUTRAL_TRUST, WORKING_MANDATE, recomputeApproval, weightedBlocSatisfaction,
} from './government-service';

export const APPROVAL_REPAIR_ID = 'approval-collapse-2026-10';

/**
 * Interest groups under this, influence-weighted: the signature of the bug, not
 * of bad government. The bug held every bloc at zero; under the fixed model the
 * worst an empire can do (total war exhaustion and saturated espionage at once)
 * is the high teens. Trust is not part of the test: it fell more slowly, so a
 * young breakaway state could be flattened on its blocs with trust still up.
 */
const COLLAPSE_SIGNATURE = 10;
/** Coup pressure a repaired government is left with at most — wary officers, not a plot in motion. */
const REPAIRED_COUP_PRESSURE = 40;
/** Credibility a repaired press office is left with at least. */
const REPAIRED_CREDIBILITY = 50;
/**
 * Where a poor governor's drag now stops (governor-service), and the unrest a
 * lifted world is left with — low enough that the world's cohesion settles
 * above the line (40) where defiance starts counting down again.
 */
const RESTLESS_STABILITY = 50;
const RESTLESS_UNREST = 10;
/** A governor of a world put back to restless is left no worse than undecided. */
const REPAIRED_GOVERNOR_LOYALTY = 50;
/** Influence at or under this is a bloc ground down to the floor debates leave it (3%). */
const GROUND_DOWN_INFLUENCE = 3.5;

export interface ApprovalRepairReport {
    /** False when this world has already been repaired (or had nothing to repair). */
    applied: boolean;
    /** Empires that showed the collapse signature and were restored. */
    restored: string[];
    /** One line per thing done, for the worker log. */
    lines: string[];
}

function appliedRepairs(world: GameWorldState): string[] {
    const w = world as any;
    if (!Array.isArray(w.appliedRepairs)) w.appliedRepairs = [];
    return w.appliedRepairs;
}

/**
 * Restore the approval layer of a galaxy the collapse flattened. Idempotent:
 * the first call does the work and records itself, every later call returns
 * immediately.
 */
export function repairApprovalCollapse(world: GameWorldState): ApprovalRepairReport {
    const applied = appliedRepairs(world);
    if (applied.includes(APPROVAL_REPAIR_ID)) return { applied: false, restored: [], lines: [] };
    applied.push(APPROVAL_REPAIR_ID);

    const lines: string[] = [];
    const press = (world as any).press as SimulationState | undefined;
    const governments = world.government instanceof Map ? [...world.government.values()] : [];

    // Who was hit. Read before anything is touched: every step below changes
    // the numbers the signature is made of.
    const collapsed = governments
        .filter(gov => (world.movement?.empirePostures?.get?.(gov.factionId)?.blocs?.length ?? 0) > 0
            && weightedBlocSatisfaction(world, gov.factionId) < COLLAPSE_SIGNATURE)
        .map(gov => gov.factionId);

    if (collapsed.length === 0) return { applied: false, restored: [], lines };
    const wasHit = new Set(collapsed);

    // ── The galaxy-wide scalar ───────────────────────────────────────────────
    if ((world.shared?.espionagePressure ?? 0) > 0.5) {
        world.shared.espionagePressure = 0;
        lines.push('cleared the galaxy-wide espionage pressure scalar (it was pinned at its maximum)');
    }

    // ── The news cycle starts clean ──────────────────────────────────────────
    // The feed is fifty copies of whatever was republished last and the pool is
    // a hundred rumours the pressure bred. Keep only stories something live
    // still points at, and mark those as already run by every outlet so they
    // do not all break again as if new.
    if (press) {
        const referenced = new Set<string>();
        for (const inv of press.investigations?.values?.() ?? []) {
            if (!inv.resolved && inv.storyId) referenced.add(inv.storyId);
        }
        const outlets = [...(press.pressFactions?.keys?.() ?? [])];
        let dropped = 0;
        for (const [storyId, story] of press.activeStories) {
            if (referenced.has(storyId)) { story.carriedBy = [...outlets]; story.raisedCrisis = true; continue; }
            press.activeStories.delete(storyId);
            dropped++;
        }
        const publications = press.publishedStories.length;
        press.publishedStories = [];

        let crisesClosed = 0;
        for (const crisis of press.crises.values()) {
            if (crisis.resolved) continue;
            crisis.resolved = true;
            crisis.outcome = 'Overtaken by events.';
            press.empires.get(crisis.targetEmpireId)?.activeCrises?.delete?.(crisis.id);
            crisesClosed++;
        }

        for (const empire of press.empires.values()) {
            empire.informationPressure = 0;
            if (!wasHit.has(empire.id)) continue;
            empire.publicTrust = Math.max(empire.publicTrust, NEUTRAL_TRUST);
            empire.credibility = Math.max(empire.credibility ?? 0, REPAIRED_CREDIBILITY);
        }
        for (const audience of press.planets.values()) {
            audience.stability = Math.max(audience.stability, PressConfig.audience.restingStability);
            audience.radicalization = Math.min(audience.radicalization, PressConfig.audience.restingRadicalization);
        }
        lines.push(`reset the news cycle: ${dropped} stale stories, ${publications} publications, ${crisesClosed} open media crises`);
    }

    // ── Worlds the two planet-level rails ruined ─────────────────────────────
    // A poor governor's drag had no bottom and Movanite overcrowding pumped
    // unrest without limit; a world either one took to stability 0 and unrest
    // 100 stays there for ever, because nothing in the model brings it back.
    // Both now stop at "restless" (stability 50, unrest under the line where it
    // starts eating stability). Worlds already past that are put back TO it —
    // no further — and their governor with them, since a governor who has
    // written the capital off is what lets the unrest run again. An occupied
    // world is left alone: its unrest has a cause that is still standing on it.
    let worldsLifted = 0;
    for (const planet of world.construction?.planets?.values?.() ?? []) {
        if (!planet.ownerId || !wasHit.has(planet.ownerId) || planet.isOccupied) continue;
        const ruined = (planet.stability ?? 50) < RESTLESS_STABILITY || (planet.unrest ?? 0) > RESTLESS_UNREST;
        if (!ruined) continue;
        planet.stability = Math.max(planet.stability ?? 0, RESTLESS_STABILITY);
        planet.unrest = Math.min(planet.unrest ?? 0, RESTLESS_UNREST);
        planet.happiness = Math.max(planet.happiness ?? 0, RESTLESS_STABILITY);
        const governor = getGovernor(world, planet.id);
        if (governor) governor.loyalty = Math.max(governor.loyalty, REPAIRED_GOVERNOR_LOYALTY);
        worldsLifted++;
    }
    if (worldsLifted > 0) lines.push(`brought ${worldsLifted} ruined worlds back to restless`);

    // ── Chambers the same question ground down are reseated ──────────────────
    // Every exposed operation reopened the same debate and a prompt government
    // answered it the same way each time, six points of influence a vote: the
    // most spied-on empire ended with most of its blocs at the floor and three
    // owning the chamber. Only a chamber in that state is touched, and it is
    // put back to how it was seated at the start.
    let chambersReseated = 0;
    for (const factionId of collapsed) {
        const posture = world.movement?.empirePostures?.get?.(factionId);
        if (!posture?.blocs?.length) continue;
        const groundDown = posture.blocs.filter(b => b.influence <= GROUND_DOWN_INFLUENCE).length;
        if (groundDown * 2 < posture.blocs.length) continue;
        const seats = seatedInfluence(posture.society_tags ?? []);
        for (const bloc of posture.blocs) bloc.influence = seats.get(bloc.id) ?? bloc.influence;
        const total = posture.blocs.reduce((sum, b) => sum + b.influence, 0) || 1;
        for (const bloc of posture.blocs) bloc.influence = (bloc.influence / total) * 100;
        chambersReseated++;
    }
    if (chambersReseated > 0) lines.push(`reseated ${chambersReseated} chamber(s) whose blocs had been ground down to the floor`);

    // ── Interest groups go to where their circumstances put them ─────────────
    let blocsMoved = 0;
    for (const factionId of collapsed) {
        const posture = world.movement?.empirePostures?.get?.(factionId);
        if (!posture?.blocs) continue;
        for (const bloc of posture.blocs) {
            const { target } = computeBlocOutlook(bloc, posture, world, factionId);
            bloc.target = target;
            if (bloc.satisfaction < target) { bloc.satisfaction = target; blocsMoved++; }
        }
    }
    lines.push(`moved ${blocsMoved} interest groups up to their settled satisfaction`);

    // ── Governments get a working mandate back ───────────────────────────────
    for (const gov of governments) {
        if (!wasHit.has(gov.factionId)) continue;
        gov.approval = recomputeApproval(world, gov.factionId);
        gov.legitimacy = Math.max(gov.legitimacy, WORKING_MANDATE);
        gov.coupPressure = Math.min(gov.coupPressure ?? 0, REPAIRED_COUP_PRESSURE);
        gov.history.push({
            timestamp: world.nowSeconds,
            event: `Public confidence recovered: approval ${Math.round(gov.approval)}%.`,
        });
    }

    // ── Worlds stop reading the dead government as a reason to leave ─────────
    // Cohesion only drifts three points a day; a world whose cohesion sank
    // because the centre looked finished would otherwise go on sliding toward
    // secession for weeks after the centre recovered. Last, because it reads
    // everything restored above.
    let worldsSteadied = 0;
    for (const [planetId, record] of world.planetCohesion ?? []) {
        if (!wasHit.has(record.factionId)) continue;
        const { target } = computeCohesionDrivers(world, planetId);
        if (record.cohesion < target) { record.cohesion = target; worldsSteadied++; }
    }
    lines.push(`steadied ${worldsSteadied} worlds at the cohesion their conditions support`);
    lines.unshift(`restored ${collapsed.length} empire(s): ${collapsed.join(', ')}`);

    return { applied: true, restored: collapsed, lines };
}
