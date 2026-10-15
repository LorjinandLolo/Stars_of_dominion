// lib/economy/economy-view.ts
// What the Economy panel shows for one empire, read from a world. Pure and
// safe in the client bundle: the panel builds it from the world the browser
// already syncs (hooks/useGameSync getSyncedWorld).
//
// The old panel summed regional trade volumes that nothing writes (every
// empire read 0), printed a hard-coded "220 trade routes", and offered tariff
// and embargo buttons whose orders went out as the faction "PLAYER_FACTION"
// and were refused. This is the empire's own economy instead: what it earned
// last cycle and from where, what each world makes and lacks, and the one
// economic lever that is real (production focus, ECON_SET_FOCUS).

import type { GameWorldState } from '../game-world-state';

/** One strategic cycle: the economy ticks once per 6 sim hours (24 real minutes). */
export const ECONOMY_CYCLE_SIM_SECONDS = 6 * 3600;

/** Resources an empire can set its production focus on, with their planet-rate keys. */
export const FOCUS_OPTIONS: ReadonlyArray<{ resource: string; rateKey: string; label: string }> = [
    { resource: 'METALS', rateKey: 'metals', label: 'Metals' },
    { resource: 'CHEMICALS', rateKey: 'chemicals', label: 'Chemicals' },
    { resource: 'FOOD', rateKey: 'food', label: 'Food' },
    { resource: 'ENERGY', rateKey: 'energy', label: 'Energy' },
    { resource: 'RARES', rateKey: 'rare', label: 'Rares' },
    { resource: 'AMMO', rateKey: 'ammo', label: 'Ammo' },
];

const RATE_LABEL: Record<string, string> = {
    metals: 'Metals', chemicals: 'Chemicals', energy: 'Energy', food: 'Food', rare: 'Rares',
    ammo: 'Ammo', military: 'Military goods', research: 'Research', consumer: 'Consumer goods',
};

export interface EconomyWorldRow {
    planetId: string;
    systemId: string;
    name: string;
    isCapital: boolean;
    /** Millions. */
    population: number;
    happiness: number;
    instability: number;
    /** Credits this world's taxes paid last cycle. */
    creditsLastCycle: number;
    /** Largest outputs per cycle, biggest first. */
    topOutputs: Array<{ label: string; perCycle: number }>;
    /** Plain-language problems, worst first. */
    problems: string[];
}

export interface EconomyView {
    /** Last cycle's income by Resource key (credits, tithe goods, war goods). Null before the first tick. */
    income: Record<string, number> | null;
    reserves: Record<string, number>;
    focus: string | null;
    worlds: EconomyWorldRow[];
    /** Galactic market prices, by Resource key. */
    prices: Array<{ resource: string; price: number; basePrice: number }>;
}

function valuesOf<T>(source: any): T[] {
    if (!source) return [];
    if (typeof source.values === 'function') return Array.from(source.values());
    return Object.values(source);
}

export function buildEconomyView(world: GameWorldState, factionId: string): EconomyView {
    const faction: any = world.economy?.factions?.get?.(factionId);
    const capitalSystemId = faction?.capitalSystemId;
    const creditsByPlanet: Record<string, number> = faction?.lastIncome?.creditsByPlanet ?? {};

    const worlds: EconomyWorldRow[] = [];
    for (const planet of valuesOf<any>(world.construction?.planets)) {
        if (planet?.ownerId !== factionId) continue;
        const eco: any = world.economy?.planets?.get?.(planet.id);
        const rates: Record<string, number> = eco?.currentRates ?? {};
        const topOutputs = Object.entries(rates)
            .filter(([, r]) => (r ?? 0) > 0)
            .map(([key, r]) => ({ label: RATE_LABEL[key] ?? key, perCycle: (r as number) * ECONOMY_CYCLE_SIM_SECONDS }))
            .sort((a, b) => b.perCycle - a.perCycle)
            .slice(0, 3);

        const problems: string[] = [];
        if (eco?.blockade?.active) problems.push('Blockaded');
        if (eco?.essentialShortage) problems.push('Short of food or power');
        if (eco?.commodityScarcity) problems.push('Goods scarce');
        if (eco?.logistics?.congested) problems.push('Haulage bottleneck');
        const pressured: string[] = eco?.storage?.pressuredResources ?? [];
        if (pressured.length) problems.push(`Storage full: ${pressured.map(r => RATE_LABEL[r] ?? r).join(', ')}`);
        if ((eco?.instability ?? 0) >= 50) problems.push('Unstable');

        worlds.push({
            planetId: planet.id,
            systemId: planet.systemId,
            name: planet.name ?? planet.id,
            isCapital: planet.systemId === capitalSystemId && planet.planetType === 'capital',
            population: Math.round(planet.population ?? eco?.demographics?.population ?? 0),
            happiness: Math.round(planet.happiness ?? eco?.happiness ?? 0),
            instability: Math.round(eco?.instability ?? 0),
            creditsLastCycle: Math.round(creditsByPlanet[planet.id] ?? 0),
            topOutputs,
            problems,
        });
    }
    worlds.sort((a, b) => Number(b.isCapital) - Number(a.isCapital) || b.creditsLastCycle - a.creditsLastCycle);

    const prices: EconomyView['prices'] = [];
    for (const [key, market] of (world.economy?.markets as any)?.entries?.() ?? []) {
        if (!String(key).startsWith('galactic:')) continue;
        prices.push({ resource: (market as any).resource, price: (market as any).currentPrice, basePrice: (market as any).basePrice });
    }
    prices.sort((a, b) => a.resource.localeCompare(b.resource));

    return {
        income: faction?.lastIncome?.total ?? null,
        reserves: { ...(faction?.reserves ?? {}) },
        focus: (world.economy as any)?.policies?.get?.(factionId)?.productionFocus ?? null,
        worlds,
        prices,
    };
}
