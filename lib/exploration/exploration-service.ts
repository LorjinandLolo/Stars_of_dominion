// lib/exploration/exploration-service.ts
// Progressive reveal (Ping/Scan/Survey), anomaly attachment,
// frontier expansion phases, and doctrine-based automation.

import type {
    MovementWorldState,
    ExplorationOrder,
    Anomaly,
    AnomalyTrigger,
    FrontierClaim,
    FrontierPhase,
    AutomationDoctrine,
    RevealStage,
    SystemNode,
    Fleet,
} from '../movement/types';
import { eventBus } from '../movement/event-bus';
import config from '../movement/movement-config.json';
import { RNG, seedFromString } from '../trade-system/rng';

/** Called when a survey completes, before anomaly attachment — the tick layer
 *  uses it to materialize the system's bodies so anomalies have somewhere to
 *  land. Kept as a callback so this module stays movement-only. */
export type SurveyCompletionHook = (systemId: string, factionId: string) => void;

/** Called when a completed order's fleet no longer exists — the tick layer
 *  uses it to refund the order cost and tell the player their scout is gone. */
export type OrderLostHook = (order: ExplorationOrder) => void;

/** Called when a survey attaches an anomaly — the tick layer surfaces it as a
 *  notification (nothing else subscribes to the event bus emission). */
export type AnomalyDiscoveredHook = (systemId: string, factionId: string, anomaly: Anomaly) => void;

// ─── Duration helpers ─────────────────────────────────────────────────────────

const STAGE_DURATIONS: Record<'ping' | 'scan' | 'survey', number> = {
    ping: config.exploration.pingDurationSeconds,
    scan: config.exploration.scanDurationSeconds,
    survey: config.exploration.surveyDurationSeconds,
};

// ─── Issue manual exploration order ───────────────────────────────────────────

/**
 * Issue a Ping / Scan / Survey order from a player fleet to a target system.
 * The fleet must be in sensor range or adjacent for scan/survey.
 */
export function issueExploreOrder(
    fleetId: string,
    targetSystemId: string,
    mode: 'ping' | 'scan' | 'survey',
    world: MovementWorldState
): ExplorationOrder | null {
    const fleet = world.fleets.get(fleetId);
    if (!fleet) return null;

    const now = world.nowSeconds;
    const duration = STAGE_DURATIONS[mode];

    const order: ExplorationOrder = {
        fleetId,
        factionId: fleet.factionId,
        targetSystemId,
        mode,
        isAutomated: false,
        issuedAt: toISO(now),
        completesAt: toISO(now + duration),
    };

    world.explorationOrders.push(order);
    return order;
}

/**
 * Ping a system from a shipyard's sensor array — no fleet involved. The
 * caller has already quoted and charged the distance price
 * (lib/exploration/ping-cost.ts); this only schedules the reveal.
 */
export function issueRelayPing(
    factionId: string,
    targetSystemId: string,
    relayFromSystemId: string | null,
    creditsPaid: number,
    world: MovementWorldState
): ExplorationOrder {
    const now = world.nowSeconds;
    const order: ExplorationOrder = {
        fleetId: '',
        factionId,
        targetSystemId,
        mode: 'ping',
        source: 'relay',
        relayFromSystemId: relayFromSystemId ?? undefined,
        creditsPaid,
        isAutomated: false,
        issuedAt: toISO(now),
        completesAt: toISO(now + STAGE_DURATIONS.ping),
    };
    world.explorationOrders.push(order);
    return order;
}

/**
 * Called when any stage lands — the tick layer tells the player who ordered
 * it. `prevStage` is what this faction knew before the order, so a caller can
 * tell a first survey from a re-survey (the saga counts only the first).
 */
export type StageCompleteHook = (order: ExplorationOrder, factionId: string, stage: RevealStage, prevStage: RevealStage) => void;

// ─── Advance exploration tick ──────────────────────────────────────────────────

/**
 * Process completed exploration orders and update visibility / anomaly state.
 * Call this every major sim tick.
 */
export function advanceExploration(
    world: MovementWorldState,
    deltaSeconds: number,
    onSurveyed?: SurveyCompletionHook,
    onOrderLost?: OrderLostHook,
    onAnomaly?: AnomalyDiscoveredHook,
    onStageComplete?: StageCompleteHook
): void {
    const now = world.nowSeconds;
    const completed: ExplorationOrder[] = [];
    const remaining: ExplorationOrder[] = [];

    for (const order of world.explorationOrders) {
        const completesAt = fromISO(order.completesAt);
        if (now >= completesAt) {
            completed.push(order);
        } else {
            remaining.push(order);
        }
    }
    world.explorationOrders = remaining;

    for (const order of completed) {
        processCompletedOrder(order, world, onSurveyed, onOrderLost, onAnomaly, onStageComplete);
    }
}

function processCompletedOrder(
    order: ExplorationOrder,
    world: MovementWorldState,
    onSurveyed?: SurveyCompletionHook,
    onOrderLost?: OrderLostHook,
    onAnomaly?: AnomalyDiscoveredHook,
    onStageComplete?: StageCompleteHook
): void {
    // A relay ping has no fleet to lose — its payer is stamped on the order.
    const fleet = order.source === 'relay' ? undefined : world.fleets.get(order.fleetId);
    const factionId = order.source === 'relay' ? order.factionId : fleet?.factionId;
    if (!factionId) {
        // The scout died (or was merged away) mid-order. Without this hook the
        // order evaporated silently — no reveal, no notice, no refund.
        onOrderLost?.(order);
        return;
    }

    const vis = world.factionVisibility.get(factionId);
    if (!vis) return;

    const existing = vis[order.targetSystemId];
    const prevStage: RevealStage = existing?.revealStage ?? 'unknown';

    // Evaluated BEFORE the visibility upgrade: has anyone in the galaxy already
    // surveyed this system? A system yields at most ONE onSurvey anomaly roll,
    // ever — without this, every repeat survey (same player re-clicking, or
    // each faction's first survey) consumed another entry from the
    // once-per-galaxy anomaly pool, and one busy system could drain it all.
    let surveyedByAnyone = false;
    for (const factionVis of world.factionVisibility.values()) {
        if (factionVis[order.targetSystemId]?.revealStage === 'surveyed') {
            surveyedByAnyone = true;
            break;
        }
    }

    const newStage: RevealStage =
        order.mode === 'ping' ? 'pinged' :
            order.mode === 'scan' ? 'scanned' :
    /* survey */              'surveyed';

    // Never downgrade
    const effectiveStage = pickHigherStage(prevStage, newStage);

    // Update tag reveal
    applyTagReveal(order.targetSystemId, effectiveStage, world);

    // Update visibility entry
    vis[order.targetSystemId] = {
        ...existing,
        revealStage: effectiveStage,
        lastSeenAt: toISO(world.nowSeconds),
        visibleTags: getVisibleTags(order.targetSystemId, effectiveStage, world),
        observedFleetIds: existing?.observedFleetIds ?? [],
        movementIntentVisible: existing?.movementIntentVisible ?? false,
    };

    eventBus.emit({
        type: 'explorationStageComplete',
        fleetId: order.fleetId,
        systemId: order.targetSystemId,
        stage: order.mode,
        factionId,
        timestamp: world.nowSeconds,
    });
    onStageComplete?.(order, factionId, effectiveStage, prevStage);

    // On survey: materialize the system's bodies first (via the tick layer's
    // hook), then attempt anomaly attachment — anomalies attach to planets, so
    // the order matters. The anomaly roll fires only on the FIRST survey of a
    // system by anyone; the hook itself is idempotent and always runs.
    if (order.mode === 'survey') {
        onSurveyed?.(order.targetSystemId, factionId);
        if (!surveyedByAnyone) {
            const found = attachAnomaly(order.targetSystemId, 'onSurvey', factionId, world);
            if (found) onAnomaly?.(order.targetSystemId, factionId, found);
        }
    }
}

function applyTagReveal(systemId: string, stage: RevealStage, world: MovementWorldState): void {
    const sys = world.systems.get(systemId);
    if (!sys) return;
    // Systems loaded from generated-systems.json carry no tagReveal — default
    // it from the live tag list instead of throwing on first reveal.
    if (!sys.tagReveal) sys.tagReveal = { allTags: [...sys.tags], revealedAt: {} };
    const all = sys.tagReveal.allTags;
    // Distribute tags across stages based on reveal order:
    // pinged   → first 25%
    // scanned  → next 50%
    // surveyed → rest
    const q1 = Math.floor(all.length * 0.25);
    const q2 = Math.floor(all.length * 0.75);
    sys.tagReveal.revealedAt.pinged = all.slice(0, q1);
    sys.tagReveal.revealedAt.scanned = all.slice(0, q2);
    sys.tagReveal.revealedAt.surveyed = all;
}

function getVisibleTags(systemId: string, stage: RevealStage, world: MovementWorldState): string[] {
    const sys = world.systems.get(systemId);
    if (!sys) return [];
    if (stage === 'unknown') return [];
    return sys.tagReveal?.revealedAt?.[stage] ?? [];
}

function pickHigherStage(a: RevealStage, b: RevealStage): RevealStage {
    const rank: Record<RevealStage, number> = { unknown: 0, pinged: 1, scanned: 2, surveyed: 3 };
    return rank[a] >= rank[b] ? a : b;
}

// ─── Anomaly attachment ────────────────────────────────────────────────────────

/**
 * Attempt to attach an anomaly to a system when the trigger fires.
 * Weights are tag-dependent and semi-random.
 */
export function attachAnomaly(
    systemId: string,
    trigger: AnomalyTrigger,
    factionId: string,
    world: MovementWorldState
): Anomaly | null {
    const sys = world.systems.get(systemId);
    if (!sys) return null;

    // Compute weighted chance
    let chance = config.exploration.anomalyBaseChance;
    for (const tag of sys.tags) {
        const boost = (config.exploration.anomalyTagWeightBoosts as Record<string, number>)[tag] ?? 0;
        chance = Math.min(1, chance + boost);
    }

    // Seeded on system + trigger, so a worker restart replays the identical
    // discovery — same defect class the pirate migration eliminated.
    const rng = new RNG(seedFromString(`anomaly|${systemId}|${trigger}`));
    if (rng.next() > chance) return null;

    // Pick an available anomaly from the pool that matches trigger
    const eligible = world.anomalyPool.filter(
        a => a.trigger === trigger && !a.triggered
    );
    if (eligible.length === 0) return null;

    // Weight by tag overlap
    const scored = eligible.map(a => {
        let score = 1;
        for (const tag of sys.tags) score += a.tagWeights[tag] ?? 0;
        return { a, score };
    }).sort((x, y) => y.score - x.score);

    const chosen = scored[0].a;

    // Find the attachment target BEFORE consuming the pool entry — a system
    // that rolled zero bodies must not burn a once-per-galaxy anomaly with no
    // observable effect.
    let target = null as { anomalyIds: string[] } | null;
    for (const planet of world.planets.values()) {
        if (planet.systemId === systemId && !planet.anomalyIds.includes(chosen.id)) {
            target = planet;
            break;
        }
    }
    if (!target) return null;

    chosen.triggered = true;
    chosen.triggeredAt = toISO(world.nowSeconds);
    target.anomalyIds.push(chosen.id);

    eventBus.emit({
        type: 'anomalyDiscovered',
        anomalyId: chosen.id,
        anomalyName: chosen.name,
        systemId,
        factionId,
        trigger,
        payload: chosen.payload,
        timestamp: world.nowSeconds,
    });

    return chosen;
}

// ─── Frontier expansion phases ────────────────────────────────────────────────

/**
 * Attempt to advance a frontier claim to the next phase.
 * Returns the updated claim, or null if conditions not met.
 */
export function advanceFrontierPhase(
    systemId: string,
    factionId: string,
    world: MovementWorldState
): FrontierClaim | null {
    const claim = world.frontierClaims.find(
        c => c.systemId === systemId && c.factionId === factionId
    );
    if (!claim) return null;

    const thresholds = config.exploration.frontierPhaseThresholds;
    const now = world.nowSeconds;

    if (claim.phase === 'claim') {
        const t = thresholds.claimToAnchor;
        if (claim.presenceScore >= t.minPresenceScore && claim.claimAgeDays >= t.minTimeDays) {
            claim.phase = 'anchor';
            claim.phaseStartedAt = toISO(now);
            eventBus.emit({ type: 'frontierPhaseChanged', systemId, factionId, from: 'claim', to: 'anchor', timestamp: now });
            return claim;
        }
    }

    if (claim.phase === 'anchor') {
        const t = thresholds.anchorToIntegrate;
        if (claim.presenceScore >= t.minPresenceScore && claim.claimAgeDays >= t.minTimeDays) {
            claim.phase = 'integrate';
            claim.phaseStartedAt = toISO(now);
            eventBus.emit({ type: 'frontierPhaseChanged', systemId, factionId, from: 'anchor', to: 'integrate', timestamp: now });
            return claim;
        }
    }

    return null; // Already at integrate, or conditions not met
}

/**
 * Advance presence scores for all active claims.
 * Call every major tick.
 */
export function tickFrontierClaims(world: MovementWorldState, deltaSeconds: number): void {
    const hours = deltaSeconds / 3600;
    for (const claim of world.frontierClaims) {
        // Advance claim age
        claim.claimAgeDays += hours / 24;

        // Presence score grows based on how many friendly fleets are in or near the system
        const friendlyFleets = [...world.fleets.values()].filter(
            f => f.factionId === claim.factionId && f.currentSystemId === claim.systemId
        );
        claim.presenceScore = Math.min(100, claim.presenceScore + friendlyFleets.length * 2 * hours);

        // Presence decays slowly if no fleets present
        if (friendlyFleets.length === 0) {
            const decay = claim.phase === 'claim' ? 0.5 * hours : 0.1 * hours;
            claim.presenceScore = Math.max(0, claim.presenceScore - decay);
        }

        // Attempt automatic phase advancement
        advanceFrontierPhase(claim.systemId, claim.factionId, world);
    }
}

// ─── Automated exploration doctrine ───────────────────────────────────────────

/**
 * Set or update a faction's automated exploration doctrine.
 */
export function setAutomationDoctrine(
    factionId: string,
    doctrine: Partial<AutomationDoctrine>,
    world: MovementWorldState
): AutomationDoctrine {
    const existing = world.automationDoctrines.get(factionId) ?? {
        factionId,
        maxScouts: config.exploration.automationMaxSimultaneousScouts,
        riskTolerance: 'balanced' as const,
        targetRegionIds: [],
        budget: 100,
        active: true,
    };
    const updated = { ...existing, ...doctrine };
    world.automationDoctrines.set(factionId, updated);
    return updated;
}

/**
 * Tick automated exploration: assign idle scouts to survey targets.
 * Returns the list of orders generated.
 */
export function tickAutomation(
    factionId: string,
    world: MovementWorldState,
    _deltaSeconds: number
): ExplorationOrder[] {
    const doctrine = world.automationDoctrines.get(factionId);
    if (!doctrine || !doctrine.active) return [];

    const riskTolerance = (config.exploration.automationRiskToleranceLevels as Record<string, number>)[doctrine.riskTolerance] ?? 0.5;
    const maxScouts = doctrine.maxScouts;

    // Find active automated orders this faction already has
    const activeAutoOrders = world.explorationOrders.filter(
        o => o.isAutomated && world.fleets.get(o.fleetId)?.factionId === factionId
    );
    if (activeAutoOrders.length >= maxScouts) return [];

    // Find candidate systems: not yet surveyed by this faction
    const factionVis = world.factionVisibility.get(factionId) ?? {};
    const candidates = [...world.systems.values()].filter(sys => {
        const vis = factionVis[sys.id];
        if (!vis || vis.revealStage === 'unknown' || vis.revealStage === 'pinged') return true;
        if (vis.revealStage === 'scanned') return true; // upgrade to survey
        return false;
    });

    // Filter by risk tolerance (avoid high-instability systems if conservative)
    const filtered = candidates.filter(sys => sys.instability <= riskTolerance * 100);

    // Pick targets: prefer those flagged in doctrine targetRegionIds, then any
    const prioritized = filtered.sort((a, b) => {
        const aPreferred = a.tags.some(t => doctrine.targetRegionIds.includes(t)) ? -1 : 1;
        const bPreferred = b.tags.some(t => doctrine.targetRegionIds.includes(t)) ? -1 : 1;
        return aPreferred - bPreferred;
    });

    // Find idle scout fleets
    const idleScouts = [...world.fleets.values()].filter(f =>
        f.factionId === factionId &&
        !f.destinationSystemId &&
        !world.explorationOrders.find(o => o.fleetId === f.id)
    );

    const newOrders: ExplorationOrder[] = [];
    const slotsAvailable = maxScouts - activeAutoOrders.length;

    for (let i = 0; i < Math.min(slotsAvailable, idleScouts.length, prioritized.length); i++) {
        const fleet = idleScouts[i];
        const target = prioritized[i];
        const existingVis = factionVis[target.id];
        const mode: 'ping' | 'scan' | 'survey' =
            !existingVis || existingVis.revealStage === 'unknown' ? 'ping' :
                existingVis.revealStage === 'pinged' ? 'scan' : 'survey';

        const now = world.nowSeconds;
        const order: ExplorationOrder = {
            fleetId: fleet.id,
            targetSystemId: target.id,
            mode,
            isAutomated: true,
            issuedAt: toISO(now),
            completesAt: toISO(now + STAGE_DURATIONS[mode]),
        };
        world.explorationOrders.push(order);
        newOrders.push(order);
    }

    return newOrders;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function toISO(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toISOString();
}

function fromISO(iso: string): number {
    return new Date(iso).getTime() / 1000;
}
