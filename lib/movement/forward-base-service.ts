// lib/movement/forward-base-service.ts
// Temporary forward operating bases: a faction plants a staging base at a system to
// marshal fleets and launch invasions from, then it expires (or is dismantled).

import { GameWorldState } from '../game-world-state';
import { ForwardBase } from './types';

export const FORWARD_BASE_DEFAULT_DURATION_SECONDS = 3 * 24 * 3600; // 3 days
export const FORWARD_BASE_COST = { credits: 800, metals: 400 };

export interface EstablishResult {
    success: boolean;
    error?: string;
    base?: ForwardBase;
}

/** Establish a forward base for a faction at a system (one per faction per system). */
export function establishForwardBase(
    world: GameWorldState,
    factionId: string,
    systemId: string,
    opts?: { durationSeconds?: number; name?: string }
): EstablishResult {
    if (!world.movement.forwardBases) world.movement.forwardBases = new Map();
    const sys = world.movement.systems.get(systemId);
    if (!sys) return { success: false, error: 'System not found' };

    for (const b of world.movement.forwardBases.values()) {
        if (b.factionId === factionId && b.systemId === systemId) {
            return { success: false, error: 'A forward base already exists here' };
        }
    }

    const now = world.nowSeconds;
    const duration = opts?.durationSeconds ?? FORWARD_BASE_DEFAULT_DURATION_SECONDS;
    const id = `fbase_${factionId}_${systemId}_${now}`;
    const base: ForwardBase = {
        id,
        factionId,
        systemId,
        name: opts?.name || `${sys.name || systemId} Staging Base`,
        establishedAtSeconds: now,
        expiresAtSeconds: now + duration,
        supply: 1,
        stagedFleetIds: [],
    };
    world.movement.forwardBases.set(id, base);
    return { success: true, base };
}

/** Reinforce an existing base — resets its supply and extends its lifetime. */
export function reinforceForwardBase(
    world: GameWorldState,
    baseId: string,
    extraSeconds = FORWARD_BASE_DEFAULT_DURATION_SECONDS
): boolean {
    const base = world.movement.forwardBases?.get(baseId);
    if (!base) return false;
    base.supply = 1;
    base.expiresAtSeconds = Math.max(base.expiresAtSeconds, world.nowSeconds + extraSeconds);
    return true;
}

export function dismantleForwardBase(world: GameWorldState, baseId: string): boolean {
    return world.movement.forwardBases?.delete(baseId) ?? false;
}

/** List a faction's active bases. */
export function getForwardBasesForFaction(world: GameWorldState, factionId: string): ForwardBase[] {
    if (!world.movement.forwardBases) return [];
    return Array.from(world.movement.forwardBases.values()).filter((b) => b.factionId === factionId);
}

/** Per-tick maintenance: decay supply toward expiry and remove expired bases. */
export function tickForwardBases(world: GameWorldState, _deltaSeconds: number): void {
    if (!world.movement.forwardBases) { world.movement.forwardBases = new Map(); return; }
    const now = world.nowSeconds;
    const expired: string[] = [];
    for (const b of world.movement.forwardBases.values()) {
        if (now >= b.expiresAtSeconds) { expired.push(b.id); continue; }
        const lifespan = Math.max(1, b.expiresAtSeconds - b.establishedAtSeconds);
        b.supply = Math.max(0, Math.min(1, (b.expiresAtSeconds - now) / lifespan));
        // Keep the staged-fleet list honest — drop fleets that no longer exist.
        if (b.stagedFleetIds.length) {
            b.stagedFleetIds = b.stagedFleetIds.filter((fid) => world.movement.fleets.has(fid));
        }
    }
    for (const id of expired) world.movement.forwardBases.delete(id);
}
