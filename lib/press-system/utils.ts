// ===== file: lib/press-system/utils.ts =====

/**
 * Seeded PRNG (Mulberry32)
 */
export class RNG {
    private state: number;

    constructor(seed: number) {
        this.state = seed | 0;
    }

    next(): number {
        this.state = (this.state + 0x6D2B79F5) | 0;
        let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * Integer in range [min, max] inclusive
     */
    nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /**
     * True with probability (0-1)
     */
    check(probability: number): boolean {
        return this.next() < probability;
    }
}

export function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

/**
 * Calculates distance between two grid points.
 */
export function distance(a: { x: number, y: number }, b: { x: number, y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}
