// lib/combat/siege/siege-events.ts
//
// The moments of a planetary battle that both sides must hear about: the
// landing, a strongpoint changing hands, the shield failing, the blockade
// closing or breaking, reinforcements coming down, the invasion collapsing,
// the world falling. Each one is a notification to both belligerents, a line
// in the siege's own battle log, and a chronicle event the narrator can turn
// into a story. Nobody used to be told any of this — a player's homeworld
// could be invaded and lost between two logins without a single notification.
//
// Imports only lib/time and lib/narrative; safe for the worker. Never
// imports lib/db.

import { fireNotification } from '../../time/notification-hooks';
import { record as recordChronicle } from '../../narrative/chronicle';
const chronicle = { record: recordChronicle };
import type { GroundSiegeState } from './siege-types';
import type { Strongpoint } from './strongpoints';

export type SiegeEventKind =
    | 'landing'
    | 'strongpoint_fallen'
    | 'strongpoint_retaken'
    | 'shield_down'
    | 'blockade_established'
    | 'blockade_broken'
    | 'reinforcements_landed'
    | 'invasion_collapsed'
    | 'planet_lost';

export interface SiegeEventFacts {
    strongpoint?: Strongpoint;
    /** Men involved (reinforcements landed, invaders captured, ...). */
    men?: number;
    /** Share of the surface the invader holds, 0-100. */
    surfaceHeld?: number;
    /** Fleet power overhead, for blockade events. */
    power?: number;
}

const KIND_LABEL: Record<string, string> = {
    capital: 'the capital district',
    chokepoint: 'the mountain pass',
    shield: 'the shield generator',
    barracks: 'the barracks',
    airbase: 'the airbase',
    orbital_defense: 'the orbital defence platform',
    hall: 'the Hall of Triumphs',
    fortress: 'the fortress',
    bunker: 'the munitions bunker',
};

interface Copy {
    title: string;
    attacker: string;
    defender: string;
    /** Which side gets it as urgent. */
    urgentFor: 'attacker' | 'defender' | 'both' | 'none';
}

function copyFor(kind: SiegeEventKind, planetName: string, facts: SiegeEventFacts, attackerName: string, defenderName: string): Copy {
    const sp = facts.strongpoint ? `${KIND_LABEL[facts.strongpoint.kind] ?? facts.strongpoint.kind} (district ${facts.strongpoint.sectorIndex})` : '';
    switch (kind) {
        case 'landing':
            return {
                title: `INVASION OF ${planetName.toUpperCase()}`,
                attacker: `Your troops are ashore on ${planetName}. Hold the orbit to keep them fed.`,
                defender: `${attackerName} has landed on ${planetName}. Hold the strongpoints; relief must come through the orbit.`,
                urgentFor: 'defender',
            };
        case 'strongpoint_fallen':
            return {
                title: `${planetName.toUpperCase()}: ${(KIND_LABEL[facts.strongpoint?.kind ?? ''] ?? 'strongpoint').toUpperCase()} FALLS`,
                attacker: `Your forces have taken ${sp} on ${planetName}.`,
                defender: `${attackerName} has taken ${sp} on ${planetName}.`,
                urgentFor: 'defender',
            };
        case 'strongpoint_retaken':
            return {
                title: `${planetName.toUpperCase()}: ${(KIND_LABEL[facts.strongpoint?.kind ?? ''] ?? 'strongpoint').toUpperCase()} RETAKEN`,
                attacker: `${defenderName} has retaken ${sp} on ${planetName}.`,
                defender: `Your forces have retaken ${sp} on ${planetName}.`,
                urgentFor: 'attacker',
            };
        case 'shield_down':
            return {
                title: `${planetName.toUpperCase()}: SHIELD DOWN`,
                attacker: `The shield over ${planetName} has failed. Orbital fire is landing on the defenders.`,
                defender: `The shield generator on ${planetName} is gone. The enemy fleet is firing on your lines.`,
                urgentFor: 'defender',
            };
        case 'blockade_established':
            return {
                title: `${planetName.toUpperCase()} BLOCKADED`,
                attacker: `Your fleet holds the orbit over ${planetName} (${facts.power ?? 0} power). The beachhead is supplied; nothing lands for the defender.`,
                defender: `${attackerName}'s fleet holds the orbit over ${planetName}. No transports can land until it is driven off — or a shield is raised.`,
                urgentFor: 'defender',
            };
        case 'blockade_broken':
            return {
                title: `${planetName.toUpperCase()}: ORBIT LOST`,
                attacker: `You no longer hold the orbit over ${planetName}. The beachhead will starve unless the sky is retaken.`,
                defender: `The blockade of ${planetName} is broken. Transports can land; the invaders are cut off from resupply.`,
                urgentFor: 'attacker',
            };
        case 'reinforcements_landed':
            return {
                title: `${planetName.toUpperCase()}: REINFORCEMENTS`,
                attacker: `${(facts.men ?? 0).toLocaleString()} fresh troops have landed on ${planetName}.`,
                defender: `${(facts.men ?? 0).toLocaleString()} fresh troops have joined the defence of ${planetName}.`,
                urgentFor: 'none',
            };
        case 'invasion_collapsed':
            return {
                title: `${planetName.toUpperCase()} HOLDS`,
                attacker: `The invasion of ${planetName} has collapsed. ${facts.men ? `${facts.men.toLocaleString()} survivors were taken prisoner.` : ''}`.trim(),
                defender: `The invasion of ${planetName} has collapsed. The world is yours.`,
                urgentFor: 'attacker',
            };
        case 'planet_lost':
            return {
                title: `${planetName.toUpperCase()} HAS FALLEN`,
                attacker: `${planetName} is yours. ${facts.surfaceHeld ?? 100}% of the surface was in your hands when the government fell.`,
                defender: `${planetName} has fallen to ${attackerName}.`,
                urgentFor: 'defender',
            };
    }
}

/**
 * Report a siege event to both belligerents, the battle log and the
 * chronicle. `nameOf` resolves an empire id to a display name.
 */
export function reportSiegeEvent(
    world: any,
    planet: { id: string; name: string; systemId?: string },
    siege: GroundSiegeState,
    kind: SiegeEventKind,
    facts: SiegeEventFacts = {},
    nameOf: (id: string) => string = id => String(id).replace(/^faction-/, '').replace(/[-_]/g, ' '),
): void {
    const attacker = siege.attackerEmpireId;
    const defender = siege.defenderEmpireId;
    const copy = copyFor(kind, planet.name, facts, nameOf(attacker), nameOf(defender));
    const stamp = new Date().toISOString();
    for (const [side, me] of [['attacker', attacker], ['defender', defender]] as const) {
        if (!me) continue;
        fireNotification({
            id: `siege-${kind}-${planet.id}-${me}-${siege.cycleCount}-${world.nowSeconds}`,
            factionId: me,
            category: 'combat',
            priority: copy.urgentFor === 'both' || copy.urgentFor === side ? 'urgent' : 'normal',
            title: copy.title,
            body: copy[side],
            createdAt: stamp,
            read: false,
            linkToTab: 'map',
            payload: {
                planetId: planet.id,
                systemId: planet.systemId,
                siegeId: siege.siegeId,
                kind,
                sectorIndex: facts.strongpoint?.sectorIndex,
            },
        } as any);
    }
    siege.battleLog.push({ cycle: siege.cycleCount, message: copy.defender, event: kind.toUpperCase() });

    // The chronicle. Existing event types only — a new ChronicleEventType
    // needs importance, memory and prose entries, and these stories fit the
    // ones that exist.
    try {
        if (kind === 'landing') {
            chronicle.record(world, {
                type: 'siege_started',
                actorIds: [attacker],
                targetIds: [defender],
                location: planet.id,
                facts: { planetName: planet.name },
                coalesceKey: `siege:${planet.id}`,
            } as any);
        } else if (kind === 'blockade_established' || kind === 'blockade_broken') {
            chronicle.record(world, {
                type: 'blockade_started',
                actorIds: [kind === 'blockade_established' ? attacker : defender],
                targetIds: [kind === 'blockade_established' ? defender : attacker],
                location: planet.id,
                facts: { planetName: planet.name, phase: kind === 'blockade_established' ? 'established' : 'broken', power: facts.power ?? 0 },
                coalesceKey: `blockade:${planet.id}`,
            } as any);
        } else if (kind === 'strongpoint_fallen' || kind === 'strongpoint_retaken' || kind === 'shield_down' || kind === 'invasion_collapsed') {
            const attackerWon = kind === 'strongpoint_fallen' || kind === 'shield_down';
            chronicle.record(world, {
                type: 'battle_resolved',
                actorIds: [attackerWon ? attacker : defender],
                targetIds: [attackerWon ? defender : attacker],
                location: planet.id,
                facts: {
                    planetName: planet.name,
                    theatre: 'ground',
                    manner: kind,
                    strongpoint: facts.strongpoint?.kind,
                    sectorIndex: facts.strongpoint?.sectorIndex,
                    men: facts.men ?? 0,
                    siegeCycles: siege.cycleCount,
                },
                coalesceKey: `siege:${planet.id}:${siege.cycleCount}`,
            } as any);
        }
        // 'planet_lost' is chronicled by recordSiegeCapture in the worker.
    } catch { /* the chronicle never breaks a battle */ }
}
