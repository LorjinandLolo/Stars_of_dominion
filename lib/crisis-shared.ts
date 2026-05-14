
export type CrisisType = 'orbital_bombardment' | 'ground_invasion' | 'sabotage';

export interface CrisisStrategy {
    id: string;
    name: string;
    description: string;
    type: 'attack' | 'defense';
    counters?: string[]; // IDs of strategies this counters
}

// --- Strategies ---
// A simplified Rock-Paper-Scissors system for the prototype
const ATTACK_STRATEGIES: CrisisStrategy[] = [
    { id: 'orbital_barrage', name: 'Orbital Barrage', description: 'Heavy bombardment. Effective against massed troops.', type: 'attack' },
    { id: 'precision_strike', name: 'Precision Strike', description: 'Targeted facilities. Effective against bunkers.', type: 'attack' },
    { id: 'rapid_drop', name: 'Rapid Drop', description: 'Fast troop deployment. Overwhelms defenses.', type: 'attack' }
];

const DEFENSE_STRATEGIES: CrisisStrategy[] = [
    { id: 'shield_dome', name: 'Shield Dome', description: 'Absorbs heavy fire.', type: 'defense', counters: ['orbital_barrage'] },
    { id: 'electronic_jamming', name: 'Electronic Jamming', description: 'Confuses targeting systems.', type: 'defense', counters: ['precision_strike'] },
    { id: 'bunker_down', name: 'Bunker Down', description: 'Entrench troops to resist assault.', type: 'defense', counters: ['rapid_drop'] },
    // "Panic" is the default if no response
    { id: 'panic', name: 'Panic', description: 'Disorganized response.', type: 'defense', counters: [] }
];

export function getAvailableStrategies(type: 'attack' | 'defense') {
    return type === 'attack' ? ATTACK_STRATEGIES : DEFENSE_STRATEGIES;
}

export function resolveLogic(attStratId: string, defStratId: string, predictedAttStratId?: string) {
    // Check if defense counters attack
    const defStrat = DEFENSE_STRATEGIES.find(s => s.id === defStratId);

    const winner = (defStrat && defStrat.counters?.includes(attStratId)) ? 'defender' : 'attacker';
    const predictionCorrect = predictedAttStratId === attStratId;
    
    let message = '';
    let bonus = '';
    const appliedEffects: string[] = [];

    if (winner === 'defender') {
        message = `${defStrat?.name} effectively countered ${attStratId.replace(/_/g, ' ')}!`;
        bonus = 'Defender takes minimal damage.';
        appliedEffects.push('Counter-Strategy Applied');
    } else {
        message = `Defense (${defStrat?.name || 'None'}) failed to stop ${attStratId.replace(/_/g, ' ')}!`;
        bonus = 'Attacker deals heavy damage.';
    }

    if (predictionCorrect) {
        appliedEffects.push('Foresight Bonus (+15% Tactical Advantage)');
        bonus += ' Correct prediction granted a tactical windfall.';
    }

    return {
        winner,
        message,
        bonus,
        predictionCorrect,
        appliedEffects
    };
}

