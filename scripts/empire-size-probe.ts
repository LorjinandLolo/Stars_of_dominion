// scripts/empire-size-probe.ts
// Can one empire hold many star systems with ease?
//
// The approval probe cannot see expansion (in a soak nobody colonises), so
// nothing measured what size does to an empire. This hands one claimed,
// fully delegated empire N systems at once (one settled world in each of the
// N-1 nearest free systems, plus its home), runs the real strategic tick, and
// reports what holding them costs: worlds still held, approval, legitimacy,
// cohesion, open secession crises, treasury.
//
// Run:  npx tsx scripts/empire-size-probe.ts 40          (40 systems, 240 ticks = 60 sim days)
//       npx tsx scripts/empire-size-probe.ts 10 480 b    (10 systems, 120 sim days, seed b)

import { TICK_SECONDS, bootSoakWorld, empireIds, quietConsole, seedSimulation, stepSoak } from './soak-harness';
import { distancesFromCapital } from '../lib/government/capital-distance';
import { materializeSystemBodies } from '../lib/exploration/body-generator';
import { colonizePlanet } from '../lib/exploration/colonize-service';

const targetSystems = Math.max(1, Number(process.argv[2]) || 40);
const ticks = Math.max(1, Number(process.argv[3]) || 240);
const seed = process.argv[4] ?? 'a';
/** The simulation's console stays quiet for the whole run; the report writes past it. */
const out = (line: string) => process.stdout.write(line + '\n');

function systemsOf(world: any, id: string): Set<string> {
    const out = new Set<string>();
    for (const p of world.construction.planets.values()) if (p.ownerId === id) out.add(p.systemId);
    return out;
}
function worldsOf(world: any, id: string): number {
    let n = 0;
    for (const p of world.construction.planets.values()) if (p.ownerId === id) n++;
    return n;
}

async function main(): Promise<void> {
    seedSimulation(seed);
    const quiet = quietConsole();
    let world: any;
    let F = '';
    let granted = 0;
    let maxHops = 0;
    try {
        const probeWorld = bootSoakWorld();
        F = empireIds(probeWorld)[0];
        world = bootSoakWorld({ claimed: [F] });

        // Nearest free systems by lane hops, one settled world in each.
        const { distances } = distancesFromCapital(world, F);
        const held = systemsOf(world, F);
        const byDistance = [...distances.entries()].sort((a, b) => a[1] - b[1]);
        const vis = world.movement.factionVisibility.get(F) ?? {};
        world.movement.factionVisibility.set(F, vis);
        for (const [systemId, hops] of byDistance) {
            if (held.size >= targetSystems) break;
            if (held.has(systemId)) continue;
            const system = world.movement.systems.get(systemId);
            if (system?.ownerFactionId) continue;
            materializeSystemBodies(world, systemId);
            const planet = [...world.construction.planets.values()].find((p: any) =>
                p.systemId === systemId && !p.ownerId && !p.tags?.includes('dead_matter'));
            if (!planet) continue;
            vis[systemId] = { ...(vis[systemId] ?? {}), revealStage: 'surveyed' };
            if (colonizePlanet(world, F, planet.id).ok) {
                held.add(systemId);
                granted++;
                maxHops = Math.max(maxHops, hops);
            }
        }
    } catch (e) {
        quiet.restore();
        throw e;
    }

    out(`Empire ${F}: ${systemsOf(world, F).size} systems (${granted} granted, farthest ${maxHops} lane hops), ${worldsOf(world, F)} worlds. Seed ${seed}, ${ticks} ticks (${(ticks * TICK_SECONDS / 86400).toFixed(0)} sim days).`);
    out('  day  systems  worlds  approval  legit  cohesion  secession       credits');

    const report = (tick: number) => {
        const gov = world.government.get(F);
        let crises = 0;
        let lost = 0;
        for (const c of (world.secessionCrises?.values?.() ?? []) as any[]) {
            if (c?.factionId !== F) continue;
            if (c.rebelFactionId) lost++; else if (!c.resolvedAtSeconds) crises++;
        }
        const credits = Math.round(world.economy.factions.get(F)?.reserves?.CREDITS ?? 0);
        out(`  ${String(Math.round(tick * TICK_SECONDS / 86400)).padStart(3)}  ${String(systemsOf(world, F).size).padStart(7)}  ${String(worldsOf(world, F)).padStart(6)}  ${String(Math.round(gov?.approval ?? 0)).padStart(8)}  ${String(Math.round(gov?.legitimacy ?? 0)).padStart(5)}  ${String(Math.round(gov?.cohesion ?? 0)).padStart(8)}  ${`${crises} open/${lost} lost`.padStart(9)}  ${credits.toLocaleString().padStart(9)}`);
    };

    report(0);
    try {
        for (let t = 1; t <= ticks; t++) {
            world = (await stepSoak(world, t)).world;
            if (t % 40 === 0 || t === ticks) report(t);
        }
    } finally {
        quiet.restore();
    }
    const complaints = [...quiet.complaints.entries()].sort((a: any, b: any) => b[1] - a[1]).slice(0, 5);
    for (const [line, n] of complaints) out(`  error x${n}: ${String(line).slice(0, 140)}`);
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
