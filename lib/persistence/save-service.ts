// lib/persistence/save-service.ts
// Stars of Dominion — Game Save Service
// Serializes GameWorldState to JSON-safe format (Maps → Records) for Appwrite storage.

import type { GameWorldState } from '@/lib/game-world-state';
import { GroundUnitType, UnitComposition, PlanetaryDefenseState, RecruitmentJob } from '@/lib/combat/siege/siege-types';
import { getEmpireStorageReport } from '@/lib/logistics/storage-service';
import { getBlockadeReport } from '@/lib/logistics/blockade-service';
import { computeOrbitalRatings } from '@/lib/orbital/orbital-service';
import { isRetooling } from '@/lib/specialization/specialization-effects';
import { buildPirateDashboard, buildPirateView } from '@/lib/piracy/pirate-view';
import { applyHomeworldArchetypes } from '@/lib/galaxy/faction-capitals';

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
    // Planet tags persist, and the authored homeworld archetype rides on one.
    // A code-only change would therefore leave every existing save generating
    // the old all-continental boards — Pyrothar a temperate forest world — with
    // nothing to indicate why. Idempotent and correcting, so re-authoring an
    // archetype lands on the next load rather than needing a world wipe.
    applyHomeworldArchetypes(world);
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

    // Pirate system: organizations. Snapshots written before the entity existed
    // have no aggregate at all; their raiders are adopted into fresh bands by
    // adoptOrphanRaiders on the first tick after deploy.
    if (!w.piracy) w.piracy = {};
    if (!(w.piracy.organizations instanceof Map)) w.piracy.organizations = new Map();
    if (!(w.piracy.bases instanceof Map)) w.piracy.bases = new Map();
    if (!(w.piracy.hostages instanceof Map)) w.piracy.hostages = new Map();
    if (!(w.piracy.protectionContracts instanceof Map)) w.piracy.protectionContracts = new Map();
    if (!(w.piracy.tributes instanceof Map)) w.piracy.tributes = new Map();
    if (!(w.piracy.blackMarkets instanceof Map)) w.piracy.blackMarkets = new Map();
    if (!(w.piracy.smugglingRuns instanceof Map)) w.piracy.smugglingRuns = new Map();
    if (!(w.piracy.sponsorships instanceof Map)) w.piracy.sponsorships = new Map();
    if (!(w.piracy.successions instanceof Map)) w.piracy.successions = new Map();
    if (!(w.piracy.captures instanceof Map)) w.piracy.captures = new Map();
    if (!(w.piracy.bounties instanceof Map)) w.piracy.bounties = new Map();
    if (!(w.piracy.opportunityIndex instanceof Map)) w.piracy.opportunityIndex = new Map();
    if (!Array.isArray(w.piracy.emergenceLog)) w.piracy.emergenceLog = [];

    // Diplomacy Phase 1/2: offers, cooldowns, gambits, leverage — defaults for
    // snapshots written before world.diplomacy (or its later fields) existed.
    if (!w.diplomacy) w.diplomacy = {};
    if (!(w.diplomacy.offers instanceof Map)) w.diplomacy.offers = new Map();
    if (!(w.diplomacy.cooldowns instanceof Map)) w.diplomacy.cooldowns = new Map();
    if (!(w.diplomacy.gambits instanceof Map)) w.diplomacy.gambits = new Map();
    if (!(w.diplomacy.leverage instanceof Map)) w.diplomacy.leverage = new Map();
    if (!(w.diplomacy.mandates instanceof Map)) w.diplomacy.mandates = new Map();
    if (!(w.diplomacy.sanctions instanceof Map)) w.diplomacy.sanctions = new Map();
    if (!(w.diplomacy.promises instanceof Map)) w.diplomacy.promises = new Map();
    if (!(w.diplomacy.interventions instanceof Map)) w.diplomacy.interventions = new Map();

    // Phase 14: corporate state — default for snapshots written before it
    // moved into GameWorldState.
    if (!w.corporate) w.corporate = {};
    const corp = w.corporate;
    if (!(corp.companies instanceof Map)) corp.companies = new Map();
    if (!(corp.factionStates instanceof Map)) corp.factionStates = new Map();
    if (!Array.isArray(corp.tollLog)) corp.tollLog = [];
    if (!Array.isArray(corp.eventLog)) corp.eventLog = [];
    if (typeof corp.tick !== 'number') corp.tick = 0;
    // Charter Corporation layer: the political ledgers a company generates.
    // Per-company fields are backfilled by ensureCorporateState at world load.
    if (!(corp.demands instanceof Map)) corp.demands = new Map();
    if (!(corp.crises instanceof Map)) corp.crises = new Map();
    if (!(corp.megaprojects instanceof Map)) corp.megaprojects = new Map();
    if (!(corp.hostPolicies instanceof Map)) corp.hostPolicies = new Map();
    if (!(corp.rivalries instanceof Map)) corp.rivalries = new Map();

    // Government & Leadership Phase 0: per-faction political state. Snapshots
    // written before it existed get an empty map; ensureGovernments fills it.
    if (!(w.government instanceof Map)) w.government = new Map();

    // Phase 6.1: per-planet cohesion. ensureCohesion reseeds it from live state.
    if (!(w.planetCohesion instanceof Map)) w.planetCohesion = new Map();

    // Per-faction bespoke mechanics. Plain records inside a Map, so the generic
    // Map<->object pass carries the contents; ensureFactionTraits fills them in.
    // Deliberately NOT cleared by cleanWorldForSave: a galaxy-wide sacred
    // ceasefire that rivals cannot see is not a mechanic.
    if (!(w.factionTraits instanceof Map)) w.factionTraits = new Map();

    // Phase 6.2: open defiance crises.
    if (!(w.defianceEvents instanceof Map)) w.defianceEvents = new Map();

    // Phase 6.3: regional independence crises.
    if (!(w.secessionCrises instanceof Map)) w.secessionCrises = new Map();

    // Seasons & Titles phase 0: the title registry. Snapshots written before it
    // existed have no aggregate; their world.milestones entries are drained into
    // the ledger by migrateLegacyMilestones on the first tick after deploy.
    if (!w.titles) w.titles = {};
    const titles = w.titles;
    if (!(titles.currentHolders instanceof Map)) titles.currentHolders = new Map();
    if (!Array.isArray(titles.ledger)) titles.ledger = [];
    if (!(titles.challenges instanceof Map)) titles.challenges = new Map();
    if (!(titles.defeatStatuses instanceof Map)) titles.defeatStatuses = new Map();
    if (!(w.milestones instanceof Map)) w.milestones = new Map();
}

// ─── Phase 4: State Sharding Utilities ────────────────────────────────────────

/**
 * Empire-wide planet-layer rollup: storage pressure, haulage, blockades and the
 * orbital layer. Cheap to compute here and saves the client recomputing it on
 * every poll.
 */
function buildPlanetaryLogisticsSummary(world: GameWorldState, factionId: string) {
    const storage = getEmpireStorageReport(world, factionId);
    const blockade = getBlockadeReport(world, factionId);

    let congestedPlanetIds: string[] = [];
    let totalHaulageCapacity = 0;
    let totalHaulageDemand = 0;
    for (const planet of world.economy.planets.values()) {
        if (planet.factionId !== factionId) continue;
        const logistics = planet.logistics;
        if (!logistics) continue;
        totalHaulageCapacity += logistics.capacity;
        totalHaulageDemand += logistics.demand;
        if (logistics.congested) congestedPlanetIds.push(planet.planetId);
    }

    const orbital: Array<{
        planetId: string;
        activeStructures: number;
        defensePower: number;
        shipyardTier: number;
        orbitControlLost: boolean;
    }> = [];
    const specializations: Array<{ planetId: string; specializationId: string; retooling: boolean }> = [];

    for (const planet of world.construction.planets.values()) {
        if (planet.ownerId !== factionId) continue;
        if (planet.orbital?.slots?.length) {
            const ratings = computeOrbitalRatings(planet, world.nowSeconds);
            orbital.push({
                planetId: planet.id,
                activeStructures: ratings.activeStructures,
                defensePower: ratings.defensePower,
                shipyardTier: ratings.shipyardTier,
                orbitControlLost: Boolean(planet.orbital.orbitControlLost),
            });
        }
        if (planet.specializationState) {
            specializations.push({
                planetId: planet.id,
                specializationId: planet.specializationState.id,
                retooling: isRetooling(planet.specializationState, world.nowSeconds),
            });
        }
    }

    return {
        storage,
        blockade,
        haulage: {
            totalCapacity: totalHaulageCapacity,
            totalDemand: totalHaulageDemand,
            congestedPlanetIds,
        },
        orbital,
        specializations,
    };
}

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
        // Reports are stored WHOLE, `accurate` included. That flag is the hidden
        // truth of the espionage system and must never reach the owner — but it
        // is scrubbed at serve time (lib/persistence/shard-privacy.ts), not here.
        // Stripping it during extraction also stripped it from the only place it
        // is persisted: cleanWorldForSave clears espionage.reports from the
        // shared snapshot, so the shard is the sole copy, and every worker
        // restart reloaded a world where no report remembered whether it was
        // true. Privacy belongs on the wire; the save must stay complete.
        espionageReports: Array.from(world.espionage.reports.values())
            .filter(r => r.ownerFactionId === factionId),
        espionageBoard: Array.from(world.espionage.boardOpportunities.values()).filter(o => o.ownerFactionId === factionId),
        recruitmentJobs: (world.combat?.recruitmentJobs || []).filter(j => j.factionId === factionId),
        // Planet-layer rollups. The per-planet detail already rides along in the
        // snapshot; these are the empire-wide aggregates the UI would otherwise
        // have to recompute on every poll.
        planetaryLogistics: buildPlanetaryLogisticsSummary(world, factionId),
        // Compact fog map: systemId → revealStage for every system this faction
        // has at least pinged, plus the systems its fleets are parked in. This
        // is what lets /api/game/sync fog RIVAL fleets server-side without
        // deserializing the whole world per poll (the shard-privacy KNOWN GAP):
        // the route reads the CALLER's shard for this map, then filters every
        // rival shard's fleet list against it.
        visibility: (() => {
            const vis = world.movement.factionVisibility.get(factionId);
            if (!vis) return {};
            const out: Record<string, string> = {};
            for (const [sysId, entry] of Object.entries(vis)) {
                const stage = (entry as any)?.revealStage;
                if (stage && stage !== 'unknown') out[sysId] = stage;
            }
            return out;
        })(),
        // NOTE: pirate state deliberately does NOT ride here, and should not be
        // added back. A shard is now owner-scoped ON THE WIRE — /api/game/sync
        // authenticates the caller and serves rivals only the public projection
        // (lib/persistence/shard-privacy.ts) — but the DB row itself is still a
        // shared table, and the pirate aggregate has its own authoritative row
        // with its own authenticated read endpoint (app/api/game/piracy).
        // See docs/pirate-system/systems.md §8.
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
/**
 * Serialize the pirate aggregate on its own, for a row the sync API never
 * serves.
 *
 * The shared session snapshot is BOTH what clients poll and what the worker
 * reloads on restart, so the privacy scrub in cleanWorldForSave cannot be the
 * only copy — scrubbing it there and nowhere else silently destroyed every
 * band's wings, leader, treasury and bases on each save. Authoritative pirate
 * state lives here; the session snapshot keeps only the public projection.
 */
export function serializePiracyState(world: GameWorldState): string {
    return JSON.stringify(mapsToRecords(world.piracy));
}

/** Restore the authoritative pirate aggregate saved by serializePiracyState. */
export function applyPiracySnapshot(world: GameWorldState, snapshot: string | null | undefined): void {
    if (!snapshot) return;
    try {
        world.piracy = recordsToMaps(JSON.parse(snapshot)) as GameWorldState['piracy'];
    } catch {
        // A corrupt pirate blob must not take the whole world down with it;
        // normalizeEspionageState rebuilds empty collections below.
    }
    normalizeEspionageState(world);
}

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

    // Pirate state never rides in the shared snapshot. Every mechanic that
    // matters here is a mechanic about asymmetric information — hidden bases,
    // covert sponsorships, secret contracts, falsified intel — and shipping the
    // raw aggregate to every client collapses all of them at once. Each faction
    // gets its own filtered view in its shard (see extractFactionShard).
    //
    // This is a CLIENT-FACING projection only. The authoritative copy is written
    // separately by serializePiracyState and restored by applyPiracySnapshot —
    // without that, this scrub would be erasing live state on every save, since
    // the worker reloads this same document on restart.
    if (cloned.piracy) {
        cloned.piracy.bases.clear();
        cloned.piracy.hostages.clear();
        cloned.piracy.protectionContracts.clear();
        cloned.piracy.tributes.clear();
        cloned.piracy.blackMarkets.clear();
        cloned.piracy.smugglingRuns.clear();
        cloned.piracy.sponsorships.clear();
        cloned.piracy.captures.clear();
        cloned.piracy.successions.clear();
        cloned.piracy.opportunityIndex.clear();
        cloned.piracy.emergenceLog = [];
        // Names and fame are public; who a band talks to is not.
        for (const org of cloned.piracy.organizations.values()) {
            org.relations = {};
            org.heatByFaction = {};
            org.factions = [];
            org.leader = null;
            org.treasury = 0;
            org.baseIds = [];
        }
    }

    // The pirate system also stamps secrets onto objects OUTSIDE world.piracy,
    // and those containers ride this same public snapshot. Scrubbing only the
    // aggregate left four markers on the wire: who secretly protects which lane,
    // which bands grip which systems and corridors, and the very existence of
    // hidden lanes that are supposed to be knowable only by their owner.
    for (const sys of cloned.movement.systems.values()) {
        delete sys.pirateInfluence;
    }
    for (const [id, corridor] of [...cloned.movement.corridors]) {
        // A hidden lane is not a public corridor with a private flag — it is a
        // route nobody else knows exists. Drop it from the shared map entirely.
        if (corridor.restrictedToOrgId) {
            cloned.movement.corridors.delete(id);
            continue;
        }
        delete corridor.pirateControlByOrg;
    }
    for (const route of cloned.economy.tradeRoutes?.values() ?? []) {
        delete route.protectedByOrgId;
    }
    // The interdiction registry hangs off the ECONOMY aggregate, not the pirate
    // one, so it slipped past both scrubs: it names the band camped on each
    // system, its posture, and the loot pool sitting in it. It is rebuilt from
    // the live raiders every trade tick, so dropping it costs nothing.
    cloned.economy.piracyFleets?.clear();

    if (cloned.combat) cloned.combat.recruitmentJobs = [];
    return cloned;
}
