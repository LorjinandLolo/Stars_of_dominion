// lib/government/modifiers.ts
// Stars of Dominion — Government & Leadership.
//
// One place to ask "what is this government doing to the empire's numbers".
// Three sources stack additively: enacted policies (Phase 1), the sitting
// cabinet (Phase 3), and permanent legacy bonuses from completed ambitions.

import type { GameWorldState } from '@/lib/game-world-state';
import { getPolicyModifiers } from './policy-service';
import { getCabinetModifiers } from './cabinet-service';
import { getLegacyModifiers } from './legacy-service';
import { getCohesionModifiers } from './defiance-service';

/**
 * Keys every consumer understands. `research_speed` is cabinet-only today, the
 * rest are shared with the policy vocabulary.
 */
export interface GovernmentModifiers {
    production: number;
    tax_income: number;
    upkeep: number;
    pop_growth: number;
    approval: number;
    legitimacy_drift: number;
    research_speed: number;
}

const EMPTY: GovernmentModifiers = {
    production: 0,
    tax_income: 0,
    upkeep: 0,
    pop_growth: 0,
    approval: 0,
    legitimacy_drift: 0,
    research_speed: 0,
};

/** Sum of policy, cabinet and legacy effects. Additive deltas (0.1 = +10%). */
export function getGovernmentModifiers(world: GameWorldState, factionId: string): GovernmentModifiers {
    const total: GovernmentModifiers = { ...EMPTY };
    if (!world.government?.get?.(factionId)) return total;

    const sources: Array<Record<string, number>> = [];
    try { sources.push(getPolicyModifiers(world, factionId) as unknown as Record<string, number>); } catch { /* registry unavailable */ }
    try { sources.push(getCabinetModifiers(world, factionId)); } catch { /* no cabinet yet */ }
    try { sources.push(getLegacyModifiers(world, factionId)); } catch { /* no legacy yet */ }
    // Phase 6.2: a state losing cohesion simply collects and produces less.
    try { sources.push(getCohesionModifiers(world, factionId)); } catch { /* no cohesion yet */ }

    for (const source of sources) {
        for (const key of Object.keys(total) as Array<keyof GovernmentModifiers>) {
            const value = source[key];
            if (typeof value === 'number') total[key] += value;
        }
    }

    return total;
}
