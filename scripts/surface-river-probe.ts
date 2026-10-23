// scripts/surface-river-probe.ts
// Do the rivers behave like rivers? (lib/planet-surface/generator.ts flowRivers)
// Every river runs downstream to the sea or into a lake without looping, the
// water it carries never shrinks on the way down, tributaries join, basins
// fill into lakes, wet worlds have rivers and dead ones none, and a river
// district is never a mountain, volcano or sea. Prints how many river
// districts each kind of world gets.
// Run: npx tsx scripts/surface-river-probe.ts

import { generateSurface } from '../lib/planet-surface/generator';
import type { PlanetSurface } from '../lib/planet-surface/types';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const ARCH = ['continental', 'gaia', 'jungle', 'swamp', 'oceanic', 'montane', 'frozen', 'arid', 'volcanic', 'toxic', 'arcology'] as const;
const boards: Record<string, PlanetSurface[]> = {};
for (const a of ARCH) {
    boards[a] = Array.from({ length: 80 }, (_, i) =>
        generateSurface(`planet-river-probe-${a}-${i}`, i % 6 === 0 ? 'capital' : 'standard', [i % 2 ? 'settled' : 'colonizable', `archetype:${a}`]));
}
const all = Object.values(boards).flat();

console.log('\nRiver districts per world (mean, max) and worlds with any:');
for (const a of ARCH) {
    const counts = boards[a].map(b => b.sectors.filter(s => s.river).length);
    const mean = counts.reduce((x, y) => x + y, 0) / counts.length;
    console.log(`  ${a.padEnd(12)} ${mean.toFixed(1).padStart(5)}  max ${String(Math.max(...counts)).padStart(2)}  ${counts.filter(c => c > 0).length}/${counts.length} worlds  lakes ${boards[a].reduce((s, b) => s + b.sectors.filter(x => x.lake).length, 0)}`);
}
console.log('');

let loops = 0, strandedAt: string[] = [], shrinks = 0, badGround = 0;
let tributaries = 0, lakes = 0, lakeWorldsOver = 0, deltas = 0;
for (const b of all) {
    const at = (i: number) => b.sectors[i];
    for (const s of b.sectors) {
        if (!s.river) continue;
        if (['mountains', 'volcanic', 'ocean'].includes(s.terrain)) badGround++;
        // Follow it down.
        const seen = new Set<number>([s.index]);
        let cur = s;
        for (;;) {
            const next = cur.riverTo;
            if (next === undefined || next < 0) { if (!cur.lake) strandedAt.push(`${b.planetId}#${cur.index}`); break; }
            if (seen.has(next)) { loops++; break; }
            seen.add(next);
            const nx = at(next);
            if (nx.terrain === 'ocean') { if ((cur.riverFlow ?? 0) >= 0.6) deltas++; break; }
            if (nx.river && (nx.riverFlow ?? 0) + 1e-9 < (cur.riverFlow ?? 0)) shrinks++;
            if (!nx.river) break; // a spill over high ground into the next basin
            cur = nx;
        }
        const feeders = b.sectors.filter(x => x.river && x.riverTo === s.index).length;
        if (feeders >= 2) tributaries++;
        if (s.lake) lakes++;
    }
    if (b.sectors.filter(x => x.lake).length > 2) lakeWorldsOver++;
}
check('rivers run downstream without looping', loops === 0, `${loops} loops`);
check('every river ends in the sea or a lake', strandedAt.length === 0, strandedAt.slice(0, 3).join(', '));
check('a river never carries less water downstream', shrinks === 0, `${shrinks} places`);
check('a river district is never a mountain, volcano or the sea', badGround === 0, `${badGround}`);
check('tributaries join rivers', tributaries > 40, `${tributaries} confluences`);
check('basins fill into lakes, at most two a world', lakes > 10 && lakeWorldsOver === 0, `${lakes} lakes`);
check('big rivers reach the sea (deltas)', deltas > 40, `${deltas} big mouths`);
const wet = [...boards.continental, ...boards.gaia, ...boards.jungle, ...boards.swamp];
check('wet worlds almost always have rivers', wet.filter(b => b.sectors.some(s => s.river)).length >= wet.length * 0.9,
    `${wet.filter(b => b.sectors.some(s => s.river)).length}/${wet.length}`);
check('dead and built worlds have none', [...boards.volcanic, ...boards.toxic, ...boards.arcology].every(b => !b.sectors.some(s => s.river)));
check('arid worlds have little', boards.arid.every(b => b.sectors.filter(s => s.river).length <= 6));
const same = generateSurface('planet-river-probe-continental-3', 'standard', ['settled', 'archetype:continental']);
const again = generateSurface('planet-river-probe-continental-3', 'standard', ['settled', 'archetype:continental', 'x']);
check('the same world gets the same rivers', JSON.stringify(same.sectors.map(s => [s.river, s.riverTo, s.riverFlow, s.lake]))
    === JSON.stringify(again.sectors.map(s => [s.river, s.riverTo, s.riverFlow, s.lake])));

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
