/**
 * lib/leadership/leadership-service.ts
 * Core logic for the Leadership System.
 */

import { GameWorldState } from '../game-world-state';
import { Leader, LeaderRole, LeaderTrait } from './types';
import traitsData from './data/leader-traits.json';
import { eventBus } from '../movement/event-bus';

const TRAITS: Map<string, LeaderTrait> = new Map(
    (traitsData as any[]).map(t => [t.id, t])
);

export class LeadershipService {
    /**
     * Assign a leader to a target (Fleet, Planet, or Empire-wide).
     */
    static assignLeader(world: GameWorldState, leaderId: string, assignmentId: string): void {
        const leader = world.leadership.leaders.get(leaderId);
        if (!leader) return;

        leader.assignmentId = assignmentId;
        leader.history.push({
            timestamp: world.nowSeconds,
            description: `Assigned to ${assignmentId}.`
        });

        eventBus.emit({
            type: 'leaderAssigned',
            leaderId,
            assignmentId,
            timestamp: world.nowSeconds
        });
    }

    /**
     * Grant XP to a leader and check for level ups.
     */
    static grantXP(world: GameWorldState, leaderId: string, amount: number): void {
        const leader = world.leadership.leaders.get(leaderId);
        if (!leader) return;

        leader.xp += amount;
        const nextLevelThreshold = leader.level * 1000;

        if (leader.xp >= nextLevelThreshold) {
            leader.level++;
            leader.xp -= nextLevelThreshold;
            leader.history.push({
                timestamp: world.nowSeconds,
                description: `Leveled up to ${leader.level}.`
            });

            eventBus.emit({
                type: 'leaderLeveledUp',
                leaderId,
                newLevel: leader.level,
                timestamp: world.nowSeconds
            });
        }
    }

    /**
     * Get aggregate modifiers from leaders for a specific context.
     */
    static getLeaderModifiers(world: GameWorldState, factionId: string, role?: LeaderRole, assignmentId?: string): Record<string, number> {
        const modifiers: Record<string, number> = {};
        const factionLeaders = Array.from(world.leadership.leaders.values())
            .filter(l => l.factionId === factionId && l.status === 'active');

        factionLeaders.forEach(leader => {
            // Filter by role or assignment if provided
            if (role && leader.role !== role) return;
            if (assignmentId && leader.assignmentId !== assignmentId) return;

            leader.traits.forEach(traitId => {
                const trait = TRAITS.get(traitId);
                if (!trait) return;

                for (const [key, val] of Object.entries(trait.modifiers)) {
                    modifiers[key] = (modifiers[key] || 0) + val;
                }
            });

            // Level bonus: 2% per level to all existing modifiers from traits
            const levelBonus = 1 + (leader.level - 1) * 0.02;
            for (const key in modifiers) {
                modifiers[key] *= levelBonus;
            }
        });

        return modifiers;
    }

    /**
     * Recruit a leader from the pool.
     */
    static recruitLeader(world: GameWorldState, leaderId: string, factionId: string): void {
        const poolIndex = world.leadership.recruitmentPool.findIndex(l => l.id === leaderId);
        if (poolIndex === -1) return;

        const leader = world.leadership.recruitmentPool.splice(poolIndex, 1)[0];
        leader.factionId = factionId;
        world.leadership.leaders.set(leader.id, leader);

        eventBus.emit({
            type: 'leaderRecruited',
            leaderId: leader.id,
            factionId,
            timestamp: world.nowSeconds
        });
    }
}
