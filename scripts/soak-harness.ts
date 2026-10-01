// scripts/soak-harness.ts
// Shared by the season-long probes (charter-soak-probe, approval-probe): boots
// the singleton world the way the worker does after loading a snapshot, and
// steps it with the REAL strategic tick — no database, nothing mocked.
//
// What the harness adds around runStrategicTick is exactly what lives inline in
// scripts/game-loop.ts and so cannot be imported without starting a worker:
// fleets advancing between ticks, system ownership derived from planets, and
// the JSON round trip the worker performs after every strategic tick.

import { getGameWorldState } from '../lib/game-world-state-singleton';
import { runStrategicTick } from '../lib/time/tick-processor';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { initRegistries } from '../lib/politics/registry';
import { ensureDiplomacyState } from '../lib/diplomacy/offer-service';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { ensurePressState } from '../lib/press-system/integration';
import { ensureGovernments } from '../lib/government/government-service';
import { ensureHeadsOfState } from '../lib/government/succession-service';
import { ensureCabinets } from '../lib/government/cabinet-service';
import { ensureGovernors } from '../lib/government/governor-service';
import { ensureCohesion } from '../lib/government/cohesion-service';
import { ensureFactionTraits } from '../lib/factions/traits-service';
import { ensurePlanetDemographics } from '../lib/galaxy/population-composition';
import { ensureLaneGraph } from '../lib/movement/lane-graph';
import { advanceFleet } from '../lib/movement/movement-service';
import { ensureCorporateState } from '../lib/economy/corporate/company-registry';
import { seededRandom } from '../lib/economy/corporate/charter-service';
import { resetChronicleBuffer } from '../lib/narrative/chronicle';

export const TICK_SECONDS = 6 * 3600;
/** One season: 315 sim days at four strategic ticks a day. */
export const SEASON_TICKS = 1260;
/** Fleet movement lives inline in the worker; this is its stand-in. */
const MOVE_SUBSTEPS = 12;

const NON_EMPIRES = new Set(['faction-pirates', 'faction-neutral']);

/** Empires as the worker counts them: everything with an economy but the two shells. */
export function empireIds(world: any): string[] {
    return [...world.economy.factions.keys()].filter((id: string) => !NON_EMPIRES.has(id)).sort();
}

/**
 * Parts of the simulation still roll Math.random (share-price noise, AI
 * espionage, unrest notices). Seeding it removes most of the run-to-run noise.
 * Not all of it: a few systems read the wall clock (survey and scan timers,
 * ids), so two runs of one seed agree on the shape of a season — how many
 * empires stand, whether anything threw — not on every event.
 */
export function seedSimulation(seed: string): void {
    Math.random = seededRandom(`soak:${seed}`);
}

/** The same bootstrap the worker runs after loading a snapshot. */
export function bootSoakWorld(options: { claimed?: string[] } = {}): any {
    initRegistries();
    const world = getGameWorldState() as any;

    if (!world.activeCombats) world.activeCombats = new Map();
    if (!world.rivalries) world.rivalries = new Map();
    if (!(world.secessionCrises instanceof Map)) world.secessionCrises = new Map();
    ensureDiplomacyState(world);
    ensureEmpirePostures(world);
    ensurePressState(world);
    ensureGovernments(world);
    ensureHeadsOfState(world);
    ensureCabinets(world);
    ensureGovernors(world);
    ensureCohesion(world);
    ensureCorporateState(world);
    ensureFactionTraits(world);
    ensurePlanetDemographics(world);
    ensureLaneGraph(world.movement.systems);
    if (!world.nowSeconds || world.nowSeconds <= 0) world.nowSeconds = 1_000_000;
    resetChronicleBuffer();

    // Who is human. An empty list means every empire is played by the AI; the
    // worker's own convention is that NO list means nobody is.
    world.claimedFactionIds = options.claimed ?? [];
    return world;
}

/**
 * System ownership is derived from planet ownership by the worker every cycle
 * (recalculateSystemControl in scripts/game-loop.ts). Company expansion, AI
 * expansion and piracy all read it, so the harness derives it the same way.
 */
export function recalculateSystemControl(world: any): void {
    const owners = new Map<string, Set<string>>();
    for (const planet of world.construction.planets.values()) {
        if (!planet.ownerId || planet.ownerId === 'faction-neutral') continue;
        const set = owners.get(planet.systemId) ?? new Set<string>();
        set.add(planet.ownerId);
        owners.set(planet.systemId, set);
    }
    for (const [sysId, system] of world.movement.systems as Map<string, any>) {
        const set = owners.get(sysId);
        system.ownerFactionId = set && set.size === 1 ? [...set][0] : undefined;
        system.isContested = !!set && set.size > 1;
    }
}

/**
 * One strategic tick, as the worker experiences it. Returns the world to keep
 * using (the round trip replaces the object) and the serialized size.
 */
export async function stepSoak(world: any, tickIndex: number): Promise<{ world: any; bytes: number }> {
    const now = world.nowSeconds + TICK_SECONDS;

    // Fleets in transit advance between strategic ticks in the worker.
    for (let s = 0; s < MOVE_SUBSTEPS; s++) {
        for (const [fleetId, fleet] of world.movement.fleets as Map<string, any>) {
            if (!fleet.destinationSystemId) continue;
            world.movement.fleets.set(fleetId, advanceFleet(fleet, TICK_SECONDS / MOVE_SUBSTEPS, world.movement));
        }
    }

    recalculateSystemControl(world);
    await runStrategicTick(new Date(now * 1000), tickIndex, world);

    // The worker round-trips the world through JSON after every strategic
    // tick. Anything that does not survive that is a bug no in-memory test
    // can see.
    const blob = serializeWorld(world);
    return { world: deserializeWorld(blob), bytes: blob.length };
}

/**
 * Silence the simulation's own logging for the length of a run, keeping what
 * it complains about. `restore()` puts the console back; `complaints` maps a
 * normalised error line to how many times it was raised, and `logLines`
 * collects whatever `keep` selects from console.log.
 */
export function quietConsole(keep: (line: string) => boolean = () => false) {
    const real = { log: console.log, warn: console.warn, error: console.error };
    const complaints = new Map<string, number>();
    const logLines: string[] = [];
    console.log = (...args: unknown[]) => {
        const line = args.map(String).join(' ');
        if (keep(line)) logLines.push(line);
    };
    console.warn = () => {};
    console.error = (...args: unknown[]) => {
        const line = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');
        // Collapse ids and numbers so one fault repeated all season is one line.
        const key = line.replace(/[0-9a-f]{12,}/g, '#').replace(/\d+/g, 'N').slice(0, 200);
        complaints.set(key, (complaints.get(key) ?? 0) + 1);
    };
    return {
        complaints,
        logLines,
        restore() { console.log = real.log; console.warn = real.warn; console.error = real.error; },
        realError: real.error,
    };
}
