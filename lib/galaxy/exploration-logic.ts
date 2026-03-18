// lib/galaxy/exploration-logic.ts
import { Anomaly } from '@/types/ui-state';

export const ANOMALY_TYPES: Omit<Anomaly, 'id'>[] = [
    {
        name: 'Xeno-Archeological Site',
        type: 'ancient_ruins',
        description: 'Vast underground complexes containing fragments of a forgotten precursor technology.',
        bonus: { research: 25 }
    },
    {
        name: 'Hyper-Dense Pulsar',
        type: 'stellar_phenomena',
        description: 'A rapidly spinning neutron star emitting intense radiation, useful for navigational data.',
        bonus: { trade: 15 }
    },
    {
        name: 'Pre-Space Civilization',
        type: 'pre_ftl',
        description: 'A primitive society on the cusp of discovering fire. To interfere or to observe?',
        bonus: { stability: -10, research: 10 }
    },
    {
        name: 'Stellar Graveyard',
        type: 'void_rift',
        description: 'The wreckage of a massive fleet from a conflict thousands of years old.',
        bonus: { trade: 20 }
    }
];

export function getRandomAnomaly(): Anomaly | undefined {
    // 20% chance for an anomaly
    if (Math.random() > 0.2) return undefined;
    
    const type = ANOMALY_TYPES[Math.floor(Math.random() * ANOMALY_TYPES.length)];
    return {
        ...type,
        id: `anomaly-${Math.random().toString(36).substr(2, 9)}`
    };
}
