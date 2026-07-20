// lib/combat/combat-manager.ts
import { GameWorldState } from '../game-world-state';
import { Fleet } from '../movement/types';
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
        const attacker = createCombatant(factionA, fleetsA, 'attacker');
        const defender = createCombatant(factionB, fleetsB, 'defender');

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
        world.activeCombats.set(combatId, state);
        console.log(`[CombatManager] Initiated engagement at ${systemId} between ${factionA} and ${factionB}`);
    }

    // Advance round if not resolved
    if (!state.resolved) {
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

function createCombatant(factionId: string, fleets: Fleet[], role: 'attacker' | 'defender'): CombatantState {
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
        selectedStance: 'shock'
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
