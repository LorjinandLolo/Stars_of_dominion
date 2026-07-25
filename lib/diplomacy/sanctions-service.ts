// lib/diplomacy/sanctions-service.ts
// Stars of Dominion — Diplomacy Phase 4: economic warfare (§20).
//
// WORKER-SIDE ONLY. Sanctions are a standing regime, not a debuff button:
// imposing one severs live trade between the pair, drains the target each
// strategic tick (scaling with coalition size), and costs the imposer too —
// both in credits and in merchant-bloc patience. The old "sanctions" were a
// flat global stability drip keyed off a never-populated list.

import type { GameWorldState } from '@/lib/game-world-state';
import { SanctionRecord } from './diplomacy-types';
import { ensureDiplomacyState, getOrCreateRivalry, shiftRivalry, isAtWar } from './offer-service';
import type { DiplomacyResult } from './offer-service';
import { pushWorldStory } from '@/lib/press-system/integration';
import { StorySource, StoryTruth } from '@/lib/press-system/types';

const ok = (message: string): DiplomacyResult => ({ success: true, message });
const fail = (message: string): DiplomacyResult => ({ success: false, message });

/** Target loses this fraction of credits per strategic tick, per unit of coalition weight. */
const TARGET_DRAIN_RATE = 0.004;
/** Each imposer burns this fraction of its own credits per tick (self-harm). */
const IMPOSER_DRAIN_RATE = 0.0015;
/** Every additional coalition member adds 50% bite. */
const COALITION_STEP = 0.5;

export function getSanction(world: GameWorldState, imposerId: string, targetId: string): SanctionRecord | undefined {
    return ensureDiplomacyState(world).sanctions.get(`${imposerId}|${targetId}`);
}

function coalitionSize(world: GameWorldState, targetId: string): number {
    let n = 0;
    for (const s of ensureDiplomacyState(world).sanctions.values()) {
        if (s.targetId === targetId) n++;
    }
    return n;
}

export function imposeSanctions(world: GameWorldState, imposerId: string, targetId: string): DiplomacyResult {
    const dip = ensureDiplomacyState(world);
    if (!targetId || targetId === imposerId) return fail('Invalid sanction target.');
    if (!world.economy.factions.has(targetId)) return fail('Target has no economy to sanction.');
    if (dip.sanctions.has(`${imposerId}|${targetId}`)) return fail('Sanctions are already in force.');
    if (isAtWar(world, imposerId, targetId)) return fail('You are at war — trade is already severed.');

    const rivalry = getOrCreateRivalry(world, imposerId, targetId);
    if ((rivalry.escalationLevel ?? 0) < 2) {
        return fail('Not enough tension for sanctions — requires escalation level 2.');
    }

    const record: SanctionRecord = {
        id: `${imposerId}|${targetId}`,
        imposerId,
        targetId,
        sinceSeconds: world.nowSeconds,
    };
    dip.sanctions.set(record.id, record);

    // Sever live commerce between the pair.
    for (const [id, pact] of [...world.tradePacts.entries()]) {
        const pair = [pact.empireAId, pact.empireBId];
        if (pair.includes(imposerId) && pair.includes(targetId)) {
            world.tradePacts.delete(id);
            world.economy.tradeAgreements?.delete?.(id);
        }
    }
    for (const [id, agreement] of [...(world.economy.tradeAgreements?.entries?.() ?? [])]) {
        const pair = [(agreement as any).aFactionId, (agreement as any).bFactionId];
        if (pair.includes(imposerId) && pair.includes(targetId)) {
            world.economy.tradeAgreements.delete(id);
        }
    }

    // Keep the legacy rivalry list in sync (older tick effects read it).
    if (!rivalry.activeSanctionIds.includes(record.id)) rivalry.activeSanctionIds.push(record.id);

    shiftRivalry(world, imposerId, targetId, 8, 'sanctions_imposed');
    pushWorldStory(world, {
        targetEmpireId: targetId,
        subject: `Sanctions imposed by ${imposerId}`,
        magnitude: 45 + 10 * (coalitionSize(world, targetId) - 1),
        source: StorySource.ECONOMIC_DATA,
        truth: StoryTruth.TRUE,
    });
    return ok('Sanctions regime in force.');
}

export function liftSanctions(world: GameWorldState, imposerId: string, targetId: string): DiplomacyResult {
    const dip = ensureDiplomacyState(world);
    const record = dip.sanctions.get(`${imposerId}|${targetId}`);
    if (!record) return fail('No sanctions of yours are in force against them.');
    dip.sanctions.delete(record.id);

    for (const id of [`rivalry-${imposerId}-${targetId}`, `rivalry-${targetId}-${imposerId}`]) {
        const r = world.rivalries.get(id);
        if (r) r.activeSanctionIds = r.activeSanctionIds.filter(s => s !== record.id);
    }
    shiftRivalry(world, imposerId, targetId, -5, 'sanctions_lifted');
    return ok('Sanctions lifted.');
}

/**
 * Per-strategic-tick economic bite. Coalition scaling: one sanctioner is the
 * baseline; each additional one adds 50% to the target's drain.
 */
export function tickSanctions(world: GameWorldState): void {
    const dip = ensureDiplomacyState(world);
    if (dip.sanctions.size === 0) return;

    const byTarget = new Map<string, SanctionRecord[]>();
    for (const s of dip.sanctions.values()) {
        // War supersedes sanctions — the regime dissolves into the blockade.
        if (isAtWar(world, s.imposerId, s.targetId)) {
            dip.sanctions.delete(s.id);
            continue;
        }
        if (!byTarget.has(s.targetId)) byTarget.set(s.targetId, []);
        byTarget.get(s.targetId)!.push(s);
    }

    for (const [targetId, records] of byTarget) {
        const targetReserves = world.economy.factions.get(targetId)?.reserves;
        const weight = 1 + COALITION_STEP * (records.length - 1);
        if (targetReserves) {
            const drain = Math.floor((targetReserves.CREDITS ?? 0) * TARGET_DRAIN_RATE * weight);
            targetReserves.CREDITS = Math.max(0, (targetReserves.CREDITS ?? 0) - drain);
        }
        // Target's merchants suffer under embargo.
        const targetBloc = (world.movement.empirePostures.get(targetId) as any)?.blocs?.find((b: any) => b.id === 'trade');
        if (targetBloc) targetBloc.satisfaction = Math.max(0, targetBloc.satisfaction - 0.6 * weight);

        for (const record of records) {
            const imposerReserves = world.economy.factions.get(record.imposerId)?.reserves;
            if (imposerReserves) {
                const selfCost = Math.floor((imposerReserves.CREDITS ?? 0) * IMPOSER_DRAIN_RATE);
                imposerReserves.CREDITS = Math.max(0, (imposerReserves.CREDITS ?? 0) - selfCost);
            }
            const imposerBloc = (world.movement.empirePostures.get(record.imposerId) as any)?.blocs?.find((b: any) => b.id === 'trade');
            if (imposerBloc) imposerBloc.satisfaction = Math.max(0, imposerBloc.satisfaction - 0.3);
        }
    }
}
