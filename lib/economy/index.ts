import { prisma } from '@/lib/db';
import { calculateIncome, applyTimeDelta, EconomyPlanet, getNetIncome } from './calculations';
import { getAllActiveRoutes } from './trade';
import { getActiveCrises } from './crisis';
import { calculateTotalUpkeep, checkEconomicHealth } from './upkeep';
import { ResourceId, EconomyState, Entity } from '@/types';

/**
 * The Main Loop of the Lazy Economy.
 * Call this whenever you need to read the faction's resources.
 */
export async function updateEconomy(factionId: string): Promise<EconomyState> {
    // 1. Fetch Faction Data
    const faction: any = await prisma.faction.findUniqueOrThrow({ where: { id: factionId } });

    // Parse JSON fields
    let resources: any = { metals: 0, chemicals: 0, food: 0, happiness: 50, credits: 0 };
    let rates: Record<ResourceId, number> = { metals: 0, chemicals: 0, food: 0, happiness: 0, credits: 0 };
    let lastUpdated = new Date().toISOString();

    if (faction.resources && typeof faction.resources === 'string') {
        try { resources = JSON.parse(faction.resources); } catch (e) { }
    }

    // Legacy support
    if (resources.economic !== undefined) {
        resources = {
            credits: resources.economic || 0,
            metals: resources.military * 10 || 0,
            chemicals: resources.military * 5 || 0,
            food: 100,
            happiness: 50
        };
    }

    // Extract persisted Economic Health
    let economicHealth = resources._health || {
        stability: 100,
        deficit_counter: 0,
        status: 'solvent'
    };

    if (faction.income_rates && typeof faction.income_rates === 'string') {
        try { rates = JSON.parse(faction.income_rates); } catch (e) { }
    }

    if (faction.economy_last_updated) {
        lastUpdated = faction.economy_last_updated;
    } else {
        lastUpdated = new Date().toISOString();
    }

    // 2. Fetch Assets for Upkeep
    // Planets
    const planets = await prisma.planet.findMany({
        where: { owner_faction_id: factionId },
        take: 100,
    });
    const economyPlanets: EconomyPlanet[] = planets.map((p: any) => ({
        $id: p.id,
        name: p.name,
        type: p.type || 'terran',
        buildings: p.buildings ? JSON.parse(p.buildings) : {}
    }));

    // Armies
    const armies = await prisma.army.findMany({
        where: { faction_id: factionId },
        take: 100,
    });

    // Ships
    const ships = await prisma.ship.findMany({
        where: { faction_id: factionId },
        take: 100,
    });

    // Convert to Entities for Upkeep
    const entities: Entity[] = [
        ...armies.map(a => ({
            type: 'army',
            id: a.id,
            sectorId: '', // Not needed for upkeep
            x: 0,
            y: 0
        } as Entity)),
        ...ships.map(s => ({
            type: 'ship',
            id: s.id,
            sectorId: '',
            x: 0,
            y: 0
        } as Entity)),
        // ... (planets don't cost upkeep usually, but buildings might? If so, map planets to entities too)
    ];

    // 3. RECACLULATE RATES
    const baseRates = calculateIncome(economyPlanets);
    const routes = getAllActiveRoutes();
    const crises = getActiveCrises(factionId);
    const myPlanetIds = economyPlanets.map(p => p.$id);
    const upkeep = calculateTotalUpkeep(entities);

    // Calculate official Net Income
    const newRates = getNetIncome(baseRates, routes, crises, myPlanetIds, upkeep);

    // 4. Calculate Delta Time & Apply
    const now = new Date();
    const last = new Date(lastUpdated);
    const msElapsed = now.getTime() - last.getTime();
    const hoursElapsed = msElapsed / (1000 * 60 * 60);

    let newResources = { ...resources };

    if (msElapsed > 1000) {
        // Apply income over time
        newResources = applyTimeDelta(resources, newRates, hoursElapsed, {});

        // Check Economic Health (Bankruptcy/Stability)
        const tempState: EconomyState = {
            resources: newResources,
            income_rates: newRates,
            capacities: {},
            last_updated: now.toISOString(),
            expenses: upkeep,
            economic_health: economicHealth
        };

        const healthResult = checkEconomicHealth(tempState);
        economicHealth = healthResult.economic_health;

        // Persist health inside resources (Hack for schema limitation)
        newResources._health = economicHealth;

        // 5. Save to DB
        await prisma.faction.update({
            where: { id: factionId },
            data: {
                resources: JSON.stringify(newResources),
                income_rates: JSON.stringify(newRates),
                economy_last_updated: now.toISOString()
            }
        });
    } else {
        // Just update rates if time hasn't passed significant amount
        // But still verify health status?
        if (JSON.stringify(rates) !== JSON.stringify(newRates)) {
            await prisma.faction.update({
                where: { id: factionId },
                data: { income_rates: JSON.stringify(newRates) }
            });
        }
    }

    // Return the Full EconomyState structure
    // We filter out _health from the public resources object to keep it clean? 
    // Or just let it be there.
    return {
        ...faction,
        $id: faction.id,
        resources: newResources,
        income_rates: newRates, // Return object, not string
        economy_last_updated: now.toISOString(),
        // Extra fields for the UI
        expenses: upkeep,
        economic_health: economicHealth
    };
}
