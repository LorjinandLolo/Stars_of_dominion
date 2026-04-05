export type SectorType = 'deep_space' | 'asteroid_field' | 'nebula' | 'planet' | 'ion_storm';

/**
 * Deterministically calculates the terrain type for a given coordinate.
 * This allows us to have map features without storing them in the DB.
 */
export function getSectorType(x: number, y: number): SectorType {
    // Simple pseudo-random hash based on coordinates
    // We want a static map, so no Math.random()
    const hash = (x * 37 + y * 17) % 100;

    // 15% chance of Asteroids
    if (hash < 15) {
        return 'asteroid_field';
    }

    // 15% chance of Nebula
    if (hash >= 15 && hash < 30) {
        return 'nebula';
    }

    // 5% chance of Ion Storm
    if (hash > 94) {
        return 'ion_storm';
    }

    return 'deep_space';
}

export function canEnterSector(type: SectorType): boolean {
    if (type === 'asteroid_field') return false; // Blocks movement completely
    // Nebulas and Ion Storms are passable but might have other effects elsewhere
    return true;
}
