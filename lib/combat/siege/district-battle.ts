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
    /** Morale at the moment losses landed — drives prisoner counts. */
    moraleBySide: Record<FormationSide, number>;
    log: string;
}

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
): DistrictBattleResult | null {
    const attackers = formationsAt(formations, sectorIndex, 'attacker');
    const defenders = formationsAt(formations, sectorIndex, 'defender');
    if (!attackers.length || !defenders.length) return null;

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

    const aLeft = attackers.reduce((s, f) => s + Math.max(0, f.strength), 0);
    const dLeft = defenders.reduce((s, f) => s + Math.max(0, f.strength), 0);

    // The ground goes to whoever still has men on it. A tie leaves the
    // original holder in place — you must actually push the enemy out.
    let holder: FormationSide = holderBefore;
    if (aLeft > 0 && dLeft <= 0) holder = 'attacker';
    else if (dLeft > 0 && aLeft <= 0) holder = 'defender';

    const captured = holder !== holderBefore;
    if (captured) {
        if (holder === 'attacker') war.control[sectorIndex] = 'attacker';
        else delete war.control[sectorIndex];
    }

    const name = `${sector.terrain} district ${sectorIndex}`;
    const blast = attackerBlast + defenderBlast;
    const log = (captured
        ? `${holder === 'attacker' ? 'Invaders storm' : 'Defenders retake'} the ${name}.`
        : `Fighting rages in the ${name} — the line holds.`)
        + (blast > 0 ? ` The fallen ignite — ${blast.toFixed(0)} answered in fire.` : '');

    return {
        sectorIndex,
        holder,
        captured,
        lossesBySide: { attacker: attackerLosses, defender: defenderLosses },
        moraleBySide: { attacker: morale.attacker, defender: morale.defender },
        log,
    };
}
