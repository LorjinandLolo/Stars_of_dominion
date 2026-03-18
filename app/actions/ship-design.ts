// app/actions/ship-design.ts
'use server';

import { ShipDesign } from '@/lib/combat/ship-types';

// Mock database for demo purposes
let mockDesigns: ShipDesign[] = [
    {
        id: 'design-default-interceptor',
        name: 'Classic Interceptor',
        hullId: 'hull-interceptor',
        components: {
            'w1': 'comp-pulse-laser',
            'u1': 'comp-deflector',
            'c1': 'comp-fission-core'
        },
        isDefault: true
    }
];

export async function getShipDesignsAction() {
    return { success: true, designs: mockDesigns };
}

export async function saveShipDesignAction(design: ShipDesign) {
    const index = mockDesigns.findIndex(d => d.id === design.id);
    if (index >= 0) {
        mockDesigns[index] = design;
    } else {
        mockDesigns.push(design);
    }
    return { success: true, design };
}

export async function deleteShipDesignAction(id: string) {
    mockDesigns = mockDesigns.filter(d => d.id !== id);
    return { success: true };
}
