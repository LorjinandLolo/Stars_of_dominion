// ===== file: lib/trade-system/rng.ts =====

/**
 * A simple seeded Pseudo-Random Number Generator (Mulberry32).
 * Fast and adequate for game simulation determinism.
 */
export class RNG {
    private state: number;

    constructor(seed: number) {
        this.state = seed | 0;
    }

    /**
     * Returns a float between 0 (inclusive) and 1 (exclusive).
     */
    next(): number {
        this.state = (this.state + 0x6D2B79F5) | 0;
        let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * Returns an integer between min (inclusive) and max (inclusive).
     */
    nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /**
     * Returns true if next() < chance.
     */
    check(chance: number): boolean {
        return this.next() < chance;
    }

    /**
     * Shuffles an array in place using Fisher-Yates.
     */
    shuffle<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}

/**
 * FNV-1a — stable across processes, unlike a hash built on object identity.
 * Lives next to the RNG so any simulation module can seed deterministically
 * without pulling in a heavier service. Re-exported from
 * lib/leadership/leader-generator.ts, which defined it first.
 */
export function seedFromString(seed: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}
