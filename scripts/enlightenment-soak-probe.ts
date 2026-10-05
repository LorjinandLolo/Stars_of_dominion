// scripts/enlightenment-soak-probe.ts
// Is Enlightenment winnable, and only by trying?
//
// A season of the real strategic tick (scripts/soak-harness.ts) in the shape of
// the playtest — ten empires claimed and left to their advisors, four run by
// the AI — plus a few SEEKERS: claimed empires whose player does three things,
// every strategic tick: enact the most popular policy the government can
// afford (the same enactPolicy the GOV_ENACT_POLICY order calls), order the
// Great Archive as soon as the treasury can pay, and repair it when it burns.
// That is a floor on what a real player trying for Enlightenment does, not a
// ceiling: no cabinet picks, no diplomacy, no counter-intelligence.
//
// What it checks:
//   1. nobody who is not trying ever qualifies;
//   2. at least one seeker reaches Transcendence within the season;
//   3. nobody completes absurdly early (before EARLIEST_DAY).
//
// Known gap: the soak cannot colonise (survey timers read the wall clock), so
// every empire stays at its starting worlds. The world-count condition is
// relaxed to what the soak can reach, and the run says so.
//
// Run:  npx tsx scripts/enlightenment-soak-probe.ts            (a full season)
//       npx tsx scripts/enlightenment-soak-probe.ts 600 b      (shorter, seed b)

import { SEASON_TICKS, bootSoakWorld, empireIds, quietConsole, seedSimulation, stepSoak } from './soak-harness';
import { drainBuffer } from '../lib/narrative/chronicle';
import { readEnlightenmentConditions, ARCHIVE_BUILDING_ID } from '../lib/victory/victory-service';
import { empireBuildingState, startConstruction, repairBuilding } from '../lib/construction/construction-service';
import { BUILDINGS } from '../data/buildings';
import { listPolicies, evaluatePolicy, enactPolicy } from '../lib/government/policy-service';
import config from '../lib/movement/movement-config.json';

const ticks = Math.max(1, Number(process.argv[2]) || SEASON_TICKS);
const seed = process.argv[3] ?? 'a';
const SEEKERS = (process.env.SEEKERS ?? 'faction-aurelian,faction-covenant,faction-kaerruun,faction-buthari').split(',');
const HUMAN_SEATS = 10;
/** Completing before this sim day would make the season's other 200+ days moot. */
const EARLIEST_DAY = 90;
const TICKS_PER_DAY = 4;

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Order the Great Archive the moment the treasury can pay for it, the way the
 * PLANET_CONSTRUCT_BUILDING handler does (it lives inline in the worker, so the
 * charge-then-startConstruction sequence is mirrored here, like the harness
 * mirrors fleet movement).
 */
function seekerBuildsArchive(world: any, factionId: string): boolean {
    if (empireBuildingState(world.construction.planets.values(), factionId, ARCHIVE_BUILDING_ID) !== 'none') return false;
    const def = BUILDINGS.find(b => b.id === ARCHIVE_BUILDING_ID)!;
    const planet = [...world.construction.planets.values()]
        .find((p: any) => p.ownerId === factionId && (p.infrastructureLevel ?? 1) >= def.infrastructureRequired);
    const reserves = world.economy.factions.get(factionId)?.reserves;
    if (!planet || !reserves) return false;
    const costs: Array<[number | undefined, string]> = [
        [def.cost.metals, 'METALS'], [def.cost.chemicals, 'CHEMICALS'], [def.cost.food, 'FOOD'],
        [def.cost.credits, 'CREDITS'], [def.cost.energy, 'ENERGY'], [def.cost.rares, 'RARES'],
    ];
    if (costs.some(([amt, key]) => (amt ?? 0) > 0 && (reserves[key] ?? 0) < (amt ?? 0))) return false;
    for (const [amt, key] of costs) if ((amt ?? 0) > 0) reserves[key] -= amt as number;
    const tileId = `${planet.id}-archive`;
    planet.tiles.push({ tileId, districtType: 'any', buildingId: null, constructionState: 'empty', constructionCompleteAt: null });
    return startConstruction(planet, tileId, ARCHIVE_BUILDING_ID, world.nowSeconds, world).success;
}

/** The seeker's whole strategy: the most approval for the capital it has. */
function seekerTurn(world: any, factionId: string): string | null {
    const candidates = listPolicies()
        .filter(p => (p.effects?.approval ?? 0) > 0)
        .sort((a, b) => (b.effects?.approval ?? 0) - (a.effects?.approval ?? 0));
    for (const policy of candidates) {
        if (!evaluatePolicy(world, factionId, policy.id).ok) continue;
        const result = enactPolicy(world, factionId, policy.id);
        if (result.ok) return policy.id;
    }
    return null;
}

interface Track {
    bestPassing: number;
    failing: Map<string, number>;
    phases: Set<string>;
    qualifyingDay?: number;
    transcendingDay?: number;
    completeDay?: number;
    interruptions: number;
    conditionCount?: number;
    /** Phase on the previous tick. */
    lastPhase?: string;
    resets: number;
    enacted: string[];
    archiveOrderedDay?: number;
    archiveStandingDay?: number;
    archiveBurned: number;
    /** Treasury at days 0, 100, 200, end: what an empire has to spend on the Archive. */
    treasury: string[];
    opsWhileTranscending: Record<string, number>;
    peak: { approval: number; legitimacy: number; cohesion: number };
}

async function main() {
    const th = config.victory.enlightenment.thresholds as any;
    const authoredMinWorlds = th.minWorlds;

    seedSimulation(seed);
    const quiet = quietConsole();
    let world = bootSoakWorld();
    const ids = empireIds(world);
    for (const s of SEEKERS) if (!ids.includes(s)) throw new Error(`Unknown seeker ${s}`);
    const startWorlds = Math.min(...SEEKERS.map(id =>
        [...world.construction.planets.values()].filter((p: any) => p.ownerId === id).length));
    th.minWorlds = Math.min(authoredMinWorlds, startWorlds);

    const humans = new Set([...ids.filter(id => !SEEKERS.includes(id)).slice(0, HUMAN_SEATS - SEEKERS.length), ...SEEKERS]);
    world.claimedFactionIds = [...humans];

    const tracks = new Map<string, Track>(ids.map(id => [id, {
        bestPassing: 0, failing: new Map(), phases: new Set(), interruptions: 0, resets: 0, enacted: [],
        archiveBurned: 0, opsWhileTranscending: {}, treasury: [],
        peak: { approval: 0, legitimacy: 0, cohesion: 0 },
    }]));
    const chronicleCounts: Record<string, number> = {};

    for (let i = 1; i <= ticks; i++) {
        for (const id of SEEKERS) {
            const enacted = seekerTurn(world, id);
            if (enacted) tracks.get(id)!.enacted.push(`${enacted}@d${Math.floor(i / TICKS_PER_DAY)}`);
            if (seekerBuildsArchive(world, id)) tracks.get(id)!.archiveOrderedDay = Math.floor(i / TICKS_PER_DAY);
        }
        const archiveBefore = new Map(SEEKERS.map(id => [id, empireBuildingState(world.construction.planets.values(), id, ARCHIVE_BUILDING_ID)]));
        const opsBefore = new Set<string>(world.espionage.operations.keys());
        ({ world } = await stepSoak(world, i));
        for (const row of drainBuffer().rows) {
            if (row.type.startsWith('enlightenment')) chronicleCounts[row.type] = (chronicleCounts[row.type] ?? 0) + 1;
        }

        const day = Math.floor(i / TICKS_PER_DAY);
        for (const id of SEEKERS) {
            const t = tracks.get(id)!;
            const now = empireBuildingState(world.construction.planets.values(), id, ARCHIVE_BUILDING_ID);
            if (now === 'operational' && t.archiveStandingDay === undefined) t.archiveStandingDay = day;
            if (archiveBefore.get(id) === 'operational' && now === 'ruined') t.archiveBurned++;
            // Repair whenever it is ruined — a player would.
            if (now === 'ruined') {
                for (const planet of world.construction.planets.values() as Iterable<any>) {
                    const tile = planet.ownerId === id && planet.tiles.find((x: any) => x.buildingId === ARCHIVE_BUILDING_ID && x.constructionState === 'ruined');
                    if (tile) repairBuilding(planet, tile.tileId, world.nowSeconds);
                }
            }
            if (world.victoryState?.enlightenmentProgress?.get(id)?.phase === 'transcending') {
                for (const [opId, op] of world.espionage.operations as Map<string, any>) {
                    if (opsBefore.has(opId) || op.targetFactionId !== id) continue;
                    t.opsWhileTranscending[op.definitionId] = (t.opsWhileTranscending[op.definitionId] ?? 0) + 1;
                }
            }
        }
        for (const id of ids) {
            const t = tracks.get(id)!;
            const rows = readEnlightenmentConditions(id, world);
            t.bestPassing = Math.max(t.bestPassing, rows.filter(r => r.passing).length);
            t.conditionCount = rows.length;
            if (i === 1 || i % 400 === 0 || i === ticks) {
                const r = world.economy.factions.get(id)?.reserves ?? {};
                t.treasury.push(`d${day} M${Math.round(r.METALS ?? 0)} C${Math.round(r.CHEMICALS ?? 0)} Cr${Math.round(r.CREDITS ?? 0)}`);
            }
            for (const r of rows) if (!r.passing) t.failing.set(r.id, (t.failing.get(r.id) ?? 0) + 1);
            const gov = world.government.get(id);
            if (gov) {
                t.peak.approval = Math.max(t.peak.approval, gov.approval);
                t.peak.legitimacy = Math.max(t.peak.legitimacy, gov.legitimacy);
                t.peak.cohesion = Math.max(t.peak.cohesion, gov.cohesion);
            }
            const p = world.victoryState?.enlightenmentProgress?.get(id);
            const phase = p?.phase ?? 'inactive';
            const was = t.lastPhase;
            if (phase === 'qualifying' && t.qualifyingDay === undefined) t.qualifyingDay = day;
            if (phase === 'transcending' && t.transcendingDay === undefined) t.transcendingDay = day;
            if (phase === 'complete' && t.completeDay === undefined) t.completeDay = day;
            if (was === 'qualifying' && phase === 'inactive') t.resets++;
            if (was === 'transcending' && phase !== 'transcending' && phase !== 'complete') t.interruptions++;
            t.phases.add(phase);
            t.lastPhase = phase;
        }
    }
    quiet.restore();
    th.minWorlds = authoredMinWorlds;

    console.log(`\nEnlightenment soak — ${ticks} ticks (${ticks / TICKS_PER_DAY} sim days), seed ${seed}`);
    console.log(`Seekers: ${SEEKERS.join(', ')}. World-count condition relaxed ${authoredMinWorlds} → ${Math.min(authoredMinWorlds, startWorlds)} (soak cannot colonise).\n`);
    for (const id of ids) {
        const t = tracks.get(id)!;
        const role = SEEKERS.includes(id) ? 'SEEK' : humans.has(id) ? 'idle' : 'AI  ';
        const fail = [...t.failing.entries()].sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `${k} ${Math.round(100 * v / ticks)}%`).join(', ');
        const path = [
            t.qualifyingDay !== undefined ? `qual d${t.qualifyingDay}` : '',
            t.transcendingDay !== undefined ? `trans d${t.transcendingDay}` : '',
            t.completeDay !== undefined ? `DONE d${t.completeDay}` : '',
            t.resets ? `${t.resets} resets` : '',
            t.interruptions ? `${t.interruptions} broken` : '',
            t.archiveOrderedDay !== undefined ? `archive ordered d${t.archiveOrderedDay}, standing d${t.archiveStandingDay ?? '-'}` : '',
            t.archiveBurned ? `archive burned ${t.archiveBurned}×` : '',
        ].filter(Boolean).join(' · ');
        console.log(`${role} ${id.padEnd(26)} best ${t.bestPassing}/${t.conditionCount}  peak appr ${t.peak.approval.toFixed(0)} legit ${t.peak.legitimacy.toFixed(0)} coh ${t.peak.cohesion.toFixed(0)}  ${path || '-'}`);
        console.log(`     failing: ${fail || 'nothing'}`);
        if (SEEKERS.includes(id)) console.log(`     treasury: ${t.treasury.join(' | ')}`);
        if (t.enacted.length) console.log(`     enacted: ${t.enacted.join(', ')}`);
        if (Object.keys(t.opsWhileTranscending).length) console.log(`     ops against it while transcending: ${JSON.stringify(t.opsWhileTranscending)}`);
    }
    console.log(`\nchronicle: ${JSON.stringify(chronicleCounts)}`);
    const victoryErrors = [...quiet.complaints.entries()].filter(([k]) => /victory|enlighten/i.test(k));

    const notTrying = ids.filter(id => !SEEKERS.includes(id));
    check('nobody who is not trying qualifies',
        notTrying.every(id => tracks.get(id)!.qualifyingDay === undefined),
        notTrying.filter(id => tracks.get(id)!.qualifyingDay !== undefined).join(', '));
    check('a seeker reaches Transcendence within the season',
        SEEKERS.some(id => tracks.get(id)!.transcendingDay !== undefined),
        SEEKERS.map(id => `${id}: best ${tracks.get(id)!.bestPassing}/${tracks.get(id)!.conditionCount}`).join('; '));
    const early = SEEKERS.filter(id => (tracks.get(id)!.completeDay ?? Infinity) < EARLIEST_DAY);
    check(`nobody completes before day ${EARLIEST_DAY}`, early.length === 0, early.join(', '));
    const worked = SEEKERS.filter(id => tracks.get(id)!.transcendingDay !== undefined);
    check('rival services work a transcending empire',
        worked.length === 0 || worked.some(id => Object.keys(tracks.get(id)!.opsWhileTranscending).length > 0),
        worked.map(id => `${id}: ${JSON.stringify(tracks.get(id)!.opsWhileTranscending)}`).join('; '));
    check('the victory layer never threw', victoryErrors.length === 0, victoryErrors.map(([k, n]) => `${n}× ${k}`).join('; '));

    console.log(results.join('\n'));
    console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
    process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
