// lib/natives/natives.ts
// Stars of Dominion — native species: peoples who never left their world.
//
// A rare few habitable worlds (gardens, jungles, swamps, seas) are already
// home to someone: tree-villages in the canopy, forest giants, river folk on
// stilts, tunnel-dwellers under the hills. They do not build starships and do
// not want yours. What an empire does about them is the point:
//
//   observe    a ship in the system studies them unseen: a research trickle,
//              for as long as nobody has made contact.
//   contact    open relations. Their attitude to you starts from their
//              temper; gifts raise it. Friendly peoples (50+) trade.
//   settle     with their consent (40+), a colony goes up beside them.
//   uplift     a friendly people (70+) can be taught the stars over time and
//              joins your empire as a member species, bringing its gift.
//   invade     troops landed uninvited (under 60) start a guerrilla war on
//              the world's own district board (scripts/game-loop.ts
//              startNativeWar): they know the forest, they are always fed,
//              they never surrender. Beaten, their fate is the victor's:
//              integrate them, displace them, or, for the harshest
//              civilizations only, put them to forced labour.
//
// State lives on the planet (planet.natives). Pure apart from the world it is
// handed; no lib/db.

import type { GameWorldState } from '../game-world-state';
import type { PlanetArchetype } from '../planet-surface/types';
import { RNG, seedFromString } from '../trade-system/rng';
import { CIVILIZATIONS } from '../civilization/data/civilizations';
// A cycle (colonize-service asks nativeConsent), resolved at call time.
import { colonizePlanet } from '../exploration/colonize-service';

/** Pseudo-empire id the natives fight under on the siege board. */
export const NATIVES_PREFIX = 'natives:';
export const nativesIdFor = (planetId: string) => `${NATIVES_PREFIX}${planetId}`;
export const isNativesId = (id?: string | null): boolean => !!id && id.startsWith(NATIVES_PREFIX);

export type NativeKind = 'arboreal' | 'giant' | 'amphibian' | 'burrower';
export type NativeGift = 'warriors' | 'scouts' | 'artisans' | 'miners';
export type NativeStatus = 'free' | 'at_war' | 'pacified' | 'neighbours' | 'uplifted' | 'integrated' | 'enslaved' | 'displaced';
export type NativeFate = 'integrate' | 'enslave' | 'displace';

export interface NativeCivilization {
    speciesName: string;
    kind: NativeKind;
    gift: NativeGift;
    techLevel: 'stone' | 'bronze' | 'iron';
    disposition: 'curious' | 'wary' | 'proud';
    /** Thousands of people. */
    population: number;
    /** Fighters they can put in the field now, and at full strength. */
    warriors: number;
    maxWarriors: number;
    status: NativeStatus;
    /** Someone has made contact: observation is over for everyone. */
    contacted: boolean;
    /** Attitude per empire, 0..100. */
    relations: Record<string, number>;
    /** Empires watching unseen, since when (sim seconds). */
    observers: Record<string, number>;
    uplift?: { factionId: string; progress: number };
    /** The empire that beat them (pacified) or rules them (integrated, enslaved, uplifted, neighbours). */
    overlordId?: string;
}

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** Share of eligible habitable worlds that are already inhabited. */
export const NATIVE_CHANCE = 0.06;
const NATIVE_ARCHETYPES: PlanetArchetype[] = ['continental', 'gaia', 'jungle', 'swamp', 'oceanic'];

export const SETTLE_CONSENT = 40;
export const TRADE_ATTITUDE = 50;
export const UPLIFT_ATTITUDE = 70;
export const WELCOME_ATTITUDE = 60;
export const GIFT_COST = { CREDITS: 800 };
export const UPLIFT_COST = { CREDITS: 4000 };
/** Uplift progress per strategic tick (24 real minutes): about eight real hours. */
export const UPLIFT_PER_TICK = 5;
/** Research hours an observing empire gains per strategic tick. */
export const OBSERVE_RESEARCH_HOURS = 0.6;
/** Credits per strategic tick from trade with a friendly people. */
export const TRADE_CREDITS = 120;
/** Warriors regrown per strategic tick, as a share of full strength. */
export const WARRIOR_REGROWTH = 0.04;
/** Neighbours' attitude to the colony beside them, lost per tick; under this they rise. */
export const NEIGHBOUR_DRIFT = 1;
export const UPRISING_ATTITUDE = 15;

/** Civilizations that may put a beaten people to forced labour. */
export const FORCED_LABOUR_TAGS = ['slavery', 'harsh-rule', 'xenocidal'];

const KIND_BLURB: Record<NativeKind, string> = {
    arboreal: 'Small, fur-covered tree-dwellers whose villages hang in the canopy. Harmless-looking, and deadly with traps and slings in their own forest.',
    giant: 'Towering, long-lived forest giants. Fierce in a fight, loyal to a friend, slow to forget a wrong.',
    amphibian: 'Web-handed river folk on stilt villages, who know every channel, reed bed and tide.',
    burrower: 'Stocky tunnel-dwellers who raise great earth halls and follow the ore deep into the hills.',
};
export const GIFT_LABEL: Record<NativeGift, string> = {
    warriors: 'Warriors (+25% military)',
    scouts: 'Scouts and pathfinders (+15% research)',
    artisans: 'Artisans (+25% luxury goods)',
    miners: 'Miners (+25% metals)',
};
export const describeNatives = (n: NativeCivilization) => KIND_BLURB[n.kind];

const SYL_A = ['Ki', 'Wa', 'Lu', 'Tho', 'Ee', 'Gor', 'Ash', 'Nu', 'Ba', 'Sha', 'Ro', 'Vy', 'Ok', 'Mi', 'Ul', 'Za'];
const SYL_B = ['ra', 'ki', 'wo', 'ma', 'lo', 'thi', 'ba', 'ne', 'ku', 'sa', 'ri', 'no'];
const SYL_C = ['k', 'n', 'th', 'r', 'sh', '', 'l', 'ok', 'ee'];

// ─── Generation ──────────────────────────────────────────────────────────────

/**
 * Whether this body has a native people, and who. Pure: its own generator
 * seeded on the planet id, so it never shifts anything else a survey rolls.
 */
export function rollNatives(planetId: string, archetype: PlanetArchetype | undefined, habitability: number): NativeCivilization | null {
    if (!archetype || !NATIVE_ARCHETYPES.includes(archetype) || habitability < 40) return null;
    const rng = new RNG(seedFromString(`${planetId}|natives`));
    if (!rng.check(NATIVE_CHANCE)) return null;
    const kinds: NativeKind[] = archetype === 'oceanic' ? ['amphibian']
        : archetype === 'swamp' ? ['amphibian', 'arboreal']
        : archetype === 'jungle' ? ['arboreal', 'giant']
        : ['arboreal', 'giant', 'burrower'];
    const kind = kinds[Math.floor(rng.next() * kinds.length)];
    const gift: NativeGift = kind === 'giant' ? 'warriors' : kind === 'arboreal' ? 'scouts' : kind === 'burrower' ? 'miners' : 'artisans';
    const tech = rng.next();
    const techLevel = tech < 0.55 ? 'stone' : tech < 0.85 ? 'bronze' : 'iron';
    const temper = rng.next();
    const disposition = temper < 0.4 ? 'curious' : temper < 0.75 ? 'wary' : 'proud';
    const name = SYL_A[Math.floor(rng.next() * SYL_A.length)] + SYL_B[Math.floor(rng.next() * SYL_B.length)] + SYL_C[Math.floor(rng.next() * SYL_C.length)];
    const population = 40 + Math.floor(rng.next() * 160);
    const base = kind === 'giant' ? 900 : kind === 'arboreal' ? 2200 : 1600;
    const maxWarriors = Math.round(base * (techLevel === 'iron' ? 1.4 : techLevel === 'bronze' ? 1.2 : 1) * (0.8 + rng.next() * 0.4));
    return {
        speciesName: name, kind, gift, techLevel, disposition, population,
        warriors: maxWarriors, maxWarriors, status: 'free', contacted: false, relations: {}, observers: {},
    };
}

/** What their fighters are on the siege board. Giants hit like regulars; the rest fight as militia, better armed with metal. */
export function nativeComposition(n: NativeCivilization): Record<string, number> {
    if (n.warriors <= 0) return {};
    if (n.kind === 'giant') return { INFANTRY: n.warriors };
    if (n.techLevel === 'stone') return { MILITIA: n.warriors };
    const share = n.techLevel === 'iron' ? 0.5 : 0.25;
    const inf = Math.round(n.warriors * share);
    return { MILITIA: n.warriors - inf, INFANTRY: inf };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function attitudeOf(n: NativeCivilization, factionId: string): number {
    return n.relations[factionId] ?? (n.disposition === 'curious' ? 55 : n.disposition === 'wary' ? 35 : 25);
}
const setAttitude = (n: NativeCivilization, factionId: string, v: number) => { n.relations[factionId] = Math.max(0, Math.min(100, Math.round(v))); };

export function attitudeWord(a: number): string {
    return a >= 80 ? 'devoted' : a >= 60 ? 'friendly' : a >= 40 ? 'tolerant' : a >= 20 ? 'suspicious' : 'hostile';
}

/** May this empire put a beaten people to forced labour? Only the harshest civilizations. */
export function mayForceLabour(world: GameWorldState, factionId: string): boolean {
    const civId = (world.economy.factions.get(factionId) as any)?.civilizationId;
    const civ = CIVILIZATIONS.find(c => c.id === civId);
    return !!civ?.playstyleTags?.some((t: string) => FORCED_LABOUR_TAGS.includes(t));
}

function hasShipHere(world: GameWorldState, factionId: string, systemId: string): boolean {
    for (const f of world.movement.fleets.values() as Iterable<any>) {
        if (f.factionId === factionId && f.currentSystemId === systemId && !f.destinationSystemId) return true;
    }
    return false;
}

function pay(world: GameWorldState, factionId: string, cost: Record<string, number>): string | null {
    const r = world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined;
    if (!r) return 'No treasury.';
    for (const [k, v] of Object.entries(cost)) if ((r[k] ?? 0) < v) return `Needs ${v.toLocaleString()} ${k.toLowerCase()}.`;
    for (const [k, v] of Object.entries(cost)) r[k] -= v;
    return null;
}

function addInfamy(world: GameWorldState, factionId: string, n: number): void {
    const ps: any = (world as any).politics?.empires?.get?.(factionId);
    if (ps) ps.infamy = (ps.infamy ?? 0) + n;
}

/** Research hours into whatever the empire is researching now. */
export function grantResearchHours(world: GameWorldState, factionId: string, hours: number): void {
    const state: any = (world as any).tech?.get?.(factionId);
    const slots = (state?.activeSlots ?? []).filter((s: any) => s.techId && s.status === 'researching');
    for (const s of slots) s.progressHours = (s.progressHours ?? 0) + hours / slots.length;
}

export interface NativeResult { ok: boolean; reason?: string; message?: string }

// ─── Orders (NATIVE_ACTION) ──────────────────────────────────────────────────

export type NativeAction = 'observe' | 'contact' | 'gift' | 'uplift' | NativeFate;

export function nativeAction(world: GameWorldState, factionId: string, planetId: string, action: NativeAction): NativeResult {
    const planet: any = world.construction.planets.get(planetId);
    const n: NativeCivilization | undefined = planet?.natives;
    if (!planet || !n) return { ok: false, reason: 'Nobody lives there.' };

    switch (action) {
        case 'observe': {
            if (n.status !== 'free') return { ok: false, reason: `The ${n.speciesName} are no longer left to themselves.` };
            if (n.contacted) return { ok: false, reason: `The ${n.speciesName} already know there are others among the stars: there is nothing unspoilt left to watch.` };
            if (!hasShipHere(world, factionId, planet.systemId)) return { ok: false, reason: 'Park a ship in the system to watch from orbit.' };
            n.observers[factionId] = world.nowSeconds;
            return { ok: true, message: `Our ship watches the ${n.speciesName} from orbit, unseen.` };
        }
        case 'contact': {
            if (n.status !== 'free' && n.status !== 'neighbours') return { ok: false, reason: `The ${n.speciesName} cannot be approached now.` };
            if (n.relations[factionId] !== undefined) return { ok: false, reason: `We already speak with the ${n.speciesName}.` };
            if (!hasShipHere(world, factionId, planet.systemId)) return { ok: false, reason: 'Park a ship in the system to send envoys down.' };
            n.contacted = true;
            n.observers = {};
            setAttitude(n, factionId, attitudeOf(n, factionId));
            return { ok: true, message: `Our envoys met the ${n.speciesName}. They are ${attitudeWord(attitudeOf(n, factionId))}.` };
        }
        case 'gift': {
            if (n.relations[factionId] === undefined) return { ok: false, reason: 'Make contact first.' };
            if (n.status === 'at_war' || n.status === 'pacified' || n.status === 'enslaved') return { ok: false, reason: `The ${n.speciesName} want nothing from us.` };
            const short = pay(world, factionId, GIFT_COST);
            if (short) return { ok: false, reason: short };
            const a = attitudeOf(n, factionId);
            setAttitude(n, factionId, a + 12 * (1 - a / 120));
            return { ok: true, message: `The ${n.speciesName} accept our gifts. They are ${attitudeWord(attitudeOf(n, factionId))}.` };
        }
        case 'uplift': {
            if (n.status !== 'free') return { ok: false, reason: `The ${n.speciesName} cannot be uplifted now.` };
            if (n.uplift) return { ok: false, reason: n.uplift.factionId === factionId ? 'The uplift is already under way.' : 'Another empire is already teaching them.' };
            if (attitudeOf(n, factionId) < UPLIFT_ATTITUDE || n.relations[factionId] === undefined) return { ok: false, reason: `The ${n.speciesName} must trust us first (friendly, ${UPLIFT_ATTITUDE}+).` };
            const short = pay(world, factionId, UPLIFT_COST);
            if (short) return { ok: false, reason: short };
            n.uplift = { factionId, progress: 0 };
            return { ok: true, message: `Teachers and engineers go down to the ${n.speciesName}. It will take a long while.` };
        }
        case 'integrate':
        case 'enslave':
        case 'displace':
            return decideFate(world, factionId, planet, action);
    }
    return { ok: false, reason: 'Unknown action.' };
}

/** The victor of a native war decides what becomes of the beaten people. */
function decideFate(world: GameWorldState, factionId: string, planet: any, fate: NativeFate): NativeResult {
    const n: NativeCivilization = planet.natives;
    if (n.status !== 'pacified' || n.overlordId !== factionId) return { ok: false, reason: `The ${n.speciesName}'s fate is not ours to decide.` };
    if (fate === 'enslave' && !mayForceLabour(world, factionId)) return { ok: false, reason: 'Our people would not stand for it.' };
    const tags: string[] = planet.tags ?? (planet.tags = []);
    // The world becomes ours in all three cases: a colony on the beaten ground.
    const r = settleNativeWorld(world, factionId, planet);
    if (!r.ok) return r;
    if (fate === 'integrate') {
        n.status = 'integrated';
        planet.population = Math.max(planet.population ?? 0, Math.round(n.population / 4));
        planet.unrest = Math.min(100, (planet.unrest ?? 0) + 25);
        tags.push(`native_${n.gift}`);
        addInfamy(world, factionId, 2);
        return { ok: true, message: `The ${n.speciesName} are our subjects now. They will be slow to forgive, but they will work and fight for us.` };
    }
    if (fate === 'displace') {
        n.status = 'displaced';
        n.population = Math.round(n.population * 0.3);
        planet.unrest = Math.min(100, (planet.unrest ?? 0) + 10);
        addInfamy(world, factionId, 8);
        return { ok: true, message: `The ${n.speciesName} were driven into reserves in the far wilds. The land is ours.` };
    }
    n.status = 'enslaved';
    planet.population = Math.max(planet.population ?? 0, Math.round(n.population / 3));
    planet.unrest = Math.min(100, (planet.unrest ?? 0) + 35);
    tags.push('enslaved_natives');
    addInfamy(world, factionId, 15);
    return { ok: true, message: `The ${n.speciesName} were put to forced labour. They will not stay quiet forever, and the galaxy will hear of it.` };
}

/**
 * Found the colony on a native world for `factionId`: the economy record and
 * the ownership, as colonizePlanet does it, but past the consent check (the
 * caller decided the natives' say in it).
 */
function settleNativeWorld(world: GameWorldState, factionId: string, planet: any): NativeResult {
    if (planet.ownerId) return planet.ownerId === factionId ? { ok: true } : { ok: false, reason: 'Someone else holds it.' };
    const before = planet.natives.status;
    planet.natives.status = 'neighbours'; // consent is not asked of a beaten or uplifted people
    planet.natives.overlordId = factionId;
    const r = colonizePlanet(world, factionId, planet.id);
    if (!r.ok) planet.natives.status = before;
    return r;
}

/**
 * colonizePlanet's question: may this empire settle here? Returns null when it
 * may, or why not. With consent, the natives become neighbours.
 */
export function nativeConsent(planet: any, factionId: string): string | null {
    const n: NativeCivilization | undefined = planet?.natives;
    if (!n) return null;
    if (n.status === 'neighbours' && n.overlordId === factionId) return null;
    if (n.status === 'at_war') return `${planet.name} is a battlefield: the ${n.speciesName} are fighting for it.`;
    if (n.status === 'pacified') return n.overlordId === factionId ? `Decide the ${n.speciesName}'s fate first.` : `The ${n.speciesName} were beaten by another empire.`;
    if (n.status !== 'free') return null;
    if (n.relations[factionId] === undefined) return `The ${n.speciesName} live there: make contact before settling beside them.`;
    if (attitudeOf(n, factionId) < SETTLE_CONSENT) return `The ${n.speciesName} will not have us on their land (they are ${attitudeWord(attitudeOf(n, factionId))}). Win them over, or take it.`;
    return null;
}

/** After a consented colony is founded. */
export function markNeighbours(planet: any, factionId: string): void {
    const n: NativeCivilization | undefined = planet?.natives;
    if (!n || n.status !== 'free') return;
    n.status = 'neighbours';
    n.overlordId = factionId;
    setAttitude(n, factionId, attitudeOf(n, factionId) - 10);
}

/** Do the natives fight troops this empire lands? */
export function nativesResist(planet: any, factionId: string): boolean {
    const n: NativeCivilization | undefined = planet?.natives;
    if (!n || n.status !== 'free' || n.warriors <= 0) return false;
    return n.relations[factionId] === undefined || attitudeOf(n, factionId) < WELCOME_ATTITUDE;
}

// ─── The strategic tick ──────────────────────────────────────────────────────

/** One strategic tick for every native people. Returns notifications to send ([factionId, title, body]). */
export function tickNatives(world: GameWorldState): Array<[string, string, string]> {
    const out: Array<[string, string, string]> = [];
    for (const planet of world.construction.planets.values() as Iterable<any>) {
        const n: NativeCivilization | undefined = planet.natives;
        if (!n) continue;

        // Unseen watchers learn, until someone spoils it.
        if (n.status === 'free' && !n.contacted) {
            for (const f of Object.keys(n.observers)) {
                if (!hasShipHere(world, f, planet.systemId)) { delete n.observers[f]; continue; }
                grantResearchHours(world, f, OBSERVE_RESEARCH_HOURS);
            }
        }

        // Friends trade; attitudes drift back toward the people's temper.
        if (n.status === 'free' || n.status === 'neighbours') {
            for (const [f, a] of Object.entries(n.relations)) {
                if (a >= TRADE_ATTITUDE) {
                    const r = world.economy.factions.get(f)?.reserves as Record<string, number> | undefined;
                    if (r) r.CREDITS = (r.CREDITS ?? 0) + Math.round(TRADE_CREDITS * Math.min(2, n.population / 100));
                }
                const base = n.disposition === 'curious' ? 55 : n.disposition === 'wary' ? 40 : 30;
                if (n.status === 'free' && a !== base) setAttitude(n, f, a + Math.sign(base - a) * 0.5);
            }
        }

        // Fighters come back between wars.
        if (n.status === 'free' && n.warriors < n.maxWarriors) {
            n.warriors = Math.min(n.maxWarriors, Math.round(n.warriors + n.maxWarriors * WARRIOR_REGROWTH));
        }

        // Uplift: years of teaching, compressed.
        if (n.uplift && n.status === 'free') {
            const f = n.uplift.factionId;
            if (attitudeOf(n, f) >= TRADE_ATTITUDE) n.uplift.progress = Math.min(100, n.uplift.progress + UPLIFT_PER_TICK);
            if (n.uplift.progress >= 100) {
                const r = settleNativeWorld(world, f, planet);
                if (r.ok) {
                    n.status = 'uplifted';
                    n.uplift = undefined;
                    planet.population = Math.max(planet.population ?? 0, Math.round(n.population / 3));
                    (planet.tags ?? (planet.tags = [])).push(`native_${n.gift}`);
                    out.push([f, `The ${n.speciesName} join us`, `The ${n.speciesName} of ${planet.name} have learned the stars and joined our empire as a member people. ${GIFT_LABEL[n.gift]}.`]);
                }
            }
        }

        // A colony beside them wears their patience down; at the end of it, they rise.
        if (n.status === 'neighbours' && n.overlordId) {
            const f = n.overlordId;
            setAttitude(n, f, attitudeOf(n, f) - NEIGHBOUR_DRIFT);
            if (attitudeOf(n, f) < UPRISING_ATTITUDE) {
                planet.unrest = Math.min(100, (planet.unrest ?? 0) + 30);
                planet.stability = Math.max(0, (planet.stability ?? 60) - 15);
                planet.population = Math.max(1, Math.round((planet.population ?? 0) * 0.9));
                setAttitude(n, f, 30); // a hard-won truce
                out.push([f, `${planet.name}: the ${n.speciesName} rise`, `The ${n.speciesName} raided our settlement on ${planet.name}. Gifts would have kept the peace.`]);
            }
        }

        // Forced labour breeds revolt.
        if (n.status === 'enslaved' && planet.ownerId) {
            planet.unrest = Math.min(100, (planet.unrest ?? 0) + 4);
            const rng = new RNG(seedFromString(`${planet.id}|revolt|${Math.floor(world.nowSeconds / 1440)}`));
            if (rng.check(0.06)) {
                planet.unrest = Math.min(100, (planet.unrest ?? 0) + 30);
                planet.stability = Math.max(0, (planet.stability ?? 60) - 20);
                out.push([planet.ownerId, `${planet.name}: the ${n.speciesName} revolt`, `The enslaved ${n.speciesName} on ${planet.name} rose against their overseers. Unrest is spreading.`]);
            }
        }
    }
    return out;
}
