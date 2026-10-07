// scripts/rebellion-soak.ts — one season of rebel cells (Item 13): how many form, where, how angry worlds get.
//   npx tsx scripts/rebellion-soak.ts
import { SEASON_TICKS, bootSoakWorld, quietConsole, seedSimulation, stepSoak } from './soak-harness';
import { ensureRebellion, grievanceOf } from '../lib/rebellion/cell-service';
const out = (s: string) => process.stdout.write(s + '\n');
async function main() {
    seedSimulation('rebel-soak');
    quietConsole();
    let world: any = bootSoakWorld({ claimed: ['faction-aurelian', 'faction-vektori'] });
    for (let t = 0; t < SEASON_TICKS; t++) {
        ({ world } = await stepSoak(world, t));
        if (t % 315 === 314) {
            const cells = [...ensureRebellion(world).cells.values()];
            const g = [...world.construction.planets.values()].filter((p: any) => p.ownerId).map((p: any) => grievanceOf(world, p).score);
            g.sort((a: number, b: number) => b - a);
            out(`tick ${t + 1}: ${cells.filter(c => c.status === 'active').length} active cells, ${cells.length} total; worlds ${g.length}, top grievance ${g.slice(0, 5).join(', ')}, median ${g[Math.floor(g.length / 2)]}`);
        }
    }
    const cells = [...ensureRebellion(world).cells.values()];
    const by: Record<string, number> = {};
    for (const c of cells) by[`${c.hostFactionId}:${c.status}`] = (by[`${c.hostFactionId}:${c.status}`] ?? 0) + 1;
    out(JSON.stringify(by, null, 1));
}
main().catch(e => { process.stderr.write(String(e?.stack ?? e) + '\n'); process.exit(1); });
