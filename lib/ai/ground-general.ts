// lib/ai/ground-general.ts
//
// An AI commander for one side of a ground war. The old AI put every invader
// on one offensive plan aimed at the capital: the whole army marched down one
// road, broke at the capital with nowhere to fall back to and surrendered
// wholesale (1.2-1.6 h for an equal invasion). This one fights the board:
//
//   - it reads the war through its own fog (ground-fog.ts), estimates and all;
//   - it scores every enemy district it can reach this cycle by local odds —
//     its reachable power against the defender's, the ground and the works —
//     and by how much taking it advances its objective;
//   - it masses on the best one or two (the Schwerpunkt) and pins the rest of
//     the line in a hold stance, grabbing undefended flanks with light pieces;
//   - it pulls broken formations out of the line to recover, keeps a reserve
//     when it has the men, and waits for odds instead of feeding an attack in
//     piecemeal;
//   - it answers its moments and spends its call-ins.
//
// The defender keeps the shared doctrine (defence-doctrine.ts) as its
// backbone and this adds counter-attacks on weak, exposed invader pieces.
// Pure over the board: returns orders, the caller applies them.

import type { PlanetSurface, TerrainType } from '@/lib/planet-surface/types';
import type { DistrictWarState, GroundUnitType, TacticalStanceId } from '@/lib/combat/siege/siege-types';
import type { Formation, FormationSide } from '@/lib/combat/siege/formations';
import { legalMoves, canEverEnter } from '@/lib/combat/siege/formations';
import { buildAdjacency, CAPITAL_SECTOR, controllerOf, isPassable } from '@/lib/combat/siege/district-front';
import type { Strongpoint } from '@/lib/combat/siege/strongpoints';
import type { OrbitHolder } from '@/lib/combat/siege/orbit-state';
import { fogView } from '@/lib/combat/siege/ground-fog';
import { callInBlocked, type CallInKind } from '@/lib/combat/siege/call-ins';
import type { GroundMoment } from '@/lib/combat/siege/moments';

/**
 * The general's rule of thumb for a man's fighting value and for how much
 * the ground helps whoever holds it. Close to the battle's own tables
 * (district-battle.ts) but an estimate, as a real staff's would be.
 */
const POWER: Record<GroundUnitType, number> = {
    ELDER_INFERNOID: 60, ARMOR: 2.5, ARTILLERY: 2, ANTI_ARMOR: 1.8, AIRBORNE: 1.6,
    SPECIAL_OPS: 1.5, INFANTRY: 1, MILITIA: 0.6,
};
const GROUND: Record<TerrainType, number> = {
    mountains: 1.9, urban: 1.8, volcanic: 1.7, jungle: 1.5, forest: 1.35,
    toxic: 1.3, frozen: 1.25, ruins: 1.2, desert: 1, plains: 0.9, ocean: 1,
};

/** Odds the attacker wants before it commits to an assault on a district. */
export const ASSAULT_ODDS = 1.25;
/**
 * Odds it settles for once it has gone PATIENCE cycles without attacking: a
 * besieger that only ever waits for perfect odds lets the war go quiet, and
 * the defender dig in deeper every cycle it does.
 */
export const PRESSURE_ODDS = 0.9;
export const PATIENCE = 2;
/** Odds it stops adding formations to an assault at. */
const ENOUGH_ODDS = 2.2;
/** What the assault stance is worth against an unknown enemy posture (district-battle STANCE: 1.5 dealt vs ~0.9). */
const STANCE_EDGE = 1.5 / 0.9;
/** Assaults launched per cycle, at most. */
const MAX_ASSAULTS = 2;
/** A formation below this organisation is pulled out of the line to recover. */
export const RECOVER_ORG = 45;
/** Share of the army held back as a reserve, when the army is big enough to spare it. */
const RESERVE_SHARE = 0.2;
/** Odds the defender wants before counter-attacking an invader piece. */
const COUNTER_ODDS = 1.4;

export interface GeneralOrder {
    formationId: string;
    /** null = hold where it stands. */
    moveTo: number | null;
    stance?: TacticalStanceId;
}

export interface GeneralPlan {
    orders: GeneralOrder[];
    /** Army-wide stance for the cycle, and a guess at the enemy's. */
    tactic: TacticalStanceId;
    prediction?: TacticalStanceId;
    moments: Array<{ momentId: string; choice: string }>;
    callIns: Array<{ kind: CallInKind; sector: number }>;
    /** One line on what it is doing, for the battle log and probes. */
    intent: string;
    /** Whether it launched an attack this cycle (resets the patience count). */
    attacked: boolean;
}

export interface GeneralContext {
    surface: PlanetSurface;
    war: DistrictWarState;
    side: FormationSide;
    cycle: number;
    orbitHolder?: OrbitHolder;
    shieldUp?: boolean;
    strongpoints: Strongpoint[];
    rng: () => number;
    /** Cycles this side has gone without launching an attack. */
    idleCycles?: number;
    /**
     * Formations the defence doctrine has posted to the capital and the
     * strongpoints. The general never moves them: an empty capital is a lost war.
     */
    pinned?: Set<string>;
}

const other = (s: FormationSide): FormationSide => s === 'attacker' ? 'defender' : 'attacker';
const power = (fs: Formation[]) => fs.reduce((s, f) => s + Math.max(0, f.strength) * (POWER[f.unitType] ?? 1)
    * (0.5 + 0.5 * (f.organization ?? 100) / 100), 0);

/** Hop distance from every district to `goal` over passable ground. */
function distanceTo(surface: PlanetSurface, adjacency: number[][], goal: number): Map<number, number> {
    const dist = new Map<number, number>([[goal, 0]]);
    const queue = [goal];
    while (queue.length) {
        const cur = queue.shift()!;
        for (const n of adjacency[cur]) {
            if (dist.has(n) || !isPassable(surface.sectors[n])) continue;
            dist.set(n, dist.get(cur)! + 1);
            queue.push(n);
        }
    }
    return dist;
}

/** The stance that beats `s` in the rock-paper-scissors. */
const COUNTER: Record<TacticalStanceId, TacticalStanceId> = {
    DEFENSIVE_HOLD: 'AGGRESSIVE_ASSAULT',
    MANEUVER_AMBUSH: 'DEFENSIVE_HOLD',
    AGGRESSIVE_ASSAULT: 'MANEUVER_AMBUSH',
};

/** What the enemy fought in most last cycle, from the report. */
function enemyLastStance(war: DistrictWarState, side: FormationSide): TacticalStanceId | undefined {
    const n = new Map<TacticalStanceId, number>();
    for (const d of war.lastReport?.districts ?? []) {
        const s = d.stances[other(side)];
        n.set(s, (n.get(s) ?? 0) + 1);
    }
    let best: TacticalStanceId | undefined;
    let top = 0;
    for (const [s, c] of n) if (c > top) { best = s; top = c; }
    return best;
}

/** Where the army is trying to get: the shield, the barracks, then the capital. */
function objective(ctx: GeneralContext, own: Formation[]): number {
    const types = new Set(own.map(f => f.unitType));
    const reachable = (idx: number) => [...types].some(t => canEverEnter(t, ctx.surface.sectors[idx].terrain));
    const enemy = other(ctx.side);
    const next = (kind: Strongpoint['kind']) => ctx.strongpoints
        .filter(p => p.kind === kind && p.active && p.holder === enemy && reachable(p.sectorIndex))
        .map(p => p.sectorIndex)[0];
    if (ctx.side === 'attacker') return next('shield') ?? next('barracks') ?? CAPITAL_SECTOR;
    return CAPITAL_SECTOR;
}

/** Picks the answer to each of the side's open moments. */
function answerMoments(ctx: GeneralContext, view: DistrictWarState, own: Formation[]): GeneralPlan['moments'] {
    const out: GeneralPlan['moments'] = [];
    const byId = new Map(own.map(f => [f.id, f]));
    for (const m of (view.moments ?? []) as GroundMoment[]) {
        if (m.side !== ctx.side || m.resolved || m.chosen) continue;
        const forms = m.formationIds.map(id => byId.get(id)).filter(Boolean) as Formation[];
        const org = forms.length ? forms.reduce((s, f) => s + (f.organization ?? 100), 0) / forms.length : 0;
        let choice = m.defaultChoice;
        switch (m.kind) {
            case 'pocket': {
                const starving = forms.some(f => (f.starvedCycles ?? 0) >= 4);
                choice = starving && org < 30 ? 'surrender' : org >= 40 ? 'break_out' : 'hold';
                break;
            }
            case 'breakthrough':
                choice = org >= 60 ? 'exploit' : 'consolidate';
                break;
            case 'last_stand':
                choice = 'to_the_last';
                break;
            case 'counterattack':
                choice = org >= 50 ? 'counterattack' : 'hold';
                break;
        }
        out.push({ momentId: m.id, choice });
    }
    return out;
}

/**
 * One cycle's orders for one side. Call between cycles; the caller writes
 * moveTo/stance onto the real formations (by id), the tactic and prediction
 * onto the siege state, and queues the moments and call-ins as orders.
 */
export function commandGround(ctx: GeneralContext): GeneralPlan {
    const { surface, side, cycle } = ctx;
    const enemy = other(side);
    const view = fogView(surface, ctx.war, side, cycle, ctx.orbitHolder);
    const formations = view.formations ?? [];
    const own = formations.filter(f => f.side === side && f.strength > 0);
    const theirs = formations.filter(f => f.side === enemy && f.strength > 0);
    const adjacency = buildAdjacency(surface);
    const seen = new Set(view.visible);
    const orders = new Map<string, GeneralOrder>();
    const order = (f: Formation, moveTo: number | null, stance?: TacticalStanceId) => {
        if (ctx.pinned?.has(f.id)) return;
        orders.set(f.id, { formationId: f.id, moveTo, stance });
    };

    const at = (idx: number, s: FormationSide) => formations.filter(f => f.side === s && f.strength > 0 && f.sectorIndex === idx);
    const enemyGround = (idx: number) => isPassable(surface.sectors[idx]) && controllerOf(view, idx) === enemy;
    // Enemy strength we cannot see is guessed at half the average of what we can.
    const avgSeen = (() => {
        const occupied = new Set(theirs.map(f => f.sectorIndex));
        return occupied.size ? power(theirs) / occupied.size : 0;
    })();
    const defenceAt = (idx: number) => {
        const sec = surface.sectors[idx];
        const known = seen.has(idx) ? power(at(idx, enemy)) : avgSeen * 0.5;
        const holds = controllerOf(view, idx) === enemy;
        const works = holds ? 1 + (view.entrenchment?.[idx] ?? 0) / 250 : 1;
        const ground = holds ? GROUND[sec.terrain] * (sec.river ? 1.25 : 1) : 1;
        return known * works * ground;
    };

    const goal = objective(ctx, own);
    const dist = distanceTo(surface, adjacency, goal);

    // Broken formations come out of the line first.
    const fit: Formation[] = [];
    for (const f of own) {
        if ((f.organization ?? 100) >= RECOVER_ORG || f.encircled) { fit.push(f); continue; }
        const threatened = adjacency[f.sectorIndex].some(n => at(n, enemy).length) || at(f.sectorIndex, enemy).length;
        if (!threatened) { order(f, null, 'DEFENSIVE_HOLD'); continue; }
        const back = legalMoves(surface, view, f)
            .filter(o => !o.contested && !adjacency[o.sectorIndex].some(n => at(n, enemy).length))
            .sort((a, b) => (dist.get(b.sectorIndex) ?? 0) - (dist.get(a.sectorIndex) ?? 0))[0];
        order(f, back?.sectorIndex ?? null, 'DEFENSIVE_HOLD');
    }

    // Who can reach which enemy district this cycle, and with what.
    const reach = new Map<number, Formation[]>();
    for (const f of fit) {
        if (f.encircled || ctx.pinned?.has(f.id)) continue;
        for (const o of legalMoves(surface, view, f)) {
            if (!enemyGround(o.sectorIndex) && !at(o.sectorIndex, enemy).length) continue;
            reach.set(o.sectorIndex, [...(reach.get(o.sectorIndex) ?? []), f]);
        }
    }

    // The reserve: the strongest fit pieces not already in contact, when the
    // army can spare them. The attacker only — the doctrine keeps the defender's.
    const reserve = new Set<string>();
    if (side === 'attacker' && fit.length >= 5) {
        const totalPower = power(fit);
        const spare = fit
            .filter(f => !at(f.sectorIndex, enemy).length && (f.unitType === 'ARMOR' || f.unitType === 'AIRBORNE' || f.unitType === 'INFANTRY'))
            .sort((a, b) => power([b]) - power([a]));
        let held = 0;
        for (const f of spare) {
            if (held + power([f]) > totalPower * RESERVE_SHARE) continue;
            reserve.add(f.id);
            held += power([f]);
        }
    }

    // Score the targets: odds first, then progress toward the objective.
    const scored = [...reach.entries()].map(([idx, forms]) => {
        const def = defenceAt(idx);
        // Going in at the assault (x1.5) against a posture we cannot see (~x0.9).
        const att = power(forms.filter(f => !reserve.has(f.id))) * STANCE_EDGE;
        const odds = def > 0 ? att / def : Infinity;
        const progress = Math.max(0, 6 - (dist.get(idx) ?? 6));
        const prize = idx === goal ? 3 : ctx.strongpoints.some(p => p.sectorIndex === idx && p.holder === enemy && p.active) ? 1.5 : 0;
        return { idx, forms, def, odds, score: Math.min(odds, 4) + progress * 0.4 + prize };
    }).sort((a, b) => b.score - a.score);

    const committed = new Set<string>();
    const assaults: number[] = [];
    const isAttacker = side === 'attacker';

    // Empty enemy ground next to us: one light piece walks in.
    for (const t of scored) {
        if (t.def > 0 || !seen.has(t.idx)) continue;
        const f = t.forms
            .filter(x => !committed.has(x.id) && !reserve.has(x.id) && !orders.has(x.id))
            .sort((a, b) => a.strength - b.strength)[0];
        if (!f) continue;
        // Not the last piece off a district the enemy can walk back into.
        if (at(f.sectorIndex, side).length <= 1 && adjacency[f.sectorIndex].some(n => at(n, enemy).length)) continue;
        order(f, t.idx, 'MANEUVER_AMBUSH');
        committed.add(f.id);
    }

    // The Schwerpunkt: mass on the best one or two districts with real odds.
    // The defender only counter-attacks at better odds and only into ground
    // the invader took from it.
    const want = isAttacker
        ? ((ctx.idleCycles ?? 0) >= PATIENCE ? PRESSURE_ODDS : ASSAULT_ODDS)
        : COUNTER_ODDS;
    for (const t of scored) {
        if (assaults.length >= (isAttacker ? MAX_ASSAULTS : 1)) break;
        if (t.def <= 0) continue;
        if (!isAttacker && controllerOf(view, t.idx) !== 'attacker') continue;
        const pool = t.forms.filter(f => !committed.has(f.id) && !orders.has(f.id) && (isAttacker ? !reserve.has(f.id) : true))
            .sort((a, b) => power([b]) - power([a]));
        let sum = 0;
        const go: Formation[] = [];
        for (const f of pool) {
            // Keep one piece on any district the enemy is standing next to.
            const left = at(f.sectorIndex, side).filter(x => !committed.has(x.id) && !go.includes(x));
            if (left.length <= 1 && adjacency[f.sectorIndex].some(n => at(n, enemy).length && n !== t.idx)) continue;
            go.push(f);
            sum += power([f]) * STANCE_EDGE;
            if (sum / t.def >= ENOUGH_ODDS) break;
        }
        if (!go.length || sum / t.def < want) continue;
        for (const f of go) { order(f, t.idx, 'AGGRESSIVE_ASSAULT'); committed.add(f.id); }
        assaults.push(t.idx);
    }

    // The reserve moves up behind the main assault, one district short of it.
    if (assaults.length) {
        for (const id of reserve) {
            const f = own.find(x => x.id === id)!;
            if (orders.has(id)) continue;
            const step = legalMoves(surface, view, f)
                .filter(o => !o.contested && adjacency[o.sectorIndex].includes(assaults[0]))
                .sort((a, b) => a.cost - b.cost)[0];
            order(f, step?.sectorIndex ?? null, 'DEFENSIVE_HOLD');
        }
    }

    // Everyone else: the attacker edges up toward the objective where that
    // keeps them on friendly ground, otherwise holds; the defender's own moves
    // are the doctrine's (no order).
    if (isAttacker) {
        for (const f of fit) {
            if (orders.has(f.id) || committed.has(f.id)) continue;
            if (at(f.sectorIndex, enemy).length) { order(f, null, 'DEFENSIVE_HOLD'); continue; }
            const d0 = dist.get(f.sectorIndex) ?? Infinity;
            const step = legalMoves(surface, view, f)
                .filter(o => !o.contested && (dist.get(o.sectorIndex) ?? Infinity) < d0)
                .sort((a, b) => (dist.get(a.sectorIndex) ?? 0) - (dist.get(b.sectorIndex) ?? 0))[0];
            order(f, step?.sectorIndex ?? null, 'DEFENSIVE_HOLD');
        }
    }

    // Call-ins: soften the main target, steady a shaken army, screen the worst spot.
    const callIns: GeneralPlan['callIns'] = [];
    const board = { surface, war: ctx.war, orbit: ctx.orbitHolder ? { holder: ctx.orbitHolder, shieldUp: !!ctx.shieldUp } as any : undefined, nextCycle: cycle + 1 };
    const target = assaults[0] ?? scored.find(t => t.def > 0)?.idx;
    if (target != null) {
        for (const kind of ['orbital_strike', 'barrage'] as const) {
            if (!callInBlocked(board, side, kind, target)) { callIns.push({ kind, sector: target }); break; }
        }
    }
    const avgOrg = own.length ? own.reduce((s, f) => s + (f.organization ?? 100), 0) / own.length : 100;
    if (avgOrg < 55 && !callInBlocked(board, side, 'rally', -1)) callIns.push({ kind: 'rally', sector: -1 });
    const outnumbered = own
        .map(f => f.sectorIndex)
        .find(idx => power(at(idx, enemy)) > power(at(idx, side)) * 1.5);
    if (outnumbered != null && !callInBlocked(board, side, 'smoke', outnumbered)) callIns.push({ kind: 'smoke', sector: outnumbered });
    // The defender blows the roads in front of enemy armour and guns, so they
    // crawl instead of rolling: a road district of ours with heavy enemy next to it.
    if (!isAttacker) {
        const heavyNear = (idx: number) => adjacency[idx].some(n => at(n, enemy).some(f => f.unitType === 'ARMOR' || f.unitType === 'ARTILLERY'));
        const cut = surface.sectors.find(s => controllerOf(view, s.index) === side && s.index !== goal
            && heavyNear(s.index) && !callInBlocked(board, side, 'demolish', s.index));
        if (cut) callIns.push({ kind: 'demolish', sector: cut.index });
    }

    // The army-wide stance: answer what the enemy did last time, mostly.
    const last = enemyLastStance(view, side);
    const base: TacticalStanceId = assaults.length ? 'AGGRESSIVE_ASSAULT' : 'DEFENSIVE_HOLD';
    const tactic = last && ctx.rng() < 0.6 ? COUNTER[last] : base;
    const prediction = last && ctx.rng() < 0.5 ? last : undefined;

    const intent = assaults.length
        ? `${isAttacker ? 'Assault' : 'Counter-attack'} on district${assaults.length > 1 ? 's' : ''} ${assaults.join(' and ')}${reserve.size ? `, reserve of ${reserve.size} behind` : ''}.`
        : isAttacker ? 'No odds worth an assault — holding and edging up.' : 'Holding the line.';

    return {
        attacked: assaults.length > 0,
        orders: [...orders.values()],
        tactic,
        prediction,
        moments: answerMoments(ctx, view, own),
        callIns,
        intent,
    };
}
