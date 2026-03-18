
import { DefeatTrigger, DefeatType } from '@/types/comeback';
import { DEFEAT_TRIGGERS } from './data';

interface MetricsSnapshot {
    timestamp: string;
    fleet_power: number;
    planet_count: number;
    net_income: number;
    debt: number;
    // ... other metrics
}

/**
 * Detects if any defeat conditions are met based on metrics history.
 */
export class DefeatDetector {

    // In a real app, this would query a time-series DB or metrics history
    static detect(history: MetricsSnapshot[]): DefeatType | null {
        if (!history || history.length === 0) return null;

        const latest = history[history.length - 1];
        const now = new Date(latest.timestamp).getTime();

        // 1. Check Military Defeat
        // Compare max fleet power in window to current
        const militaryTrigger = DEFEAT_TRIGGERS['MILITARY_DEFEAT'];
        const windowStart = now - (militaryTrigger.window_days * 24 * 60 * 60 * 1000);

        let maxFleetPower = 0;
        let maxPlanetCount = 0;

        for (const snap of history) {
            if (new Date(snap.timestamp).getTime() >= windowStart) {
                if (snap.fleet_power > maxFleetPower) maxFleetPower = snap.fleet_power;
                if (snap.planet_count > maxPlanetCount) maxPlanetCount = snap.planet_count;
            }
        }

        if (maxFleetPower > 0) {
            const lossRatio = (maxFleetPower - latest.fleet_power) / maxFleetPower;
            if (lossRatio >= militaryTrigger.thresholds.fleet_power_loss) {
                return 'MILITARY_DEFEAT';
            }
        }

        // 2. Check Economic Collapse
        const econTrigger = DEFEAT_TRIGGERS['ECONOMIC_COLLAPSE'];
        // Simple check: Debt duration
        // Count how many consecutive snapshots show debt
        let debtCount = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].debt > 0) debtCount++;
            else break;
        }
        // Assuming 1 snapshot per day for simplicity of this mock logic
        if (debtCount >= econTrigger.thresholds.debt_duration) {
            return 'ECONOMIC_COLLAPSE';
        }

        return null;
    }
}
