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
