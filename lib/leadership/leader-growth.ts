// lib/leadership/leader-growth.ts
// Ministers and governors get better at the job while they hold it.
//
// Each strategic tick, every seated minister and every governor gains
// SKILL_GROWTH_PER_DAY competence, up to their potential
// (lib/leadership/character.ts). A leader who crosses into a new skill tier
// says so in their history, and the player hears about their own people. A
// leader's potential is written onto the record on their first growth tick so
// it never moves afterwards.

import type { GameWorldState } from '../game-world-state';
import type { Leader } from './types';
import { potentialOf, skillTier, SKILL_GROWTH_PER_DAY } from './character';
import { fireNotification } from '../time/notification-hooks';

const PORTFOLIO_LABEL: Record<string, string> = {
    defence: 'Defence', economy: 'Economy', science: 'Science',
    intelligence: 'Intelligence', interior: 'Interior', foreign: 'Foreign Affairs',
};

function grow(world: GameWorldState, leader: Leader, days: number, post: string): void {
    if (leader.potential === undefined) leader.potential = potentialOf(leader);
    const before = leader.competence ?? 50;
    if (before >= leader.potential) return;
    const after = Math.min(leader.potential, before + SKILL_GROWTH_PER_DAY * days);
    leader.competence = after;

    const was = skillTier(before), now = skillTier(after);
    if (now.rank <= was.rank) return;
    leader.history.push({ timestamp: world.nowSeconds, description: `Became ${now.label} as ${post}.` });

    const humans: string[] = Array.isArray((world as any).claimedFactionIds) ? (world as any).claimedFactionIds : [];
    if (!humans.includes(leader.factionId)) return;
    try {
        fireNotification({
            id: `tier-${leader.id}-${now.id}`,
            factionId: leader.factionId,
            category: 'politics',
            priority: 'low',
            title: `${leader.name} is now ${now.label}`,
            body: `Years as ${post} have made ${leader.name} ${now.label.toLowerCase()} at the job.`,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'leadership',
        } as any);
    } catch { /* notification queue absent in probes */ }
}

export function tickLeaderGrowth(world: GameWorldState, deltaSeconds: number): void {
    const leaders = world.leadership?.leaders;
    if (!leaders) return;
    const days = deltaSeconds / 86400;

    // Ministers: whoever actually holds a seat in their government's cabinet.
    if (world.government instanceof Map) {
        for (const gov of world.government.values() as Iterable<any>) {
            for (const [portfolio, leaderId] of Object.entries(gov.cabinet ?? {})) {
                const minister = leaderId ? leaders.get(leaderId as string) : undefined;
                if (minister?.status === 'active') grow(world, minister, days, `Minister of ${PORTFOLIO_LABEL[portfolio] ?? portfolio}`);
            }
        }
    }

    // Governors: whoever a world names as its governor.
    for (const planet of world.construction?.planets?.values?.() ?? []) {
        if (!planet.ownerId || !planet.governorId) continue;
        const governor = leaders.get(planet.governorId);
        if (governor?.status === 'active') grow(world, governor, days, `governor of ${planet.name ?? planet.id}`);
    }
}
