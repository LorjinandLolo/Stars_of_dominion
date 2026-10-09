// scripts/sync-delta-probe.ts
// Delta sync must rebuild EXACTLY the snapshot the worker saved — a delta that
// drifts by one key leaves a client looking at a galaxy that does not exist,
// silently, until its next full reload.
//
// Runs the real strategic tick (soak harness), takes the snapshot the worker
// would save after every tick, and for each consecutive pair (and for a long
// jump) checks that the server's delta, applied by BOTH client copies of the
// patcher — lib/persistence/tree-delta-apply.ts and the static web worker —
// reproduces the new snapshot. Also hand-built trees for the structural edge
// cases (a chunk crossing the split threshold either way, a split Map entry
// removed), and reports how many bytes a poll actually carries.
//
// Run (from the repo root):  npx tsx scripts/sync-delta-probe.ts [ticks]

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootSoakWorld, quietConsole, seedSimulation, stepSoak } from './soak-harness';
import { drainBuffer } from '../lib/narrative/chronicle';
import { cleanWorldForSave, serializeWorld, recordsToMaps } from '../lib/persistence/save-service';
import { DeltaStream, chunkTree, hashesOf, diffChunks, rawDeltaToJson, SPLIT_BYTES } from '../lib/persistence/tree-delta';
import { applyTreeDelta } from '../lib/persistence/tree-delta-apply';
import { tickConstructionGlobal } from '../lib/construction/construction-service';

const ticks = Math.max(4, Number(process.argv[2]) || 24);

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Order-independent comparison (Maps and Sets included). */
function canon(x: any): any {
    if (x instanceof Map) return { __m: [...x.entries()].map(([k, v]) => [k, canon(v)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) };
    if (x instanceof Set) return { __s: [...x].map(canon).map(v => JSON.stringify(v)).sort() };
    if (Array.isArray(x)) return x.map(canon);
    if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, canon(x[k])]));
    return x;
}
const same = (a: any, b: any) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/** The static worker, loaded as the browser loads it, with a fake `self`. */
function loadWorker() {
    const src = readFileSync(join(process.cwd(), 'public', 'workers', 'game-sync.worker.js'), 'utf8');
    const self: any = { postMessage: (m: any) => { self.last = m; } };
    new Function('self', src)(self);
    return (msg: any) => { self.last = null; self.onmessage({ data: msg }); return self.last; };
}

function deltaThroughBoth(oldJson: string, oldVersion: string, newJson: string, newVersion: string, stream: DeltaStream, worker: ReturnType<typeof loadWorker>, label: string) {
    const delta = stream.deltaFrom(oldVersion);
    if (!delta) { check(`${label}: delta available`, false); return 0; }
    const wire = rawDeltaToJson(delta);
    const parsedDelta = JSON.parse(wire);

    const viaLib = applyTreeDelta(JSON.parse(oldJson), parsedDelta);
    const expected = JSON.parse(newJson);
    check(`${label}: lib patcher rebuilds the snapshot`, same(viaLib, expected));

    worker({ id: 1, type: 'DESERIALIZE_WORLD', payload: oldJson, version: oldVersion });
    const reply = worker({ id: 2, type: 'APPLY_WORLD_DELTA', payload: { base: oldVersion, version: newVersion, delta: parsedDelta } });
    check(`${label}: worker patcher rebuilds the snapshot`, !!reply?.success && same(reply.result, recordsToMaps(expected)),
        reply?.success ? '' : reply?.error);
    return wire.length;
}

function edgeCases() {
    const worker = loadWorker();
    const big = (n: number) => 'x'.repeat(n);
    const cases: Array<[string, any, any]> = [
        ['leaf grows past the split threshold',
            { a: { small: 1 }, b: 2 },
            { a: { small: 1, pad: big(SPLIT_BYTES), more: { k: 1 } }, b: 2 }],
        ['split node shrinks back to a leaf',
            { a: { pad: big(SPLIT_BYTES), x: 1, y: 2 }, b: 2 },
            { a: { x: 1 }, b: 2 }],
        ['a split Map entry is removed without leaving a shell',
            { m: { __map__: true, data: { e1: { pad: big(SPLIT_BYTES), q: 1 }, e2: { pad: big(SPLIT_BYTES), q: 2 } } } },
            { m: { __map__: true, data: { e2: { pad: big(SPLIT_BYTES), q: 2 } } } }],
        ['a whole top-level key disappears and another appears',
            { gone: { pad: big(SPLIT_BYTES), deep: { z: 1 } }, keep: 1 },
            { keep: 1, fresh: { n: [1, 2, 3] } }],
        ['a leaf changes type (object to array)',
            { a: { k: 1 }, b: big(10) },
            { a: [1, 2], b: big(10) }],
    ];
    for (const [label, before, after] of cases) {
        const stream = new DeltaStream(4);
        stream.update('v1', JSON.stringify(before));
        stream.update('v2', JSON.stringify(after));
        deltaThroughBoth(JSON.stringify(before), 'v1', JSON.stringify(after), 'v2', stream, worker, `edge: ${label}`);
    }
    // The removed entry must not survive as `{}` (it would revive as a blank record).
    const before = cases[2][1], after = cases[2][2];
    const d = diffChunks(hashesOf(chunkTree(before)), chunkTree(after), after);
    check('edge: removal deletes the entry itself, not its children', d.del.some(p => p.join('.') === 'm.data.e1'), JSON.stringify(d.del));

    // A worker holding the wrong version refuses rather than patching.
    worker({ id: 3, type: 'DESERIALIZE_WORLD', payload: '{"a":1}', version: 'other' });
    const refused = worker({ id: 4, type: 'APPLY_WORLD_DELTA', payload: { base: 'v1', version: 'v2', delta: { set: [], del: [] } } });
    check('edge: worker refuses a delta against a version it does not hold', refused?.success === false);
}

async function main() {
    edgeCases();

    seedSimulation('delta');
    const quiet = quietConsole();
    let world = bootSoakWorld();
    world.claimedFactionIds = [];
    const snap = (w: any) => serializeWorld(cleanWorldForSave(w));

    const stream = new DeltaStream(ticks + 2);
    const worker = loadWorker();
    const versions: Array<{ v: string; json: string }> = [{ v: 'v0', json: snap(world) }];
    stream.update('v0', versions[0].json);
    const sizes: Array<{ full: number; delta: number }> = [];

    for (let i = 1; i <= ticks; i++) {
        ({ world } = await stepSoak(world, i));
        drainBuffer();
        const json = snap(world);
        const v = `v${i}`;
        stream.update(v, json);
        const prev = versions[versions.length - 1];
        quiet.restore();
        const bytes = deltaThroughBoth(prev.json, prev.v, json, v, stream, worker, `tick ${i}`);
        quietConsole();
        sizes.push({ full: json.length, delta: bytes });
        versions.push({ v, json });
    }
    quiet.restore();

    // A tab that missed many saves catches up in one delta.
    const first = versions[0], last = versions[versions.length - 1];
    const jump = deltaThroughBoth(first.json, first.v, last.json, last.v, stream, worker, `jump v0→v${ticks}`);

    const fmt = (n: number) => `${(n / 1024).toFixed(0)} KB`;
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const medFull = med(sizes.map(s => s.full)), medDelta = med(sizes.map(s => s.delta));
    console.log(`\nSnapshot ~${fmt(medFull)}; per-tick delta median ${fmt(medDelta)} (${(100 * medDelta / medFull).toFixed(1)}%), max ${fmt(Math.max(...sizes.map(s => s.delta)))}; ${ticks}-tick jump ${fmt(jump)}`);
    // A strategic tick moves every planet's stockpile, stability and
    // population, so it legitimately rewrites about half the snapshot. It fires
    // once per ~24 real minutes; the worker saves every ~30 s in between.
    check('a strategic-tick save ships under three quarters of the snapshot', medDelta < medFull * 0.75, `${(100 * medDelta / medFull).toFixed(1)}%`);

    // Between strategic ticks: what the worker's 5-second loop changes before
    // each ~30 s save (construction progress here; fleets live in shards).
    const between: number[] = [];
    let prev = last;
    for (let i = 1; i <= 8; i++) {
        world.nowSeconds += 450;   // six 75-sim-second loops per save
        tickConstructionGlobal(world, 450);
        const json = snap(world);
        const v = `b${i}`;
        stream.update(v, json);
        between.push(deltaThroughBoth(prev.json, prev.v, json, v, stream, worker, `between-ticks save ${i}`));
        prev = { v, json };
    }
    const medBetween = med(between);
    console.log(`Between strategic ticks: per-save delta median ${fmt(medBetween)} (${(100 * medBetween / medFull).toFixed(2)}%)`);
    check('a between-ticks save ships under 5% of the snapshot', medBetween < medFull * 0.05, `${(100 * medBetween / medFull).toFixed(2)}%`);

    // Only chunks collide on purpose: tick-to-tick sets are a minority of chunks.
    console.log(`Chunks per snapshot: ${chunkTree(JSON.parse(last.json)).size}`);

    // Collapse the per-tick lines to keep the report readable.
    const failed = results.filter(r => r.includes('FAIL'));
    const passedTicks = results.filter(r => r.includes('ok') && (r.includes('tick ') || r.includes('save '))).length;
    console.log(`\n${results.filter(r => !(r.includes('tick ') || r.includes('save ')) || r.includes('FAIL')).join('\n')}`);
    console.log(`  ok    ${passedTicks} per-save patch checks`);
    console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
    if (failed.length) console.log(failed.slice(0, 10).join('\n'));
    process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
