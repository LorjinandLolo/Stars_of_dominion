import { EspionageState } from '@/types/ui-state';

export const mockEspionageState: EspionageState = {
    agents: [
        {
            id: 'ag-001',
            name: 'Kaelen Voss',
            codename: 'SILENT_WATCHER',
            status: 'deployed',
            deployedToSystemId: 'crimson-expanse',
            experienceLevel: 45,
            traitIds: ['ghost', 'veteran'],
            coverStrength: 0.85,
        },
        {
            id: 'ag-002',
            name: 'Mara Jade',
            codename: 'RED_POINT',
            status: 'available',
            deployedToSystemId: null,
            experienceLevel: 32,
            traitIds: ['brutal'],
            coverStrength: 1.0,
        },
    ],
    networks: [
        {
            id: 'net-001',
            systemId: 'crimson-expanse',
            strength: 0.65,
            penetrationLevel: 'confirmed',
        },
    ],
    operations: [
        {
            id: 'op-001',
            targetFactionId: 'faction-aurelian',
            targetRegionId: 'crimson-expanse',
            domain: 'infrastructureSabotage',
            status: 'active',
            startedAt: '2026-03-14T10:00:00Z',
            completesAt: '2026-03-15T10:00:00Z',
            investmentLevel: 0.75,
        },
    ],
    candidates: [],
    exposureRisk: 30,
};
