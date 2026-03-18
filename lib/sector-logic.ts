import { HexGrid } from './hex-grid';
import { Sector, Tile, Entity, System } from '../types/index';

export class SectorManager {
    grid: HexGrid;
    sectorId: string;
    tiles: Map<string, Tile>; // Key: "x,y"
    entities: Map<string, Entity>;

    constructor(sector: Sector, entities: Entity[] = []) {
        this.grid = new HexGrid(sector.rows, sector.columns);
        this.sectorId = sector.id;
        this.tiles = new Map();
        this.entities = new Map();

        // Initialize tiles
        for (let r = 0; r < sector.rows; r++) {
            for (let c = 0; c < sector.columns; c++) {
                this.tiles.set(`${c},${r}`, {
                    x: c,
                    y: r,
                    sectorId: sector.id,
                    entityIds: []
                });
            }
        }

        // Add initial entities
        entities.forEach(e => this.addEntity(e));
    }

    /**
     * Places an entity on the grid.
     */
    addEntity(entity: Entity) {
        if (!this.grid.isValid(entity.x, entity.y)) {
            console.error(`Invalid position (${entity.x}, ${entity.y}) for entity ${entity.id}`);
            return;
        }

        if (this.entities.has(entity.id)) {
            // Update existing? Or Error? Let's error for clarity or just overwrite.
            // Overwriting might leave ghost IDs in tiles if not careful.
            // Simplified: Assume new.
        }

        this.entities.set(entity.id, entity);

        const tileKey = `${entity.x},${entity.y}`;
        const tile = this.tiles.get(tileKey);
        if (tile) {
            tile.entityIds.push(entity.id);
        }
    }

    /**
     * Moves an entity to a target position if it is a valid neighbor.
     */
    moveEntity(entityId: string, targetX: number, targetY: number): boolean {
        const entity = this.entities.get(entityId);
        if (!entity) {
            console.error(`Entity ${entityId} not found`);
            return false;
        }

        if (!this.grid.isValid(targetX, targetY)) {
            console.error(`Target ${targetX},${targetY} is invalid`);
            return false;
        }

        // Check if target has a valid destination (System or Bridge)
        const targetTile = this.tiles.get(`${targetX},${targetY}`);
        const targetEntities = targetTile ? targetTile.entityIds.map(id => this.entities.get(id)).filter(e => e) : [];
        const targetSystem = targetEntities.find(e => e && (e.type === 'system' || e.type === 'bridge')) as System | undefined;

        if (!targetSystem) {
            console.log(`Move failed: ${targetX},${targetY} is not a valid system.`);
            return false;
        }

        // Check for Hyperlane/Wormhole Connection
        const currentSystem = this.getEntitiesAt(entity.x, entity.y).find(e => e.type === 'system' || e.type === 'bridge') as System | undefined;
        let isHyperlane = false;

        if (currentSystem && currentSystem.attributes) {
            // Parse attributes if needed (in memory they should be objects, but from DB might be string if not hydrated)
            let attrs = currentSystem.attributes;
            if (typeof attrs === 'string') {
                try { attrs = JSON.parse(attrs); } catch (e) { }
            }

            if (attrs.hyperlaneTo && Array.isArray(attrs.hyperlaneTo)) {
                // Check if target is in the list
                isHyperlane = attrs.hyperlaneTo.some((h: any) => h.x === targetX && h.y === targetY);
            }
        }

        if (isHyperlane) {
            console.log(`Hyperlane Travel: ${currentSystem?.name} -> ${targetSystem.name}`);
            // Allow move, skip distance check
        } else {
            // Enforce Range (Implicit Lanes)
            // Default range 5 for now, or read from entity stats
            const range = 5;
            const dist = this.grid.getDistance({ x: entity.x, y: entity.y }, { x: targetX, y: targetY });

            if (dist > range) {
                console.log(`Move failed: Target too far (${dist} > ${range})`);
                return false;
            }
        }

        // Logic for "In Transit" would go here (update state instead of x/y), 
        // but for now we implement the valid-move checking.

        // Update Tile References
        const oldKey = `${entity.x},${entity.y}`;
        const oldTile = this.tiles.get(oldKey);
        if (oldTile) {
            oldTile.entityIds = oldTile.entityIds.filter(id => id !== entityId);
        }

        // Update Entity
        entity.x = targetX;
        entity.y = targetY;

        // Update New Tile
        const newKey = `${targetX},${targetY}`;
        const newTile = this.tiles.get(newKey);
        if (newTile) {
            newTile.entityIds.push(entityId);
        }

        return true;
    }

    getEntitiesAt(x: number, y: number): Entity[] {
        const tile = this.tiles.get(`${x},${y}`);
        if (!tile) return [];
        return tile.entityIds
            .map(id => this.entities.get(id))
            .filter((e): e is Entity => !!e);
    }

    getTile(x: number, y: number): Tile | undefined {
        return this.tiles.get(`${x},${y}`);
    }
}
