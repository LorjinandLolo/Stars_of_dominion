import { getServerClients } from '@/lib/appwrite';
import { Query } from 'node-appwrite';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_FACTIONS = 'factions';
const COLL_PLANETS = 'planets';

/**
 * Calculates current production rate for a faction based on owned planets.
 */
export async function calculateProduction(factionId: string) {
    const { db } = await getServerClients();

    // Fetch owned planets
    const planets = await db.listDocuments(DB_ID, COLL_PLANETS, [
        Query.equal('owner_faction_id', factionId),
        Query.limit(100)
    ]);

    const rate = { economic: 0, military: 0 };

    planets.documents.forEach((p: any) => {
        let yieldData = { economic: 10, military: 2 }; // Defaults
        if (p.resource_yield) {
            try {
                const parsed = typeof p.resource_yield === 'string' ? JSON.parse(p.resource_yield) : p.resource_yield;
                yieldData = { ...yieldData, ...parsed };
            } catch (e) {
                // Ignore parse error
            }
        }
        rate.economic += yieldData.economic;
        rate.military += yieldData.military;
    });

    // Base Income (Capital)
    rate.economic += 50;
    rate.military += 10;

    return rate;
}

/**
 * Lazy Evaluation: Updates the faction's resources based on time elapsed.
 * Should be called whenever state is fetched.
 */
export async function updateEconomy(factionId: string) {
    const { db } = await getServerClients();

    const faction: any = await db.getDocument(DB_ID, COLL_FACTIONS, factionId);

    const now = new Date();
    const lastUpdated = faction.last_updated ? new Date(faction.last_updated) : now;

    // Calculate delta in Hours
    // Prevent huge jumps if first run (cap at 0 if no previous date, or just immediate sync)
    // If no last_updated, treat as "Just Now" effectively starting the clock.
    const diffMs = now.getTime() - lastUpdated.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // Rate limits: Update at most once every 10 seconds to save writes?
    // Client polling is slow anyway.
    if (diffMs < 1000 * 5) {
        return faction; // Too soon, saving writes
    }

    // Recalculate Rate (in case planets changed)
    // Optimization: Cache rate in DB and only update if dirty? 
    // For MVP, recalc every time is fine for low traffic.
    const rate = await calculateProduction(factionId);

    // Apply Gains
    const currentRes = typeof faction.resources === 'string' ? JSON.parse(faction.resources) : faction.resources;

    const gainedEco = Math.floor(rate.economic * diffHours);
    const gainedMil = Math.floor(rate.military * diffHours);

    if (gainedEco > 0 || gainedMil > 0) {
        currentRes.economic += gainedEco;
        currentRes.military += gainedMil;

        const updateData = {
            resources: JSON.stringify(currentRes),
            last_updated: now.toISOString(),
            income_rate: JSON.stringify(rate)
        };

        const updated = await db.updateDocument(DB_ID, COLL_FACTIONS, factionId, updateData);
        return updated;
    } else {
        // Just update timestamp if time passed but no gain (fractional)? 
        // Or update timestamp to "now" to reset the clock so we don't accumulate indefinitely small fractions?
        // Actually, if we reset clock without adding, we lose the fraction.
        // Better: Only update timestamp if we added resources? 
        // ISSUE: If we don't update timestamp, we keep accumulating until we have enough for 1 unit.
        // So correct behavior is: ONLY update DB if we actually add resources.
        // BUT: We should also update 'income_rate' display if it changed.

        // Let's just update timestamp/rate for display purposes if rate changed?
        // Simpler: Just return current without write if no gain.
        // Valid approach: We want 'income_rate' to be up to date for UI.

        // Force update to save the 'income_rate' for UI even if no resources gained yet
        if (!faction.income_rate || faction.income_rate !== JSON.stringify(rate)) {
            await db.updateDocument(DB_ID, COLL_FACTIONS, factionId, {
                income_rate: JSON.stringify(rate)
            });
        }

        return faction;
    }
}
