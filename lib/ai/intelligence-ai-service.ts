/**
 * lib/ai/intelligence-ai-service.ts
 * AI logic for deciding when and where to launch covert operations.
 */

import { GameWorldState } from '../game-world-state';
import { launchCatalogOperation } from '../espionage/espionage-service';
import { getOrCreateFactionIntel } from '../espionage/faction-intel';

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

function chooseOperationForArchetype(
    archetype: AIIntelligenceArchetype, 
    attackerId: string, 
    targetId: string, 
    world: GameWorldState
): string | null {
    const infiltration = world.espionage.factionIntel.get(attackerId)?.infiltrationLevels[targetId] ?? 0;

    switch (archetype) {
        case "economic_subverter":
            return infiltration > 40 ? "raid_trade_route" : "infiltrate_government";
        
        case "paranoid_security_state":
            // Focus on defense and gathering info
            return infiltration > 30 ? "infiltrate_military" : "infiltrate_government";

        case "revolution_exporter":
            // Look for unstable colonies
            return infiltration > 50 ? "incite_rebellion" : "infiltrate_government";

        case "precision_assassin":
            return infiltration > 60 ? "assassinate_governor" : "infiltrate_government";

        case "shadow_empire":
        default:
            // Flexible, starts with theft
            return infiltration > 40 ? "steal_research" : "infiltrate_government";
    }
}
