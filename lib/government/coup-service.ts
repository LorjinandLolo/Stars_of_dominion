// lib/government/coup-service.ts
// Stars of Dominion — Government & Leadership, Phase 4 (military coups).
//
// The counterweight to the parliamentary track: a government that skips
// institutions, loses legitimacy and leaves the officer corps angry does not get
// voted out — it gets removed. Pressure builds visibly, so a coup is the end of
// a story the player could read, not a random event.

import type { GameWorldState } from '@/lib/game-world-state';
import type { GovernmentState } from './types';
import { RNG } from '@/lib/trade-system/rng';
import { seedFromString } from '@/lib/leadership/leader-generator';
import { fireNotification } from '@/lib/time/notification-hooks';
import { pushWorldStory } from '@/lib/press-system/integration';
import { initRegistries, governmentRegistry } from '@/lib/politics/registry';
import { getGovernment, spendPoliticalCapital } from './government-service';
import { getHeadOfState, resolveSuccession } from './succession-service';
import { getMinister } from './cabinet-service';
import { recordPoliticalEvent } from './ideology-drift';

/** Pressure at which the player is warned. */
export const COUP_WARNING_THRESHOLD = 50;
/** Pressure at which officers may actually move. */
export const COUP_ATTEMPT_THRESHOLD = 80;
/** Capital cost of purging the officer corps. */
export const PURGE_OFFICERS_COST = 20;
/** Do not re-warn more often than this (2 sim days). */
const WARNING_COOLDOWN_SECONDS = 2 * 86400;

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

export interface CoupRiskBreakdown {
    pressure: number;
    /** Per-sim-day change at the current state; negative means cooling. */
    trendPerDay: number;
    drivers: string[];
}

/**
 * Why the officers are unhappy right now. Pure read — the panel uses this, and
 * tickCoups applies the same trend.
 */
export function assessCoupRisk(world: GameWorldState, factionId: string): CoupRiskBreakdown {
    const gov = getGovernment(world, factionId);
    if (!gov) return { pressure: 0, trendPerDay: 0, drivers: [] };

    const drivers: string[] = [];
    let trend = 0;

    const posture = world.movement.empirePostures.get(factionId);
    const military = posture?.blocs?.find(b => b.id === 'military');
    if (military) {
        const anger = (1 - military.satisfaction / 100) * (military.influence / 100);
        if (anger > 0.08) {
            trend += anger * 8;
            drivers.push(`Military command dissatisfied (${Math.round(military.satisfaction)}% satisfied, ${Math.round(military.influence)}% influence)`);
        }
    }

    if (gov.legitimacy < 40) {
        trend += (40 - gov.legitimacy) / 20;
        drivers.push(`Legitimacy at ${Math.round(gov.legitimacy)}`);
    }
    if (gov.corruption > 50) {
        trend += (gov.corruption - 50) / 40;
        drivers.push(`Corruption at ${Math.round(gov.corruption)}`);
    }

    const defence = getMinister(world, factionId, 'defence');
    if (defence && defence.loyalty < 35) {
        const drive = (defence.ambitionDrive ?? 50) / 100;
        trend += (35 - defence.loyalty) / 25 * (0.5 + drive);
        drivers.push(`Defence Minister ${defence.name} is disloyal (loyalty ${Math.round(defence.loyalty)})`);
    }

    const defiantWorlds = [...world.construction.planets.values()]
        .filter(p => p.ownerId === factionId && (p.unrest ?? 0) > 60).length;
    if (defiantWorlds > 0) {
        trend += defiantWorlds * 0.3;
        drivers.push(`${defiantWorlds} world(s) in open unrest`);
    }

    if (world.shared.warFatigue > 65) {
        trend += (world.shared.warFatigue - 65) / 35;
        drivers.push(`War exhaustion at ${Math.round(world.shared.warFatigue)}`);
    }

    // Civilian institutions are what keep soldiers in barracks.
    const civilianControl = (gov.senatePower ?? 0) / 100;
    trend -= civilianControl * 1.2;
    if (gov.legitimacy > 70 && (military?.satisfaction ?? 60) > 60) {
        trend -= 1.5;
        drivers.push('A satisfied officer corps under a legitimate government');
    }

    return { pressure: gov.coupPressure ?? 0, trendPerDay: trend, drivers };
}

/** Accumulate pressure, warn, and roll for an attempt when it runs hot. */
export function tickCoups(world: GameWorldState, deltaSeconds: number): void {
    if (!(world.government instanceof Map)) return;
    const days = deltaSeconds / 86400;

    for (const gov of world.government.values()) {
        const risk = assessCoupRisk(world, gov.factionId);
        gov.coupPressure = clamp100((gov.coupPressure ?? 0) + risk.trendPerDay * days);

        if (gov.coupPressure >= COUP_WARNING_THRESHOLD && gov.coupPressure < COUP_ATTEMPT_THRESHOLD) {
            const last = gov.lastCoupWarningSeconds ?? -Infinity;
            if (world.nowSeconds - last >= WARNING_COOLDOWN_SECONDS) {
                gov.lastCoupWarningSeconds = world.nowSeconds;
                notify(world, gov.factionId, {
                    id: `coup-warning-${gov.factionId}-${world.nowSeconds}`,
                    title: 'Loyalty of the Officer Corps in Doubt',
                    body: `${risk.drivers[0] ?? 'The general staff is restive'}. Coup pressure ${Math.round(gov.coupPressure)}/100.`,
                    priority: 'urgent',
                });
            }
        }

        if (gov.coupPressure >= COUP_ATTEMPT_THRESHOLD) {
            const rng = new RNG(seedFromString(`${gov.factionId}|coup|${Math.floor(world.nowSeconds / 3600)}`));
            if (rng.check(0.25 * days)) attemptCoup(world, gov);
        }
    }
}

export interface CoupOutcome {
    attempted: boolean;
    succeeded: boolean;
    message: string;
}

/**
 * Resolve a coup attempt. The government's defence is the head of state's
 * political skill, the loyalty of the Defence Ministry, and whatever legitimacy
 * it still holds.
 */
export function attemptCoup(world: GameWorldState, gov: GovernmentState): CoupOutcome {
    const leader = getHeadOfState(world, gov.factionId);
    const defence = getMinister(world, gov.factionId, 'defence');
    const rng = new RNG(seedFromString(`${gov.factionId}|coup-roll|${world.nowSeconds}`));

    const plotStrength = (gov.coupPressure ?? 0) / 100;
    const defenceStrength =
        ((leader?.politicalSkill ?? 50) / 100) * 0.4 +
        ((defence?.loyalty ?? 50) / 100) * 0.3 +
        (gov.legitimacy / 100) * 0.3;

    const successChance = Math.max(0.05, Math.min(0.95, plotStrength - defenceStrength * 0.8 + 0.25));
    const succeeded = rng.next() < successChance;

    return succeeded ? coupSucceeds(world, gov, leader?.name) : coupFails(world, gov);
}

function coupSucceeds(world: GameWorldState, gov: GovernmentState, leaderName?: string): CoupOutcome {
    initRegistries();

    const successor = resolveSuccession(world, gov.factionId, 'overthrown');

    // The junta rewrites the constitution around itself.
    const junta = governmentRegistry.get('military_junta');
    if (junta) {
        gov.governmentId = junta.id;
        gov.institutionName = junta.institution_name;
        gov.tags = junta.tags;
        gov.senatePower = junta.base_values.senate_power;
        gov.executivePower = junta.base_values.executive_power;
    } else {
        gov.tags = [...new Set([...(gov.tags ?? []), 'military_junta', 'autocracy'])];
        gov.senatePower = 0;
        gov.executivePower = 100;
    }

    gov.legitimacy = 35;
    gov.politicalCapital = 0;
    gov.coupPressure = 20;
    gov.termEndsAtSeconds = undefined;
    // Legislation in progress dies with the old order.
    for (const bill of gov.bills) if (bill.status === 'pending') bill.status = 'failed';

    // A junta drags the whole civilization with it (Phase 5 drift, ×3 because a
    // coup is not an ordinary act of state).
    recordPoliticalEvent(world, gov.factionId, 'coup_succeeded', 3);

    const message = `${leaderName ?? 'The head of state'} was removed by the general staff. ${successor?.title ?? ''} ${successor?.name ?? ''} now rules.`.trim();
    gov.history.push({ timestamp: world.nowSeconds, event: `Military coup: ${message}` });

    notify(world, gov.factionId, {
        id: `coup-success-${gov.factionId}-${world.nowSeconds}`,
        title: 'MILITARY COUP',
        body: message,
        priority: 'urgent',
    });
    try {
        pushWorldStory(world, { targetEmpireId: gov.factionId, subject: `Military coup: ${message}`, magnitude: 95 });
    } catch { /* press state absent on minimal worlds */ }

    return { attempted: true, succeeded: true, message };
}

function coupFails(world: GameWorldState, gov: GovernmentState): CoupOutcome {
    gov.coupPressure = 30;
    gov.legitimacy = clamp100(gov.legitimacy - 5);

    // The plotters are broken, and the army resents the purge that follows.
    const military = world.movement.empirePostures.get(gov.factionId)?.blocs?.find(b => b.id === 'military');
    if (military) military.satisfaction = clamp100(military.satisfaction - 15);

    const defence = getMinister(world, gov.factionId, 'defence');
    if (defence) defence.loyalty = clamp100(defence.loyalty - 10);

    const message = 'An attempted coup was put down. The officer corps has been purged.';
    gov.history.push({ timestamp: world.nowSeconds, event: message });
    notify(world, gov.factionId, {
        id: `coup-failed-${gov.factionId}-${world.nowSeconds}`,
        title: 'Coup Attempt Defeated',
        body: message,
        priority: 'urgent',
    });
    try {
        pushWorldStory(world, { targetEmpireId: gov.factionId, subject: 'Coup attempt defeated', magnitude: 80 });
    } catch { /* press state absent on minimal worlds */ }

    return { attempted: true, succeeded: false, message };
}

export interface PurgeResult {
    ok: boolean;
    message?: string;
    pressure?: number;
}

/**
 * Pre-emptively purge the officer corps: buys down coup pressure with capital,
 * at the cost of military goodwill and the government's own reputation.
 */
export function purgeOfficers(world: GameWorldState, factionId: string): PurgeResult {
    const gov = getGovernment(world, factionId);
    if (!gov) return { ok: false, message: 'This faction has no government.' };

    if (!spendPoliticalCapital(world, factionId, PURGE_OFFICERS_COST, 'purged the officer corps')) {
        return { ok: false, message: `A purge needs ${PURGE_OFFICERS_COST} political capital; the government holds ${Math.floor(gov.politicalCapital)}.` };
    }

    gov.coupPressure = clamp100((gov.coupPressure ?? 0) - 25);
    gov.corruption = clamp100(gov.corruption - 5);

    const military = world.movement.empirePostures.get(factionId)?.blocs?.find(b => b.id === 'military');
    if (military) military.satisfaction = clamp100(military.satisfaction - 10);

    const defence = getMinister(world, factionId, 'defence');
    if (defence) defence.loyalty = clamp100(defence.loyalty + 10);

    gov.history.push({ timestamp: world.nowSeconds, event: 'The officer corps was purged of suspect commanders.' });
    return { ok: true, pressure: gov.coupPressure };
}

function notify(
    world: GameWorldState,
    factionId: string,
    input: { id: string; title: string; body: string; priority: 'low' | 'normal' | 'urgent' }
): void {
    try {
        fireNotification({
            id: input.id,
            factionId,
            category: 'politics',
            priority: input.priority,
            title: input.title,
            body: input.body,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'government',
            payload: {},
        });
    } catch { /* notification queue absent in tests */ }
}
