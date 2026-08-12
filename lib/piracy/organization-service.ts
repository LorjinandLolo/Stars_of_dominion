// lib/piracy/organization-service.ts
// Pirate system Phase 1 — the organization entity, its metrics, and its stages.
//
// Design: docs/pirate-system/organizations.md, metrics.md, systems.md §10.
//
// Before this, the galaxy's raiders were anonymous: fleets spawned under
// 'faction-pirates', preyed on whatever was nearest, died, and left nothing
// behind that a victim could name, investigate, negotiate with, or hunt. This
// module gives them an identity that accumulates — infamy, heat, a treasury, a
// leader, wings that argue — so that later phases have something to attach
// bases, contracts, sponsors and exposure to.
//
// No player orders land here. The visible change is that pirates now have names
// and histories, and that fighting the same organization twice means something.

import type { GameWorldState } from '../game-world-state';
import { RNG, seedFromString } from '../trade-system/rng';
import {
    PiracyWorldState,
    PirateDoctrine,
    PirateInternalFaction,
    PirateLeader,
    PirateOrganization,
    PirateOrigin,
    PirateStage,
    PIRATE_DOCTRINES,
    RaidType,
    STAGE_GATES,
    STAGE_VOTES,
} from './piracy-types';

export const PIRATE_FACTION_ID = 'faction-pirates';

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** Fame fades slowly; the galaxy has a long memory for a bad name. */
const INFAMY_DECAY_PER_HOUR = 0.04;
/** Heat cools while quiet, and much faster once the raids stop. */
const HEAT_DECAY_PER_HOUR = 0.20;
const HEAT_COOLING_BONUS = 2.5;
/** Seconds without a landed raid before an organization counts as lying low. */
const COOLING_WINDOW_SECONDS = 6 * 3600;

/** Credits of loot worth one point of infamy. */
const LOOT_PER_INFAMY = 1800;
const INFAMY_PER_RAID_CAP = 2;
const HEAT_PER_RAID = 1.5;
const HEAT_PER_RAID_VICTIM = 4;

/** Loyalty drifts toward this while the organization is solvent and active. */
const LOYALTY_BASELINE = 60;
const LOYALTY_DRIFT_PER_HOUR = 0.8;
const LOYALTY_PER_FLEET_LOST = 8;
const LOYALTY_BROKE_PENALTY_PER_HOUR = 1.5;
/** A raider without a berth is not forbidden, only unstable. */
export const BASELINE_BERTHS = 2;
const LOYALTY_OVEREXTENSION_PER_HOUR = 1.2;

/** How fast internal pressure chases the revenue mix. */
const PRESSURE_DRIFT = 0.08;
const SATISFACTION_DRIFT = 0.10;

/** How recently a band must have raided for the raider wing to be fed. */
const RAID_RECENCY_SECONDS = 24 * 3600;

/** Ticks below the gate before a demotion lands. */
const STAGE_STRESS_LIMIT = 3;

/** An organization with no fleets and no money this poor is finished. */
const DISSOLVE_TREASURY = 100;
/** How long a dissolved organization stays nameable by intel reports. */
const DISSOLVED_GRACE_SECONDS = 48 * 3600;

// ─── World state ─────────────────────────────────────────────────────────────

export function ensurePiracyState(world: GameWorldState): PiracyWorldState {
    const w = world as unknown as { piracy?: PiracyWorldState };
    if (!w.piracy) {
        w.piracy = {
            organizations: new Map(), bases: new Map(), hostages: new Map(),
            protectionContracts: new Map(), tributes: new Map(),
            blackMarkets: new Map(), smugglingRuns: new Map(), sponsorships: new Map(),
            successions: new Map(), captures: new Map(), bounties: new Map(),
            opportunityIndex: new Map(), emergenceLog: [],
        };
    }
    if (!(w.piracy.blackMarkets instanceof Map)) w.piracy.blackMarkets = new Map();
    if (!(w.piracy.smugglingRuns instanceof Map)) w.piracy.smugglingRuns = new Map();
    if (!(w.piracy.sponsorships instanceof Map)) w.piracy.sponsorships = new Map();
    if (!(w.piracy.successions instanceof Map)) w.piracy.successions = new Map();
    if (!(w.piracy.captures instanceof Map)) w.piracy.captures = new Map();
    if (!(w.piracy.bounties instanceof Map)) w.piracy.bounties = new Map();
    if (!(w.piracy.organizations instanceof Map)) w.piracy.organizations = new Map();
    if (!(w.piracy.bases instanceof Map)) w.piracy.bases = new Map();
    if (!(w.piracy.hostages instanceof Map)) w.piracy.hostages = new Map();
    if (!(w.piracy.protectionContracts instanceof Map)) w.piracy.protectionContracts = new Map();
    if (!(w.piracy.tributes instanceof Map)) w.piracy.tributes = new Map();
    if (!(w.piracy.opportunityIndex instanceof Map)) w.piracy.opportunityIndex = new Map();
    if (!Array.isArray(w.piracy.emergenceLog)) w.piracy.emergenceLog = [];
    return w.piracy;
}

/** Live organizations only — dissolved ones linger for intel, not for logic. */
export function activeOrganizations(world: GameWorldState): PirateOrganization[] {
    return [...ensurePiracyState(world).organizations.values()].filter(o => !o.dissolvedAtSeconds);
}

/** The band a human player IS, if this faction is playing one. */
export function playedOrganization(world: GameWorldState, factionId: string): PirateOrganization | null {
    return activeOrganizations(world).find(org => org.playerFactionId === factionId) ?? null;
}

export function organizationForFleet(world: GameWorldState, fleetId: string): PirateOrganization | null {
    for (const org of ensurePiracyState(world).organizations.values()) {
        if (org.fleetIds.includes(fleetId)) return org;
    }
    return null;
}

// ─── Founding ────────────────────────────────────────────────────────────────

const NAME_ADJECTIVES = [
    'Crimson', 'Ashfall', 'Blackspar', 'Hollow', 'Grey', 'Iron', 'Salt', 'Vanta',
    'Riven', 'Cinder', 'Pale', 'Thorn', 'Bitter', 'Long', 'Broken', 'Silent',
];
const NAME_NOUNS = [
    'Corsairs', 'Gang', 'Company', 'Reavers', 'Kites', 'Wake', 'Hand', 'Run',
    'Brotherhood', 'Concord', 'Freeholders', 'Crows', 'Tide', 'Lanterns',
];
const LEADER_GIVEN = [
    'Sera', 'Oduya', 'Vass', 'Kelen', 'Marrow', 'Idris', 'Tolm', 'Reyes',
    'Quill', 'Ando', 'Baszo', 'Nire', 'Hask', 'Verrin',
];
const LEADER_EPITHET = [
    'the Patient', 'One-Lung', 'the Ledger', 'Shortcount', 'the Quiet',
    'Halfmast', 'the Younger', 'Coldwater', 'Nine-Fingers', 'the Auditor',
];

function generateName(rng: RNG, taken: Set<string>): string {
    for (let attempt = 0; attempt < 12; attempt++) {
        const name = `${NAME_ADJECTIVES[rng.nextInt(0, NAME_ADJECTIVES.length - 1)]} `
            + `${NAME_NOUNS[rng.nextInt(0, NAME_NOUNS.length - 1)]}`;
        if (!taken.has(name)) return name;
    }
    // Every combination in use is not a real scenario, but a duplicate name is
    // worse than an ugly one.
    return `Unnamed Band ${taken.size + 1}`;
}

function generateLeader(rng: RNG, doctrine: PirateDoctrine, orgId: string): PirateLeader {
    return {
        id: `pleader-${orgId}-${rng.nextInt(1000, 9999)}`,
        name: `${LEADER_GIVEN[rng.nextInt(0, LEADER_GIVEN.length - 1)]} `
            + `${LEADER_EPITHET[rng.nextInt(0, LEADER_EPITHET.length - 1)]}`,
        doctrine,
        competence: rng.nextInt(25, 80),
        ruthlessness: rng.nextInt(20, 90),
        reputation: rng.nextInt(5, 30),
    };
}

function startingFactions(dominant: PirateDoctrine): PirateInternalFaction[] {
    // The dominant wing starts with a plurality, the rest split the remainder.
    const others = PIRATE_DOCTRINES.filter(d => d !== dominant);
    const share = (100 - 40) / others.length;
    return [
        { doctrine: dominant, pressure: 40, satisfaction: 55 },
        ...others.map(doctrine => ({ doctrine, pressure: share, satisfaction: 50 })),
    ];
}

/** The wing an origin naturally hands the organization to. */
const ORIGIN_DOCTRINE: Record<PirateOrigin, PirateDoctrine> = {
    frontier_desperation: 'traditionalist',
    war_refugee: 'raider',
    mutiny: 'raider',
    secession_remnant: 'corsair',
    smuggler_syndicate: 'smuggler',
    sponsored: 'corsair',
    corporate_deniable: 'merchant',
};

export function foundOrganization(
    world: GameWorldState,
    homeSystemId: string,
    fleetIds: string[],
    origin: PirateOrigin = 'frontier_desperation'
): PirateOrganization {
    const piracy = ensurePiracyState(world);
    const rng = new RNG(seedFromString(`piracy|found|${homeSystemId}|${world.nowSeconds}|${piracy.organizations.size}`));

    const taken = new Set([...piracy.organizations.values()].map(o => o.name));
    const name = generateName(rng, taken);
    // Keep digits: the fallback name ("Unnamed Band 5") carries its discriminator
    // in them, and stripping them collapsed every fallback band onto the id
    // `porg-unnamed-band-`, where the next one overwrote the last — fleets, bases
    // and contracts still pointing at it and silently changing hands.
    const id = `porg-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const doctrine = ORIGIN_DOCTRINE[origin];

    const org: PirateOrganization = {
        id,
        name,
        stage: 1,
        origin,
        foundedAtSeconds: world.nowSeconds,
        homeSystemId,
        baseIds: [],
        fleetIds: [...fleetIds],
        infamy: 0,
        heat: 0,
        heatByFaction: {},
        networkControl: 0,
        blackMarketLiquidity: 0,
        crewLoyalty: 70,
        treasury: 0,
        factions: startingFactions(doctrine),
        doctrine,
        leader: generateLeader(rng, doctrine, id),
        relations: {},
        raidsLanded: 0,
        lootTaken: 0,
        fleetsLost: 0,
        lastRaidAtSeconds: world.nowSeconds,
        stageStress: 0,
    };

    piracy.organizations.set(org.id, org);
    for (const fleetId of fleetIds) {
        const fleet = world.movement.fleets.get(fleetId);
        if (fleet) fleet.organizationId = org.id;
    }
    console.log(`[Piracy] ${org.name} founded at ${homeSystemId} (${origin})`);
    return org;
}

// ─── Adoption: nobody raids unaffiliated ─────────────────────────────────────

/**
 * Bind every raider fleet to an organization, and drop the fleets that no
 * longer exist from the organizations that owned them.
 *
 * Doubles as the repair pass for worlds deployed before organizations existed:
 * the raiders already flying under 'faction-pirates' are adopted on the first
 * tick after deploy rather than being deleted and re-rolled.
 */
/**
 * Drop hulls that no longer exist from the rosters that name them, and bill the
 * loss once.
 *
 * This runs FIRST in the pirate block, before any pass reads `fleetIds`.
 * Raiders die earlier in the same tick — suppression during the trade tick,
 * combat before the strategic tick even starts — and reconciling only at the
 * end meant every metric in between counted phantom ships: over-extension
 * loyalty charged for berths that were no longer needed, emergence measuring
 * capacity against a roster of ghosts, and the real loss then billed on top.
 */
export function reconcileRaiderRosters(world: GameWorldState): void {
    const piracy = ensurePiracyState(world);
    const liveFleetIds = new Set(
        [...world.movement.fleets.values()]
            .filter(f => f.factionId === PIRATE_FACTION_ID)
            .map(f => f.id)
    );
    for (const org of piracy.organizations.values()) {
        const before = org.fleetIds.length;
        org.fleetIds = org.fleetIds.filter(id => liveFleetIds.has(id));
        const lost = before - org.fleetIds.length;
        if (lost > 0) {
            org.fleetsLost += lost;
            org.crewLoyalty = Math.max(0, org.crewLoyalty - lost * LOYALTY_PER_FLEET_LOST);
        }
    }
}

export function adoptOrphanRaiders(world: GameWorldState): void {
    const piracy = ensurePiracyState(world);

    reconcileRaiderRosters(world);

    // 2. Adopt anything unaffiliated: an organization already operating in the
    //    same or a neighbouring system takes it, otherwise a new band forms.
    for (const fleet of world.movement.fleets.values()) {
        if (fleet.factionId !== PIRATE_FACTION_ID) continue;
        if (fleet.organizationId && piracy.organizations.has(fleet.organizationId)) continue;
        if (!fleet.currentSystemId) continue;

        const host = nearestOrganization(world, fleet.currentSystemId, 1);
        if (host) {
            host.fleetIds.push(fleet.id);
            fleet.organizationId = host.id;
            host.infamy = Math.min(100, host.infamy + 1);
        } else {
            foundOrganization(world, fleet.currentSystemId, [fleet.id]);
        }
    }
}

/**
 * The organization operating closest to this system, within maxHops over
 * hyperlanes. Organizations grow toward opportunity instead of the galaxy
 * accumulating unrelated gangs — which is also what gives a victim one name to
 * investigate rather than twenty.
 */
export function nearestOrganization(
    world: GameWorldState,
    systemId: string,
    maxHops: number
): PirateOrganization | null {
    // Where each organization has ships, so the walk can stop at the first hit.
    const occupants = new Map<string, PirateOrganization>();
    for (const org of activeOrganizations(world)) {
        for (const fleetId of org.fleetIds) {
            const fleet = world.movement.fleets.get(fleetId);
            if (fleet?.currentSystemId && !occupants.has(fleet.currentSystemId)) {
                occupants.set(fleet.currentSystemId, org);
            }
        }
    }
    if (occupants.size === 0) return null;

    const seen = new Set<string>([systemId]);
    let frontier = [systemId];
    for (let depth = 0; depth <= maxHops; depth++) {
        for (const id of frontier) {
            const org = occupants.get(id);
            if (org) return org;
        }
        const next: string[] = [];
        for (const id of frontier) {
            for (const neighbour of world.movement.systems.get(id)?.hyperlaneNeighbors ?? []) {
                if (seen.has(neighbour)) continue;
                seen.add(neighbour);
                next.push(neighbour);
            }
        }
        if (next.length === 0) break;
        frontier = next;
    }
    return null;
}

/**
 * Fleets an organization can support before crews start to resent it: the
 * berths its bases actually provide, plus the handful a band can hold together
 * with nowhere to rest. Not a hard cap — over-extension drains loyalty rather
 * than being forbidden — but emergence uses it to decide whether to reinforce a
 * band or start a new one.
 *
 * Reads the base records directly rather than importing the base service, which
 * imports this module.
 */
export function supportableFleets(world: GameWorldState, org: PirateOrganization): number {
    const piracy = ensurePiracyState(world);
    let berths = 0;
    for (const baseId of org.baseIds) {
        const base = piracy.bases.get(baseId);
        if (!base) continue;
        if (world.nowSeconds < base.readyAtSeconds || base.integrity <= 0) continue;
        berths += base.berths;
    }
    return BASELINE_BERTHS + berths;
}

// ─── Raid accounting ─────────────────────────────────────────────────────────

export interface RaidRecord {
    /** Credit-equivalent value taken. */
    valueLost: number;
    /** Whose cargo it was. Absent when the flow could not be attributed. */
    victimFactionId?: string;
    /**
     * How aggressive the raid was. Destruction and hostage-taking cost far more
     * heat and fame than a robbery of the same value — which is the whole point
     * of choosing between them.
     */
    raidType?: RaidType;
}

/**
 * Per-raid-type weighting. Kept here rather than in the raid service so the
 * booking stays correct even for callers that do not choose a type.
 */
const RAID_WEIGHTS: Record<RaidType, { infamy: number; heat: number }> = {
    robbery: { infamy: 1.0, heat: 1.0 },
    capture: { infamy: 1.6, heat: 1.8 },
    sabotage: { infamy: 0.8, heat: 1.3 },
    hostage: { infamy: 2.5, heat: 3.5 },
    destruction: { infamy: 3.0, heat: 5.0 },
    economicRaid: { infamy: 1.4, heat: 3.0 },
};

/**
 * Book a landed raid against the organization that landed it. Called from the
 * trade tick, where interdiction is resolved against live flows.
 */
export function recordRaid(world: GameWorldState, organizationId: string, raid: RaidRecord): void {
    const org = ensurePiracyState(world).organizations.get(organizationId);
    if (!org || org.dissolvedAtSeconds) return;

    org.raidsLanded += 1;
    org.lootTaken += raid.valueLost;
    org.treasury += raid.valueLost;
    org.lastRaidAtSeconds = world.nowSeconds;

    const weight = RAID_WEIGHTS[raid.raidType ?? 'robbery'];
    const fame = Math.min(INFAMY_PER_RAID_CAP, raid.valueLost / LOOT_PER_INFAMY) * weight.infamy;
    org.infamy = Math.min(100, org.infamy + fame);
    org.heat = Math.min(100, org.heat + HEAT_PER_RAID * weight.heat);

    if (raid.victimFactionId) {
        const current = org.heatByFaction[raid.victimFactionId] ?? 0;
        org.heatByFaction[raid.victimFactionId] =
            Math.min(100, current + HEAT_PER_RAID_VICTIM * weight.heat);
    }
}

// ─── Step 11a — metrics ──────────────────────────────────────────────────────

/**
 * Decay, drift and wages. Everything profitable an organization does raises
 * heat; the skill is spending it deliberately and then vanishing while it cools.
 */
export function tickPirateMetrics(world: GameWorldState, deltaSeconds: number): void {
    const hours = deltaSeconds / 3600;
    if (hours <= 0) return;

    for (const org of activeOrganizations(world)) {
        org.infamy = Math.max(0, org.infamy - INFAMY_DECAY_PER_HOUR * hours);

        const quiet = world.nowSeconds - org.lastRaidAtSeconds > COOLING_WINDOW_SECONDS;
        const cooling = HEAT_DECAY_PER_HOUR * (quiet ? HEAT_COOLING_BONUS : 1) * hours;
        org.heat = Math.max(0, org.heat - cooling);
        for (const factionId of Object.keys(org.heatByFaction)) {
            const next = org.heatByFaction[factionId] - cooling;
            if (next <= 0) delete org.heatByFaction[factionId];
            else org.heatByFaction[factionId] = next;
        }

        // Loyalty: drifts toward the baseline, then pays for being broke and for
        // carrying more raiders than the organization can actually support.
        const drift = (LOYALTY_BASELINE - org.crewLoyalty) * LOYALTY_DRIFT_PER_HOUR * hours * 0.1;
        org.crewLoyalty += drift;
        if (org.treasury < DISSOLVE_TREASURY) {
            org.crewLoyalty -= LOYALTY_BROKE_PENALTY_PER_HOUR * hours;
        }
        const supportable = supportableFleets(world, org);
        if (org.fleetIds.length > supportable) {
            org.crewLoyalty -= (org.fleetIds.length - supportable) * LOYALTY_OVEREXTENSION_PER_HOUR * hours;
        }
        org.crewLoyalty = Math.max(0, Math.min(100, org.crewLoyalty));
    }
}

// ─── Step 11i — internal politics and stages ─────────────────────────────────

/**
 * An organization becomes what it earns from: pressure chases the revenue mix,
 * and the dominant wing is simply whoever is being paid. Same shape as
 * tickBlocDrift in the empire politics system, so both read the same way.
 */
function driftInternalFactions(world: GameWorldState, org: PirateOrganization, deltaSeconds: number): void {
    const hours = Math.max(0, deltaSeconds / 3600);
    // RECENCY, not a lifetime tally. `raidsLanded` only ever increments, so
    // reading it here latched every band to `raider` after its first robbery —
    // permanently, however long it had since lived off protection and grey
    // trade. The wings follow what the band earns from NOW.
    const recentRaid = world.nowSeconds - org.lastRaidAtSeconds <= RAID_RECENCY_SECONDS ? 1 : 0;
    const externalTies = Object.keys(org.relations).length;

    // Phase 1 revenue is raiding and nothing else; the wings that live on
    // contracts, protection and grey trade have nothing to eat yet, and the
    // traditionalists are fat on the organization having no outside ties at all.
    const targets: Record<PirateDoctrine, number> = {
        // An idle raider wing keeps a floor — there are always people who would
        // rather be robbing something — but it must not match a wing that is
        // actually bringing money in. At the old floor of 20 a band running 60%
        // of a region's commerce still read as a raider band, which is the same
        // "doctrine ignores revenue" defect the recency fix above addresses.
        raider: 10 + recentRaid * 50,
        smuggler: 5 + org.blackMarketLiquidity / 1000,
        corsair: 5 + externalTies * 10,
        merchant: 5 + org.networkControl / 4,
        traditionalist: 20 + (externalTies === 0 ? 25 : 0) + org.baseIds.length * 2,
    };
    const total = PIRATE_DOCTRINES.reduce((sum, d) => sum + targets[d], 0) || 1;

    for (const wing of org.factions) {
        const target = (targets[wing.doctrine] / total) * 100;
        wing.pressure += (target - wing.pressure) * PRESSURE_DRIFT * Math.min(1, hours);

        // Satisfaction moves on outcomes, not on averages.
        let wanted = 50;
        if (wing.doctrine === 'raider') wanted = recentRaid ? 70 : 30;
        if (wing.doctrine === 'traditionalist') wanted = externalTies === 0 ? 65 : 30;
        if (wing.doctrine === 'smuggler') wanted = org.heat > 60 ? 25 : 50;
        wing.satisfaction += (wanted - wing.satisfaction) * SATISFACTION_DRIFT * Math.min(1, hours);
    }

    // Renormalize so shares keep summing to 100 despite the per-wing clamps.
    const sum = org.factions.reduce((acc, f) => acc + f.pressure, 0) || 1;
    for (const wing of org.factions) wing.pressure = (wing.pressure / sum) * 100;

    org.doctrine = org.factions.reduce((top, f) => (f.pressure > top.pressure ? f : top), org.factions[0]).doctrine;
}

function meetsGate(org: PirateOrganization, stage: PirateStage): boolean {
    const gate = STAGE_GATES.find(g => g.stage === stage);
    if (!gate) return false;
    if (org.fleetIds.length < gate.minFleets) return false;
    if (org.baseIds.length < gate.minBases) return false;
    if (org.infamy < gate.minInfamy) return false;
    if (org.networkControl < gate.minNetworkControl) return false;
    if (org.crewLoyalty < gate.minCrewLoyalty) return false;
    if (gate.requiresLeader && !org.leader) return false;
    if (gate.requiresContact && !Object.values(org.relations).some(r => r.standing > 0)) return false;
    if (gate.requiresVote && !winsStageVote(org, stage)) return false;
    if (gate.requiresRecognition && !isRecognized(org)) return false;
    return true;
}

/** At least one real faction has signed something calling this band a state. */
export function isRecognized(org: PirateOrganization): boolean {
    return Object.values(org.relations).some(r => r.agreements.includes('recognition'));
}

/**
 * Becoming something larger is not automatic — the wings have to agree, and
 * the traditionalists never do. A band run by people who want to be left alone
 * stays a corsair network however rich it gets, until its leadership changes.
 */
export function winsStageVote(org: PirateOrganization, stage: PirateStage): boolean {
    if (stage !== 4 && stage !== 5) return true;
    let inFavour = 0;
    for (const wing of org.factions) {
        if (STAGE_VOTES[wing.doctrine]?.[stage]) inFavour += wing.pressure;
    }
    return inFavour > 50;
}

/** The highest stage whose gate — and every gate below it — is satisfied. */
export function eligibleStage(org: PirateOrganization): PirateStage {
    let best: PirateStage = 1;
    for (const gate of STAGE_GATES) {
        if (!meetsGate(org, gate.stage)) break;
        best = gate.stage;
    }
    return best;
}

function evaluateStage(org: PirateOrganization): void {
    const eligible = eligibleStage(org);

    if (eligible > org.stage) {
        org.stage = (org.stage + 1) as PirateStage;
        org.stageStress = 0;
        const gate = STAGE_GATES.find(g => g.stage === org.stage);
        console.log(`[Piracy] ${org.name} is now a ${gate?.name ?? `Stage ${org.stage}`}`);
        return;
    }

    if (eligible < org.stage) {
        // Demotion is not instant — a bad week is not a collapse. Three
        // consecutive ticks below the gate revokes the stage and its verbs.
        org.stageStress += 1;
        if (org.stageStress >= STAGE_STRESS_LIMIT) {
            org.stage = (org.stage - 1) as PirateStage;
            org.stageStress = 0;
            console.log(`[Piracy] ${org.name} falls back to Stage ${org.stage}`);
        }
        return;
    }

    org.stageStress = 0;
}

/**
 * Adoption, internal drift, stage movement, and the end of organizations that
 * ran out of both ships and money.
 */
export function tickPirateOrganizations(world: GameWorldState, deltaSeconds: number): void {
    const piracy = ensurePiracyState(world);

    adoptOrphanRaiders(world);

    for (const org of piracy.organizations.values()) {
        if (org.dissolvedAtSeconds) {
            if (world.nowSeconds - org.dissolvedAtSeconds > DISSOLVED_GRACE_SECONDS) {
                piracy.organizations.delete(org.id);
            }
            continue;
        }

        // Repair pass: a band with no wings cannot drift, vote, promote or
        // fracture — it is inert. Worlds saved while cleanWorldForSave was the
        // only writer of pirate state came back with `factions: []`, so reseed
        // from whatever doctrine survived rather than leaving them broken.
        if (!Array.isArray(org.factions) || org.factions.length === 0) {
            org.factions = startingFactions(org.doctrine ?? 'traditionalist');
            console.log(`[Piracy] ${org.name} reconstitutes its command structure`);
        }

        driftInternalFactions(world, org, deltaSeconds);
        evaluateStage(org);

        if (org.fleetIds.length === 0 && org.treasury < DISSOLVE_TREASURY && org.baseIds.length === 0) {
            org.dissolvedAtSeconds = world.nowSeconds;
            console.log(`[Piracy] ${org.name} dissolved — no ships, no money, no ground`);
        }
    }
}
