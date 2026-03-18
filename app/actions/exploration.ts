// app/actions/exploration.ts
'use server';

import { getRandomAnomaly } from '@/lib/galaxy/exploration-logic';

export async function surveySystemAction(systemId: string) {
    console.log(`[EXPLORATION] Surveying system: ${systemId}`);
    
    // In a real DB, we would update the system record
    const anomaly = getRandomAnomaly();
    
    return {
        success: true,
        isSurveyed: true,
        anomaly
    };
}
