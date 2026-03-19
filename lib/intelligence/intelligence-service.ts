/**
 * lib/intelligence/intelligence-service.ts
 * Core logic for operation resolution, infiltration, and counter-intelligence.
 */

import { 
  IntelligenceWorldState, 
  ActiveOperation, 
  IntelligenceOperationDefinition, 
  OperationOutcome,
  OperationPhase,
  IntelligenceNetwork
} from './types';
import { GameWorldState } from '../game-world-state';
import { eventBus } from '../movement/event-bus';
import { triggerCrisis } from '../crisis-manager';


/**
 * Start a new covert operation.
 */
export function startOperation(
  attackerEmpireId: string,
  targetEmpireId: string,
  targetId: string,
  definitionId: string,
  world: GameWorldState
): { success: boolean; message: string; operationId?: string } {
  const intel = world.intelligence;
  const def = intel.definitions.get(definitionId);
  if (!def) return { success: false, message: "Invalid operation definition." };

  const network = intel.networks.get(attackerEmpireId);
  if (!network) return { success: false, message: "Intelligence network not found for attacker." };

  // 1. Capacity check
  if (network.usedAgentCapacity >= network.agentCapacity) {
    return { success: false, message: "Maximum agent capacity reached." };
  }

  // 2. Cost check
  if (network.intelPoints < def.intelCost) {
    return { success: false, message: "Insufficient Intelligence Points." };
  }
  // (Credits cost would normally check economy state, simplified here)

  // 3. Deduct costs and increase capacity usage
  network.intelPoints -= def.intelCost;
  network.usedAgentCapacity += 1;

  // 4. Create operation
  const now = world.nowSeconds;
  const durationHours = def.durationHoursMin + Math.random() * (def.durationHoursMax - def.durationHoursMin);
  const durationSeconds = durationHours * 3600;

  const id = `intel-${attackerEmpireId}-${Date.now()}`;
  const op: ActiveOperation = {
    id,
    definitionId,
    attackerEmpireId,
    targetEmpireId,
    targetId,
    phase: "planning",
    startedAt: now,
    resolvesAt: now + durationSeconds,
    successChanceFinal: calculateSuccessChance(def, attackerEmpireId, targetEmpireId, world),
    exposureChanceFinal: calculateExposureChance(def, attackerEmpireId, targetEmpireId, world),
    modifiers: [], // Tracked via calculate functions for now
    status: "active"
  };

  intel.operations.set(id, op);

  return { success: true, message: `Operation ${def.name} launched.`, operationId: id };
}

/**
 * Advanced tick logic for all active operations.
 */
export async function tickIntelligence(world: GameWorldState, deltaSeconds: number) {
  const now = world.nowSeconds;
  const intel = world.intelligence;

  // 1. Passive intel point generation
  for (const network of intel.networks.values()) {
    // Base gen: 1.5 point per hour
    network.intelPoints += (deltaSeconds / 3600) * 1.5;
    network.intelPoints = Math.min(1000, network.intelPoints);
  }

  // 2. Process operations
  for (const op of intel.operations.values()) {
    if (op.status !== "active") continue;

    const elapsed = now - op.startedAt;
    const totalDuration = op.resolvesAt - op.startedAt;
    const progress = totalDuration > 0 ? elapsed / totalDuration : 1.0;

    if (progress >= 1.0) {
      await resolveOperation(op, world);
    } else if (progress > 0.8) {
      op.phase = "exposure_check";
    } else if (progress > 0.6) {
      op.phase = "execution";
    } else if (progress > 0.3) {
      op.phase = "infiltration";
    } else {
      op.phase = "planning";
    }
  }
}

/**
 * Resolve an operation and apply outcomes.
 */
async function resolveOperation(op: ActiveOperation, world: GameWorldState) {
  const def = world.intelligence.definitions.get(op.definitionId);
  if (!def) return;

  const roll = Math.random();
  let outcome: OperationOutcome = "failure";

  if (roll < op.successChanceFinal / 4) {
    outcome = "critical_success";
  } else if (roll < op.successChanceFinal) {
    outcome = "success";
  } else if (roll < op.successChanceFinal * 1.3) {
    outcome = "partial_success";
  }

  const expRoll = Math.random();
  const exposed = expRoll < op.exposureChanceFinal;
  if (!succeeded(outcome) && exposed) {
    outcome = "exposed_failure";
  } else if (roll > 0.95 && exposed) {
    outcome = "backfire";
  }

  if (succeeded(outcome)) {
    await applyEffects(op, def, outcome, world);
    updateInfiltration(op.attackerEmpireId, op.targetEmpireId, 5, world);
  }

  if (exposed || outcome === "backfire") {
    handleExposure(op, outcome, world);
  }

  op.status = "resolved";
  const network = world.intelligence.networks.get(op.attackerEmpireId);
  if (network) network.usedAgentCapacity = Math.max(0, network.usedAgentCapacity - 1);

  eventBus.emit({
    type: "intelligenceOperationResolve",
    opId: op.id,
    outcome,
    exposed
  });
}

// ... helper functions ...

function succeeded(outcome: OperationOutcome): boolean {
  return outcome === "critical_success" || outcome === "success" || outcome === "partial_success";
}

function calculateSuccessChance(
  def: IntelligenceOperationDefinition, 
  attackerId: string, 
  targetId: string, 
  world: GameWorldState
): number {
  const network = world.intelligence.networks.get(attackerId);
  const targetNetwork = world.intelligence.networks.get(targetId);
  
  const infiltration = network?.infiltrationLevels[targetId] || 0;
  const infiltrationBonus = (infiltration / 200); // Max +0.5 at 100 infiltration

  // Target defensive penalties
  const counterIntelPenalty = (targetNetwork?.counterIntelStrength || 0) / 200; // -0.05 at 10 strength
  const securityPenalty = (targetNetwork?.internalSecurity || 0) / 200;

  let chance = def.baseSuccessChance + infiltrationBonus - counterIntelPenalty - securityPenalty;
  
  return Math.max(0.05, Math.min(0.95, chance));
}

function calculateExposureChance(
  def: IntelligenceOperationDefinition, 
  attackerId: string, 
  targetId: string, 
  world: GameWorldState
): number {
  const targetNetwork = world.intelligence.networks.get(targetId);
  
  const surveillancePenalty = (targetNetwork?.surveillanceStrength || 0) / 100; // +0.1 at 10 strength

  let chance = def.baseExposureChance + surveillancePenalty;
  
  // Risk modifier
  if (def.risk === "extreme") chance += 0.3;
  if (def.risk === "high") chance += 0.15;
  if (def.risk === "low") chance -= 0.05;

  return Math.max(0.02, Math.min(0.90, chance));
}

async function applyEffects(op: ActiveOperation, def: IntelligenceOperationDefinition, outcome: OperationOutcome, world: GameWorldState) {
  const mult = outcome === "critical_success" ? 1.5 : outcome === "partial_success" ? 0.5 : 1.0;

  for (const effect of def.effects) {
     if (effect.type === "instability_increase") {
        const sys = world.movement.systems.get(op.targetId);
        if (sys) sys.instability = Math.min(100, sys.instability + effect.value * mult);
     }
     if (effect.type === "research_boost") {
        const attackerTech = world.tech.get(op.attackerEmpireId);
        if (attackerTech) {
            attackerTech.researchPoints += effect.value * mult;
        }
     }
  }

  // Crisis Triggers (integration with Crisis Manager)
  if (def.crisisTriggers && outcome !== "partial_success") {
    for (const trigger of def.crisisTriggers) {
        try {
            await triggerCrisis(
                'sabotage', 
                op.attackerEmpireId,
                op.targetEmpireId,
                op.targetId,
                trigger.type,
                { title: trigger.title, description: trigger.description, severity: trigger.severity * mult }
            );
        } catch (e) {
            console.error(`[INTEL] Failed to trigger crisis: ${e}`);
        }
    }
  }
}


function handleExposure(op: ActiveOperation, outcome: OperationOutcome, world: GameWorldState) {
    // Diplomatic tension, rep loss, etc.
    world.shared.stability = Math.max(0, world.shared.stability - 0.05);
    // Reduce infiltration level on exposure
    updateInfiltration(op.attackerEmpireId, op.targetEmpireId, -15, world);
}

export function updateInfiltration(attackerId: string, targetId: string, delta: number, world: GameWorldState) {
    const network = world.intelligence.networks.get(attackerId);
    if (!network) return;

    const current = network.infiltrationLevels[targetId] || 0;
    network.infiltrationLevels[targetId] = Math.max(0, Math.min(100, current + delta));
}
