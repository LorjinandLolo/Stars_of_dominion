// lib/persistence/save-service.ts
// Stars of Dominion — Game Save Service
// Serializes GameWorldState to JSON-safe format (Maps → Records) for Appwrite storage.

import type { GameWorldState } from '@/lib/game-world-state';
import { GroundUnitType, UnitComposition, PlanetaryDefenseState, RecruitmentJob } from '@/lib/combat/siege/siege-types';

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

export function mapsToRecords(obj: any): any {
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

export function recordsToMaps(obj: any): any {
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
    const world = recordsToMaps(JSON.parse(snapshot)) as GameWorldState;
    normalizeEspionageState(world);
    return world;
}

/**
 * Ensure the espionage sub-state has every collection the consolidated system
 * expects, and strip structures from pre-consolidation snapshots. Runs in
 * deserializeWorld; the client calls it separately after its web-worker
 * deserialize path (which bypasses this module).
 */
export function normalizeEspionageState(world: GameWorldState): void {
    const w = world as any;
    if (!w.espionage) w.espionage = {};
    const esp = w.espionage;
    if (!(esp.operations instanceof Map)) esp.operations = new Map();
    if (!(esp.factionIntel instanceof Map)) esp.factionIntel = new Map();
    if (!(esp.reports instanceof Map)) esp.reports = new Map();
    if (!(esp.boardOpportunities instanceof Map)) esp.boardOpportunities = new Map();
    if (!Array.isArray(esp.attributionRecords)) esp.attributionRecords = [];
    if (!(esp.shadowEconomyNodes instanceof Map)) esp.shadowEconomyNodes = new Map();
    if (!(esp.regionEscalation instanceof Map)) esp.regionEscalation = new Map();
    if (!(esp.agents instanceof Map)) esp.agents = new Map();
    if (!(esp.intelNetworks instanceof Map)) esp.intelNetworks = new Map();
    // Pre-consolidation leftovers: never-written counterIntel map and the
    // parallel V2 intelligence system.
    delete esp.counterIntel;
    delete w.intelligence;

    // Diplomacy Phase 1/2: offers, cooldowns, gambits, leverage — defaults for
    // snapshots written before world.diplomacy (or its later fields) existed.
    if (!w.diplomacy) w.diplomacy = {};
    if (!(w.diplomacy.offers instanceof Map)) w.diplomacy.offers = new Map();
    if (!(w.diplomacy.cooldowns instanceof Map)) w.diplomacy.cooldowns = new Map();
    if (!(w.diplomacy.gambits instanceof Map)) w.diplomacy.gambits = new Map();
    if (!(w.diplomacy.leverage instanceof Map)) w.diplomacy.leverage = new Map();
    if (!(w.diplomacy.mandates instanceof Map)) w.diplomacy.mandates = new Map();
    if (!(w.diplomacy.sanctions instanceof Map)) w.diplomacy.sanctions = new Map();

    // Phase 14: corporate state — default for snapshots written before it
    // moved into GameWorldState.
    if (!w.corporate) w.corporate = {};
    const corp = w.corporate;
    if (!(corp.companies instanceof Map)) corp.companies = new Map();
    if (!(corp.factionStates instanceof Map)) corp.factionStates = new Map();
    if (!Array.isArray(corp.tollLog)) corp.tollLog = [];
    if (!Array.isArray(corp.eventLog)) corp.eventLog = [];
    if (typeof corp.tick !== 'number') corp.tick = 0;
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
        intelNetworks: Array.from(world.espionage.intelNetworks.values()).filter((n: any) => n.ownerFactionId === factionId),
        espionageFactionIntel: world.espionage.factionIntel.get(factionId) ?? null,
        espionageOperations: Array.from(world.espionage.operations.values()).filter(op => op.actorFactionId === factionId),
        espionageReports: Array.from(world.espionage.reports.values()).filter(r => r.ownerFactionId === factionId),
        espionageBoard: Array.from(world.espionage.boardOpportunities.values()).filter(o => o.ownerFactionId === factionId),
        recruitmentJobs: (world.combat?.recruitmentJobs || []).filter(j => j.factionId === factionId)
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
    if (shard.espionageFactionIntel) {
        world.espionage.factionIntel.set(shard.factionId, shard.espionageFactionIntel);
    }
    if (shard.espionageOperations) {
        shard.espionageOperations.forEach((op: any) => world.espionage.operations.set(op.id, op));
    }
    if (shard.espionageReports) {
        shard.espionageReports.forEach((r: any) => world.espionage.reports.set(r.id, r));
    }
    if (shard.espionageBoard) {
        shard.espionageBoard.forEach((o: any) => world.espionage.boardOpportunities.set(o.id, o));
    }
    if (shard.recruitmentJobs) {
        if (!world.combat) world.combat = { recruitmentJobs: [] };
        // Merge - unique by ID
        const existingIds = new Set(world.combat.recruitmentJobs.map(j => j.id));
        shard.recruitmentJobs.forEach((j: any) => {
            if (!existingIds.has(j.id)) world.combat.recruitmentJobs.push(j);
        });
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
    cloned.espionage.factionIntel.clear();
    cloned.espionage.operations.clear();
    cloned.espionage.reports.clear();
    cloned.espionage.boardOpportunities.clear();
    if (cloned.combat) cloned.combat.recruitmentJobs = [];
    return cloned;
}
