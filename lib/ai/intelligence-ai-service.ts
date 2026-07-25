/**
 * lib/ai/intelligence-ai-service.ts
 * AI logic for deciding when and where to launch covert operations.
 */

import { GameWorldState } from '../game-world-state';
import { launchCatalogOperation } from '../espionage/espionage-service';
import { getOrCreateFactionIntel } from '../espionage/faction-intel';
import { OPERATION_CATALOG_BY_ID } from '../espionage/operation-catalog';
import { canLaunchCategory } from '../espionage/network-stages';

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

function identifyPotentialTargets(factionId: string, world: GameWorldState): string[] {
    const targets: string[] = [];
    
    // Check rivalries
    for (const [key, rivalry] of world.rivalries) {
        const [f1, f2] = key.split(':');
        if (f1 === factionId) targets.push(f2);
        else if (f2 === factionId) targets.push(f1);
    }

    // Add strong neighbors if not already there
    // (Simplified: just use factions with high military power/aggressive posture)
    for (const [fid, posture] of world.movement.empirePostures) {
        if (fid !== factionId && !targets.includes(fid)) {
            if (posture.current === 'Militarist' || posture.current === 'Expansionist') {
                targets.push(fid);
            }
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

function chooseOperationForArchetype(
    archetype: AIIntelligenceArchetype,
    attackerId: string,
    targetId: string,
    world: GameWorldState
): string | null {
    const infiltration = world.espionage.factionIntel.get(attackerId)?.infiltrationLevels[targetId] ?? 0;

    // Most-preferred op whose category the current network stage can support.
    // Low infiltration naturally degrades to intel gathering, which is also
    // how the network climbs toward the preferred ops.
    for (const opId of ARCHETYPE_PREFERENCES[archetype] ?? ARCHETYPE_PREFERENCES.shadow_empire) {
        const def = OPERATION_CATALOG_BY_ID.get(opId);
        if (!def) continue;
        if (canLaunchCategory(infiltration, def.category).allowed) return opId;
    }
    return null;
}
