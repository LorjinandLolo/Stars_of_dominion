/**
 * lib/espionage/op-aftermath.ts
 * What each side is told when a covert operation resolves (spec item 11d).
 *
 * Before this, resolution set op.narrative / succeeded / attributionState and
 * nobody ever read them: the sponsor learned nothing, and the victim of a
 * caught operation learned nothing either.
 *
 * Both sides get the same two things:
 *   - an IntelReport, so the outcome sits in the Reports tab for a couple of
 *     days. Reports already ride the owner's private shard, expire on their
 *     own, and carry a hidden `accurate` flag — which is exactly what a
 *     suspicion needs once suspicions can be wrong (the case board, item 12).
 *   - a notification, so it reaches the bell and the daily brief.
 *
 * The victim hears only about what their service caught: an operation that
 * stayed invisible tells them nothing here. Its effects speak for themselves.
 */

import type { GameWorldState } from '../game-world-state';
import type { EspionageOperation, IntelReport } from './espionage-types';
import type { SpyAgent } from './agent-types';
import { fireNotification } from '../time/notification-hooks';
import { labelFor } from '../time/notification-names';

/** After-action reports outlive intelligence findings: two real days at 15x. */
export const AFTER_ACTION_TTL_SECONDS = 30 * 24 * 3600;

export const AFTER_ACTION_DOMAIN = 'after_action';
export const INCOMING_DOMAIN = 'incoming';

/** Factions nobody plays never read their bell; don't fill it. */
const NON_PLAYABLE = new Set(['faction-pirates', 'faction-neutral']);
function isPlayerRun(world: GameWorldState, factionId: string): boolean {
    if (NON_PLAYABLE.has(factionId)) return false;
    const claimed = (world as any).claimedFactionIds;
    return !Array.isArray(claimed) || claimed.includes(factionId);
}

export interface OperationAftermath {
    /** Operation name ("Sabotage Shipyard"). */
    name: string;
    /** Kind of operation, for a victim who only suspects ("a sabotage operation"). */
    kindPhrase: string;
    /** How it went, in words ("a partial success"). */
    outcomePhrase: string;
    /** The agent who ran it, after consequences were applied. */
    agent?: SpyAgent | null;
}

/** Catalog outcome ids, as the sponsor reads them. */
export const OUTCOME_PHRASE: Record<string, string> = {
    critical_success: 'a complete success',
    success: 'a success',
    partial_success: 'a partial success',
    failure: 'a failure',
    exposed_failure: 'a failure',
    backfire: 'a backfire',
};

function systemName(world: GameWorldState, systemId: string): string {
    return (world.movement?.systems?.get?.(systemId) as any)?.name ?? 'an unnamed system';
}

function caughtSentence(op: EspionageOperation, target: string, suspectId: string): string {
    if (op.attributionState === 'exposed') return `We were caught: ${target} knows who sent it.`;
    if (op.attributionState === 'suspected') {
        return suspectId === op.actorFactionId
            ? `${target} suspects us, but cannot prove it.`
            : `${target} noticed, and blames ${labelFor(suspectId)}.`;
    }
    return 'Nobody knows it was us.';
}

function agentSentence(agent: SpyAgent | null | undefined): string {
    if (!agent) return '';
    if (agent.status === 'burned') return ` ${agent.codename}'s cover is gone; the agent is burned.`;
    return ` ${agent.codename} is back with ${Math.round(agent.coverStrength * 100)}% cover.`;
}

/**
 * Tell both sides how an operation went. Call once, after resolution has set
 * succeeded / attributionState and pushed its AttributionRecord, and after the
 * agent's consequences were applied.
 */
export function reportOperationOutcome(op: EspionageOperation, world: GameWorldState, detail: OperationAftermath): void {
    const now = world.nowSeconds;
    const where = systemName(world, op.targetRegionId);
    const targetName = labelFor(op.targetFactionId);
    const createdAt = new Date(now * 1000).toISOString();

    const record = [...world.espionage.attributionRecords].reverse().find(r => r.operationId === op.id);
    const exposed = op.attributionState === 'exposed';
    // The suspect comes from the attribution record, not from the operation:
    // once suspicion can land on the wrong empire (item 12a), this is the line
    // that has to follow it.
    const suspectId = exposed ? op.actorFactionId : (record?.suspectedFactionId ?? op.actorFactionId);

    // ── The sponsor ─────────────────────────────────────────────────────────
    const actorBody = `${detail.name} against ${targetName} at ${where} was ${detail.outcomePhrase}. `
        + caughtSentence(op, targetName, suspectId) + agentSentence(detail.agent);
    const actorReport: IntelReport = {
        id: `aar-${op.id}`,
        ownerFactionId: op.actorFactionId,
        targetFactionId: op.targetFactionId,
        domain: AFTER_ACTION_DOMAIN,
        title: `${detail.name}: ${op.succeeded ? 'succeeded' : 'failed'}`,
        body: actorBody,
        confidence: 1,
        accurate: true,
        sourceOperationId: op.id,
        createdAt: now,
        expiresAt: now + AFTER_ACTION_TTL_SECONDS,
    };
    // Nothing AI-side reads reports, and AI empires run operations all season;
    // filing theirs would only fatten shards nobody opens.
    if (isPlayerRun(world, op.actorFactionId)) {
        world.espionage.reports.set(actorReport.id, actorReport);
        fireNotification({
            id: `esp-aar-${op.id}`,
            factionId: op.actorFactionId,
            category: 'espionage',
            priority: op.attributionState === 'exposed' ? 'urgent' : 'normal',
            title: op.succeeded ? 'OPERATION SUCCEEDED' : 'OPERATION FAILED',
            body: actorBody,
            createdAt,
            read: false,
            linkToTab: 'intelligence',
            payload: { operationId: op.id },
        });
    }

    // ── The victim, only if their service caught something ──────────────────
    if (op.attributionState === 'invisible') return;

    const suspectName = labelFor(suspectId);
    const effect = op.succeeded ? 'It did its damage.' : 'It failed.';

    const victimTitle = exposed ? `Caught: ${detail.name}` : `Suspected: ${detail.kindPhrase}`;
    const victimBody = exposed
        ? `${suspectName} ran ${detail.name} against us at ${where}, and our service caught them at it. ${effect}`
        : `Someone ran ${detail.kindPhrase} against us at ${where}. ${effect} Our service suspects ${suspectName}, but has no proof.`;

    // Opaque ids on the victim's side: operation ids embed the sponsor's
    // faction id, so `inc-${op.id}` (or a sourceOperationId) would hand the
    // victim the answer to a suspicion it is only supposed to have.
    const opaque = `${now}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    const victimReport: IntelReport = {
        id: `inc-${op.targetFactionId}-${opaque}`,
        ownerFactionId: op.targetFactionId,
        targetFactionId: suspectId,
        domain: INCOMING_DOMAIN,
        title: victimTitle,
        body: victimBody,
        confidence: exposed ? 1 : Math.max(0.05, Math.min(0.95, record?.probability ?? 0.5)),
        // Hidden truth: is the empire we blame the one that did it?
        accurate: suspectId === op.actorFactionId,
        createdAt: now,
        expiresAt: now + AFTER_ACTION_TTL_SECONDS,
    };
    if (isPlayerRun(world, op.targetFactionId)) {
        world.espionage.reports.set(victimReport.id, victimReport);
        fireNotification({
            id: `esp-inc-${op.targetFactionId}-${opaque}`,
            factionId: op.targetFactionId,
            category: 'espionage',
            priority: exposed ? 'urgent' : 'normal',
            title: exposed ? 'FOREIGN OPERATION CAUGHT' : 'FOREIGN OPERATION SUSPECTED',
            body: victimBody,
            createdAt,
            read: false,
            linkToTab: 'intelligence',
        });
    }
}

/** How a victim who only suspects names what hit them. */
export const KIND_PHRASE: Record<string, string> = {
    intel_gathering: 'an intelligence operation',
    disinformation: 'a disinformation campaign',
    economic: 'an economic sabotage operation',
    sabotage: 'a sabotage operation',
    military_blackops: 'a black operation',
    political: 'a political operation',
    counter_intelligence: 'a counter-intelligence sweep',
    // Legacy three-domain operations (old snapshots).
    infrastructureSabotage: 'a sabotage operation',
    politicalSubversion: 'a subversion campaign',
    shadowEconomy: 'a smuggling operation',
};
