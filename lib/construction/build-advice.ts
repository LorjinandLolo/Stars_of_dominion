// lib/construction/build-advice.ts
// Stars of Dominion — "what do I build first?" for one world.
//
// A new player opens a build list of thirty buildings and has no idea which
// matter. This reads what a world already has (and has queued) and names the
// next few things worth building, in a fixed order of priority:
//
//   1. resources  — food, metals, energy, chemicals: everything else is paid in these
//   2. exploration — a shipyard, then an exploration ship to chart the stars
//   3. growth     — more build slots, housing, research
//
// Pure: the quick-build menu on the planet card and the Build tab both call it
// on the synced planet. The worker stays authoritative; a suggestion it would
// refuse (infrastructure, tech, someone else's unique building) is marked
// blocked here with the reason, never offered as a button that fails.

import { BUILDINGS, buildingOpenTo } from '@/data/buildings';
import type { BuildingDefinition } from './construction-types';

export type AdviceGroup = 'resources' | 'exploration' | 'growth';

export interface BuildAdvice {
    /** Building id, or 'explorer' for the exploration ship. */
    id: string;
    kind: 'building' | 'explorer';
    name: string;
    group: AdviceGroup;
    /** One line: why this, why now. */
    why: string;
    /** Why it cannot be ordered yet; absent when it can. */
    blocked?: string;
    cost: Record<string, number>;
}

export interface AdvicePlanet {
    tiles?: Array<{ buildingId?: string; constructionState?: string }>;
    buildQueue?: Array<{ buildingId?: string }>;
    tags?: string[];
    infrastructureLevel?: number;
    orbital?: { ratings?: { shipyardTier?: number } };
}

export interface AdviceContext {
    civilizationId?: string;
    unlockedTech?: ReadonlySet<string>;
    /** The empire already has an exploration ship (or one on the slipway). */
    hasExplorer?: boolean;
}

interface Step {
    id: string;
    group: AdviceGroup;
    why: string;
    /** How many of this building the world should have by this step. */
    want?: number;
    /** Only when this holds. */
    when?: (p: AdvicePlanet) => boolean;
}

const STEPS: Step[] = [
    { id: 'hydroponic_farm', group: 'resources', why: 'Food feeds your people. A hungry world stops growing and turns unstable.' },
    { id: 'metal_mine', group: 'resources', why: 'Metals pay for nearly every building and every ship.' },
    { id: 'fusion_reactor', group: 'resources', why: 'Energy keeps buildings running; a deficit shuts them down.' },
    { id: 'chemical_plant', group: 'resources', why: 'Chemicals go into farms, labs, shipyards and fuel.' },
    { id: 'gas_giant_harvester', group: 'resources', why: 'A gas giant is the richest energy source there is.', when: p => (p.tags ?? []).includes('Gas Giant') },
    { id: 'explorer', group: 'exploration', why: 'Fast and unarmed: it scans and surveys the systems around you, which is how you find worlds to settle.' },
    { id: 'construction_yard', group: 'growth', why: 'Each Builder Outpost lets this world build one more thing at a time.' },
    { id: 'metal_mine', group: 'resources', want: 2, why: 'A second mine: metals run short once ships and outposts start.' },
    { id: 'habitat_block', group: 'growth', why: 'Housing: more people means more workers and more taxes.' },
    { id: 'research_lab', group: 'growth', why: 'Research unlocks better buildings, ships and policies.' },
];

const DEF_BY_ID = new Map<string, BuildingDefinition>(BUILDINGS.map(b => [b.id, b as BuildingDefinition]));

function countOf(planet: AdvicePlanet, id: string): number {
    const standing = (planet.tiles ?? []).filter(t => t.buildingId === id && t.constructionState !== 'ruined').length;
    const queued = (planet.buildQueue ?? []).filter(q => q.buildingId === id).length;
    return standing + queued;
}

// Shipyards live in orbit (every capital starts with a Fleet Drydock); an old
// ground yard not yet moved up still counts.
function yardStanding(planet: AdvicePlanet): boolean {
    return (planet.tiles ?? []).some(t => (t.buildingId === 'orbital_shipyard' || t.buildingId === 'fleet_drydock') && t.constructionState !== 'ruined' && t.constructionState !== 'under_construction')
        || (planet.orbital?.ratings?.shipyardTier ?? 0) >= 1;
}

function blockedReason(def: BuildingDefinition, planet: AdvicePlanet, ctx: AdviceContext): string | undefined {
    if (!buildingOpenTo(def, ctx.civilizationId)) return 'Another civilization’s building';
    if (def.techRequired && ctx.unlockedTech && !ctx.unlockedTech.has(def.techRequired)) return 'Needs research first';
    if ((def.infrastructureRequired ?? 0) > (planet.infrastructureLevel ?? 1)) {
        return `Needs infrastructure ${def.infrastructureRequired}: raise it in the Infrastructure tab`;
    }
    return undefined;
}

/** The next `limit` things worth building on this world, most important first. */
export function adviseBuilds(planet: AdvicePlanet, ctx: AdviceContext, explorerCost: Record<string, number>, limit = 3): BuildAdvice[] {
    const out: BuildAdvice[] = [];
    for (const step of STEPS) {
        if (out.length >= limit) break;
        if (step.when && !step.when(planet)) continue;
        if (step.id === 'explorer') {
            if (ctx.hasExplorer) continue;
            out.push({
                id: 'explorer', kind: 'explorer', name: 'Exploration Ship', group: step.group, why: step.why, cost: explorerCost,
                blocked: yardStanding(planet) ? undefined : 'Needs a Spaceyard in orbit (Orbital tab)',
            });
            continue;
        }
        const def = DEF_BY_ID.get(step.id);
        if (!def) continue;
        if (countOf(planet, step.id) >= (step.want ?? 1)) continue;
        if (out.some(a => a.id === step.id)) continue;
        out.push({
            id: def.id, kind: 'building', name: def.name, group: step.group, why: step.why,
            blocked: blockedReason(def, planet, ctx),
            cost: { CREDITS: def.cost.credits ?? 0, METALS: def.cost.metals ?? 0, CHEMICALS: def.cost.chemicals ?? 0, ENERGY: (def.cost as any).energy ?? 0 },
        });
    }
    return out;
}

export const ADVICE_GROUP_LABEL: Record<AdviceGroup, string> = {
    resources: 'Resources',
    exploration: 'Exploration',
    growth: 'Growth',
};
