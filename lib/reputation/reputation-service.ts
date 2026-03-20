/**
 * lib/reputation/reputation-service.ts
 * Core logic for the Reputation System.
 */

import { GameWorldState } from '../game-world-state';
import { FactionReputation, ReputationThreshold } from './types';
import { eventBus } from '../movement/event-bus';

const REPUTATION_THRESHOLDS: ReputationThreshold[] = [
    { id: 'warmonger', scoreKey: 'aggression', min: 70, tag: 'Warmonger' },
    { id: 'honorable', scoreKey: 'honor', min: 70, tag: 'Honorable' },
    { id: 'deceptive', scoreKey: 'deception', min: 60, tag: 'Shadow State' },
    { id: 'trader', scoreKey: 'tradeInfluence', min: 65, tag: 'Merchant Hub' },
    { id: 'tyrant', scoreKey: 'oppression', min: 75, tag: 'Tyrant' },
    { id: 'opportunist', scoreKey: 'reliability', max: 30, tag: 'Opportunist' }
];

export class ReputationService {
    /**
     * Get or create reputation for a faction.
     */
    static getReputation(world: GameWorldState, factionId: string): FactionReputation {
        let rep = world.reputation.get(factionId);
        if (!rep) {
            rep = {
                factionId,
                scores: { aggression: 0, reliability: 100, deception: 0, tradeInfluence: 0, oppression: 0, honor: 50 },
                derivedTags: [],
                history: []
            };
            world.reputation.set(factionId, rep);
        }
        return rep;
    }

    /**
     * Update a reputation score based on an action.
     */
    static updateScore(world: GameWorldState, factionId: string, delta: Partial<FactionReputation['scores']>, action: string): void {
        const rep = this.getReputation(world, factionId);
        
        for (const [key, value] of Object.entries(delta)) {
            const k = key as keyof FactionReputation['scores'];
            rep.scores[k] = Math.max(0, Math.min(100, rep.scores[k] + (value || 0)));
        }

        rep.history.push({
            timestamp: world.nowSeconds,
            action,
            delta
        });

        this.deriveTags(rep);

        eventBus.emit({
            type: 'reputationShifted',
            factionId,
            action,
            delta,
            timestamp: world.nowSeconds
        });
    }

    /**
     * Derive public tags from raw scores.
     */
    static deriveTags(rep: FactionReputation): void {
        const activeTags: string[] = [];
        REPUTATION_THRESHOLDS.forEach(t => {
            const val = rep.scores[t.scoreKey];
            if (t.min !== undefined && val >= t.min) activeTags.push(t.tag);
            if (t.max !== undefined && val <= t.max) activeTags.push(t.tag);
        });
        rep.derivedTags = activeTags;
    }

    /**
     * Periodic decay: older actions matter less (simplified: drift toward baseline).
     */
    static decayReputation(world: GameWorldState, deltaSeconds: number): void {
        const decayRate = 0.01 * (deltaSeconds / 3600); // 1% per hour drift
        for (const rep of world.reputation.values()) {
            rep.scores.aggression *= (1 - decayRate);
            rep.scores.deception *= (1 - decayRate);
            rep.scores.oppression *= (1 - decayRate);
            rep.scores.tradeInfluence *= (1 - decayRate);
            
            // Reliability and Honor drift toward baseline (50/100)
            rep.scores.reliability += (100 - rep.scores.reliability) * decayRate;
            rep.scores.honor += (50 - rep.scores.honor) * decayRate;
            
            this.deriveTags(rep);
        }
    }
}
