// lib/ai/war-ai.ts
// AI empires go to war. WORKER-SIDE.
//
// Until now nothing let an AI empire start a war or take a world: escalation 7
// (war) needs a rivalry of 99+, passive drift stops at 95, and only player
// orders called registerActOfWar. The only AI fleets were a scout and belt
// pickets. A galaxy where the computer never attacks is a galaxy where nobody
// needs a fleet.
//
// One turn per AI-run faction per strategic tick (step10b, after the belt AI):
//
//   1. DECLARE. Past the season's opening grace (WAR.graceDays), an empire
//      off cooldown declares for one of three motives, best first:
//        - transcendence: a rival in its Enlightenment window, at a low
//          rivalry and near parity — the one thing every court agrees on;
//        - grievance: a rival it hates (rivalry ≥ 68, less for hawks) and
//          outguns 1.3×, within WAR.reachHops lanes of its own space;
//        - opportunity: a hawkish court (Militarist/Expansionist posture or an
//          offensive doctrine) falls on a weak neighbour with colonies (2×
//          power, within WAR.preyHops) it has no pact with.
//      Through the player's own DIP_DECLARE_WAR order (lib/ai/ai-orders), plus a
//      notification to the victim.
//   2. ARM. At war (or with a declaration in sight) it builds battle groups
//      at the capital through the player's own orders (lib/ai/ai-fleet-orders):
//      MIL_BUILD_FLEET for the shell and the first hull, then
//      MIL_RECRUIT_FORMATION_UNIT for the rest — the same price, yard gate and
//      build timer a player gets, keeping double the cost in hand as every AI
//      purchase does. A battle group sails only once its last hull is built.
//   3. CAMPAIGN. After WAR.musterDays (wars it declared; none for wars on it),
//      idle battle groups take a mission against the nearest enemy COLONY —
//      a capital only once it is all they hold, and a last world never before
//      WAR.protectLastWorldDays or in a war of opportunity. Combat with
//      anything parked there is automatic. Badly mauled groups go home.
//   4. INVADE. Every worker loop, aiInvasionOrders() lists the battle groups
//      parked on their target with no hostile fleet in-system; the worker runs
//      each through the real MIL_INVASION_PLANET handler, which grinds the
//      orbit down volley by volley, lands troops, and reinforces a landing that
//      is outnumbered or has stalled. aiCommandGroundWars() fights the ground
//      war as a player does — a battle plan at the capital district and a
//      tactic each cycle — for AI attackers and AI defenders alike.
//   5. PEACE. The AI offers peace (and accepts it — aiWarWantsPeace) when its
//      war has done what it was for: the transcendence window closed, the
//      prey is down to its last world; or when it has failed: no world taken
//      in WAR.peaceAfterDays, or its battle groups are broken.
//
// Warfleet ids end in `-war-N`: the expansion AI and the belt AI leave them
// alone (isWarfleetId), and they sort after the scout. MIL_BUILD_FLEET names a
// fleet `fleet-<faction>-<timestamp>`; the fleet builder renames it in the same
// drain, so the shell never shows up under the handler's id.

import { isCivilianFleet } from '../combat/civilian-ships';
import type { GameWorldState } from '@/lib/game-world-state';
import type { Fleet } from '@/lib/movement/types';
import { isAtWar, findActiveTreaty } from '@/lib/diplomacy/offer-service';
import { factionFleetPower } from '@/lib/diplomacy/gambit-service';
import { changeFleetCourse, isFleetOperational } from '@/lib/movement/movement-service';
import { isAIRunFaction, warEnemiesOf } from '@/lib/ai/belt-ambush-ai';
import { isTranscending } from '@/lib/victory/victory-service';
import { queueAIOrder } from '@/lib/ai/ai-orders';
import { fleetBuildQuote, hasPendingRecruits, hasQueuedFleetBuild, queueAIFleetBuild, queueAIFleetTopUp, yardCanLay } from '@/lib/ai/ai-fleet-orders';
import { fireNotification } from '@/lib/time/notification-hooks';
import { StrategicAIService } from '@/lib/ai/strategic-ai-service';
import { isUndergroundSeatId } from '@/lib/rebellion/rebellion-types';
import { CivilizationRegistry } from '@/lib/civilization/registry';
import { createPlan, type BattlePlan } from '@/lib/combat/siege/battle-plans';
import { CAPITAL_SECTOR } from '@/lib/combat/siege/district-front';
import { canEverEnter, type Formation } from '@/lib/combat/siege/formations';
import type { Strongpoint } from '@/lib/combat/siege/strongpoints';
import { applyDefaultDefence } from '@/lib/combat/siege/defence-doctrine';
import { generateSurface } from '@/lib/planet-surface/generator';
import type { TacticalStanceId, GroundUnitType } from '@/lib/combat/siege/siege-types';

const DAY = 86400;

/** Tuning. Sim days throughout (four strategic ticks per day, 15 sim days per real day). */
export const WAR = {
    /** No AI declares in the first N sim days of a season (≈ 3 real days). */
    graceDays: 45,
    /**
     * Rivalry an AI must hold toward a target to declare. In a soak the worst
     * peacetime rivalries reach the low-to-mid 70s by day 120 (sanctions bite
     * at 60), so this is the top slice of real quarrels, not a hair trigger.
     */
    declareRivalry: 68,
    /** Militarist and Expansionist courts reach for the sword sooner. */
    hawkishDiscount: 8,
    /**
     * Opportunism. Most pairs never quarrel (a soak leaves them at the default
     * rivalry of 20 all season), so grievance alone gives a galaxy where only
     * the pariah is ever hated. A hawkish court — Militarist or Expansionist
     * posture, or a civilization whose doctrine is aggressive, mass assault or
     * decisive battle — also falls on a weak NEIGHBOUR it is not friends with,
     * no grievance needed.
     */
    preyRivalry: 20,
    /** …that close (lanes from its own worlds)… */
    preyHops: 5,
    /** …and that outmatched. */
    preyPowerAdvantage: 2,
    /**
     * Opportunism only goes after empires with colonies to lose. A one-world
     * empire — an idle player still on their capital — is never prey; it can
     * still be fought over a real grievance.
     */
    preyMinWorlds: 2,
    /** Any court will take a weak neighbour it already resents this much. */
    dovePreyRivalry: 50,
    /** Against an empire racing for Enlightenment. */
    transcendingDeclareRivalry: 50,
    /** At most this many AI courts go to war to stop one transcendence. */
    maxTranscendenceWars: 2,
    /** Its fleet power must be at least this multiple of the target's. */
    powerAdvantage: 1.3,
    /** Against a transcending empire it will fight at near parity. */
    transcendingPowerAdvantage: 0.9,
    /** Chance per tick an eligible AI actually declares (keeps the herd from moving at once). */
    declareChance: 0.25,
    /** Target must own a world within this many lanes of the AI's own space (capitals start 4-8 apart). */
    reachHops: 8,
    /** Sim days after a war ends (or starts) before the same AI declares again. */
    cooldownDays: 40,
    /** At most this many wars an AI starts itself. */
    maxOwnWars: 1,
    /** Warfleets an AI keeps at most. */
    maxWarfleets: 3,
    /** Without taking a world for this long, an AI sues for peace. */
    peaceAfterDays: 60,
    /** Days between an AI's peace offers to the same enemy. */
    peaceOfferEveryDays: 10,
    /** A warfleet below this strength breaks off and goes home. */
    retreatStrength: 0.35,
    /** Sim seconds between orbital volleys from one fleet (one per worker save, roughly). */
    volleyEverySeconds: 1800,
    /** Sim seconds between reinforcements of one AI siege from one fleet. */
    reinforceEverySeconds: 86400,
    /** A siege that gains no ground for this long is reinforced regardless. */
    stallSeconds: 2 * 86400,
    /** Reinforce while the landing holds less than this multiple of the defenders' strength. */
    reinforceBelowRatio: 1.5,
    /**
     * A relief fleet is sent to a besieged own world only when it is at
     * least this strong relative to the blockading power; nobody flies into
     * a blockade twice their size.
     */
    reliefMinPowerRatio: 0.8,
    /**
     * Sim days an AI's battle groups muster after IT declares, before they
     * sail (~5 real hours): the defender hears the declaration first and has
     * time to answer. Wars declared on the AI get no such pause.
     */
    musterDays: 3,
    /** An empire's last world is safe from AI invasion for this long into the season. */
    protectLastWorldDays: 90,
} as const;

/** Hull mix by the capital yard's tier. Lowercase ship classes (lib/combat/ship-registry). */
const WARFLEET_BY_TIER: Array<{ tier: number; composition: Record<string, number> }> = [
    { tier: 3, composition: { cruiser: 3, battleship: 2 } },
    { tier: 2, composition: { destroyer: 4, cruiser: 3 } },
    { tier: 1, composition: { corvette: 4, destroyer: 4 } },
];

const NON_EMPIRES = new Set(['faction-pirates', 'faction-neutral']);

export function isWarfleetId(id: string): boolean {
    return /-war-\d+$/.test(id);
}

export interface AIWarMission {
    targetPlanetId: string;
    targetSystemId: string;
    enemyId: string;
    assignedAt: number;
    lastVolleyAt?: number;
    /** Best share of the surface held in this siege, and when it was reached. */
    bestShare?: number;
    bestShareAt?: number;
    /** A relief mission: break the blockade over one of our own besieged worlds. */
    relief?: boolean;
}

interface AIWarRecord {
    /** enemyId → when this AI declared on them. */
    declared: Record<string, number>;
    /** enemyId → when the war was last seen running (to stamp its end). */
    lastAtWar: Record<string, number>;
    /** Last time any of its own wars started or ended. */
    lastWarChange: number;
    /** enemyId → last world taken from them. */
    lastCapture: Record<string, number>;
    /** enemyId → last peace offer sent. */
    lastPeaceOffer: Record<string, number>;
    /** enemyId → why this AI declared (absent for wars declared on it). */
    motive?: Record<string, WarMotive>;
}

interface AIWarState {
    firstSeenSeconds: number;
    factions: Record<string, AIWarRecord>;
}

function warState(world: GameWorldState): AIWarState {
    const w = world as any;
    if (!w.aiWar || typeof w.aiWar !== 'object') {
        w.aiWar = { firstSeenSeconds: world.nowSeconds, factions: {} };
    }
    return w.aiWar as AIWarState;
}

function recordFor(world: GameWorldState, factionId: string): AIWarRecord {
    const state = warState(world);
    return state.factions[factionId] ??= { declared: {}, lastAtWar: {}, lastWarChange: 0, lastCapture: {}, lastPeaceOffer: {} };
}

/** Sim seconds since the season opened (or since this module first ran). */
export function seasonAgeSeconds(world: GameWorldState): number {
    const season = (world as any).activeSeason;
    const opened = season?.activatesAt ? Date.parse(season.activatesAt) / 1000 : NaN;
    const start = Number.isFinite(opened) && opened <= world.nowSeconds ? opened : warState(world).firstSeenSeconds;
    return world.nowSeconds - start;
}

function rivalry(world: GameWorldState, a: string, b: string): number {
    const r = world.rivalries.get(`rivalry-${a}-${b}`) ?? world.rivalries.get(`rivalry-${b}-${a}`);
    return r?.rivalryScore ?? 20;
}

function isEmpire(world: GameWorldState, id: string): boolean {
    return !NON_EMPIRES.has(id) && !isUndergroundSeatId(id) && world.economy.factions.has(id);
}

function planetsOf(world: GameWorldState, factionId: string): any[] {
    return [...world.construction.planets.values()].filter(p => p.ownerId === factionId);
}

/** Lanes from any system `factionId` owns a world in, by BFS — systemId → hops. */
function hopsFromTerritory(world: GameWorldState, factionId: string, maxHops: number): Map<string, number> {
    const dist = new Map<string, number>();
    let frontier = [...new Set(planetsOf(world, factionId).map(p => p.systemId).filter(Boolean))].sort();
    for (const id of frontier) dist.set(id, 0);
    for (let hop = 1; hop <= maxHops && frontier.length > 0; hop++) {
        const next: string[] = [];
        for (const id of frontier) {
            for (const n of [...(world.movement.systems.get(id)?.hyperlaneNeighbors ?? [])].sort()) {
                if (dist.has(n)) continue;
                dist.set(n, hop);
                next.push(n);
            }
        }
        frontier = next;
    }
    return dist;
}

/** What MIL_BUILD_FLEET plus the hull recruits will charge, and the finished rating (lib/ai/ai-fleet-orders). */
export function warfleetQuote(composition: Record<string, number>): { cost: Record<string, number>; power: number } {
    const { cost, power } = fleetBuildQuote(composition);
    return { cost, power };
}

function canAfford(reserves: Record<string, number> | undefined, cost: Record<string, number>, headroom: number): boolean {
    // An untracked reserve key is free, as the order handlers charge it.
    return !!reserves && Object.entries(cost).every(([k, v]) => reserves[k] === undefined || reserves[k] >= v * headroom);
}

function warfleetsOf(world: GameWorldState, factionId: string): Fleet[] {
    return [...world.movement.fleets.values()]
        .filter(f => f.factionId === factionId && isWarfleetId(f.id))
        .sort((a, b) => a.id.localeCompare(b.id));
}

/** A battle group still waiting on its hulls: it stays home and is not counted as broken. */
function isFitting(world: GameWorldState, f: Fleet): boolean {
    return hasPendingRecruits(world, f.id) || hasQueuedFleetBuild(world, f.factionId, f.id);
}

/** The biggest hull mix the capital yard can lay right now. */
function warfleetPlanFor(world: GameWorldState, factionId: string, capital: string) {
    return WARFLEET_BY_TIER.find(p => yardCanLay(world, factionId, capital, p.composition)) ?? null;
}

/**
 * Order a battle group built at the capital through the player's orders
 * (MIL_BUILD_FLEET + MIL_RECRUIT_FORMATION_UNIT). Returns the id it will
 * carry, or null when the yard cannot lay any plan or the treasury cannot
 * cover twice the price. Nothing exists until the worker drains the order.
 */
function orderWarfleet(world: GameWorldState, factionId: string): string | null {
    const faction = world.economy.factions.get(factionId) as any;
    const capital = faction?.capitalSystemId;
    if (!faction || !capital || !world.movement.systems.has(capital)) return null;
    const plan = warfleetPlanFor(world, factionId, capital);
    if (!plan) return null;
    if (!canAfford(faction.reserves, warfleetQuote(plan.composition).cost, 2)) return null;

    const used = new Set(warfleetsOf(world, factionId).map(f => f.id));
    let ordinal = 1;
    while (used.has(`fleet-${factionId}-war-${ordinal}`)) ordinal++;
    const id = `fleet-${factionId}-war-${ordinal}`;
    const queued = queueAIFleetBuild(world, {
        factionId,
        fleetId: id,
        name: `${faction.name ?? factionId} Battle Group ${ordinal}`,
        composition: { ...plan.composition },
        systemId: capital,
        reason: `battle group ${ordinal}: ${Object.entries(plan.composition).map(([c, n]) => `${n} ${c}`).join(', ')}`,
        // The war AI's doctrine: offensive, and home to refit when mauled.
        shapeFleet: (fleet: any) => ({
            postureId: 'Aggressive',
            doctrine: { ...fleet.doctrine, type: 'Offensive', retreatThreshold: WAR.retreatStrength },
        }),
    });
    return queued ? id : null;
}

// ─── 1. Declaring ────────────────────────────────────────────────────────────

export type WarMotive = 'transcendence' | 'grievance' | 'opportunity';
export interface WarCandidate { targetId: string; rivalry: number; transcending: boolean; motive: WarMotive; ourPower: number; theirPower: number }

const HAWK_DOCTRINES = new Set(['aggressive', 'mass_assault', 'decisive_battle']);

/** Militarist/Expansionist posture, or a civilization built for offensive war. */
export function isHawkish(world: GameWorldState, factionId: string): boolean {
    const posture = String((world.movement.empirePostures.get(factionId) as any)?.current ?? '');
    if (posture === 'Militarist' || posture === 'Expansionist') return true;
    if (posture === 'Pacifist') return false;
    const civId = (world.economy.factions.get(factionId) as any)?.civilizationId;
    const military: string[] = (civId ? (CivilizationRegistry.getCivilization(civId) as any)?.doctrineBiases?.military : null) ?? [];
    return military.some(b => HAWK_DOCTRINES.has(b));
}

function friendly(world: GameWorldState, a: string, b: string): boolean {
    if (findActiveTreaty(world, a, b, 'non_aggression') || findActiveTreaty(world, a, b, 'mutual_defense')) return true;
    for (const pact of (world as any).tradePacts?.values?.() ?? []) {
        if ([pact.empireAId, pact.empireBId].includes(a) && [pact.empireAId, pact.empireBId].includes(b)) return true;
    }
    return false;
}

/** Who this AI would go to war with right now, best first. Exported for probes. */
export function warCandidates(world: GameWorldState, factionId: string): WarCandidate[] {
    const reach = hopsFromTerritory(world, factionId, WAR.reachHops);
    const hawk = isHawkish(world, factionId);
    const ourPower = factionFleetPower(world, factionId)
        + warfleetQuote(WARFLEET_BY_TIER[WARFLEET_BY_TIER.length - 1].composition).power * (canAffordAnyWarfleet(world, factionId) ? 1 : 0);
    const out: WarCandidate[] = [];
    for (const targetId of world.economy.factions.keys()) {
        if (targetId === factionId || !isEmpire(world, targetId)) continue;
        if (isAtWar(world, factionId, targetId)) continue;
        if (findActiveTreaty(world, factionId, targetId, 'non_aggression')) continue;
        const transcending = isTranscending(world, targetId);
        const score = rivalry(world, factionId, targetId);
        const theirWorlds = planetsOf(world, targetId);
        if (theirWorlds.length === 0) continue;
        const nearest = Math.min(...theirWorlds.map(p => reach.get(p.systemId) ?? Infinity));
        if (!Number.isFinite(nearest)) continue;
        const theirPower = Math.max(1, factionFleetPower(world, targetId));

        let motive: WarMotive | null = null;
        if (transcending) {
            if (score >= WAR.transcendingDeclareRivalry && ourPower >= theirPower * WAR.transcendingPowerAdvantage
                && transcendenceWarsOn(world, targetId) < WAR.maxTranscendenceWars) motive = 'transcendence';
        } else if (score >= WAR.declareRivalry - (hawk ? WAR.hawkishDiscount : 0) && ourPower >= theirPower * WAR.powerAdvantage) {
            motive = 'grievance';
        } else if (theirWorlds.length >= WAR.preyMinWorlds && nearest <= WAR.preyHops && ourPower >= theirPower * WAR.preyPowerAdvantage
            && score >= (hawk ? WAR.preyRivalry : WAR.dovePreyRivalry) && !friendly(world, factionId, targetId)) {
            motive = 'opportunity';
        }
        if (!motive) continue;
        out.push({ targetId, rivalry: score, transcending, motive, ourPower, theirPower });
    }
    const rank: Record<WarMotive, number> = { transcendence: 0, grievance: 1, opportunity: 2 };
    return out.sort((a, b) => rank[a.motive] - rank[b.motive]
        || b.rivalry - a.rivalry || a.theirPower - b.theirPower || a.targetId.localeCompare(b.targetId));
}

/** AI courts already at war with this empire to stop its transcendence. */
function transcendenceWarsOn(world: GameWorldState, targetId: string): number {
    let n = 0;
    for (const [id, rec] of Object.entries(warState(world).factions)) {
        if (rec.motive?.[targetId] === 'transcendence' && isAtWar(world, id, targetId)) n++;
    }
    return n;
}

function canAffordAnyWarfleet(world: GameWorldState, factionId: string): boolean {
    const reserves = (world.economy.factions.get(factionId) as any)?.reserves;
    return canAfford(reserves, warfleetQuote(WARFLEET_BY_TIER[WARFLEET_BY_TIER.length - 1].composition).cost, 2);
}

function nameOf(world: GameWorldState, id: string): string {
    return (world.economy.factions.get(id) as any)?.name ?? id;
}

/**
 * Per-empire war weariness: the government's own (cohesion-service) when it
 * has one, the galaxy-wide figure otherwise — the same read politics-service
 * uses. The galaxy-wide number alone made every AI court tire of every war on
 * the same tick.
 */
export function warFatigueOf(world: GameWorldState, factionId: string): number {
    const own = (world as any).government?.get?.(factionId)?.warFatigue;
    return Number.isFinite(own) ? own : Number(world.shared?.warFatigue ?? 0);
}

/**
 * Declare through the player's own DIP_DECLARE_WAR order (lib/ai/ai-orders.ts):
 * the tech gate, the Bloodmoon ceasefire, the Buthari first-strike gate, the
 * Leo-pantheri honour price, public support and both deed ledgers all apply.
 * The war AI's books and the victim's notice are written only once the handler
 * has actually put the two at war — a refused declaration leaves no trace.
 */
export function aiDeclareWar(world: GameWorldState, factionId: string, targetId: string, motive: WarMotive = 'grievance'): boolean {
    return queueAIOrder(world, {
        factionId,
        actionId: 'DIP_DECLARE_WAR',
        payload: { targetFactionId: targetId },
        reason: `war of ${motive} on ${targetId}`,
        onDone: (w: GameWorldState) => {
            if (!isAtWar(w, factionId, targetId)) {
                console.log(`[War AI] ${factionId}'s declaration on ${targetId} was refused.`);
                return;
            }
            bookDeclaration(w, factionId, targetId, motive);
        },
    });
}

function bookDeclaration(world: GameWorldState, factionId: string, targetId: string, motive: WarMotive): void {
    const rec = recordFor(world, factionId);
    rec.declared[targetId] = world.nowSeconds;
    (rec.motive ??= {})[targetId] = motive;
    rec.lastAtWar[targetId] = world.nowSeconds;
    rec.lastWarChange = world.nowSeconds;
    const stamp = new Date(world.nowSeconds * 1000).toISOString();
    fireNotification({
        id: `ai-war-${factionId}-${targetId}-${world.nowSeconds}`,
        factionId: targetId,
        category: 'military',
        priority: 'urgent',
        title: `${nameOf(world, factionId).toUpperCase()} DECLARES WAR`,
        body: `${nameOf(world, factionId)} has declared war on you. Expect their battle groups on your border; anything you park in their path will fight.`,
        createdAt: stamp,
        read: false,
        linkToTab: 'map',
        payload: { factionId },
    } as any);
    console.log(`[War AI] ${factionId} declared war on ${targetId}.`);
}

// ─── 3. Campaigning ──────────────────────────────────────────────────────────

function isCapitalWorld(world: GameWorldState, planet: any): boolean {
    if (planet.planetType === 'capital' || planet.tags?.includes?.('capital')) return true;
    const capitalSystem = (world.economy.factions.get(planet.ownerId) as any)?.capitalSystemId;
    return !!capitalSystem && planet.systemId === capitalSystem && !planet.tags?.includes?.('colony');
}

/** Nearest world an enemy holds, by lanes from `fromSystemId`. */
function nearestEnemyWorld(world: GameWorldState, fromSystemId: string, enemies: ReadonlySet<string>, factionId: string): any | null {
    const ageOk = seasonAgeSeconds(world) >= WAR.protectLastWorldDays * DAY;
    const motives = recordFor(world, factionId).motive ?? {};
    const holdings = new Map<string, any[]>();
    const worldCount = new Map<string, number>();
    for (const p of world.construction.planets.values() as Iterable<any>) {
        if (!p.ownerId || !enemies.has(p.ownerId)) continue;
        worldCount.set(p.ownerId, (worldCount.get(p.ownerId) ?? 0) + 1);
    }
    for (const p of world.construction.planets.values() as Iterable<any>) {
        if (!p.ownerId || !enemies.has(p.ownerId) || !p.systemId) continue;
        // A last world: never in a war of opportunity (that war is for
        // colonies), and in any war only once the season is old enough.
        if ((worldCount.get(p.ownerId) ?? 0) <= 1 && (!ageOk || motives[p.ownerId] === 'opportunity')) continue;
        // Colonies first: a capital is only a target once it is all they hold.
        if (isCapitalWorld(world, p) && (worldCount.get(p.ownerId) ?? 0) > 1) continue;
        if (p.siege && p.siege.attackerEmpireId && p.siege.attackerEmpireId !== factionId) continue;
        const list = holdings.get(p.systemId) ?? [];
        list.push(p);
        holdings.set(p.systemId, list);
    }
    if (holdings.size === 0) return null;
    const seen = new Set<string>([fromSystemId]);
    let frontier = [fromSystemId];
    for (let hop = 0; hop <= 30 && frontier.length > 0; hop++) {
        const hits = frontier.filter(id => holdings.has(id)).sort();
        if (hits.length > 0) {
            // Weakest-held world in the nearest system: fewest defences first.
            const choices = holdings.get(hits[0])!.sort((a, b) => (a.stability ?? 0) - (b.stability ?? 0) || a.id.localeCompare(b.id));
            return choices[0];
        }
        const next: string[] = [];
        for (const id of frontier) {
            for (const n of [...(world.movement.systems.get(id)?.hyperlaneNeighbors ?? [])].sort()) {
                if (seen.has(n)) continue;
                seen.add(n);
                next.push(n);
            }
        }
        frontier = next;
    }
    return null;
}

function missionOf(f: Fleet): AIWarMission | null {
    return ((f as any).aiMission as AIWarMission | undefined) ?? null;
}

function setMission(world: GameWorldState, f: Fleet, mission: AIWarMission | null): Fleet {
    const updated = { ...f } as any;
    if (mission) updated.aiMission = mission; else delete updated.aiMission;
    world.movement.fleets.set(f.id, updated);
    return updated;
}

function sendTo(world: GameWorldState, f: Fleet, systemId: string, planetId: string | null): boolean {
    if (f.currentSystemId === systemId && !f.destinationSystemId) return true;
    if (f.destinationSystemId === systemId) return true;
    let updated: Fleet;
    try {
        updated = changeFleetCourse(f, systemId, 'hyperlane', world.movement);
    } catch {
        return false;
    }
    if (updated === f) return false; // no route
    (updated as any).orbitingPlanetId = null;
    (updated as any).arrivalOrbitPlanetId = planetId;
    world.movement.fleets.set(f.id, updated);
    return true;
}

export interface WarTurn {
    factionId: string;
    declared: string | null;
    commissioned: string | null;
    missions: Array<{ fleetId: string; planetId: string }>;
    retreated: string[];
    peaceOffered: string | null;
}

/** One faction's war turn. Exported so probes can drive a single faction. */
export function aiWarTurn(world: GameWorldState, factionId: string): WarTurn {
    const turn: WarTurn = { factionId, declared: null, commissioned: null, missions: [], retreated: [], peaceOffered: null };
    const rec = recordFor(world, factionId);
    const enemies = new Set([...warEnemiesOf(world as any, factionId)].filter(id => isEmpire(world, id)));

    // Wars that ended since last turn start the cooldown.
    for (const id of Object.keys(rec.lastAtWar)) {
        if (!enemies.has(id)) {
            delete rec.lastAtWar[id];
            if (rec.motive) delete rec.motive[id];
            rec.lastWarChange = world.nowSeconds;
        }
    }
    for (const id of enemies) rec.lastAtWar[id] = world.nowSeconds;

    // ── 1. Declare ──────────────────────────────────────────────────────────
    const ownWars = Object.keys(rec.declared).filter(id => enemies.has(id)).length;
    const pastGrace = seasonAgeSeconds(world) >= WAR.graceDays * DAY;
    const offCooldown = world.nowSeconds - rec.lastWarChange >= WAR.cooldownDays * DAY || rec.lastWarChange === 0;
    let candidate: WarCandidate | undefined;
    if (pastGrace && offCooldown && ownWars < WAR.maxOwnWars && warFatigueOf(world, factionId) < 40) {
        const stance = StrategicAIService.assessStance(factionId, world).stance;
        const pool = warCandidates(world, factionId);
        // A transcending target overrides the stance check: even a court in
        // 'consolidating' shape will fight to stop the clock.
        candidate = pool.find(c => c.transcending) ?? (stance === 'normal' ? pool[0] : undefined);
        const chance = candidate?.motive === 'transcendence' ? WAR.declareChance * 2
            : candidate?.motive === 'opportunity' ? WAR.declareChance / 2 : WAR.declareChance;
        // Queued, not yet landed: the war begins when the worker drains the
        // AI orders (same strategic tick). Battle groups muster on the
        // candidate below either way, and sail only after musterDays.
        if (candidate && Math.random() < chance && aiDeclareWar(world, factionId, candidate.targetId, candidate.motive)) {
            turn.declared = candidate.targetId;
        }
    }

    // ── 2. Arm ──────────────────────────────────────────────────────────────
    const capital = (world.economy.factions.get(factionId) as any)?.capitalSystemId as string | undefined;
    let fleets = warfleetsOf(world, factionId);
    // One build in flight at a time: a battle group on the slip (or still in
    // the outbox) counts toward the cap, so nothing is ordered twice.
    const wantFleets = enemies.size > 0 ? WAR.maxWarfleets : candidate ? 1 : 0;
    const building = fleets.some(f => isFitting(world, f))
        || hasQueuedFleetBuild(world, factionId, /-war-\d+$/);
    if (fleets.length < wantFleets && !building) {
        const ordered = orderWarfleet(world, factionId);
        if (ordered) {
            turn.commissioned = ordered;
            console.log(`[War AI] ${factionId} orders ${ordered} built at its capital.`);
        }
    }
    // A battle group home at the yard with hulls missing (a refused recruit
    // left it short) is filled back up to the plan, through the same order.
    if (capital) {
        const plan = warfleetPlanFor(world, factionId, capital);
        const reserves = (world.economy.factions.get(factionId) as any)?.reserves;
        for (const f of fleets) {
            if (!plan || isFitting(world, f) || f.destinationSystemId || f.currentSystemId !== capital) continue;
            const missing: Record<string, number> = {};
            for (const [cls, n] of Object.entries(plan.composition)) {
                const short = n - Number((f.composition as any)?.[cls] ?? 0);
                if (short > 0) missing[cls] = short;
            }
            const ships = Object.values(f.composition ?? {}).reduce((a: number, n: any) => a + (Number(n) || 0), 0);
            const planned = Object.values(plan.composition).reduce((a, n) => a + n, 0);
            // Only a fleet short of the plan as a whole; a different but full mix stays as it is.
            if (ships >= planned || Object.keys(missing).length === 0) continue;
            // The quote includes a shell fee a top-up does not pay: a little caution.
            if (!canAfford(reserves, fleetBuildQuote(missing).cost, 2)) continue;
            queueAIFleetTopUp(world, factionId, f, plan.composition);
        }
    }

    // ── 3. Campaign ─────────────────────────────────────────────────────────
    // Enemies whose muster is over: anyone who declared on us at once; anyone
    // we declared on once musterDays have passed.
    const campaignEnemies = new Set([...enemies].filter(id =>
        world.nowSeconds - (rec.declared[id] ?? -Infinity) >= WAR.musterDays * DAY));

    // ── 3a. Relief ──────────────────────────────────────────────────────────
    // A besieged own world comes before any campaign: the strongest idle
    // warfleet that can match the blockade goes to break it. The ground war
    // below decides the rest — with the orbit lost the beachhead starves and
    // the garrison can be reinforced.
    const relieved = new Set<string>();
    for (const planet of planetsOf(world, factionId)) {
        const siege = planet.siege;
        if (!siege || siege.defenderEmpireId !== factionId) continue;
        const covered = fleets.some(f => (f.currentSystemId === planet.systemId && !f.destinationSystemId)
            || f.destinationSystemId === planet.systemId
            || missionOf(f)?.targetPlanetId === planet.id);
        if (covered) continue;
        const blockade = Number(siege.orbit?.attackerPower ?? 0);
        const candidates = fleets
            .filter(f => isFleetOperational(f) && !isFitting(world, f) && (f.strength ?? 1) >= WAR.retreatStrength && !f.destinationSystemId && !relieved.has(f.id))
            .filter(f => (f.basePower ?? 0) * (f.strength ?? 1) >= blockade * WAR.reliefMinPowerRatio)
            .sort((a, b) => (b.basePower ?? 0) * (b.strength ?? 1) - (a.basePower ?? 0) * (a.strength ?? 1));
        const relief = candidates[0];
        if (!relief) continue;
        const sent = setMission(world, relief, {
            targetPlanetId: planet.id,
            targetSystemId: planet.systemId,
            enemyId: siege.attackerEmpireId,
            assignedAt: world.nowSeconds,
            relief: true,
        });
        if (sendTo(world, sent, planet.systemId, planet.id)) {
            relieved.add(relief.id);
            turn.missions.push({ fleetId: relief.id, planetId: planet.id });
            console.log(`[War AI] ${factionId} sends ${(relief as any).name ?? relief.id} to relieve ${planet.name}.`);
        } else {
            setMission(world, world.movement.fleets.get(relief.id)!, null);
        }
    }
    fleets = warfleetsOf(world, factionId);

    for (const f0 of fleets) {
        let f = f0;
        if (!isFleetOperational(f)) continue;
        // Still on the slip: it sails when its last hull is laid.
        if (isFitting(world, f)) continue;
        const mission = missionOf(f);
        // A relief fleet stays on station over its world while the siege
        // lasts, whatever the campaign wants.
        if (mission?.relief) {
            const home = world.construction.planets.get(mission.targetPlanetId) as any;
            if (home?.siege && home.siege.defenderEmpireId === factionId) {
                if (!f.destinationSystemId && f.currentSystemId !== mission.targetSystemId) sendTo(world, f, mission.targetSystemId, mission.targetPlanetId);
                continue;
            }
            f = setMission(world, f, null);
        }

        // Mauled → home to refit, mission dropped.
        if ((f.strength ?? 1) < WAR.retreatStrength) {
            if (mission) f = setMission(world, f, null);
            if (capital && f.currentSystemId !== capital && f.destinationSystemId !== capital) {
                sendTo(world, f, capital, null);
                turn.retreated.push(f.id);
            }
            continue;
        }

        if (campaignEnemies.size === 0) {
            if (mission) f = setMission(world, f, null);
            if (capital && !f.destinationSystemId && f.currentSystemId !== capital) sendTo(world, f, capital, null);
            continue;
        }

        // A mission stays live while its world is still an enemy's.
        const target = mission ? world.construction.planets.get(mission.targetPlanetId) as any : null;
        if (mission && target && campaignEnemies.has(target.ownerId)) {
            if (!f.destinationSystemId && f.currentSystemId !== mission.targetSystemId) {
                if (!sendTo(world, f, mission.targetSystemId, mission.targetPlanetId)) setMission(world, f, null);
            }
            continue;
        }
        if (mission && target && target.ownerId === factionId) {
            rec.lastCapture[mission.enemyId] = world.nowSeconds;
        }
        if (f.destinationSystemId) continue; // en route somewhere; re-task on arrival

        const from = f.currentSystemId ?? capital;
        if (!from) continue;
        const goal = nearestEnemyWorld(world, from, campaignEnemies, factionId);
        if (!goal) { if (mission) setMission(world, f, null); continue; }
        f = setMission(world, f, {
            targetPlanetId: goal.id,
            targetSystemId: goal.systemId,
            enemyId: goal.ownerId,
            assignedAt: world.nowSeconds,
        });
        if (sendTo(world, f, goal.systemId, goal.id)) {
            turn.missions.push({ fleetId: f.id, planetId: goal.id });
        } else {
            setMission(world, world.movement.fleets.get(f.id)!, null);
        }
    }

    // ── 5. Peace ────────────────────────────────────────────────────────────
    for (const enemyId of [...enemies].sort()) {
        if (!aiWarWantsPeace(world, factionId, enemyId)) continue;
        const last = rec.lastPeaceOffer[enemyId] ?? 0;
        if (world.nowSeconds - last < WAR.peaceOfferEveryDays * DAY) continue;
        rec.lastPeaceOffer[enemyId] = world.nowSeconds;
        // The player's DIP_OFFER_PEACE: public support and ideology drift apply.
        if (queueAIOrder(world, { factionId, actionId: 'DIP_OFFER_PEACE', payload: { targetFactionId: enemyId }, reason: `sues ${enemyId} for peace` })) {
            turn.peaceOffered = enemyId;
        }
        break;
    }
    return turn;
}

/**
 * Whether this AI is done with a war: it has dragged on past peaceAfterDays
 * without a world taken, or the AI has no warfleet left standing. The
 * diplomatic AI accepts a peace offer on the same test.
 */
export function aiWarWantsPeace(world: GameWorldState, factionId: string, enemyId: string): boolean {
    if (!isAtWar(world, factionId, enemyId)) return false;
    const rec = recordFor(world, factionId);
    const began = rec.declared[enemyId] ?? Object.values(rec.lastAtWar).reduce((a, b) => Math.min(a, b), world.nowSeconds);
    const lastWin = Math.max(began, rec.lastCapture[enemyId] ?? 0);
    const stale = world.nowSeconds - lastWin >= WAR.peaceAfterDays * DAY;
    const motive = rec.motive?.[enemyId];
    // A war to stop a transcendence is over when the window is.
    if (motive === 'transcendence' && !isTranscending(world, enemyId)) return true;
    // A war of opportunity is over once only their last world is left.
    if (motive === 'opportunity' && planetsOf(world, enemyId).length <= 1) return true;
    const broken = warfleetsOf(world, factionId).every(f => !isFitting(world, f) && ((f.strength ?? 1) < WAR.retreatStrength || !isFleetOperational(f)))
        && world.nowSeconds - began >= 10 * DAY;
    return stale || broken;
}

/** Every AI-run faction takes its war turn. Never throws for one faction's sake. */
export function tickAIWar(world: GameWorldState): WarTurn[] {
    const turns: WarTurn[] = [];
    if (!Array.isArray((world as any).claimedFactionIds)) return turns;
    warState(world);
    for (const factionId of [...world.economy.factions.keys()].sort()) {
        if (!isAIRunFaction(world as any, factionId) || !isEmpire(world, factionId)) continue;
        try {
            turns.push(aiWarTurn(world, factionId));
        } catch (e) {
            console.error(`[War AI] ${factionId} turn failed:`, e);
        }
    }
    return turns;
}

// ─── 4. Invading (every worker loop) ─────────────────────────────────────────

export interface AIInvasionOrder { factionId: string; payload: { fleetId: string; planetId: string; systemId: string } }

/**
 * Warfleets parked on their target with the system clear of hostile fleets.
 * The worker runs each through executeOrder('MIL_INVASION_PLANET') — the
 * player's handler, so orbit, siege and capture follow the same rules. A fleet
 * fires one volley per volleyEverySeconds. Once its own siege is running it
 * only re-issues the order to reinforce (the handler lands a fresh force each
 * time), and only while the landing is outnumbered, once a sim day.
 */
export function aiInvasionOrders(world: GameWorldState): AIInvasionOrder[] {
    const out: AIInvasionOrder[] = [];
    if (!Array.isArray((world as any).claimedFactionIds)) return out;
    for (const f of world.movement.fleets.values()) {
        if (!isWarfleetId(f.id) || !isAIRunFaction(world as any, f.factionId)) continue;
        const mission = missionOf(f);
        if (!mission || f.destinationSystemId || f.currentSystemId !== mission.targetSystemId) continue;
        if (!isFleetOperational(f) || (f.strength ?? 1) < WAR.retreatStrength) continue;
        const planet = world.construction.planets.get(mission.targetPlanetId) as any;
        if (!planet || !planet.ownerId || planet.ownerId === f.factionId) continue;
        if (!isAtWar(world, f.factionId, planet.ownerId)) continue;
        if (planet.siege) {
            // Someone else's siege: stand off. Our own: reinforce it when the
            // landing is outnumbered on the board, at most once a sim day.
            if (planet.siege.attackerEmpireId !== f.factionId) continue;
            if (mission.lastVolleyAt && world.nowSeconds - mission.lastVolleyAt < WAR.reinforceEverySeconds) continue;
            // Progress is the share of the surface held; a landing that has
            // gained nothing for STALL_SECONDS is stuck (pieces that cannot
            // reach the capital count for nothing) and gets fresh troops too.
            const share = Number(planet.siege.defenderState?.occupationProgress ?? 0);
            if (mission.bestShare === undefined || share > mission.bestShare) {
                mission.bestShare = share;
                mission.bestShareAt = world.nowSeconds;
            }
            const stalled = world.nowSeconds - (mission.bestShareAt ?? world.nowSeconds) >= WAR.stallSeconds;
            if (!stalled && !siegeNeedsReinforcement(planet.siege)) continue;
            if (stalled) mission.bestShareAt = world.nowSeconds; // one reinforcement per stall
        } else if (mission.lastVolleyAt && world.nowSeconds - mission.lastVolleyAt < WAR.volleyEverySeconds) continue;
        const hostileHere = [...world.movement.fleets.values()].some(o =>
            o.factionId !== f.factionId && o.currentSystemId === f.currentSystemId && !o.destinationSystemId
            && isFleetOperational(o) && !isCivilianFleet(o) && isAtWar(world, f.factionId, o.factionId));
        if (hostileHere) continue;
        mission.lastVolleyAt = world.nowSeconds;
        out.push({ factionId: f.factionId, payload: { fleetId: f.id, planetId: planet.id, systemId: mission.targetSystemId } });
    }
    return out;
}

function siegeNeedsReinforcement(siege: any): boolean {
    const formations: any[] = siege.districts?.formations ?? [];
    const sum = (side: string) => formations.filter(f => f.side === side).reduce((a, f) => a + (f.strength ?? 0), 0);
    if (formations.length > 0) return sum('attacker') < sum('defender') * WAR.reinforceBelowRatio;
    return (siege.attackerState?.totalLandedTroops ?? 0) < (siege.defenderState?.garrisonTroops ?? 0) * WAR.reinforceBelowRatio;
}

// ─── 4b. Commanding the ground war (every worker loop) ───────────────────────

const ATTACK_TACTICS: TacticalStanceId[] = ['AGGRESSIVE_ASSAULT', 'AGGRESSIVE_ASSAULT', 'MANEUVER_AMBUSH'];
const DEFEND_TACTICS: TacticalStanceId[] = ['DEFENSIVE_HOLD', 'DEFENSIVE_HOLD', 'MANEUVER_AMBUSH', 'AGGRESSIVE_ASSAULT'];
/** Preparation an AI offensive waits for before it goes (the cap is 100). */
export const AI_PLAN_LAUNCH_PREPARATION = 54;
/** Chance per cycle that an AI commander makes a stance read. */
const AI_READ_CHANCE = 0.5;

/**
 * The ground war is positional: formations only move when ordered or assigned
 * to an executing battle plan, and a side that picks no tactic fights every
 * cycle in DEFENSIVE_HOLD. A player does both through MIL_SIEGE_PLAN and the
 * tactic order; the AI did neither, so every AI landing sat on its beachhead
 * forever and an AI defender never manned its front. Each loop, for every
 * siege with an AI-run side:
 *   - attacker: one offensive plan aimed at the capital district, every
 *     formation assigned, launched once it has prepared for a few cycles;
 *   - defender: one front plan, executed at once, so the line is held;
 *   - both: a tactic for the coming cycle (the engine clears it after each).
 */
export function aiCommandGroundWars(world: GameWorldState): void {
    if (!Array.isArray((world as any).claimedFactionIds)) return;
    for (const planet of world.construction.planets.values() as Iterable<any>) {
        const siege = planet.siege;
        if (!siege) continue;
        const sides: Array<['attacker' | 'defender', string]> = [
            ['attacker', siege.attackerEmpireId],
            ['defender', siege.defenderEmpireId],
        ];
        for (const [side, factionId] of sides) {
            if (!factionId || !isAIRunFaction(world as any, factionId)) continue;
            // Stances persist across cycles on a positional siege, so "set it
            // if unset" would lock the AI into its first roll for the whole
            // war. Re-roll once per cycle instead, and make a stance read
            // about half the time — a read is a gamble (right ×1.3, wrong
            // ×0.85), and an AI that always guessed would just be noise.
            const memo: Record<string, number> = (siege as any).aiCommandCycle ?? ((siege as any).aiCommandCycle = {});
            if (memo[side] !== siege.cycleCount) {
                memo[side] = siege.cycleCount;
                const pick = side === 'attacker' ? ATTACK_TACTICS : DEFEND_TACTICS;
                const tactic = pick[Math.floor(Math.random() * pick.length)];
                const guessPool = side === 'attacker' ? DEFEND_TACTICS : ATTACK_TACTICS;
                const guess = Math.random() < AI_READ_CHANCE
                    ? guessPool[Math.floor(Math.random() * guessPool.length)]
                    : undefined;
                if (side === 'attacker') {
                    siege.attackerState.activeAttackerTactic = tactic;
                    siege.attackerState.attackerPrediction = guess;
                } else {
                    siege.defenderState.activeDefenderTactic = tactic;
                    siege.defenderState.defenderPrediction = guess;
                }
            }

            const war = siege.districts;
            if (!war || !Array.isArray(war.formations) || war.formations.length === 0) continue;
            war.plans = war.plans ?? [];
            const points: Strongpoint[] = war.strongpoints ?? [];
            let plan: BattlePlan | undefined = war.plans.find((p: BattlePlan) => p.side === side);
            if (!plan) {
                const surface = generateSurface(planet.id, planet.planetType, planet.tags);
                plan = createPlan(surface, war, side, side === 'attacker' ? 'offensive' : 'front',
                    side === 'attacker' ? [CAPITAL_SECTOR] : [], world.nowSeconds);
                war.plans.push(plan);
            }
            // The defender runs the shared doctrine: capital and strongpoints
            // manned, everything else on the line (the same code a human
            // defender gets until they give an order).
            if (side === 'defender') {
                const surface = generateSurface(planet.id, planet.planetType, planet.tags);
                applyDefaultDefence(surface, war, war.formations, points, world.nowSeconds);
                continue;
            }
            // The invader's objectives, in order: the shield (so the fleet
            // can fire and the defender cannot land), the barracks (so the
            // levy stops), then the capital. Refreshed every loop so a
            // strongpoint that falls drops off the list and the next one
            // becomes the target. A district none of our pieces can ever
            // enter (a shield built in the mountains, and no airborne) is not
            // an objective — it is the fleet's problem.
            {
                const surface = generateSurface(planet.id, planet.planetType, planet.tags);
                const ownTypes = new Set<GroundUnitType>(war.formations.filter((f: Formation) => f.side === 'attacker' && f.strength > 0).map((f: Formation) => f.unitType));
                const reachable = (idx: number) => [...ownTypes].some(t => canEverEnter(t, surface.sectors[idx].terrain));
                const next = (kind: 'shield' | 'barracks') =>
                    points.filter(p => p.kind === kind && p.active && p.holder === 'defender' && reachable(p.sectorIndex)).map(p => p.sectorIndex);
                const objective = next('shield')[0] ?? next('barracks')[0] ?? CAPITAL_SECTOR;
                if (plan.objectives[0] !== objective) plan.objectives = [objective];
            }
            for (const f of war.formations) {
                if (f.side === side && f.strength > 0 && f.planId !== plan.id) {
                    f.planId = plan.id;
                    f.moveTo = null;
                    f.path = [];
                }
            }
            if (!plan.executing && plan.preparation >= AI_PLAN_LAUNCH_PREPARATION) {
                plan.executing = true;
            }
        }
    }
}
