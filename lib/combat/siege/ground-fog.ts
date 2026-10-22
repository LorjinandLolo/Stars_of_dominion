// lib/combat/siege/ground-fog.ts
//
// What each side of a ground war can see. Your own pieces, always. The
// enemy's only where you have eyes: on or next to ground you hold or stand
// on, two districts out from commandos and airborne, and everywhere if your
// fleet holds the orbit (the sky decides the ground). What you can see of the
// enemy you see as an estimate — a scout counts helmets, not muster rolls —
// and you never see their orders, plans, moments or call-in cooldowns.
//
// The shared snapshot carries no formations on the wire at all
// (stripGroundSecrets); each party to a siege is served its own fogView of it
// by the sync route. Third parties see the control map and nothing else.
// The AI general reads the same view so it cannot cheat. Pure.

import type { PlanetSurface } from '../../planet-surface/types';
import type { DistrictWarState } from './siege-types';
import type { Formation, FormationSide } from './formations';
import { buildAdjacency, controllerOf, isPassable } from './district-front';
import type { OrbitHolder } from './orbit-state';

/** Unit types that see two districts out instead of one. */
const SCOUTS = new Set(['SPECIAL_OPS', 'AIRBORNE']);

/** Enemy strengths are shown rounded to this, after the noise. */
const ESTIMATE_STEP = 25;
/** Up to this share either way. */
const ESTIMATE_NOISE = 0.15;

/** Districts `side` can see into this cycle. */
export function visibleDistricts(
    surface: PlanetSurface,
    war: DistrictWarState,
    side: FormationSide,
    orbitHolder?: OrbitHolder,
): Set<number> {
    if (orbitHolder === side) return new Set(surface.sectors.map(s => s.index));
    const adjacency = buildAdjacency(surface);
    const seen = new Set<number>();
    const eyes = (idx: number, range: number) => {
        let frontier = [idx];
        seen.add(idx);
        for (let r = 0; r < range; r++) {
            const next: number[] = [];
            for (const cur of frontier) for (const n of adjacency[cur]) {
                if (seen.has(n)) continue;
                seen.add(n);
                if (isPassable(surface.sectors[n])) next.push(n);
            }
            frontier = next;
        }
    };
    for (const s of surface.sectors) {
        if (isPassable(s) && controllerOf(war, s.index) === side) eyes(s.index, 1);
    }
    for (const f of war.formations ?? []) {
        if (f.side !== side || f.strength <= 0) continue;
        eyes(f.sectorIndex, SCOUTS.has(f.unitType) ? 2 : 1);
    }
    return seen;
}

/** Cheap stable hash: the same formation reads the same within a cycle. */
function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
}

/** What a scout reports for an enemy formation's strength this cycle. */
export function estimateStrength(f: Formation, cycle: number): number {
    if (f.unitType === 'ELDER_INFERNOID') return f.strength; // you can count titans
    const noise = 1 + (hash(`${f.id}:${cycle}`) * 2 - 1) * ESTIMATE_NOISE;
    return Math.max(ESTIMATE_STEP, Math.round((f.strength * noise) / ESTIMATE_STEP) * ESTIMATE_STEP);
}

/** An enemy formation as `side` sees it: where it is, what it is, roughly how big. */
function scouted(f: Formation, cycle: number): Formation {
    return {
        id: f.id,
        side: f.side,
        unitType: f.unitType,
        strength: estimateStrength(f, cycle),
        sectorIndex: f.sectorIndex,
        supply: 100,
        encircled: f.encircled,
        guerrilla: f.guerrilla,
    };
}

/**
 * The ground war as `side` sees it. A copy: own pieces whole, visible enemy
 * pieces scouted, everything else of the enemy's dropped. The control map,
 * entrenchment and strongpoints are public — you can see whose flag flies.
 */
export function fogView(
    surface: PlanetSurface,
    war: DistrictWarState,
    side: FormationSide,
    cycle: number,
    orbitHolder?: OrbitHolder,
): DistrictWarState & { visible: number[] } {
    const seen = visibleDistricts(surface, war, side, orbitHolder);
    const formations = (war.formations ?? []).flatMap(f => {
        if (f.side === side) return [f];
        if (f.strength > 0 && seen.has(f.sectorIndex)) return [scouted(f, cycle)];
        return [];
    });
    const report = war.lastReport;
    return {
        ...war,
        formations,
        plans: (war.plans ?? []).filter(p => p.side === side),
        moments: (war.moments ?? []).filter(m => m.side === side),
        // You see your own call-ins, and incoming enemy fire on ground you can see.
        callIns: (war.callIns ?? []).filter(c => c.side === side || (c.sector >= 0 && seen.has(c.sector) && c.kind !== 'rally')),
        callInReady: { [side]: war.callInReady?.[side] ?? {} },
        // The AI general's notes are its own side's business.
        ...({ aiIntent: { [side]: (war as any).aiIntent?.[side] }, aiIdle: undefined } as object),
        lastReport: report ? {
            ...report,
            // Every fight in the report was one you were in or watched.
            districts: report.districts.filter(d => seen.has(d.sector) || d.holderBefore === side || d.holder === side),
            // Friction you can see; decisions only your own.
            events: report.events.filter(e => e.side === side || (e.kind !== 'decision' && e.sector != null && seen.has(e.sector))),
        } : undefined,
        visible: [...seen],
    };
}

/** Fields of a ground war that are served per side, never in the shared snapshot. */
export const GROUND_SECRET_FIELDS = ['formations', 'plans', 'moments', 'callIns', 'callInReady', 'lastReport', 'aiIntent', 'aiIdle'] as const;

/**
 * Removes every ground-war secret from a parsed snapshot tree (the shared
 * session snapshot as the sync route holds it). Returns the sieges found, so
 * the route can serve each party its own fogView without parsing again.
 */
export function stripGroundSecrets(tree: any): Array<{ planetId: string; attackerEmpireId: string; defenderEmpireId: string; planetType: string; tags: string[]; siege: any }> {
    const found: Array<{ planetId: string; attackerEmpireId: string; defenderEmpireId: string; planetType: string; tags: string[]; siege: any }> = [];
    const planets = tree?.construction?.planets;
    const entries: Record<string, any> | undefined = planets?.__map__ ? planets.data : planets;
    if (!entries || typeof entries !== 'object') return found;
    for (const [id, planet] of Object.entries(entries)) {
        const siege = (planet as any)?.siege;
        const war = siege?.districts;
        if (!war || typeof war !== 'object') continue;
        found.push({
            planetId: id,
            attackerEmpireId: siege.attackerEmpireId,
            defenderEmpireId: siege.defenderEmpireId,
            planetType: (planet as any).planetType,
            tags: (planet as any).tags ?? [],
            siege: { ...siege, districts: { ...war } },
        });
        for (const k of GROUND_SECRET_FIELDS) delete war[k];
    }
    return found;
}
