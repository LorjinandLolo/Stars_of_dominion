// lib/tech/order-gates.ts
// Stars of Dominion — technology gates on the player order queue.
//
// This is the single consumer of the tech data's capability vocabulary at the
// order layer. An order listed here is refused unless the faction has the
// research behind it.
//
// Two gate sources, because the trees use two mechanisms:
//   `flag`       — an unlockFlags string (see flags.ts)
//   `capability` — an UNLOCK_ACTION effect's modifierKey
//
// Only player orders reach executeOrder; AI factions call the services directly
// and are never gated here.

import { hasTechFlag, hasUnlockedAction } from './flags';
import type { PlayerTechState } from './types';

interface TechBearingWorld {
    tech?: Map<string, PlayerTechState> | { get?: (id: string) => PlayerTechState | undefined };
}

export interface OrderGate {
    /** Satisfied by an unlockFlags string. */
    flag?: string;
    /** Satisfied by an UNLOCK_ACTION effect naming this capability. */
    capability?: string;
    /** Shown to the player on refusal — keep in step with the granting tech. */
    techName: string;
}

export const ORDER_TECH_GATES: Record<string, OrderGate> = {
    // Flag-based. mil_t1_7 "Orbital Bombardment I" states it unlocks bombardment.
    MIL_BOMBARD_PLANET: { flag: 'ENABLE_ORBITAL_BOMBARDMENT', techName: 'Orbital Bombardment I' },

    // Capability-based, from UNLOCK_ACTION effects in the trees.
    DIP_SEND_ENVOY: { capability: 'deploy_envoy', techName: 'Envoy Deployment' },
    ESP_RECRUIT_AGENT: { capability: 'deploy_spy', techName: 'Spy Deployment Protocols' },
    ESP_ASSIGN_AGENT: { capability: 'deploy_spy', techName: 'Spy Deployment Protocols' },
    ESP_SABOTAGE_FACILITY: { capability: 'sabotage_infrastructure', techName: 'Sabotage Cells' },
};

/**
 * Capabilities declared by UNLOCK_ACTION effects that no order type implements
 * yet. Listed explicitly so validation can distinguish "designed but not built"
 * from "someone forgot to add a gate" — the latter is a bug, this is a backlog.
 */
export const UNIMPLEMENTED_CAPABILITIES: Record<string, string> = {
    create_fake_fleet: 'esp_t2_dec_1 False Fleet Signatures — no order type creates decoy fleets.',
    flip_planet: 'esp_t3_9 Loyalty Subversion — no order type transfers planetary ownership by subversion.',
};

export interface GateResult {
    allowed: boolean;
    reason?: string;
}

/** Check an order against the gate table. Ungated orders always pass. */
export function checkOrderTechGate(
    world: TechBearingWorld | undefined | null,
    factionId: string,
    actionId: string,
): GateResult {
    const gate = ORDER_TECH_GATES[actionId];
    if (!gate) return { allowed: true };

    const satisfied = gate.flag
        ? hasTechFlag(world, factionId, gate.flag)
        : gate.capability
            ? hasUnlockedAction(world, factionId, gate.capability)
            : true;

    return satisfied
        ? { allowed: true }
        : { allowed: false, reason: `Requires the "${gate.techName}" technology.` };
}
