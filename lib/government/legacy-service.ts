// lib/government/legacy-service.ts
// Stars of Dominion — Government & Leadership, Phase 3 (Legacy System).
//
// Every head of state enters office with three ambitions. Meeting one pays the
// administration immediately and leaves the EMPIRE a permanent modifier that
// outlives the leader — the difference between a government and a dynasty.

import type { GameWorldState } from '@/lib/game-world-state';
import type { Ambition, AmbitionMetric, GovernmentState, LegacyState } from './types';
import type { Leader } from '@/lib/leadership/types';
import { Resource } from '@/lib/trade-system/types';
import { RNG } from '@/lib/trade-system/rng';
import { seedFromString } from '@/lib/leadership/leader-generator';
import { initRegistries, ambitionRegistry } from '@/lib/politics/registry';
import { pushWorldStory } from '@/lib/press-system/integration';
import { fireNotification } from '@/lib/time/notification-hooks';

const AMBITIONS_PER_LEADER = 3;
const MAX_CHRONICLE = 40;

export function emptyLegacyState(): LegacyState {
    return { prestige: 0, completed: [], bonuses: {}, chronicle: [] };
}

/** Current value of an ambition metric for a faction. */
export function measureAmbitionMetric(
    world: GameWorldState,
    factionId: string,
    metric: AmbitionMetric
): number {
    switch (metric) {
        case 'systems_owned':
            return [...world.movement.systems.values()].filter(s => s.ownerFactionId === factionId).length;
        case 'planets_owned':
            return [...world.construction.planets.values()].filter(p => p.ownerId === factionId).length;
        case 'fleet_power':
            return [...world.movement.fleets.values()]
                .filter(f => f.factionId === factionId)
                .reduce((sum, f) => sum + (f.basePower ?? 0) * (f.strength ?? 1), 0);
        case 'credits_reserve':
            return world.economy.factions.get(factionId)?.reserves?.[Resource.CREDITS] ?? 0;
        case 'techs_researched':
            return world.tech.get(factionId)?.unlockedTechIds?.length ?? 0;
        case 'population':
            return [...world.construction.planets.values()]
                .filter(p => p.ownerId === factionId)
                .reduce((sum, p) => sum + (p.population ?? 0), 0);
        default:
            return 0;
    }
}

/**
 * Draw three ambitions for a leader taking office. Deterministic per leader, so
 * a replayed tick gives the same person the same goals. Targets are measured
 * against the empire as it stands right now.
 */
export function assignAmbitions(
    world: GameWorldState,
    factionId: string,
    leader: Leader
): Ambition[] {
    initRegistries();
    const defs = ambitionRegistry.getAll();
    if (defs.length === 0) return [];

    const rng = new RNG(seedFromString(`${leader.id}|ambitions`));
    const pool = [...defs];
    const chosen: Ambition[] = [];

    for (let i = 0; i < Math.min(AMBITIONS_PER_LEADER, pool.length); i++) {
        const def = pool.splice(rng.nextInt(0, pool.length - 1), 1)[0];
        const metric = def.metric as AmbitionMetric;
        const baseline = measureAmbitionMetric(world, factionId, metric);

        chosen.push({
            id: def.id,
            name: def.name,
            description: def.description,
            metric,
            mode: def.mode,
            target: def.target,
            baseline,
            progress: 0,
            completed: false,
            prestige: def.prestige,
            politicalCapital: def.political_capital,
            legitimacy: def.legitimacy,
            bonus: def.bonus,
        });
    }

    return chosen;
}

/**
 * Update ambition progress and pay out anything completed this tick.
 * Safe to call every tick — completed ambitions are never paid twice.
 */
export function tickAmbitions(world: GameWorldState, gov: GovernmentState, leader: Leader | undefined): void {
    if (!Array.isArray(gov.ambitions) || gov.ambitions.length === 0) return;
    if (!gov.legacy) gov.legacy = emptyLegacyState();

    for (const ambition of gov.ambitions) {
        if (ambition.completed) continue;

        const current = measureAmbitionMetric(world, gov.factionId, ambition.metric);
        const achieved = ambition.mode === 'delta' ? current - ambition.baseline : current;
        const required = ambition.target;

        ambition.progress = required > 0 ? Math.max(0, Math.min(1, achieved / required)) : 0;
        if (achieved < required) continue;

        completeAmbition(world, gov, ambition, leader);
    }
}

function completeAmbition(
    world: GameWorldState,
    gov: GovernmentState,
    ambition: Ambition,
    leader: Leader | undefined
): void {
    ambition.completed = true;
    ambition.progress = 1;
    ambition.completedAtSeconds = world.nowSeconds;

    gov.legacy.prestige += ambition.prestige;
    gov.legacy.completed.push(ambition.id);
    gov.politicalCapital = Math.min(gov.politicalCapitalCap, gov.politicalCapital + ambition.politicalCapital);
    gov.legitimacy = Math.max(0, Math.min(100, gov.legitimacy + ambition.legitimacy));

    // The permanent part: bonuses stack across every administration.
    for (const [key, value] of Object.entries(ambition.bonus ?? {})) {
        gov.legacy.bonuses[key] = (gov.legacy.bonuses[key] ?? 0) + value;
    }

    const leaderName = leader ? `${leader.title ?? ''} ${leader.name}`.trim() : 'The administration';
    gov.legacy.chronicle.push({ timestamp: world.nowSeconds, leaderName, ambition: ambition.name });
    if (gov.legacy.chronicle.length > MAX_CHRONICLE) {
        gov.legacy.chronicle.splice(0, gov.legacy.chronicle.length - MAX_CHRONICLE);
    }
    gov.history.push({ timestamp: world.nowSeconds, event: `${leaderName} achieved "${ambition.name}".` });

    if (leader) {
        leader.history.push({ timestamp: world.nowSeconds, description: `Achieved "${ambition.name}".` });
    }

    try {
        pushWorldStory(world, {
            targetEmpireId: gov.factionId,
            subject: `${leaderName} achieved ${ambition.name}`,
            magnitude: 55,
        });
    } catch { /* press state absent on minimal worlds */ }

    try {
        fireNotification({
            id: `ambition-${gov.factionId}-${ambition.id}-${world.nowSeconds}`,
            factionId: gov.factionId,
            category: 'politics',
            priority: 'normal',
            title: 'Ambition Achieved',
            body: `${leaderName}: ${ambition.name}. +${ambition.prestige} prestige.`,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'government',
            payload: { ambitionId: ambition.id },
        });
    } catch { /* notification queue absent in tests */ }
}

/**
 * Permanent modifiers the empire has earned, in the same key vocabulary as
 * policy effects so the same consumers pick them up.
 */
export function getLegacyModifiers(world: GameWorldState, factionId: string): Record<string, number> {
    return world.government?.get(factionId)?.legacy?.bonuses ?? {};
}
