// lib/tech/flags.ts
// Stars of Dominion — Technology unlock flags.
//
// Techs declare capability gates as `unlockFlags: ['enable_x']`. Until now no
// system read them: 34 flags were authored across the five trees and every one
// of them was dead string data. This is the single reader.
//
// Flags are preferred over hardcoded tech ids at call sites, because a flag can
// be granted by more than one tech (a research path, a diffusion grant, an
// emergent unlock) without every consumer learning the new id.

import type { PlayerTechState } from './types';
import { TechEffectType } from './types';
import { registry } from './engine';
// Flags are resolved through the registry, so the trees must be registered
// before any lookup. Importing the catalog here means a consumer can never
// silently see an empty flag set just because its entry point (a server action,
// a test harness) never happened to import techData itself.
import './techData';

/** Anything holding a per-faction tech map. Kept structural so callers in the
 *  worker (which types its world as `any`) and in services (which import the
 *  real GameWorldState) can both pass their world unchanged. */
interface TechBearingWorld {
    tech?: Map<string, PlayerTechState> | { get?: (id: string) => PlayerTechState | undefined };
}

/**
 * Cache keyed on the identity of the `unlockedTechIds` array itself.
 *
 * A WeakMap on the array handles world reloads for free — the worker
 * deserializes a fresh world with fresh arrays, so a stale entry is simply
 * unreachable and collected. Storing the length alongside catches the in-place
 * `push` that applyUnlock does, so no explicit invalidation call is needed.
 */
const flagCache = new WeakMap<string[], { length: number; flags: Set<string> }>();

/** Resolve the flag set for a list of unlocked tech ids. */
function computeFlags(ids: string[]): Set<string> {
    const flags = new Set<string>();
    for (const id of ids) {
        const tech = registry.get(id);
        if (!tech?.unlockFlags) continue;
        for (const f of tech.unlockFlags) flags.add(f);
    }
    return flags;
}

/**
 * Every flag granted by a set of unlocked tech ids.
 * Accepts the raw id collection so callers that already hold one (and never
 * see the world) can use the same flag vocabulary.
 */
export function flagsForTechIds(ids: Iterable<string> | undefined | null): Set<string> {
    if (!ids) return new Set();
    if (Array.isArray(ids)) {
        const hit = flagCache.get(ids);
        if (hit && hit.length === ids.length) return hit.flags;
        const flags = computeFlags(ids);
        flagCache.set(ids, { length: ids.length, flags });
        return flags;
    }
    return computeFlags([...ids]);
}

/** Does this collection of unlocked tech ids grant `flag`? */
export function techIdsHaveFlag(ids: Iterable<string> | undefined | null, flag: string): boolean {
    return flagsForTechIds(ids).has(flag);
}

/** Every flag a faction currently holds. */
export function getTechFlags(world: TechBearingWorld | undefined | null, factionId: string): Set<string> {
    const state = world?.tech?.get?.(factionId);
    return flagsForTechIds(state?.unlockedTechIds);
}

/**
 * Has `factionId` researched anything granting `flag`?
 *
 * Derived on read and never persisted — a flag set written into the JSON-TEXT
 * columns would rot the moment a tech's `unlockFlags` were edited.
 */
export function hasTechFlag(world: TechBearingWorld | undefined | null, factionId: string, flag: string): boolean {
    return getTechFlags(world, factionId).has(flag);
}

// ─── UNLOCK_ACTION capabilities ──────────────────────────────────────────────
//
// The second capability vocabulary in the tech data: an UNLOCK_ACTION effect
// names a capability in its `modifierKey` ('deploy_envoy',
// 'sabotage_infrastructure', …). The effect type shipped from the start but was
// pushed onto activeEffects and read by nobody. Gates read the effects directly
// rather than mirroring each one into an unlockFlag, so the tech data stays the
// single source of truth.

/** Every UNLOCK_ACTION capability granted by a list of unlocked tech ids. */
export function actionsForTechIds(ids: Iterable<string> | undefined | null): Set<string> {
    const actions = new Set<string>();
    if (!ids) return actions;
    for (const id of ids) {
        const tech = registry.get(id);
        for (const effect of tech?.effects ?? []) {
            if (effect.type === TechEffectType.UNLOCK_ACTION && effect.modifierKey) {
                actions.add(effect.modifierKey);
            }
        }
    }
    return actions;
}

/** Has `factionId` researched a tech whose UNLOCK_ACTION grants `capability`? */
export function hasUnlockedAction(
    world: TechBearingWorld | undefined | null,
    factionId: string,
    capability: string,
): boolean {
    const state = world?.tech?.get?.(factionId);
    return actionsForTechIds(state?.unlockedTechIds).has(capability);
}
