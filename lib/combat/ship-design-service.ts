// lib/combat/ship-design-service.ts
//
// Worker-side rules for ship designs and the ships built from them. Pure
// functions over the world object — no lib/db, no fs — so the game loop can
// call them inside an order handler and the tests can call them on a stub.
//
// Two responsibilities:
//   1. saveDesign / deleteDesign: the SHIP_DESIGN_* order handlers.
//   2. resolveRecruitSpec: the single place that turns a recruit order
//      (hull or design, fleet or ground) into what to charge, how long to
//      build, and what the finished ship is worth. Every recruit handler in
//      scripts/game-loop.ts goes through it, which is what closes the hole
//      where an unknown unitType cost nothing.

import type { DesignProfile, ShipClassId, ShipDesign } from './ship-types';
import {
    DEFAULT_DESIGN_FACTION,
    MAX_DESIGNS_PER_FACTION,
    MAX_DESIGN_NAME_LENGTH,
    defaultDesignFor,
    getHull,
    isDefaultDesignId,
    isShipClass,
    normalizeUnitKey,
    configKeyFor,
    resolveDesign,
    summarizeDesign,
    unitConfigFor,
} from './ship-registry';

/** The slice of the world these helpers touch. */
export interface DesignBearingWorld {
    shipDesigns?: Map<string, ShipDesign>;
    tech?: { get?: (factionId: string) => { unlockedTechIds?: string[] } | undefined };
    nowSeconds?: number;
}

export function unlockedTechSet(world: DesignBearingWorld | null | undefined, factionId: string): Set<string> {
    return new Set<string>(world?.tech?.get?.(factionId)?.unlockedTechIds ?? []);
}

export function ensureDesignMap(world: DesignBearingWorld): Map<string, ShipDesign> {
    if (!(world.shipDesigns instanceof Map)) world.shipDesigns = new Map();
    return world.shipDesigns;
}

export function factionDesigns(world: DesignBearingWorld | null | undefined, factionId: string): ShipDesign[] {
    const map = world?.shipDesigns;
    if (!(map instanceof Map)) return [];
    return Array.from(map.values()).filter(d => d.factionId === factionId);
}

export type DesignResult =
    | { ok: true; design: ShipDesign }
    | { ok: false; reason: string };

/**
 * Validate and store a design for a faction. The draft's factionId is
 * ignored — ownership comes from the authenticated order, never the payload.
 */
export function saveDesign(
    world: DesignBearingWorld,
    factionId: string,
    draft: Partial<ShipDesign> | null | undefined,
    nowSeconds: number,
): DesignResult {
    if (!draft || typeof draft !== 'object') return { ok: false, reason: 'No design in the order.' };

    const hullId = normalizeUnitKey(String(draft.hullId ?? '')) as ShipClassId;
    if (!getHull(hullId)) return { ok: false, reason: `Unknown hull "${String(draft.hullId)}".` };

    const name = String(draft.name ?? '').trim().slice(0, MAX_DESIGN_NAME_LENGTH);
    const components: Record<string, string> = {};
    for (const [slotId, compId] of Object.entries(draft.components ?? {})) {
        if (typeof compId === 'string' && compId) components[String(slotId)] = compId;
    }

    const summary = summarizeDesign({ hullId, name, components }, unlockedTechSet(world, factionId));
    if (!summary.valid) return { ok: false, reason: summary.issues[0] ?? 'Design is not buildable.' };

    const map = ensureDesignMap(world);
    const requestedId = typeof draft.id === 'string' ? draft.id.trim() : '';
    if (requestedId && isDefaultDesignId(requestedId)) {
        return { ok: false, reason: 'Standard patterns cannot be overwritten. Save a copy under a new name.' };
    }
    const existing = requestedId ? map.get(requestedId) : undefined;
    if (existing && existing.factionId !== factionId) {
        return { ok: false, reason: 'That design belongs to another faction.' };
    }
    if (!existing && factionDesigns(world, factionId).length >= MAX_DESIGNS_PER_FACTION) {
        return { ok: false, reason: `Design registry full (${MAX_DESIGNS_PER_FACTION}). Retire one first.` };
    }

    const id = existing ? existing.id : (requestedId || `design-${factionId}-${Math.floor(nowSeconds)}-${Math.random().toString(36).slice(2, 7)}`);
    const design: ShipDesign = {
        id,
        factionId,
        name,
        hullId,
        components,
        createdAt: existing?.createdAt ?? nowSeconds,
        updatedAt: nowSeconds,
    };
    map.set(id, design);
    return { ok: true, design };
}

export function deleteDesign(
    world: DesignBearingWorld,
    factionId: string,
    designId: string | null | undefined,
): { ok: true } | { ok: false; reason: string } {
    if (!designId) return { ok: false, reason: 'No design named.' };
    if (isDefaultDesignId(designId)) return { ok: false, reason: 'Standard patterns cannot be retired.' };
    const map = ensureDesignMap(world);
    const existing = map.get(designId);
    if (!existing) return { ok: false, reason: 'Design not found.' };
    if (existing.factionId !== factionId) return { ok: false, reason: 'That design belongs to another faction.' };
    map.delete(designId);
    return { ok: true };
}

// ─── Recruitment ─────────────────────────────────────────────────────────────

export interface RecruitSpec {
    /** UPPERCASE key into data/combat/ground-units.json — what RecruitmentJob.unitType carries. */
    unitType: string;
    /** Lowercase composition key. Only set for ships. */
    classKey?: ShipClassId;
    designId?: string;
    designName?: string;
    /** Per-unit power added to the formation on completion. */
    unitPower: number;
    /** Per-ship design signature. Only set for ships. */
    unitProfile?: DesignProfile;
    /** Per-unit price in faction-reserve keys (CREDITS/METALS/...). */
    cost: Record<string, number>;
    /** Seconds per unit. */
    buildTime: number;
}

export type RecruitSpecResult =
    | { ok: true; spec: RecruitSpec }
    | { ok: false; reason: string };

function costFromConfig(unitType: string): Record<string, number> {
    const raw = unitConfigFor(unitType)?.cost;
    const out: Record<string, number> = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [k, v] of Object.entries(raw)) {
        if (typeof v === 'number' && v > 0) out[k.toUpperCase()] = v;
    }
    return out;
}

/**
 * Resolve what a recruit order actually builds.
 *
 * kind 'fleet': the order names a design (`designId`) or a hull (`unitType`);
 *   a bare hull name builds that hull's standard pattern. Anything that is not
 *   a ship class is refused — a fleet cannot enlist infantry.
 * kind 'ground': the order names a ground unit that exists in the config.
 *   Ship classes are refused — a garrison cannot dig in a cruiser.
 */
export function resolveRecruitSpec(
    world: DesignBearingWorld | null | undefined,
    factionId: string,
    payload: { unitType?: unknown; designId?: unknown },
    kind: 'fleet' | 'ground',
): RecruitSpecResult {
    const rawType = typeof payload?.unitType === 'string' ? payload.unitType : '';
    const rawDesign = typeof payload?.designId === 'string' ? payload.designId : '';

    if (kind === 'ground') {
        if (!rawType) return { ok: false, reason: 'No unit type named.' };
        if (isShipClass(rawType)) return { ok: false, reason: `${rawType} is a ship hull, not a ground unit.` };
        const key = configKeyFor(rawType);
        const cfg = unitConfigFor(key);
        if (!cfg) return { ok: false, reason: `Unknown unit type "${rawType}".` };
        return {
            ok: true,
            spec: {
                unitType: key,
                unitPower: cfg.power ?? 10,
                cost: costFromConfig(key),
                buildTime: cfg.buildTime ?? 60,
            },
        };
    }

    let design: ShipDesign | undefined;
    if (rawDesign) {
        design = resolveDesign(rawDesign, factionId, factionDesigns(world, factionId));
        if (!design) return { ok: false, reason: 'That ship design is not in your registry.' };
    } else {
        if (!rawType) return { ok: false, reason: 'No hull or design named.' };
        if (!isShipClass(rawType)) return { ok: false, reason: `"${rawType}" is not a ship hull.` };
        design = defaultDesignFor(rawType);
        if (!design) return { ok: false, reason: `No standard pattern for ${rawType}.` };
    }

    const unlocked = design.factionId === DEFAULT_DESIGN_FACTION ? null : unlockedTechSet(world, factionId);
    const summary = summarizeDesign(design, unlocked);
    if (!summary.valid) {
        return { ok: false, reason: `${design.name}: ${summary.issues[0] ?? 'design is not buildable.'}` };
    }

    return {
        ok: true,
        spec: {
            unitType: configKeyFor(design.hullId),
            classKey: design.hullId,
            designId: design.id,
            designName: design.name,
            unitPower: summary.power,
            unitProfile: summary.profile,
            cost: { CREDITS: summary.cost.CREDITS, METALS: summary.cost.METALS },
            buildTime: summary.buildTime,
        },
    };
}
