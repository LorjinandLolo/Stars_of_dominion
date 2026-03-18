import { Magnitude } from './types';

// --- BALANCE TABLES ---

export const STAT_SHIFT_VALUES: Record<Magnitude, number> = {
    [Magnitude.VERY_LOW]: 0.05,  // 5%
    [Magnitude.LOW]: 0.10,       // 10%
    [Magnitude.MED]: 0.20,       // 20%
    [Magnitude.HIGH]: 0.35,      // 35%
    [Magnitude.SEVERE]: 0.50     // 50%
};

export const RESENTMENT_GENERATION: Record<Magnitude, number> = {
    [Magnitude.VERY_LOW]: 1,
    [Magnitude.LOW]: 3,
    [Magnitude.MED]: 5,
    [Magnitude.HIGH]: 10,
    [Magnitude.SEVERE]: 20
};

export const INSTABILITY_GENERATION: Record<Magnitude, number> = {
    [Magnitude.VERY_LOW]: 1,
    [Magnitude.LOW]: 2,
    [Magnitude.MED]: 4,
    [Magnitude.HIGH]: 8,
    [Magnitude.SEVERE]: 16
};

// Durations in "ticks" or "days" (abstract time units)
export const EFFECT_DURATION: Record<Magnitude, number> = {
    [Magnitude.VERY_LOW]: 3,
    [Magnitude.LOW]: 7,
    [Magnitude.MED]: 14,
    [Magnitude.HIGH]: 30,
    [Magnitude.SEVERE]: -1 // Permanent
};

/**
 * Helper to get numeric value for a generic magnitude context
 */
export function getMagnitudeValue(mag: Magnitude): number {
    switch (mag) {
        case Magnitude.VERY_LOW: return 1;
        case Magnitude.LOW: return 2;
        case Magnitude.MED: return 3;
        case Magnitude.HIGH: return 4;
        case Magnitude.SEVERE: return 5;
    }
}
