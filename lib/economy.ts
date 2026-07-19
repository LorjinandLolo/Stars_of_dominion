import { prisma } from '@/lib/db';

/**
 * Calculates current production rate for a faction based on owned planets.
 */
export async function calculateProduction(factionId: string) {
    // Fetch owned planets
    const planets = await prisma.planet.findMany({
        where: { owner_faction_id: factionId },
        take: 100,
    });

    const rate = { economic: 0, military: 0 };

    planets.forEach((p: any) => {
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
    const faction: any = await prisma.faction.findUniqueOrThrow({ where: { id: factionId } });

    const now = new Date();
    const lastUpdated = faction.last_updated ? new Date(faction.last_updated) : now;

    const diffMs = now.getTime() - lastUpdated.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // Update at most once every 5 seconds to save writes.
    if (diffMs < 1000 * 5) {
        return { ...faction, $id: faction.id };
    }

    // Recalculate Rate (in case planets changed)
    const rate = await calculateProduction(factionId);

    // Apply Gains
    const currentRes = typeof faction.resources === 'string' ? JSON.parse(faction.resources) : faction.resources;

    const gainedEco = Math.floor(rate.economic * diffHours);
    const gainedMil = Math.floor(rate.military * diffHours);

    if (gainedEco > 0 || gainedMil > 0) {
        currentRes.economic += gainedEco;
        currentRes.military += gainedMil;

        const updated = await prisma.faction.update({
            where: { id: factionId },
            data: {
                resources: JSON.stringify(currentRes),
                last_updated: now.toISOString(),
                income_rate: JSON.stringify(rate),
            },
        });
        return { ...updated, $id: updated.id };
    } else {
        // No whole-unit gain yet: leave the timestamp alone so fractions keep
        // accumulating, but keep the displayed income_rate fresh.
        if (!faction.income_rate || faction.income_rate !== JSON.stringify(rate)) {
            await prisma.faction.update({
                where: { id: factionId },
                data: { income_rate: JSON.stringify(rate) },
            });
        }
        return { ...faction, $id: faction.id };
    }
}
