// lib/combat/siege/battle-beats.ts
//
// What a cycle's fighting looked like, told as a sequence of moments. The
// district battle resolves in one roll (district-battle.ts); this turns that
// roll's real inputs — who was there, the losses, the terrain, the stance
// duel, encirclement, the river, the men who broke — into a handful of beats
// the board can play back over a few seconds and a report can explain.
//
// Nothing here changes the outcome. Every beat carries a share of losses that
// actually happened and is chosen from factors that actually applied, so the
// playback never shows a charge that did not happen or a hero who did not
// hold. Pure and deterministic from the rng passed in.

import type { GroundUnitType, TacticalStanceId } from './siege-types';
import type { TerrainType } from '../../planet-surface/types';
import type { FormationSide } from './formations';

/** One reason a side fought above or below its weight in a district. */
export interface BattleFactor {
    side: FormationSide;
    /** Short label for the report: "Mountains", "Read their ASSAULT", "Encircled". */
    label: string;
    /** Strength multiplier it applied (1.8 = +80%). */
    mult: number;
}

export type BeatKind =
    | 'barrage'        // guns open up before anyone moves
    | 'ambush'         // the ambush stance won the duel
    | 'drop'           // airborne / commandos land behind the line
    | 'river'          // a crossing under fire
    | 'charge'         // an assault goes in
    | 'armor'          // tanks push across open ground
    | 'firefight'      // two lines trading fire
    | 'dug_in'         // entrenched defenders hold the works
    | 'titan'          // an Elder walks through the line
    | 'detonation'     // the fallen ignite (Fireblood)
    | 'pocket'         // encircled men fight without support
    | 'last_stand'     // outnumbered and still holding
    | 'rout'           // formations break and fall back
    | 'surrender'      // men with nowhere to go lay down arms
    | 'breakthrough'   // the district falls
    | 'line_holds';    // the attack is beaten off

export interface BattleBeat {
    /** 0..1 — where in the cycle's playback this beat lands. */
    t: number;
    sector: number;
    kind: BeatKind;
    /** Who did it. */
    side: FormationSide;
    /** The unit type that did it, when one did. */
    unitType?: GroundUnitType;
    /** Men the OTHER side lost to this beat (a share of the real losses). */
    killed: number;
    text: string;
}

/** One district's fight this cycle, for the report card and the playback. */
export interface DistrictReport {
    sector: number;
    terrain: TerrainType;
    holderBefore: FormationSide;
    holder: FormationSide;
    captured: boolean;
    /** Men each side brought in, and lost (killed + surrendered). */
    men: Record<FormationSide, number>;
    lost: Record<FormationSide, number>;
    stances: Record<FormationSide, TacticalStanceId>;
    factors: BattleFactor[];
    beats: BattleBeat[];
}

/**
 * Everything one cycle did on a world, in order. Kept on the siege for the
 * last resolved cycle only — it is display, and the snapshot is synced.
 */
export interface CycleReport {
    cycle: number;
    /** World time the cycle resolved — the client starts playback from here. */
    at: number;
    districts: DistrictReport[];
    /** Friction that hit this cycle (chaos.ts). */
    events: import('./chaos').ChaosEvent[];
    /** Weather the cycle was fought in. */
    weather?: import('./chaos').WeatherKind;
}

export interface BeatInput {
    sector: number;
    terrain: TerrainType;
    river?: boolean;
    holderBefore: FormationSide;
    holder: FormationSide;
    captured: boolean;
    /** What each side brought, before any of it died. */
    brought: Record<FormationSide, Array<{ unitType: GroundUnitType; strength: number }>>;
    losses: Record<FormationSide, Partial<Record<GroundUnitType, number>>>;
    surrendered: Record<FormationSide, Partial<Record<GroundUnitType, number>>>;
    retreated: Record<FormationSide, number>;
    stances: Record<FormationSide, TacticalStanceId>;
    factors: BattleFactor[];
    /** Damage the fallen answered in fire (Fireblood), if any. */
    blast?: number;
    /** Entrenchment of the district going in, 0-100. */
    entrenchment?: number;
}

const NOUN: Record<GroundUnitType, string> = {
    INFANTRY: 'riflemen', ARMOR: 'tanks', ARTILLERY: 'guns', ANTI_ARMOR: 'anti-tank teams',
    AIRBORNE: 'paratroopers', SPECIAL_OPS: 'commandos', MILITIA: 'militia', ELDER_INFERNOID: 'the Elder',
};

const OPEN_GROUND: TerrainType[] = ['plains', 'desert', 'ruins'];

const sum = (m: Partial<Record<GroundUnitType, number>>) =>
    Object.values(m).reduce((a: number, n) => a + (n ?? 0), 0);

const other = (s: FormationSide): FormationSide => s === 'attacker' ? 'defender' : 'attacker';

function pick<T>(rng: () => number, xs: readonly T[]): T {
    return xs[Math.floor(rng() * xs.length) % xs.length];
}

/** The unit type carrying most of a side's weight in this fight. */
function leadType(units: Array<{ unitType: GroundUnitType; strength: number }>): GroundUnitType | undefined {
    const by = new Map<GroundUnitType, number>();
    for (const u of units) by.set(u.unitType, (by.get(u.unitType) ?? 0) + u.strength * (u.unitType === 'ELDER_INFERNOID' ? 60 : 1));
    let best: GroundUnitType | undefined;
    let n = 0;
    for (const [t, v] of by) if (v > n) { best = t; n = v; }
    return best;
}

const has = (units: Array<{ unitType: GroundUnitType }>, ...types: GroundUnitType[]) =>
    units.some(u => types.includes(u.unitType));

const hasFactor = (factors: BattleFactor[], side: FormationSide, label: string) =>
    factors.some(f => f.side === side && f.label.startsWith(label));

/**
 * The cycle's fight in one district as 4-7 beats. Each side's real losses are
 * spread over the opening, the main clash and the decision; the beat kinds
 * come from who was actually there and which factors actually applied.
 */
export function beatsForBattle(input: BeatInput, rng: () => number): BattleBeat[] {
    const { sector, brought, factors, stances } = input;
    const beats: BattleBeat[] = [];
    const lost = {
        attacker: sum(input.losses.attacker),
        defender: sum(input.losses.defender),
    };
    // Losses still to hand out, by the side that SUFFERS them.
    const left = { ...lost };
    const take = (victim: FormationSide, share: number) => {
        const n = Math.min(left[victim], Math.round(lost[victim] * share));
        left[victim] -= n;
        return n;
    };
    const push = (t: number, kind: BeatKind, side: FormationSide, text: string, killed = 0, unitType?: GroundUnitType) =>
        beats.push({ t, kind, side, text, killed, sector, unitType });

    const lead = { attacker: leadType(brought.attacker), defender: leadType(brought.defender) };
    const name = (side: FormationSide) => (lead[side] ? NOUN[lead[side]!] : 'troops');

    // ── Opening ────────────────────────────────────────────────────────
    let t = 0.05;
    for (const side of ['attacker', 'defender'] as const) {
        if (has(brought[side], 'ARTILLERY')) {
            push(t, 'barrage', side, pick(rng, [
                `${side === 'attacker' ? 'Invader' : 'Defending'} guns open up on district ${sector}.`,
                `Shells walk across the ${input.terrain} ahead of the ${side === 'attacker' ? 'assault' : 'line'}.`,
            ]), take(other(side), 0.15), 'ARTILLERY');
            t += 0.06;
        }
    }
    if (input.river && input.holderBefore === 'defender' && hasFactor(factors, 'defender', 'River')) {
        // The defenders do the killing at a crossing: the beat is theirs.
        push(t, 'river', 'defender', pick(rng, [
            `The ${name('attacker')} wade into the river under fire.`,
            `Boats and bridging gear go into the water — the far bank is lit up.`,
        ]), take('attacker', 0.15), lead.defender);
        t += 0.06;
    }
    for (const side of ['attacker', 'defender'] as const) {
        if (stances[side] === 'MANEUVER_AMBUSH' && hasFactor(factors, side, 'Stance')) {
            push(t, 'ambush', side, pick(rng, [
                `The ${name(other(side))} walk straight into a prepared ambush.`,
                `Fire from three sides at once — the ${name(side)} had been waiting.`,
            ]), take(other(side), 0.2), lead[side]);
            t += 0.06;
        }
        if (has(brought[side], 'AIRBORNE', 'SPECIAL_OPS') && rng() < 0.7) {
            const ut = has(brought[side], 'AIRBORNE') ? 'AIRBORNE' : 'SPECIAL_OPS';
            push(t, 'drop', side, pick(rng, [
                `${ut === 'AIRBORNE' ? 'Paratroopers' : 'Commandos'} hit the ${name(other(side))} from behind the line.`,
                `${ut === 'AIRBORNE' ? 'Chutes' : 'Shadows'} come down on the gun line.`,
            ]), take(other(side), 0.1), ut);
            t += 0.06;
        }
    }

    // ── Main clash ─────────────────────────────────────────────────────
    t = Math.max(t, 0.3);
    if (has(brought.attacker, 'ELDER_INFERNOID') || has(brought.defender, 'ELDER_INFERNOID')) {
        const side: FormationSide = has(brought.attacker, 'ELDER_INFERNOID') ? 'attacker' : 'defender';
        push(t, 'titan', side, pick(rng, [
            `The Elder strides through the ${name(other(side))}; the ground shakes with every step.`,
            `A titan wades into the line — small arms spark off its hide.`,
        ]), take(other(side), 0.3), 'ELDER_INFERNOID');
        t += 0.1;
    }
    for (const side of ['attacker', 'defender'] as const) {
        const ut = lead[side];
        if (!ut) continue;
        if (side === input.holderBefore && (input.entrenchment ?? 0) >= 30 && rng() < 0.8) {
            push(t, 'dug_in', side, pick(rng, [
                `The ${name(side)} fight from the works they dug — the assault breaks on the wire.`,
                `Bunkers and trenches: every metre of district ${sector} costs blood.`,
            ]), take(other(side), 0.3), ut);
        } else if (ut === 'ARMOR' && OPEN_GROUND.includes(input.terrain)) {
            push(t, 'armor', side, pick(rng, [
                `Tanks roll across the open ${input.terrain}, guns traversing.`,
                `An armoured wedge drives into the ${name(other(side))}.`,
            ]), take(other(side), 0.3), ut);
        } else if (ut === 'ARTILLERY') {
            // Guns do not charge: whatever the stance, they fire.
            push(t, 'firefight', side, pick(rng, [
                `The guns fire over open sights into district ${sector}.`,
                `The gun line keeps up the fire on the ${name(other(side))}.`,
            ]), take(other(side), 0.3), ut);
        } else if (stances[side] === 'AGGRESSIVE_ASSAULT') {
            push(t, 'charge', side, pick(rng, [
                `The ${name(side)} go in at the run.`,
                `Whistles blow — the ${name(side)} rise and charge.`,
            ]), take(other(side), 0.3), ut);
        } else {
            push(t, 'firefight', side, pick(rng, [
                `The ${name(side)} trade fire across the ${input.terrain}.`,
                `Tracer crosses district ${sector} in both directions.`,
            ]), take(other(side), 0.3), ut);
        }
        t += 0.08;
    }
    for (const side of ['attacker', 'defender'] as const) {
        if (hasFactor(factors, side, 'Encircled')) {
            push(t, 'pocket', side, `Cut off, the ${name(side)} fight without support or resupply.`, take(other(side), 0.05), lead[side]);
            t += 0.05;
        }
    }
    if ((input.blast ?? 0) > 0) {
        push(t, 'detonation', 'attacker', `The fallen ignite — the dead take their killers with them.`, 0);
        t += 0.05;
    }

    // ── Decision ───────────────────────────────────────────────────────
    t = Math.max(t, 0.7);
    const menIn = {
        attacker: brought.attacker.reduce((s, u) => s + u.strength, 0),
        defender: brought.defender.reduce((s, u) => s + u.strength, 0),
    };
    // Whatever losses are left land in the decisive moment.
    const holder = input.holder;
    const loser = other(holder);
    if (input.retreated[loser] > 0) {
        push(t, 'rout', loser, pick(rng, [
            `The ${name(loser)} break and fall back.`,
            `Order goes — the ${name(loser)} stream back toward their own lines.`,
        ]), 0, lead[loser]);
        t += 0.06;
    }
    const gaveUp = { attacker: sum(input.surrendered.attacker), defender: sum(input.surrendered.defender) };
    for (const side of ['attacker', 'defender'] as const) {
        if (gaveUp[side] > 0) {
            push(t, 'surrender', side, `${gaveUp[side]} ${name(side)} with nowhere to run lay down their arms.`, 0, lead[side]);
            t += 0.05;
        }
    }
    // Outnumbered nearly two to one and still holding: that is worth telling.
    if (!input.captured && menIn[holder] > 0 && menIn[holder] < menIn[loser] * 0.6) {
        push(t, 'last_stand', holder, pick(rng, [
            `Outnumbered, the ${name(holder)} refuse to give ground.`,
            `A handful of ${name(holder)} hold district ${sector} against everything thrown at them.`,
        ]), take(loser, 1), lead[holder]);
    } else if (input.captured) {
        push(t, 'breakthrough', holder, pick(rng, [
            `District ${sector} falls — the ${name(holder)} are through.`,
            `The ${name(loser)} are pushed out; ${holder === 'attacker' ? 'invader' : 'defender'} colours go up over district ${sector}.`,
        ]), take(loser, 1), lead[holder]);
    } else {
        push(t, 'line_holds', holder, pick(rng, [
            `The attack on district ${sector} is beaten off.`,
            `The line in district ${sector} holds — for now.`,
        ]), take(loser, 1), lead[holder]);
    }
    // Whatever the holder lost that no beat claimed falls in the general fighting.
    const rest = left[holder];
    if (rest > 0) {
        const clash = beats.filter(b => b.side === loser && b.kind !== 'rout' && b.kind !== 'surrender');
        if (clash.length) clash[clash.length - 1].killed += rest;
        else push(0.5, 'firefight', loser, `The ${name(loser)} make them pay for it.`, rest, lead[loser]);
        left[holder] = 0;
    }
    if (left[loser] > 0) beats[beats.length - 1].killed += left[loser];

    beats.sort((a, b) => a.t - b.t);
    for (const b of beats) b.t = Math.min(0.95, b.t);
    return beats;
}

/** The report card entry for one district: totals plus beats. */
export function districtReport(input: BeatInput, rng: () => number): DistrictReport {
    const men = {
        attacker: input.brought.attacker.reduce((s, u) => s + u.strength, 0),
        defender: input.brought.defender.reduce((s, u) => s + u.strength, 0),
    };
    const lost = {
        attacker: sum(input.losses.attacker) + sum(input.surrendered.attacker),
        defender: sum(input.losses.defender) + sum(input.surrendered.defender),
    };
    return {
        sector: input.sector,
        terrain: input.terrain,
        holderBefore: input.holderBefore,
        holder: input.holder,
        captured: input.captured,
        men,
        lost,
        stances: input.stances,
        factors: input.factors.filter(f => Math.abs(f.mult - 1) >= 0.02),
        beats: beatsForBattle(input, rng),
    };
}
