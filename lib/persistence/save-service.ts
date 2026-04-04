// lib/persistence/save-service.ts
// Stars of Dominion — Game Save Service
// Serializes GameWorldState to JSON-safe format (Maps → Records) for Appwrite storage.

import type { GameWorldState } from '@/lib/game-world-state';

export interface GameSaveMetadata {
    id: string;
    saveName: string;
    savedAt: string;         // ISO
    factionId: string;
    tickIndex: number;
    nowSeconds: number;
}

export interface GameSaveRecord extends GameSaveMetadata {
    snapshot: string;        // JSON blob
}

// ─── Serialization ────────────────────────────────────────────────────────────

function mapsToRecords(obj: any): any {
    if (obj instanceof Map) {
        const out: Record<string, any> = {};
        obj.forEach((v, k) => { out[k] = mapsToRecords(v); });
        return { __map__: true, data: out };
    }
    if (obj instanceof Set) {
        return { __set__: true, data: [...obj].map(mapsToRecords) };
    }
    if (Array.isArray(obj)) {
        return obj.map(mapsToRecords);
    }
    if (obj && typeof obj === 'object') {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(obj)) {
            out[k] = mapsToRecords(v);
        }
        return out;
    }
    return obj;
}

function recordsToMaps(obj: any): any {
    if (obj && typeof obj === 'object') {
        if (obj.__map__ === true && obj.data) {
            const m = new Map();
            for (const [k, v] of Object.entries(obj.data)) {
                m.set(k, recordsToMaps(v));
            }
            return m;
        }
        if (obj.__set__ === true && Array.isArray(obj.data)) {
            return new Set(obj.data.map(recordsToMaps));
        }
        if (Array.isArray(obj)) {
            return obj.map(recordsToMaps);
        }
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(obj)) {
            out[k] = recordsToMaps(v);
        }
        return out;
    }
    return obj;
}

export function serializeWorld(world: GameWorldState): string {
    return JSON.stringify(mapsToRecords(world));
}

export function deserializeWorld(snapshot: string): GameWorldState {
    return recordsToMaps(JSON.parse(snapshot)) as GameWorldState;
}

// ─── Phase 4: State Sharding Utilities ────────────────────────────────────────

/**
 * Extracts a specific faction's data into a sharded JSON string.
 */
export function extractFactionShard(world: GameWorldState, factionId: string): string {
    const shard = {
        factionId,
        fleets: Array.from(world.movement.fleets.values()).filter(f => f.factionId === factionId),
        economy: world.economy.factions.get(factionId),
        tech: world.tech.get(factionId),
        espionageAgents: Array.from(world.espionage.agents.values()).filter((a: any) => a.ownerFactionId === factionId),
        intelNetworks: Array.from(world.espionage.intelNetworks.values()).filter((n: any) => n.ownerFactionId === factionId)
    };
    return JSON.stringify(mapsToRecords(shard));
}

/**
 * Injects a parsed shard back into the main GameWorldState map structures.
 */
export function injectFactionShard(world: GameWorldState, shardJson: string) {
    if (!shardJson) return;
    const shard = recordsToMaps(JSON.parse(shardJson));
    if (shard.fleets) {
        shard.fleets.forEach((f: any) => world.movement.fleets.set(f.id, f));
    }
    if (shard.economy) world.economy.factions.set(shard.factionId, shard.economy);
    if (shard.tech) world.tech.set(shard.factionId, shard.tech);
    if (shard.espionageAgents) {
        shard.espionageAgents.forEach((a: any) => world.espionage.agents.set(a.id, a));
    }
    if (shard.intelNetworks) {
        shard.intelNetworks.forEach((n: any) => world.espionage.intelNetworks.set(n.id, n));
    }
}

/**
 * Returns a deep clone of the world state with all sharded data removed.
 * This prevents the main 'default-session' document from breaking size limits.
 */
export function cleanWorldForSave(world: GameWorldState): GameWorldState {
    const cloned = recordsToMaps(mapsToRecords(world)) as GameWorldState;
    cloned.movement.fleets.clear();
    cloned.economy.factions.clear();
    cloned.tech.clear();
    cloned.espionage.agents.clear();
    cloned.espionage.intelNetworks.clear();
    return cloned;
}
