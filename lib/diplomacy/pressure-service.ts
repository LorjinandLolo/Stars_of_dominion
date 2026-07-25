// lib/diplomacy/pressure-service.ts
// Stars of Dominion — Diplomacy Phase 2: organic pressure drift.
//
// Until now rivalryScore only moved when an order handler hardcoded it; the
// ideology-driven scoring function (cold-war-service.updateRivalryScore) had
// zero callers. This tick makes tension ORGANIC: every strategic tick each
// empire pair drifts one step toward its systemic baseline — ideological
// distance, hostile propaganda, proxy sponsorship, and recent diplomatic
// incidents — instead of sitting frozen wherever the last event left it.
//
// Event-driven shifts (rejections, treaties, wars) still land instantly via
// offer/gambit services; this drift is the slow tide underneath them.

import type { GameWorldState } from '@/lib/game-world-state';
import type { RivalryState } from '@/lib/politics/cold-war-types';
import { updateRivalryScore, calculateEscalationLevel } from '@/lib/politics/cold-war-service';
import { getOrCreateRivalry } from './offer-service';

/** Max score movement per strategic tick (6 sim-hours). */
const DRIFT_STEP = 1;
/** Détente doubles the speed of de-escalation (but not escalation). */
const DETENTE_STEP = 2;
/** A pair with no rivalry record starts tracking once its baseline reaches this. */
const TRACK_THRESHOLD = 30;
/** Diplomatic incidents older than 48 sim-hours stop feeding baseline tension. */
const CRISIS_MEMORY_SECONDS = 48 * 3600;

function recentTension(rivalry: (RivalryState & { recentEvents?: Array<{ atSeconds: number; scoreDelta: number }> }) | undefined, nowSeconds: number): number {
    if (!rivalry?.recentEvents?.length) return 0;
    let sum = 0;
    for (const e of rivalry.recentEvents) {
        if (nowSeconds - e.atSeconds <= CRISIS_MEMORY_SECONDS && e.scoreDelta > 0) sum += e.scoreDelta;
    }
    return Math.min(30, sum);
}

/**
 * Wars finally generate exhaustion (before Phase 3 only espionage subversion
 * moved warFatigue). Any active war among real empires adds fatigue each
 * strategic tick; full peace lets it ebb.
 */
export function tickWarFatigue(world: GameWorldState): void {
    let warPairs = 0;
    const seen = new Set<string>();
    for (const r of world.rivalries.values()) {
        if ((r.escalationLevel ?? 0) < 7) continue;
        // Only empire-vs-empire wars exhaust the population — the perpetual
        // raider hostilities (fleet-only factions with no economy record)
        // would otherwise ratchet fatigue to 100 forever.
        if (!world.economy.factions.has(r.empireAId) || !world.economy.factions.has(r.empireBId)) continue;
        const key = [r.empireAId, r.empireBId].sort().join('|');
        if (!seen.has(key)) { seen.add(key); warPairs++; }
    }
    if (warPairs > 0) {
        world.shared.warFatigue = Math.min(100, world.shared.warFatigue + 2 * Math.min(warPairs, 3));
    } else {
        world.shared.warFatigue = Math.max(0, world.shared.warFatigue - 1);
    }
}

/**
 * Drift every empire pair's rivalry toward its systemic baseline.
 * Wars (escalation 7) are frozen — only a peace settlement ends them.
 */
export function tickPressureDrift(world: GameWorldState): void {
    const factionIds: string[] = [];
    for (const id of world.economy.factions.keys()) {
        if ((world.movement.empirePostures.get(id) as any)?.ideology) factionIds.push(id);
    }
    const propaganda = [...world.propagandaCampaigns.values()];
    const proxies = [...world.proxyConflicts.values()];

    for (let i = 0; i < factionIds.length; i++) {
        for (let j = i + 1; j < factionIds.length; j++) {
            const aId = factionIds[i];
            const bId = factionIds[j];
            const existing = world.rivalries.get(`rivalry-${aId}-${bId}`)
                ?? world.rivalries.get(`rivalry-${bId}-${aId}`);

            if ((existing?.escalationLevel ?? 0) >= 7) continue; // wars don't drift

            const ideologyA = (world.movement.empirePostures.get(aId) as any).ideology;
            const ideologyB = (world.movement.empirePostures.get(bId) as any).ideology;
            const baseline = updateRivalryScore(existing, aId, bId, ideologyA, ideologyB, {
                sharedBorders: false, // border detection is a later refinement
                activePropagandaCamps: propaganda,
                activeProxyConflicts: proxies,
                recentCrisisTension: recentTension(existing as any, world.nowSeconds),
            }).rivalryScore;

            if (!existing && baseline < TRACK_THRESHOLD) continue; // quiet pairs stay untracked

            const rivalry = existing ?? getOrCreateRivalry(world, aId, bId);
            const current = rivalry.rivalryScore;
            if (current === baseline) continue;

            const step = baseline < current && rivalry.detenteActive ? DETENTE_STEP : DRIFT_STEP;
            // Drift can reach Near-Hot (6) but never silently trips the war
            // threshold — only deliberate acts (declarations, attacks) do that.
            const ceiling = 95;
            const next = current < baseline
                ? Math.min(Math.min(baseline, ceiling), current + step)
                : Math.max(baseline, current - step);

            for (const id of [`rivalry-${aId}-${bId}`, `rivalry-${bId}-${aId}`]) {
                const r = world.rivalries.get(id);
                if (!r) continue;
                r.rivalryScore = next;
                r.escalationLevel = calculateEscalationLevel(next);
            }
        }
    }
}
