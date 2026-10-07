// scripts/rebellion-soak.ts — one season of rebel cells (Item 13): how many form, where, how angry worlds get.
//   npx tsx scripts/rebellion-soak.ts
//
// Two AI empires (Sarrak, Kaer'Ruun) are held as police states all season: a
// reputation for oppression pinned high and martial-law unrest on their worlds.
// Two others (Leo-pantheri, Buthari) are left alone. Item 13's acceptance:
// the oppressive empires accumulate cells, the mild ones do not.
import { SEASON_TICKS, bootSoakWorld, quietConsole, seedSimulation, stepSoak } from './soak-harness';
import { ensureRebellion, grievanceOf } from '../lib/rebellion/cell-service';
const out = (s: string) => process.stdout.write(s + '\n');

const OPPRESSIVE = ['faction-sarrak', 'faction-kaerruun'];
const MILD = ['faction-leopantheri', 'faction-buthari'];
const POLICE_STATE_OPPRESSION = 80;
const MARTIAL_LAW_UNREST = 45;

function policeState(world: any): void {
    for (const id of OPPRESSIVE) {
        const rep = world.reputation?.get?.(id);
        if (rep) rep.scores.oppression = Math.max(rep.scores.oppression ?? 0, POLICE_STATE_OPPRESSION);
        for (const p of world.construction.planets.values() as Iterable<any>) {
            if (p.ownerId === id) p.unrest = Math.max(Number(p.unrest ?? 0), MARTIAL_LAW_UNREST);
        }
    }
}

async function main() {
    seedSimulation('rebel-soak');
    quietConsole();
    let world: any = bootSoakWorld({ claimed: ['faction-aurelian', 'faction-vektori'] });
    const rose = new Set<string>();
    const crackdownsBy: Record<string, number> = {};
    const seenCrackdown = new Set<string>();
    let maxActs = 0;
    for (let t = 0; t < SEASON_TICKS; t++) {
        policeState(world);
        ({ world } = await stepSoak(world, t));
        const rebellion = ensureRebellion(world);
        for (const c of rebellion.cells.values()) {
            if (c.crisisId) rose.add(`${c.id}:${c.crisisId}`);
            maxActs = Math.max(maxActs, c.actsCommitted ?? 0);
        }
        for (const cd of rebellion.crackdowns.values()) {
            const key = `${cd.planetId}:${cd.startedAtSeconds}`;
            if (seenCrackdown.has(key)) continue;
            seenCrackdown.add(key);
            crackdownsBy[cd.hostFactionId] = (crackdownsBy[cd.hostFactionId] ?? 0) + 1;
        }
        if (t % 315 === 314) {
            const cells = [...rebellion.cells.values()];
            const g = [...world.construction.planets.values()].filter((p: any) => p.ownerId).map((p: any) => grievanceOf(world, p).score);
            g.sort((a: number, b: number) => b - a);
            out(`tick ${t + 1}: ${cells.filter(c => c.status === 'active').length} active cells, ${cells.length} total; worlds ${g.length}, top grievance ${g.slice(0, 5).join(', ')}, median ${g[Math.floor(g.length / 2)]}`);
        }
    }
    const cells = [...ensureRebellion(world).cells.values()];
    const by: Record<string, number> = {};
    for (const c of cells) by[`${c.hostFactionId}:${c.status}`] = (by[`${c.hostFactionId}:${c.status}`] ?? 0) + 1;
    const sponsorships = [...(ensureRebellion(world).sponsorships?.values() ?? [])];
    out(JSON.stringify({ cells: by, crackdowns: crackdownsBy, movements: rose.size, maxActsByOneCell: maxActs, sponsorships: sponsorships.length }, null, 1));

    // What drives the angriest worlds.
    const hot = [...world.construction.planets.values()].filter((p: any) => p.ownerId)
        .map((p: any) => ({ p, g: grievanceOf(world, p) })).sort((a: any, b: any) => b.g.score - a.g.score).slice(0, 6);
    for (const { p, g } of hot as any[]) {
        out(`  ${p.name} (${p.ownerId}): grievance ${g.score}, unrest ${Math.round(p.unrest ?? 0)}, worst bloc ${g.blocName ?? "none"} at ${Math.round(((world.movement?.empirePostures?.get?.(p.ownerId)?.blocs ?? []).find((b: any) => b.id === g.blocId)?.satisfaction) ?? -1)}, oppression ${Math.round(world.reputation?.get?.(p.ownerId)?.scores?.oppression ?? 0)}`);
    }

    const count = (ids: string[]) => cells.filter(c => ids.includes(c.hostFactionId)).length;
    const oppressive = count(OPPRESSIVE);
    const mild = count(MILD);
    out(`oppressive empires: ${oppressive} cell(s); mild empires: ${mild} cell(s)`);
    const ok = oppressive > 0 && mild === 0;
    out(ok ? 'PASS — oppression breeds cells; mild rule does not.' : 'FAIL — expected cells under the police states and none under the mild empires.');
    process.exit(ok ? 0 : 1);
}
main().catch(e => { process.stderr.write(String(e?.stack ?? e) + '\n'); process.exit(1); });
