export class HexGrid {
    rows: number;
    cols: number;

    constructor(rows: number, cols: number) {
        this.rows = rows;
        this.cols = cols;
    }

    /**
     * Get neighbors for a hex tile at (col, row).
     * Uses "odd-r" horizontal layout (shoves odd rows right).
     * Or "even-q" / "odd-q"? "odd-r" (offset) is common for flat-topped hexes.
     * User said: "You interpret the board as hex (not square) by changing neighbour rules"
     * Implementation: Offset coordinates (odd-r).
     */
    getNeighbors(col: number, row: number): { x: number, y: number }[] {
        const directions = row % 2 !== 0
            ? [
                { dx: 1, dy: 0 }, { dx: 1, dy: -1 }, { dx: 0, dy: -1 },
                { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }
            ]
            : [
                { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: -1, dy: -1 },
                { dx: -1, dy: 0 }, { dx: -1, dy: 1 }, { dx: 0, dy: 1 }
            ];

        return directions
            .map(d => ({ x: col + d.dx, y: row + d.dy }))
            .filter(p => this.isValid(p.x, p.y));
    }

    isValid(x: number, y: number): boolean {
        return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
    }

    /**
     * Get entities at a specific location
     * @param x 
     * @param y 
     * @param entities Array of entities with x, y coordinates
     * @returns 
     */
    getEntitiesAt<T extends { x?: number, y?: number }>(x: number, y: number, entities: T[]): T[] {
        return entities.filter(e => e.x === x && e.y === y);
    }

    /**
     * Convert grid coordinates to pixel coordinates for UI rendering.
     * Assumes Pointy-topped hexes with Odd-R offset.
     * @param col Grid column (x)
     * @param row Grid row (y)
     * @param size Hex radius (center to corner)
     */
    hexToPixel(col: number, row: number, size: number): { x: number, y: number } {
        const width = Math.sqrt(3) * size;
        const height = 2 * size;

        // Odd-R offset: Shift odd rows right by half width
        const xOffset = (row % 2 !== 0) ? width / 2 : 0;

        const x = (col * width) + xOffset + (width / 2); // +width/2 to center
        const y = (row * (height * 0.75)) + (height / 2); // +height/2 to center

        return { x, y };
    }

    /**
     * Get the 6 corners of a hexagon relative to its center (0,0).
     * Pointy-topped orientation.
     */
    getHexCorners(size: number): { x: number, y: number }[] {
        const corners = [];
        for (let i = 0; i < 6; i++) {
            const angle_deg = 60 * i - 30; // -30 for pointy top
            const angle_rad = Math.PI / 180 * angle_deg;
            corners.push({
                x: size * Math.cos(angle_rad),
                y: size * Math.sin(angle_rad)
            });
        }
        return corners;
    }

    /**
     * Calculate hexagonal manhattan distance (displacement)
     * Simplified using cubic coordinates (q, r, s) where q + r + s = 0
     * Odd-R to Cubic conversion:
     * q = col - (row - (row&1)) / 2
     * r = row
     * s = -q - r
     */
    getDistance(a: { x: number, y: number }, b: { x: number, y: number }): number {
        const ax = a.x - (a.y - (a.y & 1)) / 2;
        const az = a.y;
        const ay = -ax - az;

        const bx = b.x - (b.y - (b.y & 1)) / 2;
        const bz = b.y;
        const by = -bx - bz;

        return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
    }

    /**
     * Find shortest path using BFS
     */
    findPath(start: { x: number, y: number }, end: { x: number, y: number }): { x: number, y: number }[] | null {
        if (!this.isValid(start.x, start.y) || !this.isValid(end.x, end.y)) return null;

        const queue = [{ x: start.x, y: start.y, path: [{ x: start.x, y: start.y }] }];
        const visited = new Set<string>();
        visited.add(`${start.x},${start.y}`);

        while (queue.length > 0) {
            const { x, y, path } = queue.shift()!;

            if (x === end.x && y === end.y) return path;

            const neighbors = this.getNeighbors(x, y);
            for (const n of neighbors) {
                const key = `${n.x},${n.y}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    queue.push({ x: n.x, y: n.y, path: [...path, n] });
                }
            }
        }
        return null; // No path found
    }
}
