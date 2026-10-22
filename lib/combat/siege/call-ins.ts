// lib/combat/siege/call-ins.ts
//
// What a commander can throw at a district between cycles: fire from orbit,
// a gun barrage, smoke to cover a withdrawal, a rally along the whole line,
// demolition of the roads through a district you are about to give up.
// Each has a cooldown in cycles and a precondition the board must meet — no
// orbit, no orbital strike; no guns in range, no barrage.
//
// A call-in is ordered any time (MIL_GROUND_CALL_IN) and lands at the start of
// the next cycle, so the enemy sees the incoming marker and can react, and so
// every man it kills dies inside the cycle the pools are rewritten from (see
// CLAUDE.md: kills between cycles must also come off the pools). Pure.

import type { PlanetSurface } from '../../planet-surface/types';
import type { DistrictWarState, GroundUnitType } from './siege-types';
import type { Formation, FormationSide } from './formations';
import { formationsAt } from './formations';
import { buildAdjacency, controllerOf, isPassable } from './district-front';
import type { DistrictBuff } from './moments';
import type { OrbitState } from './orbit-state';

export type CallInKind = 'orbital_strike' | 'barrage' | 'smoke' | 'rally' | 'demolish';

export interface CallInSpec {
    kind: CallInKind;
    label: string;
    blurb: string;
    /** Cycles before it can be called again. */
    cooldown: number;
    /** Whether it targets a district (false: the whole side). */
    targeted: boolean;
}

export const CALL_INS: Record<CallInKind, CallInSpec> = {
    orbital_strike: { kind: 'orbital_strike', label: 'Orbital strike', cooldown: 5, targeted: true,
        blurb: 'The fleet fires on one district: heavy losses, works flattened. Needs the orbit and no enemy shield.' },
    barrage: { kind: 'barrage', label: 'Barrage', cooldown: 2, targeted: true,
        blurb: 'Your guns shell a district next to them: losses and shaken men.' },
    smoke: { kind: 'smoke', label: 'Smoke', cooldown: 3, targeted: true,
        blurb: 'Screen a district you stand in: the enemy fights blind there this cycle.' },
    rally: { kind: 'rally', label: 'Rally', cooldown: 5, targeted: false,
        blurb: 'Officers along the whole line pull shaken formations back together.' },
    demolish: { kind: 'demolish', label: 'Demolish', cooldown: 3, targeted: true,
        blurb: 'Blow the roads and bridges through a district you hold: nobody gets the road there for a while — tanks and guns crawl.' },
};

/** Cycles a demolished road stays cut before engineers have it passable again. */
export const DEMOLISH_CYCLES = 8;

/** Road links (roadKey "a-b") through a district. */
const roadsThrough = (roads: string[] | undefined, sector: number) =>
    (roads ?? []).filter(k => k.split('-').map(Number).includes(sector));

export interface QueuedCallIn {
    kind: CallInKind;
    side: FormationSide;
    /** Target district; -1 for the side-wide ones. */
    sector: number;
    /** Cycle it lands at the start of. */
    cycle: number;
}

/** Strike effects, as shares of what stands in the district. */
const ORBITAL_KILL = 0.05;
const ORBITAL_FRIENDLY_KILL = 0.04;
const ORBITAL_ENTRENCH_LOSS = 40;
const BARRAGE_KILL = 0.06;
const SMOKE_ENEMY_MULT = 0.75;
const RALLY_ORG = 15;

export interface CallInBoard {
    surface: PlanetSurface;
    war: DistrictWarState;
    orbit?: OrbitState;
    /** The cycle about to resolve next. */
    nextCycle: number;
}

/** Why a call-in cannot be made right now, or null when it can. */
export function callInBlocked(board: CallInBoard, side: FormationSide, kind: CallInKind, sector: number): string | null {
    const { surface, war, orbit, nextCycle } = board;
    const spec = CALL_INS[kind];
    if (!spec) return 'Unknown call-in.';
    const ready = war.callInReady?.[side]?.[kind] ?? 0;
    if (nextCycle < ready) return `${spec.label} is ready again in ${ready - nextCycle} cycle${ready - nextCycle > 1 ? 's' : ''}.`;
    if ((war.callIns ?? []).some(c => c.side === side && c.kind === kind && c.cycle === nextCycle)) return `${spec.label} is already on its way.`;
    if (spec.targeted && (!surface.sectors[sector] || !isPassable(surface.sectors[sector]))) return 'Not a district troops stand in.';
    const formations = war.formations ?? [];
    switch (kind) {
        case 'orbital_strike':
            if (orbit?.holder !== side) return 'You do not hold the orbit.';
            if (side === 'attacker' && orbit?.shieldUp) return 'The planetary shield is up.';
            if (!formationsAt(formations, sector, side === 'attacker' ? 'defender' : 'attacker').length) return 'No enemy there to hit.';
            return null;
        case 'barrage': {
            const adj = buildAdjacency(surface);
            const inRange = formations.some(f => f.side === side && f.strength > 0 && f.unitType === 'ARTILLERY'
                && (f.sectorIndex === sector || adj[f.sectorIndex].includes(sector)));
            if (!inRange) return 'No guns of yours in or next to that district.';
            if (!formationsAt(formations, sector, side === 'attacker' ? 'defender' : 'attacker').length) return 'No enemy there to hit.';
            return null;
        }
        case 'smoke':
            if (!formationsAt(formations, sector, side).length) return 'You have nobody in that district.';
            return null;
        case 'rally':
            return null;
        case 'demolish':
            if (controllerOf(war, sector) !== side) return 'You can only blow the roads on ground you hold.';
            if (!roadsThrough(war.roads, sector).length) return 'No road runs through that district.';
            return null;
    }
}

/** Queues a call-in for the next cycle and starts its cooldown. Caller checks callInBlocked first. */
export function queueCallIn(war: DistrictWarState, side: FormationSide, kind: CallInKind, sector: number, nextCycle: number): QueuedCallIn {
    const q: QueuedCallIn = { kind, side, sector: CALL_INS[kind].targeted ? sector : -1, cycle: nextCycle };
    (war.callIns ??= []).push(q);
    const ready = (war.callInReady ??= { attacker: {}, defender: {} });
    (ready[side] ??= {})[kind] = nextCycle + CALL_INS[kind].cooldown;
    return q;
}

export interface CallInResult {
    log: string[];
    buffs: DistrictBuff[];
    killed: Record<FormationSide, Partial<Record<GroundUnitType, number>>>;
}

function hit(forms: Formation[], share: number, orgLoss: number, killed: Partial<Record<GroundUnitType, number>>): number {
    let n = 0;
    for (const f of forms) {
        // An Elder shrugs off a share-of-men strike; it takes a dedicated weapon.
        if (f.unitType === 'ELDER_INFERNOID') { f.organization = Math.max(0, (f.organization ?? 100) - orgLoss / 2); continue; }
        const men = Math.round(f.strength * share);
        f.strength -= men;
        f.organization = Math.max(0, (f.organization ?? 100) - orgLoss);
        killed[f.unitType] = (killed[f.unitType] ?? 0) + men;
        n += men;
    }
    return n;
}

/**
 * Lands every call-in due this cycle. Kills come off the formations (the
 * truth); the caller adds `killed` to the cycle's losses so the pools and
 * the morale maths see them.
 */
export function applyCallIns(war: DistrictWarState, formations: Formation[], cycle: number): CallInResult {
    const res: CallInResult = { log: [], buffs: [], killed: { attacker: {}, defender: {} } };
    const due = (war.callIns ?? []).filter(c => c.cycle === cycle);
    war.callIns = (war.callIns ?? []).filter(c => c.cycle > cycle);
    for (const c of due) {
        const enemy: FormationSide = c.side === 'attacker' ? 'defender' : 'attacker';
        switch (c.kind) {
            case 'orbital_strike': {
                const theirs = hit(formationsAt(formations, c.sector, enemy), ORBITAL_KILL, 20, res.killed[enemy]);
                const ours = hit(formationsAt(formations, c.sector, c.side), ORBITAL_FRIENDLY_KILL, 5, res.killed[c.side]);
                if (war.entrenchment?.[c.sector]) war.entrenchment[c.sector] = Math.max(0, war.entrenchment[c.sector] - ORBITAL_ENTRENCH_LOSS);
                res.log.push(`Orbital strike on district ${c.sector}: ${theirs} enemy dead${ours ? `, ${ours} of our own caught in it` : ''}; the works are flattened.`);
                break;
            }
            case 'barrage': {
                const theirs = hit(formationsAt(formations, c.sector, enemy), BARRAGE_KILL, 15, res.killed[enemy]);
                res.log.push(`Barrage on district ${c.sector}: ${theirs} enemy dead, the rest keep their heads down.`);
                break;
            }
            case 'smoke':
                res.buffs.push({ sector: c.sector, side: enemy, mult: SMOKE_ENEMY_MULT, cycle, reason: 'Smoke' });
                res.log.push(`Smoke rolls over district ${c.sector}.`);
                break;
            case 'rally': {
                let n = 0;
                for (const f of formations) {
                    if (f.side !== c.side || f.strength <= 0 || (f.organization ?? 100) >= 70) continue;
                    f.organization = Math.min(100, (f.organization ?? 100) + RALLY_ORG);
                    n++;
                }
                res.log.push(`The ${c.side === 'attacker' ? 'invaders' : 'defenders'} rally — ${n} shaken formation${n === 1 ? '' : 's'} steady.`);
                break;
            }
            case 'demolish': {
                const cut = roadsThrough(war.roads, c.sector);
                if (!cut.length) break;
                const until = cycle + DEMOLISH_CYCLES;
                for (const k of cut) (war.roadsCut ??= {})[k] = until;
                war.roads = (war.roads ?? []).filter(k => !cut.includes(k));
                res.log.push(`Engineers blow the roads through district ${c.sector} — ${cut.length} link${cut.length === 1 ? '' : 's'} cut.`);
                break;
            }
        }
    }
    return res;
}
