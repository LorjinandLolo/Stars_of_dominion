// scripts/building-output-probe.ts
// npx tsx scripts/building-output-probe.ts
//
// Building output effects (data/buildings.ts: metals_output, food_output, …)
// used to feed only recalculatePlanetStats, which the production tick never
// read: a finished metal mine changed no planet's metals rate. They now feed
// planetBaseRates through lib/economy/building-output.ts as percent of the
// standard base rate, with a deposit bonus and a saturating stack.
//
// Each check runs the REAL tickProduction twice on clones of one planet's
// production state, in one booted world, with and without the building.

import { bootSoakWorld, quietConsole, stepSoak } from './soak-harness';
import { tickProduction, getFactionEconomyMods } from '../lib/economy/economy-service';
import { DEPOSIT_BONUS, SATURATION, buildingOutputPercents, rawBuildingPercents } from '../lib/economy/building-output';
import { generateSurface } from '../lib/planet-surface/generator';
import { computeSectorOccupancy } from '../lib/planet-surface/occupancy';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function main() {
    const q = quietConsole();
    let world = bootSoakWorld();
    ({ world } = await stepSoak(world, 0));
    q.restore();

    const rates = (planetId: string) => {
        const prod = structuredClone(world.economy.planets.get(planetId));
        tickProduction(prod, 3600, world, getFactionEconomyMods(world, prod.factionId));
        return prod.currentRates as Record<string, number>;
    };
    const place = (planet: any, buildingId: string, sectorIndex?: number, state = 'active') => {
        const tile = {
            tileId: `${planet.id}-probe-${planet.tiles.length}`,
            districtType: 'any', buildingId, constructionState: state,
            constructionCompleteAt: null, ...(sectorIndex !== undefined ? { sectorIndex } : {}),
        };
        planet.tiles.push(tile);
        return () => { planet.tiles.splice(planet.tiles.indexOf(tile), 1); };
    };

    const planets = [...world.construction.planets.values()].filter((p: any) => world.economy.planets.has(p.id));
    const capital: any = planets[0];

    console.log('\n1. A finished metal mine raises the metals rate');
    {
        const before = rates(capital.id).metals;
        const undo = place(capital, 'metal_mine');
        const after = rates(capital.id).metals;
        undo();
        check('metals rate goes up', after > before, `${before} -> ${after}`);
        // Mine is worth 20% of baseRates.metals (0.8/s) before grid/biosphere/tech.
        const gain = (after - before) / 0.8;
        check('by roughly a fifth of a standard world, not by orders of magnitude', gain > 0.05 && gain < 0.5, gain.toFixed(3));
    }

    console.log('\n2. Only finished buildings count');
    {
        const before = rates(capital.id).metals;
        const undo = place(capital, 'metal_mine', undefined, 'under_construction');
        const after = rates(capital.id).metals;
        undo();
        check('a mine under construction adds nothing', after === before);
    }

    console.log('\n3. Other outputs: farm, reactor, lab');
    for (const [id, key] of [['hydroponic_farm', 'food'], ['fusion_reactor', 'energy'], ['research_lab', 'research']] as const) {
        const before = rates(capital.id)[key] ?? 0;
        const undo = place(capital, id);
        const after = rates(capital.id)[key] ?? 0;
        undo();
        check(`${id} raises ${key}`, after > before, `${before} -> ${after}`);
    }

    console.log('\n4. A mine on an ore seam yields more than one beside it');
    {
        let found: { planet: any; ore: number; plain: number } | null = null;
        for (const p of planets as any[]) {
            const surface = generateSurface(p.id, p.planetType, p.tags);
            const taken = new Set(computeSectorOccupancy(p, surface).keys());
            const free = surface.sectors.filter(s => s.index !== 0 && !taken.has(s.index) && s.terrain !== 'ocean');
            const ore = free.find(s => s.deposit === 'ore');
            const plain = free.find(s => !s.deposit);
            if (ore && plain) { found = { planet: p, ore: ore.index, plain: plain.index }; break; }
        }
        check('some seeded world has a free ore sector', !!found);
        if (found) {
            const base = rawBuildingPercents(found.planet).metals ?? 0;
            let undo = place(found.planet, 'metal_mine', found.plain);
            const plainPct = (rawBuildingPercents(found.planet).metals ?? 0) - base;
            const plainRate = rates(found.planet.id).metals;
            undo();
            undo = place(found.planet, 'metal_mine', found.ore);
            const orePct = (rawBuildingPercents(found.planet).metals ?? 0) - base;
            const oreRate = rates(found.planet.id).metals;
            undo();
            check('deposit adds exactly the deposit bonus', Math.abs(orePct / plainPct - (1 + DEPOSIT_BONUS)) < 1e-9, `${plainPct} vs ${orePct}`);
            check('and the planet produces more for it', oreRate > plainRate, `${plainRate} vs ${oreRate}`);
        }
    }

    console.log('\n5. Stacking saturates');
    {
        const undos = Array.from({ length: 60 }, () => place(capital, 'heavy_industry_complex'));
        const pct = buildingOutputPercents(capital).metals ?? 0;
        const raw = rawBuildingPercents(capital).metals ?? 0;
        const many = rates(capital.id).metals;
        undos.forEach(u => u());
        const none = rates(capital.id).metals;
        check('raw stack is huge', raw > 3000, String(raw));
        check(`effective bonus stays under ${SATURATION}%`, pct < SATURATION && pct > SATURATION * 0.9, pct.toFixed(1));
        check('sixty complexes are at most a few times the base', many / none < 5, (many / none).toFixed(2));
    }

    console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
    if (failed) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
