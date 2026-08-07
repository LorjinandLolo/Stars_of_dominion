import * as dotenv from 'dotenv';
import * as path from 'path';
import { deserializeWorld, serializeWorld, cleanWorldForSave, extractFactionShard, injectFactionShard } from '../lib/persistence/save-service';
import { advanceFleet, issueMoveOrder, changeFleetCourse, isFleetOperational } from '../lib/movement/movement-service';
import { ensureLaneGraph } from '../lib/movement/lane-graph';
import { runStrategicTick } from '../lib/time/tick-processor';
import { TechEngine } from '../lib/tech/engine';
import { LeadershipService } from '../lib/leadership/leadership-service';
import { processSectorCombats } from '../lib/combat/combat-manager';
import { initializeFactionHomeWorld } from '../lib/economy/services/initialization-service';
import { GroundSiegeEngine } from '../lib/combat/siege/siege-engine';
import {
    initDistrictWar,
    advanceFront,
    occupationShare,
    capitalTaken,
    frontDefenseMultiplier,
    computeFront,
    CAPITAL_SECTOR,
} from '../lib/combat/siege/district-front';
import {
    capturedFromLosses,
    resolveDisposition,
    ensureLedger,
    type PrisonerDisposition,
} from '../lib/combat/siege/prisoners';
import {
    seedFormations,
    resolveMoves,
    updateSupply,
    contestedDistricts,
    pruneFormations,
    legalMoves,
    claimUndefended,
    recoverOrganization,
    redeployRoute,
    type Formation,
} from '../lib/combat/siege/formations';
import { resolveDistrictBattle } from '../lib/combat/siege/district-battle';
import {
    createPlan,
    tickPlan,
    planningBonus,
    assignedTo,
    type BattlePlan,
} from '../lib/combat/siege/battle-plans';
import { RecruitmentService } from '../lib/combat/recruitment-service';
import { tickConstructionGlobal, startConstruction } from '../lib/construction/construction-service';
import { BUILDINGS } from '../data/buildings';
import { generateSurface, autoPlaceBuilding } from '../lib/planet-surface/generator';
import { SURFACE_SECTOR_COUNT } from '../lib/planet-surface/types';
import { computeSectorOccupancy } from '../lib/planet-surface/occupancy';
// Static imports for order handlers. These used to be fire-and-forget dynamic
// `import().then(...)` calls inside executeOrder — the mutation could land AFTER
// saveWorldState() had already serialized the world, silently losing the order.
import { launchOperation } from '../lib/espionage/espionage-service';
import { createOffer, respondToOffer, withdrawOffer, breakTreaty, registerActOfWar, ensureDiplomacyState, shiftRivalry, isAtWar } from '../lib/diplomacy/offer-service';
import { launchGambit, respondToGambit } from '../lib/diplomacy/gambit-service';
import { evaluateSupportAndApply } from '../lib/diplomacy/mandate-service';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { ensureGovernments, spendPoliticalCapital, getGovernment } from '../lib/government/government-service';
import { enactPolicy, repealPolicy } from '../lib/government/policy-service';
import { ensureHeadsOfState } from '../lib/government/succession-service';
import { ensureCabinets, appointMinister, dismissMinister, APPOINT_MINISTER_COST, DISMISS_MINISTER_COST } from '../lib/government/cabinet-service';
import { ensureGovernors, appointGovernor, APPOINT_GOVERNOR_COST } from '../lib/government/governor-service';
import { lobbyParty, decreePolicy } from '../lib/government/parliament-service';
import { ensureCohesion } from '../lib/government/cohesion-service';
import { answerDefiance } from '../lib/government/defiance-service';
import { grantConcession, suppressSecession } from '../lib/government/secession-service';
import { recognizeBreakaway, guaranteeBreakaway } from '../lib/government/foreign-interference-service';
import { purgeOfficers } from '../lib/government/coup-service';
import { recordPoliticalEvent } from '../lib/government/ideology-drift';
import { imposeSanctions, liftSanctions } from '../lib/diplomacy/sanctions-service';
import { makePromise, fulfillPromise } from '../lib/diplomacy/promise-service';
import { intervene, plantRumor } from '../lib/diplomacy/intervention-service';
import { ensurePressState, pushWorldStory } from '../lib/press-system/integration';
import { resolveCrisis, reactToCrisis, applyPredictionPayouts } from '../lib/press-system/crisis';
import { CrisisChoice, StorySource, StoryTruth, CampaignObjective } from '../lib/press-system/types';
import {
    CampaignConfig,
    counterCampaign,
    traceCampaign,
    accuseCampaign,
} from '../lib/press-system/campaigns';
import {
    respondCooperate,
    respondObstruct,
    respondSacrificeOfficial,
    respondPublishFirst,
} from '../lib/press-system/investigations';
import { RNG as PressRNG } from '../lib/press-system/utils';

/**
 * Seed a press RNG per order. Seeding purely from world.nowSeconds gave every
 * order resolved in the same worker cycle an identical roll, so a player could
 * batch actions and get correlated outcomes.
 */
function pressRngFor(world: any, ...parts: string[]): PressRNG {
    let hash = 0;
    for (const part of parts.join('|')) {
        hash = (Math.imul(hash, 31) + part.charCodeAt(0)) | 0;
    }
    return new PressRNG((world.nowSeconds | 0) ^ hash);
}
import { ACTION_DEFINITIONS } from '../lib/actions/registry';
import { deployAgent, recruitAgent, recallAgent } from '../lib/espionage/agent-service';
import { seizeOpportunity } from '../lib/espionage/ops-board-service';
import { establishTradeRoute } from '../lib/economy/trade-service';
import { executeMarketOrder } from '../lib/economy/economy-service';
import {
    charterNewCompany,
    getOrCreateFactionState,
    ensureCorporateState,
    registerCompany,
} from '../lib/economy/corporate/company-registry';
import { issueNewShares, grantMonopolyRight, commandPrivateers, collectCorporateTax } from '../lib/economy/corporate/company-service';
import { CharterPower } from '../lib/economy/corporate/company-types';
import {
    charterCorporation,
    priceCharter,
    validateCharter,
    derivePowersFromRights,
    computeInfluence,
    computeStanding,
    MIN_LEGITIMACY_TO_CHARTER,
    CHARTER_TECH_ID,
} from '../lib/economy/corporate/charter-service';
import type { CharterTerms, CorporateRight } from '../lib/economy/corporate/charter-types';
import { RIGHT_DEFS } from '../lib/economy/corporate/charter-catalog';
import { resolveDemand, setHostPolicy, type DemandResponse } from '../lib/economy/corporate/corporate-politics';
import {
    resolveCorporateCrisis,
    respondToMegaproject,
    type ProposalResponse,
} from '../lib/economy/corporate/corporate-events';
import {
    buyShares,
    sellShares,
    hostileTakeover,
    mergeCompanies,
    afterOwnershipChange,
} from '../lib/economy/corporate/shareholder-service';
import { advanceSorties } from '../lib/combat/air-mission-service';
import { LOGISTICS_PRIORITIES } from '../lib/logistics/distribution-types';
import {
    startOrbitalConstruction,
    cancelOrbitalConstruction,
    applyOrbitalDamage,
    isOrbitSuppressed,
    ensureOrbitalState,
} from '../lib/orbital/orbital-service';
import { ORBITAL_STRUCTURE_BY_ID } from '../data/orbital-structures';
import {
    canUpgradeTrack,
    startTrackUpgrade,
    cancelTrackUpgrade,
    damageInfrastructure,
} from '../lib/infrastructure/infrastructure-service';
import { INFRASTRUCTURE_TRACK_IDS } from '../lib/infrastructure/infrastructure-types';
import {
    canDeclareSpecialization,
    declareSpecialization,
    clearSpecialization,
} from '../lib/specialization/specialization-service';

/**
 * Fleet basePower converts to orbital volley damage at this rate. Tuned so a
 * mid-sized fleet needs several passes to break a fortified orbit, and a token
 * raider needs many.
 */
const ORBITAL_ASSAULT_POWER_FACTOR = 4;
import type { GroundSiegeState, PlanetaryDefenseState, GroundUnitType, TacticalStanceId } from '../lib/combat/siege/siege-types';
import type { GameWorldState } from '../lib/game-world-state';

// Ensure environment variables are loaded BEFORE the db module reads them.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Imported dynamically-after-dotenv would be cleaner, but lib/db reads
// DATABASE_URL lazily on first query, so a static import is safe here.
import { prisma } from '../lib/db';

const SESSION_DOC_ID = 'default-session';

const POLL_INTERVAL_MS = 5000; // Run every 5 seconds
// Game clock: 75 game-seconds per 5s tick (15x real time). This used to be a
// 15s advance at the top of the tick plus a hidden extra 60s right before the
// save ("demo speed") — consolidated here so the speed is stated exactly once.
const TIME_STEP_SECONDS = 75;
// Fleet physics keep the old top-of-tick 15s step: raising this to
// TIME_STEP_SECONDS would make every fleet arrive 5x sooner and change pacing.
const FLEET_STEP_SECONDS = 15;

// The full-world snapshot is only written every Nth tick (30s), or immediately
// on any tick that processed player orders or ran a strategic tick. Faction
// shards are dirty-checked every tick and written only when changed.
const SNAPSHOT_SAVE_EVERY_TICKS = 6;

// Worker lease (split-brain guard). The world now lives in worker memory
// between ticks, so two workers pointed at the same database would silently
// corrupt state racing each other's saves — a second worker must refuse to
// start while another holds the lease. The lease is a tiny extra doc in the
// sessions collection (reusing its existing `snapshot` attribute), so no
// schema change is needed and clients never see it (they subscribe to the
// session document channel, not the collection).
const LEASE_DOC_ID = 'worker-lease';
const LEASE_TTL_MS = 15 * 60 * 1000;
const LEASE_RENEW_INTERVAL_MS = 5 * 60 * 1000;
const WORKER_ID = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

// Overlap guard: a cycle that takes longer than POLL_INTERVAL_MS (big snapshot
// serialize, slow network) used to overlap the next setInterval firing — two
// concurrent cycles double-advancing time and racing each other's saves.
let cycleInProgress = false;

// In-memory authoritative world. Loaded once, mutated in place every tick;
// re-loaded from the last saved snapshot only after an error leaves it suspect.
let cachedWorld: GameWorldState | null = null;
let tickCounter = 0;
let lastLeaseRenewal = 0;

// Dirty-tracking: last serialized strings actually written to the database.
// Writes are skipped while the serialized form is unchanged.
let lastSnapshotKey = '';
const lastShardSaved = new Map<string, string>();

// Every faction id that has (or had) a shard row. A fleet-only faction (e.g.
// the Genthouli raiders — no economy/tech record) drops out of the
// fleet-owner save set the moment its last fleet dies; without one final
// shard write, the stale shard would resurrect the dead fleet on reload.
const knownShardFactionIds = new Set<string>();

// Order-queue polling backs off to every 4th tick (20s) once the queue has
// been empty for ~2 minutes; any order found snaps it back to every tick.
const IDLE_ORDER_POLL_EVERY = 4;
const IDLE_ORDER_POLL_AFTER_EMPTY = 24;
let emptyOrderPolls = 0;
let orderPollSkip = 0;

/**
 * Loads the authoritative world from the session snapshot + faction shards
 * and normalizes legacy data. Called once at startup and after any tick error.
 */
async function loadWorld(): Promise<GameWorldState> {
    const doc = await prisma.multiplayerSession.findUniqueOrThrow({ where: { id: SESSION_DOC_ID } });
    const world = deserializeWorld(doc.snapshot);

    // Phase 4: Reconstruct World from Shards
    try {
        const factionDocs = await prisma.gameFactionShard.findMany({ take: 50 });
        for (const fDoc of factionDocs) {
            injectFactionShard(world, fDoc.data);
            knownShardFactionIds.add(fDoc.factionId || fDoc.id);
        }
    } catch (err) {
        console.log('[Tick Worker] Could not load game_factions shards, proceeding with main session.');
    }

    // Ensure collections required for combat exist (for 1.0 migration)
    if (!world.activeCombats) world.activeCombats = new Map();
    if (!world.rivalries) world.rivalries = new Map();
    ensureDiplomacyState(world);
    // Seed empire postures + blocs (internal politics) for factions lacking
    // them — pre-Phase-3 worlds never created any.
    try { ensureEmpirePostures(world); } catch (e) { console.error('[Tick Worker] Posture bootstrap failed:', e); }
    try { ensurePressState(world); } catch (e) { console.error('[Tick Worker] Press bootstrap failed:', e); }
    // Per-faction government state. Runs AFTER postures — it reads the posture's
    // governmentId to pick the profile in data/governments.
    try { ensureGovernments(world); } catch (e) { console.error('[Tick Worker] Government bootstrap failed:', e); }
    // Seat a head of state per government and stock the recruitment pools —
    // nothing had ever created a Leader, so the pool was permanently empty.
    try { ensureHeadsOfState(world); } catch (e) { console.error('[Tick Worker] Head-of-state bootstrap failed:', e); }
    // Cabinet seats and planetary governors (the planet record's governorId has
    // existed since the construction pillar and nothing ever set it).
    try { ensureCabinets(world); } catch (e) { console.error('[Tick Worker] Cabinet bootstrap failed:', e); }
    try { ensureGovernors(world); } catch (e) { console.error('[Tick Worker] Governor bootstrap failed:', e); }
    // Cohesion records for every owned world. Runs after governors — governor
    // loyalty is one of the drivers it reads.
    try { ensureCohesion(world); } catch (e) { console.error('[Tick Worker] Cohesion bootstrap failed:', e); }
    // Charter Corporations: the political ledgers plus per-company backfill for
    // snapshots written before companies had charters, personalities or a board.
    try { ensureCorporateState(world); } catch (e) { console.error('[Tick Worker] Corporate bootstrap failed:', e); }
    if (!world.movement.sorties) world.movement.sorties = new Map();

    // Normalize snapshot data: systems saved by older snapshots can be missing
    // array fields, which crashes tick steps that iterate them
    // (`hyperlaneNeighbors is not iterable`, `tags.includes` throws, etc.).
    for (const sys of world.movement.systems.values()) {
        if (!Array.isArray((sys as any).hyperlaneNeighbors)) (sys as any).hyperlaneNeighbors = [];
        if (!Array.isArray((sys as any).tags)) (sys as any).tags = [];
    }

    // Every snapshot written so far saved an EMPTY lane graph (the loader never
    // read the link list), which left fleets on deep-space crossings and every
    // BFS consumer — sensors, cohesion, press, border detection — looking at a
    // galaxy of isolated systems. Rebuild it once; later saves carry the lanes.
    try { ensureLaneGraph(world.movement.systems); } catch (e) { console.error('[Tick Worker] Lane graph bootstrap failed:', e); }

    return world;
}

/**
 * Acquires or renews the worker lease. Returns false if another live worker
 * holds it. Read-then-write, so a narrow race window exists — this guards the
 * realistic failure mode (a forgotten worker on another machine), not
 * adversarial concurrency.
 */
async function acquireLease(): Promise<boolean> {
    const now = Date.now();
    const leasePayload = {
        snapshot: JSON.stringify({ holderId: WORKER_ID, expiresAt: now + LEASE_TTL_MS }),
        lastTickAt: new Date(now).toISOString(),
    };
    const doc = await prisma.multiplayerSession.findUnique({ where: { id: LEASE_DOC_ID } });
    if (!doc) {
        await prisma.multiplayerSession.create({ data: { id: LEASE_DOC_ID, ...leasePayload } });
        lastLeaseRenewal = now;
        return true;
    }
    let holder: { holderId: string; expiresAt: number } | null = null;
    try { holder = JSON.parse(doc.snapshot); } catch { holder = null; }
    if (holder && holder.holderId !== WORKER_ID && holder.expiresAt > now) return false;
    await prisma.multiplayerSession.update({ where: { id: LEASE_DOC_ID }, data: leasePayload });
    lastLeaseRenewal = now;
    return true;
}

/** Marks the lease expired so a replacement worker can start immediately. */
async function releaseLease(): Promise<void> {
    try {
        await prisma.multiplayerSession.update({
            where: { id: LEASE_DOC_ID },
            data: {
                snapshot: JSON.stringify({ holderId: WORKER_ID, expiresAt: 0 }),
                lastTickAt: new Date().toISOString(),
            },
        });
    } catch { /* best effort */ }
}

async function runGameTick() {
    if (cycleInProgress) {
        console.warn('[Tick Worker] Previous cycle still running — skipping this interval.');
        return;
    }
    cycleInProgress = true;

    try {
        // Lease renewal — 2 tiny ops per 5 minutes. If another worker has taken
        // over (our lease expired while this process was suspended), stop
        // rather than fight over the world.
        if (Date.now() - lastLeaseRenewal > LEASE_RENEW_INTERVAL_MS) {
            if (!(await acquireLease())) {
                console.error('[Tick Worker] Lost the worker lease to another process — shutting down.');
                process.exit(1);
            }
        }

        // 1. Authoritative world lives in memory across ticks. The worker is
        // the only writer, so re-reading its own writes every 5s (session doc
        // + all faction shards, ~35k reads/day) was pure waste.
        if (!cachedWorld) cachedWorld = await loadWorld();
        let world = cachedWorld;
        tickCounter++;

        // 2. Advance Simulation Time
        const oldNow = world.nowSeconds;
        world.nowSeconds += TIME_STEP_SECONDS;

        // 3. Process Pending Player Orders (server-side filter on processed=false;
        // executed orders are deleted, so the queue can never starve).
        let pendingOrders: any[] = [];
        if (emptyOrderPolls >= IDLE_ORDER_POLL_AFTER_EMPTY && orderPollSkip < IDLE_ORDER_POLL_EVERY - 1) {
            // Queue has been empty for ~2 min — back off to a 20s poll cadence.
            orderPollSkip++;
        } else {
            orderPollSkip = 0;
            pendingOrders = await prisma.gameOrder.findMany({
                where: { processed: false },
                orderBy: { createdAt: 'asc' },
                take: 100,
            });
            if (pendingOrders.length > 0) emptyOrderPolls = 0;
            else emptyOrderPolls++;
        }

        if (pendingOrders.length > 0) {
            console.log(`[Tick Worker] Executing ${pendingOrders.length} player orders...`);
            for (const orderDoc of pendingOrders) {
                try {
                    const payload = JSON.parse(orderDoc.payload);
                    executeOrder(world, orderDoc.actionId, payload, orderDoc.factionId);
                    // Delete on success — keeps the queue table empty so it can
                    // never starve, and avoids unbounded growth.
                    await prisma.gameOrder.delete({ where: { id: orderDoc.id } });
                } catch (e) {
                    console.error(`[Tick Worker] Order ${orderDoc.id} failed:`, e);
                    // Mark failed orders processed so they aren't retried in a loop.
                    try {
                        await prisma.gameOrder.update({ where: { id: orderDoc.id }, data: { processed: true } });
                    } catch {
                        // Marking failed — delete instead, so a poisoned order
                        // can't be retried forever.
                        try { await prisma.gameOrder.delete({ where: { id: orderDoc.id } }); } catch { /* best effort */ }
                    }
                }
            }
        }

        // 4. Real-time Physics: Fleet Movement
        let fleetsMoved = 0;
        for (const [fleetId, fleet] of world.movement.fleets) {
            if (fleet.destinationSystemId) {
                const updated = advanceFleet(fleet, FLEET_STEP_SECONDS, world.movement);
                world.movement.fleets.set(fleetId, updated);
                fleetsMoved++;
            }
        }
        if (fleetsMoved > 0) console.log(`[Tick Worker] Advanced ${fleetsMoved} fleets in transit.`);

        // 4.5. Real-time Conflict: Sector Combats & Air Sorties
        processSectorCombats(world);
        
        // 4. Process Construction
        tickConstructionGlobal(world);

        // 5. Process Ground Recruitment
        RecruitmentService.tick(world);

        // 6. Advance air sorties (static import — runs before the save, always)
        try {
            advanceSorties(world);
        } catch (e: any) {
            console.warn('[Tick Worker] advanceSorties failed:', e.message);
        }

        // 5. Strategic Tick check (6-hour windows)
        const currentTickWindow = Math.floor(world.nowSeconds / (6 * 3600));
        const lastTickWindow = Math.floor(oldNow / (6 * 3600));

        const strategicFired = currentTickWindow > lastTickWindow;
        if (strategicFired) {
            console.log(`[Tick Worker] STRATEGIC TICK TRIGGERED (#${currentTickWindow})`);
            // Diplomacy Phase 6: tell the diplomatic AI which factions are
            // human-claimed so it never answers on a player's behalf. Fresh
            // query each strategic tick (cheap: one small table, every ~24min).
            try {
                const claims = await prisma.playerProfile.findMany({ select: { factionId: true } });
                (world as any).claimedFactionIds = claims.map(c => c.factionId).filter(Boolean);
            } catch {
                // Table unreadable — keep the previous list rather than letting
                // the AI speak for humans.
            }
            // CRITICAL: pass `world` — without it the tick processor mutates the
            // worker's local singleton, and every strategic-tick result (economy,
            // research, population...) was thrown away instead of saved/synced.
            await runStrategicTick(new Date(world.nowSeconds * 1000), currentTickWindow, world);

            // Round-trip normalize (~every 24 real minutes): the old code
            // re-serialized and re-parsed the whole world every tick, which
            // coerced Dates to ISO strings and dropped undefined fields. Sim
            // code may rely on that shape, so keep the normalization at
            // strategic-tick cadence now that the per-tick round-trip is gone.
            world = deserializeWorld(serializeWorld(world));
            cachedWorld = world;
        }

        // 5.5. Faction Initialization Check (Ensures homeworlds exist for all players)
        // We run this every tick to catch new claimants or fresh game starts
        world.economy.factions.forEach((f, id) => {
            initializeFactionHomeWorld(world, id);
        });

        // 5.6. Multi-Planet Seeding — ensures every faction capital has ≥2 planets.
        // Idempotent: skips systems that already have orbit-2 planets.
        // Once seeded, the planets are part of the snapshot and synced to all clients.
        const SECONDARY_PLANET_SPECS: Record<string, Array<{ name: string; planetType: string; ownerId: string; tags: string[] }>> = {
            'alpha-5b34961e18bb6fd14903': [ // Aurelian Combine capital
                { name: 'Aurel Minor',  planetType: 'industrial',   ownerId: 'faction-aurelian',   tags: ['mining_world'] },
                { name: 'Aurel Prime II', planetType: 'agricultural', ownerId: 'faction-aurelian', tags: ['fertile_soil'] },
            ],
            'alpha-fe148b9a69a680fa14a3': [ // Vektori capital
                { name: 'Vek Station',  planetType: 'fortress',     ownerId: 'faction-vektori',    tags: ['fortified'] },
                { name: 'Vek Fringe',   planetType: 'moon',         ownerId: '',                   tags: ['barren'] },
            ],
            'alpha-1acb646b529592834b59': [ // Null Syndicate capital
                { name: 'Node-7',       planetType: 'research',     ownerId: 'faction-null-syndicate', tags: ['research_hub'] },
                { name: 'Null Drift',   planetType: 'standard',     ownerId: '',                   tags: ['arid'] },
            ],
            'alpha-10fae8cf89590243337b': [ // Covenant capital
                { name: 'Sanctum II',   planetType: 'standard',     ownerId: 'faction-covenant',   tags: ['holy_world'] },
                { name: 'The Void Eye', planetType: 'moon',         ownerId: 'faction-covenant',   tags: ['anomaly'] },
            ],
        };

        for (const [systemId, specs] of Object.entries(SECONDARY_PLANET_SPECS)) {
            for (let i = 0; i < specs.length; i++) {
                const planetId = `planet-${systemId}-orbit-${i + 2}`;
                if (!world.construction.planets.has(planetId)) {
                    const spec = specs[i];
                    world.construction.planets.set(planetId, {
                        id: planetId,
                        name: spec.name,
                        ownerId: spec.ownerId,
                        systemId,
                        planetType: spec.planetType as any,
                        infrastructureLevel: 1,
                        stability: 60 + Math.floor(Math.random() * 25),
                        happiness: 70,
                        specialization: null,
                        maxTiles: 6,
                        tiles: [
                            { tileId: `${planetId}-t1`, districtType: 'any', buildingId: null, constructionState: 'empty', constructionCompleteAt: null },
                            { tileId: `${planetId}-t2`, districtType: 'any', buildingId: null, constructionState: 'empty', constructionCompleteAt: null },
                        ],
                        buildQueue: [],
                        activeModifiers: [],
                        tags: spec.tags,
                        population: 10 + Math.floor(Math.random() * 30),
                        popCapacity: 50,
                        popGrowth: 0.02,
                        unrest: Math.floor(Math.random() * 20),
                        isOccupied: false,
                        demographics: [
                            { speciesId: 'species-colonist', name: 'Colonists', percentage: 80, socialClass: 'Citizen' },
                            { speciesId: 'species-labor',    name: 'Labor Caste', percentage: 20, socialClass: 'Resident' },
                        ],
                    });
                    console.log(`[Tick Worker] Seeded secondary planet "${spec.name}" in system ${systemId}.`);
                }
            }
        }


        // 5.7 Starter Infrastructure — every capital gets a working shipyard and
        // barracks so the core loop (commission ships, recruit troops, repair)
        // functions out of the box. Idempotent: skips planets that have them.
        for (const [fId, f] of world.economy.factions) {
            const capSys = (f as any).capitalSystemId;
            if (!capSys) continue;
            const capPlanet = Array.from(world.construction.planets.values())
                .find((p: any) => p.systemId === capSys && p.ownerId === fId);
            if (!capPlanet) continue;
            for (const bId of ['orbital_shipyard', 'barracks']) {
                if (!Array.isArray((capPlanet as any).tiles)) (capPlanet as any).tiles = [];
                const has = (capPlanet as any).tiles.some((t: any) => t.buildingId === bId);
                if (!has) {
                    (capPlanet as any).tiles.push({
                        tileId: `${capPlanet.id}-starter-${bId}`,
                        districtType: 'any',
                        buildingId: bId,
                        constructionState: 'active',
                        constructionCompleteAt: null,
                    });
                    console.log(`[Tick Worker] Seeded starter ${bId} on ${capPlanet.name} (${fId})`);
                }
            }
        }

        // 5.8 Continuous dock repair — fleets holding (not moving) in a system
        // they own patch up a little every cycle. The old repair only ran on the
        // 6-hour strategic tick (~24 real minutes), far too slow to matter.
        for (const fleet of world.movement.fleets.values()) {
            if (fleet.factionId === 'faction-pirates') continue;
            if (!fleet.currentSystemId || fleet.destinationSystemId) continue;
            if ((fleet.strength ?? 1) >= 1.0) continue;
            const sys = world.movement.systems.get(fleet.currentSystemId);
            if (!sys || sys.ownerFactionId !== fleet.factionId) continue;
            fleet.strength = Math.min(1.0, (fleet.strength ?? 0) + 0.01);
            if (fleet.strength >= 1.0) console.log(`[REPAIR] ${fleet.name || fleet.id} fully repaired at ${sys.name}`);
        }

        // 5.9 Genthouli raiders — a hostile NPC battle group guarding Genthouli.
        // Spawned exactly once (flag survives in the snapshot), so destroying it
        // is permanent — no respawn loop. The raider faction is at war with every
        // empire, so any fleet arriving in-system auto-engages via
        // processSectorCombats the same cycle.
        seedGenthouliRaiders(world);

        // 4. Seeding & Administrative recalculations ────────────────────────
        processSieges(world);
        recalculateSystemControl(world);
        
        // Finalize state — persist only what changed. Orders and strategic
        // ticks save immediately (an executed order's doc is already deleted,
        // so its effects must not sit unsaved in memory); everything else
        // batches to the 30s cadence.
        const forceSave = pendingOrders.length > 0 || strategicFired
            || (tickCounter % SNAPSHOT_SAVE_EVERY_TICKS === 0);
        const snapshotSaved = await saveWorldState(world, forceSave);

        // Save Faction Shards — dirty-checked, written only when changed.
        // These run EVERY tick, unlike the snapshot: cleanWorldForSave strips
        // fleets from the snapshot, so shards are not merely the durability
        // store, they are the client's only live channel for fleet position,
        // strength, economy and espionage state (/api/game/sync returns shard
        // rows by `updatedAt`, and useGameSync rebuilds fleets from them).
        // Moving them to the snapshot's 30s cadence freezes fleet markers on
        // the galaxy map between writes — do not gate this on forceSave.
        // knownShardFactionIds keeps factions with an existing shard in the set
        // even after their last fleet dies, so the emptied shard gets written
        // once instead of the stale one resurrecting dead fleets on reload.
        const factionsToSave = new Set([
            ...world.economy.factions.keys(),
            ...world.tech.keys(),
            ...Array.from(world.movement.fleets.values()).map(f => f.factionId),
            ...knownShardFactionIds,
        ]);

        let shardsWritten = 0;
        for (const fId of factionsToSave) {
            if (!fId || fId === 'faction-neutral') continue;
            const shardStr = extractFactionShard(world, fId);
            if (lastShardSaved.get(fId) === shardStr) continue;
            try {
                await prisma.gameFactionShard.upsert({
                    where: { id: fId },
                    update: { factionId: fId, data: shardStr },
                    create: { id: fId, factionId: fId, data: shardStr },
                });
            } catch (e: any) {
                console.error(`[Tick Worker] Shard save failed for ${fId}:`, e.message);
                continue; // not recorded as saved — retried next tick
            }
            lastShardSaved.set(fId, shardStr);
            knownShardFactionIds.add(fId);
            shardsWritten++;
        }

        // Idle ticks stay silent; log only when something actually happened.
        if (snapshotSaved || shardsWritten > 0 || pendingOrders.length > 0 || strategicFired) {
            console.log(`[Tick Worker] Cycle ${tickCounter}: orders=${pendingOrders.length}, snapshot=${snapshotSaved ? 'saved' : 'clean'}, shards=${shardsWritten}/${factionsToSave.size}.`);
        }

    } catch (err: any) {
        console.error('[Tick Worker] Fatal loop error:', err.message);
        // The in-memory world may be half-mutated or out of sync with the DB —
        // discard it and reload from the last saved snapshot next tick, and
        // forget dirty-tracking so everything is re-synced once after reload.
        cachedWorld = null;
        lastSnapshotKey = '';
        lastShardSaved.clear();
    } finally {
        cycleInProgress = false;
    }
}

/**
 * Persists the world snapshot, skipping the write when nothing but the clock
 * has moved since the last save. Returns true if a write happened.
 * `force` gates real changes to the 30s cadence (or order/strategic ticks);
 * without it, changed state stays in memory until the next cadence tick.
 */
async function saveWorldState(world: any, force: boolean): Promise<boolean> {
    // Off-cadence ticks return before serializing: the clone + stringify of the
    // full world costs more than everything else in an idle tick combined.
    if (!force) return false;
    const cleanWorld = cleanWorldForSave(world);
    const newSnapshot = serializeWorld(cleanWorld);
    // The clock advances every tick, so it must not count as a "real" change.
    const comparisonKey = newSnapshot.replace(/"nowSeconds":\d+(\.\d+)?/g, '"nowSeconds":0');
    if (comparisonKey === lastSnapshotKey) return false;
    await prisma.multiplayerSession.update({
        where: { id: SESSION_DOC_ID },
        data: {
            snapshot: newSnapshot,
            lastTickAt: new Date().toISOString()
        }
    });
    lastSnapshotKey = comparisonKey;
    return true;
}

// ─── Genthouli raiders (hostile NPC battle group) ────────────────────────────

const GENTHOULI_SYSTEM_ID = 'alpha-fe1c7b05cd1af6875424';
const RAIDER_FACTION_ID = 'faction-crimson-raiders';
const RAIDER_FLEET_ID = 'fleet-genthouli-raiders';

/**
 * Spawn the Crimson Raider Vanguard in Genthouli (once) and keep it on guard
 * duty. Persistence rides the existing faction-shard sync: the shard-save loop
 * includes every factionId that owns a fleet, so the raiders get their own
 * `game_factions` shard without needing an economy record (same as pirates).
 */
function seedGenthouliRaiders(world: any) {
    if (!world.movement.systems.has(GENTHOULI_SYSTEM_ID)) return;

    if (!world.genthouliRaidersSpawned) {
        world.movement.fleets.set(RAIDER_FLEET_ID, {
            id: RAIDER_FLEET_ID,
            factionId: RAIDER_FACTION_ID,
            name: 'Crimson Raider Vanguard',
            currentSystemId: GENTHOULI_SYSTEM_ID,
            destinationSystemId: null,
            originSystemId: null,
            activeLayer: null,
            transitProgress: 0,
            etaSeconds: 0,
            plannedPath: [],
            orders: [],
            doctrine: {
                type: 'Defensive',
                deviationFromPosture: 0,
                preferredLayers: ['hyperlane'],
                retreatThreshold: 0.15,
                logisticsStrain: 0,
                moraleDrift: 0,
                supplyLevel: 1.0,
            },
            postureId: 'Defensive',
            strength: 1.0,
            basePower: 120,
            composition: { interceptor: 6, destroyer: 4, cruiser: 2 },
            hyperdriveProfile: {
                hyperlane: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
                trade: { speedMultiplier: 1.0, detectabilityMultiplier: 1.2, supplyStrainMultiplier: 1.0 },
                corridor: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
                gate: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
                deepSpace: { speedMultiplier: 0.6, detectabilityMultiplier: 0.4, supplyStrainMultiplier: 1.0 },
            },
            isDetectable: true,
            transportedArmyIds: [],
            leaderId: undefined,
        });

        // Standing state of war with every empire — escalationLevel 7 is the
        // threshold combat-manager's areAtWar() checks, so co-presence in
        // Genthouli is enough to start the battle (no attack order needed).
        for (const empireId of world.economy.factions.keys()) {
            if (empireId === RAIDER_FACTION_ID) continue;
            const idAB = `rivalry-${RAIDER_FACTION_ID}-${empireId}`;
            const idBA = `rivalry-${empireId}-${RAIDER_FACTION_ID}`;
            const warState = {
                id: idAB,
                empireAId: RAIDER_FACTION_ID,
                empireBId: empireId,
                rivalryScore: 100,
                escalationLevel: 7,
                activeSanctionIds: [],
                proxyConflictsInvolved: [],
                detenteActive: false,
            };
            if (!world.rivalries.has(idAB)) world.rivalries.set(idAB, warState);
            if (!world.rivalries.has(idBA)) {
                world.rivalries.set(idBA, { ...warState, id: idBA, empireAId: empireId, empireBId: RAIDER_FACTION_ID });
            }
        }

        world.genthouliRaidersSpawned = true;
        console.log('[Tick Worker] Spawned Crimson Raider Vanguard guarding Genthouli.');
    }

    // Guard-post AI: if the vanguard ever ends up parked outside Genthouli
    // (stranded-fleet recovery, retreat mechanics), order it back home.
    const raiders = world.movement.fleets.get(RAIDER_FLEET_ID);
    if (raiders && raiders.currentSystemId && !raiders.destinationSystemId
        && raiders.currentSystemId !== GENTHOULI_SYSTEM_ID) {
        const updated = issueMoveOrder(raiders, GENTHOULI_SYSTEM_ID, 'hyperlane', world.movement);
        world.movement.fleets.set(RAIDER_FLEET_ID, updated);
        console.log('[Tick Worker] Crimson Raider Vanguard returning to guard Genthouli.');
    }
}

/**
 * Recalculates star system ownership based on the ownership of its constituent planets.
 */
function recalculateSystemControl(world: any) {
    const systemToPlanets = new Map<string, any[]>();
    
    // Group all planets by their system
    for (const planet of world.construction.planets.values()) {
        const list = systemToPlanets.get(planet.systemId) || [];
        list.push(planet);
        systemToPlanets.set(planet.systemId, list);
    }
    
    // Process each system
    for (const [sysId, system] of world.movement.systems) {
        const planets = systemToPlanets.get(sysId) || [];
        if (planets.length === 0) {
            system.ownerFactionId = undefined;
            system.isContested = false;
            continue;
        }

        const owners = new Set<string>();
        for (const p of planets) {
            if (p.ownerId && p.ownerId !== 'faction-neutral') {
                owners.add(p.ownerId);
            }
        }

        if (owners.size === 0) {
            system.ownerFactionId = undefined;
            system.isContested = false;
        } else if (owners.size === 1) {
            system.ownerFactionId = Array.from(owners)[0];
            system.isContested = false;
        } else {
            system.ownerFactionId = undefined;
            system.isContested = true;
        }
    }
}


/**
 * Check & deduct an action's cost from the faction's LIVE economy reserves —
 * the same numbers the player's resource bar shows. Resources the economy
 * doesn't track yet (influence, manpower, intel...) are free for now.
 * Returns false (and skips the order) if an enforced resource is short.
 */
function chargeOrderCost(world: any, factionId: string, actionId: string): boolean {
    const def = (ACTION_DEFINITIONS as any)[actionId];
    const cost = def?.cost;
    if (!cost || Object.keys(cost).length === 0) return true;

    const econFaction = world.economy?.factions?.get?.(factionId);
    const reserves = econFaction?.reserves;
    if (!reserves) return true; // no economy record — don't block gameplay

    const charges: Array<[string, number]> = [];
    for (const [res, amt] of Object.entries(cost)) {
        const key = res.toUpperCase(); // Resource enum keys: CREDITS, METALS, ...
        if (reserves[key] === undefined) continue; // untracked resource → free
        if ((reserves[key] ?? 0) < (amt as number)) {
            console.warn(`[Order] ${factionId} cannot afford ${actionId}: needs ${amt} ${res}, has ${Math.floor(reserves[key] ?? 0)}`);
            return false;
        }
        charges.push([key, amt as number]);
    }
    charges.forEach(([key, amt]) => { reserves[key] = (reserves[key] ?? 0) - amt; });
    return true;
}

/**
 * Persist a human-readable failure reason onto the faction's economy record.
 * It rides the existing faction-shard sync back to the client (see
 * extractFactionShard → game_factions → useGameSync), which surfaces it in the
 * notification feed. The client dedupes by `id`, so re-writing the same failure
 * on later ticks is harmless. Without this, a rejected order was a bare `return`
 * and the queue loop deleted it as if it had succeeded — the player saw nothing.
 */
function recordOrderFailure(world: any, factionId: string, actionId: string, reason: string): void {
    const econFaction = world.economy?.factions?.get?.(factionId);
    if (!econFaction) return;
    econFaction.lastOrderError = {
        id: `ofail-${world.nowSeconds}-${actionId}-${Math.random().toString(36).slice(2, 7)}`,
        actionId,
        reason,
        at: new Date(world.nowSeconds * 1000).toISOString(),
    };
    console.warn(`[Order] ${factionId} order ${actionId} failed: ${reason}`);
}

/**
 * Remove a company from a faction's corporate portfolio. charterCorporation
 * registers the new charter on the founder's portfolio as part of building it,
 * so an order that builds a company and then cannot pay for it has to undo that
 * bookkeeping before bailing out.
 */
function unwindPortfolioEntry(corp: any, factionId: string, companyId: string): void {
    const state = corp?.factionStates?.get?.(factionId);
    if (!state) return;
    delete state.companySharesOwned[companyId];
    state.charteredCompanyIds = (state.charteredCompanyIds ?? []).filter((id: string) => id !== companyId);
}

/**
 * Acts of state that spend the government's political capital on top of any
 * resource cost. Policies are NOT here — the policy service charges their own
 * per-policy cost so the price can vary by reform.
 */
const POLITICAL_CAPITAL_COSTS: Record<string, number> = {
    DIP_DECLARE_WAR: 30,
    DIP_BREAK_TREATY: 20,
    DIP_IMPOSE_SANCTIONS: 15,
    INTERNAL_PURGE_FACTION: 25,
};

/**
 * Maps database orders to in-memory world state mutations.
 * includes server-side validation to ensure players only control their own assets.
 */
function executeOrder(world: any, actionId: string, payload: any, factionId: string) {
    console.log(`[Order] Validating ${actionId} for ${factionId}`);

    // Affordability gate — deducts from the live economy on success.
    if (!chargeOrderCost(world, factionId, actionId)) {
        recordOrderFailure(world, factionId, actionId, 'Insufficient resources in the treasury.');
        return;
    }

    // Authority gate — acts of state cost political capital, not credits.
    // Factions without a government (AI shells, pirates) are never gated.
    const politicalCost = POLITICAL_CAPITAL_COSTS[actionId];
    if (politicalCost) {
        if (!spendPoliticalCapital(world, factionId, politicalCost, `order ${actionId}`)) {
            const held = Math.floor(getGovernment(world, factionId)?.politicalCapital ?? 0);
            recordOrderFailure(
                world,
                factionId,
                actionId,
                `Needs ${politicalCost} political capital; the government holds ${held}.`
            );
            return;
        }
    }

    switch (actionId) {
        case 'MIL_MOVE_FLEET': {
            const fleet = world.movement.fleets.get(payload.fleetId);
            if (!fleet) return;
            if (fleet.factionId !== factionId) {
                console.error(`[Security] Unauthorized MOVE from ${factionId} on fleet ${payload.fleetId} (Owner: ${fleet.factionId})`);
                return;
            }

            // Game rule: a fleet needs at least one ship aboard — or an assigned
            // Admiral — to operate. Empty shells (commission-then-recruit flow)
            // may exist, but movement orders are rejected. This also covers
            // return-to-origin, which reuses MIL_MOVE_FLEET.
            if (!isFleetOperational(fleet)) {
                recordOrderFailure(world, factionId, actionId, 'Fleet has no ships — recruit units first.');
                return;
            }

            // Dedupe: already heading there, or already parked there — no-op.
            if (fleet.destinationSystemId === payload.destinationId) {
                console.log(`[Order] Fleet ${payload.fleetId} already en route to ${payload.destinationId} — duplicate order skipped.`);
                return;
            }
            if (!fleet.destinationSystemId && fleet.currentSystemId === payload.destinationId) {
                console.log(`[Order] Fleet ${payload.fleetId} is already at ${payload.destinationId} — order skipped.`);
                return;
            }

            // changeFleetCourse handles both the parked case (plain move order)
            // and the mid-transit course change (finish current hop, then reroute
            // from that waypoint) — including return-to-origin, which is just a
            // move order targeting the fleet's recorded originSystemId.
            const updated = changeFleetCourse(fleet, payload.destinationId, 'hyperlane', world.movement);
            if (updated === fleet) {
                // Reference unchanged → no route could be plotted; the order had no
                // effect. Surface it instead of deleting it as a silent success.
                recordOrderFailure(world, factionId, actionId, `No route from the fleet's position to the target system.`);
                return;
            }
            world.movement.fleets.set(payload.fleetId, updated);
            if (!fleet.currentSystemId) {
                console.log(`[Order] Fleet ${payload.fleetId} rerouted mid-transit → ${payload.destinationId}.`);
            }
            break;
        }

        case 'MIL_INVASION_PLANET': {
            // payload: { fleetId, planetId, systemId }
            const planet = world.construction.planets.get(payload.planetId);
            const fleet = world.movement.fleets.get(payload.fleetId);
            
            if (!planet || !fleet || fleet.factionId !== factionId) return;
            if (planet.ownerId === factionId) return; // Already owner

            // Orbital Phase 3: a defended orbit has to fall before anything lands.
            // The order still does something useful when it cannot land — the
            // fleet works the orbital layer over — so repeating it grinds the
            // defenses down instead of silently failing.
            if (!isOrbitSuppressed(planet)) {
                const volley = fleet.basePower * ORBITAL_ASSAULT_POWER_FACTOR;
                const result = applyOrbitalDamage(planet, volley);
                console.log(
                    `[Tick Worker] ORBITAL ASSAULT on ${planet.name}: ${Math.round(result.hullDamageApplied)} hull damage, ` +
                    `${Math.round(result.shieldAbsorbed)} absorbed by shields` +
                    (result.destroyedSlotIds.length ? `, ${result.destroyedSlotIds.length} structure(s) destroyed` : '') +
                    (result.orbitControlLost ? ' — ORBIT SUPPRESSED, landing may proceed' : ' — orbit still contested')
                );
                if (!result.orbitControlLost) break;
            }

            // Phase 5: landing troops on someone else's world marks the empire.
            recordPoliticalEvent(world, factionId, 'invade_planet');

            // Phase 16: Initialize or Reinforce Ground Siege
            if (!planet.siege) {
                const defenseState: PlanetaryDefenseState = (planet as any).garrison || {
                    planetId: planet.id,
                    ownerEmpireId: planet.ownerId,
                    garrisonTroops: 500,
                    unitComposition: { INFANTRY: 400, MILITIA: 100 } as any,
                    fortificationLevel: 2,
                    fortificationLayers: { orbitalSuppressed: true, outerDefenses: 100, innerDefenses: 100, commandBunkers: 100 },
                    supply: 1000,
                    maxSupply: 1000,
                    morale: 100,
                    maxMorale: 100,
                    cohesion: 100,
                    maxCohesion: 100,
                    resistance: 10,
                    stability: planet.stability,
                    infrastructureIntegrity: 100,
                    militiaAvailable: true,
                    occupationProgress: 0,
                    isUnderSiege: true
                };

                planet.siege = {
                    siegeId: `siege-${payload.planetId}-${Date.now()}`,
                    planetId: payload.planetId,
                    attackerEmpireId: factionId,
                    defenderEmpireId: planet.ownerId,
                    phase: 'LANDING',
                    tickCount: 0,
                    cycleCount: 0,
                    cycleLengthTicks: 4, // User Choice: 4 ticks
                    currentFrontage: 500,
                    maxFrontage: 1000,
                    attackerState: {
                        siegeId: `siege-${payload.planetId}-${Date.now()}`,
                        attackerEmpireId: factionId,
                        sourceFleetIds: [payload.fleetId],
                        totalLandedTroops: fleet.basePower * 5,
                        reserveTroops: 0,
                        unitComposition: { INFANTRY: fleet.basePower * 4, ARMOR: fleet.basePower * 1 } as any,
                        supply: 1000,
                        maxSupply: 1000,
                        morale: 100,
                        maxMorale: 100,
                        cohesion: 100,
                        maxCohesion: 100,
                        orbitalSupportPower: fleet.basePower,
                        retreatRequested: false,
                        reinforcementQueue: [],
                        occupationControl: 0,
                        devastationCaused: 0
                    },
                    defenderState: defenseState,
                    battleLog: [],
                    lastResolvedCycle: 0,
                    // The ground war is fought on the planet's own 64-district
                    // board: the invasion establishes a beachhead and has to
                    // fight its way inward from there.
                    districts: initDistrictWar(
                        generateSurface(planet.id, planet.planetType, planet.tags),
                        defenseState.fortificationLevel ?? 2,
                        Number.isInteger(payload.landingSector) ? payload.landingSector : null,
                    ),
                };
                // Break both armies into pieces on the board — the invasion is
                // fought district by district from here on.
                {
                    const surf = generateSurface(planet.id, planet.planetType, planet.tags);
                    const war = planet.siege.districts!;
                    war.formations = [
                        ...seedFormations(surf, war, 'attacker', planet.siege.attackerState.unitComposition, `f-a-${world.nowSeconds}`),
                        ...seedFormations(surf, war, 'defender', defenseState.unitComposition, `f-d-${world.nowSeconds}`),
                    ];
                }
                (planet as any).garrison = defenseState;
                const lz = planet.siege.districts?.landingZones ?? [];
                console.log(`[Tick Worker] LANDING on ${planet.name} by ${factionId} — beachhead at district${lz.length > 1 ? 's' : ''} ${lz.join(', ')}`);
            } else if (planet.siege.attackerEmpireId === factionId) {
                // Reinforce
                planet.siege.attackerState.unitComposition.INFANTRY += fleet.basePower * 5;
                planet.siege.attackerState.totalLandedTroops += fleet.basePower * 5;
                console.log(`[Tick Worker] SIEGE REINFORCED on ${planet.name} by ${factionId}`);
            }
            break;
        }

        case 'MIL_MOVE_FORMATION': {
            // payload: { planetId, formationId, sectorIndex, queue?, redeploy? }
            // Orders a piece to march. Nothing moves until the cycle resolves,
            // so both sides commit blind — this is the simultaneous-orders core.
            //   queue    → append a waypoint instead of replacing the order
            //   redeploy → strategic rail move: fast, far, costs organisation
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet?.siege?.districts?.formations) {
                recordOrderFailure(world, factionId, actionId, 'No ground campaign on that world.');
                break;
            }
            const siege = planet.siege;
            const side = siege.attackerEmpireId === factionId ? 'attacker'
                : siege.defenderEmpireId === factionId ? 'defender' : null;
            if (!side) {
                recordOrderFailure(world, factionId, actionId, 'You are not a belligerent here.');
                break;
            }
            const formation = siege.districts.formations.find((f: Formation) => f.id === payload.formationId);
            if (!formation || formation.side !== side) {
                recordOrderFailure(world, factionId, actionId, 'That formation is not yours to command.');
                break;
            }
            const surf = generateSurface(planet.id, planet.planetType, planet.tags);

            if (payload.redeploy) {
                const route = redeployRoute(surf, siege.districts, formation, payload.sectorIndex);
                if (!route) {
                    recordOrderFailure(world, factionId, actionId, 'No friendly rail route to that district.');
                    break;
                }
                formation.path = route;
                formation.redeploying = true;
                formation.moveTo = null;
                formation.planId = null;
                console.log(`[Order] ${factionId} redeploys ${formation.unitType} ${formation.id} to district ${payload.sectorIndex} (${route.length} stages)`);
                break;
            }

            // A queued waypoint extends the march; the legality of later steps
            // is checked when the formation actually gets there.
            if (payload.queue) {
                formation.path = [...(formation.path ?? []), payload.sectorIndex];
                formation.redeploying = false;
                console.log(`[Order] ${factionId} queues ${formation.unitType} ${formation.id} via district ${payload.sectorIndex} (${formation.path.length} waypoints)`);
                break;
            }

            const legal = legalMoves(surf, siege.districts, formation);
            if (!legal.some(o => o.sectorIndex === payload.sectorIndex)) {
                recordOrderFailure(world, factionId, actionId, 'That district is out of reach this cycle.');
                break;
            }
            formation.moveTo = payload.sectorIndex;
            formation.path = [];
            formation.redeploying = false;
            formation.planId = null; // a manual order overrides the plan
            console.log(`[Order] ${factionId} orders ${formation.unitType} ${formation.id} to district ${payload.sectorIndex}`);
            break;
        }

        case 'MIL_BATTLE_PLAN': {
            // payload: { planetId, mode, planId?, objectives?, formationIds? }
            //   mode 'front'    → create a front-line plan to hold
            //   mode 'offensive'→ create an offensive at the given objectives
            //   mode 'assign'   → attach formations to an existing plan
            //   mode 'execute'  → launch it; formations stop preparing and advance
            //   mode 'cancel'   → tear the plan up
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet?.siege?.districts?.formations) {
                recordOrderFailure(world, factionId, actionId, 'No ground campaign on that world.');
                break;
            }
            const siege = planet.siege;
            const side = siege.attackerEmpireId === factionId ? 'attacker'
                : siege.defenderEmpireId === factionId ? 'defender' : null;
            if (!side) {
                recordOrderFailure(world, factionId, actionId, 'You are not a belligerent here.');
                break;
            }
            const war = siege.districts;
            war.plans = war.plans ?? [];
            const surf = generateSurface(planet.id, planet.planetType, planet.tags);
            const ownFormations = (ids?: string[]) => war.formations!.filter((f: Formation) =>
                f.side === side && (!ids?.length || ids.includes(f.id)));

            switch (payload.mode) {
                case 'front':
                case 'offensive': {
                    const plan = createPlan(surf, war, side, payload.mode, payload.objectives ?? [], world.nowSeconds);
                    war.plans.push(plan);
                    for (const f of ownFormations(payload.formationIds)) {
                        f.planId = plan.id;
                        f.moveTo = null;
                        f.path = [];
                    }
                    console.log(`[Order] ${factionId} drafts a ${payload.mode} plan on ${planet.name}`);
                    break;
                }
                case 'assign': {
                    const plan = war.plans.find((p: BattlePlan) => p.id === payload.planId && p.side === side);
                    if (!plan) { recordOrderFailure(world, factionId, actionId, 'No such battle plan.'); break; }
                    for (const f of ownFormations(payload.formationIds)) f.planId = plan.id;
                    break;
                }
                case 'execute': {
                    const plan = war.plans.find((p: BattlePlan) => p.id === payload.planId && p.side === side);
                    if (!plan) { recordOrderFailure(world, factionId, actionId, 'No such battle plan.'); break; }
                    plan.executing = true;
                    console.log(`[Order] ${factionId} executes plan ${plan.id} at ${Math.round(plan.preparation)}% preparation`);
                    break;
                }
                case 'cancel': {
                    war.plans = war.plans.filter((p: BattlePlan) => !(p.id === payload.planId && p.side === side));
                    for (const f of war.formations!) if (f.planId === payload.planId) f.planId = null;
                    break;
                }
                default:
                    recordOrderFailure(world, factionId, actionId, 'Unknown battle-plan mode.');
            }
            break;
        }

        case 'POW_DISPOSE': {
            // payload: { groupId, disposition } — what becomes of prisoners
            // this faction is holding. Every path buys something and costs
            // something: credits, labour, recruits, or reputation.
            const ledger = ensureLedger(world.combat ?? (world.combat = { recruitmentJobs: [] }));
            const group = ledger.groups.find((g: any) => g.id === payload.groupId);
            if (!group) { recordOrderFailure(world, factionId, actionId, 'Those prisoners are no longer in your hands.'); break; }
            if (group.captorEmpireId !== factionId) {
                console.error(`[Security] ${factionId} tried to dispose of prisoners held by ${group.captorEmpireId}`);
                recordOrderFailure(world, factionId, actionId, 'You do not hold those prisoners.');
                break;
            }
            if (group.resolved) { recordOrderFailure(world, factionId, actionId, 'Their fate is already decided.'); break; }

            const valid: PrisonerDisposition[] = ['ransom', 'labour', 'recruit', 'imprison', 'execute'];
            const disposition = payload.disposition as PrisonerDisposition;
            if (!valid.includes(disposition)) { recordOrderFailure(world, factionId, actionId, 'Unknown disposition.'); break; }

            const outcome = resolveDisposition(group, disposition);
            const reserves = world.economy.factions.get(factionId)?.reserves;

            // Imprisonment costs upkeep the captor may not have.
            if (outcome.credits && outcome.credits < 0) {
                if ((reserves?.['CREDITS'] ?? 0) < -outcome.credits) {
                    recordOrderFailure(world, factionId, actionId, `Cannot feed them: need ${-outcome.credits} credits.`);
                    break;
                }
            }
            if (reserves) {
                if (outcome.credits) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + outcome.credits;
                if (outcome.metals) reserves['METALS'] = (reserves['METALS'] ?? 0) + outcome.metals;
            }

            const powPlanet = world.construction.planets.get(group.planetId);
            if (powPlanet) {
                if (outcome.stability) powPlanet.stability = Math.max(0, Math.min(100, (powPlanet.stability ?? 60) + outcome.stability));
                if (outcome.unrest) powPlanet.unrest = Math.max(0, Math.min(100, (powPlanet.unrest ?? 0) + outcome.unrest));
                // Turned prisoners join the garrison as militia.
                if (outcome.recruits && (powPlanet as any).garrison) {
                    const g: any = (powPlanet as any).garrison;
                    g.unitComposition = g.unitComposition || {};
                    g.unitComposition.MILITIA = (g.unitComposition.MILITIA ?? 0) + outcome.recruits;
                    g.garrisonTroops = (g.garrisonTroops ?? 0) + outcome.recruits;
                }
            }

            // Their empire remembers.
            if (outcome.rivalry && group.ownerEmpireId && group.ownerEmpireId !== factionId) {
                try {
                    shiftRivalry(world, factionId, group.ownerEmpireId, outcome.rivalry, 'prisoners_' + disposition);
                } catch { /* diplomacy state not ready — the deed still stands */ }
            }
            if (outcome.infamy) {
                const ps = world.politics?.empires?.get?.(factionId);
                if (ps) ps.infamy = (ps.infamy ?? 0) + outcome.infamy;
            }

            group.resolved = disposition;
            console.log(`[Order] ${factionId} — ${outcome.summary}`);
            break;
        }

        case 'MIL_SET_GROUND_TACTIC': {
            const planet = world.construction.planets.get(payload.planetId);
            if (planet && planet.siege) {
                if (planet.siege.attackerEmpireId === factionId) {
                    planet.siege.attackerState.activeAttackerTactic = payload.tacticId as TacticalStanceId;
                } else if (planet.siege.defenderEmpireId === factionId) {
                    planet.siege.defenderState.activeDefenderTactic = payload.tacticId as TacticalStanceId;
                }
            }
            break;
        }

        case 'MIL_SET_GROUND_PREDICTION': {
            const planet = world.construction.planets.get(payload.planetId);
            if (planet && planet.siege) {
                if (planet.siege.attackerEmpireId === factionId) {
                    planet.siege.attackerState.attackerPrediction = payload.tacticId as TacticalStanceId;
                } else if (planet.siege.defenderEmpireId === factionId) {
                    planet.siege.defenderState.defenderPrediction = payload.tacticId as TacticalStanceId;
                }
            }
            break;
        }

        case 'MIL_LEAVE_SIEGE': {
             const planet = world.construction.planets.get(payload.planetId);
             if (planet && planet.siege && planet.siege.attackerEmpireId === factionId) {
                 console.log(`[Tick Worker] Siege of ${planet.name} ABANDONED by ${factionId}`);
                 planet.siege = null;
             }
             break;
        }

        case 'MIL_BOMBARD_PLANET': {
            // Merged handler (there used to be a second, unreachable duplicate case
            // below). Works with or without an active siege.
            const planet = world.construction.planets.get(payload.targetId || payload.planetId);
            if (!planet) return;
            if (planet.ownerId === factionId) {
                console.warn(`[Security] ${factionId} tried to bombard their own planet ${planet.name}`);
                return;
            }
            // Orbital structures are shot at before the surface is. While the
            // layer holds, shields and hulls soak the volley and the ground gets
            // off comparatively lightly.
            const orbitHeld = !isOrbitSuppressed(planet);
            if (orbitHeld) {
                const bombardFleet = world.movement.fleets.get(payload.fleetId);
                const volley = (bombardFleet?.basePower ?? 100) * ORBITAL_ASSAULT_POWER_FACTOR;
                const orbitResult = applyOrbitalDamage(planet, volley);
                console.log(
                    `[Tick Worker] Bombardment worked the orbital layer of ${planet.name}: ` +
                    `${Math.round(orbitResult.hullDamageApplied)} hull damage` +
                    (orbitResult.orbitControlLost ? ' — ORBIT SUPPRESSED' : '')
                );
            }

            // General orbital bombardment: batter stability, stoke unrest. A
            // standing orbital layer blunts what reaches the surface.
            const surfaceFactor = orbitHeld ? 0.35 : 1;
            planet.stability = Math.max(0, (planet.stability || 60) - 10 * surfaceFactor);
            planet.unrest = Math.min(100, (planet.unrest || 0) + 5 * surfaceFactor);
            // Roads, grids and relays are what bombardment actually breaks. The
            // damage outlives the raid: the network has to be paid back up.
            damageInfrastructure(planet, 6 * surfaceFactor);
            // If we're besieging this planet, bombardment also feeds the ground assault.
            if (planet.siege && planet.siege.attackerEmpireId === factionId) {
                const mode = payload.mode || 'FORTIFICATION';
                planet.siege.attackerState.orbitalSupportPower = 100;
                console.log(`[Tick Worker] Siege bombardment (${mode}) supporting assault on ${planet.name}`);
            }
            console.log(`[Order] Faction ${factionId} bombarded planet ${planet.name}`);
            break;
        }

        case 'MIL_ORBIT_PLANET': {
            // Client-local UX only — no world-state mutation needed.
            // Logged here for audit trail.
            console.log(`[Order] ${factionId} fleet ${payload.fleetId} established orbit around ${payload.planetId}.`);
            break;
        }

        case 'MIL_MOVE_ARMY': {
            // payload: { armyId, targetPlanetId }
            // Real implementation (was a log-only stub): redeploy within the same
            // system directly; cross-system movement requires a transport fleet
            // (embark → move fleet → disembark).
            const army = world.movement.armies?.get(payload.armyId);
            const target = world.construction.planets.get(payload.targetPlanetId);
            if (!army || !target) return;
            if (army.factionId !== factionId) {
                console.error(`[Security] Unauthorized MOVE_ARMY from ${factionId} on army ${payload.armyId} (Owner: ${army.factionId})`);
                return;
            }
            if (army.transportFleetId) {
                console.warn(`[Order] Army ${payload.armyId} is embarked on a fleet — disembark it first.`);
                return;
            }
            const currentPlanet = army.currentPlanetId ? world.construction.planets.get(army.currentPlanetId) : null;
            if (currentPlanet && currentPlanet.systemId !== target.systemId) {
                console.warn(`[Order] Army ${payload.armyId} cannot cross systems on foot — embark it on a fleet.`);
                return;
            }
            army.currentPlanetId = payload.targetPlanetId;
            army.currentSystemId = target.systemId;
            console.log(`[Order] Faction ${factionId} redeployed army ${payload.armyId} to ${target.name}`);
            break;
        }

        case 'MIL_EMBARK_ARMY': {
            // payload: { armyId, fleetId }
            const army = world.movement.armies.get(payload.armyId);
            const fleet = world.movement.fleets.get(payload.fleetId);
            if (army && fleet && army.factionId === factionId && fleet.factionId === factionId) {
                army.transportFleetId = fleet.id;
                army.currentPlanetId = null;
                if (!fleet.transportedArmyIds) fleet.transportedArmyIds = [];
                if (!fleet.transportedArmyIds.includes(army.id)) {
                    fleet.transportedArmyIds.push(army.id);
                }
                console.log(`[Order] Faction ${factionId} embarked army ${payload.armyId} onto fleet ${payload.fleetId}`);
            }
            break;
        }

        case 'MIL_DISEMBARK_ARMY': {
            // payload: { armyId, planetId }
            const army = world.movement.armies.get(payload.armyId);
            if (army && army.factionId === factionId && army.transportFleetId) {
                const fleet = world.movement.fleets.get(army.transportFleetId);
                if (fleet) {
                    fleet.transportedArmyIds = fleet.transportedArmyIds?.filter((id: string) => id !== army.id) || [];
                }
                army.transportFleetId = null;
                army.currentPlanetId = payload.planetId;
                console.log(`[Order] Faction ${factionId} disembarking army ${payload.armyId} to planet ${payload.planetId}`);
            }
            break;
        }
        
        case 'PLANET_CONSTRUCT_BUILDING': {
            // payload: { planetId, systemId, buildingType, sectorIndex? }
            // Creates a REAL tile-backed build order (the old handler pushed a
            // tile-less entry that processConstructionQueue silently discarded,
            // so nothing ever finished). sectorIndex is the 0-63 position on
            // the planet's surface board; legacy/AI callers omit it and get a
            // deterministic auto-placement.
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet) { recordOrderFailure(world, factionId, actionId, 'Planet not found.'); break; }
            if (planet.ownerId !== factionId) {
                console.error(`[Security] Unauthorized BUILD from ${factionId} on planet ${payload.planetId} (Owner: ${planet.ownerId})`);
                // Also surface it: the usual cause is a stale client whose target
                // planet changed hands between the click and this poll.
                recordOrderFailure(world, factionId, actionId, 'Planet is not under your control.');
                break;
            }
            const def = BUILDINGS.find(b => b.id === payload.buildingType);
            if (!def) { recordOrderFailure(world, factionId, actionId, `Unknown building '${payload.buildingType}'.`); break; }

            planet.tiles = Array.isArray(planet.tiles) ? planet.tiles : [];
            planet.buildQueue = Array.isArray(planet.buildQueue) ? planet.buildQueue : [];

            // Requirement gates. The worker is authoritative — the client's
            // catalog filters are advisory and a crafted POST to /api/game/order
            // bypasses them entirely.
            const builderEcon = world.economy.factions.get(factionId);
            if (def.civilizationId && def.civilizationId !== builderEcon?.civilizationId) {
                recordOrderFailure(world, factionId, actionId, 'Building is unique to another civilization.');
                break;
            }
            const unlockedTech = new Set<string>(world.tech.get(factionId)?.unlockedTechIds ?? []);
            if (def.techRequired && !unlockedTech.has(def.techRequired)) {
                recordOrderFailure(world, factionId, actionId, `Technology '${def.techRequired}' required.`);
                break;
            }
            if ((def.infrastructureRequired ?? 0) > (planet.infrastructureLevel ?? 1)) {
                recordOrderFailure(world, factionId, actionId, `Infrastructure level ${def.infrastructureRequired} required.`);
                break;
            }
            if (Array.isArray(def.tagRequirements) && def.tagRequirements.length > 0) {
                const planetTags = new Set<string>(planet.tags ?? []);
                const missingTag = def.tagRequirements.find((t: string) => !planetTags.has(t));
                if (missingTag) {
                    recordOrderFailure(world, factionId, actionId, `Requires planet trait '${missingTag}'.`);
                    break;
                }
            }

            if (def.uniquePerPlanet) {
                const already = planet.tiles.some((t: any) => t.buildingId === def.id && t.constructionState !== 'ruined')
                    || planet.buildQueue.some((q: any) => q.buildingId === def.id);
                if (already) { recordOrderFailure(world, factionId, actionId, `${def.name} is unique per planet.`); break; }
            }

            // Sectors already occupied by tiles or in-flight orders (shared
            // helper — the client draws the board from the same computation,
            // so legacy tiles reserve the same deterministic display slots).
            const surface = generateSurface(planet.id, planet.planetType, planet.tags);
            const occupied = new Set<number>(computeSectorOccupancy(planet, surface).keys());

            let sectorIdx: number | null = Number.isInteger(payload.sectorIndex) ? payload.sectorIndex : null;
            if (sectorIdx !== null) {
                if (sectorIdx < 0 || sectorIdx >= SURFACE_SECTOR_COUNT) {
                    recordOrderFailure(world, factionId, actionId, 'Invalid sector.'); break;
                }
                if (occupied.has(sectorIdx)) {
                    recordOrderFailure(world, factionId, actionId, 'Sector is already developed.'); break;
                }
                const sector = surface.sectors[sectorIdx];
                const oceanCapable = /naval|port|harbor|fish/i.test(def.id);
                if (sector.terrain === 'ocean' && !oceanCapable) {
                    recordOrderFailure(world, factionId, actionId, 'Cannot build on open ocean.'); break;
                }
            } else {
                sectorIdx = autoPlaceBuilding(surface, def.id, occupied);
                if (sectorIdx === null) {
                    recordOrderFailure(world, factionId, actionId, 'No free sector on the surface.'); break;
                }
            }

            // Charge the building cost from faction reserves (manpower has no
            // reserve pool yet and is not charged).
            const reserves = builderEcon?.reserves;
            if (!reserves) { recordOrderFailure(world, factionId, actionId, 'Faction economy not found.'); break; }
            const costPairs: Array<[number | undefined, string]> = [
                [def.cost.metals, 'METALS'],
                [def.cost.chemicals, 'CHEMICALS'],
                [def.cost.food, 'FOOD'],
                [def.cost.credits, 'CREDITS'],
                [def.cost.energy, 'ENERGY'],
                [def.cost.rares, 'RARES'],
            ];
            const short = costPairs.find(([amt, key]) => (amt ?? 0) > 0 && (reserves[key] ?? 0) < (amt ?? 0));
            if (short) {
                recordOrderFailure(world, factionId, actionId, `Insufficient ${short[1].toLowerCase()}: need ${short[0]}.`);
                break;
            }
            for (const [amt, key] of costPairs) {
                if ((amt ?? 0) > 0) reserves[key] = (reserves[key] ?? 0) - (amt as number);
            }

            // Create the sector's tile, then hand off to the canonical
            // startConstruction so build time honours the construction-speed
            // model (infrastructure, logistics congestion, speed modifiers) —
            // the same formula repairs already use.
            const tileId = `${planet.id}-s${sectorIdx}`;
            planet.tiles.push({
                tileId,
                districtType: 'any',
                buildingId: null,
                constructionState: 'empty',
                constructionCompleteAt: null,
                sectorIndex: sectorIdx,
            });
            const started = startConstruction(planet, tileId, def.id, world.nowSeconds);
            if (!started.success) {
                // Roll back: refund the charge, drop the placeholder tile.
                for (const [amt, key] of costPairs) {
                    if ((amt ?? 0) > 0) reserves[key] = (reserves[key] ?? 0) + (amt as number);
                }
                planet.tiles = planet.tiles.filter((t: any) => t.tileId !== tileId);
                recordOrderFailure(world, factionId, actionId, started.error ?? 'Construction failed.');
                break;
            }
            const queued = planet.buildQueue.find((q: any) => q.tileId === tileId);
            if (queued) (queued as any).sectorIndex = sectorIdx;
            console.log(`[Order] ${factionId} building ${def.id} on ${planet.id} sector ${sectorIdx}`);
            break;
        }

        case 'PLANET_SET_SPECIALIZATION': {
            // payload: { planetId, specializationId }
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet) { recordOrderFailure(world, factionId, actionId, 'Planet not found.'); break; }
            if (planet.ownerId !== factionId) {
                console.error(`[Security] Unauthorized SPECIALIZATION from ${factionId} on planet ${payload.planetId} (Owner: ${planet.ownerId})`);
                break;
            }

            const specCheck = canDeclareSpecialization(planet, payload.specializationId, world.nowSeconds, world);
            if (!specCheck.allowed) {
                recordOrderFailure(world, factionId, actionId, specCheck.reason ?? 'Cannot specialize.');
                break;
            }

            const specReserves = world.economy.factions.get(factionId)?.reserves;
            const specCost = specCheck.cost ?? 0;
            if (specCost > 0 && (specReserves?.['CREDITS'] ?? 0) < specCost) {
                recordOrderFailure(world, factionId, actionId, `Insufficient credits: need ${specCost}.`);
                break;
            }

            const declared = declareSpecialization(planet, payload.specializationId, world.nowSeconds, world);
            if (!declared.success) {
                recordOrderFailure(world, factionId, actionId, declared.error ?? 'Declaration failed.');
                break;
            }
            if (specReserves && specCost > 0) specReserves['CREDITS'] -= specCost;
            console.log(`[Tick Worker] ${planet.name} declared as ${planet.specialization}` +
                `${specCheck.isSwitch ? ' (retooled)' : ''} for ${specCost} credits`);
            break;
        }

        case 'PLANET_CLEAR_SPECIALIZATION': {
            // payload: { planetId }
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet || planet.ownerId !== factionId) break;
            const previous = planet.specialization;
            if (clearSpecialization(planet, world.nowSeconds)) {
                console.log(`[Tick Worker] ${planet.name} abandoned its ${previous} role`);
            } else {
                recordOrderFailure(world, factionId, actionId,
                    'Cannot abandon the role yet — the world is still under its retooling lockout.');
            }
            break;
        }

        case 'INFRA_UPGRADE_TRACK': {
            // payload: { planetId, trackId }
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet) { recordOrderFailure(world, factionId, actionId, 'Planet not found.'); break; }
            if (planet.ownerId !== factionId) {
                console.error(`[Security] Unauthorized INFRA upgrade from ${factionId} on planet ${payload.planetId} (Owner: ${planet.ownerId})`);
                break;
            }
            if (!INFRASTRUCTURE_TRACK_IDS.includes(payload.trackId)) {
                recordOrderFailure(world, factionId, actionId, `Unknown infrastructure track '${payload.trackId}'.`);
                break;
            }

            const check = canUpgradeTrack(planet, payload.trackId);
            if (!check.allowed) {
                recordOrderFailure(world, factionId, actionId, check.reason ?? 'Upgrade not allowed.');
                break;
            }

            // Credits come from the treasury; materials come off the planet's own
            // stockpile, so a blockaded world cannot build its way out.
            const cost = check.cost!;
            const reserves = world.economy.factions.get(factionId)?.reserves;
            const econPlanet = world.economy.planets.get(payload.planetId);
            if ((cost.credits ?? 0) > 0 && (reserves?.['CREDITS'] ?? 0) < (cost.credits ?? 0)) {
                recordOrderFailure(world, factionId, actionId, `Insufficient credits: need ${cost.credits}.`);
                break;
            }
            const materialKeys = ['metals', 'chemicals', 'food', 'energy'] as const;
            const shortfall = materialKeys.find(k => (cost[k] ?? 0) > 0 && (econPlanet?.stockpile[k] ?? 0) < (cost[k] ?? 0));
            if (shortfall) {
                recordOrderFailure(world, factionId, actionId,
                    `Insufficient ${shortfall} on ${planet.name}: need ${cost[shortfall]}.`);
                break;
            }

            const started = startTrackUpgrade(planet, payload.trackId, world.nowSeconds);
            if (!started.success) {
                recordOrderFailure(world, factionId, actionId, started.error ?? 'Upgrade failed.');
                break;
            }
            if (reserves && (cost.credits ?? 0) > 0) reserves['CREDITS'] -= cost.credits ?? 0;
            if (econPlanet) {
                for (const k of materialKeys) {
                    if ((cost[k] ?? 0) > 0) econPlanet.stockpile[k] = (econPlanet.stockpile[k] ?? 0) - (cost[k] ?? 0);
                }
            }
            console.log(`[Tick Worker] ${planet.name}: ${payload.trackId} upgrade started, completes at ${started.completesAtSeconds}`);
            break;
        }

        case 'INFRA_CANCEL_TRACK': {
            // payload: { planetId, trackId }
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet || planet.ownerId !== factionId) break;
            if (cancelTrackUpgrade(planet, payload.trackId)) {
                console.log(`[Tick Worker] ${planet.name}: ${payload.trackId} upgrade abandoned (no refund)`);
            }
            break;
        }

        case 'ORBITAL_CONSTRUCT': {
            // payload: { planetId, structureId }
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet) return;
            if (planet.ownerId !== factionId) {
                console.error(`[Security] Unauthorized ORBITAL build from ${factionId} on planet ${payload.planetId} (Owner: ${planet.ownerId})`);
                return;
            }
            const def = ORBITAL_STRUCTURE_BY_ID[payload.structureId];
            if (!def) {
                console.error(`[Tick Worker] Unknown orbital structure '${payload.structureId}'`);
                return;
            }
            const unlocked = new Set<string>(world.tech.get(factionId)?.unlockedTechIds ?? []);
            const result = startOrbitalConstruction(planet, payload.structureId, world.nowSeconds, unlocked);
            if (!result.success) {
                console.warn(`[Tick Worker] Orbital build rejected on ${planet.name}: ${result.error}`);
                return;
            }
            console.log(`[Tick Worker] ${def.name} laid down in orbit of ${planet.name} (slot ${result.order?.slotId})`);
            break;
        }

        case 'ORBITAL_CANCEL': {
            // payload: { planetId, slotId }
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet || planet.ownerId !== factionId) return;
            if (cancelOrbitalConstruction(planet, payload.slotId)) {
                console.log(`[Tick Worker] Orbital construction cancelled on ${planet.name} slot ${payload.slotId}`);
            }
            break;
        }

        case 'ORBITAL_DEMOLISH': {
            // payload: { planetId, slotId }
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet || planet.ownerId !== factionId) return;
            const orbital = ensureOrbitalState(planet);
            const slot = orbital.slots.find(s => s.slotId === payload.slotId);
            if (!slot || slot.state === 'empty' || slot.state === 'under_construction') return;
            const removed = slot.structureId;
            slot.structureId = null;
            slot.state = 'empty';
            slot.integrity = 100;
            slot.completesAt = null;
            console.log(`[Tick Worker] ${removed} scrapped in orbit of ${planet.name}`);
            break;
        }

        case 'PLANET_SET_LOGISTICS_PRIORITY': {
            // payload: { planetId, priority }
            const planet = world.economy.planets.get(payload.planetId);
            if (!planet) return;
            if (planet.factionId !== factionId) {
                console.error(`[Security] Unauthorized LOGISTICS priority from ${factionId} on planet ${payload.planetId} (Owner: ${planet.factionId})`);
                return;
            }
            if (!LOGISTICS_PRIORITIES.includes(payload.priority)) {
                console.error(`[Tick Worker] Unknown logistics priority '${payload.priority}' for planet ${payload.planetId}`);
                return;
            }
            planet.logisticsPriority = payload.priority;
            console.log(`[Tick Worker] Planet ${payload.planetId} logistics priority set to ${payload.priority}`);
            break;
        }

        case 'PLANET_UPGRADE_BUILDING': {
             // payload: { buildingId }
             // Find building and increment level
             console.log(`[Order] Faction ${factionId} upgrading building ${payload.buildingId}`);
             break;
        }

        case 'PLANET_REPAIR_BUILDING': {
             // payload: { buildingId }
             console.log(`[Order] Faction ${factionId} repairing building ${payload.buildingId}`);
             break;
        }

        // NOTE: PLANET_RECRUIT_UNITS is handled further down. A stub case here
        // used to SHADOW the real handler (first matching case wins in a switch),
        // which made all army recruitment silently do nothing.

        case 'TECH_START_RESEARCH': {
            const techState = world.tech.get(factionId);
            if (techState) {
                try {
                    const emptySlot = techState.activeSlots.find((s: any) => s.status === 'empty' || s.techId === null);
                    if (emptySlot) {
                        const newState = TechEngine.assignResearch(techState, emptySlot.slotId, payload.techId, world.nowSeconds);
                        world.tech.set(factionId, newState);
                    }
                } catch (e: any) {
                    console.error(`[Tick Worker] Tech start failed:`, e.message);
                }
            }
            break;
        }

        // Legacy id kept so older clients keep working; both routes now go
        // through the political-capital gate in the policy service.
        case 'IDEO_ENACT_POLICY':
        case 'GOV_ENACT_POLICY': {
            try {
                const result = enactPolicy(world, factionId, payload.policyId);
                if (!result.ok) {
                    recordOrderFailure(world, factionId, actionId, result.message ?? 'Policy rejected.');
                    break;
                }
                console.log(result.tabled
                    ? `[Order] ${factionId} tabled policy ${payload.policyId} before the chamber (${result.cost} political capital)`
                    : `[Order] ${factionId} enacted policy ${payload.policyId} for ${result.cost} political capital`);
            } catch (e: any) {
                console.error(`[Tick Worker] Policy enact failed:`, e.message);
                recordOrderFailure(world, factionId, actionId, 'Policy could not be enacted.');
            }
            break;
        }

        case 'GOV_LOBBY_PARTY': {
            // payload: { billId, partyId }
            const result = lobbyParty(world, factionId, payload.billId, payload.partyId);
            if (!result.ok) {
                recordOrderFailure(world, factionId, actionId, result.message ?? 'Lobbying rejected.');
                break;
            }
            console.log(`[Order] ${factionId} whipped ${payload.partyId} — projected support ${Math.round(result.projectedSupport ?? 0)}%`);
            break;
        }

        case 'GOV_DECREE_POLICY': {
            // payload: { policyId } — rule past the chamber.
            const result = decreePolicy(world, factionId, payload.policyId);
            if (!result.ok) {
                recordOrderFailure(world, factionId, actionId, result.message ?? 'Decree rejected.');
                break;
            }
            console.log(`[Order] ${factionId} decreed ${payload.policyId} for ${result.cost} political capital`);
            break;
        }

        case 'GOV_PURGE_OFFICERS': {
            const result = purgeOfficers(world, factionId);
            if (!result.ok) {
                recordOrderFailure(world, factionId, actionId, result.message ?? 'Purge rejected.');
                break;
            }
            recordPoliticalEvent(world, factionId, 'purge_officers');
            console.log(`[Order] ${factionId} purged the officer corps — coup pressure now ${Math.round(result.pressure ?? 0)}`);
            break;
        }

        case 'GOV_ANSWER_DEFIANCE': {
            // payload: { eventId, response }
            const result = answerDefiance(world, factionId, payload.eventId, payload.response);
            if (!result.ok) {
                recordOrderFailure(world, factionId, actionId, result.message ?? 'Response rejected.');
                break;
            }
            console.log(`[Order] ${factionId} answered defiance ${payload.eventId} with ${payload.response}: ${result.outcome}`);
            break;
        }

        case 'DIP_RECOGNIZE_BREAKAWAY': {
            // payload: { rebelFactionId }
            const result = recognizeBreakaway(world, factionId, payload.rebelFactionId);
            if (!result.ok) {
                recordOrderFailure(world, factionId, actionId, result.message ?? 'Recognition rejected.');
                break;
            }
            console.log(`[Order] ${result.outcome}`);
            break;
        }

        case 'DIP_GUARANTEE_BREAKAWAY': {
            // payload: { rebelFactionId }
            const result = guaranteeBreakaway(world, factionId, payload.rebelFactionId);
            if (!result.ok) {
                recordOrderFailure(world, factionId, actionId, result.message ?? 'Guarantee rejected.');
                break;
            }
            console.log(`[Order] ${result.outcome}`);
            break;
        }

        case 'GOV_GRANT_CONCESSION': {
            // payload: { crisisId, demandId }
            const result = grantConcession(world, factionId, payload.crisisId, payload.demandId);
            if (!result.ok) {
                recordOrderFailure(world, factionId, actionId, result.message ?? 'Concession rejected.');
                break;
            }
            console.log(`[Order] ${factionId} conceded ${payload.demandId}: ${result.outcome}`);
            break;
        }

        case 'GOV_SUPPRESS_SECESSION': {
            // payload: { crisisId }
            const result = suppressSecession(world, factionId, payload.crisisId);
            if (!result.ok) {
                recordOrderFailure(world, factionId, actionId, result.message ?? 'Suppression rejected.');
                break;
            }
            console.log(`[Order] ${factionId} moved against ${payload.crisisId}: ${result.outcome}`);
            break;
        }

        case 'GOV_APPOINT_MINISTER': {
            // payload: { portfolio, leaderId }
            if (!spendPoliticalCapital(world, factionId, APPOINT_MINISTER_COST, 'cabinet appointment')) {
                recordOrderFailure(world, factionId, actionId, `Appointment needs ${APPOINT_MINISTER_COST} political capital.`);
                break;
            }
            const result = appointMinister(world, factionId, payload.portfolio, payload.leaderId);
            if (!result.ok) {
                recordOrderFailure(world, factionId, actionId, result.message ?? 'Appointment rejected.');
                break;
            }
            console.log(`[Order] ${factionId} appointed ${payload.leaderId} to ${payload.portfolio}`);
            break;
        }

        case 'GOV_DISMISS_MINISTER': {
            // payload: { portfolio }
            if (!spendPoliticalCapital(world, factionId, DISMISS_MINISTER_COST, 'cabinet dismissal')) {
                recordOrderFailure(world, factionId, actionId, `Dismissal needs ${DISMISS_MINISTER_COST} political capital.`);
                break;
            }
            const result = dismissMinister(world, factionId, payload.portfolio);
            if (!result.ok) {
                recordOrderFailure(world, factionId, actionId, result.message ?? 'Dismissal rejected.');
                break;
            }
            console.log(`[Order] ${factionId} dismissed the ${payload.portfolio} minister`);
            break;
        }

        case 'GOV_APPOINT_GOVERNOR': {
            // payload: { planetId, leaderId }
            if (!spendPoliticalCapital(world, factionId, APPOINT_GOVERNOR_COST, 'governor appointment')) {
                recordOrderFailure(world, factionId, actionId, `Appointment needs ${APPOINT_GOVERNOR_COST} political capital.`);
                break;
            }
            const result = appointGovernor(world, factionId, payload.planetId, payload.leaderId);
            if (!result.ok) {
                recordOrderFailure(world, factionId, actionId, result.message ?? 'Appointment rejected.');
                break;
            }
            console.log(`[Order] ${factionId} appointed ${payload.leaderId} governor of ${payload.planetId}`);
            break;
        }

        case 'GOV_REPEAL_POLICY': {
            try {
                const result = repealPolicy(world, factionId, payload.policyId);
                if (!result.ok) {
                    recordOrderFailure(world, factionId, actionId, result.message ?? 'Repeal rejected.');
                    break;
                }
                console.log(`[Order] ${factionId} repealed policy ${payload.policyId} for ${result.cost} political capital`);
            } catch (e: any) {
                console.error(`[Tick Worker] Policy repeal failed:`, e.message);
                recordOrderFailure(world, factionId, actionId, 'Policy could not be repealed.');
            }
            break;
        }

        case 'DIP_DECLARE_WAR': {
             // Public support is read BEFORE the war state lands so the rivalry
             // score still reflects the pre-war standoff ("was this justified?").
             evaluateSupportAndApply(world, factionId, 'declare_war', payload.targetFactionId);
             // Central war path: NAP auto-break (oathbreaker penalty), collapse
             // of treaties/pacts between the pair, mutual-defense allies join.
             registerActOfWar(world, factionId, payload.targetFactionId);
             // Phase 5: what an empire does reshapes what it becomes.
             recordPoliticalEvent(world, factionId, 'declare_war');
             console.log(`[Order] Faction ${factionId} declared War on ${payload.targetFactionId}`);
             break;
        }

        case 'DIP_SEND_ENVOY': {
             shiftRivalry(world, factionId, payload.targetFactionId, -15, 'envoy_received');
             console.log(`[Order] Faction ${factionId} sent Envoy to ${payload.targetFactionId}`);
             break;
        }

        case 'DIP_OFFER_PEACE': {
             // Peace now requires the enemy's consent — this queues an offer.
             const result = createOffer(world, factionId, { kind: 'peace_offer', toFactionId: payload.targetFactionId });
             if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
             else {
                 evaluateSupportAndApply(world, factionId, 'offer_peace', payload.targetFactionId);
                 recordPoliticalEvent(world, factionId, 'offer_peace');
                 console.log(`[Order] ${factionId} sued for peace with ${payload.targetFactionId}`);
             }
             break;
        }

        case 'DIP_RESPOND_OFFER': {
             const response = payload.response === 'accept' ? 'accept' : 'reject';
             const result = respondToOffer(world, factionId, payload.offerId, response);
             if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
             else console.log(`[Order] ${factionId} ${response}ed offer ${payload.offerId}`);
             break;
        }

        case 'DIP_WITHDRAW_OFFER': {
             const result = withdrawOffer(world, factionId, payload.offerId);
             if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
             break;
        }

        case 'DIP_BREAK_TREATY': {
             const result = breakTreaty(world, factionId, payload.treatyId);
             if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
             else {
                 evaluateSupportAndApply(world, factionId, 'break_treaty');
                 recordPoliticalEvent(world, factionId, 'break_treaty');
                 console.log(`[Order] ${factionId} broke treaty ${payload.treatyId}`);
             }
             break;
        }

        case 'DIP_LAUNCH_GAMBIT': {
             const result = launchGambit(world, factionId, {
                 kind: payload.kind,
                 targetId: payload.targetFactionId,
                 prediction: payload.prediction,
                 demandCredits: payload.demandCredits,
                 spendLeverage: payload.spendLeverage,
             });
             if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
             else {
                 const supportKind = payload.kind === 'espionage_accusation' ? 'accusation' : payload.kind;
                 evaluateSupportAndApply(world, factionId, supportKind, payload.targetFactionId);
                 console.log(`[Order] ${factionId} launched ${payload.kind} gambit vs ${payload.targetFactionId}`);
             }
             break;
        }

        case 'DIP_RESPOND_GAMBIT': {
             const result = respondToGambit(world, factionId, payload.gambitId, payload.response);
             if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
             break;
        }

        case 'DIP_IMPOSE_SANCTIONS': {
             const result = imposeSanctions(world, factionId, payload.targetFactionId);
             if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
             else {
                 evaluateSupportAndApply(world, factionId, 'sanctions', payload.targetFactionId);
                 console.log(`[Order] ${factionId} imposed sanctions on ${payload.targetFactionId}`);
             }
             break;
        }

        case 'DIP_LIFT_SANCTIONS': {
             const result = liftSanctions(world, factionId, payload.targetFactionId);
             if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
             else console.log(`[Order] ${factionId} lifted sanctions on ${payload.targetFactionId}`);
             break;
        }

        case 'DIP_MAKE_PROMISE': {
             const result = makePromise(world, factionId, {
                 kind: payload.kind,
                 beneficiaryId: payload.targetFactionId,
                 amount: payload.amount,
                 durationSeconds: payload.durationHours ? payload.durationHours * 3600 : undefined,
             });
             if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
             else console.log(`[Order] ${factionId} promised ${payload.kind} to ${payload.targetFactionId}`);
             break;
        }

        case 'DIP_FULFILL_PROMISE': {
             const result = fulfillPromise(world, factionId, payload.promiseId);
             if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
             else console.log(`[Order] ${factionId}: ${result.message}`);
             break;
        }

        case 'DIP_INTERVENE': {
             const result = intervene(world, factionId, payload.windowId, payload.stance);
             if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
             else console.log(`[Order] ${factionId} intervened (${payload.stance}) in ${payload.windowId}`);
             break;
        }

        case 'DIP_PLANT_RUMOR': {
             const result = plantRumor(world, factionId, payload.targetFactionId);
             if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
             else console.log(`[Order] ${factionId} planted a rumor about ${payload.targetFactionId}`);
             break;
        }

        case 'LEADER_RECRUIT': {
              LeadershipService.recruitLeader(world, payload.leaderId, factionId);
              break;
        }

        case 'LEADER_ASSIGN': {
              const leader = world.leadership.leaders.get(payload.leaderId);
              if (leader && leader.factionId === factionId) {
                  LeadershipService.assignLeader(world, payload.leaderId, payload.assignmentId);
              } else {
                  console.error(`[Security] Unauthorized LEADER_ASSIGN from ${factionId} on leader belonging to ${leader?.factionId}`);
              }
              break;
        }

        case 'SHIP_DESIGN_SAVE': {
            if (!world.shipDesigns) world.shipDesigns = new Map();
            const designId = payload.design.id || `design-${factionId}-${Date.now()}`;
            world.shipDesigns.set(designId, { 
                ...payload.design, 
                id: designId, 
                factionId 
            });
            console.log(`[Tick Worker] Saved Ship Design ${designId} for ${factionId}`);
            break;
        }

        case 'ESP_LAUNCH_OP': {
            // Client sends `investment`/`risk` (see launchCovertOpAction); older
            // callers sent `investmentLevel`/`riskLevel` — accept both.
            launchOperation(
                factionId,
                payload.targetFactionId,
                payload.targetRegionId,
                payload.domain,
                payload.investment ?? payload.investmentLevel ?? 0.5,
                payload.risk ?? payload.riskLevel ?? 0.5,
                world
            );
            console.log(`[Tick Worker] Launched Espionage Op for ${factionId}`);
            break;
        }

        case 'ESP_ASSIGN_AGENT': {
            const agent = world.espionage.agents.get(payload.agentId);
            if (agent && agent.ownerFactionId === factionId) {
                deployAgent(agent, payload.systemId, payload.domain, world);
                console.log(`[Tick Worker] Deployed Agent ${agent.codename} to ${payload.systemId}`);
            }
            break;
        }

        case 'ESP_RECRUIT_AGENT': {
            const candidate = payload.candidate;
            if (!candidate?.id || !Array.isArray(candidate.traitIds)) {
                recordOrderFailure(world, factionId, actionId, 'Malformed recruit candidate.');
                return;
            }
            // Cost varies per candidate, so it bypasses the static cost gate.
            const reserves = world.economy?.factions?.get?.(factionId)?.reserves;
            const cost = Math.max(0, Number(candidate.recruitmentCost) || 0);
            if (reserves && (reserves.CREDITS ?? 0) < cost) {
                recordOrderFailure(world, factionId, actionId, `Recruiting ${candidate.codename} costs ${cost} credits.`);
                return;
            }
            if (reserves) reserves.CREDITS = (reserves.CREDITS ?? 0) - cost;
            const agent = recruitAgent(candidate, factionId, world.nowSeconds, world);
            console.log(`[Tick Worker] Recruited Agent ${agent.codename} for ${factionId}`);
            break;
        }

        case 'ESP_RECALL_AGENT': {
            const agent = world.espionage.agents.get(payload.agentId);
            if (agent && agent.ownerFactionId === factionId) {
                recallAgent(agent, world);
                console.log(`[Tick Worker] Recalled Agent ${agent.codename} for ${factionId}`);
            }
            break;
        }

        case 'ESP_SEIZE_OPPORTUNITY': {
            const result = seizeOpportunity(factionId, payload.opportunityId, world);
            if (!result.success) {
                recordOrderFailure(world, factionId, actionId, result.message);
                return;
            }
            console.log(`[Tick Worker] ${factionId}: ${result.message}`);
            break;
        }

        case 'PLANET_RECRUIT_UNITS': {
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet) return;
            
            // Military facility check (Simplified requirement for Phase 16).
            // Basic troops (INFANTRY, MILITIA) can always be raised — fresh
            // colonies have no barracks, and blocking their only recruitment
            // option made the button feel broken. Specialized units still
            // require a military facility.
            const BASIC_UNITS = ['MILITIA', 'INFANTRY'];
            const hasMilitaryFacility = planet.tiles.some((t: any) =>
                (t.buildingId === 'barracks' || t.buildingId === 'tank_foundry' || t.buildingId === 'military_academy')
                && t.constructionState === 'active'
            );

            if (!hasMilitaryFacility && !BASIC_UNITS.includes(payload.unitType)) {
                console.warn(`[Order] ${factionId} needs a barracks/foundry on ${payload.planetId} to recruit ${payload.unitType} — order skipped.`);
                return;
            }

            const job = RecruitmentService.createJob(
                payload.planetId,
                factionId,
                payload.unitType as GroundUnitType,
                payload.count,
                world.nowSeconds
            );
            if (!world.combat) world.combat = {};
            if (!world.combat.recruitmentJobs) world.combat.recruitmentJobs = [];
            world.combat.recruitmentJobs.push(job);
            console.log(`[Order] Faction ${factionId} recruiting ${payload.count}x ${payload.unitType} on ${payload.planetId}`);
            break;
        }

        case 'ESP_INFILTRATE_NETWORK': {
             const networkId = `net-${factionId}-${payload.targetId}`;
             if (!world.espionage.intelNetworks) world.espionage.intelNetworks = new Map();
             world.espionage.intelNetworks.set(networkId, {
                 id: networkId,
                 ownerFactionId: factionId,
                 targetFactionId: payload.targetId,
                 intelLevel: 10,
                 networkStrength: 1.0,
                 isDetected: false
             });
             console.log(`[Order] Faction ${factionId} infiltrated network of ${payload.targetId}`);
             break;
        }

        case 'ESP_SABOTAGE_FACILITY': {
             // In a full impl, damage building state. For now, log.
             console.log(`[Order] Faction ${factionId} sabotaged building ${payload.targetBuildingId}`);
             break;
        }

        case 'ESP_STEAL_TECHNOLOGY': {
             console.log(`[Order] Faction ${factionId} attempting to steal tech from ${payload.targetFactionId}`);
             break;
        }

        case 'ESP_INCITE_UNREST': {
             const planet = world.construction.planets.get(payload.targetPlanetId);
             if (planet) {
                 planet.unrest = Math.min(100, (planet.unrest || 0) + 20);
                 console.log(`[Order] Faction ${factionId} incited unrest on ${planet.name}`);
             }
             break;
        }

        case 'PRESS_SUPPRESS_STORY': {
            if (world.press) {
                const pub = world.press.publishedStories.find((p: any) => p.storyId === payload.storyId);
                if (pub) {
                    pub.viralFactor = Math.max(0, pub.viralFactor - 0.5); // Suppress propagation speed
                    recordPoliticalEvent(world, factionId, 'suppress_press');
                    console.log(`[Tick Worker] Suppressed Story ${payload.storyId} by ${factionId}`);
                }
            }
            break;
        }

        case 'PRESS_INFLUENCE_NARRATIVE': {
            if (world.press) {
                const pub = world.press.publishedStories.find((p: any) => p.storyId === payload.storyId);
                if (pub) {
                    pub.viralFactor = Math.min(2.0, pub.viralFactor + 0.5); // Accelerate propagation
                    console.log(`[Tick Worker] Influenced Narrative ${payload.storyId} by ${factionId}`);
                }
            }
            break;
        }

        case 'PRESS_RESOLVE_CRISIS': {
            // payload: { crisisId, choice }
            const press = ensurePressState(world);
            const crisis = press.crises.get(payload.crisisId);
            if (!crisis) {
                recordOrderFailure(world, factionId, actionId, 'Media crisis not found — it may have already expired.');
                return;
            }
            if (crisis.targetEmpireId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'This crisis targets another empire.');
                return;
            }
            if (crisis.resolved) {
                recordOrderFailure(world, factionId, actionId, 'Crisis already resolved.');
                return;
            }
            if (!Object.values(CrisisChoice).includes(payload.choice)) {
                recordOrderFailure(world, factionId, actionId, `Unknown crisis response '${payload.choice}'.`);
                return;
            }
            const empire = press.empires.get(factionId);
            if (!empire) {
                recordOrderFailure(world, factionId, actionId, 'Press state missing for your empire.');
                return;
            }
            const story = press.activeStories.get(crisis.storyId);
            const result = resolveCrisis(crisis, payload.choice, empire, story);
            Object.assign(empire, result.empireDelta);
            crisis.resolved = true;
            crisis.choiceMade = payload.choice;
            crisis.outcome = result.outcome;
            // Phase 3 of the crisis mini-game: rivals who called this exact
            // response release their pre-positioned evidence for extra damage.
            const winners = applyPredictionPayouts(crisis, payload.choice, press.empires);
            if (winners.length > 0) {
                crisis.outcome += ` Rival networks anticipated the response (${winners.join(', ')}).`;
            }
            console.log(`[Tick Worker] Crisis ${crisis.id} resolved by ${factionId} via ${payload.choice}: ${crisis.outcome}`);
            break;
        }

        case 'PRESS_TOGGLE_QUARANTINE': {
            // payload: { systemId } — propagation keys press planets as planet_${systemId}
            const press = ensurePressState(world);
            const systemId = String(payload.systemId ?? '');
            const planetId = `planet_${systemId}`;
            const pressPlanet = press.planets.get(planetId);
            if (!pressPlanet || pressPlanet.ownerId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'You can only quarantine systems you control.');
                return;
            }
            if (press.quarantinedPlanets.has(planetId)) press.quarantinedPlanets.delete(planetId);
            else press.quarantinedPlanets.add(planetId);
            break;
        }

        case 'PRESS_TOGGLE_JAM': {
            // payload: { systemId }
            // Coerce to string: Sets key by identity, so a numeric systemId would
            // add an entry that the string-keyed propagation check never matches
            // and a later toggle never removes.
            const press = ensurePressState(world);
            const systemId = String(payload.systemId ?? '');
            const pressPlanet = press.planets.get(`planet_${systemId}`);
            if (!pressPlanet || pressPlanet.ownerId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'You can only jam signals in systems you control.');
                return;
            }
            if (press.jammedSystems.has(systemId)) press.jammedSystems.delete(systemId);
            else press.jammedSystems.add(systemId);
            break;
        }

        case 'PRESS_DEPLOY_COUNTER_NARRATIVE': {
            // payload: { systemId }
            const press = ensurePressState(world);
            const systemId = String(payload.systemId ?? '');
            const pressPlanet = press.planets.get(`planet_${systemId}`);
            if (!pressPlanet || pressPlanet.ownerId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'You can only run counter-narratives in systems you control.');
                return;
            }
            press.counterNarratives.set(systemId, 100);
            break;
        }

        case 'PRESS_SEED_STORY': {
            // payload: { storyId, systemId } — plant an active story's epicenter anywhere.
            const press = ensurePressState(world);
            const story = press.activeStories.get(payload.storyId);
            if (!story) {
                recordOrderFailure(world, factionId, actionId, 'Story not found in the active pool.');
                return;
            }
            const planetId = `planet_${String(payload.systemId ?? '')}`;
            if (!press.planets.has(planetId)) {
                recordOrderFailure(world, factionId, actionId, 'Target system has no press audience.');
                return;
            }
            press.publishedStories.push({
                id: `pub_${world.nowSeconds}_${story.id}`,
                storyId: story.id,
                publisherId: `${factionId}_SEED`,
                tickPublished: press.tick,
                viralFactor: story.baseMagnitude / 100,
                originPlanetId: planetId,
                transmissionMap: new Map([[planetId, 100]]),
                jammedSystems: new Set(),
            });
            break;
        }

        case 'PRESS_INV_COOPERATE':
        case 'PRESS_INV_OBSTRUCT':
        case 'PRESS_INV_SACRIFICE_OFFICIAL':
        case 'PRESS_INV_PUBLISH_FIRST': {
            // payload: { investigationId }
            const press = ensurePressState(world);
            const inv = press.investigations.get(payload.investigationId);
            if (!inv) {
                recordOrderFailure(world, factionId, actionId, 'Investigation not found — it may have concluded.');
                return;
            }
            if (inv.targetEmpireId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'This investigation targets another empire.');
                return;
            }
            if (inv.resolved) {
                recordOrderFailure(world, factionId, actionId, 'Investigation already concluded.');
                return;
            }
            const empire = press.empires.get(factionId);
            if (!empire) {
                recordOrderFailure(world, factionId, actionId, 'Press state missing for your empire.');
                return;
            }
            let result;
            switch (actionId) {
                case 'PRESS_INV_COOPERATE': result = respondCooperate(inv, empire); break;
                case 'PRESS_INV_OBSTRUCT': result = respondObstruct(inv, empire, pressRngFor(world, actionId, factionId, inv.id, String(inv.obstructions ?? 0))); break;
                case 'PRESS_INV_SACRIFICE_OFFICIAL': result = respondSacrificeOfficial(inv, empire); break;
                default: result = respondPublishFirst(inv, empire, press, press.tick); break;
            }
            console.log(`[Tick Worker] Investigation ${inv.id} response ${actionId} by ${factionId}: ${result.outcome}`);
            break;
        }

        case 'PRESS_LEAK_INTEL': {
            // payload: { reportId } — leak a held intel report as a press story
            // about its subject. The leaker doesn't know if the report was
            // accurate; an inaccurate one runs as a FALSE story and can collapse.
            const press = ensurePressState(world);
            const report = world.espionage.reports.get(payload.reportId);
            if (!report) {
                recordOrderFailure(world, factionId, actionId, 'Intel report not found — it may have gone stale.');
                return;
            }
            if (report.ownerFactionId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'You do not hold that report.');
                return;
            }
            if (report.targetFactionId === factionId) {
                recordOrderFailure(world, factionId, actionId, 'Leaking intelligence about yourself is not a strategy.');
                return;
            }
            pushWorldStory(world, {
                targetEmpireId: report.targetFactionId,
                subject: `Leaked: ${report.title}`,
                magnitude: Math.round(40 + report.confidence * 40),
                source: StorySource.ESPIONAGE_LEAK,
                truth: report.accurate ? StoryTruth.TRUE : StoryTruth.FALSE,
                evidence: Math.round(report.confidence * 100),
            });
            // Spent: a leaked report is burned as an asset.
            world.espionage.reports.delete(report.id);
            console.log(`[Tick Worker] ${factionId} leaked report ${report.id} against ${report.targetFactionId}`);
            break;
        }

        case 'PRESS_FABRICATE_STORY': {
            // payload: { targetFactionId, subject } — plant a fabricated story.
            // Costs narrative influence; runs as FALSE with shaky evidence.
            const press = ensurePressState(world);
            const empire = press.empires.get(factionId);
            if (!empire) {
                recordOrderFailure(world, factionId, actionId, 'Press state missing for your empire.');
                return;
            }
            if (!payload.targetFactionId || payload.targetFactionId === factionId
                || !press.empires.has(payload.targetFactionId)) {
                recordOrderFailure(world, factionId, actionId, 'Pick a rival empire to target.');
                return;
            }
            const COST = 10;
            if ((empire.narrativeInfluence ?? 0) < COST) {
                recordOrderFailure(world, factionId, actionId, `Requires ${COST} narrative influence.`);
                return;
            }
            empire.narrativeInfluence = Math.max(0, (empire.narrativeInfluence ?? 0) - COST);
            pushWorldStory(world, {
                targetEmpireId: payload.targetFactionId,
                // Bound the attacker-controlled headline — it rides the world blob to every client.
                subject: String(payload.subject || 'Unconfirmed Reports of Misconduct').slice(0, 120),
                magnitude: 45,
                source: StorySource.RUMOR_MILL,
                truth: StoryTruth.FALSE,
                evidence: 25 + Math.floor(Math.random() * 20),
            });
            console.log(`[Tick Worker] ${factionId} fabricated a story against ${payload.targetFactionId}`);
            break;
        }

        case 'PRESS_LAUNCH_CAMPAIGN': {
            // payload: { targetFactionId, objective }
            const press = ensurePressState(world);
            const attacker = press.empires.get(factionId);
            if (!attacker) {
                recordOrderFailure(world, factionId, actionId, 'Press state missing for your empire.');
                return;
            }
            if (!payload.targetFactionId || payload.targetFactionId === factionId
                || !press.empires.has(payload.targetFactionId)) {
                recordOrderFailure(world, factionId, actionId, 'Pick a rival empire to target.');
                return;
            }
            if (!Object.values(CampaignObjective).includes(payload.objective)) {
                recordOrderFailure(world, factionId, actionId, `Unknown campaign objective '${payload.objective}'.`);
                return;
            }
            const duplicate = Array.from(press.campaigns.values()).find(c =>
                c.active && c.attackerId === factionId && c.targetEmpireId === payload.targetFactionId);
            if (duplicate) {
                recordOrderFailure(world, factionId, actionId, 'You already run a campaign against that empire.');
                return;
            }
            if ((attacker.narrativeInfluence ?? 0) < CampaignConfig.launchCost) {
                recordOrderFailure(world, factionId, actionId, `Requires ${CampaignConfig.launchCost} narrative influence.`);
                return;
            }
            attacker.narrativeInfluence = Math.max(0, attacker.narrativeInfluence - CampaignConfig.launchCost);
            const id = `CAMP_${press.tick}_${factionId}_${payload.targetFactionId}`;
            press.campaigns.set(id, {
                id,
                attackerId: factionId,
                targetEmpireId: payload.targetFactionId,
                objective: payload.objective,
                strength: 10,
                exposure: 0,
                signaled: false,
                tickStarted: press.tick,
                active: true,
            });
            console.log(`[Tick Worker] ${factionId} launched ${payload.objective} campaign vs ${payload.targetFactionId}`);
            break;
        }

        case 'PRESS_CANCEL_CAMPAIGN': {
            // payload: { campaignId }
            const press = ensurePressState(world);
            const camp = press.campaigns.get(payload.campaignId);
            if (!camp || camp.attackerId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'Campaign not found under your control.');
                return;
            }
            camp.active = false;
            camp.outcome = 'Quietly wound down by its sponsor.';
            break;
        }

        case 'PRESS_COUNTER_CAMPAIGN':
        case 'PRESS_TRACE_CAMPAIGN': {
            // payload: { campaignId }
            const press = ensurePressState(world);
            const camp = press.campaigns.get(payload.campaignId);
            if (!camp || !camp.active || camp.targetEmpireId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'No such active campaign against your empire.');
                return;
            }
            if (!camp.signaled) {
                recordOrderFailure(world, factionId, actionId, 'No confirmed foreign campaign to act against yet.');
                return;
            }
            const me = press.empires.get(factionId);
            if (!me) {
                recordOrderFailure(world, factionId, actionId, 'Press state missing for your empire.');
                return;
            }
            const result = actionId === 'PRESS_COUNTER_CAMPAIGN'
                ? counterCampaign(camp, me)
                : traceCampaign(camp, factionId, pressRngFor(world, actionId, factionId, camp.id, String(camp.exposure)), me);
            if (!result.ok && result.outcome.startsWith('Requires')) {
                recordOrderFailure(world, factionId, actionId, result.outcome);
                return;
            }
            console.log(`[Tick Worker] ${actionId} by ${factionId} on ${camp.id}: ${result.outcome}`);
            break;
        }

        case 'PRESS_ACCUSE_CAMPAIGN': {
            // payload: { campaignId, suspectFactionId }
            const press = ensurePressState(world);
            const camp = press.campaigns.get(payload.campaignId);
            if (!camp || camp.targetEmpireId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'No such campaign against your empire.');
                return;
            }
            const accuser = press.empires.get(factionId);
            if (!accuser) {
                recordOrderFailure(world, factionId, actionId, 'Press state missing for your empire.');
                return;
            }
            const result = accuseCampaign(camp, accuser, payload.suspectFactionId, press.empires.get(payload.suspectFactionId));
            console.log(`[Tick Worker] Accusation by ${factionId} vs ${payload.suspectFactionId}: ${result.outcome}`);
            break;
        }

        case 'PRESS_CRISIS_REACT': {
            // payload: { crisisId, reaction: AMPLIFY|DEFEND|NEUTRAL }
            const press = ensurePressState(world);
            const crisis = press.crises.get(payload.crisisId);
            if (!crisis || crisis.resolved) {
                recordOrderFailure(world, factionId, actionId, 'Crisis not found or already resolved.');
                return;
            }
            if (crisis.targetEmpireId === factionId) {
                recordOrderFailure(world, factionId, actionId, 'You cannot take a foreign stance on your own crisis.');
                return;
            }
            if (!['AMPLIFY', 'DEFEND', 'NEUTRAL'].includes(payload.reaction)) {
                recordOrderFailure(world, factionId, actionId, `Unknown reaction '${payload.reaction}'.`);
                return;
            }
            const actor = press.empires.get(factionId);
            const target = press.empires.get(crisis.targetEmpireId);
            if (!actor || !target) {
                recordOrderFailure(world, factionId, actionId, 'Press state missing for a participant.');
                return;
            }
            const result = reactToCrisis(crisis, factionId, actor, target, payload.reaction);
            if (!result.ok) {
                recordOrderFailure(world, factionId, actionId, result.outcome);
                return;
            }
            console.log(`[Tick Worker] ${factionId} reacted ${payload.reaction} to crisis ${crisis.id}`);
            break;
        }

        case 'PRESS_CRISIS_PREDICT': {
            // payload: { crisisId, choice } — hidden until the government commits.
            const press = ensurePressState(world);
            const crisis = press.crises.get(payload.crisisId);
            if (!crisis || crisis.resolved) {
                recordOrderFailure(world, factionId, actionId, 'Crisis not found or already resolved.');
                return;
            }
            if (crisis.targetEmpireId === factionId) {
                recordOrderFailure(world, factionId, actionId, 'You cannot bet on your own response.');
                return;
            }
            if (!Object.values(CrisisChoice).includes(payload.choice)) {
                recordOrderFailure(world, factionId, actionId, `Unknown crisis response '${payload.choice}'.`);
                return;
            }
            if (!crisis.predictions) crisis.predictions = {};
            if (crisis.predictions[factionId]) {
                recordOrderFailure(world, factionId, actionId, 'Prediction already locked for this crisis.');
                return;
            }
            crisis.predictions[factionId] = payload.choice;
            console.log(`[Tick Worker] ${factionId} locked a prediction on crisis ${crisis.id}`);
            break;
        }

        case 'MIL_BUILD_FLEET': {
            // payload: { planetId, systemId }
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet) {
                recordOrderFailure(world, factionId, actionId, 'Target planet not found — it may no longer exist.');
                return;
            }
            if (planet.ownerId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'You do not control the selected planet.');
                return;
            }
            
            const fleetId = `fleet-${factionId}-${Date.now()}`;
            const newFleet = {
                id: fleetId,
                factionId,
                name: `Task Force ${Math.floor(Math.random() * 100)}`,
                currentSystemId: payload.systemId,
                destinationSystemId: null,
                activeLayer: null,
                transitProgress: 0,
                etaSeconds: 0,
                plannedPath: [],
                orders: [],
                doctrine: {
                    type: 'Offensive',
                    deviationFromPosture: 0,
                    preferredLayers: ['hyperlane', 'gate'],
                    retreatThreshold: 0.3,
                    logisticsStrain: 0,
                    moraleDrift: 0,
                    supplyLevel: 1.0
                },
                postureId: 'Expansionist',
                strength: 1.0,
                basePower: 100,
                composition: {},
                hyperdriveProfile: {
                    hyperlane: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
                    trade: { speedMultiplier: 1.2, detectabilityMultiplier: 1.5, supplyStrainMultiplier: 1.0 },
                    corridor: { speedMultiplier: 2.0, detectabilityMultiplier: 0.5, supplyStrainMultiplier: 1.0 },
                    gate: { speedMultiplier: 10.0, detectabilityMultiplier: 2.0, supplyStrainMultiplier: 1.0 },
                    deepSpace: { speedMultiplier: 0.5, detectabilityMultiplier: 0.2, supplyStrainMultiplier: 1.0 },
                },
                isDetectable: true,
                transportedArmyIds: [],
                leaderId: undefined
            };
            world.movement.fleets.set(fleetId, newFleet);
            console.log(`[Order] Faction ${factionId} commissioned new fleet ${fleetId} at ${payload.systemId}`);
            break;
        }

        case 'MIL_CREATE_ARMY': {
            const planet = world.construction.planets.get(payload.planetId);
            if (!planet) {
                recordOrderFailure(world, factionId, actionId, 'Target planet not found — it may no longer exist.');
                return;
            }
            if (planet.ownerId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'You do not control the selected planet.');
                return;
            }

            const armyId = `army-${factionId}-${Date.now()}`;
            if (!world.movement.armies) world.movement.armies = new Map();
            const newArmy = {
                id: armyId,
                factionId,
                name: `Army Group ${Math.floor(Math.random() * 100)}`,
                currentPlanetId: payload.planetId,
                currentSystemId: payload.systemId,
                transportFleetId: null,
                composition: {},
                stance: 'fortified',
                strength: 1.0,
                basePower: 100,
                supplyLevel: 1.0,
                morale: 100,
                leaderId: undefined
            };
            world.movement.armies.set(armyId, newArmy);
            console.log(`[Order] Faction ${factionId} raised new army ${armyId} at ${payload.planetId}`);
            break;
        }

        case 'MIL_RECRUIT_FORMATION_UNIT': {
            // Because recruitment takes time, we should queue it using RecruitmentService
            // However, we need a way for RecruitmentService to assign it to the formation directly.
            // For now, we will add it instantly for the prototype, or we can use the existing job system 
            // and attach `formationId` to the job. Let's mutate instantly for now to satisfy UI responsiveness,
            // OR use the queue but with formationId. The user said: "Production queue arrive over time. Should deduct resources"
            const job = RecruitmentService.createJob(
                'formation-' + payload.formationId, // Use formationId as planetId spoof
                factionId,
                payload.unitType as GroundUnitType,
                payload.count,
                world.nowSeconds
            );
            // We'll tag the job with the real formation ID
            (job as any).targetFormationId = payload.formationId;
            (job as any).isFleet = payload.isFleet;

            if (!world.combat) world.combat = {};
            if (!world.combat.recruitmentJobs) world.combat.recruitmentJobs = [];
            world.combat.recruitmentJobs.push(job);
            console.log(`[Order] Faction ${factionId} queued ${payload.count}x ${payload.unitType} into formation ${payload.formationId}`);
            break;
        }

        case 'MIL_ATTACK_FLEET': {
            // payload: { attackerFleetId, defenderFleetId }
            const attacker = world.movement.fleets.get(payload.attackerFleetId);
            const defender = world.movement.fleets.get(payload.defenderFleetId);
            if (!attacker || !defender || attacker.factionId !== factionId) return;

            // Attacking a fleet IS an act of war. Setting the rivalry to war level
            // makes the combat-manager start (and keep advancing) the engagement
            // this same cycle. registerActOfWar also auto-breaks a live NAP with
            // an oathbreaker reputation hit and pulls the defender's
            // mutual-defense allies into the war.
            if (!isAtWar(world, attacker.factionId, defender.factionId)) {
                registerActOfWar(world, attacker.factionId, defender.factionId);
                console.log(`[Order] SKIRMISH: ${attacker.factionId} opened fire on ${defender.factionId} — state of war declared.`);
            }
            console.log(`[Order] Engagement ordered: ${payload.attackerFleetId} vs ${payload.defenderFleetId} — combat begins this cycle.`);
            break;
        }

        case 'MIL_TACTICAL_ENGAGE': {
            // payload: { systemId, enemyFactionId }
            // The player is opening the real-time tactical battle view for this
            // system. Lock it so the auto-resolver (processSectorCombats) leaves
            // this PAIR alone until the client submits MIL_TACTICAL_RESULT — or
            // the lock times out (client crashed / tab closed mid-battle).
            const { systemId, enemyFactionId } = payload;
            const allFleets: any[] = Array.from(world.movement.fleets.values());
            const ownFleets = allFleets.filter((f: any) =>
                f.factionId === factionId && f.currentSystemId === systemId && isFleetOperational(f));
            const hostileFleets = allFleets.filter((f: any) =>
                f.factionId === enemyFactionId && f.currentSystemId === systemId);
            if (ownFleets.length === 0) {
                recordOrderFailure(world, factionId, actionId, 'No operational fleet of yours is holding in that system.');
                return;
            }
            if (hostileFleets.length === 0) {
                recordOrderFailure(world, factionId, actionId, 'No enemy fleets remain in that system to engage.');
                return;
            }
            world.tacticalLocks = world.tacticalLocks || {};

            // One live battle per system: an unexpired lock can't be replaced —
            // not by another faction (lock theft would discard their in-flight
            // battle) and not by its own holder (free indefinite renewal would
            // freeze the system's combats forever).
            const existingLock = world.tacticalLocks[systemId];
            if (existingLock && existingLock.until > world.nowSeconds) {
                recordOrderFailure(world, factionId, actionId, 'A tactical battle is already in progress in that system.');
                return;
            }

            // Engaging IS an act of war — same rule as MIL_ATTACK_FLEET. Without
            // this, tactical combat would bypass the war declaration entirely.
            if (!isAtWar(world, factionId, enemyFactionId)) {
                registerActOfWar(world, factionId, enemyFactionId);
                console.log(`[Order] TACTICAL ENGAGE: ${factionId} opened hostilities with ${enemyFactionId} — state of war declared.`);
            }

            // Pre-battle snapshot per side — the client-authored result is
            // clamped against these numbers when it comes back.
            const snapshotSide = (fleets: any[]) => {
                const composition: Record<string, number> = {};
                let totalBasePower = 0;
                let maxStrength = 0;
                for (const f of fleets) {
                    for (const [k, v] of Object.entries(f.composition || {})) {
                        const n = Math.floor(Number(v) || 0);
                        if (n > 0) composition[k] = (composition[k] ?? 0) + n;
                    }
                    totalBasePower += Number(f.basePower) || 0;
                    maxStrength = Math.max(maxStrength, Math.min(1, Number(f.strength) || 0));
                }
                // Ship-less fleets fight as synthesized corvettes (see
                // fleetsToReserves) — mirror that so their survivors aren't
                // clamped out of existence.
                if (Object.keys(composition).length === 0) {
                    const power = fleets.reduce((s: number, f: any) => s + (Number(f.basePower) || 0) * (Number(f.strength) || 1), 0);
                    composition['interceptor'] = Math.max(1, Math.round(power / 25));
                }
                const shipCount = Object.values(composition).reduce((a: number, b: any) => a + b, 0);
                return { composition, maxStrength: maxStrength || 1, totalBasePower, shipCount };
            };

            // 30 REAL minutes, expressed in sim-seconds. The battle runs on the
            // player's wall clock while world.nowSeconds advances
            // TIME_STEP_SECONDS per POLL_INTERVAL_MS cycle (15× real time) —
            // a plain `+ 1800` expired after ~2 real minutes, mid-battle.
            const LOCK_SIM_SECONDS = 30 * 60 * (TIME_STEP_SECONDS / (POLL_INTERVAL_MS / 1000));
            world.tacticalLocks[systemId] = {
                systemId,
                factionId,
                enemyFactionId,
                until: world.nowSeconds + LOCK_SIM_SECONDS,
                preBattle: {
                    player: snapshotSide(ownFleets),
                    enemy: snapshotSide(hostileFleets),
                },
            };
            console.log(`[Order] TACTICAL ENGAGE at ${systemId}: ${factionId} (${ownFleets.length} fleets) vs ${enemyFactionId} (${hostileFleets.length} fleets) — auto-resolve locked for this pair.`);
            break;
        }

        case 'MIL_TACTICAL_ABORT': {
            // payload: { systemId } — player closed the battle view without a
            // result. Release the lock so auto-resolve resumes immediately.
            const lock = world.tacticalLocks?.[payload.systemId];
            if (lock && lock.factionId === factionId) {
                delete world.tacticalLocks[payload.systemId];
                console.log(`[Order] TACTICAL ABORT at ${payload.systemId} by ${factionId} — lock released.`);
            }
            break;
        }

        case 'MIL_TACTICAL_RESULT': {
            // payload: TacticalResultPayload (lib/tactical/fleet-adapter.ts)
            // The client-simulated battle finished — apply the outcome to the
            // strategic fleets, clear any auto-resolve engagement for the pair,
            // and release the system lock.
            const { systemId, enemyFactionId, playerResult, enemyResult } = payload;
            const playerFleetIds: string[] = Array.isArray(payload.playerFleetIds) ? payload.playerFleetIds : [];
            const enemyFleetIds: string[] = Array.isArray(payload.enemyFleetIds) ? payload.enemyFleetIds : [];

            const lock = world.tacticalLocks?.[systemId];
            if (!lock || lock.factionId !== factionId) {
                recordOrderFailure(world, factionId, actionId, 'No tactical battle lock for that system is held by you.');
                return;
            }
            if (world.nowSeconds > lock.until) {
                // Stale credential — the battle timed out and auto-resolve took
                // back over; a late result must not rewrite fleets.
                delete world.tacticalLocks[systemId];
                recordOrderFailure(world, factionId, actionId, 'The tactical battle lock has expired — auto-resolve already resumed.');
                return;
            }
            if (enemyFactionId !== lock.enemyFactionId) {
                // The lock only authorizes a result against the faction that was
                // actually engaged.
                recordOrderFailure(world, factionId, actionId, 'Result names a different enemy faction than was engaged.');
                return;
            }

            // Every listed fleet that still exists must belong to the side it
            // was submitted for — otherwise the result could rewrite someone
            // else's fleets.
            for (const fid of playerFleetIds) {
                const f = world.movement.fleets.get(fid);
                if (f && f.factionId !== factionId) {
                    recordOrderFailure(world, factionId, actionId, `Fleet ${fid} does not belong to your faction.`);
                    return;
                }
            }
            for (const fid of enemyFleetIds) {
                const f = world.movement.fleets.get(fid);
                if (f && f.factionId !== enemyFactionId) {
                    recordOrderFailure(world, factionId, actionId, `Fleet ${fid} does not belong to ${enemyFactionId}.`);
                    return;
                }
            }

            // Clamp a client-authored side result against the pre-battle
            // snapshot: no new ship types, no count above what entered, finite
            // strength capped at the entry maximum.
            const sanitizeSide = (side: any, pre: any) => {
                if (!side || typeof side !== 'object') return null;
                const preComp = pre?.composition ?? null;
                const composition: Record<string, number> = {};
                for (const [k, v] of Object.entries(side.composition || {})) {
                    const n = Math.floor(Number(v) || 0);
                    if (n <= 0) continue;
                    if (preComp) {
                        if (!(k in preComp)) continue;
                        composition[k] = Math.min(n, preComp[k]);
                    } else {
                        composition[k] = n; // legacy lock without snapshot
                    }
                }
                let strength = Number(side.strength);
                if (!Number.isFinite(strength)) strength = 0;
                strength = Math.max(0.05, Math.min(strength, pre?.maxStrength ?? 1));
                const destroyed = !!side.destroyed || Object.keys(composition).length === 0;
                return { destroyed, composition, strength };
            };

            // Apply one side's outcome: destroyed → all its listed fleets die;
            // survived → the FIRST listed fleet that still exists becomes the
            // merged survivor (composition + strength from the sim), the rest
            // are deleted (they merged into it). Only fleets still HOLDING in
            // the locked system are touched — a fleet that jumped out
            // mid-battle escaped the engagement.
            const applySideResult = (fleetIds: string[], rawSide: any, pre: any) => {
                const side = sanitizeSide(rawSide, pre);
                const existing = fleetIds.filter((fid) => {
                    const f = world.movement.fleets.get(fid);
                    return f && f.currentSystemId === systemId && !f.destinationSystemId;
                });
                if (!side || existing.length === 0) return;
                if (side.destroyed) {
                    for (const fid of existing) world.movement.fleets.delete(fid);
                    return;
                }
                const survivor = world.movement.fleets.get(existing[0]);
                const pooledBasePower = existing.reduce(
                    (sum, fid) => sum + (Number(world.movement.fleets.get(fid)?.basePower) || 0), 0);
                survivor.composition = { ...side.composition };
                survivor.strength = side.strength;
                // Keep strategic auto-resolve power (basePower × strength)
                // consistent with the ships that actually survived.
                const survivingCount = Object.values(side.composition).reduce((a: number, b: any) => a + b, 0);
                const preCount = pre?.shipCount ?? 0;
                const ratio = preCount > 0 ? Math.min(1, survivingCount / preCount) : 1;
                survivor.basePower = Math.max(1, Math.round((pooledBasePower || pre?.totalBasePower || 100) * ratio));
                for (const fid of existing.slice(1)) world.movement.fleets.delete(fid);
            };
            applySideResult(playerFleetIds, playerResult, lock.preBattle?.player);
            applySideResult(enemyFleetIds, enemyResult, lock.preBattle?.enemy);

            // Drop any auto-resolve engagement for this pair — ids look like
            // combat-<systemId>-<facA>-<facB> (either faction order).
            for (const combatId of Array.from(world.activeCombats.keys()) as string[]) {
                if (combatId.includes(systemId) && combatId.includes(factionId) && combatId.includes(enemyFactionId)) {
                    world.activeCombats.delete(combatId);
                }
            }

            delete world.tacticalLocks[systemId];
            const sideSummary = (label: string, side: any) => side?.destroyed
                ? `${label} destroyed`
                : `${label} survives at strength ${(side?.strength ?? 0).toFixed(2)}`;
            console.log(`[Order] TACTICAL RESULT at ${systemId}: winner=${payload.winner} (${payload.reason}) after ${payload.durationSeconds}s — ${sideSummary(factionId, playerResult)}, ${sideSummary(enemyFactionId, enemyResult)}.`);
            break;
        }

        case 'MIL_MERGE_FLEETS': {
            // payload: { sourceFleetId, targetFleetId } — source is absorbed into target.
            const src = world.movement.fleets.get(payload.sourceFleetId);
            const tgt = world.movement.fleets.get(payload.targetFleetId);
            if (!src || !tgt || src.id === tgt.id) return;
            if (src.factionId !== factionId || tgt.factionId !== factionId) {
                console.error(`[Security] ${factionId} tried to merge fleets they don't own.`);
                return;
            }
            if (!src.currentSystemId || src.currentSystemId !== tgt.currentSystemId) {
                console.warn(`[Order] MERGE rejected: fleets must be holding in the same system.`);
                return;
            }
            if (src.destinationSystemId || tgt.destinationSystemId) {
                console.warn(`[Order] MERGE rejected: fleets in transit cannot merge.`);
                return;
            }

            // Combine ship compositions
            if (!tgt.composition) tgt.composition = {};
            for (const [type, count] of Object.entries(src.composition || {})) {
                (tgt.composition as any)[type] = ((tgt.composition as any)[type] || 0) + (count as number);
            }

            // Strength becomes the power-weighted average; power adds up.
            const srcPower = src.basePower ?? 0;
            const tgtPower = tgt.basePower ?? 0;
            if (srcPower + tgtPower > 0) {
                tgt.strength = ((tgt.strength ?? 1) * tgtPower + (src.strength ?? 1) * srcPower) / (srcPower + tgtPower);
            }
            tgt.basePower = tgtPower + srcPower;
            tgt.originSystemId = null;

            // Carried armies transfer to the merged fleet
            if (src.transportedArmyIds?.length) {
                tgt.transportedArmyIds = [...(tgt.transportedArmyIds || []), ...src.transportedArmyIds];
                for (const armyId of src.transportedArmyIds) {
                    const army = world.movement.armies?.get(armyId);
                    if (army) army.transportFleetId = tgt.id;
                }
            }

            // In-flight ship recruitment aimed at the absorbed fleet retargets
            for (const job of (world.combat?.recruitmentJobs || [])) {
                if ((job as any).targetFormationId === src.id) (job as any).targetFormationId = tgt.id;
            }

            world.movement.fleets.delete(src.id);
            console.log(`[Order] ${factionId} merged ${src.name || src.id} into ${tgt.name || tgt.id} (power ${tgt.basePower}).`);
            break;
        }

        case 'MIL_SPLIT_FLEET': {
            // payload: { fleetId, composition?: {shipType: countToDetach}, name? }
            // Detaches ships into a NEW fleet in the same system. With no
            // composition (or a shipless fleet), splits base power 50/50.
            const src = world.movement.fleets.get(payload.fleetId);
            if (!src) return;
            if (src.factionId !== factionId) {
                console.error(`[Security] ${factionId} tried to split a fleet they don't own.`);
                return;
            }
            if (!src.currentSystemId || src.destinationSystemId) {
                console.warn(`[Order] SPLIT rejected: fleet must be holding in a system.`);
                return;
            }

            if (!src.composition) src.composition = {};
            const totalShips = Object.values(src.composition).reduce((a: number, b: any) => a + (Number(b) || 0), 0);

            const moved: Record<string, number> = {};
            let movedCount = 0;
            for (const [type, want] of Object.entries(payload.composition || {})) {
                const have = (src.composition as any)[type] || 0;
                const take = Math.max(0, Math.min(have, Math.floor(Number(want) || 0)));
                if (take > 0) { moved[type] = take; movedCount += take; }
            }
            if (movedCount > 0 && movedCount >= totalShips) {
                console.warn(`[Order] SPLIT rejected: cannot detach ALL ships — merge or rename instead.`);
                return;
            }

            const srcPower = src.basePower ?? 100;
            let newPower: number;
            if (movedCount > 0) {
                for (const [type, count] of Object.entries(moved)) {
                    (src.composition as any)[type] -= count;
                    if ((src.composition as any)[type] <= 0) delete (src.composition as any)[type];
                }
                const ratio = totalShips > 0 ? movedCount / totalShips : 0.5;
                newPower = Math.max(10, Math.round(srcPower * ratio));
            } else {
                newPower = Math.max(10, Math.round(srcPower / 2));
            }
            src.basePower = Math.max(10, srcPower - newPower);

            const newFleetId = `fleet-${factionId}-${Date.now()}`;
            world.movement.fleets.set(newFleetId, {
                ...src,
                id: newFleetId,
                name: payload.name || `${src.name || 'Task Force'} Detachment`,
                composition: moved,
                basePower: newPower,
                strength: src.strength ?? 1,
                transportedArmyIds: [],
                orders: [],
                plannedPath: [],
                destinationSystemId: null,
                originSystemId: null,
                transitProgress: 0,
                etaSeconds: 0,
                activeLayer: null,
            });
            console.log(`[Order] ${factionId} split ${movedCount > 0 ? `${movedCount} ships` : 'half power'} from ${src.name || src.id} into ${newFleetId}.`);
            break;
        }

        case 'MIL_COMBAT_RETREAT': {
            // Disengage: break off the battle and send this faction's fleets in
            // the contested system home to lick their wounds.
            const combat = world.activeCombats.get(payload.combatId);
            if (!combat) return;
            if (combat.attacker.factionId !== factionId && combat.defender.factionId !== factionId) {
                console.error(`[Security] ${factionId} tried to retreat from a battle they're not in.`);
                return;
            }
            const battleSystemId = combat.location?.systemId;
            const homeSystemId = world.economy.factions.get(factionId)?.capitalSystemId;
            if (battleSystemId && homeSystemId) {
                for (const [fid, fleet] of world.movement.fleets) {
                    if (fleet.factionId === factionId && fleet.currentSystemId === battleSystemId) {
                        const updated = issueMoveOrder(fleet, homeSystemId, 'hyperlane', world.movement);
                        world.movement.fleets.set(fid, updated);
                    }
                }
            }
            world.activeCombats.delete(payload.combatId);
            console.log(`[Order] ${factionId} DISENGAGED from battle ${payload.combatId} — fleets withdrawing home.`);
            break;
        }

        case 'MIL_COMBAT_STANCE': {
            const combat = world.activeCombats.get(payload.combatId);
            if (!combat) return;
            if (combat.attacker.factionId === factionId) {
                combat.attacker.selectedStance = payload.stance;
                combat.attacker.selectedPrediction = payload.prediction;
            } else if (combat.defender.factionId === factionId) {
                combat.defender.selectedStance = payload.stance;
                combat.defender.selectedPrediction = payload.prediction;
            }
            break;
        }

        case 'MIL_COMBAT_DIRECTIVE': {
            const combat = world.activeCombats.get(payload.combatId);
            if (!combat) return;
            if (combat.attacker.factionId === factionId) combat.attacker.selectedStance = payload.stance;
            else if (combat.defender.factionId === factionId) combat.defender.selectedStance = payload.stance;
            break;
        }

        case 'DIP_PROPOSE_TREATY': {
            // Bilateral consent: this queues an offer; the treaty only becomes
            // active when the target accepts via DIP_RESPOND_OFFER.
            const result = createOffer(world, factionId, {
                kind: 'treaty',
                toFactionId: payload.targetFactionId,
                treatyType: payload.treatyType,
            });
            if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
            else {
                evaluateSupportAndApply(world, factionId, 'treaty', payload.targetFactionId);
                console.log(`[Order] ${factionId} proposed ${payload.treatyType} to ${payload.targetFactionId}`);
            }
            break;
        }

        case 'DIP_DEMAND_TRIBUTE': {
            const result = createOffer(world, factionId, {
                kind: 'tribute_demand',
                toFactionId: payload.targetFactionId,
                tributeResourceType: 'credits',
                tributeAmountPerTick: payload.amount,
            });
            if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
            else {
                evaluateSupportAndApply(world, factionId, 'tribute_demand', payload.targetFactionId);
                console.log(`[Order] ${factionId} demanded tribute from ${payload.targetFactionId}`);
            }
            break;
        }

        case 'DIP_TRADE_PACT': {
            const result = createOffer(world, factionId, {
                kind: 'trade_pact',
                toFactionId: payload.targetFactionId,
                resource: payload.resource,
                volumePerHour: payload.volume,
            });
            if (!result.success) recordOrderFailure(world, factionId, actionId, result.message);
            else {
                evaluateSupportAndApply(world, factionId, 'trade_pact', payload.targetFactionId);
                console.log(`[Order] ${factionId} proposed trade pact to ${payload.targetFactionId}`);
            }
            break;
        }

        case 'ECON_ASSIGN_ESCORTS': {
            const route = world.economy.tradeRoutes?.get(payload.routeId);
            if (!route) {
                recordOrderFailure(world, factionId, actionId, 'Trade route not found.');
                break;
            }
            const agreement = world.economy.tradeAgreements?.get(route.agreementId);
            if (!agreement || (agreement.aFactionId !== factionId && agreement.bFactionId !== factionId)) {
                recordOrderFailure(world, factionId, actionId, 'You are not a party to this trade route.');
                break;
            }
            route.escortLevel = Math.max(0, Math.min(8, Math.floor(payload.level ?? 0)));
            console.log(`[Order] Faction ${factionId} set escort level ${route.escortLevel} on route ${route.id}`);
            break;
        }

        case 'ECON_UPDATE_POLICY': {
             // payload: { updates }
             if (!world.economy.policies) world.economy.policies = new Map();
             let policy = world.economy.policies.get(factionId);
             if (!policy) {
                 policy = {
                     tariffsByResource: new Map(),
                     subsidiesByResource: new Map(),
                     sanctions: new Set(),
                     embargoes: [],
                     chokepointRules: new Map(),
                     productionFocus: null
                 };
                 world.economy.policies.set(factionId, policy);
             }
             if (payload.updates.tariffs) {
                 payload.updates.tariffs.forEach((t: any) => policy.tariffsByResource.set(t.resource, t.value));
             }
             if (payload.updates.subsidies) {
                 payload.updates.subsidies.forEach((s: any) => policy.subsidiesByResource.set(s.resource, s.value));
             }
             if (payload.updates.sanctions) {
                 payload.updates.sanctions.forEach((fid: string) => policy.sanctions.add(fid));
             }
             if (payload.updates.embargoes) {
                 for (const emb of payload.updates.embargoes) {
                     const existing = policy.embargoes.findIndex((e: any) => e.factionId === emb.factionId);
                     if (existing >= 0) policy.embargoes[existing] = emb;
                     else policy.embargoes.push(emb);
                 }
             }
             console.log(`[Order] Faction ${factionId} updated Economic Policy`);
             break;
        }

        case 'ECON_SET_FOCUS': {
             if (!world.economy.policies) world.economy.policies = new Map();
             let policy = world.economy.policies.get(factionId);
             if (!policy) {
                 policy = {
                     tariffsByResource: new Map(),
                     subsidiesByResource: new Map(),
                     sanctions: new Set(),
                     embargoes: [],
                     chokepointRules: new Map(),
                     productionFocus: null
                 };
                 world.economy.policies.set(factionId, policy);
             }
             policy.productionFocus = payload.resource;
             console.log(`[Order] Faction ${factionId} set Production Focus to ${payload.resource}`);
             break;
        }

        case 'ECON_MARKET_BUY':
        case 'ECON_MARKET_SELL': {
            const side = actionId === 'ECON_MARKET_BUY' ? 'buy' as const : 'sell' as const;
            const result = executeMarketOrder(world, factionId, side, payload.resource, payload.amount, payload.planetId);
            if (!result.success) {
                recordOrderFailure(world, factionId, actionId, result.reason ?? 'Market order failed.');
            } else {
                console.log(`[Order] Faction ${factionId} ${side} ${result.unitsFilled} ${payload.resource} @ ${result.pricePerUnit?.toFixed(2)} (Δ credits ${Math.round(result.creditsDelta ?? 0)})`);
            }
            break;
        }

        case 'ECON_ESTABLISH_ROUTE': {
             try {
                 establishTradeRoute(world, factionId, payload);
                 console.log(`[Order] Faction ${factionId} established Trade Route to ${payload.targetFactionId}`);
             } catch (e: any) {
                 console.warn('[Tick Worker] establishTradeRoute failed:', e.message);
             }
             break;
        }

        case 'MIL_ESTABLISH_GARRISON': {
             const planet = world.construction.planets.get(payload.targetId);
             if (planet && planet.ownerId === factionId) {
                 planet.stability = Math.min(100, (planet.stability || 60) + 15);
                 planet.unrest = Math.max(0, (planet.unrest || 0) - 10);
                 console.log(`[Order] Faction ${factionId} established Garrison on ${planet.name}`);
             }
             break;
        }

        case 'ECON_ESTABLISH_COMPANY': {
             // payload: { baseName, headquartersSystemId, powers? }
             try {
                 const unlocked = new Set<string>(world.tech?.get?.(factionId)?.unlockedTechIds ?? []);
                 const company = charterNewCompany(
                     world.corporate,
                     payload.baseName,
                     factionId,
                     payload.headquartersSystemId,
                     payload.powers ?? [CharterPower.MONOPOLY],
                     world.nowSeconds,
                     unlocked
                 );
                 console.log(`[Order] Faction ${factionId} chartered "${company.charter.fullName}" (HQ ${company.headquartersSystemId})`);
             } catch (e: any) {
                 recordOrderFailure(world, factionId, actionId, e.message ?? 'Charter failed.');
             }
             break;
        }

        case 'ECON_INVEST_COMPANY': {
             // payload: { companyId, amount } — buys newly issued shares at the
             // current share price; capital lands in the company treasury.
             const company = world.corporate?.companies?.get?.(payload.companyId);
             if (!company) { recordOrderFailure(world, factionId, actionId, 'Company not found.'); break; }
             const amount = Math.max(0, Number(payload.amount) || 0);
             const reserves = world.economy.factions.get(factionId)?.reserves;
             if (!reserves || (reserves['CREDITS'] ?? 0) < amount || amount <= 0) {
                 recordOrderFailure(world, factionId, actionId, 'Insufficient credits for investment.');
                 break;
             }
             const shares = Math.floor(amount / Math.max(0.01, company.sharePrice));
             if (shares <= 0) { recordOrderFailure(world, factionId, actionId, 'Investment too small for a single share.'); break; }
             reserves['CREDITS'] -= amount;
             issueNewShares(
                 company, shares, factionId, company.sharePrice,
                 getOrCreateFactionState(world.corporate, factionId),
                 world.corporate.eventLog, world.nowSeconds
             );
             console.log(`[Order] Faction ${factionId} invested ${amount} in ${company.charter.fullName} (${shares} shares)`);
             break;
        }

        case 'ECON_LIQUIDATE_COMPANY': {
             const company = world.corporate?.companies?.get?.(payload.companyId);
             if (!company) { recordOrderFailure(world, factionId, actionId, 'Company not found.'); break; }
             if (company.foundingFactionId !== factionId) {
                 recordOrderFailure(world, factionId, actionId, 'Only the founding faction can liquidate a company.');
                 break;
             }
             // Distribute remaining treasury to shareholders pro-rata, then dissolve.
             const totalShares = Math.max(1, company.sharesOutstanding);
             for (const [holderId, shares] of Object.entries(company.shareholders)) {
                 if ((shares as number) <= 0) continue;
                 const payout = company.treasury * ((shares as number) / totalShares);
                 const holderReserves = world.economy.factions.get(holderId)?.reserves;
                 if (holderReserves && payout > 0) holderReserves['CREDITS'] = (holderReserves['CREDITS'] ?? 0) + payout;
                 const st = world.corporate.factionStates.get(holderId);
                 if (st) {
                     delete st.companySharesOwned[company.id];
                     st.charteredCompanyIds = st.charteredCompanyIds.filter((id: string) => id !== company.id);
                 }
             }
             world.corporate.companies.delete(company.id);
             console.log(`[Order] Faction ${factionId} liquidated ${company.charter.fullName} (treasury ${Math.round(company.treasury)} distributed)`);
             break;
        }

        case 'ECON_GRANT_MONOPOLY': {
             // payload: { companyId, resource, systemIds }
             const company = world.corporate?.companies?.get?.(payload.companyId);
             if (!company) { recordOrderFailure(world, factionId, actionId, 'Company not found.'); break; }
             if (company.foundingFactionId !== factionId) {
                 recordOrderFailure(world, factionId, actionId, 'Only the founding faction can grant monopolies.');
                 break;
             }
             const systemIds: string[] = payload.systemIds ?? (payload.systemId ? [payload.systemId] : []);
             if (systemIds.length === 0) { recordOrderFailure(world, factionId, actionId, 'No systems specified.'); break; }
             grantMonopolyRight(company, payload.resource, systemIds, world.corporate.eventLog, world.nowSeconds);
             console.log(`[Order] Faction ${factionId} granted ${payload.resource} monopoly in ${systemIds.length} system(s) to ${company.charter.fullName}`);
             break;
        }

        case 'ECON_ISSUE_SHARES': {
             // payload: { companyId, shareCount, pricePerShare? } — buyer is the issuer faction.
             const company = world.corporate?.companies?.get?.(payload.companyId);
             if (!company) { recordOrderFailure(world, factionId, actionId, 'Company not found.'); break; }
             const shareCount = Math.max(0, Math.floor(Number(payload.shareCount) || 0));
             const price = Number(payload.pricePerShare) > 0 ? Number(payload.pricePerShare) : company.sharePrice;
             const cost = shareCount * price;
             const reserves = world.economy.factions.get(factionId)?.reserves;
             if (shareCount <= 0) { recordOrderFailure(world, factionId, actionId, 'Share count must be positive.'); break; }
             if (!reserves || (reserves['CREDITS'] ?? 0) < cost) {
                 recordOrderFailure(world, factionId, actionId, `Insufficient credits: need ${Math.ceil(cost)}.`);
                 break;
             }
             reserves['CREDITS'] -= cost;
             issueNewShares(
                 company, shareCount, factionId, price,
                 getOrCreateFactionState(world.corporate, factionId),
                 world.corporate.eventLog, world.nowSeconds
             );
             console.log(`[Order] Faction ${factionId} bought ${shareCount} new shares of ${company.charter.fullName} @ ${price.toFixed(2)}`);
             break;
        }

        case 'ECON_COMMAND_PRIVATEERS': {
             const company = world.corporate?.companies?.get?.(payload.companyId);
             if (!company) { recordOrderFailure(world, factionId, actionId, 'Company not found.'); break; }
             if (company.foundingFactionId !== factionId) {
                 recordOrderFailure(world, factionId, actionId, 'Only the founding faction can command privateers.');
                 break;
             }
             try {
                 commandPrivateers(company, world.corporate.eventLog, world.nowSeconds);
                 console.log(`[Order] ${company.charter.fullName} expanded privateer fleet to ${company.privateFleetSize}`);
             } catch (e: any) {
                 recordOrderFailure(world, factionId, actionId, e.message ?? 'Privateer expansion failed.');
             }
             break;
        }

        case 'ECON_TAX_COLONIES': {
             const company = world.corporate?.companies?.get?.(payload.companyId);
             if (!company) { recordOrderFailure(world, factionId, actionId, 'Company not found.'); break; }
             if (company.foundingFactionId !== factionId) {
                 recordOrderFailure(world, factionId, actionId, 'Only the founding faction can tax the company.');
                 break;
             }
             try {
                 const amount = collectCorporateTax(
                     company,
                     getOrCreateFactionState(world.corporate, factionId),
                     world.corporate.eventLog,
                     world.nowSeconds
                 );
                 const reserves = world.economy.factions.get(factionId)?.reserves;
                 if (reserves) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + amount;
                 console.log(`[Order] Faction ${factionId} taxed ${company.charter.fullName} for ${Math.round(amount)} credits`);
             } catch (e: any) {
                 recordOrderFailure(world, factionId, actionId, e.message ?? 'Corporate tax failed.');
             }
             break;
        }

        // ─── Charter Corporations ────────────────────────────────────────────

        case 'CORP_FOUND_CHARTER': {
             // payload: { baseName, headquartersSystemId, mission, territory,
             //            rights[], ownership{}, profitShareToState, foundingCapital }
             const corp = ensureCorporateState(world);
             const terms: CharterTerms = {
                 mission: payload.mission ?? 'trade',
                 territory: payload.territory ?? 'domestic',
                 rights: Array.isArray(payload.rights) ? payload.rights : [],
                 ownership: payload.ownership ?? { government: 100, privateInvestors: 0, foreignInvestors: 0, publicShares: 0 },
                 profitShareToState: Number(payload.profitShareToState ?? 0.15),
             };
             const capital = Math.floor(Number(payload.foundingCapital) || 0);

             const invalid = validateCharter(terms, payload.baseName ?? '', capital);
             if (invalid) { recordOrderFailure(world, factionId, actionId, invalid); break; }

             const gov = getGovernment(world, factionId);
             if (gov && gov.legitimacy < MIN_LEGITIMACY_TO_CHARTER) {
                 recordOrderFailure(world, factionId, actionId, 'The government lacks the standing to grant a charter.');
                 break;
             }

             const unlocked = new Set<string>(world.tech?.get?.(factionId)?.unlockedTechIds ?? []);
             if (!unlocked.has(CHARTER_TECH_ID)) {
                 recordOrderFailure(world, factionId, actionId,
                     'Chartering requires the "Trade Route Initialization" technology.');
                 break;
             }

             // Build the company FIRST, then charge for it. Nothing else can
             // throw once the charter validates and the tech gate is clear, so
             // the state never pays for a charter that fails to exist.
             let company;
             try {
                 company = charterCorporation(
                     {
                         baseName: payload.baseName,
                         foundingFactionId: factionId,
                         headquartersSystemId: payload.headquartersSystemId,
                         terms,
                         foundingCapital: capital,
                         nowSeconds: world.nowSeconds,
                         unlockedTechIds: unlocked,
                     },
                     getOrCreateFactionState(corp, factionId)
                 );
             } catch (e: any) {
                 recordOrderFailure(world, factionId, actionId, e.message ?? 'Charter failed.');
                 break;
             }

             const price = priceCharter(terms, capital);
             // The state subscribes its own share of the founding capital; the
             // rest is raised from investors and arrives as company treasury.
             const reserves = world.economy.factions.get(factionId)?.reserves;
             if (!reserves || (reserves['CREDITS'] ?? 0) < price.stateCapital) {
                 recordOrderFailure(world, factionId, actionId,
                     `The treasury must subscribe ${price.stateCapital.toLocaleString()} credits for its ${terms.ownership.government}% stake.`);
                 // charterCorporation registered the company on the faction's
                 // portfolio; undo that since the charter is not being granted.
                 unwindPortfolioEntry(corp, factionId, company.id);
                 break;
             }
             if (!spendPoliticalCapital(world, factionId, price.politicalCapital, `granting the ${payload.baseName} charter`)) {
                 recordOrderFailure(world, factionId, actionId,
                     `Granting a charter on these terms costs ${price.politicalCapital} political capital.`);
                 unwindPortfolioEntry(corp, factionId, company.id);
                 break;
             }
             reserves['CREDITS'] -= price.stateCapital;

             registerCompany(corp, company);
             corp.eventLog.push({
                 type: 'chartered',
                 companyId: company.id,
                 payload: {
                     name: company.charter.fullName,
                     mission: terms.mission,
                     territory: terms.territory,
                     rights: terms.rights,
                     personality: company.personality,
                 },
                 timestamp: world.nowSeconds,
             });
             console.log(`[Order] Faction ${factionId} chartered "${company.charter.fullName}" — ${terms.mission}/${terms.territory}, ${terms.rights.length} rights, personality ${company.personality}`);
             break;
        }

        case 'CORP_RESPOND_DEMAND': {
             const corp = ensureCorporateState(world);
             const demand = corp.demands.get(payload.demandId);
             if (!demand) { recordOrderFailure(world, factionId, actionId, 'That demand is no longer on the table.'); break; }
             if (demand.factionId !== factionId) {
                 recordOrderFailure(world, factionId, actionId, 'That demand was not addressed to your government.');
                 break;
             }
             const response = payload.response as DemandResponse;
             if (!['accept', 'reject', 'negotiate'].includes(response)) {
                 recordOrderFailure(world, factionId, actionId, 'Unknown response.');
                 break;
             }
             const result = resolveDemand(corp, payload.demandId, response, world, world.nowSeconds);
             if (!result.ok) { recordOrderFailure(world, factionId, actionId, result.error); break; }
             console.log(`[Order] Faction ${factionId} ${response}ed corporate demand ${demand.type}`);
             break;
        }

        case 'CORP_RESPOND_PROPOSAL': {
             const corp = ensureCorporateState(world);
             const proposal = corp.megaprojects.get(payload.proposalId);
             if (!proposal) { recordOrderFailure(world, factionId, actionId, 'That proposal is no longer on the table.'); break; }
             if (proposal.factionId !== factionId) {
                 recordOrderFailure(world, factionId, actionId, 'That proposal was not put to your government.');
                 break;
             }
             const response = payload.response as ProposalResponse;
             if (!['approve', 'delay', 'modify', 'reject'].includes(response)) {
                 recordOrderFailure(world, factionId, actionId, 'Unknown response.');
                 break;
             }
             const result = respondToMegaproject(corp, payload.proposalId, response, world, world.nowSeconds);
             if (!result.ok) { recordOrderFailure(world, factionId, actionId, result.error); break; }
             console.log(`[Order] Faction ${factionId} ${response}d megaproject "${proposal.name}"`);
             break;
        }

        case 'CORP_RESOLVE_CRISIS': {
             const corp = ensureCorporateState(world);
             const crisis = corp.crises.get(payload.crisisId);
             if (!crisis) { recordOrderFailure(world, factionId, actionId, 'That crisis is no longer live.'); break; }
             if (crisis.factionId !== factionId) {
                 recordOrderFailure(world, factionId, actionId, 'That crisis is not yours to settle.');
                 break;
             }
             const result = resolveCorporateCrisis(corp, payload.crisisId, payload.optionId, world, world.nowSeconds);
             if (!result.ok) { recordOrderFailure(world, factionId, actionId, result.error); break; }
             console.log(`[Order] Faction ${factionId} settled corporate crisis ${crisis.type} via ${payload.optionId}`);
             break;
        }

        case 'CORP_BUY_SHARES': {
             const corp = ensureCorporateState(world);
             const result = buyShares(corp, world, payload.companyId, factionId, Number(payload.shareCount) || 0, world.nowSeconds);
             if (!result.ok) { recordOrderFailure(world, factionId, actionId, result.error); break; }
             console.log(`[Order] Faction ${factionId} bought ${result.shares} shares for ${Math.round(result.cost)}cr`);
             break;
        }

        case 'CORP_SELL_SHARES': {
             const corp = ensureCorporateState(world);
             const result = sellShares(corp, world, payload.companyId, factionId, Number(payload.shareCount) || 0, world.nowSeconds);
             if (!result.ok) { recordOrderFailure(world, factionId, actionId, result.error); break; }
             console.log(`[Order] Faction ${factionId} sold ${result.shares} shares for ${Math.round(result.proceeds)}cr`);
             break;
        }

        case 'CORP_HOSTILE_TAKEOVER': {
             const corp = ensureCorporateState(world);
             const result = hostileTakeover(corp, world, payload.companyId, factionId, world.nowSeconds);
             if (!result.ok) { recordOrderFailure(world, factionId, actionId, result.error); break; }
             console.log(`[Order] Faction ${factionId} bid ${Math.round(result.cost)}cr for control of ${payload.companyId} (control: ${result.controlled})`);
             break;
        }

        case 'CORP_MERGE': {
             const corp = ensureCorporateState(world);
             const result = mergeCompanies(corp, world, payload.survivorId, payload.absorbedId, factionId, world.nowSeconds);
             if (!result.ok) { recordOrderFailure(world, factionId, actionId, result.error); break; }
             console.log(`[Order] Faction ${factionId} merged ${payload.absorbedId} into ${payload.survivorId}`);
             break;
        }

        case 'CORP_SET_HOST_POLICY': {
             const corp = ensureCorporateState(world);
             const result = setHostPolicy(
                 corp, world, factionId, payload.companyId,
                 payload.stance, Number(payload.tariffRate) || 0, world.nowSeconds
             );
             if (!result.ok) { recordOrderFailure(world, factionId, actionId, result.error); break; }
             console.log(`[Order] Faction ${factionId} set policy '${payload.stance}' for foreign company ${payload.companyId}`);
             break;
        }

        case 'CORP_NATIONALIZE': {
             // The state seizes the company outright. Expensive in political
             // capital and in every relationship the company was part of.
             const corp = ensureCorporateState(world);
             const company = corp.companies.get(payload.companyId);
             if (!company) { recordOrderFailure(world, factionId, actionId, 'Company not found.'); break; }
             if (company.foundingFactionId !== factionId) {
                 recordOrderFailure(world, factionId, actionId, 'Only the chartering government can nationalise a company.');
                 break;
             }
             if (company.nationalized) { recordOrderFailure(world, factionId, actionId, 'That company is already in state hands.'); break; }

             // Price the buy-out and check affordability BEFORE any money or
             // stock moves — a half-executed seizure would pay holders out of a
             // treasury that could not cover them.
             const outsideHolders = Object.entries(company.shareholders)
                 .filter(([holderId, shares]) => holderId !== factionId && (shares as number) > 0);
             const compensation = outsideHolders.reduce((sum, [, shares]) => sum + (shares as number) * company.sharePrice, 0);
             const reserves = world.economy.factions.get(factionId)?.reserves;
             if (!reserves || (reserves['CREDITS'] ?? 0) < compensation) {
                 recordOrderFailure(world, factionId, actionId,
                     `Compensating shareholders requires ${Math.ceil(compensation).toLocaleString()} credits.`);
                 break;
             }
             const cost = 40 + Math.round((company.influence ?? 0) * 0.5);
             if (!spendPoliticalCapital(world, factionId, cost, `nationalising ${company.charter.fullName}`)) {
                 recordOrderFailure(world, factionId, actionId, `Nationalisation costs ${cost} political capital.`);
                 break;
             }
             reserves['CREDITS'] -= compensation;
             for (const [holderId, shares] of outsideHolders) {
                 const holderReserves = world.economy.factions.get(holderId)?.reserves;
                 if (holderReserves) holderReserves['CREDITS'] = (holderReserves['CREDITS'] ?? 0) + (shares as number) * company.sharePrice;
                 const st = corp.factionStates.get(holderId);
                 if (st) delete st.companySharesOwned[company.id];
             }
             company.shareholders = { [factionId]: company.sharesOutstanding };
             getOrCreateFactionState(corp, factionId).companySharesOwned[company.id] = company.sharesOutstanding;
             company.nationalized = true;
             company.autonomyLevel = 0;
             company.hasGoneRogue = false;
             company.loyalty = 100;
             company.profitShareToState = 0.6;
             afterOwnershipChange(corp, company, world.nowSeconds);
             corp.eventLog.push({
                 type: 'nationalized',
                 companyId: company.id,
                 payload: { compensation: Math.round(compensation), politicalCapital: cost },
                 timestamp: world.nowSeconds,
             });
             // Seizing private property is never free politically.
             const govN = getGovernment(world, factionId);
             if (govN) govN.approval = Math.max(0, govN.approval - 6);
             console.log(`[Order] Faction ${factionId} nationalised ${company.charter.fullName} for ${Math.round(compensation)}cr`);
             break;
        }

        case 'CORP_REVOKE_CHARTER': {
             const corp = ensureCorporateState(world);
             const company = corp.companies.get(payload.companyId);
             if (!company) { recordOrderFailure(world, factionId, actionId, 'Company not found.'); break; }
             if (company.foundingFactionId !== factionId) {
                 recordOrderFailure(world, factionId, actionId, 'Only the chartering government can revoke a charter.');
                 break;
             }
             const revokeCost = 25 + Math.round((company.influence ?? 0) * 0.4);
             if (!spendPoliticalCapital(world, factionId, revokeCost, `revoking the ${company.charter.baseName} charter`)) {
                 recordOrderFailure(world, factionId, actionId, `Revoking this charter costs ${revokeCost} political capital.`);
                 break;
             }
             company.charterRevocationPending = true;
             company.loyalty = Math.max(0, (company.loyalty ?? 50) - 30);
             company.autonomyLevel = Math.min(100, company.autonomyLevel + 15);
             corp.eventLog.push({
                 type: 'charter_revoked',
                 companyId: company.id,
                 payload: { reason: 'Revoked by the chartering government', politicalCapital: revokeCost },
                 timestamp: world.nowSeconds,
             });
             console.log(`[Order] Faction ${factionId} revoked the charter of ${company.charter.fullName}`);
             break;
        }

        case 'CORP_GRANT_RIGHT':
        case 'CORP_REVOKE_RIGHT': {
             const corp = ensureCorporateState(world);
             const company = corp.companies.get(payload.companyId);
             if (!company) { recordOrderFailure(world, factionId, actionId, 'Company not found.'); break; }
             if (company.foundingFactionId !== factionId) {
                 recordOrderFailure(world, factionId, actionId, 'Only the chartering government can amend a charter.');
                 break;
             }
             const right = payload.right as CorporateRight;
             const def = RIGHT_DEFS[right];
             if (!def) { recordOrderFailure(world, factionId, actionId, 'Unknown charter right.'); break; }

             const granting = actionId === 'CORP_GRANT_RIGHT';
             const has = (company.rights ?? []).includes(right);
             if (granting && has) { recordOrderFailure(world, factionId, actionId, 'The charter already grants that right.'); break; }
             if (!granting && !has) { recordOrderFailure(world, factionId, actionId, 'The charter does not grant that right.'); break; }

             // Amending a charter costs the same capital either way — writing a
             // right in is a concession, writing one out is a fight.
             if (!spendPoliticalCapital(world, factionId, def.charterCost, `amending the ${company.charter.baseName} charter`)) {
                 recordOrderFailure(world, factionId, actionId, `Amending the charter costs ${def.charterCost} political capital.`);
                 break;
             }
             company.rights = granting
                 ? [...(company.rights ?? []), right]
                 : (company.rights ?? []).filter(r => r !== right);
             company.charter.powers = derivePowersFromRights(company.rights);
             company.loyalty = Math.max(0, Math.min(100, (company.loyalty ?? 50) + (granting ? 8 : -12)));
             if (!granting) company.autonomyLevel = Math.min(100, company.autonomyLevel + 4);
             company.influence = computeInfluence(company);
             company.standing = computeStanding(company);
             console.log(`[Order] Faction ${factionId} ${granting ? 'granted' : 'revoked'} right '${right}' for ${company.charter.fullName}`);
             break;
        }

        case 'CORP_SET_PROFIT_SHARE': {
             const corp = ensureCorporateState(world);
             const company = corp.companies.get(payload.companyId);
             if (!company) { recordOrderFailure(world, factionId, actionId, 'Company not found.'); break; }
             if (company.foundingFactionId !== factionId) {
                 recordOrderFailure(world, factionId, actionId, 'Only the chartering government sets the profit share.');
                 break;
             }
             const next = Math.max(0, Math.min(0.6, Number(payload.profitShareToState) || 0));
             const previous = company.profitShareToState ?? 0.15;
             const delta = next - previous;
             // Raising the state's cut is a tax rise on a political actor.
             if (delta > 0) {
                 const cost = Math.ceil(delta * 100);
                 if (!spendPoliticalCapital(world, factionId, cost, `raising the state share in ${company.charter.baseName}`)) {
                     recordOrderFailure(world, factionId, actionId, `Raising the state's share costs ${cost} political capital.`);
                     break;
                 }
                 company.loyalty = Math.max(0, (company.loyalty ?? 50) - delta * 120);
                 company.autonomyLevel = Math.min(100, company.autonomyLevel + delta * 40);
             } else if (delta < 0) {
                 company.loyalty = Math.min(100, (company.loyalty ?? 50) + Math.abs(delta) * 80);
             }
             company.profitShareToState = next;
             company.standing = computeStanding(company);
             console.log(`[Order] Faction ${factionId} set ${company.charter.fullName} profit share to ${(next * 100).toFixed(0)}%`);
             break;
        }

        case 'CORP_SUBSIDIZE': {
             const corp = ensureCorporateState(world);
             const company = corp.companies.get(payload.companyId);
             if (!company) { recordOrderFailure(world, factionId, actionId, 'Company not found.'); break; }
             const amount = Math.max(0, Math.floor(Number(payload.amount) || 0));
             if (amount <= 0) { recordOrderFailure(world, factionId, actionId, 'Subsidy must be positive.'); break; }
             const subsidyReserves = world.economy.factions.get(factionId)?.reserves;
             if (!subsidyReserves || (subsidyReserves['CREDITS'] ?? 0) < amount) {
                 recordOrderFailure(world, factionId, actionId, 'Insufficient credits for the subsidy.');
                 break;
             }
             subsidyReserves['CREDITS'] -= amount;
             company.treasury += amount;
             // Money buys goodwill, and a little of the leash back.
             company.loyalty = Math.min(100, (company.loyalty ?? 50) + Math.min(15, amount / 4_000));
             company.autonomyLevel = Math.max(0, company.autonomyLevel - Math.min(6, amount / 12_000));
             company.standing = computeStanding(company);
             console.log(`[Order] Faction ${factionId} subsidised ${company.charter.fullName} with ${amount}cr`);
             break;
        }

        case 'FACTION_JOIN': {
             console.log(`[Order] New Faction Join: ${payload.name}`);
             if (!world.factions) (world as any).factions = new Map();
             (world as any).factions.set(factionId, { id: factionId, name: payload.name, resources: {} });
             break;
        }

        case 'PLANET_CLAIM': {
             const planet = world.construction.planets.get(payload.planetId);
             if (!planet) return;
             // Only unowned/neutral planets can be claimed outright — owned worlds
             // must be taken by invasion. (Previously any faction could steal any
             // planet with a single order.)
             if (planet.ownerId && planet.ownerId !== 'faction-neutral' && planet.ownerId !== '') {
                 console.warn(`[Security] ${factionId} tried to claim ${planet.name}, already owned by ${planet.ownerId}`);
                 return;
             }
             planet.ownerId = factionId;
             console.log(`[Order] Faction ${factionId} claimed planet ${planet.name}`);
             break;
        }

        case 'DISCOURSE_POST_OPINION': {
             // payload: { content, topic }
             console.log(`[Order] Faction ${factionId} posted opinion on ${payload.topic}`);
             break;
        }

        case 'DISCOURSE_VOTE_OPINION': {
             console.log(`[Order] Faction ${factionId} voted on discourse ${payload.opinionId}`);
             break;
        }

        case 'TRADE_ESTABLISH_ROUTE': {
            // Deduct freighter amount from faction's fleet and establish a background route
            try {
                establishTradeRoute(world, factionId, payload);
                console.log(`[Tick Worker] Established Trade Route from ${payload.startSystemId} to ${payload.endSystemId}`);
            } catch (e: any) {
                console.warn('[Tick Worker] establishTradeRoute failed:', e.message);
            }
            break;
        }

        case 'AIR_LAUNCH_SORTIE': {
            const { parentBaseId, targetId, missionType, numInterceptors, numBombers } = payload;
            const parent = world.movement.fleets.get(parentBaseId); // To support planets we'd check economy.planets
            if (parent && parent.factionId === factionId) {
                // Validate they have enough planes
                const comp = parent.composition || {};
                const availableInts = comp['interceptor'] || 0;
                const availableBombers = comp['bomber'] || 0;

                if (availableInts >= numInterceptors && availableBombers >= numBombers) {
                    // Deduct
                    if (numInterceptors > 0) comp['interceptor'] = availableInts - numInterceptors;
                    if (numBombers > 0) comp['bomber'] = availableBombers - numBombers;

                    // Spawn sortie
                    const sortieId = `sortie-${Date.now()}`;
                    world.movement.sorties.set(sortieId, {
                        id: sortieId,
                        factionId,
                        parentBaseId,
                        missionType,
                        composition: { interceptor: numInterceptors, bomber: numBombers },
                        originSystemId: parent.destinationSystemId || '', 
                        targetId,
                        status: 'outbound',
                        maxRadius: payload.maxRadius || 2, // Default 2 jump limit
                        currentSystemId: parent.destinationSystemId || '',
                        launchedAt: world.nowSeconds
                    });
                    console.log(`[Tick Worker] Launched Air Sortie ${sortieId} from ${parentBaseId} to execute ${missionType}`);
                }
            }
            break;
        }

        case 'INFRA_UPGRADE': {
            // payload: { planetId, serviceId }
            const planet = world.economy.planets.get(payload.planetId);
            if (planet && planet.factionId === factionId) {
                if (planet.services) {
                    const svc = planet.services[payload.serviceId];
                    if (svc) {
                        svc.level += 1;
                        console.log(`[Tick Worker] Upgraded ${svc.serviceId} on planet ${payload.planetId} to level ${svc.level}.`);
                    }
                }
            }
            break;
        }

        case 'INTERNAL_PURGE_FACTION': {
             // payload: { targetFactionId }
             // In a full impl, remove faction or reduce their influence.
             console.log(`[Order] Faction ${factionId} purged internal branch ${payload.targetFactionId}`);
             break;
        }

        case 'RENAME_PLANET': {
            // payload: { planetId, newName }
            // Rename BOTH planet records — economy and construction hold separate
            // copies, and renaming only one made the new name show in some panels
            // but not on the map.
            const econPlanet = world.economy.planets.get(payload.planetId);
            if (econPlanet && econPlanet.factionId === factionId) {
                econPlanet.name = payload.newName;
            }
            const conPlanet = world.construction.planets.get(payload.planetId);
            if (conPlanet && conPlanet.ownerId === factionId) {
                conPlanet.name = payload.newName;
            }
            if (econPlanet || conPlanet) {
                console.log(`[Tick Worker] Faction ${factionId} renamed planet ${payload.planetId} to ${payload.newName}`);
            }
            break;
        }

        default:
            console.warn(`[Tick Worker] No worker-side handler for action: ${actionId}`);
    }
}

/**
 * Authoritative Tick: Evaluates all active planetary sieges using Ground Combat logic.
 * Phase 16: Uses GroundSiegeEngine for complex logistics and tactical stances.
 */
function processSieges(world: GameWorldState) {
    for (const planet of world.construction.planets.values()) {
        const siege = planet.siege;
        if (!siege) continue;

        const cycleBefore = siege.cycleCount;

        // Resolve common per-tick logic (attrition, cycle checks)
        const updatedSiege = GroundSiegeEngine.resolveTick(siege);
        planet.siege = updatedSiege;

        // ── The ground war on the district board ──────────────────────────
        // A tactical cycle just resolved: turn its outcome into movement on
        // the surface. Terrain does the arguing — a defender holding mountain
        // passes and dug-in cities gives ground far more slowly than one
        // caught on open plains.
        if (updatedSiege.districts && updatedSiege.cycleCount > cycleBefore) {
            const surface = generateSurface(planet.id, planet.planetType, planet.tags);
            const war = updatedSiege.districts;
            const last = updatedSiege.battleLog[updatedSiege.battleLog.length - 1];
            const attackerLosses = last?.attackerLosses ?? 0;
            const defenderLosses = last?.defenderLosses ?? 0;

            // Swing: who bled less this cycle, damped by the terrain the
            // defender is standing on.
            const terrainMult = frontDefenseMultiplier(surface, war);
            const total = attackerLosses + defenderLosses;
            const rawSwing = total > 0 ? (defenderLosses - attackerLosses) / total : 0;
            const swing = rawSwing / Math.max(0.5, terrainMult);

            // Deterministic per-cycle jitter so replays match.
            let seed = (updatedSiege.cycleCount * 2654435761) >>> 0;
            const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };

            // ── Positional warfare ────────────────────────────────────────
            // Where the board has pieces on it, the war is fought by them:
            // orders resolve simultaneously, battles happen where formations
            // meet, and districts change hands because someone was pushed off
            // them. The abstract front swing is the fallback for old sieges.
            const res = { captured: [] as number[], liberated: [] as number[], log: [] as string[] };
            const battleLosses = {
                attacker: {} as Record<string, number>,
                defender: {} as Record<string, number>,
            };

            if (Array.isArray(war.formations) && war.formations.length) {
                const stances = {
                    attacker: updatedSiege.attackerState.activeAttackerTactic ?? 'DEFENSIVE_HOLD',
                    defender: updatedSiege.defenderState.activeDefenderTactic ?? 'DEFENSIVE_HOLD',
                } as any;
                const morale = {
                    attacker: updatedSiege.attackerState.morale ?? 100,
                    defender: updatedSiege.defenderState.morale ?? 100,
                };

                // Standing plans move their formations before manual orders,
                // so a commander can set a plan and let it run.
                for (const plan of (war.plans ?? [])) {
                    res.log.push(...tickPlan(surface, war, plan, war.formations));
                }

                res.log.push(...resolveMoves(surface, war, war.formations));

                // Undefended ground falls to whoever marched onto it.
                const walked = claimUndefended(surface, war, war.formations);
                res.captured.push(...walked.captured);
                res.liberated.push(...walked.liberated);

                // Best planning bonus each side brings to the field.
                const planBonus = { attacker: 0, defender: 0 };
                for (const plan of (war.plans ?? [])) {
                    if (!plan.executing) continue;
                    if (!assignedTo(war.formations, plan.id).length) continue;
                    planBonus[plan.side as 'attacker' | 'defender'] = Math.max(
                        planBonus[plan.side as 'attacker' | 'defender'], planningBonus(plan));
                }

                for (const idx of contestedDistricts(war.formations)) {
                    const outcome = resolveDistrictBattle(surface, war, war.formations, idx, stances, morale, rng, planBonus);
                    if (!outcome) continue;
                    if (outcome.captured) {
                        (outcome.holder === 'attacker' ? res.captured : res.liberated).push(idx);
                    }
                    res.log.push(outcome.log);
                    for (const side of ['attacker', 'defender'] as const) {
                        for (const [t, n] of Object.entries(outcome.lossesBySide[side])) {
                            battleLosses[side][t] = (battleLosses[side][t] ?? 0) + (n as number);
                        }
                    }
                }

                war.formations = pruneFormations(war.formations);
                res.log.push(...updateSupply(surface, war, war.formations));
                // Formations that stood still and are fed pull themselves back
                // together; the redeployed and the encircled do not.
                recoverOrganization(war.formations);

                // Army pools follow the pieces, so the HUD and the old engine
                // keep seeing a consistent picture.
                const tally = (side: 'attacker' | 'defender') => {
                    const comp: Record<string, number> = {};
                    let total = 0;
                    for (const f of war.formations!.filter(x => x.side === side)) {
                        comp[f.unitType] = (comp[f.unitType] ?? 0) + f.strength;
                        total += f.strength;
                    }
                    return { comp, total };
                };
                const a = tally('attacker');
                const d = tally('defender');
                updatedSiege.attackerState.unitComposition = a.comp as any;
                updatedSiege.attackerState.totalLandedTroops = a.total;
                updatedSiege.defenderState.unitComposition = d.comp as any;
                updatedSiege.defenderState.garrisonTroops = d.total;

                war.contested = computeFront(surface, war);
            } else {
                const abstract = advanceFront(surface, war, swing, rng);
                res.captured.push(...abstract.captured);
                res.liberated.push(...abstract.liberated);
                res.log.push(...abstract.log);
            }

            // ── Prisoners ────────────────────────────────────────────────
            // Soldiers who break instead of dying end up in the winner's
            // hands. What happens to them is the player's call (POW_DISPOSE).
            const ledger = ensureLedger(world.combat ?? (world.combat = { recruitmentJobs: [] }));
            const takePrisoners = (
                lossesByType: Record<string, number> | undefined,
                moraleAtImpact: number,
                ownerEmpireId: string,
                captorEmpireId: string,
            ) => {
                if (!lossesByType) return 0;
                const taken = capturedFromLosses(lossesByType as any, moraleAtImpact ?? 100);
                let total = 0;
                for (const [unitType, count] of Object.entries(taken)) {
                    if (!count) continue;
                    total += count;
                    ledger.groups.push({
                        id: `pow-${planet.id}-${updatedSiege.cycleCount}-${unitType}-${captorEmpireId}`,
                        ownerEmpireId,
                        captorEmpireId,
                        planetId: planet.id,
                        planetName: planet.name,
                        unitType: unitType as any,
                        count,
                        capturedAtSeconds: world.nowSeconds,
                    });
                }
                return total;
            };

            // With pieces on the board the casualties come from the district
            // battles themselves — and ONLY from them. The abstract engine's
            // cycle losses are discarded when the formation tally overwrites
            // the pools, so counting them too would mint prisoners out of
            // casualties that never happened.
            const usedFormations = Array.isArray(war.formations) && war.formations.length > 0;
            const defTaken = takePrisoners(
                usedFormations ? battleLosses.defender : (last as any)?.defenderLossesByType,
                (last as any)?.defenderMoraleAtImpact ?? updatedSiege.defenderState.morale,
                updatedSiege.defenderEmpireId, updatedSiege.attackerEmpireId,
            );
            const attTaken = takePrisoners(
                usedFormations ? battleLosses.attacker : (last as any)?.attackerLossesByType,
                (last as any)?.attackerMoraleAtImpact ?? updatedSiege.attackerState.morale,
                updatedSiege.attackerEmpireId, updatedSiege.defenderEmpireId,
            );
            if (defTaken || attTaken) {
                const parts: string[] = [];
                if (defTaken) parts.push(`${defTaken} defenders taken prisoner`);
                if (attTaken) parts.push(`${attTaken} attackers captured`);
                updatedSiege.battleLog.push({
                    cycle: updatedSiege.cycleCount,
                    message: `${parts.join('; ')}.`,
                    event: 'PRISONERS',
                });
            }

            // Overrun development is wrecked: the world the defender built is
            // the world the attacker breaks taking it.
            for (const idx of res.captured) {
                const tile = (planet.tiles ?? []).find((t: any) => t.sectorIndex === idx && t.buildingId);
                if (tile && tile.constructionState === 'active' && rng() < 0.45) {
                    tile.constructionState = 'ruined';
                    updatedSiege.attackerState.devastationCaused += 5;
                }
            }

            const share = occupationShare(surface, war);
            updatedSiege.defenderState.occupationProgress = share;
            if (res.log.length) {
                updatedSiege.battleLog.push({
                    cycle: updatedSiege.cycleCount,
                    message: `${res.log.join(' ')} Attacker holds ${share}% of the surface.`,
                    event: res.captured.length ? 'ADVANCE' : res.liberated.length ? 'COUNTERATTACK' : undefined,
                });
            }
            if (updatedSiege.phase === 'LANDING' && share > 12) updatedSiege.phase = 'ACTIVE_SIEGE';

            // Capital falls → the government collapses and the planet changes hands.
            if (capitalTaken(war)) {
                planet.ownerId = updatedSiege.attackerEmpireId;
                planet.isOccupied = false;
                planet.siege = null;
                planet.stability = Math.max(10, (planet.stability || 60) - 40);
                console.log(`[Tick Worker] CAPITAL DISTRICT FALLS: ${planet.name} taken by ${updatedSiege.attackerEmpireId} (${share}% of surface held)`);
                continue;
            }
        }

        // Resolve Phase transitions
        if (updatedSiege.defenderState.garrisonTroops <= 0) {
            // Occupation phase start
            updatedSiege.phase = 'OCCUPATION';

            if (updatedSiege.districts) {
                // The field army is gone: the remaining districts fall to a
                // mop-up sweep rather than a contested advance. Territory is
                // still the authority on who owns the planet — the capital
                // district has to actually be entered.
                const surface = generateSurface(planet.id, planet.planetType, planet.tags);
                const war = updatedSiege.districts;
                let seed = ((updatedSiege.tickCount + 7919) * 2654435761) >>> 0;
                const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
                advanceFront(surface, war, 1.2, rng);
                updatedSiege.defenderState.occupationProgress = occupationShare(surface, war);
                if (capitalTaken(war)) {
                    planet.ownerId = updatedSiege.attackerEmpireId;
                    planet.isOccupied = false;
                    planet.siege = null;
                    planet.stability = Math.max(10, (planet.stability || 60) - 40);
                    console.log(`[Tick Worker] PLANETARY CAPTURE: ${planet.name} occupied by ${updatedSiege.attackerEmpireId}`);
                }
                continue;
            }

            // Legacy (no district board): abstract occupation timer.
            const infantryCount = updatedSiege.attackerState.unitComposition.INFANTRY || 0;
            const progress = (infantryCount / 1000) * 1.5; // 0.15% per 100 infantry
            updatedSiege.defenderState.occupationProgress += progress;

            if (updatedSiege.defenderState.occupationProgress >= 100) {
                planet.ownerId = updatedSiege.attackerEmpireId;
                planet.isOccupied = false;
                planet.siege = null;
                // Severe stability hit on capture
                planet.stability = Math.max(10, (planet.stability || 60) - 40);
                console.log(`[Tick Worker] PLANETARY CAPTURE: ${planet.name} taken by ${planet.ownerId}`);
            }
        } else if (updatedSiege.attackerState.totalLandedTroops <= 0) {
            console.log(`[Tick Worker] INVASION COLLAPSED: Attackers on ${planet.name} eliminated.`);
            planet.siege = null;
        }
    }
}

// Start
async function main() {
    console.log(`[Tick Worker] Starting (worker id: ${WORKER_ID})...`);
    if (!(await acquireLease())) {
        console.error('[Tick Worker] Another worker already holds the lease — refusing to start.');
        console.error(`[Tick Worker] If no other worker is running, the stale lease expires within ${LEASE_TTL_MS / 60000} minutes.`);
        process.exit(1);
    }
    console.log('[Tick Worker] Galactic Heartbeat Started.');
    setInterval(runGameTick, POLL_INTERVAL_MS);
}

// On shutdown, expire the lease so a replacement worker can start immediately.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
        console.log(`\n[Tick Worker] ${sig} received — releasing lease...`);
        releaseLease().finally(() => process.exit(0));
    });
}

main().catch((e) => {
    console.error('[Tick Worker] Startup failed:', e.message);
    process.exit(1);
});
