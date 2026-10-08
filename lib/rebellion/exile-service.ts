/**
 * lib/rebellion/exile-service.ts
 * Item 14a: a fallen empire goes into hiding.
 *
 *   The hideout  one of the worlds the empire lost and that still remembers it
 *                (lib/conquest/lost-worlds), out on the edge: the farthest from
 *                the old capital, ties broken toward the one nearest a system
 *                the conqueror does not hold, and still inhabited. The capital
 *                only when it was all they had: that is where the garrison is.
 *   The crew     four to six people who fled with the leader: the empire's own
 *                surviving ministers, generals and spymasters first (they go
 *                missing from its leadership), then people from its streets.
 *   The seat     a 13d seat on a restoration cell there. The conqueror never
 *                learns a person leads it; the crew rides the seat's private
 *                record. Comeback perks wait for the state the movement wins
 *                (a seat has no shard to carry them before then).
 *
 * Server-only: reaches the government services through underground-service.
 */

import type { GameWorldState } from '../game-world-state';
import {
    COMPANION_ROLE_LABEL, isUndergroundSeatId,
    type Companion, type CompanionRole, type CompanionSkill, type ExileRecord, type RebelCell,
} from './rebellion-types';
import { ensureRebellion, formCell, grievanceOf } from './cell-service';
import { rememberedLossesOf, type LostWorld } from '../conquest/lost-worlds';
import { capitalSystemIdFor } from '../galaxy/faction-capitals';
import { generateLeader } from '../leadership/leader-generator';
import { RNG, seedFromString } from '../trade-system/rng';
import { labelFor } from '../time/notification-names';

const NON_PLAYABLE = new Set(['faction-pirates', 'faction-neutral']);
/** Followers a government in exile starts with: more than a cell the streets grew. */
export const EXILE_START_STRENGTH = 25;
export const EXILE_START_CONCEALMENT = 0.8;
export const CREW_MIN = 4;
export const CREW_MAX = 6;
/** Of the crew, at most this many are the empire's own surviving leaders. */
export const CREW_FROM_LEADERS = 3;

// ─── The hideout ─────────────────────────────────────────────────────────────

function hexDistance(a: any, b: any): number {
    if (!a || !b) return 0;
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

function oldCapitalSystem(world: GameWorldState, factionId: string): string | null {
    return (world.economy?.factions?.get?.(factionId) as any)?.capitalSystemId ?? capitalSystemIdFor(factionId) ?? null;
}

/** Hexes from this system to the nearest system the conqueror does not hold. */
function distanceToFreedom(world: GameWorldState, systemId: string, conquerorId: string): number {
    const here = world.movement?.systems?.get?.(systemId);
    let best = Infinity;
    for (const s of (world.movement?.systems?.values?.() ?? []) as Iterable<any>) {
        const owner = s.ownerFactionId ?? s.ownerId ?? null;
        if (owner === conquerorId) continue;
        best = Math.min(best, hexDistance(here, s));
    }
    return best;
}

export interface Hideout {
    planet: any;
    loss: LostWorld;
    /** Why this world, in words for the leader's log. */
    reason: string;
}

/**
 * Where a fallen empire hides, or null when no world remembers it (every loss
 * has faded, or nothing it lost is still inhabited).
 */
export function pickHideout(world: GameWorldState, fromFactionId: string): Hideout | null {
    const capitalSystem = oldCapitalSystem(world, fromFactionId);
    const capital = capitalSystem ? world.movement?.systems?.get?.(capitalSystem) : null;
    const seen = new Set<string>();
    const options: { planet: any; loss: LostWorld; far: number; freedom: number }[] = [];
    for (const loss of rememberedLossesOf(world, fromFactionId)) {
        if (seen.has(loss.planetId)) continue;
        seen.add(loss.planetId);
        const planet: any = world.construction?.planets?.get?.(loss.planetId);
        if (!planet?.ownerId || planet.ownerId === fromFactionId) continue;
        if (NON_PLAYABLE.has(planet.ownerId) || isUndergroundSeatId(planet.ownerId)) continue;
        if (!(Number(planet.population ?? 0) > 0)) continue;
        const system = world.movement?.systems?.get?.(planet.systemId);
        options.push({
            planet, loss,
            far: capital ? hexDistance(capital, system) : 0,
            freedom: distanceToFreedom(world, planet.systemId, planet.ownerId),
        });
    }
    if (options.length === 0) return null;
    // Not the capital, unless it is the only world that remembers them.
    const away = options.filter(o => o.planet.systemId !== capitalSystem);
    const pool = away.length ? away : options;
    pool.sort((a, b) => b.far - a.far || a.freedom - b.freedom || String(a.planet.id).localeCompare(String(b.planet.id)));
    const pick = pool[0];
    const reason = pick.planet.systemId === capitalSystem
        ? `${pick.planet.name} was all that was left: the old capital, under the conqueror's nose.`
        : `${pick.planet.name}, out on the edge of what was ours, ${pick.far} jumps from the old capital, where ${labelFor(pick.planet.ownerId)}'s reach is thinnest.`;
    return { planet: pick.planet, loss: pick.loss, reason };
}

// ─── The crew ────────────────────────────────────────────────────────────────

const ROLE_ORDER: CompanionRole[] = ['minister', 'general', 'spymaster', 'pilot', 'forger', 'believer'];

const SKILL_PROFILE: Record<CompanionRole, Partial<Record<CompanionSkill, number>>> = {
    minister: { talk: 4, tech: 2, infiltration: 1 },
    general: { violence: 4, talk: 2, piloting: 1 },
    spymaster: { infiltration: 4, talk: 3, tech: 1 },
    pilot: { piloting: 4, tech: 2, violence: 1 },
    forger: { tech: 4, infiltration: 2, talk: 1 },
    believer: { talk: 3, violence: 2, infiltration: 2 },
};

const FORMERLY: Record<CompanionRole, string[]> = {
    minister: ['a minister of the old government', 'a senior civil servant', 'a party secretary'],
    general: ['a general of the old army', 'a garrison commander', 'a colonel who refused to surrender'],
    spymaster: ['an officer of the old intelligence service', 'a customs inspector who knew everyone', 'a police detective'],
    pilot: ['a freighter pilot', 'a navy shuttle pilot', 'a smuggler with a clean record'],
    forger: ['a records clerk', 'an engraver at the old mint', 'a systems engineer'],
    believer: ['a preacher', 'a schoolteacher', 'a dock worker who organised the strike'],
};

const LEADER_ROLE_TO_COMPANION: Record<string, { role: CompanionRole; formerly: string }> = {
    HeadOfState: { role: 'minister', formerly: 'a member of the old head of state\'s household' },
    Minister: { role: 'minister', formerly: 'a minister of the old government' },
    EconomicMinister: { role: 'minister', formerly: 'the old minister of the economy' },
    DiplomaticEnvoy: { role: 'minister', formerly: 'the old government\'s envoy' },
    General: { role: 'general', formerly: 'a general of the old army' },
    Admiral: { role: 'general', formerly: 'an admiral of the old navy' },
    IntelligenceDirector: { role: 'spymaster', formerly: 'the old director of intelligence' },
    Governor: { role: 'believer', formerly: 'a governor of the old provinces' },
    CharterCompanyExecutive: { role: 'forger', formerly: 'an executive of a chartered company' },
};

const TRAITS = ['steady', 'reckless', 'devout', 'cynical', 'loyal to a fault', 'quiet', 'proud', 'gentle', 'hot-tempered', 'patient'];

/** Each companion's unfinished business. {world}, {conqueror}, {empire} filled in. */
/** Ids let a job settle a thread (lib/fallen/crew-service.ts THREAD_RESOLUTION). */
const THREADS: { id: string; text: string }[] = [
    { id: 'sister', text: 'Has a sister in a labour camp on {world}, and means to get her out.' },
    { id: 'debt', text: 'Owes a smuggler a great deal of money, and the smuggler knows where the cell meets.' },
    { id: 'oath', text: 'Swore an oath to the old flag that {conqueror} made them break once already.' },
    { id: 'child', text: 'Lost a child in the fighting and has told nobody.' },
    { id: 'writes', text: 'Still writes to someone who works for {conqueror}.' },
    { id: 'codes', text: 'Kept the old government\'s archive codes, and {conqueror} would pay anything for them.' },
    { id: 'believer', text: 'Believes {empire} can be what it was. Not everyone in the cell does.' },
    { id: 'gates', text: 'Was the one who opened the gates when {conqueror} came. Nobody knows.' },
    { id: 'revenge', text: 'Wants revenge on one officer of {conqueror} by name, more than anything else.' },
    { id: 'identity', text: 'Has a forged identity good enough to walk into any office on {world}, once.' },
];

function skillsFor(role: CompanionRole, rng: RNG): Record<CompanionSkill, number> {
    const base: Record<CompanionSkill, number> = { infiltration: 0, violence: 0, piloting: 0, talk: 0, tech: 0 };
    for (const [k, v] of Object.entries(SKILL_PROFILE[role])) base[k as CompanionSkill] = v as number;
    for (const k of Object.keys(base) as CompanionSkill[]) {
        base[k] = Math.max(0, Math.min(5, base[k] + rng.nextInt(-1, 1)));
    }
    return base;
}

/**
 * The people who flee with a fallen leader. The empire's own surviving
 * leaders first (they go missing from its leadership: "fled into hiding"),
 * then people from its streets. Deterministic for a given seed.
 */
export function generateCrew(world: GameWorldState, fromFactionId: string, seed: string, context: { worldName: string; conquerorName: string; empireName: string }): Companion[] {
    const rng = new RNG(seedFromString(`crew|${seed}`));
    const now = world.nowSeconds;
    const size = rng.nextInt(CREW_MIN, CREW_MAX);
    const civ = (world.economy?.factions?.get?.(fromFactionId) as any)?.civilizationId ?? null;
    const crew: Companion[] = [];
    const usedRoles = new Set<CompanionRole>();
    const fill = (text: string) => text
        .replace('{world}', context.worldName).replace('{conqueror}', context.conquerorName).replace('{empire}', context.empireName);
    const threads = [...THREADS];
    const takeThread = () => {
        const t = threads.splice(rng.nextInt(0, threads.length - 1), 1)[0] ?? THREADS[0];
        return { text: fill(t.text), id: t.id };
    };

    // The empire's own people who got out.
    const leaders = [...((world.leadership?.leaders?.values?.() ?? []) as Iterable<any>)]
        .filter(l => l.factionId === fromFactionId && l.status === 'active' && LEADER_ROLE_TO_COMPANION[l.role])
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    for (const leader of leaders) {
        if (crew.length >= Math.min(CREW_FROM_LEADERS, size)) break;
        const map = LEADER_ROLE_TO_COMPANION[leader.role];
        crew.push({
            id: `companion-${seed}-${crew.length}`,
            name: leader.name,
            role: map.role,
            formerly: leader.title ? `${leader.title} of the old government` : map.formerly,
            species: civ,
            skills: skillsFor(map.role, rng),
            traits: [TRAITS[rng.nextInt(0, TRAITS.length - 1)]],
            loyalty: Math.max(50, Math.min(100, Number(leader.loyalty ?? 70))),
            bond: rng.nextInt(30, 50),
            ...(({ text, id }) => ({ thread: text, threadId: id }))(takeThread()),
            status: 'free',
            fromLeaderId: leader.id,
            joinedAtSeconds: now,
        });
        usedRoles.add(map.role);
        leader.status = 'missing';
        leader.assignmentId = undefined;
        leader.history?.push?.({ timestamp: now, description: `Fled into hiding when ${context.empireName} fell.` });
    }

    // People from the streets, filling the roles nobody holds yet.
    const roles = ROLE_ORDER.filter(r => !usedRoles.has(r));
    while (crew.length < size && roles.length) {
        const role = roles.splice(rng.nextInt(0, roles.length - 1), 1)[0];
        // One in four is not of the empire's own people: allies have their reasons.
        const otherCivs = [...new Set([...((world.economy?.factions?.values?.() ?? []) as Iterable<any>)]
            .map(f => f?.civilizationId).filter((c: any) => typeof c === 'string' && c !== civ))].sort() as string[];
        const foreign = rng.next() < 0.25 && otherCivs.length > 0;
        const name = generateLeader({ factionId: fromFactionId, role: 'Governor', seed: `${seed}|${role}|${crew.length}`, nowSeconds: now }).name;
        crew.push({
            id: `companion-${seed}-${crew.length}`,
            name,
            role,
            formerly: FORMERLY[role][rng.nextInt(0, FORMERLY[role].length - 1)],
            species: foreign ? otherCivs[rng.nextInt(0, otherCivs.length - 1)] : civ,
            skills: skillsFor(role, rng),
            traits: [TRAITS[rng.nextInt(0, TRAITS.length - 1)]],
            loyalty: rng.nextInt(55, 90),
            bond: rng.nextInt(10, 35),
            ...(({ text, id }) => ({ thread: text, threadId: id }))(takeThread()),
            status: 'free',
            fromLeaderId: null,
            joinedAtSeconds: now,
        });
    }
    return crew;
}

// ─── Going into hiding ───────────────────────────────────────────────────────

/** The restoration cell on the hideout world: the one already there, or a new one. */
export function exileCellAt(world: GameWorldState, hideout: Hideout, fromFactionId: string, rand: () => number = Math.random): RebelCell {
    const planet = hideout.planet;
    const empireName = labelFor(fromFactionId);
    const existing = [...ensureRebellion(world).cells.values()].find(c => c.status === 'active' && c.planetId === planet.id && !c.seat);
    const cell = existing ?? formCell(world, planet, grievanceOf(world, planet), rand);
    cell.cause = `the restoration of ${empireName}`;
    cell.causeBlocId = null;
    cell.name = `the ${empireName} in hiding`;
    cell.strength = Math.max(cell.strength, EXILE_START_STRENGTH);
    cell.safeHouse.concealment = Math.max(cell.safeHouse.concealment, EXILE_START_CONCEALMENT);
    return cell;
}

/** Attach the exile record (crew and all) to a cell. */
export function attachExile(world: GameWorldState, cell: RebelCell, hideout: Hideout, fromFactionId: string, seed: string): ExileRecord {
    const empireName = labelFor(fromFactionId);
    const conquerorName = labelFor(hideout.planet.ownerId);
    const exile: ExileRecord = {
        fromFactionId,
        fromName: empireName,
        conquerorId: hideout.planet.ownerId,
        conquerorName,
        sinceSeconds: world.nowSeconds,
        crew: generateCrew(world, fromFactionId, seed, { worldName: String(hideout.planet.name ?? 'the hideout'), conquerorName, empireName }),
    };
    cell.exile = exile;
    return exile;
}

/** Plain words for the crew, for the leader's first log line. */
export function crewLine(exile: ExileRecord): string {
    const names = exile.crew.map(c => `${c.name} (${COMPANION_ROLE_LABEL[c.role].toLowerCase()})`);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} came with you.` : `${names[0] ?? 'Nobody'} came with you.`;
}
