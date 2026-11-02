// lib/construction/build-gates.ts
// Stars of Dominion — why a building cannot go up here, in words.
//
// The worker's PLANET_CONSTRUCT_BUILDING handler is authoritative. This mirrors
// its checks, in the same order, so the Planet Screen can show a locked building
// with the one thing it needs instead of hiding it or letting the order bounce.
// Money is not here: the screen shows the shortfall on the price itself.
// Client-safe and pure.

export interface BuildGateDef {
    id: string;
    name: string;
    civilizationId?: string;
    techRequired?: string;
    infrastructureRequired?: number;
    tagRequirements?: string[];
    uniquePerPlanet?: boolean;
    uniquePerEmpire?: boolean;
    upgradesFrom?: string;
}

export interface BuildGatePlanet {
    infrastructureLevel?: number;
    tags?: string[];
    tiles?: Array<{ buildingId?: string | null; constructionState?: string }>;
    buildQueue?: Array<{ buildingId?: string }>;
}

export interface BuildGateContext {
    civilizationId?: string;
    unlockedTech: ReadonlySet<string>;
    /** Display name for a tech id; falls back to the id. */
    techName?: (id: string) => string | undefined;
    /** Display name for a building id; falls back to the id. */
    buildingName?: (id: string) => string | undefined;
    /** The empire already holds one (for uniquePerEmpire). */
    empireHas?: (buildingId: string) => boolean;
}

/** What stops this building on this world, or null if only money can. */
export function buildBlockReason(def: BuildGateDef, planet: BuildGatePlanet, ctx: BuildGateContext): string | null {
    if (def.civilizationId && def.civilizationId !== ctx.civilizationId) return 'Unique to another civilization';
    if (def.techRequired && !ctx.unlockedTech.has(def.techRequired)) {
        return `Needs research: ${ctx.techName?.(def.techRequired) ?? def.techRequired}`;
    }
    if ((def.infrastructureRequired ?? 0) > (planet.infrastructureLevel ?? 1)) {
        return `Needs infrastructure level ${def.infrastructureRequired} (this world: ${planet.infrastructureLevel ?? 1})`;
    }
    const tags = new Set(planet.tags ?? []);
    const missing = (def.tagRequirements ?? []).find(t => !tags.has(t));
    if (missing) return `This world lacks: ${missing.replace(/_/g, ' ')}`;
    if (def.upgradesFrom) {
        const has = (planet.tiles ?? []).some(t => t.buildingId === def.upgradesFrom && t.constructionState === 'active');
        if (!has) return `Upgrades ${ctx.buildingName?.(def.upgradesFrom) ?? def.upgradesFrom}: build that first`;
    }
    if (def.uniquePerPlanet) {
        const already = (planet.tiles ?? []).some(t => t.buildingId === def.id && t.constructionState !== 'ruined')
            || (planet.buildQueue ?? []).some(q => q.buildingId === def.id);
        if (already) return 'Already on this world';
    }
    if (def.uniquePerEmpire && ctx.empireHas?.(def.id)) return 'Your empire already has one';
    return null;
}
