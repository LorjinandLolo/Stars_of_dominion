/**
 * lib/ai/intelligence-ai-service.ts
 * AI logic for deciding when and where to launch covert operations.
 */

import { GameWorldState } from '../game-world-state';
import { launchCatalogOperation } from '../espionage/espionage-service';
import { getOrCreateFactionIntel } from '../espionage/faction-intel';
import { OPERATION_CATALOG_BY_ID } from '../espionage/operation-catalog';
import { canLaunchCategory } from '../espionage/network-stages';
import { empireBuildingState } from '../construction/construction-service';

export type AIIntelligenceArchetype = 
  | "paranoid_security_state"
  | "economic_subverter"
  | "shadow_empire"
  | "revolution_exporter"
  | "precision_assassin";

interface AIIntelProfile {
    factionId: string;
    archetype: AIIntelligenceArchetype;
}

const AI_PROFILES: Record<string, AIIntelProfile> = {
    "faction-vektori": { factionId: "faction-vektori", archetype: "paranoid_security_state" },
    "faction-null-syndicate": { factionId: "faction-null-syndicate", archetype: "economic_subverter" },
    "faction-covenant": { factionId: "faction-covenant", archetype: "shadow_empire" },
    "faction-aurelian": { factionId: "faction-aurelian", archetype: "precision_assassin" },
};

/**
 * Main entry point for AI intelligence decisions.
 * Called during the strategic tick for each non-player faction.
 */
export function processEmpireIntelligenceTurn(factionId: string, world: GameWorldState) {
    const intel = getOrCreateFactionIntel(world, factionId);

    // 1. Don't act if at capacity or low on points
    if (intel.usedAgentCapacity >= intel.agentCapacity) return;
    if (intel.intelPoints < 50) return;

    // 2. Identify potential targets (rivals or strong neighbors)
    const targets = identifyPotentialTargets(factionId, world);
    if (targets.length === 0) return;

    const profile = AI_PROFILES[factionId] || { factionId, archetype: "shadow_empire" };

    // 3. Choose target and operation based on archetype
    for (const targetId of targets) {
        // One live operation per target. A service with capacity to spare
        // works its next rival rather than stacking everything on one capital.
        if (hasLiveOperationAgainst(world, factionId, targetId)) continue;
        const opId = chooseOperationForArchetype(profile.archetype, factionId, targetId, world);
        if (opId) {
            // Target the victim's capital system so region-based mechanics
            // (escalation, sensors, instability) hit a real system.
            const targetRegionId = world.economy.factions.get(targetId)?.capitalSystemId ?? targetId;
            const res = launchCatalogOperation(factionId, targetId, targetRegionId, opId, world);
            if (res.success) {
                console.log(`[AI-INTEL] ${factionId} (${profile.archetype}) launched ${opId} against ${targetId}`);
                break; // Only one per tick for now
            }
        }
    }
}

/** True while this empire already has an operation running against that one. */
export function hasLiveOperationAgainst(world: GameWorldState, actorId: string, targetId: string): boolean {
    for (const op of world.espionage.operations.values()) {
        if (op.status === 'active' && op.actorFactionId === actorId && op.targetFactionId === targetId) return true;
    }
    return false;
}

/** Rivalry score at which another empire is worth an agent. */
const RIVAL_TARGET_SCORE = 40;

/**
 * Who this empire would spy on, in the order it will try them.
 *
 * Rivals first, drawn at random in proportion to how much they are resented.
 * Services follow the galaxy's actual quarrels — which means an empire
 * everyone resents (the Infernoids, as the galaxy is seeded) is worked by
 * every service at once, held to one live operation each by the caller. That
 * is a pariah being treated as one; it is not the bug this replaced. The
 * original read rivalries by splitting the
 * map key on ':' — a separator no rivalry key contains (they are
 * `rivalry-<a>-<b>`) — so no rivalry ever produced a target, and every AI fell
 * through to the fallback below and took its FIRST entry: the same empire for
 * all of them, whichever aggressive posture came first in map order. That one
 * empire spent the season under thirty-odd concurrent operations while most
 * of the others were never touched.
 */
function identifyPotentialTargets(factionId: string, world: GameWorldState): string[] {
    const resentment = new Map<string, number>();
    for (const rivalry of world.rivalries.values()) {
        const other = rivalry.empireAId === factionId ? rivalry.empireBId
            : rivalry.empireBId === factionId ? rivalry.empireAId
                : null;
        if (!other || other === factionId) continue;
        if (!world.economy.factions.has(other)) continue;
        resentment.set(other, Math.max(resentment.get(other) ?? 0, rivalry.rivalryScore ?? 0));
    }

    const rivals = [...resentment.entries()].filter(([, score]) => score >= RIVAL_TARGET_SCORE);
    const targets: string[] = [];
    while (rivals.length > 0) {
        const total = rivals.reduce((sum, [, score]) => sum + score, 0);
        let roll = Math.random() * total;
        let index = rivals.findIndex(([, score]) => (roll -= score) < 0);
        if (index < 0) index = rivals.length - 1;
        targets.push(rivals.splice(index, 1)[0][0]);
    }

    // An empire in its announced transcendence window jumps the queue for
    // every service, resented or not — letting a rival ascend is the one thing
    // the whole galaxy agrees on (lib/victory, Enlightenment counterplay).
    const transcending = [...(world.victoryState?.enlightenmentProgress?.values() ?? [])]
        .filter(p => p.phase === 'transcending' && p.factionId !== factionId && world.economy.factions.has(p.factionId))
        .map(p => p.factionId);
    if (transcending.length > 0) {
        return [...transcending, ...targets.filter(t => !transcending.includes(t))];
    }

    // With nobody resented enough, watch the empires built for war — in an
    // order that differs per empire, for the same reason.
    if (targets.length === 0) {
        const aggressive = [...world.movement.empirePostures]
            .filter(([fid, posture]) => fid !== factionId
                && (posture.current === 'Militarist' || posture.current === 'Expansionist'))
            .map(([fid]) => fid);
        while (aggressive.length > 0) {
            targets.push(aggressive.splice(Math.floor(Math.random() * aggressive.length), 1)[0]);
        }
    }

    return targets;
}

/** Each archetype's signature ops, most-preferred first. */
const ARCHETYPE_PREFERENCES: Record<AIIntelligenceArchetype, string[]> = {
    economic_subverter: ["manipulate_market", "raid_trade_route", "infiltrate_government"],
    paranoid_security_state: ["infiltrate_military", "infiltrate_government"],
    revolution_exporter: ["incite_rebellion", "disinformation_fake_fleet", "infiltrate_government"],
    precision_assassin: ["assassinate_governor", "sabotage_shipyard", "infiltrate_military", "infiltrate_government"],
    shadow_empire: ["steal_research", "raid_trade_route", "infiltrate_government"],
};

/** What a service runs against an empire mid-transcendence, most-preferred first. */
const TRANSCENDENCE_BREAKERS = ["sabotage_archive", "election_interference", "incite_rebellion", "fund_separatists"];

function chooseOperationForArchetype(
    archetype: AIIntelligenceArchetype,
    attackerId: string,
    targetId: string,
    world: GameWorldState
): string | null {
    const infiltration = world.espionage.factionIntel.get(attackerId)?.infiltrationLevels[targetId] ?? 0;

    // Against a transcending empire every archetype reaches for what breaks
    // the attempt — the Archive, approval, cohesion — before its usual habits.
    const transcending = world.victoryState?.enlightenmentProgress?.get?.(targetId)?.phase === 'transcending';
    const preferences = [
        ...(transcending ? TRANSCENDENCE_BREAKERS : []),
        ...(ARCHETYPE_PREFERENCES[archetype] ?? ARCHETYPE_PREFERENCES.shadow_empire),
    ];

    // Most-preferred op whose category the current network stage can support.
    // Low infiltration naturally degrades to intel gathering, which is also
    // how the network climbs toward the preferred ops.
    for (const opId of preferences) {
        const def = OPERATION_CATALOG_BY_ID.get(opId);
        if (!def) continue;
        // Nothing to burn: already ruined, or never built.
        if (opId === 'sabotage_archive'
            && empireBuildingState(world.construction.planets.values(), targetId, 'great_archive') !== 'operational') continue;
        if (canLaunchCategory(infiltration, def.category).allowed) return opId;
    }
    return null;
}
