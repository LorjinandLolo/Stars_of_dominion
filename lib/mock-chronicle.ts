import { ChronicleEntry } from '@/types/ui-state';

export const mockChronicle: ChronicleEntry[] = [
    {
        id: 'chr-001', eventId: 'evt-region-formed-1', type: 'region_formed',
        timestamp: '2026-01-01T00:00:00Z', regionId: 'crimson-expanse',
        factionsInvolved: ['faction-aurelian'],
        headline: 'Crimson Expanse Consolidates',
        detail: 'Trade density and military presence forge a lasting regional identity.',
    },
    {
        id: 'chr-002', eventId: 'evt-council-founded', type: 'council_founded',
        timestamp: '2026-01-05T00:00:00Z',
        factionsInvolved: ['faction-aurelian', 'faction-vektori', 'faction-covenant'],
        headline: 'Galactic Council Convenes for the First Time',
    },
    {
        id: 'chr-003', eventId: 'evt-crisis-start-1', type: 'crisis_started',
        timestamp: '2026-01-15T00:00:00Z', regionId: 'veldt-dominion',
        factionsInvolved: ['faction-vektori'],
        headline: 'Order Crisis Erupts in Veldt Dominion',
        detail: 'Cascading instability breaches critical threshold.',
    },
    {
        id: 'chr-010', eventId: 'evt-rebellion', type: 'crisis_started',
        timestamp: '2026-02-10T00:00:00Z', regionId: 'veldt-dominion',
        factionsInvolved: ['faction-vektori'],
        headline: 'Rebellion Declared — Veldt Sovereignty Contested',
        detail: 'Armed insurgency challenges Vektori governance legitimacy.',
    },
];
