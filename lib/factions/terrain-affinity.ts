// lib/factions/terrain-affinity.ts
//
// One dispatcher for "what does a district cost THIS civilization to enter".
//
// Exists as its own leaf for a specific reason: `legalMoves` is BOTH the
// authoritative check in the worker's MIL_MOVE_FORMATION handler and the source
// of the client's reach overlay, so the override has to be resolved identically
// in a React component and in the tick worker. The component cannot import
// traits-service (which reaches offer-service through buthari.ts), and the two
// resolving the rule separately is how a preview starts showing moves the server
// rejects. This module imports only the faction leaf modules and nothing else.
//
// Civilization ids are single-valued, so this is a switch, not a composition —
// no stacking rule is needed and none should be added.

import type { GameWorldState } from '../game-world-state';
import { civilizationOf, CIV_GABAGOON } from './civ-ids';
import { heatTerrainCostForCiv } from './infernoid';
import { swarmTerrainCost } from './movanite';
import { WADDLE_COST_MULTIPLIER } from './gabagoon';

export type TerrainCostOverride = (terrain: string, base: number) => number;

/**
 * The override for a civilization, or undefined when it is ordinary.
 *
 * Undefined rather than an identity function on purpose: callers hand it
 * straight to `legalMoves`, and undefined makes that function take its original
 * code path byte for byte for everyone else.
 */
export function terrainCostForCiv(civilizationId: string | undefined): TerrainCostOverride | undefined {
    return heatTerrainCostForCiv(civilizationId)   // Infernoid: hot ground is home
        ?? swarmTerrainCost(civilizationId)        // Movanite: dense muscle, cheap going
        ?? waddleTerrainCost(civilizationId);      // Gabagoonian: short legs, everywhere
}

/**
 * The Gabagoonian waddle — a flat surcharge, not a phase-aware one.
 *
 * Every rule resolvable here MUST depend only on the civilization id, because
 * the client resolves it with no world in hand. That is the whole contract of
 * this module: a rule that reads live state would silently diverge between the
 * overlay and the worker's authoritative check.
 */
function waddleTerrainCost(civilizationId: string | undefined): TerrainCostOverride | undefined {
    if (civilizationId !== CIV_GABAGOON) return undefined;
    return (_terrain: string, base: number) => base * WADDLE_COST_MULTIPLIER;
}

/** The same, resolved from a faction id. For the worker, which holds a world. */
export function terrainCostFor(world: GameWorldState, factionId: string | undefined): TerrainCostOverride | undefined {
    if (!factionId) return undefined;
    return terrainCostForCiv(civilizationOf(world, factionId));
}
