export type SectorType = 'deep_space' | 'asteroid_field' | 'nebula' | 'planet';

/**
 * Deterministically calculates the terrain type for a given coordinate.
 * This allows us to have map features without storing them in the DB.
 */
export function getSectorType(x: number, y: number): SectorType {
    // Simple pseudo-random hash based on coordinates
    // We want a static map, so no Math.random()
    const hash = (x * 37 + y * 17) % 100;

    // 10% chance of Asteroids
    // Avoid 0,0 or starting areas if possible (though random is fine for now)
    if (hash < 10) {
        return 'asteroid_field';
    }

    // 5% chance of Nebula (Future use)
    if (hash > 90) {
        return 'nebula';
    }

    return 'deep_space';
}

export function canEnterSector(type: SectorType): boolean {
    if (type === 'asteroid_field') return false;
    return true;
}
