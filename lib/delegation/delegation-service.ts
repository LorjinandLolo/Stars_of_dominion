// lib/delegation/delegation-service.ts
// Stars of Dominion — reading and setting what a player has delegated.
//
// One rule, stated once: a faction with no record has delegated everything.
// That is deliberate — the neglect-safe default has to hold for a player who
// never opens the Advisors card, and for every faction claimed before this
// existed. Turning a system off is an explicit act and is what gets stored.
//
// No world mutation happens anywhere but here and the order handler.

import type { GameWorldState } from '@/lib/game-world-state';
import {
    DELEGATED_SYSTEMS,
    defaultDelegation,
    type DelegatedSystem,
    type DelegationState,
} from './delegation-types';

type WorldLike = Pick<GameWorldState, 'delegation'> & Record<string, any>;

/** The record as stored, or the all-delegated default. Never null. */
export function delegationFor(world: WorldLike, factionId: string): DelegationState {
    const stored = world?.delegation?.get?.(factionId);
    if (!stored) return defaultDelegation();
    // Merge over the default so a record written before a system existed still
    // answers for it — a missing key means "not taken back", i.e. delegated.
    return { ...defaultDelegation(), ...stored };
}

/** Is this system currently run by the advisors? */
export function isDelegated(world: WorldLike, factionId: string, system: DelegatedSystem): boolean {
    return delegationFor(world, factionId)[system] === true;
}

/**
 * Set one system. Returns the new record.
 * `GOV_SET_DELEGATION` is the only caller in the worker.
 */
export function setDelegation(
    world: WorldLike,
    factionId: string,
    system: DelegatedSystem,
    enabled: boolean,
): DelegationState {
    if (!world.delegation) world.delegation = new Map<string, DelegationState>();
    const next = { ...delegationFor(world, factionId), [system]: enabled };
    world.delegation.set(factionId, next);
    return next;
}

/** Guard for an untrusted payload string. */
export function isDelegatedSystem(value: unknown): value is DelegatedSystem {
    return typeof value === 'string' && (DELEGATED_SYSTEMS as string[]).includes(value);
}

export { DELEGATED_SYSTEMS, defaultDelegation };
export type { DelegatedSystem, DelegationState };
