// lib/government/plot-view.ts
// Stars of Dominion — the pure, client-safe half of lib/government/plots.ts.
//
// Who a plotter can sound out, and whether a plot may strike, computed from
// plain world data. No service imports: the government and cabinet services
// pull the fs-backed registries and the press system, which must not enter
// the client bundle, and the Plot card in the cabinet panel needs exactly
// these two reads. plots.ts (worker side) uses the same functions, so the
// plotter's screen and the worker's gate never disagree.

import type { CabinetPortfolio, GovernmentState } from './types';
import { CABINET_PORTFOLIOS } from './types';

export type PlotKind = 'coup' | 'secession';
export type ActorKind = 'minister' | 'governor' | 'admiral' | 'officers' | 'human';
export type RecruitState = 'joined' | 'refused' | 'reported' | 'invited' | 'declined';

export interface PlotActor {
    id: string;
    kind: ActorKind;
    name: string;
    detail: string;
    /** A fellow human minister: their seat id. They answer for themselves. */
    humanSeatId?: string;
    state?: RecruitState;
}

export interface PlotWarning { atSeconds: number; text: string }

export interface Plot {
    id: string;
    factionId: string;
    plotterSeatId: string;
    plotterLeaderId: string;
    kind: PlotKind;
    openedAtSeconds: number;
    recruits: Record<string, RecruitState>;
    lastSoundOutSeconds: number;
    warnings: PlotWarning[];
    status: 'preparing' | 'struck' | 'spent';
}

/** What the worker tells one seat, privately (refusals and results of PLOT_* orders). */
export interface SeatNote { atSeconds: number; text: string; ok: boolean }

export const OFFICERS_ACTOR_ID = 'officers';
export const SOUND_OUT_EVERY_SECONDS = 86400;
/** Actors inside the plot before a coup may strike (the officer corps counts double). */
export const STRIKE_MIN_RECRUITS = 2;
/** Mirrors COUP_WARNING_THRESHOLD in coup-service.ts (not imported: that module is worker-side). */
export const STRIKE_COUP_PRESSURE = 50;
export const STRIKE_LEGITIMACY = 40;
export const STRIKE_COHESION = 45;

const PORTFOLIO_LABEL: Record<CabinetPortfolio, string> = {
    defence: 'Defence', economy: 'Economy', science: 'Science', intelligence: 'Intelligence', interior: 'Interior', foreign: 'Foreign Affairs',
};

export function seatLeaderIdOf(seatId: string): string { return `seat-${seatId}`; }

/** The minimum of a world these reads need; the real one and the synced one both satisfy it. */
export interface PlotWorldView {
    government?: Map<string, GovernmentState> | Record<string, GovernmentState>;
    leadership?: { leaders: Map<string, any> | Record<string, any> };
    construction?: { planets: Map<string, any> | Record<string, any> };
    movement?: { fleets: Map<string, any> | Record<string, any>; empirePostures?: Map<string, any> | Record<string, any> };
    seats?: Array<{ id: string; factionId: string; portfolio: string; persona: string }>;
}

function get<T>(m: Map<string, T> | Record<string, T> | undefined, key: string): T | undefined {
    if (!m) return undefined;
    return m instanceof Map ? m.get(key) : (m as Record<string, T>)[key];
}
function values<T>(m: Map<string, T> | Record<string, T> | undefined): T[] {
    if (!m) return [];
    return m instanceof Map ? [...m.values()] : Object.values(m);
}
function has(m: Map<string, any> | Record<string, any> | undefined, key: string): boolean {
    if (!m) return false;
    return m instanceof Map ? m.has(key) : key in m;
}

/** Everyone in the empire a plot could turn, with the plot's books on them. */
export function plotActorsView(world: PlotWorldView, factionId: string, plot?: Plot): PlotActor[] {
    const out: PlotActor[] = [];
    const seen = new Set<string>();
    const gov = get(world.government, factionId);
    if (!gov) return out;
    const leaders = world.leadership?.leaders;
    const state = (id: string) => plot?.recruits[id];
    const seatByLeader = new Map((world.seats ?? []).filter(s => s.factionId === factionId).map(s => [seatLeaderIdOf(s.id), s.id]));

    for (const portfolio of CABINET_PORTFOLIOS) {
        const id = gov.cabinet?.[portfolio];
        const m = id ? get(leaders, id) : undefined;
        if (!m || m.status !== 'active' || m.id === plot?.plotterLeaderId) continue;
        seen.add(m.id);
        const humanSeatId = seatByLeader.get(m.id);
        out.push({ id: m.id, kind: humanSeatId ? 'human' : 'minister', name: m.name, detail: `Minister of ${PORTFOLIO_LABEL[portfolio]}${humanSeatId ? ' · a player' : ''}`, humanSeatId, state: state(m.id) });
    }
    for (const planet of values<any>(world.construction?.planets)) {
        if (planet.ownerId !== factionId || !planet.governorId || seen.has(planet.governorId)) continue;
        const g = get<any>(leaders, planet.governorId);
        if (!g || g.status !== 'active') continue;
        seen.add(g.id);
        out.push({ id: g.id, kind: 'governor', name: g.name, detail: `Governor of ${planet.name ?? planet.id}`, state: state(g.id) });
    }
    for (const l of values<any>(leaders)) {
        if (l.factionId !== factionId || l.status !== 'active' || seen.has(l.id)) continue;
        if (l.role !== 'Admiral' || !l.assignmentId || !has(world.movement?.fleets, l.assignmentId)) continue;
        seen.add(l.id);
        const fleet = get<any>(world.movement?.fleets, l.assignmentId);
        out.push({ id: l.id, kind: 'admiral', name: l.name, detail: `commands ${fleet?.name ?? l.assignmentId}`, state: state(l.id) });
    }
    const military = get<any>(world.movement?.empirePostures, factionId)?.blocs?.find((b: any) => b.id === 'military');
    if (military) {
        out.push({ id: OFFICERS_ACTOR_ID, kind: 'officers', name: 'The officer corps', detail: `${Math.round(military.satisfaction)}% content`, state: state(OFFICERS_ACTOR_ID) });
    }
    return out;
}

export interface StrikeReadiness { ok: boolean; recruits: number; reasons: string[] }

/**
 * May this plot strike now? Enough people inside, and an empire already
 * rotten by the AI coup's own measures. The reasons are shown to the
 * plotter so the wait is legible.
 */
export function strikeReadinessView(gov: GovernmentState | undefined, plot: Plot): StrikeReadiness {
    const reasons: string[] = [];
    if (!gov) return { ok: false, recruits: 0, reasons: ['No government.'] };
    let recruits = 0;
    for (const [id, state] of Object.entries(plot.recruits)) {
        if (state !== 'joined') continue;
        recruits += id === OFFICERS_ACTOR_ID ? 2 : 1;
    }
    if (recruits < STRIKE_MIN_RECRUITS) reasons.push(`Too few inside (${recruits} of ${STRIKE_MIN_RECRUITS}).`);
    const rotten = (gov.coupPressure ?? 0) >= STRIKE_COUP_PRESSURE || gov.legitimacy < STRIKE_LEGITIMACY || gov.cohesion < STRIKE_COHESION;
    if (!rotten) reasons.push(`The empire still stands too well (coup pressure ${Math.round(gov.coupPressure ?? 0)}, legitimacy ${Math.round(gov.legitimacy)}, cohesion ${Math.round(gov.cohesion)}).`);
    return { ok: reasons.length === 0, recruits, reasons };
}
