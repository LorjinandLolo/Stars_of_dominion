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

/** Raw fighting value per man, by unit type. */
const UNIT_POWER: Record<GroundUnitType, number> = {
    ARMOR: 2.5, ARTILLERY: 2.0, ANTI_ARMOR: 1.8, AIRBORNE: 1.6,
    SPECIAL_OPS: 1.5, INFANTRY: 1.0, MILITIA: 0.6,
};

/** Counters: attacker type → multiplier against defender type. */
const MATCHUP: Partial<Record<GroundUnitType, Partial<Record<GroundUnitType, number>>>> = {
    ANTI_ARMOR: { ARMOR: 2.2 },                      // the whole point of them
    ARMOR: { INFANTRY: 1.5, ARTILLERY: 1.8, MILITIA: 1.9 },
    ARTILLERY: { INFANTRY: 1.3, MILITIA: 1.4 },      // shells fall on massed men
    AIRBORNE: { ARTILLERY: 1.7 },                    // drop on the gun line
    SPECIAL_OPS: { ARTILLERY: 1.9, MILITIA: 1.6 },
    INFANTRY: { ANTI_ARMOR: 1.2 },
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

/** Spreads casualties across a side's formations, weakest units dying first. */
function applyLosses(
    formations: Formation[],
    damage: number,
): Partial<Record<GroundUnitType, number>> {
    const losses: Partial<Record<GroundUnitType, number>> = {};
    // Militia and infantry absorb first; specialists are held back.
    const order: GroundUnitType[] = ['MILITIA', 'INFANTRY', 'AIRBORNE', 'ANTI_ARMOR', 'ARMOR', 'ARTILLERY', 'SPECIAL_OPS'];
    let remaining = damage;
    for (const type of order) {
        if (remaining <= 0) break;
        for (const f of formations.filter(x => x.unitType === type && x.strength > 0)) {
            if (remaining <= 0) break;
            const cost = UNIT_POWER[type];
            const killable = Math.min(f.strength, Math.ceil(remaining / cost));
            f.strength -= killable;
            remaining -= killable * cost;
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

    // Encircled formations fight without support.
    if (attackers.every(f => f.encircled)) aStr *= 0.7;
    if (defenders.every(f => f.encircled)) dStr *= 0.7;

    // A little friction so identical fights don't always play out identically.
    aStr *= 0.9 + rng() * 0.2;
    dStr *= 0.9 + rng() * 0.2;

    // Damage each side deals is scaled by what the other side can soak.
    const attackerLosses = applyLosses(attackers, dStr * STANCE[aStance].taken * 0.35);
    const defenderLosses = applyLosses(defenders, aStr * STANCE[dStance].taken * 0.35);

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
    const log = captured
        ? `${holder === 'attacker' ? 'Invaders storm' : 'Defenders retake'} the ${name}.`
        : `Fighting rages in the ${name} — the line holds.`;

    return {
        sectorIndex,
        holder,
        captured,
        lossesBySide: { attacker: attackerLosses, defender: defenderLosses },
        moraleBySide: { attacker: morale.attacker, defender: morale.defender },
        log,
    };
}
