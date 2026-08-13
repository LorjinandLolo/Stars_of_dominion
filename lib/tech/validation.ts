// lib/tech/validation.ts
// Stars of Dominion — consistency checks over the technology data.
//
// The trees accumulated a specific failure mode: effects and gate ids that
// referenced things which did not exist. 'dip_sha_1' gated shadow-economy ops
// and was in no tree; 'mil_plt_1' gated two buildings and was in no tree;
// 'listening_post' named a building that was never authored. Each one silently
// disabled real content for the entire life of the project.
//
// These checks turn that class of bug into a test failure.

import { registry } from './engine';
import { TechEffectType } from './types';
import { ORDER_TECH_GATES, UNIMPLEMENTED_CAPABILITIES } from './order-gates';
import { EMERGENT_TRIGGERS, unknownTriggerTechIds } from './emergent-catalog';
import { BUILDINGS } from '../../data/buildings';
import { ACTION_DEFINITIONS } from '../actions/registry';
import './techData'; // ensure the trees are registered before walking them

export interface TechDataIssue {
    kind:
        | 'unlock_action_ungated'      // UNLOCK_ACTION capability with no order gate and not declared unimplemented
        | 'gate_unknown_order'         // gate table keyed on an action id that does not exist
        | 'gate_unknown_capability'    // gate references a capability no tech grants
        | 'gate_unknown_flag'          // gate references a flag no tech grants
        | 'unlock_building_missing'    // UNLOCK_BUILDING names a building that does not exist
        | 'unlock_building_ungated'    // named building does not declare the matching techRequired
        | 'building_tech_missing'      // a building's techRequired names a tech that does not exist
        | 'emergent_tech_missing'      // a trigger reveals a tech that does not exist
        | 'emergent_duplicate_trigger'; // two triggers share an id
    detail: string;
}

/** Capabilities named by UNLOCK_ACTION effects, mapped to the techs granting them. */
function capabilityOwners(): Map<string, string[]> {
    const owners = new Map<string, string[]>();
    for (const tech of registry.getAll()) {
        for (const effect of tech.effects ?? []) {
            if (effect.type !== TechEffectType.UNLOCK_ACTION || !effect.modifierKey) continue;
            const list = owners.get(effect.modifierKey) ?? [];
            list.push(tech.id);
            owners.set(effect.modifierKey, list);
        }
    }
    return owners;
}

/** Every flag granted anywhere in the trees. */
function allDeclaredFlags(): Set<string> {
    const flags = new Set<string>();
    for (const tech of registry.getAll()) {
        for (const f of tech.unlockFlags ?? []) flags.add(f);
    }
    return flags;
}

export function validateTechUnlocks(): TechDataIssue[] {
    const issues: TechDataIssue[] = [];
    const owners = capabilityOwners();
    const flags = allDeclaredFlags();
    const buildingIds = new Set(BUILDINGS.map(b => b.id));
    const techIds = new Set(registry.getAll().map(t => t.id));
    const actionIds = new Set(Object.keys(ACTION_DEFINITIONS));

    // Every gated capability must be reachable, and every gate must name a real order.
    const gatedCapabilities = new Set<string>();
    for (const [actionId, gate] of Object.entries(ORDER_TECH_GATES)) {
        if (!actionIds.has(actionId)) {
            issues.push({ kind: 'gate_unknown_order', detail: `${actionId} is gated but is not in ACTION_DEFINITIONS.` });
        }
        if (gate.capability) {
            gatedCapabilities.add(gate.capability);
            if (!owners.has(gate.capability)) {
                issues.push({
                    kind: 'gate_unknown_capability',
                    detail: `${actionId} gates on capability '${gate.capability}', which no UNLOCK_ACTION effect grants.`,
                });
            }
        }
        if (gate.flag && !flags.has(gate.flag)) {
            issues.push({
                kind: 'gate_unknown_flag',
                detail: `${actionId} gates on flag '${gate.flag}', which no tech grants.`,
            });
        }
    }

    // Conversely, a declared capability must gate something or be an admitted gap.
    for (const [capability, techs] of owners) {
        if (gatedCapabilities.has(capability)) continue;
        if (capability in UNIMPLEMENTED_CAPABILITIES) continue;
        issues.push({
            kind: 'unlock_action_ungated',
            detail: `UNLOCK_ACTION '${capability}' (${techs.join(', ')}) gates no order and is not listed in UNIMPLEMENTED_CAPABILITIES.`,
        });
    }

    // UNLOCK_BUILDING is UI metadata; data/buildings.ts is authoritative.
    for (const tech of registry.getAll()) {
        for (const effect of tech.effects ?? []) {
            if (effect.type !== TechEffectType.UNLOCK_BUILDING || !effect.modifierKey) continue;
            const buildingId = effect.modifierKey;
            if (!buildingIds.has(buildingId)) {
                issues.push({
                    kind: 'unlock_building_missing',
                    detail: `${tech.id} unlocks building '${buildingId}', which is not in data/buildings.ts.`,
                });
                continue;
            }
            const building = BUILDINGS.find(b => b.id === buildingId)!;
            if (building.techRequired !== tech.id) {
                issues.push({
                    kind: 'unlock_building_ungated',
                    detail: `${tech.id} unlocks '${buildingId}', but that building declares techRequired='${building.techRequired ?? 'none'}'.`,
                });
            }
        }
    }

    // Any building gated on a tech id that does not exist is unbuildable forever.
    for (const building of BUILDINGS) {
        if (building.techRequired && !techIds.has(building.techRequired)) {
            issues.push({
                kind: 'building_tech_missing',
                detail: `Building '${building.id}' requires tech '${building.techRequired}', which exists in no tree — it can never be built.`,
            });
        }
    }

    // A trigger pointing at a missing tech silently never fires.
    for (const dangling of unknownTriggerTechIds()) {
        issues.push({
            kind: 'emergent_tech_missing',
            detail: `Emergent trigger ${dangling} reveals a tech that exists in no tree.`,
        });
    }

    // firedTriggerIds is keyed on trigger id, so duplicates would collide.
    const seenTriggerIds = new Set<string>();
    for (const trigger of EMERGENT_TRIGGERS) {
        if (seenTriggerIds.has(trigger.id)) {
            issues.push({
                kind: 'emergent_duplicate_trigger',
                detail: `Trigger id '${trigger.id}' is defined more than once.`,
            });
        }
        seenTriggerIds.add(trigger.id);
    }

    return issues;
}
