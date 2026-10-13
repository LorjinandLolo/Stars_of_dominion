// lib/combat/siege/district-battle.ts
//
// Battles happen where pieces meet. When both sides have formations standing
// in the same district, this resolves that district's fight: unit matchups,
// the terrain underfoot, entrenchment, stance rock-paper-scissors, and
// encirclement. Whoever is left holding the ground takes the district.

import type { PlanetSurface, TerrainType } from '../../planet-surface/types';
import type { GroundUnitType, TacticalStanceId, DistrictWarState } from './siege-types';
import type { Formation, FormationSide } from './formations';
import { formationsAt } from './formations';
import { buildAdjacency, controllerOf, isPassable } from './district-front';

/** Raw fighting value per man, by unit type. One Elder is not a man. */
const UNIT_POWER: Record<GroundUnitType, number> = {
    ELDER_INFERNOID: 60,
    ARMOR: 2.5, ARTILLERY: 2.0, ANTI_ARMOR: 1.8, AIRBORNE: 1.6,
    SPECIAL_OPS: 1.5, INFANTRY: 1.0, MILITIA: 0.6,
};

/**
 * Unit types whose fire can hurt an Elder at all. Everything else is small arms
 * against a walking siege engine.
 *
 * An Elder counts itself: the only thing that reliably answers a titan is
 * another titan, or a weapon built to kill one.
 */
const ELDER_KILLERS: readonly GroundUnitType[] = ['ANTI_ARMOR', 'ARMOR', 'ARTILLERY', 'ELDER_INFERNOID'];

/** Counters: attacker type → multiplier against defender type. */
const MATCHUP: Partial<Record<GroundUnitType, Partial<Record<GroundUnitType, number>>>> = {
    // The one honest answer to a titan, and the reason ANTI_ARMOR stops being
    // a niche pick the moment the Infernoids field one.
    ANTI_ARMOR: { ARMOR: 2.2, ELDER_INFERNOID: 2.4 },
    ARMOR: { INFANTRY: 1.5, ARTILLERY: 1.8, MILITIA: 1.9 },
    ARTILLERY: { INFANTRY: 1.3, MILITIA: 1.4 },      // shells fall on massed men
    AIRBORNE: { ARTILLERY: 1.7 },                    // drop on the gun line
    SPECIAL_OPS: { ARTILLERY: 1.9, MILITIA: 1.6 },
    INFANTRY: { ANTI_ARMOR: 1.2 },
    // Walks into massed men and through them. Guns are the softest thing on the
    // field to something that tall, and the hardest thing to hide from it.
    ELDER_INFERNOID: { MILITIA: 2.8, INFANTRY: 2.4, ARTILLERY: 1.6, AIRBORNE: 1.5 },
};

/** Terrain multiplier for whoever is defending the district. */
const TERRAIN_DEFENCE: Record<TerrainType, number> = {
    mountains: 1.9, urban: 1.8, volcanic: 1.7, jungle: 1.5, forest: 1.35,
    toxic: 1.3, frozen: 1.25, ruins: 1.2, desert: 1.0, plains: 0.9, ocean: 1,
};

/** Terrain that blunts heavy formations regardless of who holds it. */
const HEAVY_PENALTY: Partial<Record<TerrainType, number>> = {
    mountains: 0.6, jungle: 0.6, forest: 0.8, urban: 0.7, frozen: 0.85,
};

const STANCE: Record<TacticalStanceId, { dealt: number; taken: number; beats: TacticalStanceId }> = {
    AGGRESSIVE_ASSAULT: { dealt: 1.5, taken: 1.25, beats: 'DEFENSIVE_HOLD' },
    DEFENSIVE_HOLD: { dealt: 0.8, taken: 0.6, beats: 'MANEUVER_AMBUSH' },
    MANEUVER_AMBUSH: { dealt: 1.0, taken: 1.0, beats: 'AGGRESSIVE_ASSAULT' },
};

export interface DistrictBattleResult {
    sectorIndex: number;
    /** Side that holds the district when the shooting stops. */
    holder: FormationSide;
    /** Whether the district changed hands. */
    captured: boolean;
    lossesBySide: Record<FormationSide, Partial<Record<GroundUnitType, number>>>;
    /**
     * Men who broke with nowhere to fall back to and laid down their arms.
     * Every one of them is a prisoner; none of them is in `lossesBySide`.
     */
    surrenderedBySide: Record<FormationSide, Partial<Record<GroundUnitType, number>>>;
    /** Formations that broke and fell back to friendly ground. */
    retreatedBySide: Record<FormationSide, number>;
    /** Morale at the moment losses landed — drives prisoner counts. */
    moraleBySide: Record<FormationSide, number>;
    log: string;
}

/** Army-wide morale as a strength multiplier: 0.6 at zero, 1.1 at full. */
export const moraleMultiplier = (morale: number) =>
    0.6 + 0.5 * Math.max(0, Math.min(100, morale)) / 100;

function sideStrength(
    formations: Formation[],
    enemy: Formation[],
    terrain: TerrainType,
    defending: boolean,
    entrenchment: number,
    stance: TacticalStanceId,
): number {
    let total = 0;
    for (const f of formations) {
        let power = f.strength * UNIT_POWER[f.unitType];

        // Matchups: weight by what the enemy actually fields here.
        const enemyTotal = enemy.reduce((s, e) => s + e.strength, 0) || 1;
        let matchup = 0;
        for (const e of enemy) {
            const m = MATCHUP[f.unitType]?.[e.unitType] ?? 1;
            matchup += m * (e.strength / enemyTotal);
        }
        power *= matchup;

        // Rough ground blunts heavy formations.
        if (f.unitType === 'ARMOR' || f.unitType === 'ARTILLERY') {
            power *= HEAVY_PENALTY[terrain] ?? 1;
        }
        // Starving men fight badly.
        power *= 0.45 + (f.supply / 100) * 0.55;
        // So do disorganised ones — this is what makes a rail redeployment
        // into a live battle a mistake rather than a shortcut.
        power *= 0.35 + ((f.organization ?? 100) / 100) * 0.65;
        total += power;
    }

    if (defending) total *= TERRAIN_DEFENCE[terrain] * (1 + entrenchment / 250);
    return total * STANCE[stance].dealt;
}

/**
 * Share of a side's raw fighting power carried by weapons heavy enough to
 * threaten an Elder, 0..1.
 *
 * Both sides are measured before any casualties land, so neither is scored
 * against a formation list the other side has already thinned.
 */
function heavyShare(formations: Formation[]): number {
    let heavy = 0;
    let total = 0;
    for (const f of formations) {
        const p = Math.max(0, f.strength) * UNIT_POWER[f.unitType];
        total += p;
        if (ELDER_KILLERS.includes(f.unitType)) heavy += p;
    }
    return total > 0 ? heavy / total : 0;
}

/** Spreads casualties across a side's formations, weakest units dying first. */
function applyLosses(
    formations: Formation[],
    damage: number,
    /**
     * The portion of `damage` delivered by ELDER_KILLERS. Only this pool can
     * touch an Elder.
     *
     * Defaults to the whole pool, which is exactly right for a fireblood
     * detonation — an exploding Infernoid does not care what type of soldier
     * it is standing next to.
     */
    heavyDamage: number = damage,
): Partial<Record<GroundUnitType, number>> {
    const losses: Partial<Record<GroundUnitType, number>> = {};
    // Militia and infantry absorb first; specialists are held back. Elders are
    // LAST: while anything else is still standing in this district, the fire is
    // not landing on the titan.
    const order: GroundUnitType[] = ['MILITIA', 'INFANTRY', 'AIRBORNE', 'ANTI_ARMOR', 'ARMOR', 'ARTILLERY', 'SPECIAL_OPS', 'ELDER_INFERNOID'];
    let remaining = damage;
    let heavyRemaining = Math.max(0, Math.min(heavyDamage, damage));
    for (const type of order) {
        if (remaining <= 0) break;
        const cost = UNIT_POWER[type];
        const isElder = type === 'ELDER_INFERNOID';
        for (const f of formations.filter(x => x.unitType === type && x.strength > 0)) {
            if (remaining <= 0) break;
            let killable: number;
            if (isElder) {
                // Two gates, and together they are the whole mechanic:
                //
                //   1. Only the heavy pool counts. Massed small arms cannot
                //      hurt it no matter how much of it there is — an army of
                //      pure infantry kills exactly zero Elders.
                //   2. floor(), not ceil(). A blow that does not land whole
                //      does not land at all, so chip damage is DISCARDED rather
                //      than accumulated across cycles. This is the clause that
                //      makes it "defeat with even blows" instead of "grind it
                //      down eventually".
                //
                // The pool is also bounded by `remaining`, or damage already
                // spent killing the escort would be spent a second time here.
                const pool = Math.min(heavyRemaining, remaining);
                if (pool < cost) break;
                killable = Math.min(f.strength, Math.floor(pool / cost));
                if (killable <= 0) break;
            } else {
                killable = Math.min(f.strength, Math.ceil(remaining / cost));
            }
            f.strength -= killable;
            const spent = killable * cost;
            remaining -= spent;
            heavyRemaining -= spent;
            losses[type] = (losses[type] ?? 0) + killable;
        }
    }
    return losses;
}

/**
 * Resolves one district's fight. `stances` are the army-wide postures; a
 * formation's own stance overrides for its side if set.
 */
export function resolveDistrictBattle(
    surface: PlanetSurface,
    war: DistrictWarState,
    formations: Formation[],
    sectorIndex: number,
    stances: Record<FormationSide, TacticalStanceId>,
    morale: Record<FormationSide, number>,
    rng: () => number,
    /** Planning bonus per side, 0..0.25 — a prepared attack hits harder. */
    planning: Record<FormationSide, number> = { attacker: 0, defender: 0 },
    /**
     * Civilization traits per side. `dealt` scales the damage that side inflicts,
     * `taken` scales the casualties it suffers.
     *
     * Both are needed because losses here scale with the OPPONENT's strength —
     * raising your own `dealt` does nothing for your own casualties, so a
     * "tougher" civilization has to reduce `taken` separately.
     *
     * This function is deliberately faction-blind (Formation carries `side`, not
     * a faction id), so the caller resolves the civilization and passes numbers.
     * There is no clamp in this layer; the caller bounds them.
     */
    traits: Record<FormationSide, { dealt: number; taken: number; detonation?: number }> = {
        attacker: { dealt: 1, taken: 1, detonation: 0 },
        defender: { dealt: 1, taken: 1, detonation: 0 },
    },
    /**
     * The cycle's stance reads, as strength multipliers: a commander who
     * guessed the enemy's posture fights above weight this cycle, one who
     * guessed wrong below it. 1 when no read was made.
     */
    reads: Record<FormationSide, number> = { attacker: 1, defender: 1 },
): DistrictBattleResult | null {
    const attackers = formationsAt(formations, sectorIndex, 'attacker');
    const defenders = formationsAt(formations, sectorIndex, 'defender');
    if (!attackers.length || !defenders.length) return null;
    // Snapshots for the organisation maths below: what each side brought,
    // before any of it died.
    const attackersBefore = attackers.map(f => ({ strength: f.strength, unitType: f.unitType }));
    const defendersBefore = defenders.map(f => ({ strength: f.strength, unitType: f.unitType }));

    const sector = surface.sectors[sectorIndex];
    const terrain = sector.terrain;
    const entrench = war.entrenchment?.[sectorIndex] ?? 0;
    // Whoever already controlled the ground fights as the defender.
    const holderBefore: FormationSide = (war.control?.[sectorIndex] === 'attacker') ? 'attacker' : 'defender';

    const aStance = attackers[0].stance ?? stances.attacker;
    const dStance = defenders[0].stance ?? stances.defender;

    let aStr = sideStrength(attackers, defenders, terrain, holderBefore === 'attacker', entrench, aStance);
    let dStr = sideStrength(defenders, attackers, terrain, holderBefore === 'defender', entrench, dStance);

    // Stance rock-paper-scissors.
    if (STANCE[aStance].beats === dStance) aStr *= 1.15;
    if (STANCE[dStance].beats === aStance) dStr *= 1.15;

    // A rehearsed plan pays off on the day.
    aStr *= 1 + (planning.attacker ?? 0);
    dStr *= 1 + (planning.defender ?? 0);

    // An army that believes it is winning fights like it; one that has been
    // bled and pushed back for cycles does not.
    aStr *= moraleMultiplier(morale.attacker);
    dStr *= moraleMultiplier(morale.defender);

    // The commander who read the enemy's posture right this cycle.
    aStr *= reads.attacker ?? 1;
    dStr *= reads.defender ?? 1;

    // Who is fighting, and on what ground. The Sarrak hit harder in wet terrain
    // and worse on dry; the Divine Serum rides the same multiplier.
    aStr *= traits.attacker?.dealt ?? 1;
    dStr *= traits.defender?.dealt ?? 1;

    // Encircled formations fight without support.
    if (attackers.every(f => f.encircled)) aStr *= 0.7;
    if (defenders.every(f => f.encircled)) dStr *= 0.7;

    // A little friction so identical fights don't always play out identically.
    aStr *= 0.9 + rng() * 0.2;
    dStr *= 0.9 + rng() * 0.2;

    // Damage each side deals is scaled by what the other side can soak.
    // `taken` is where "regeneration" ended up: no formation in this engine ever
    // heals, so a tougher civilization bleeds less rather than recovering.
    // Measured before either applyLosses call, so neither side's heavy weight is
    // scored against a formation list the other side has already thinned.
    const aHeavy = heavyShare(attackers);
    const dHeavy = heavyShare(defenders);

    const attackerIncoming = dStr * STANCE[aStance].taken * 0.35 * (traits.attacker?.taken ?? 1);
    const defenderIncoming = aStr * STANCE[dStance].taken * 0.35 * (traits.defender?.taken ?? 1);

    // The second argument is the share of that damage heavy enough to threaten
    // an Elder. For every other unit type it is ignored entirely, so this is a
    // no-op for thirteen of the fourteen empires.
    const attackerLosses = applyLosses(attackers, attackerIncoming, attackerIncoming * dHeavy);
    const defenderLosses = applyLosses(defenders, defenderIncoming, defenderIncoming * aHeavy);

    // Fireblood: a side whose blood ignites takes the enemy with it. The dead
    // are converted back into damage against whoever just killed them, in the
    // same cycle and the same district.
    //
    // Placed BEFORE the aLeft/dLeft count below on purpose — that is what lets
    // Infernoid casualties actually deny the enemy the ground, rather than
    // decorating the log after the holder has already been decided.
    //
    // Dimensionally exact: applyLosses converts damage to kills at
    // UNIT_POWER[type] per man, so Σ(losses[t] × UNIT_POWER[t]) × coeff is its
    // proper inverse.
    const detonate = (
        losses: Partial<Record<GroundUnitType, number>>,
        victims: Formation[],
        coeff: number,
    ): number => {
        if (!coeff || coeff <= 0) return 0;
        let power = 0;
        for (const [type, n] of Object.entries(losses)) {
            power += (n as number) * UNIT_POWER[type as GroundUnitType];
        }
        const damage = power * coeff;
        if (damage > 0) applyLosses(victims, damage);
        return damage;
    };
    // Each side's own dead detonate into the OPPOSING formation list.
    const attackerBlast = detonate(attackerLosses, defenders, traits.attacker?.detonation ?? 0);
    const defenderBlast = detonate(defenderLosses, attackers, traits.defender?.detonation ?? 0);

    // ── Organisation under fire ──────────────────────────────────────────
    // Casualties are only half of what a battle does to a formation; the other
    // half is what it does to its order. Each side's organisation drops by a
    // flat cost for standing in a fight plus a share proportional to the
    // fraction of its fighting power that just died. A formation ground down
    // to BREAK_ORG breaks: it falls back to friendly ground if it has any, and
    // surrenders where it stands if it has none. That is what makes a battle
    // decisive without annihilating the loser, and what makes encirclement
    // lethal rather than merely uncomfortable.
    const aPowerBefore = rawPower(attackersBefore);
    const dPowerBefore = rawPower(defendersBefore);
    drainOrganization(attackers, lostPower(attackerLosses) / Math.max(1, aPowerBefore), STANCE[aStance].taken);
    drainOrganization(defenders, lostPower(defenderLosses) / Math.max(1, dPowerBefore), STANCE[dStance].taken);

    const aBreak = breakFormations(surface, war, formations, attackers, sectorIndex);
    const dBreak = breakFormations(surface, war, formations, defenders, sectorIndex);

    const aLeft = formationsAt(formations, sectorIndex, 'attacker').reduce((s, f) => s + Math.max(0, f.strength), 0);
    const dLeft = formationsAt(formations, sectorIndex, 'defender').reduce((s, f) => s + Math.max(0, f.strength), 0);

    // The ground goes to whoever still has men on it. A tie leaves the
    // original holder in place — you must actually push the enemy out.
    let holder: FormationSide = holderBefore;
    if (aLeft > 0 && dLeft <= 0) holder = 'attacker';
    else if (dLeft > 0 && aLeft <= 0) holder = 'defender';

    const captured = holder !== holderBefore;
    if (captured) {
        if (holder === 'attacker') war.control[sectorIndex] = 'attacker';
        else delete war.control[sectorIndex];
        // The works were built facing the other way. Whoever takes a district
        // inherits a fraction of its entrenchment and has to dig the rest.
        (war.entrenchment ??= {})[sectorIndex] = Math.round(entrench * CAPTURED_ENTRENCHMENT_KEEP);
    }

    const name = `${sector.terrain} district ${sectorIndex}`;
    const blast = attackerBlast + defenderBlast;
    const retreated = aBreak.retreated + dBreak.retreated;
    const surrendered = countOf(aBreak.surrendered) + countOf(dBreak.surrendered);
    const log = (captured
        ? `${holder === 'attacker' ? 'Invaders storm' : 'Defenders retake'} the ${name}.`
        : `Fighting rages in the ${name} — the line holds.`)
        + (blast > 0 ? ` The fallen ignite — ${blast.toFixed(0)} answered in fire.` : '')
        + (retreated > 0 ? ` ${retreated} formation${retreated > 1 ? 's' : ''} break${retreated > 1 ? '' : 's'} and fall${retreated > 1 ? '' : 's'} back.` : '')
        + (surrendered > 0 ? ` ${surrendered} cut off and taken.` : '');

    return {
        sectorIndex,
        holder,
        captured,
        lossesBySide: { attacker: attackerLosses, defender: defenderLosses },
        surrenderedBySide: { attacker: aBreak.surrendered, defender: dBreak.surrendered },
        retreatedBySide: { attacker: aBreak.retreated, defender: dBreak.retreated },
        moraleBySide: { attacker: morale.attacker, defender: morale.defender },
        log,
    };
}

// ─── Organisation, breaking and retreat ──────────────────────────────────────

/** Organisation at or below which a formation breaks and leaves the fight. */
export const BREAK_ORG = 20;
/** Flat organisation cost of standing in a battle for a cycle. */
const ORG_BATTLE_COST = 6;
/** Organisation lost per 100% of the side's fighting power killed. */
const ORG_PER_LOSS_SHARE = 110;
/** Share of a district's entrenchment the new holder inherits. */
const CAPTURED_ENTRENCHMENT_KEEP = 0.4;

const rawPower = (forms: Array<Pick<Formation, 'strength' | 'unitType'>>) =>
    forms.reduce((s, f) => s + Math.max(0, f.strength) * UNIT_POWER[f.unitType], 0);

const lostPower = (losses: Partial<Record<GroundUnitType, number>>) =>
    (Object.entries(losses) as Array<[GroundUnitType, number]>)
        .reduce((s, [t, n]) => s + (n ?? 0) * UNIT_POWER[t], 0);

const countOf = (losses: Partial<Record<GroundUnitType, number>>) =>
    Object.values(losses).reduce((s, n) => s + (n ?? 0), 0);

function drainOrganization(formations: Formation[], lossShare: number, stanceTaken: number): void {
    // A side that chose an exposed stance pays more order for the same blood.
    const drain = (ORG_BATTLE_COST + ORG_PER_LOSS_SHARE * Math.min(1, Math.max(0, lossShare))) * stanceTaken;
    for (const f of formations) {
        if (f.strength <= 0) continue;
        f.organization = Math.max(0, (f.organization ?? 100) - drain);
    }
}

/**
 * Where a broken formation can fall back to: an adjacent, passable district
 * its own side holds with no enemy standing in it. Prefers the district with
 * the most friendly strength already there (rally on the main body), then the
 * one with the deepest friendly ring. Null when it has nowhere to go.
 */
export function retreatDistrict(
    surface: PlanetSurface,
    war: DistrictWarState,
    formations: Formation[],
    formation: Formation,
): number | null {
    const adjacency = buildAdjacency(surface);
    const enemy: FormationSide = formation.side === 'attacker' ? 'defender' : 'attacker';
    let best: number | null = null;
    let bestScore = -Infinity;
    for (const n of adjacency[formation.sectorIndex] ?? []) {
        const sec = surface.sectors[n];
        if (!isPassable(sec)) continue;
        if (controllerOf(war, n) !== formation.side) continue;
        if (formationsAt(formations, n, enemy).length) continue;
        const friendly = formationsAt(formations, n, formation.side).reduce((s, f) => s + f.strength, 0);
        // Attackers rally toward the beachhead (outer rings), defenders toward
        // the capital (inner rings).
        const depth = formation.side === 'attacker' ? sec.ring : -sec.ring;
        const score = friendly + depth * 50 + (war.entrenchment?.[n] ?? 0);
        if (score > bestScore) { bestScore = score; best = n; }
    }
    return best;
}

function breakFormations(
    surface: PlanetSurface,
    war: DistrictWarState,
    all: Formation[],
    side: Formation[],
    sectorIndex: number,
): { retreated: number; surrendered: Partial<Record<GroundUnitType, number>> } {
    let retreated = 0;
    const surrendered: Partial<Record<GroundUnitType, number>> = {};
    for (const f of side) {
        if (f.strength <= 0) continue;
        if ((f.organization ?? 100) > BREAK_ORG) continue;
        const to = retreatDistrict(surface, war, all, f);
        if (to != null) {
            f.sectorIndex = to;
            f.moveTo = null;
            f.path = [];
            f.redeploying = false;
            retreated++;
        } else {
            // Nowhere to run. Men who cannot fight and cannot flee lay down
            // their arms — every one of them is a prisoner, not a casualty.
            surrendered[f.unitType] = (surrendered[f.unitType] ?? 0) + f.strength;
            f.strength = 0;
        }
    }
    void sectorIndex;
    return { retreated, surrendered };
}

// ─── Orbital fire ────────────────────────────────────────────────────────────

/** Power-points of casualties per point of orbital support, per tick. */
const BOMBARD_KILL_PER_POWER = 0.05;
/** Entrenchment shed per point of orbital support, per tick. */
const BOMBARD_ENTRENCH_PER_POWER = 0.004;
/** Organisation shed per point of orbital support, per tick (suppression). */
const BOMBARD_ORG_PER_POWER = 0.004;

export interface BombardmentResult {
    /** Fighting men killed, by type. */
    losses: Partial<Record<GroundUnitType, number>>;
    /** Districts whose entrenchment was worked over. */
    districts: number[];
}

/**
 * Orbital bombardment against the pieces on the board. Fire falls on the
 * defender's forward districts — the ones that touch attacker ground, plus
 * any the attacker is standing in — and does three things there: it kills,
 * it flattens entrenchment, and it suppresses (organisation). Orbital fire is
 * heavy by definition, so an Elder is as exposed to it as anything else.
 *
 * Pure over `war`; the worker decides what `power` is from what is actually
 * in orbit this tick.
 */
export function bombardFormations(
    war: DistrictWarState,
    formations: Formation[],
    power: number,
    forwardDistricts: number[],
): BombardmentResult {
    const out: BombardmentResult = { losses: {}, districts: [] };
    if (power <= 0) return out;
    const targets = new Set<number>(forwardDistricts);
    for (const f of formations) {
        if (f.side === 'attacker' && f.strength > 0) targets.add(f.sectorIndex);
    }
    const exposed = formations.filter(f => f.side === 'defender' && f.strength > 0 && targets.has(f.sectorIndex));
    for (const idx of targets) {
        if (controllerOf(war, idx) !== 'defender') continue;
        const cur = war.entrenchment?.[idx] ?? 0;
        if (cur <= 0) continue;
        (war.entrenchment ??= {})[idx] = Math.max(0, cur - power * BOMBARD_ENTRENCH_PER_POWER);
        out.districts.push(idx);
    }
    if (!exposed.length) return out;
    const total = rawPower(exposed) || 1;
    const damage = power * BOMBARD_KILL_PER_POWER;
    for (const f of exposed) {
        const share = (Math.max(0, f.strength) * UNIT_POWER[f.unitType]) / total;
        const lost = applyLosses([f], damage * share);
        for (const [t, n] of Object.entries(lost) as Array<[GroundUnitType, number]>) {
            out.losses[t] = (out.losses[t] ?? 0) + n;
        }
        f.organization = Math.max(0, (f.organization ?? 100) - power * BOMBARD_ORG_PER_POWER);
    }
    return out;
}
