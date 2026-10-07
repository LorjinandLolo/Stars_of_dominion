// scripts/case-board-soak.ts — one season of the case board (item 12c).
// How many files open, for whom, what AI investigators do with theirs.
//   npx tsx scripts/case-board-soak.ts
import { SEASON_TICKS, bootSoakWorld, quietConsole, seedSimulation, stepSoak } from './soak-harness';
import { ensureCases } from '../lib/espionage/case-board';

const out = (s: string) => process.stdout.write(s + '\n');

async function main() {
    seedSimulation('case-soak');
    quietConsole();
    let world: any = bootSoakWorld({ claimed: ['faction-aurelian', 'faction-vektori'] });
    for (let t = 0; t < SEASON_TICKS; t++) {
        ({ world } = await stepSoak(world, t));
        if (t % 315 === 314) {
            const cases = [...ensureCases(world).values()];
            out(`tick ${t + 1}: ${cases.length} files, ${cases.filter(c => c.status === 'accused').length} accused`);
        }
    }
    const cases = [...ensureCases(world).values()];
    const byStatus: Record<string, number> = {};
    for (const c of cases) {
        const key = `${c.status}${c.verdict ? ':' + c.verdict : ''}`;
        byStatus[key] = (byStatus[key] ?? 0) + 1;
    }
    const humans = new Set(['faction-aurelian', 'faction-vektori']);
    out(JSON.stringify({
        files: cases.length,
        humanFiles: cases.filter(c => humans.has(c.ownerFactionId)).length,
        aiFiles: cases.filter(c => !humans.has(c.ownerFactionId)).length,
        byStatus,
        leads: cases.reduce((n, c) => n + (c.leadsRun ?? 0), 0),
        motives: cases.filter(c => c.motiveVerdict).map(c => c.motiveVerdict),
        accusedHumans: cases.filter(c => c.accusedFactionId && humans.has(c.accusedFactionId)).map(c => `${c.verdict}`),
        framed: cases.filter(c => c.falseFlagFactionId).length,
        kinds: cases.filter(c => humans.has(c.ownerFactionId)).reduce((m: any, c) => { m[c.kindPhrase] = (m[c.kindPhrase] ?? 0) + 1; return m; }, {}),
        sponsors: cases.filter(c => humans.has(c.ownerFactionId)).reduce((m: any, c) => { m[c.actorFactionId ?? '?'] = (m[c.actorFactionId ?? '?'] ?? 0) + 1; return m; }, {}),
        perOwner: cases.reduce((m: any, c) => { m[c.ownerFactionId] = (m[c.ownerFactionId] ?? 0) + 1; return m; }, {}),
    }, null, 1));
}
main().catch(e => { process.stderr.write(String(e?.stack ?? e) + '\n'); process.exit(1); });
