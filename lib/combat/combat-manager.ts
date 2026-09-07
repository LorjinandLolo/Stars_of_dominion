// lib/combat/combat-manager.ts
import { GameWorldState } from '../game-world-state';
import { Fleet } from '../movement/types';
import { notifyTitleMetric, COUNTER_FLEET_POWER_DESTROYED } from '../titles/metrics';
import { 
    CombatantState, 
    CombatState, 
    UnitComposition, 
    IntelLevel, 
    EngagementArchetype,
    CombatStance
} from './combat-types';
import {
    initiateCombat,
    resolveEngagementRound,
    advanceRound
} from './combat-engine';
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

/** Engine default for a correct stance prediction (combat-engine.ts:259). */
const BASE_PREDICTION_BONUS = 0.15;

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

    // 1. Group fleets by system
    for (const fleet of world.movement.fleets.values()) {
        if (!fleet.currentSystemId) continue; // In transit
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
}

function areAtWar(fA: string, fB: string, world: GameWorldState): boolean {
    const rivalryId = `rivalry-${fA}-${fB}`;
    const reverseRivalryId = `rivalry-${fB}-${fA}`;
    const rivalry = world.rivalries.get(rivalryId) || world.rivalries.get(reverseRivalryId);
    
    // Direct War is escalation level 7
    return (rivalry?.escalationLevel || 0) >= 7;
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
        // Initiate new combat
        const attacker = createCombatant(factionA, fleetsA, 'attacker', world);
        const defender = createCombatant(factionB, fleetsB, 'defender', world);

        // Fear Aura — the only genuine pre-contact moment on the server path.
        // Both combatants are fully built, the raw fleet arrays are still in
        // scope, and the first round has not been resolved.
        if (applyFearAura(world, combatId, factionA, attacker.hp, fleetsA, factionB, defender.hp, fleetsB)) {
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
        const aAmbushedByB = ambushOf(fleetsA, factionB);
        const bAmbushedByA = ambushOf(fleetsB, factionA);
        if (bAmbushedByA) {
            state.momentum = 1;
            state.defender.organization *= AMBUSH_ORGANIZATION_FACTOR;
            for (const f of fleetsB) f.ambushedBy = null;
            console.log(`[CombatManager] ${factionA} ambushed ${factionB} from the belt at ${systemId}`);
        } else if (aAmbushedByB) {
            state.momentum = -1;
            state.attacker.organization *= AMBUSH_ORGANIZATION_FACTOR;
            for (const f of fleetsA) f.ambushedBy = null;
            console.log(`[CombatManager] ${factionB} ambushed ${factionA} from the belt at ${systemId}`);
        }

        world.activeCombats.set(combatId, state);
        console.log(`[CombatManager] Initiated engagement at ${systemId} between ${factionA} and ${factionB}`);
    }

    // Advance round if not resolved
    if (!state.resolved) {
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
        try {
            const report = resolveEngagementRound(state, {
                roundNumber: state.round,
                attackerStance: state.attacker.selectedStance || 'shock', 
                defenderStance: state.defender.selectedStance || 'entrench',
                attackerPredictedStance: state.attacker.selectedPrediction,
                defenderPredictedStance: state.defender.selectedPrediction
            });

            console.log(`[CombatManager] Round ${state.round} resolved at ${systemId}. Dmg A: ${report.attackerDamageDealt.toFixed(1)}, Dmg B: ${report.defenderDamageDealt.toFixed(1)}`);

            // Sync damage back to fleets
            applyDamageToFleets(fleetsA, report.defenderDamageDealt);
            applyDamageToFleets(fleetsB, report.attackerDamageDealt);

            // Remove annihilated fleets (strength reduced to 0). Otherwise a wiped fleet
            // lingered in-system with a hostile faction and a fresh no-op combat was
            // re-initiated against it every tick ("zombie" engagements).
            for (const fleet of [...fleetsA, ...fleetsB]) {
                if (fleet.strength <= 0) {
                    // processSectorCombats hands every hostile pair in a system
                    // the SAME fleet array. A fleet annihilated by the first
                    // pair is deleted from the map but not from that array, so
                    // without this guard the next pair counted the corpse
                    // again — a second "fleet lost", a kill credited to a
                    // faction that never fired, a second trophy.
                    if (!world.movement.fleets.has(fleet.id)) continue;
                    // Credit the other side before the fleet is gone — the
                    // Reaper's Toll crown measures destroyed power per season.
                    const killer = fleet.factionId === factionA ? factionB : factionA;
                    notifyTitleMetric(COUNTER_FLEET_POWER_DESTROYED, killer, fleet.basePower || 0);
                    // The saga: one line on each ledger.
                    bumpMetric(world, killer, DEED_FLEETS_DESTROYED);
                    bumpMetric(world, fleet.factionId, DEED_FLEETS_LOST);
                    // Ritual Brutality: the Kaer'Ruun keep a trophy for every
                    // kill, and it makes them permanently deadlier. This is the
                    // only site where a kill is unambiguously attributed — note
                    // it is coarse (a whole fleet reaching zero), and air
                    // sorties bypass this path entirely.
                    recordTrophyKill(world, killer);

                    // Fireblood: an Infernoid hull that dies takes its killer
                    // with it. This is the only site where a kill is
                    // unambiguously attributed, so it is the only place the
                    // detonation can be aimed. Note the coarseness inherited
                    // from the trophy counter: only a WHOLE fleet reaching zero
                    // counts, and air sorties bypass this path entirely.
                    if (isInfernoid(world, fleet.factionId)) {
                        const blast = (fleet.basePower || 0) * FIREBLOOD_FLEET_COEFF;
                        if (blast > 0) {
                            applyDamageToFleets(fleet.factionId === factionA ? fleetsB : fleetsA, blast);
                            recordDetonation(world, fleet.factionId);
                            console.log(`[Infernoid] ${fleet.id} detonates — ${blast.toFixed(0)} damage answered in fire.`);
                        }
                    }

                    world.movement.fleets.delete(fleet.id);
                }
            }

            advanceRound(state);
        } catch (e: any) {
            console.error(`[CombatManager] Resolution failed:`, e.message);
        }
    } else {
        // Cleanup resolved combat after a delay or immediately
        // In 1.0, we just remove it to allow new ones to start if context shifts
        world.activeCombats.delete(combatId);
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
            const target = fleet.originSystemId || nearestOwnedSystem(world, prey, fleet.currentSystemId);
            if (!target || target === fleet.currentSystemId) continue;
            try {
                const updated = issueMoveOrder(fleet, target, 'hyperlane', world.movement);
                (updated as any).routedUntilSeconds = world.nowSeconds + FEAR_ROUT_GRACE_SECONDS;
                world.movement.fleets.set(updated.id, updated);
                moved += 1;
            } catch (e) {
                // Pathing needs a full fleet record (hyperdriveProfile and the
                // rest). A malformed one must not take down combat resolution
                // for everybody else in the system — it just fights instead.
                console.error(`[CombatManager] Fear Aura could not withdraw ${fleet.id}:`, e);
            }
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

function createCombatant(factionId: string, fleets: Fleet[], role: 'attacker' | 'defender', world?: any): CombatantState {
    const totalPower = fleets.reduce((sum, f) => sum + (f.basePower * f.strength), 0);
    
    // Combine compositions
    const mergedComp: UnitComposition = {};
    fleets.forEach(f => {
        // A fleet can carry an empty composition object ({}), which is truthy — so
        // `f.composition || fallback` would never trigger. Fall back whenever the
        // composition has no actual ship entries, so production-built fleets still fight.
        const comp = (f.composition && Object.keys(f.composition).length > 0)
            ? f.composition
            : { destroyer: Math.max(1, Math.floor(f.basePower / 150)) };
        for (const [type, count] of Object.entries(comp)) {
            const uType = type as keyof UnitComposition;
            mergedComp[uType] = (mergedComp[uType] || 0) + (count as number);
        }
    });

    // HOI4 Naval Math: Screens vs Capitals (Air wings like interceptors and bombers excluded)
    const screens = (mergedComp['destroyer'] || 0);
    const capitals = (mergedComp['cruiser'] || 0) + (mergedComp['carrier'] || 0);
    // 3 screens per capital is 100% efficient
    let screenEff = 1.0;
    if (capitals > 0) {
        screenEff = Math.min(1.0, screens / (capitals * 3));
    }

    const hp = totalPower * 10;
    const org = 50 + ((fleets[0]?.doctrine.moraleDrift ?? 0) / 2); // 0-100 scale

    return {
        factionId,
        role,
        hp: hp,
        maxHp: hp,
        baseForceCount: totalPower * 100,
        casualties: 0,
        organization: org,
        maxOrganization: org,
        screeningEfficiency: screenEff,
        composition: mergedComp,
        intelLevel: 'observing',
        supply: fleets[0]?.doctrine.supplyLevel ?? 1.0,
        // NOTE: `+` binds tighter than `??`, so `moraleDrift ?? 0 + 100` parsed as
        // `moraleDrift ?? 100`, giving morale=0 for a default fleet (a permanent 50%
        // power penalty). Parenthesise the `?? 0` and clamp the result to [0,1].
        morale: Math.max(0, Math.min(1, ((fleets[0]?.doctrine.moraleDrift ?? 0) + 100) / 200)),
        doctrine: 'aggressive',
        predictionPoints: 0,
        selectedStance: 'shock',
        // combat-engine has read techModifiers since it was written, but nothing
        // ever populated the field — every tech combat bonus in the trees was
        // inert. The faction's accumulated modifiers are passed straight through
        // so authors use the engine's own key names. prediction_bonus_multiplier
        // is the exception: the engine treats it as an absolute with a 0.15
        // default, so techs contribute to it via prediction_bonus_add instead of
        // overwriting it with a smaller number.
        techModifiers: (() => {
            const mods = getTechModifiers(world, factionId);
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
