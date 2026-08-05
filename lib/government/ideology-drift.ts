// lib/government/ideology-drift.ts
// Stars of Dominion — Government & Leadership, Phase 5 (dynamic ideologies).
//
// The 7-axis IdeologyProfile has existed since the politics pillar, but outside
// policy enactment nothing ever moved it — `applyIdeologyShift` was called only
// from a test script. Empires now drift from what they actually DO (wars,
// invasions, covert work, purges) and from whose interests hold the country.

import type { GameWorldState } from '@/lib/game-world-state';
import type { IdeologyAxis, IdeologyProfile } from '@/lib/politics/ideology-types';
import { applyIdeologyShift } from '@/lib/politics/ideology-service';

/** Things an empire does that say something about what it is becoming. */
export type PoliticalEventKind =
    | 'declare_war'
    | 'offer_peace'
    | 'break_treaty'
    | 'sign_treaty'
    | 'invade_planet'
    | 'covert_operation'
    | 'purge_officers'
    | 'suppress_press'
    | 'election_held'
    | 'coup_succeeded';

/** One-off nudges, in axis points. Small: identity is the sum of many acts. */
const EVENT_SHIFTS: Record<PoliticalEventKind, Partial<Record<IdeologyAxis, number>>> = {
    declare_war: { militarism_pacifism: 4, order_chaos: 1 },
    offer_peace: { militarism_pacifism: -3 },
    break_treaty: { order_chaos: -3, tradition_progress: -1 },
    sign_treaty: { order_chaos: 2, expansionism_isolationism: -1 },
    invade_planet: { militarism_pacifism: 3, expansionism_isolationism: 4, authoritarianism_liberty: 1 },
    covert_operation: { order_chaos: -1, authoritarianism_liberty: 2 },
    purge_officers: { authoritarianism_liberty: 4, order_chaos: 3 },
    suppress_press: { authoritarianism_liberty: 5, tradition_progress: 1 },
    election_held: { authoritarianism_liberty: -3, centralization_autonomy: -1 },
    coup_succeeded: { militarism_pacifism: 8, authoritarianism_liberty: 10, order_chaos: 5 },
};

/** Passive pull per sim day from an interest group holding the country. */
const BLOC_PULL_PER_DAY = 1.2;
/** A bloc must hold at least this share of influence to shape the identity. */
const BLOC_PULL_MIN_INFLUENCE = 12;
/** …and be at least this content; an angry bloc pushes back rather than leads. */
const BLOC_PULL_MIN_SATISFACTION = 50;

function ideologyOf(world: GameWorldState, factionId: string): IdeologyProfile | undefined {
    return world.movement.empirePostures.get(factionId)?.ideology;
}

/**
 * Record something the empire did. Call from the order handlers — this is what
 * makes "every major decision slowly reshapes the civilization" literal.
 */
export function recordPoliticalEvent(
    world: GameWorldState,
    factionId: string,
    kind: PoliticalEventKind,
    scale = 1
): void {
    const ideology = ideologyOf(world, factionId);
    if (!ideology) return;

    const shifts = EVENT_SHIFTS[kind];
    if (!shifts) return;

    for (const [axis, delta] of Object.entries(shifts)) {
        applyIdeologyShift(ideology, axis as IdeologyAxis, (delta ?? 0) * scale);
    }
}

/**
 * Slow pull toward the outlook of whoever actually holds power domestically.
 * A country run by satisfied militarists becomes militarist whether or not the
 * government meant it to.
 */
export function tickIdeologyDrift(world: GameWorldState, deltaSeconds: number): void {
    const days = deltaSeconds / 86400;

    for (const posture of world.movement.empirePostures.values()) {
        const ideology = posture.ideology;
        if (!ideology || !Array.isArray(posture.blocs)) continue;

        const totalInfluence = posture.blocs.reduce((s, b) => s + b.influence, 0) || 1;

        for (const bloc of posture.blocs) {
            if (bloc.influence < BLOC_PULL_MIN_INFLUENCE) continue;
            if (bloc.satisfaction < BLOC_PULL_MIN_SATISFACTION) continue;
            const affinity = bloc.ideologyAffinity;
            if (!affinity) continue;

            const weight = (bloc.influence / totalInfluence) * ((bloc.satisfaction - 50) / 50);
            if (weight <= 0) continue;

            for (const [axis, pull] of Object.entries(affinity)) {
                if (!(axis in ideology)) continue;
                applyIdeologyShift(ideology, axis as IdeologyAxis, pull * weight * BLOC_PULL_PER_DAY * days);
            }
        }
    }
}
