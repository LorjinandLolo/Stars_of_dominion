// lib/combat/combat-manager.ts
import { GameWorldState } from '../game-world-state';
import { Fleet } from '../movement/types';
import { notifyTitleMetric, COUNTER_FLEET_POWER_DESTROYED } from '../titles/metrics';
import { CombatantState, CombatState } from './combat-types';
import {
    initiateCombat,
    resolveEngagementRound,
    advanceRound,
    checkAnnihilation,
    applyPostBattleDirective,
} from './combat-engine';
import config from './combat-config.json';
import { getTechModifiers } from '../tech/modifiers';
import { bumpMetric } from '../tech/history-ledger';
import { DEED_FLEETS_DESTROYED, DEED_FLEETS_LOST } from '../tech/deed-metrics';
import { getBrutalityBonus, recordTrophyKill, shouldRoutFromFear, FEAR_ROUT_GRACE_SECONDS } from '../factions/kaerruun';
import { getSerumBonus } from '../factions/sarrak';
import { getSurgeBonus } from '../factions/gabagoon';
import { phaseShieldBonus, precognitionBonus } from '../factions/nexulan';
import { FIREBLOOD_FLEET_COEFF, isInfernoid, recordDetonation } from '../factions/infernoid';
import { issueMoveOrder } from '../movement/movement-service';
import { AMBUSH_FRESH_SECONDS, AMBUSH_ORGANIZATION_FACTOR } from '../movement/belts';
import { RNG, seedFromString } from '../trade-system/rng';
import { computeOrbitalRatings, applyOrbitalDamage } from '../orbital/orbital-service';
import * as chronicle from '../narrative/chronicle';
import { fireNotification } from '../time/notification-hooks';
import {
    pickRoles,
    snapshotForce,
    refreshCombatant,
    breakingFleets,
    splitDamage,
    PURSUIT_STRENGTH_LOSS,
} from './engagement-rules';
import { experienceMultiplier, gainExperience } from './veterancy';
import { commandingAdmiral, admiralPowerBonus, admiralBattleXp, ADMIRAL_PREDICTION_POINTS } from './admiralty';
import { LeadershipService } from '../leadership/leadership-service';

/** Engine default for a correct stance prediction (combat-engine.ts:259). */
const BASE_PREDICTION_BONUS = 0.15;

type BattleEnd = NonNullable<CombatState['outcome']>['reason'];
type Fortification = NonNullable<CombatantState['fortification']>;

/**
 * Handles real-time detection and resolution of fleet engagements.
 * Called every standard game tick (e.g. 5 real seconds / 15 sim seconds).
 */
export function processSectorCombats(world: GameWorldState) {
    // Tactical-battle locks: prune expired ones UNCONDITIONALLY (a lock in a
    // system that has since emptied of fleets would otherwise linger forever
    // and remain a stale credential for MIL_TACTICAL_RESULT).
    if (world.tacticalLocks) {
        for (const [sysId, lock] of Object.entries(world.tacticalLocks)) {
            if (lock.until <= world.nowSeconds) delete world.tacticalLocks[sysId];
        }
    }

    const systemsWithFleets = new Map<string, Fleet[]>();

    // 1. Group fleets by system. A fleet that has been ordered out
    // (destinationSystemId set) is leaving, not holding: it stops fighting the
    // cycle it disengages rather than eating one more round on the way out.
    for (const fleet of world.movement.fleets.values()) {
        if (!fleet.currentSystemId) continue; // In transit
        if (fleet.destinationSystemId) continue; // Departing
        const list = systemsWithFleets.get(fleet.currentSystemId) || [];
        list.push(fleet);
        systemsWithFleets.set(fleet.currentSystemId, list);
    }

    // 2. Identify potential conflicts
    for (const [systemId, fleets] of systemsWithFleets) {
        const lock = world.tacticalLocks?.[systemId];

        const factionsInSystem = Array.from(new Set(fleets.map(f => f.factionId)));
        if (factionsInSystem.length < 2) continue;

        // Check every pair of factions for hostility
        for (let i = 0; i < factionsInSystem.length; i++) {
            for (let j = i + 1; j < factionsInSystem.length; j++) {
                const fA = factionsInSystem[i];
                const fB = factionsInSystem[j];

                // While a live player-driven tactical battle owns THIS PAIR
                // (MIL_TACTICAL_ENGAGE), the auto-resolver must neither create
                // nor advance their engagement — the client sim is
                // authoritative until MIL_TACTICAL_RESULT lands. Other wars in
                // the same system keep resolving normally.
                if (lock &&
                    ((lock.factionId === fA && lock.enemyFactionId === fB) ||
                     (lock.factionId === fB && lock.enemyFactionId === fA))) {
                    continue;
                }

                if (areAtWar(fA, fB, world)) {
                    handleEngagement(systemId, fA, fB, fleets, world);
                }
            }
        }
    }

    sweepStaleCombats(world, systemsWithFleets);
}

function areAtWar(fA: string, fB: string, world: GameWorldState): boolean {
    const rivalryId = `rivalry-${fA}-${fB}`;
    const reverseRivalryId = `rivalry-${fB}-${fA}`;
    const rivalry = world.rivalries.get(rivalryId) || world.rivalries.get(reverseRivalryId);

    // Direct War is escalation level 7
    return (rivalry?.escalationLevel || 0) >= 7;
}

/**
 * Battles whose two sides are no longer both in the system: one withdrew
 * (retreat order, rout, or simply moved on) or was wiped between passes. The
 * old code only touched a CombatState from inside handleEngagement, which is
 * only reached while BOTH factions still have fleets there, so such a state
 * sat in activeCombats forever. A finished battle stays one more pass for the
 * UI, then goes.
 */
function sweepStaleCombats(world: GameWorldState, systemsWithFleets: Map<string, Fleet[]>) {
    for (const [id, state] of world.activeCombats) {
        if (state.resolved) {
            if ((state.outcome?.endedAtSeconds ?? -Infinity) < world.nowSeconds) world.activeCombats.delete(id);
            continue;
        }
        const here = systemsWithFleets.get(state.target.systemId) ?? [];
        const attackerFleets = here.filter(f => f.factionId === state.attacker.factionId);
        const defenderFleets = here.filter(f => f.factionId === state.defender.factionId);
        if (attackerFleets.length && defenderFleets.length) continue;

        const winnerId = attackerFleets.length ? state.attacker.factionId
            : defenderFleets.length ? state.defender.factionId
            : null;
        // Finished in place; the resolved branch above drops it next pass, so
        // the UI (and tests) see the outcome once.
        finishBattle(world, state, 'withdrawal', winnerId, attackerFleets, defenderFleets);
    }
}

function handleEngagement(
    systemId: string,
    factionA: string,
    factionB: string,
    allFleetsInSystem: Fleet[],
    world: GameWorldState
) {
    const combatId = `combat-${systemId}-${factionA}-${factionB}`;
    let state = world.activeCombats.get(combatId);

    const fleetsA = allFleetsInSystem.filter(f => f.factionId === factionA);
    const fleetsB = allFleetsInSystem.filter(f => f.factionId === factionB);

    if (!state) {
        // Roles: whoever arrived last is attacking; the side that was already
        // there (or owns the system) defends and gets the defender's terrain,
        // stance default and the tie on orbital control. Faction A used to be
        // the attacker purely by iteration order.
        const owner = world.movement.systems.get(systemId)?.ownerFactionId ?? null;
        const roles = pickRoles(fleetsA, fleetsB, owner);
        const attackerId = roles.swapped ? factionB : factionA;
        const defenderId = roles.swapped ? factionA : factionB;

        // The defender's armed planets in the system fight with it. Planets
        // and stations used to sit out fleet battles entirely; only the
        // blockade math read orbital_defense_power.
        const fortification = fortificationFor(world, defenderId, systemId);

        const attacker = createCombatant(attackerId, roles.attackerFleets, 'attacker', world);
        const defender = createCombatant(defenderId, roles.defenderFleets, 'defender', world, fortification);

        // Fear Aura — the only genuine pre-contact moment on the server path.
        // Both combatants are fully built, the raw fleet arrays are still in
        // scope, and the first round has not been resolved.
        if (applyFearAura(world, combatId,
            attackerId, attacker.hp, roles.attackerFleets,
            defenderId, defender.hp, roles.defenderFleets)) {
            return; // somebody broke and ran — no engagement this cycle
        }

        state = initiateCombat(
            combatId,
            {
                systemId,
                terrainModifier: 1.0,
                infrastructureIntegrity: 1.0
            },
            attacker,
            defender
        );

        // Ambush from the asteroid belt: the tick stamped the victim when a
        // belt-lurker sprang on it. The lurker opens with full momentum and
        // the victim with shaken organization — one bad opening round, not a
        // scripted win. The stamp is consumed here so a re-engagement is fair.
        const ambushOf = (victims: Fleet[], byFaction: string) => victims.find(f =>
            f.ambushedBy?.factionId === byFaction &&
            f.ambushedBy?.systemId === systemId &&
            world.nowSeconds - f.ambushedBy.atSeconds <= AMBUSH_FRESH_SECONDS);
        if (ambushOf(roles.defenderFleets, attackerId)) {
            state.momentum = 1;
            state.defender.organization *= AMBUSH_ORGANIZATION_FACTOR;
            for (const f of roles.defenderFleets) f.ambushedBy = null;
            console.log(`[CombatManager] ${attackerId} ambushed ${defenderId} from the belt at ${systemId}`);
        } else if (ambushOf(roles.attackerFleets, defenderId)) {
            state.momentum = -1;
            state.attacker.organization *= AMBUSH_ORGANIZATION_FACTOR;
            for (const f of roles.attackerFleets) f.ambushedBy = null;
            console.log(`[CombatManager] ${defenderId} ambushed ${attackerId} from the belt at ${systemId}`);
        }

        world.activeCombats.set(combatId, state);
        console.log(`[CombatManager] Initiated engagement at ${systemId}: ${attackerId} attacks ${defenderId}`
            + (fortification ? ` (orbital defenses: ${Math.round(fortification.defensePower)} power over ${fortification.planetIds.length} world(s))` : ''));
    }

    // Live fleets per role. Roles are fixed for the life of the battle.
    const fleetsAtk = state.attacker.factionId === factionA ? fleetsA : fleetsB;
    const fleetsDef = fleetsAtk === fleetsA ? fleetsB : fleetsA;

    if (state.resolved) {
        // Finished last pass; kept one pass for the UI. Drop it so a fresh
        // engagement can start if the two are still here and still at war.
        world.activeCombats.delete(combatId);
        return;
    }

    // createCombatant runs only once, when the engagement is created, so a
    // snapshot taken then would keep paying out a serum that has since worn
    // off — and would never let a withdrawal bite mid-battle. Brutality only
    // ever rises, so it can stay snapshotted; the serum cannot.
    // The capacola surge is refreshed here for exactly the same reason as the
    // serum: it expires, and a snapshot taken at engagement creation would
    // keep paying out a surge that has worn off and would never let the crash
    // bite mid-battle.
    // Phase-shields are recomputed per round for the same reason: they GROW
    // with elapsedRounds, so a value snapshotted at engagement creation would
    // freeze at zero and the mechanic would never fire at all.
    const elapsed = state.elapsedRounds ?? 0;
    state.attacker.traitBonuses = {
        ...state.attacker.traitBonuses,
        serum: getSerumBonus(world, state.attacker.factionId),
        capacola: getSurgeBonus(world, state.attacker.factionId),
        phaseShield: phaseShieldBonus(world, state.attacker.factionId, elapsed, false),
    };
    state.defender.traitBonuses = {
        ...state.defender.traitBonuses,
        serum: getSerumBonus(world, state.defender.factionId),
        capacola: getSurgeBonus(world, state.defender.factionId),
        phaseShield: phaseShieldBonus(world, state.defender.factionId, elapsed, true),
    };

    // Ships as they stand now: losses so far, reinforcements that arrived.
    // Damage lands on fleet `strength`, never on `composition`, so without
    // this a side at 10% still fought with its full roster in the counter
    // grid and the attack table. Orbital defenses likewise: a structure shot
    // to pieces stops shooting back.
    refreshCombatant(state.attacker, fleetsAtk);
    refreshCombatant(state.defender, fleetsDef);
    refreshFortification(world, state.defender);

    try {
        const report = resolveEngagementRound(state, {
            roundNumber: state.round,
            attackerStance: state.attacker.selectedStance || 'shock',
            defenderStance: state.defender.selectedStance || 'entrench',
            attackerPredictedStance: state.attacker.selectedPrediction,
            defenderPredictedStance: state.defender.selectedPrediction
        });

        console.log(`[CombatManager] Round ${state.round} resolved at ${systemId}. Dmg A: ${report.attackerDamageDealt.toFixed(1)}, Dmg B: ${report.defenderDamageDealt.toFixed(1)}`);

        // Sync damage back to fleets. The defender's volley is split between
        // its fleets and its orbital defenses by remaining mass.
        applyDamageToFleets(fleetsAtk, report.defenderDamageDealt);
        applyDamageToSide(world, state, state.defender, fleetsDef, report.attackerDamageDealt);

        // Annihilation: the engine's own rule (three prediction points, a
        // 1.25 hp ratio, enemy morale under 0.3, a 15% roll) has existed
        // since the engine was written and was called by nothing.
        const { annihilatedFactionId } = checkAnnihilation(state);
        if (annihilatedFactionId) {
            const doomed = annihilatedFactionId === state.attacker.factionId ? fleetsAtk : fleetsDef;
            for (const f of doomed) f.strength = 0;
            console.log(`[CombatManager] ${annihilatedFactionId} annihilated at ${systemId}.`);
        }

        // Remove destroyed fleets (strength 0), crediting the killer. Loops
        // until quiet because an Infernoid detonation can take another fleet
        // to zero in the same pass. Otherwise a wiped fleet lingered in-system
        // with a hostile faction and a fresh no-op combat was re-initiated
        // against it every tick ("zombie" engagements).
        let again = true;
        while (again) {
            again = false;
            for (const fleet of [...fleetsAtk, ...fleetsDef]) {
                if (fleet.strength > 0 || !world.movement.fleets.has(fleet.id)) continue;
                const onAttack = fleet.factionId === state.attacker.factionId;
                destroyFleet(world, state, fleet, onAttack ? state.defender.factionId : state.attacker.factionId, onAttack ? fleetsDef : fleetsAtk);
                again = true;
            }
        }

        // Rout: fleets past their doctrine's retreatThreshold, or a whole side
        // that fought this round under `withdraw`, break off and run for home.
        const withdrawn = new Set<string>();
        routSide(world, state, fleetsAtk, state.attacker, state.defender, fleetsDef, withdrawn);
        routSide(world, state, fleetsDef, state.defender, state.attacker, fleetsAtk, withdrawn);

        const standing = (fleets: Fleet[]) =>
            fleets.some(f => world.movement.fleets.has(f.id) && f.strength > 0 && !withdrawn.has(f.id));
        const attackerStands = standing(fleetsAtk);
        const defenderStands = standing(fleetsDef);

        if (annihilatedFactionId) {
            const winnerId = annihilatedFactionId === state.attacker.factionId
                ? state.defender.factionId : state.attacker.factionId;
            finishBattle(world, state, 'annihilation', winnerId, fleetsAtk, fleetsDef);
        } else if (!attackerStands || !defenderStands) {
            const winnerId = attackerStands ? state.attacker.factionId
                : defenderStands ? state.defender.factionId
                : null;
            finishBattle(world, state, withdrawn.size ? 'rout' : 'destroyed', winnerId, fleetsAtk, fleetsDef);
        } else {
            advanceRound(state);
            if (state.resolved) {
                // Fought to the end of the last round: whoever kept the larger
                // share of their force carries the field.
                const aFrac = state.attacker.hp / Math.max(1, state.attacker.maxHp);
                const dFrac = state.defender.hp / Math.max(1, state.defender.maxHp);
                const winnerId = aFrac > dFrac ? state.attacker.factionId
                    : dFrac > aFrac ? state.defender.factionId
                    : null;
                finishBattle(world, state, 'rounds', winnerId, fleetsAtk, fleetsDef);
            }
        }
    } catch (e: any) {
        console.error(`[CombatManager] Resolution failed:`, e.message);
    }
}

// ─── Orbital defenses ────────────────────────────────────────────────────────

/** The faction's armed planets in the system, summed. Undefined when it holds none. */
function fortificationFor(world: GameWorldState, factionId: string, systemId: string): Fortification | undefined {
    let defensePower = 0;
    let shieldStrength = 0;
    const planetIds: string[] = [];
    for (const planet of world.construction?.planets?.values() ?? []) {
        const p = planet as any;
        if (p.ownerId !== factionId || p.systemId !== systemId || !p.orbital) continue;
        const ratings = computeOrbitalRatings(p, world.nowSeconds);
        if (ratings.defensePower <= 0) continue;
        defensePower += ratings.defensePower;
        shieldStrength += ratings.shieldStrength;
        planetIds.push(p.id);
    }
    return planetIds.length ? { defensePower, shieldStrength, planetIds } : undefined;
}

/** Re-read the defenses' remaining power each round; wrecked structures stop shooting. */
function refreshFortification(world: GameWorldState, side: CombatantState) {
    if (!side.fortification) return;
    let defensePower = 0;
    let shieldStrength = 0;
    for (const id of side.fortification.planetIds) {
        const planet = world.construction?.planets?.get(id) as any;
        if (!planet) continue;
        const ratings = computeOrbitalRatings(planet, world.nowSeconds);
        defensePower += ratings.defensePower;
        shieldStrength += ratings.shieldStrength;
    }
    side.fortification = { ...side.fortification, defensePower, shieldStrength };
}

/**
 * A side's incoming volley: fleets and orbital defenses share it by remaining
 * mass. Structure damage goes through applyOrbitalDamage, the same path
 * bombardment uses, so shields soak, integrity drops and a slot can be
 * destroyed outright.
 */
function applyDamageToSide(world: GameWorldState, state: CombatState, side: CombatantState, fleets: Fleet[], damage: number) {
    const fort = side.fortification;
    if (!fort || fort.defensePower <= 0 || damage <= 0) {
        applyDamageToFleets(fleets, damage);
        return;
    }
    const fleetHp = fleets.reduce((sum, f) => sum + (f.basePower || 0) * Math.max(0, f.strength) * 10, 0);
    const fortHp = fort.defensePower * config.constants.fortificationHpPerPower;
    const split = splitDamage(damage, fleetHp, fortHp);
    applyDamageToFleets(fleets, split.fleets);
    if (split.fort <= 0) return;

    const planets = fort.planetIds
        .map(id => world.construction?.planets?.get(id) as any)
        .filter(Boolean);
    const weights = planets.map(p => computeOrbitalRatings(p, world.nowSeconds).defensePower);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) return;
    planets.forEach((planet, i) => {
        const share = split.fort * (weights[i] / totalWeight);
        if (share <= 0) return;
        const result = applyOrbitalDamage(planet, share, world.nowSeconds);
        if (result.destroyedSlotIds.length) {
            const tally = ensureTally(state, side.factionId);
            tally.structuresLost += result.destroyedSlotIds.length;
            console.log(`[CombatManager] ${result.destroyedSlotIds.length} orbital structure(s) over ${planet.name ?? planet.id} destroyed in the exchange.`);
        }
    });
}

function ensureTally(state: CombatState, factionId: string) {
    if (!state.tally) state.tally = {};
    if (!state.tally[factionId]) state.tally[factionId] = { fleetsLost: 0, powerLost: 0, structuresLost: 0 };
    return state.tally[factionId];
}

/**
 * Delete a fleet that has reached zero strength and credit the kill. The
 * single site where a kill is unambiguously attributed — the Reaper's Toll
 * crown, the saga ledgers, Kaer'Ruun trophies and the Infernoid detonation
 * all hang off it. Coarse by nature: a WHOLE fleet reaching zero. Air sorties
 * bypass this path entirely.
 */
function destroyFleet(world: GameWorldState, state: CombatState, fleet: Fleet, killer: string, enemyFleets: Fleet[]) {
    if (!world.movement.fleets.has(fleet.id)) return;
    notifyTitleMetric(COUNTER_FLEET_POWER_DESTROYED, killer, fleet.basePower || 0);
    bumpMetric(world, killer, DEED_FLEETS_DESTROYED);
    bumpMetric(world, fleet.factionId, DEED_FLEETS_LOST);
    // Ritual Brutality: the Kaer'Ruun keep a trophy for every kill, and it
    // makes them permanently deadlier.
    recordTrophyKill(world, killer);

    const tally = ensureTally(state, fleet.factionId);
    tally.fleetsLost += 1;
    tally.powerLost += fleet.basePower || 0;

    // Fireblood: an Infernoid hull that dies takes its killer with it.
    if (isInfernoid(world, fleet.factionId)) {
        const blast = (fleet.basePower || 0) * FIREBLOOD_FLEET_COEFF;
        if (blast > 0) {
            applyDamageToFleets(enemyFleets, blast);
            recordDetonation(world, fleet.factionId);
            console.log(`[Infernoid] ${fleet.id} detonates — ${blast.toFixed(0)} damage answered in fire.`);
        }
    }

    world.movement.fleets.delete(fleet.id);
}

/**
 * Break off every fleet on `side` that is past its doctrine's retreatThreshold
 * (or the whole side, if it fought this round under `withdraw`). A breaking
 * fleet runs for where it came from, else the nearest owned system; with
 * nowhere to go it stays and fights. If the enemy chose the `pursue`
 * directive, each fleet that gets away loses PURSUIT_STRENGTH_LOSS more on
 * the way out — and one that cannot take it dies to the pursuers.
 */
function routSide(
    world: GameWorldState,
    state: CombatState,
    fleets: Fleet[],
    side: CombatantState,
    enemy: CombatantState,
    enemyFleets: Fleet[],
    withdrawn: Set<string>,
) {
    const alive = fleets.filter(f => world.movement.fleets.has(f.id));
    const breaking = breakingFleets(alive, side.currentStance);
    if (!breaking.length) return;

    const pursued = (enemy.selectedDirective ?? enemy.currentDirective) === 'pursue';
    let moved = 0;
    for (const fleet of breaking) {
        if (pursued) {
            fleet.strength = Math.max(0, fleet.strength - PURSUIT_STRENGTH_LOSS);
            if (fleet.strength <= 0) {
                destroyFleet(world, state, fleet, enemy.factionId, enemyFleets);
                continue;
            }
        }
        if (withdrawFleetHome(world, fleet)) {
            withdrawn.add(fleet.id);
            moved += 1;
        }
    }
    if (moved) {
        console.log(`[CombatManager] ${side.factionId} broke off at ${state.target.systemId}: ${moved} fleet(s) withdrawing${pursued ? ' under pursuit' : ''}.`);
    }
}

/**
 * Send a fleet home from a fight: where it set out from, else the nearest
 * system its faction holds, else the capital. Returns false when there is
 * nowhere to go (it has to fight). Shared by the rout, the Kaer'Ruun Fear
 * Aura and the MIL_COMBAT_RETREAT order.
 */
export function withdrawFleetHome(world: GameWorldState, fleet: Fleet): boolean {
    const target = fleet.originSystemId
        || nearestOwnedSystem(world, fleet.factionId, fleet.currentSystemId)
        || (world.economy?.factions?.get?.(fleet.factionId) as any)?.capitalSystemId
        || null;
    if (!target || target === fleet.currentSystemId) return false;
    try {
        const updated = issueMoveOrder(fleet, target, 'hyperlane', world.movement);
        // Keeps the Fear Aura from re-rolling a fleet that is already leaving.
        (updated as any).routedUntilSeconds = world.nowSeconds + FEAR_ROUT_GRACE_SECONDS;
        world.movement.fleets.set(updated.id, updated);
        return true;
    } catch (e) {
        // Pathing needs a full fleet record (hyperdriveProfile and the rest).
        // A malformed one must not take down combat resolution for everybody
        // else in the system — it just fights instead.
        console.error(`[CombatManager] Could not withdraw ${fleet.id}:`, e);
        return false;
    }
}

/**
 * Close the books on a battle. Runs the post-battle directives — the engine
 * had them since day one, nothing ever called them — and carries what they
 * change (supply, morale) back onto the fleets, because the combatant state
 * dies with the battle. Then files the report: a chronicle event for the
 * press and a notification to each side. Idempotent: a battle is finished
 * once.
 */
function finishBattle(
    world: GameWorldState,
    state: CombatState,
    reason: BattleEnd,
    winnerId: string | null,
    attackerFleets: Fleet[],
    defenderFleets: Fleet[],
) {
    if (state.outcome) return;
    const before = {
        attacker: { supply: state.attacker.supply, morale: state.attacker.morale },
        defender: { supply: state.defender.supply, morale: state.defender.morale },
    };
    applyPostBattleDirective(state);
    carryDirectiveToFleets(world, state.attacker, before.attacker, attackerFleets);
    carryDirectiveToFleets(world, state.defender, before.defender, defenderFleets);

    state.resolved = true;
    state.outcome = { winnerId, reason, endedAtSeconds: world.nowSeconds };
    console.log(`[CombatManager] Battle at ${state.target.systemId} over (${reason}): ${winnerId ? `${winnerId} holds the field` : 'no clear winner'}.`);

    // Every fleet that fought and is still afloat learned something; the side
    // that held the field learned more. Withdrawn fleets were re-issued by
    // issueMoveOrder, so write to the live record.
    if ((state.elapsedRounds ?? 0) > 0 || reason !== 'withdrawal') {
        for (const [fleets, factionId] of [[attackerFleets, state.attacker.factionId], [defenderFleets, state.defender.factionId]] as const) {
            for (const stale of fleets) {
                const fleet = world.movement.fleets.get(stale.id);
                if (!fleet || fleet.strength <= 0) continue;
                fleet.experience = gainExperience(fleet.experience, winnerId === factionId);
            }
        }
        // The admirals learned too — far more than the 50 XP a quiet tick pays.
        for (const side of [state.attacker, state.defender]) {
            if (!side.admiralId || !(world.leadership?.leaders instanceof Map) || !world.leadership.leaders.has(side.admiralId)) continue;
            try {
                LeadershipService.grantXP(world, side.admiralId, admiralBattleXp(winnerId === side.factionId));
            } catch (e: any) {
                console.error(`[CombatManager] Admiral XP failed:`, e?.message ?? e);
            }
        }
    }

    try {
        reportBattle(world, state, reason, winnerId);
    } catch (e: any) {
        // The report is for the press and the player; it must never undo the battle.
        console.error(`[CombatManager] Battle report failed:`, e?.message ?? e);
    }
}

/**
 * The battle report. Space battles used to leave nothing but console lines:
 * no notification, no chronicle event, so a player could lose a fleet and
 * never hear of it and the narrator never saw a war at sea. One
 * `battle_resolved` event per battle (theatre 'space' tells the prose apart
 * from a ground siege) and one notification per side.
 */
function reportBattle(world: GameWorldState, state: CombatState, reason: BattleEnd, winnerId: string | null) {
    const systemId = state.target.systemId;
    const systemName = world.movement.systems.get(systemId)?.name ?? systemId;
    const nameOf = (id: string) => (world.economy?.factions?.get?.(id) as any)?.name ?? id;
    const attackerId = state.attacker.factionId;
    const defenderId = state.defender.factionId;
    const lossesOf = (id: string) => state.tally?.[id] ?? { fleetsLost: 0, powerLost: 0, structuresLost: 0 };
    const attackerLosses = lossesOf(attackerId);
    const defenderLosses = lossesOf(defenderId);
    const decisive = reason === 'destroyed' || reason === 'annihilation';
    const anyLoss = attackerLosses.fleetsLost + defenderLosses.fleetsLost + defenderLosses.structuresLost > 0;

    chronicle.record(world, {
        type: 'battle_resolved',
        actorIds: [attackerId],
        targetIds: [defenderId],
        location: systemId,
        facts: {
            theatre: 'space',
            reason,
            winnerId: winnerId ?? '',
            winnerName: winnerId ? nameOf(winnerId) : '',
            rounds: state.elapsedRounds ?? 0,
            attackerFleetsLost: attackerLosses.fleetsLost,
            defenderFleetsLost: defenderLosses.fleetsLost,
            attackerPowerLost: Math.round(attackerLosses.powerLost),
            defenderPowerLost: Math.round(defenderLosses.powerLost),
            structuresLost: defenderLosses.structuresLost,
            decisive,
        },
        coalesceKey: `battle:${state.id}`,
        // A standoff nobody bled for is not front-page news.
        importanceOverride: anyLoss ? undefined : 20,
    });

    const reasonText: Record<BattleEnd, string> = {
        rounds: 'The engagement ran its course',
        rout: 'The beaten side broke off and withdrew',
        destroyed: 'One side was destroyed to the last hull',
        annihilation: 'One side was annihilated',
        withdrawal: 'One side left the system',
    };
    const stamp = new Date(world.nowSeconds * 1000).toISOString();
    for (const [me, them, mine, theirs] of [
        [attackerId, defenderId, attackerLosses, defenderLosses],
        [defenderId, attackerId, defenderLosses, attackerLosses],
    ] as const) {
        const word = winnerId === me ? 'VICTORY' : winnerId ? 'DEFEAT' : 'STANDOFF';
        const structures = mine.structuresLost ? ` ${mine.structuresLost} orbital structure(s) destroyed.` : '';
        fireNotification({
            id: `battle-${state.id}-${me}-${world.nowSeconds}`,
            factionId: me,
            category: 'military',
            priority: word === 'DEFEAT' ? 'urgent' : 'normal',
            title: `${word} AT ${String(systemName).toUpperCase()}`,
            body: `${reasonText[reason]} against ${nameOf(them)} at ${systemName}. Lost ${mine.fleetsLost} fleet(s); the enemy lost ${theirs.fleetsLost}.${structures}`,
            createdAt: stamp,
            read: false,
            linkToTab: 'map',
            payload: { systemId, combatId: state.id, reason, winnerId },
        } as any);
    }
}

/** Trait modifiers of the admiral assigned to this fleet; never lets the leadership module break a battle. */
function safeLeaderModifiers(world: any, factionId: string, assignmentId: string | undefined, role: 'attacker' | 'defender'): Record<string, number> {
    if (!assignmentId || !(world?.leadership?.leaders instanceof Map)) return {};
    try {
        const raw = LeadershipService.getLeaderModifiers(world, factionId, 'Admiral', assignmentId) ?? {};
        // Leader traits speak their own vocabulary (data/leader-traits.json):
        // offensiveDamage counts when attacking, defensiveStrength when
        // defending, both onto the engine's combat_power_multiplier. Any key
        // the engine already knows passes straight through.
        const out: Record<string, number> = {};
        const trait = role === 'attacker' ? raw['offensiveDamage'] : raw['defensiveStrength'];
        if (typeof trait === 'number' && trait !== 0) out['combat_power_multiplier'] = trait;
        for (const [key, value] of Object.entries(raw)) {
            if (key === 'offensiveDamage' || key === 'defensiveStrength') continue;
            if (/_multiplier$|_add$/.test(key) && typeof value === 'number') out[key] = (out[key] ?? 0) + value;
        }
        return out;
    } catch {
        return {};
    }
}

/** Supply and morale deltas from a directive land on every surviving fleet's doctrine. */
function carryDirectiveToFleets(
    world: GameWorldState,
    side: CombatantState,
    before: { supply: number; morale: number },
    fleets: Fleet[],
) {
    const dSupply = side.supply - before.supply;
    const dMorale = side.morale - before.morale;
    if (!dSupply && !dMorale) return;
    for (const stale of fleets) {
        // A withdrawn fleet was re-issued by issueMoveOrder; write to the live record.
        const fleet = world.movement.fleets.get(stale.id);
        if (!fleet?.doctrine) continue;
        if (dSupply) fleet.doctrine.supplyLevel = Math.max(0, Math.min(1, (fleet.doctrine.supplyLevel ?? 1) + dSupply));
        // Combatant morale is (moraleDrift + 100) / 200, so a morale delta is 200 drift.
        if (dMorale) fleet.doctrine.moraleDrift = Math.max(-100, Math.min(100, (fleet.doctrine.moraleDrift ?? 0) + dMorale * 200));
    }
}

/**
 * Kaer'Ruun Fear Aura: give the weaker side one chance to break and run before
 * a shot is fired. Returns true when somebody fled, meaning no engagement should
 * be created this cycle.
 *
 * THE TRAP THIS AVOIDS: merely declining to create the CombatState is a no-op —
 * the fleets are still co-located, so the next fast cycle re-rolls, ~288 times
 * per strategic tick, until a roll finally fails. The rout has to physically
 * move the fleet, and `routedUntilSeconds` keeps it from being re-rolled while
 * it is actually leaving.
 */
function applyFearAura(
    world: GameWorldState,
    combatId: string,
    factionA: string, powerA: number, fleetsA: Fleet[],
    factionB: string, powerB: number, fleetsB: Fleet[],
): boolean {
    const rng = new RNG(seedFromString(`kaerruun|rout|${combatId}|${Math.floor(world.nowSeconds / 3600)}`));

    const tryRout = (
        predator: string, predatorPower: number,
        prey: string, preyPower: number, preyFleets: Fleet[],
    ): boolean => {
        // Already running — leave it alone until it has had time to get clear.
        if (preyFleets.some(f => ((f as any).routedUntilSeconds ?? 0) > world.nowSeconds)) return true;
        if (!shouldRoutFromFear(world, predator, predatorPower, prey, preyPower, combatId, rng)) return false;

        let moved = 0;
        for (const fleet of preyFleets) {
            if (withdrawFleetHome(world, fleet)) moved += 1;
        }
        if (!moved) return false;   // nowhere to run — it has to fight after all

        console.log(`[CombatManager] Fear Aura: ${prey} broke before ${predator} and withdrew ${moved} fleet(s).`);
        return true;
    };

    return tryRout(factionA, powerA, factionB, powerB, fleetsB)
        || tryRout(factionB, powerB, factionA, powerA, fleetsA);
}

/** Closest system this faction holds a planet in, by lane hops. */
function nearestOwnedSystem(world: GameWorldState, factionId: string, fromSystemId: string | null): string | null {
    if (!fromSystemId) return null;
    const owned = new Set<string>();
    for (const planet of world.construction?.planets?.values() ?? []) {
        if ((planet as any).ownerId === factionId && (planet as any).systemId) owned.add((planet as any).systemId);
    }
    if (!owned.size) return null;

    const seen = new Set([fromSystemId]);
    let frontier = [fromSystemId];
    for (let depth = 0; depth < 24 && frontier.length; depth++) {
        const next: string[] = [];
        for (const id of frontier) {
            for (const neighbor of world.movement.systems.get(id)?.hyperlaneNeighbors ?? []) {
                if (seen.has(neighbor)) continue;
                if (owned.has(neighbor)) return neighbor;
                seen.add(neighbor);
                next.push(neighbor);
            }
        }
        frontier = next;
    }
    return null;
}

function createCombatant(
    factionId: string,
    fleets: Fleet[],
    role: 'attacker' | 'defender',
    world?: any,
    fortification?: Fortification,
): CombatantState {
    // Veteran crews fight above their tonnage (lib/combat/veterancy.ts).
    const totalPower = fleets.reduce((sum, f) => sum + (f.basePower * f.strength * experienceMultiplier(f.experience)), 0);

    // Roster, design signature and screening as the ships stand right now
    // (scaled by each fleet's strength). Keys are lowercase so the engine's
    // counter grid sees one vocabulary whatever a fleet was built with.
    const force = snapshotForce(fleets);

    // The commanding admiral (senior active Admiral on any fleet here). Fleets
    // carried leaderId and leaders carried levels and traits; combat read
    // neither.
    const admiral = commandingAdmiral(fleets, world?.leadership?.leaders instanceof Map ? world.leadership.leaders : null);

    // Orbital defenses add their mass to the pool the engine tracks; a
    // Defense Network (160 power) weighs as much as a 160-power fleet.
    const fortHp = (fortification?.defensePower ?? 0) * config.constants.fortificationHpPerPower;
    const hp = totalPower * 10 + fortHp;
    const org = 50 + ((fleets[0]?.doctrine?.moraleDrift ?? 0) / 2); // 0-100 scale

    return {
        factionId,
        role,
        hp: hp,
        maxHp: hp,
        baseForceCount: totalPower * 100,
        casualties: 0,
        organization: org,
        maxOrganization: org,
        screeningEfficiency: force.screeningEfficiency,
        composition: force.composition,
        designProfile: force.designProfile,
        fortification,
        admiralId: admiral?.id,
        intelLevel: 'observing',
        supply: fleets[0]?.doctrine?.supplyLevel ?? 1.0,
        // NOTE: `+` binds tighter than `??`, so `moraleDrift ?? 0 + 100` parsed as
        // `moraleDrift ?? 100`, giving morale=0 for a default fleet (a permanent 50%
        // power penalty). Parenthesise the `?? 0` and clamp the result to [0,1].
        morale: Math.max(0, Math.min(1, ((fleets[0]?.doctrine?.moraleDrift ?? 0) + 100) / 200)),
        doctrine: 'aggressive',
        // An admiral reads the enemy: one point in hand (three arm annihilation).
        predictionPoints: admiral ? ADMIRAL_PREDICTION_POINTS : 0,
        selectedStance: 'shock',
        // combat-engine has read techModifiers since it was written, but nothing
        // ever populated the field — every tech combat bonus in the trees was
        // inert. The faction's accumulated modifiers are passed straight through
        // so authors use the engine's own key names. prediction_bonus_multiplier
        // is the exception: the engine treats it as an absolute with a 0.15
        // default, so techs contribute to it via prediction_bonus_add instead of
        // overwriting it with a smaller number.
        techModifiers: (() => {
            const mods: Record<string, number> = { ...getTechModifiers(world, factionId) };
            if (admiral) {
                // Raw power by level, plus whatever the leader's traits add.
                mods['combat_power_multiplier'] = (mods['combat_power_multiplier'] ?? 0) + admiralPowerBonus(admiral);
                const flagship = fleets.find(f => f.leaderId === admiral.id);
                for (const [key, value] of Object.entries(safeLeaderModifiers(world, factionId, flagship?.id, role))) {
                    mods[key] = (mods[key] ?? 0) + value;
                }
            }
            return {
                ...mods,
                // Nexulan Pre-Cognitive Algorithms compose here rather than
                // overwriting, for the reason above: the engine treats
                // prediction_bonus_multiplier as an ABSOLUTE with a 0.15 default,
                // so a civilization contributing its own multiplicative term
                // would silently discard whatever tech had already earned.
                prediction_bonus_multiplier: BASE_PREDICTION_BONUS
                    + (mods['prediction_bonus_add'] ?? 0)
                    + precognitionBonus(world, factionId),
            };
        })(),
        // Civilization traits travel separately from techModifiers because the
        // engine applies them after its ±40% clamp — see traitMultiplier.
        traitBonuses: {
            brutality: getBrutalityBonus(world, factionId),
            serum: getSerumBonus(world, factionId),
            capacola: getSurgeBonus(world, factionId),
            // phaseShield is deliberately NOT seeded here: it depends on
            // elapsedRounds and on which side this combatant ends up being,
            // neither of which exists yet at creation. It is set per round in
            // resolveCombatTick, where both are known.
        },
    };
}

function applyDamageToFleets(fleets: Fleet[], damage: number) {
    if (fleets.length === 0) return;

    // Distribute damage proportionally to fleet strength
    const totalPower = fleets.reduce((sum, f) => sum + (f.basePower * f.strength), 0);
    if (totalPower <= 0) return;

    for (const fleet of fleets) {
        const share = (fleet.basePower * fleet.strength) / totalPower;
        const fleetDmg = damage * share;

        // Convert damage back to strength loss
        // strength_loss = fleetDmg / basePower
        const strengthLoss = fleetDmg / (fleet.basePower || 1);
        fleet.strength = Math.max(0, fleet.strength - strengthLoss);
    }
}
