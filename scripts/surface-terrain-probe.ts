// scripts/surface-terrain-probe.ts
// Planet surfaces read as geography: every archetype keeps its defining
// terrain, ice caps sit at the poles, settled worlds have a city at the heart,
// unsettled ones have none, and worlds of one archetype are not copies.
// Run: npx tsx scripts/surface-terrain-probe.ts

import { generateSurface } from '../lib/planet-surface/generator';
import { PLANET_ARCHETYPES, type PlanetArchetype, type TerrainType } from '../lib/planet-surface/types';

/** What a world of each archetype is mostly made of. A garden world is green either way. */
const DEFINING: Record<PlanetArchetype, TerrainType[]> = {
    continental: ['plains'], arid: ['desert'], oceanic: ['ocean'], frozen: ['frozen'], volcanic: ['volcanic'],
    toxic: ['toxic'], gaia: ['plains', 'forest'], montane: ['mountains'], swamp: ['jungle'], jungle: ['jungle'], arcology: ['urban'],
};
const WORLDS = 40;
let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

for (const arch of PLANET_ARCHETYPES) {
    const counts: Record<string, number> = {};
    let ice = 0, polarIce = 0, dominantHits = 0, cityHeart = 0, unsettledCities = 0;
    const mixes = new Set<string>();
    for (let k = 0; k < WORLDS; k++) {
        const settled = k % 2 === 0;
        const tags = [`archetype:${arch}`, ...(settled ? [] : ['colonizable'])];
        const s = generateSurface(`probe-${arch}-${k}`, settled ? 'capital' : 'standard', tags);
        const own: Record<string, number> = {};
        for (const sec of s.sectors) {
            counts[sec.terrain] = (counts[sec.terrain] ?? 0) + 1;
            own[sec.terrain] = (own[sec.terrain] ?? 0) + 1;
            if (sec.terrain === 'frozen') { ice++; if (Math.abs(sec.cy) > 0.45) polarIce++; }
        }
        const top = Object.entries(own).sort((a, b) => b[1] - a[1])[0][0];
        if (DEFINING[arch].includes(top as TerrainType) || (arch === 'arcology' && !settled && top === 'ruins')) dominantHits++;
        if (settled && s.sectors[0].terrain === 'urban') cityHeart++;
        if (!settled && s.sectors.some(sec => sec.terrain === 'urban')) unsettledCities++;
        mixes.add(Object.entries(own).sort().map(([t, n]) => `${t}${n}`).join(','));
    }
    const mix = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => `${t} ${Math.round(n / WORLDS)}`).join(', ');
    console.log(`\n ${arch} — ${mix}`);
    check(`${DEFINING[arch].join(' or ')} is the largest terrain on most worlds`, dominantHits >= WORLDS * 0.75, `${dominantHits}/${WORLDS}`);
    if (arch !== 'frozen' && ice > WORLDS) check('ice sits at the poles', polarIce / ice >= 0.8, `${Math.round(polarIce / ice * 100)}% polar`);
    check('every settled world has a city at its heart', cityHeart === WORLDS / 2, `${cityHeart}/${WORLDS / 2}`);
    check('no unsettled world has a city', unsettledCities === 0, `${unsettledCities}`);
    check('worlds of one archetype are not copies', mixes.size >= WORLDS * 0.9, `${mixes.size} distinct mixes`);
}

const a = generateSurface('probe-stable', 'capital', ['archetype:continental']);
const b = generateSurface('probe-stable', 'capital', ['archetype:continental'].slice());
check('\ndeterministic: same inputs, same board', a.sectors.every((s, i) => s.terrain === b.sectors[i].terrain));

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
if (failures) process.exit(1);
