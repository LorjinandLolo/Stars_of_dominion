// lib/combat/ship-registry.ts
//
// Hulls, modules, standard patterns, and the pure math that turns a design
// into numbers the game can charge, build, and fight with. Client-safe: the
// designer renders from this file and the worker charges from it, so the two
// can never disagree about what a design costs or does.

import unitsConfig from '../../data/combat/ground-units.json';
import type {
    ComponentDefinition,
    DesignProfile,
    DesignSummary,
    HullDefinition,
    ProfileKey,
    ShipClassId,
    ShipDesign,
} from './ship-types';

// ─── Ship classes ────────────────────────────────────────────────────────────

export const SHIP_CLASS_IDS: readonly ShipClassId[] = ['corvette', 'destroyer', 'cruiser', 'battleship'];

const SHIP_CLASS_SET = new Set<string>(SHIP_CLASS_IDS);

export function isShipClass(key: unknown): key is ShipClassId {
    return typeof key === 'string' && SHIP_CLASS_SET.has(key.toLowerCase());
}

/**
 * Canonical composition key. The combat engine's counter tables, the AI, the
 * tactical adapter and every test speak lowercase; the recruit buttons and
 * data/combat/ground-units.json speak UPPERCASE. Player fleets were stored in
 * the latter, so `unitCounters.orbital['CORVETTE']` missed and orbital
 * rock-paper-scissors silently never applied to anything a player built.
 */
export function normalizeUnitKey(key: string): string {
    return String(key ?? '').trim().toLowerCase();
}

/** Lowercase-merge a composition, dropping zero and negative counts. */
export function normalizeComposition(
    composition: Record<string, number> | null | undefined,
): Record<string, number> {
    const out: Record<string, number> = {};
    if (!composition || typeof composition !== 'object') return out;
    for (const [key, raw] of Object.entries(composition)) {
        const n = Number(raw) || 0;
        if (n <= 0) continue;
        const k = normalizeUnitKey(key);
        if (!k) continue;
        out[k] = (out[k] ?? 0) + n;
    }
    return out;
}

/** data/combat/ground-units.json is keyed UPPERCASE. */
export function configKeyFor(unitKey: string): string {
    return String(unitKey ?? '').trim().toUpperCase();
}

type UnitConfigEntry = {
    name?: string;
    description?: string;
    power?: number;
    buildTime?: number;
    cost?: Record<string, number>;
};

export function unitConfigFor(unitKey: string): UnitConfigEntry | undefined {
    return (unitsConfig as Record<string, UnitConfigEntry>)[configKeyFor(unitKey)];
}

function hullBase(id: ShipClassId) {
    const cfg = unitConfigFor(id) ?? {};
    return {
        basePower: cfg.power ?? 10,
        baseBuildTime: cfg.buildTime ?? 300,
        baseCost: {
            credits: cfg.cost?.credits ?? 0,
            metals: cfg.cost?.metals ?? 0,
        },
    };
}

// ─── Hulls ───────────────────────────────────────────────────────────────────

export const SHIP_HULLS: HullDefinition[] = [
    {
        id: 'corvette',
        name: 'Corvette',
        size: 'S',
        description: 'Fast escort and scout hull. Screens the line and hunts strike craft.',
        slots: [
            { id: 'w1', type: 'weapon' },
            { id: 'u1', type: 'utility' },
            { id: 'c1', type: 'core' },
        ],
        baseEnergy: 10,
        ...hullBase('corvette'),
    },
    {
        id: 'destroyer',
        name: 'Destroyer',
        size: 'M',
        description: 'Line warship built to screen capitals and skirmish.',
        slots: [
            { id: 'w1', type: 'weapon' },
            { id: 'w2', type: 'weapon' },
            { id: 'u1', type: 'utility' },
            { id: 'c1', type: 'core' },
        ],
        baseEnergy: 18,
        ...hullBase('destroyer'),
    },
    {
        id: 'cruiser',
        name: 'Cruiser',
        size: 'L',
        description: "Heavy multi-role hull, the fleet's backbone.",
        slots: [
            { id: 'w1', type: 'weapon' },
            { id: 'w2', type: 'weapon' },
            { id: 'w3', type: 'weapon' },
            { id: 'u1', type: 'utility' },
            { id: 'u2', type: 'utility' },
            { id: 'c1', type: 'core' },
        ],
        baseEnergy: 30,
        ...hullBase('cruiser'),
    },
    {
        id: 'battleship',
        name: 'Battleship',
        size: 'XL',
        description: 'Capital ship. Slow, ruinous, decisive.',
        slots: [
            { id: 'w1', type: 'weapon' },
            { id: 'w2', type: 'weapon' },
            { id: 'w3', type: 'weapon' },
            { id: 'w4', type: 'weapon' },
            { id: 'u1', type: 'utility' },
            { id: 'u2', type: 'utility' },
            { id: 'u3', type: 'utility' },
            { id: 'c1', type: 'core' },
        ],
        baseEnergy: 45,
        ...hullBase('battleship'),
    },
];

// ─── Modules ─────────────────────────────────────────────────────────────────
//
// Tech ids come from lib/tech/trees/*.ts. Every module a standard pattern
// uses has NO prerequisite, so defaults are buildable from the first tick.

export const SHIP_COMPONENTS: ComponentDefinition[] = [
    // ── Weapons ────────────────────────────────────────────────────────────
    {
        id: 'wpn-pulse-laser',
        name: 'Pulse Laser',
        type: 'weapon',
        description: 'Rapid-fire coherent light. Burns through shields, scatters off armor.',
        powerMult: 0.10,
        energy: 8,
        profile: { energy: 1 },
        cost: { credits: 120, metals: 40 },
        buildTime: 30,
    },
    {
        id: 'wpn-autocannon',
        name: 'Autocannon',
        type: 'weapon',
        description: 'Cheap kinetic slug-thrower. Chews armor, wasted on shields.',
        powerMult: 0.08,
        energy: 3,
        profile: { kinetic: 1 },
        cost: { credits: 90, metals: 70 },
        buildTime: 25,
    },
    {
        id: 'wpn-missile-rack',
        name: 'Missile Rack',
        type: 'weapon',
        description: 'Guided explosive salvo. Devastating against bare hulls, shaken off by agile targets.',
        powerMult: 0.10,
        energy: 5,
        profile: { explosive: 1 },
        cost: { credits: 110, metals: 60 },
        buildTime: 30,
    },
    {
        id: 'wpn-gauss-railgun',
        name: 'Gauss Railgun',
        type: 'weapon',
        description: 'High-velocity kinetic penetrator. The armor-cracker of choice.',
        powerMult: 0.16,
        energy: 14,
        profile: { kinetic: 1.5 },
        cost: { credits: 240, metals: 140 },
        buildTime: 50,
        techPrerequisite: 'mil_t1_5',
    },
    {
        id: 'wpn-plasma-torpedo',
        name: 'Plasma Torpedo',
        type: 'weapon',
        description: 'Heavy thermal payload. Ruins anything too slow to get out of its way.',
        powerMult: 0.20,
        energy: 16,
        profile: { explosive: 1.5 },
        cost: { credits: 320, metals: 160 },
        buildTime: 60,
        techPrerequisite: 'mil_t2_pre_2',
    },
    {
        id: 'wpn-spinal-lance',
        name: 'Spinal Lance',
        type: 'weapon',
        description: 'Hull-length particle lance. Enormous draw, enormous output.',
        powerMult: 0.28,
        energy: 34,
        profile: { energy: 2 },
        cost: { credits: 720, metals: 320 },
        buildTime: 120,
        techPrerequisite: 'mil_t3_4',
    },

    // ── Utility (defense) ──────────────────────────────────────────────────
    {
        id: 'util-deflector',
        name: 'Deflector Screen',
        type: 'utility',
        description: 'Electrostatic barrier. Stops kinetic rounds cold; energy weapons burn through.',
        powerMult: 0.08,
        energy: 10,
        profile: { shield: 1 },
        cost: { credits: 150, metals: 60 },
        buildTime: 30,
    },
    {
        id: 'util-plating',
        name: 'Ablative Plating',
        type: 'utility',
        description: 'Reinforced composite layers. Draws no power. Sheds energy fire, cracks under kinetics.',
        powerMult: 0.10,
        energy: 0,
        profile: { armor: 1 },
        cost: { credits: 100, metals: 150 },
        buildTime: 45,
    },
    {
        id: 'util-thrusters',
        name: 'Maneuvering Thrusters',
        type: 'utility',
        description: 'Vectored thrust for evasive burns. Sidesteps missiles and torpedoes.',
        powerMult: 0.04,
        speedMult: 0.10,
        energy: 5,
        profile: { evasion: 1 },
        cost: { credits: 120, metals: 50 },
        buildTime: 25,
    },
    {
        id: 'util-hardened-shields',
        name: 'Hardened Shields',
        type: 'utility',
        description: 'Layered projector array. Heavier draw for a much stronger kinetic screen.',
        powerMult: 0.12,
        energy: 18,
        profile: { shield: 1.6 },
        cost: { credits: 300, metals: 100 },
        buildTime: 50,
        techPrerequisite: 'mil_t1_8',
    },
    {
        id: 'util-reactive-armor',
        name: 'Reactive Armor',
        type: 'utility',
        description: 'Charged plating that answers impacts with its own detonation. Armor with a little shield in it.',
        powerMult: 0.14,
        energy: 6,
        profile: { armor: 1, shield: 0.5 },
        cost: { credits: 260, metals: 220 },
        buildTime: 60,
        techPrerequisite: 'mil_t2_adp_3',
    },
    {
        id: 'util-afterburners',
        name: 'Afterburners',
        type: 'utility',
        description: 'Emergency combustion. Nothing explosive catches a hull that lights these in time.',
        powerMult: 0.06,
        speedMult: 0.20,
        energy: 12,
        profile: { evasion: 1.6 },
        cost: { credits: 220, metals: 80 },
        buildTime: 40,
        techPrerequisite: 'mil_t2_pre_4',
    },

    // ── Cores ──────────────────────────────────────────────────────────────
    {
        id: 'core-fission',
        name: 'Fission Core',
        type: 'core',
        description: 'Reliable nuclear power source. Enough for a standard loadout.',
        powerMult: 0,
        energy: -40,
        cost: { credits: 100, metals: 80 },
        buildTime: 30,
    },
    {
        id: 'core-fusion',
        name: 'Fusion Reactor',
        type: 'core',
        description: 'Magnetic-confinement fusion. Feeds a heavy weapons fit.',
        powerMult: 0.02,
        energy: -85,
        cost: { credits: 280, metals: 160 },
        buildTime: 60,
        techPrerequisite: 'inf_t2_ind_4',
    },
    {
        id: 'core-singularity',
        name: 'Singularity Core',
        type: 'core',
        description: 'Contained gravitational collapse. Massive power at a structural cost.',
        powerMult: -0.05,
        energy: -160,
        cost: { credits: 650, metals: 420 },
        buildTime: 120,
        techPrerequisite: 'eco_t3_1',
    },
];

const HULL_BY_ID = new Map(SHIP_HULLS.map(h => [h.id, h]));
const COMPONENT_BY_ID = new Map(SHIP_COMPONENTS.map(c => [c.id, c]));

export function getHull(id: string | null | undefined): HullDefinition | undefined {
    return id ? HULL_BY_ID.get(normalizeUnitKey(id) as ShipClassId) : undefined;
}

export function getComponent(id: string | null | undefined): ComponentDefinition | undefined {
    return id ? COMPONENT_BY_ID.get(id) : undefined;
}

// ─── Standard patterns ───────────────────────────────────────────────────────
//
// One per hull, owned by '*'. Recruiting a hull without naming a design
// builds these, so the AI and a player who never opens the designer both
// field something better than a bare hull. Never tech-locked.

export const DEFAULT_DESIGN_FACTION = '*';

export const DEFAULT_DESIGNS: ShipDesign[] = [
    {
        id: 'default-corvette',
        factionId: DEFAULT_DESIGN_FACTION,
        name: 'Picket Corvette',
        hullId: 'corvette',
        components: { w1: 'wpn-pulse-laser', u1: 'util-deflector', c1: 'core-fission' },
        isDefault: true,
    },
    {
        id: 'default-destroyer',
        factionId: DEFAULT_DESIGN_FACTION,
        name: 'Line Destroyer',
        hullId: 'destroyer',
        components: { w1: 'wpn-pulse-laser', w2: 'wpn-autocannon', u1: 'util-deflector', c1: 'core-fission' },
        isDefault: true,
    },
    {
        id: 'default-cruiser',
        factionId: DEFAULT_DESIGN_FACTION,
        name: 'Fleet Cruiser',
        hullId: 'cruiser',
        components: {
            w1: 'wpn-pulse-laser', w2: 'wpn-autocannon', w3: 'wpn-missile-rack',
            u1: 'util-deflector', u2: 'util-plating', c1: 'core-fission',
        },
        isDefault: true,
    },
    {
        id: 'default-battleship',
        factionId: DEFAULT_DESIGN_FACTION,
        name: 'Sovereign Battleship',
        hullId: 'battleship',
        components: {
            w1: 'wpn-pulse-laser', w2: 'wpn-autocannon', w3: 'wpn-missile-rack', w4: 'wpn-autocannon',
            u1: 'util-deflector', u2: 'util-plating', u3: 'util-thrusters', c1: 'core-fission',
        },
        isDefault: true,
    },
];

const DEFAULT_BY_HULL = new Map(DEFAULT_DESIGNS.map(d => [d.hullId, d]));

export function isDefaultDesignId(id: string | null | undefined): boolean {
    return !!id && DEFAULT_DESIGNS.some(d => d.id === id);
}

export function defaultDesignFor(hullId: string): ShipDesign | undefined {
    return DEFAULT_BY_HULL.get(normalizeUnitKey(hullId) as ShipClassId);
}

/**
 * Find the design a recruit order names. Standard patterns resolve for
 * everyone; a faction's own designs resolve only for that faction.
 */
export function resolveDesign(
    designId: string | null | undefined,
    factionId: string,
    factionDesigns: Iterable<ShipDesign> | null | undefined,
): ShipDesign | undefined {
    if (!designId) return undefined;
    const standard = DEFAULT_DESIGNS.find(d => d.id === designId);
    if (standard) return standard;
    for (const d of factionDesigns ?? []) {
        if (d.id === designId && d.factionId === factionId) return d;
    }
    return undefined;
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export const PROFILE_KEYS: readonly ProfileKey[] = ['energy', 'kinetic', 'explosive', 'shield', 'armor', 'evasion'];

export function emptyProfile(): DesignProfile {
    return { energy: 0, kinetic: 0, explosive: 0, shield: 0, armor: 0, evasion: 0 };
}

/** a + b × scale, tolerant of partial or missing inputs. Returns a new object. */
export function addProfile(
    a: Partial<DesignProfile> | null | undefined,
    b: Partial<DesignProfile> | null | undefined,
    scale = 1,
): DesignProfile {
    const out = emptyProfile();
    for (const k of PROFILE_KEYS) {
        out[k] = (Number(a?.[k]) || 0) + (Number(b?.[k]) || 0) * scale;
    }
    return out;
}

export function scaleProfile(p: Partial<DesignProfile> | null | undefined, scale: number): DesignProfile {
    return addProfile(null, p, scale);
}

/**
 * Attack type (rows) against defense type (columns). `bare` is the share of a
 * side's ships carrying no defense module at all. Positive favours the
 * attacker. Read straight off the module descriptions above.
 */
const PROFILE_COUNTERS: Record<'energy' | 'kinetic' | 'explosive', Record<'shield' | 'armor' | 'evasion' | 'bare', number>> = {
    energy:    { shield: 1, armor: -1, evasion: 0, bare: 0.5 },
    kinetic:   { shield: -1, armor: 1, evasion: 0, bare: 0.5 },
    explosive: { shield: 0, armor: 0, evasion: -1, bare: 1 },
};

/**
 * How well `mine`'s weapons match `enemy`'s defenses, in [-cap, +cap].
 *
 * Ship counts turn defense totals into a mix: a fleet of ten ships carrying
 * four deflectors is 40% shielded and 60% bare. A side with no weapon
 * modules at all (bare hulls) has no mix to exploit and gets 0.
 */
export function designProfileModifier(
    mine: Partial<DesignProfile> | null | undefined,
    enemy: Partial<DesignProfile> | null | undefined,
    enemyShips: number,
    cap: number,
): number {
    if (!mine || !enemy) return 0;
    const attack = {
        energy: Math.max(0, Number(mine.energy) || 0),
        kinetic: Math.max(0, Number(mine.kinetic) || 0),
        explosive: Math.max(0, Number(mine.explosive) || 0),
    };
    const attackTotal = attack.energy + attack.kinetic + attack.explosive;
    if (attackTotal <= 0) return 0;

    const shield = Math.max(0, Number(enemy.shield) || 0);
    const armor = Math.max(0, Number(enemy.armor) || 0);
    const evasion = Math.max(0, Number(enemy.evasion) || 0);
    const ships = Math.max(0, Number(enemyShips) || 0);
    const bare = Math.max(0, ships - (shield + armor + evasion));
    const defense = { shield, armor, evasion, bare };
    const defenseTotal = shield + armor + evasion + bare;
    if (defenseTotal <= 0) return 0;

    let net = 0;
    for (const dmg of ['energy', 'kinetic', 'explosive'] as const) {
        const a = attack[dmg] / attackTotal;
        if (a <= 0) continue;
        for (const def of ['shield', 'armor', 'evasion', 'bare'] as const) {
            const d = defense[def] / defenseTotal;
            if (d <= 0) continue;
            net += a * d * PROFILE_COUNTERS[dmg][def];
        }
    }
    const bounded = Math.max(-1, Math.min(1, net));
    return bounded * cap;
}

// ─── Design math ─────────────────────────────────────────────────────────────

export const MAX_DESIGNS_PER_FACTION = 24;
export const MAX_DESIGN_NAME_LENGTH = 40;

/**
 * Everything a design is worth. `unlockedTechIds` gates modules; pass null to
 * skip the tech check (display of standard patterns, tests).
 */
/** How far past its rated output a reactor can be pushed, as a fraction of that output. */
export const BROWNOUT_MAX_OVERDRAW = 0.25;
/** Combat power lost per unit of overdraw ratio: 1% over output costs 1% power. */
export const BROWNOUT_POWER_PER_OVERDRAW = 1.0;

/**
 * The brownout a fit incurs. Linear on purpose: a brute force over every
 * hull × core × fit shows a linear 1:1 penalty never lets an overdrawn fit
 * out-rate the best legal one, while a gentler curve does.
 */
export function brownoutPenaltyFor(produced: number, drawn: number): {
    overdraw: number; ratio: number; maxEnergyDraw: number; penalty: number; overCap: boolean;
} {
    const overdraw = Math.max(0, drawn - produced);
    const ratio = overdraw / Math.max(1, produced);
    return {
        overdraw,
        ratio,
        maxEnergyDraw: Math.floor(produced * (1 + BROWNOUT_MAX_OVERDRAW)),
        penalty: Math.min(ratio, 0.9) * BROWNOUT_POWER_PER_OVERDRAW,
        overCap: ratio > BROWNOUT_MAX_OVERDRAW + 1e-9,
    };
}

export function summarizeDesign(
    design: Pick<ShipDesign, 'hullId' | 'components' | 'name'>,
    unlockedTechIds: ReadonlySet<string> | null | undefined,
): DesignSummary {
    const issues: string[] = [];
    const lockedComponentIds: string[] = [];
    const hull = getHull(design.hullId);

    if (!hull) {
        return {
            hullId: (design.hullId ?? 'corvette') as ShipClassId,
            power: 0,
            ratedPower: 0,
            cost: { CREDITS: 0, METALS: 0 },
            buildTime: 0,
            speedMult: 0,
            energyProduced: 0,
            energyDrawn: 0,
            energyBalance: 0,
            overdraw: 0,
            overdrawRatio: 0,
            maxEnergyDraw: 0,
            brownoutPenalty: 0,
            profile: emptyProfile(),
            fitted: 0,
            slots: 0,
            issues: [`Unknown hull "${String(design.hullId)}".`],
            warnings: [],
            lockedComponentIds,
            valid: false,
        };
    }

    const name = String(design.name ?? '').trim();
    if (!name) issues.push('Give the design a name.');
    else if (name.length > MAX_DESIGN_NAME_LENGTH) issues.push(`Name is longer than ${MAX_DESIGN_NAME_LENGTH} characters.`);

    let powerMult = 1;

    let speedMult = 0;
    let credits = hull.baseCost.credits;
    let metals = hull.baseCost.metals;
    let buildTime = hull.baseBuildTime;
    let energyProduced = hull.baseEnergy;
    let energyDrawn = 0;
    let profile = emptyProfile();
    let fitted = 0;

    const slotById = new Map(hull.slots.map(s => [s.id, s]));
    for (const [slotId, compId] of Object.entries(design.components ?? {})) {
        if (!compId) continue;
        const slot = slotById.get(slotId);
        if (!slot) {
            issues.push(`Slot "${slotId}" does not exist on a ${hull.name}.`);
            continue;
        }
        const comp = getComponent(compId);
        if (!comp) {
            issues.push(`Unknown module "${compId}".`);
            continue;
        }
        if (comp.type !== slot.type) {
            issues.push(`${comp.name} cannot be fitted to a ${slot.type} slot.`);
            continue;
        }
        if (comp.techPrerequisite && unlockedTechIds && !unlockedTechIds.has(comp.techPrerequisite)) {
            lockedComponentIds.push(comp.id);
        }
        fitted += 1;
        powerMult += comp.powerMult;
        speedMult += comp.speedMult ?? 0;
        credits += comp.cost.credits;
        metals += comp.cost.metals;
        buildTime += comp.buildTime;
        if (comp.energy < 0) energyProduced += -comp.energy;
        else energyDrawn += comp.energy;
        profile = addProfile(profile, comp.profile);
    }

    if (lockedComponentIds.length > 0) {
        const names = lockedComponentIds.map(id => getComponent(id)?.name ?? id);
        issues.push(`Research required for: ${names.join(', ')}.`);
    }

    // Brownout. A reactor can be pushed past its rated output, and the ship
    // pays for it in combat power: every 1% over costs 1%, up to a hard cap.
    // Overdraw used to refuse the design outright, so the power grid was a
    // wall rather than a trade. Cost, build time, signature and lane speed are
    // not reduced — the modules are aboard and paid for, they just run starved.
    const energyBalance = energyProduced - energyDrawn;
    const brownout = brownoutPenaltyFor(energyProduced, energyDrawn);
    const warnings: string[] = [];
    if (brownout.overCap) {
        issues.push(`Power draw ${energyDrawn} exceeds the ${brownout.maxEnergyDraw} this reactor can be pushed to (${energyProduced} + ${Math.round(BROWNOUT_MAX_OVERDRAW * 100)}%). Fit a stronger core or lighter modules.`);
    } else if (brownout.overdraw > 0) {
        const pct = Math.round(brownout.penalty * 100);
        warnings.push(`Brownout: draw exceeds output by ${brownout.overdraw} (${pct}%). Ships fight at -${pct}% power.`);
    }
    const rated = hull.basePower * powerMult;
    const ratedPower = Math.max(1, Math.round(rated));
    // floor, and at least one point below the rating: on a small hull a 3%
    // penalty would otherwise round away and the overdraw would be free.
    const netPower = brownout.overdraw > 0
        ? Math.max(1, Math.min(ratedPower - 1, Math.floor(rated * (1 - brownout.penalty))))
        : ratedPower;

    return {
        hullId: hull.id,
        power: netPower,
        ratedPower,
        cost: { CREDITS: Math.round(credits), METALS: Math.round(metals) },
        buildTime: Math.round(buildTime),
        speedMult: Math.round(speedMult * 100) / 100,
        energyProduced,
        energyDrawn,
        energyBalance,
        overdraw: brownout.overdraw,
        overdrawRatio: brownout.ratio,
        maxEnergyDraw: brownout.maxEnergyDraw,
        brownoutPenalty: brownout.overdraw > 0 && !brownout.overCap ? brownout.penalty : 0,
        profile,
        fitted,
        slots: hull.slots.length,
        issues,
        warnings,
        lockedComponentIds,
        valid: issues.length === 0,
    };
}

/** Per-ship profile for a design, or an empty one when it cannot be summarized. */
export function designProfile(design: Pick<ShipDesign, 'hullId' | 'components' | 'name'>): DesignProfile {
    return summarizeDesign(design, null).profile;
}

// ─── Refit ───────────────────────────────────────────────────────────────────

/** Share of the hull's own build time a refit costs before any module work. */
export const REFIT_HULL_TIME_FRACTION = 0.10;
/** Ships one refit order may send to the yard. The worker refuses more; the panel clamps to it. */
export const REFIT_MAX_PER_ORDER = 50;

export interface RefitQuote {
    ok: boolean;
    /** Why the refit cannot be done. Only when !ok. */
    reason?: string;
    hullId: ShipClassId;
    /** Modules the target carries that the source does not (with multiplicity). These are what is paid for. */
    addedModuleIds: string[];
    /** Modules that come off. Scrapped: nothing is refunded. */
    removedModuleIds: string[];
    perShipCost: { CREDITS: number; METALS: number };
    perShipSeconds: number;
    from: { power: number; profile: DesignProfile; speedMult: number };
    to: { power: number; profile: DesignProfile; speedMult: number; brownoutPenalty: number };
    powerDelta: number;
}

/**
 * Price converting one ship from `from` to `to`. `from` null = an
 * unregistered hull (built before designs existed), rated as the bare hull.
 *
 * Both sides go through summarizeDesign, so there is still one pricing
 * function. The price is the modules ADDED, as multisets: slots of one type
 * are interchangeable, so re-ordering a fit is free and is refused as "the
 * same fit". Removed modules refund nothing, which is what makes flipping
 * A -> B -> A between battles cost twice. The source side skips the tech
 * check (the ships exist) and so do standard patterns.
 */
export function quoteRefit(
    from: Pick<ShipDesign, 'hullId' | 'components' | 'name'> | null,
    to: Pick<ShipDesign, 'hullId' | 'components' | 'name'> & { factionId?: string },
    unlockedTechIds: ReadonlySet<string> | null | undefined,
): RefitQuote {
    const toSummary = summarizeDesign(to, to.factionId === DEFAULT_DESIGN_FACTION ? null : unlockedTechIds);
    const hull = getHull(to.hullId);
    const bare = { hullId: to.hullId, name: 'Bare hull', components: {} };
    const fromSummary = summarizeDesign(from ?? bare, null);
    const empty: RefitQuote = {
        ok: false,
        hullId: toSummary.hullId,
        addedModuleIds: [],
        removedModuleIds: [],
        perShipCost: { CREDITS: 0, METALS: 0 },
        perShipSeconds: 0,
        from: { power: fromSummary.power, profile: fromSummary.profile, speedMult: fromSummary.speedMult },
        to: { power: toSummary.power, profile: toSummary.profile, speedMult: toSummary.speedMult, brownoutPenalty: toSummary.brownoutPenalty },
        powerDelta: toSummary.power - fromSummary.power,
    };
    if (!hull || !toSummary.valid) return { ...empty, reason: `${to.name}: ${toSummary.issues[0] ?? 'design is not buildable.'}` };
    if (from && normalizeUnitKey(from.hullId) !== hull.id) {
        const fromHull = getHull(from.hullId);
        return { ...empty, reason: `Refit keeps the hull: ${from.name} is a ${fromHull?.name ?? from.hullId} pattern, ${to.name} a ${hull.name}.` };
    }

    const bag = (design: Pick<ShipDesign, 'components'> | null) => {
        const counts = new Map<string, number>();
        for (const compId of Object.values(design?.components ?? {})) {
            if (compId && getComponent(compId)) counts.set(compId, (counts.get(compId) ?? 0) + 1);
        }
        return counts;
    };
    const have = bag(from);
    const want = bag(to);
    const added: string[] = [];
    const removed: string[] = [];
    for (const [id, n] of want) for (let i = have.get(id) ?? 0; i < n; i++) added.push(id);
    for (const [id, n] of have) for (let i = want.get(id) ?? 0; i < n; i++) removed.push(id);
    if (added.length === 0 && removed.length === 0) return { ...empty, reason: 'Those ships already carry that fit.' };

    let credits = 0;
    let metals = 0;
    let seconds = Math.round(REFIT_HULL_TIME_FRACTION * hull.baseBuildTime);
    for (const id of added) {
        const comp = getComponent(id)!;
        credits += comp.cost.credits;
        metals += comp.cost.metals;
        seconds += comp.buildTime;
    }
    return {
        ...empty,
        ok: true,
        addedModuleIds: added,
        removedModuleIds: removed,
        perShipCost: { CREDITS: Math.round(credits), METALS: Math.round(metals) },
        perShipSeconds: Math.max(1, Math.round(seconds)),
    };
}

/** Same hull and the same modules, whatever slots they sit in. */
export function sameFit(
    a: Pick<ShipDesign, 'hullId' | 'components'>,
    b: Pick<ShipDesign, 'hullId' | 'components'>,
): boolean {
    if (normalizeUnitKey(a.hullId) !== normalizeUnitKey(b.hullId)) return false;
    const ids = (d: Pick<ShipDesign, 'components'>) => Object.values(d.components ?? {}).filter(Boolean).sort().join('|');
    return ids(a) === ids(b);
}
