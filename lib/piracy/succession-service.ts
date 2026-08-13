// lib/piracy/succession-service.ts
// Pirate system Phase 8 — how bands change hands, split, combine, and end.
//
// Design: docs/pirate-system/organizations.md §3, §6, §7, §8.
//
// Three endings, and a band can reach any of them: collapse back into the
// lawlessness that produced it, fracture along the seam between the people who
// want to keep raiding and the people who want to keep trading, or succeed so
// completely that somebody signs a treaty and it becomes a state — at which
// point the wing that never wanted a patron walks out and starts over.

import type { GameWorldState } from '../game-world-state';
import type { Faction } from '../trade-system/types';
import { Resource } from '../trade-system/types';
import { RNG, seedFromString } from '../trade-system/rng';
import { pushWorldStory } from '../press-system/integration';
import { StorySource, StoryTruth } from '../press-system/types';
import {
    activeOrganizations,
    ensurePiracyState,
    foundOrganization,
    isRecognized,
    PIRATE_FACTION_ID,
} from './organization-service';
import { basesOf, removeBase } from './base-service';
import { contractsOf } from './protection-service';
import { recognizedBy, sponsorshipsOf } from './sponsorship-service';
import type {
    PirateDoctrine,
    PirateLeader,
    PirateOrganization,
    SuccessionContest,
} from './piracy-types';

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** How long a contested succession stays unresolved. */
const CONTEST_SECONDS = 24 * 3600;
/** A wing with this much pressure takes over without a fight. */
const UNCONTESTED_PRESSURE = 50;
const UNCONTESTED_LOYALTY_COST = 5;
const CONTESTED_LOYALTY_COST = 20;

/** Chance per hour that an unhappy band removes its own leader. */
const ASSASSINATION_BASE_PER_HOUR = 0.004;

/** Fracture conditions (docs/pirate-system/organizations.md §6). */
const FRACTURE_LOYALTY = 30;
const FRACTURE_MIN_WING_PRESSURE = 25;
const FRACTURE_SATISFACTION = 35;
/** What a fracture destroys in aggregate rather than divides. */
const FRACTURE_CONTROL_LOSS = 0.6;

/** Merger conditions. */
const MERGE_MIN_STAGE = 4;

/** Legitimization gates. */
const LEGITIMIZE_MIN_CONTROL = 65;
const LEGITIMIZE_MIN_RECOGNITIONS = 2;
const LEGITIMIZE_MIN_CIVIL_PRESSURE = 60;

/** Doctrines that can stand to share a command structure. */
const COMPATIBLE: Record<PirateDoctrine, PirateDoctrine[]> = {
    raider: ['raider', 'corsair'],
    corsair: ['corsair', 'raider', 'merchant'],
    smuggler: ['smuggler', 'merchant'],
    merchant: ['merchant', 'smuggler', 'corsair'],
    traditionalist: ['traditionalist'],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wingsByPressure(org: PirateOrganization) {
    return [...org.factions].sort((a, b) => b.pressure - a.pressure);
}

function pressureOf(org: PirateOrganization, doctrine: PirateDoctrine): number {
    return org.factions.find(f => f.doctrine === doctrine)?.pressure ?? 0;
}

function generateSuccessor(
    world: GameWorldState,
    org: PirateOrganization,
    doctrine: PirateDoctrine
): PirateLeader {
    const rng = new RNG(seedFromString(`piracy|successor|${org.id}|${doctrine}|${world.nowSeconds}`));
    const previous = org.leader;
    return {
        id: `pleader-${org.id}-${world.nowSeconds}`,
        // A successor inherits the reputation of the chair, not of the person.
        name: previous ? `${previous.name.split(' ')[0]}'s successor` : 'The New Captain',
        doctrine,
        competence: rng.nextInt(25, 85),
        ruthlessness: rng.nextInt(20, 95),
        reputation: Math.round((previous?.reputation ?? 10) * 0.5),
    };
}

// ─── Succession ──────────────────────────────────────────────────────────────

/**
 * The chair is empty. Either somebody obviously has the votes, or two wings
 * spend a season proving they do not.
 */
export function openSuccession(world: GameWorldState, org: PirateOrganization): void {
    const piracy = ensurePiracyState(world);
    if (piracy.successions.has(org.id)) return;

    const ranked = wingsByPressure(org);
    const front = ranked[0];

    if (front && front.pressure >= UNCONTESTED_PRESSURE) {
        org.leader = generateSuccessor(world, org, front.doctrine);
        org.crewLoyalty = Math.max(0, org.crewLoyalty - UNCONTESTED_LOYALTY_COST);
        console.log(`[Piracy] ${org.name} hands command to the ${front.doctrine} wing`);
        return;
    }

    const contest: SuccessionContest = {
        organizationId: org.id,
        startedAtSeconds: world.nowSeconds,
        resolvesAtSeconds: world.nowSeconds + CONTEST_SECONDS,
        contenders: ranked.slice(0, 2).map(w => w.doctrine),
    };
    piracy.successions.set(org.id, contest);
    org.leader = null;
    org.crewLoyalty = Math.max(0, org.crewLoyalty - CONTESTED_LOYALTY_COST);
    console.log(`[Piracy] ${org.name} has no clear successor — ${contest.contenders.join(' vs ')}`);
}

/** A band without a leader cannot be anything larger than a fleet. */
export function isInSuccession(world: GameWorldState, organizationId: string): boolean {
    return ensurePiracyState(world).successions.has(organizationId);
}

/**
 * Remove a leader: killed in a raid, captured, assassinated, or simply gone.
 * Every route out of the chair opens a succession.
 */
export function removeLeader(
    world: GameWorldState,
    org: PirateOrganization,
    fate: 'killed' | 'captured' | 'deposed'
): void {
    if (!org.leader) return;
    console.log(`[Piracy] ${org.leader.name} of ${org.name} is ${fate}`);
    org.leader = null;
    if (fate === 'captured') org.crewLoyalty = Math.max(0, org.crewLoyalty - 10);
    openSuccession(world, org);
}

// ─── Fracture ────────────────────────────────────────────────────────────────

/**
 * Whether the seam has opened: unhappy crews, two wings each big enough to
 * matter, and either a furious plurality or an unresolved contest.
 */
export function shouldFracture(world: GameWorldState, org: PirateOrganization): boolean {
    if (org.crewLoyalty >= FRACTURE_LOYALTY) return false;

    const big = org.factions.filter(f => f.pressure >= FRACTURE_MIN_WING_PRESSURE);
    if (big.length < 2) return false;

    const top = wingsByPressure(org)[0];
    const contested = isInSuccession(world, org.id);
    return contested || top.satisfaction < FRACTURE_SATISFACTION;
}

/**
 * Split the band along its internal seam. Everything divides by pressure share
 * except the things a fracture simply destroys: contested bases, reputation in
 * aggregate, and every contract the parent had signed.
 */
export function fractureOrganization(
    world: GameWorldState,
    org: PirateOrganization
): PirateOrganization[] {
    const piracy = ensurePiracyState(world);
    const contenders = wingsByPressure(org)
        .filter(f => f.pressure >= FRACTURE_MIN_WING_PRESSURE)
        .slice(0, 3);
    if (contenders.length < 2) return [];

    const totalPressure = contenders.reduce((sum, f) => sum + f.pressure, 0) || 1;
    const fleets = [...org.fleetIds];
    const bases = basesOf(world, org);

    // Every counterparty loses its arrangement. A sponsor discovers its asset
    // is now two assets, one of which blames it.
    for (const contract of contractsOf(world, org.id)) {
        for (const routeId of contract.routeIds) {
            const route = world.economy?.tradeRoutes?.get(routeId);
            if (route?.protectedByOrgId === org.id) delete route.protectedByOrgId;
        }
        piracy.protectionContracts.delete(contract.id);
    }
    for (const sponsorship of sponsorshipsOf(world, org.id)) {
        piracy.sponsorships.delete(sponsorship.id);
    }
    for (const tribute of [...piracy.tributes.values()]) {
        if (tribute.organizationId === org.id) piracy.tributes.delete(tribute.id);
    }

    const successors: PirateOrganization[] = [];
    let fleetCursor = 0;
    let baseCursor = 0;

    contenders.forEach((wing, index) => {
        const share = wing.pressure / totalPressure;
        const successor = foundOrganization(
            world,
            org.homeSystemId,
            [],
            wing.doctrine === 'traditionalist' ? 'secession_remnant' : 'mutiny'
        );

        // Ships and ground divide by the share of the crews each wing holds.
        const fleetCount = index === contenders.length - 1
            ? fleets.length - fleetCursor
            : Math.floor(fleets.length * share);
        for (let i = 0; i < fleetCount && fleetCursor < fleets.length; i++, fleetCursor++) {
            const fleetId = fleets[fleetCursor];
            const fleet = world.movement.fleets.get(fleetId);
            if (!fleet) continue;
            fleet.organizationId = successor.id;
            successor.fleetIds.push(fleetId);
        }

        const baseCount = index === contenders.length - 1
            ? bases.length - baseCursor
            : Math.floor(bases.length * share);
        for (let i = 0; i < baseCount && baseCursor < bases.length; i++, baseCursor++) {
            const base = bases[baseCursor];
            base.organizationId = successor.id;
            successor.baseIds.push(base.id);
        }

        // A fracture destroys reputation and clientele in aggregate: clients do
        // not follow a broken organization.
        successor.infamy = org.infamy * share;
        successor.networkControl = org.networkControl * share * FRACTURE_CONTROL_LOSS;
        successor.treasury = org.treasury * share;
        successor.blackMarketLiquidity = org.blackMarketLiquidity * share;
        successor.crewLoyalty = Math.max(35, org.crewLoyalty);
        successor.doctrine = wing.doctrine;
        for (const f of successor.factions) {
            f.pressure = f.doctrine === wing.doctrine ? 60 : 10;
        }

        // Relations survive at half strength — and the successors start at each
        // other's throats.
        for (const [factionId, relation] of Object.entries(org.relations)) {
            successor.relations[factionId] = {
                ...relation,
                standing: Math.round(relation.standing / 2),
                agreements: [],
            };
        }
        successors.push(successor);
    });

    // Anything nobody could claim is destroyed rather than shared.
    for (let i = baseCursor; i < bases.length; i++) {
        removeBase(world, bases[i].id, 'burned in the split');
    }

    org.fleetIds = [];
    org.baseIds = [];
    org.treasury = 0;
    org.dissolvedAtSeconds = world.nowSeconds;
    piracy.successions.delete(org.id);

    pushWorldStory(world, {
        targetEmpireId: PIRATE_FACTION_ID,
        subject: `${org.name} has broken apart into ${successors.map(s => s.name).join(' and ')}`,
        magnitude: 45,
        source: StorySource.RUMOR_MILL,
        truth: StoryTruth.TRUE,
    });
    console.log(`[Piracy] ${org.name} fractures into ${successors.map(s => s.name).join(', ')}`);
    return successors;
}

// ─── Mergers ─────────────────────────────────────────────────────────────────

function sharesGround(world: GameWorldState, a: PirateOrganization, b: PirateOrganization): boolean {
    const systems = new Set<string>([
        a.homeSystemId,
        ...basesOf(world, a).map(base => base.systemId),
    ]);
    if (systems.has(b.homeSystemId)) return true;
    return basesOf(world, b).some(base => systems.has(base.systemId));
}

/**
 * How a region's pirate population consolidates into one confederacy after a
 * period of gang warfare. The larger band absorbs the smaller.
 */
export function tryMerge(
    world: GameWorldState,
    a: PirateOrganization,
    b: PirateOrganization
): PirateOrganization | null {
    if (a.id === b.id || a.dissolvedAtSeconds || b.dissolvedAtSeconds) return null;
    if (a.stage < MERGE_MIN_STAGE && b.stage < MERGE_MIN_STAGE) return null;
    if (!COMPATIBLE[a.doctrine].includes(b.doctrine)) return null;
    if (!sharesGround(world, a, b)) return null;

    const [keeper, absorbed] = a.fleetIds.length >= b.fleetIds.length ? [a, b] : [b, a];

    for (const fleetId of absorbed.fleetIds) {
        const fleet = world.movement.fleets.get(fleetId);
        if (fleet) fleet.organizationId = keeper.id;
        keeper.fleetIds.push(fleetId);
    }
    for (const base of basesOf(world, absorbed)) {
        base.organizationId = keeper.id;
        keeper.baseIds.push(base.id);
    }

    // Sizes are taken BEFORE the absorbed hulls were appended above, otherwise
    // the incoming crews are counted once in the numerator and twice in the
    // denominator and the merged loyalty drifts toward the keeper's value.
    const absorbedSize = Math.max(1, absorbed.fleetIds.length);
    const keeperSize = Math.max(1, keeper.fleetIds.length - absorbed.fleetIds.length);
    keeper.infamy = Math.max(keeper.infamy, absorbed.infamy);
    keeper.treasury += absorbed.treasury;
    keeper.blackMarketLiquidity += absorbed.blackMarketLiquidity;
    keeper.crewLoyalty =
        (keeper.crewLoyalty * keeperSize + absorbed.crewLoyalty * absorbedSize)
        / (keeperSize + absorbedSize);

    for (const [factionId, relation] of Object.entries(absorbed.relations)) {
        if (!keeper.relations[factionId]) keeper.relations[factionId] = relation;
    }

    absorbed.fleetIds = [];
    absorbed.baseIds = [];
    absorbed.treasury = 0;
    absorbed.dissolvedAtSeconds = world.nowSeconds;

    console.log(`[Piracy] ${keeper.name} absorbs ${absorbed.name}`);
    return keeper;
}

// ─── Legitimization ──────────────────────────────────────────────────────────

export interface LegitimizeCheck {
    ok: boolean;
    reason?: string;
}

export function canLegitimize(world: GameWorldState, org: PirateOrganization): LegitimizeCheck {
    if (org.stage < 5) return { ok: false, reason: 'not a state yet' };
    if (org.networkControl < LEGITIMIZE_MIN_CONTROL) return { ok: false, reason: 'controls too little' };
    if (recognizedBy(org).length < LEGITIMIZE_MIN_RECOGNITIONS) {
        return { ok: false, reason: 'not enough recognition' };
    }
    const civil = pressureOf(org, 'merchant') + pressureOf(org, 'corsair') + pressureOf(org, 'smuggler');
    if (civil < LEGITIMIZE_MIN_CIVIL_PRESSURE) return { ok: false, reason: 'the crews would not have it' };
    return { ok: true };
}

export interface LegitimizeResult {
    factionId: string;
    splinter: PirateOrganization | null;
    systemsTransferred: string[];
}

/**
 * Yesterday's pirates become tomorrow's government — and yesterday's pirates'
 * friends become tomorrow's pirates.
 *
 * This is not a reward. Legitimacy costs the organization its deniability and
 * its immunity to conventional strategy: the fees become taxes, which are
 * visible, taxable by treaty and blockadeable in war.
 */
export function legitimize(world: GameWorldState, org: PirateOrganization): LegitimizeResult | null {
    if (!canLegitimize(world, org).ok) return null;
    const piracy = ensurePiracyState(world);

    const factionId = `faction-${org.id.replace(/^porg-/, '')}`;
    const capital = basesOf(world, org)[0]?.systemId ?? org.homeSystemId;

    const faction: Faction = {
        id: factionId,
        name: org.name,
        theatreId: 'theatre-frontier',
        backingRatioPolicy: 0.5,
        reserves: { [Resource.CREDITS]: Math.round(org.treasury) } as Faction['reserves'],
        creditSupply: Math.round(org.treasury * 4),
        liquidity: Math.round(org.blackMarketLiquidity * 100),
        debt: 0,
        stability: 45,
        ideology: 40,          // a state founded by smugglers is not a planned economy
        centralization: 30,
        economicModel: 60,
        capitalSystemId: capital,
        // Everyone remembers. A new state cannot manufacture legitimacy alone.
        infamy: Math.min(100, org.infamy),
        metrics: {
            tradeDependencyIndex: 0.4,
            chokepointDependencyScore: 0.3,
            reserveStressIndex: 0,
            capitalExposureRating: 0.4,
            inflationRate: 0,
            energyBackingRatio: 0,
            confidenceIndex: 40,
            energyLoad: 0,
        },
    };
    world.economy.factions.set(factionId, faction);

    // Ground where the band's grip already exceeded the owner's becomes territory.
    const systemsTransferred: string[] = [];
    for (const sys of world.movement.systems.values()) {
        const grip = sys.pirateInfluence?.[org.id] ?? 0;
        if (grip < LEGITIMIZE_MIN_CONTROL) continue;
        sys.ownerFactionId = factionId;
        systemsTransferred.push(sys.id);
    }

    // The fleets fly a real flag now.
    for (const fleetId of org.fleetIds) {
        const fleet = world.movement.fleets.get(fleetId);
        if (!fleet) continue;
        fleet.factionId = factionId;
        fleet.organizationId = null;
    }

    // Fees become tariffs and tribute becomes taxation: the same credits, now
    // legal, now visible, now something a war can cut off.
    for (const contract of contractsOf(world, org.id)) {
        for (const routeId of contract.routeIds) {
            const route = world.economy?.tradeRoutes?.get(routeId);
            if (route?.protectedByOrgId === org.id) delete route.protectedByOrgId;
        }
        piracy.protectionContracts.delete(contract.id);
    }
    for (const tribute of [...piracy.tributes.values()]) {
        if (tribute.organizationId === org.id) piracy.tributes.delete(tribute.id);
    }
    for (const sponsorship of sponsorshipsOf(world, org.id)) {
        piracy.sponsorships.delete(sponsorship.id);
    }

    // The captain becomes an officer of the state they just invented.
    if (org.leader) {
        const role = org.leader.ruthlessness >= 60 ? 'admiral' : 'governor';
        world.leadership?.leaders?.set(org.leader.id, {
            id: org.leader.id,
            factionId,
            name: org.leader.name,
            role: role as never,
            level: Math.max(1, Math.round(org.leader.competence / 20)),
            xp: 0,
            loyalty: 70,
            status: 'active',
            traits: ['former_pirate'],
            history: [],
            popularity: Math.round(org.leader.reputation),
        } as never);
    }

    // The wing that never wanted a patron does not stay for the coronation.
    const traditionalists = pressureOf(org, 'traditionalist');
    let splinter: PirateOrganization | null = null;
    if (traditionalists > 0) {
        splinter = foundOrganization(world, org.homeSystemId, [], 'secession_remnant');
        splinter.infamy = org.infamy * (traditionalists / 100);
        splinter.treasury = org.treasury * (traditionalists / 100);
        splinter.relations[factionId] = {
            factionId,
            standing: -80,   // they consider the new state a traitor
            agreements: [],
            lastContactTick: world.nowSeconds,
            secret: false,
        };
        // The most concealed bases leave with them.
        const hidden = basesOf(world, org).sort((a, b) => b.concealment - a.concealment);
        const taken = hidden.slice(0, Math.max(1, Math.round(hidden.length * traditionalists / 100)));
        for (const base of taken) {
            base.organizationId = splinter.id;
            splinter.baseIds.push(base.id);
            org.baseIds = org.baseIds.filter(id => id !== base.id);
        }
    }

    // Anything the splinter did not take is wound up here. Left behind, those
    // bases kept an organizationId pointing at a dissolved — then deleted — band:
    // never ticked, never discoverable, never removable, and still emitted to
    // clients as somebody's infrastructure.
    for (const base of basesOf(world, org)) {
        removeBase(world, base.id, 'wound up when the organization became a state');
    }

    org.legitimizedAsFactionId = factionId;
    org.dissolvedAtSeconds = world.nowSeconds;
    org.fleetIds = [];
    org.baseIds = [];
    org.treasury = 0;

    pushWorldStory(world, {
        targetEmpireId: factionId,
        subject: `${org.name} has been recognized as a sovereign state`,
        magnitude: 70,
        source: StorySource.RUMOR_MILL,
        truth: StoryTruth.TRUE,
    });
    console.log(`[Piracy] ${org.name} is now the state of ${factionId}`);

    return { factionId, splinter, systemsTransferred };
}

// ─── Step 11i extension — the internal tick ──────────────────────────────────

/**
 * Leaders die, contests resolve or boil over, compatible neighbours combine,
 * and bands that have won everything decide whether to stop being bands.
 */
export function tickPirateSuccession(world: GameWorldState, deltaSeconds: number): void {
    const piracy = ensurePiracyState(world);
    const hours = Math.max(0, deltaSeconds / 3600);

    for (const org of activeOrganizations(world)) {
        // 1. An unhappy band with a hard leader eventually removes the problem.
        if (org.leader && org.crewLoyalty < 45) {
            const rng = new RNG(seedFromString(`piracy|assassin|${org.id}|${world.nowSeconds}`));
            const chance = ASSASSINATION_BASE_PER_HOUR
                * ((100 - org.crewLoyalty) / 50)
                * (1 + org.leader.ruthlessness / 100)
                * hours;
            if (rng.check(chance)) removeLeader(world, org, 'deposed');
        }

        // 2. A band with no leader at all has a vacancy to fill.
        if (!org.leader && !piracy.successions.has(org.id)) openSuccession(world, org);

        // 3. The seam opens.
        if (shouldFracture(world, org)) {
            fractureOrganization(world, org);
            continue;
        }

        // 4. Winning everything poses its own question.
        if (canLegitimize(world, org).ok) legitimize(world, org);
    }

    // 5. Contests resolve — or, if the crews gave up waiting, do not.
    for (const contest of [...piracy.successions.values()]) {
        const org = piracy.organizations.get(contest.organizationId);
        if (!org || org.dissolvedAtSeconds) {
            piracy.successions.delete(contest.organizationId);
            continue;
        }
        if (world.nowSeconds < contest.resolvesAtSeconds) continue;

        const winner = wingsByPressure(org)
            .find(w => contest.contenders.includes(w.doctrine)) ?? wingsByPressure(org)[0];
        org.leader = generateSuccessor(world, org, winner.doctrine);
        org.doctrine = winner.doctrine;
        piracy.successions.delete(contest.organizationId);
        console.log(`[Piracy] ${org.name} settles on the ${winner.doctrine} wing`);
    }

    // 6. Consolidation: neighbours who can stand each other combine.
    const bands = activeOrganizations(world);
    for (let i = 0; i < bands.length; i++) {
        for (let j = i + 1; j < bands.length; j++) {
            if (bands[i].dissolvedAtSeconds || bands[j].dissolvedAtSeconds) continue;
            tryMerge(world, bands[i], bands[j]);
        }
    }
}
