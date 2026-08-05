import fs from 'fs';
import path from 'path';
import type { SocietyProfile, GovernmentProfile, PolicyDefinition, FactionDefinition, BlocDefinition, AmbitionDefinition } from './registry-types';

export class Registry<T extends { id: string }> {
    private items: Map<string, T> = new Map();

    register(item: T) {
        this.items.set(item.id, item);
    }

    get(id: string): T | undefined {
        return this.items.get(id);
    }

    getAll(): T[] {
        return Array.from(this.items.values());
    }

    has(id: string): boolean {
        return this.items.has(id);
    }
}

export const societyRegistry = new Registry<SocietyProfile>();
export const governmentRegistry = new Registry<GovernmentProfile>();
export const policyRegistry = new Registry<PolicyDefinition>();
export const factionRegistry = new Registry<FactionDefinition>();
/** Internal interest groups (data/blocs). Drives bloc seeding and drift. */
export const blocRegistry = new Registry<BlocDefinition>();
/** Leader ambition templates (data/ambitions). Drives the Legacy System. */
export const ambitionRegistry = new Registry<AmbitionDefinition>();

/**
 * Loads all JSON files from the specified directory and registers them.
 */
function loadDirectory<T extends { id: string }>(dirPath: string, registry: Registry<T>) {
    if (!fs.existsSync(dirPath)) {
        console.warn(`[Registry] Directory not found: ${dirPath}`);
        return;
    }

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
            const data = fs.readFileSync(path.join(dirPath, file), 'utf-8');
            const item = JSON.parse(data) as T;
            if (item.id) {
                registry.register(item);
            } else {
                console.warn(`[Registry] Missing 'id' in ${file}`);
            }
        } catch (e) {
            console.error(`[Registry] Error parsing ${file}:`, e);
        }
    }
}

let registriesInitialized = false;

/**
 * Initializes all data registries by reading from the /data/ JSON schemas.
 * Safe to call multiple times (will only initialize once).
 */
export function initRegistries(basePath = process.cwd()) {
    if (registriesInitialized) return;

    // Check if we are in a browser environment where fs is not available
    if (typeof window !== 'undefined') {
        console.warn('[Registry] Cannot perform fs.readdirSync in browser environment.');
        return;
    }

    const dataPath = path.join(basePath, 'data');

    // Note: Due to Next.js Client/Server separation, fs.readdirSync naturally works
    // in server-side scripts (node) or API routes, but not in client components.
    loadDirectory<SocietyProfile>(path.join(dataPath, 'societies'), societyRegistry);
    loadDirectory<GovernmentProfile>(path.join(dataPath, 'governments'), governmentRegistry);
    loadDirectory<PolicyDefinition>(path.join(dataPath, 'policies'), policyRegistry);
    loadDirectory<FactionDefinition>(path.join(dataPath, 'factions'), factionRegistry);
    loadDirectory<BlocDefinition>(path.join(dataPath, 'blocs'), blocRegistry);
    loadDirectory<AmbitionDefinition>(path.join(dataPath, 'ambitions'), ambitionRegistry);

    registriesInitialized = true;
    console.log(`[Registry] Loaded ${societyRegistry.getAll().length} societies, ${governmentRegistry.getAll().length} governments, ${blocRegistry.getAll().length} blocs, ${ambitionRegistry.getAll().length} ambitions.`);
}
