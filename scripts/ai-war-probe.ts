// scripts/ai-war-probe.ts
// Do AI empires actually go to war — and finish what they start?
//
// The strategic tick runs through the soak harness. Between ticks this probe
// does what the worker's 5-second loop does for a war: AI invasion orders
// through the REAL MIL_INVASION_PLANET handler (executeOrder, imported from
// the worker — its main loop only starts when run as the worker), fleet
// combat, and siege resolution. Four empires are claimed and left idle, the
// way friends' seats sit between sessions, so the human protections are
// exercised too.
//
// Run:  npx tsx scripts/ai-war-probe.ts [ticks] [seed]     (default 480 ticks = 120 sim days)

import { bootSoakWorld, empireIds, quietConsole, seedSimulation, stepSoak, TICK_SECONDS, recalculateSystemControl } from './soak-harness';
import { drainBuffer } from '../lib/narrative/chronicle';
import { executeOrder, processSieges } from './game-loop';
import { processSectorCombats } from '../lib/combat/combat-manager';
import { advanceFleet } from '../lib/movement/movement-service';
import { aiInvasionOrders, aiCommandGroundWars, aiFleetTactics, isWarfleetId, seasonAgeSeconds, WAR, warCandidates } from '../lib/ai/war-ai';
import { isAtWar } from '../lib/diplomacy/offer-service';
import { colonizePlanet } from '../lib/exploration/colonize-service';
import { factionFleetPower } from '../lib/diplomacy/gambit-service';
import { StrategicAIService } from '../lib/ai/strategic-ai-service';
import { pacing } from '../lib/combat/siege/siege-pacing';
import { RecruitmentService } from '../lib/combat/recruitment-service';
import { drainAIOrders } from '../lib/ai/ai-orders';
import { orderBudget } from '../lib/factions/movanite';

// This harness runs LOOPS siege ticks per 6-sim-hour strategic tick, so at
// the live 60-tick cycle a cycle would be 15 sim hours here (vs 75 sim
// minutes in the worker) and WAR's day-based cadences would stop meaning what
// they mean live. Run sieges at the old 4-tick cycle so the sim-time ratios
// this probe was tuned against are unchanged.
pacing.cycleLengthTicks = 4;

const ticks = Math.max(8, Number(process.argv[2]) || 480);
const seed = process.argv[3] ?? 'war';
const HUMAN_SEATS = 4;
/** Worker loops simulated per strategic tick (the real worker runs ~288). */
const LOOPS = 24;
const DAY = 86400;

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    seedSimulation(seed);
    const quiet = quietConsole(line => line.startsWith('[War AI]'));
    let world = bootSoakWorld();
    const ids = empireIds(world);
    const humans = ids.slice(0, HUMAN_SEATS);
    world.claimedFactionIds = [...humans];

    // Players who play: each human seat founds one colony next door, the way
    // an active player expands in week one. (Idle seats that never leave their
    // capital are never prey — see WAR.preyMinWorlds.)
    const colonies: string[] = [];
    for (const h of humans) {
        const capital = (world.economy.factions.get(h) as any)?.capitalSystemId;
        const nearby = [capital, ...(world.movement.systems.get(capital)?.hyperlaneNeighbors ?? [])];
        for (const sysId of nearby) {
            const planet: any = [...world.construction.planets.values()].find((p: any) => p.systemId === sysId
                && (!p.ownerId || p.ownerId === 'faction-neutral') && !p.tags?.includes('dead_matter'));
            if (!planet) continue;
            const vis = world.movement.factionVisibility.get(h) ?? {};
            vis[sysId] = { ...(vis[sysId] ?? {}), revealStage: 'surveyed' };
            world.movement.factionVisibility.set(h, vis);
            if (colonizePlanet(world, h, planet.id).ok) { colonies.push(`${h}:${planet.id}`); break; }
        }
    }

    const declarations: Array<{ day: number; by: string; on: string }> = [];
    const captures: Array<{ day: number; by: string; from: string; planet: string; lastWorld: boolean; motive?: string }> = [];
    let invasionOrders = 0;
    const siegeEnds: string[] = [];
    let maxWarfleets = 0;
    let peakRivalry = 0;
    const startOwners = new Map<string, string>();
    // Fleets a recruitment job has ever targeted: every AI battle group and
    // picket must be among them (built through MIL_BUILD_FLEET, not conjured).
    const fleetsAtBoot = new Set([...world.movement.fleets.keys()]);
    const recruited = new Set<string>();
    const aiWarships = new Set<string>();
    // Fleet tactics the AI queued over the run (aiFleetTactics), by kind.
    const tacticCounts: Record<string, number> = {};

    for (let i = 1; i <= ticks; i++) {
        // ── The worker's inner loop, between strategic ticks ─────────────────
        const base = world.nowSeconds;
        const step = TICK_SECONDS / LOOPS;
        for (let l = 1; l <= LOOPS; l++) {
            world.nowSeconds = base + step * l - TICK_SECONDS / LOOPS;
            for (const [id, f] of world.movement.fleets as Map<string, any>) {
                if (f.destinationSystemId) world.movement.fleets.set(id, advanceFleet(f, step, world.movement));
            }
            processSectorCombats(world);
            const owners = new Map<string, string>();
            for (const p of world.construction.planets.values() as Iterable<any>) owners.set(p.id, p.ownerId);
            for (const order of aiInvasionOrders(world)) {
                invasionOrders++;
                executeOrder(world, 'MIL_INVASION_PLANET', order.payload, order.factionId);
            }
            aiCommandGroundWars(world);
            const tactics = aiFleetTactics(world);
            for (const [k, list] of Object.entries(tactics)) tacticCounts[k] = (tacticCounts[k] ?? 0) + list.length;
            // As the worker: queued AI orders, then the yards lay their hulls
            // (AI battle groups are built through MIL_BUILD_FLEET now).
            drainAIOrders(world, executeOrder, orderBudget);
            for (const j of (world.combat?.recruitmentJobs ?? []) as any[]) if (j.targetFormationId) recruited.add(j.targetFormationId);
            RecruitmentService.tick(world);
            const sieges = new Map<string, any>();
            for (const p of world.construction.planets.values() as Iterable<any>) if (p.siege) sieges.set(p.id, p.siege);
            processSieges(world);
            for (const [pid, sg] of sieges) {
                const p: any = world.construction.planets.get(pid);
                if (p?.siege) continue;
                const troops = (st: any) => Object.values(st?.unitComposition ?? {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
                siegeEnds.push(`day ${(seasonAgeSeconds(world) / DAY).toFixed(1)} ${pid}: ${sg.attackerEmpireId} vs ${sg.defenderEmpireId} → ${sg.endReason ?? '?'} (winner ${sg.winner ?? '-'}, ${sg.cycleCount} cycles, troops att ${troops(sg.attackerState)} def ${troops(sg.defenderState)})`);
            }
            recalculateSystemControl(world);
            for (const p of world.construction.planets.values() as Iterable<any>) {
                const was = owners.get(p.id);
                if (was && p.ownerId !== was && ids.includes(was) && ids.includes(p.ownerId) && !humans.includes(p.ownerId)) {
                    const left = [...world.construction.planets.values()].filter((q: any) => q.ownerId === was).length;
                    const motive = (world as any).aiWar?.factions?.[p.ownerId]?.motive?.[was];
                    captures.push({ day: seasonAgeSeconds(world) / DAY, by: p.ownerId, from: was, planet: p.id, lastWorld: left === 0, motive });
                }
            }
        }
        world.nowSeconds = base;

        // ── The strategic tick ───────────────────────────────────────────────
        const atWarBefore = new Set<string>();
        for (const a of ids) for (const b of ids) if (a < b && isAtWar(world, a, b)) atWarBefore.add(`${a}|${b}`);
        ({ world } = await stepSoak(world, i));
        drainBuffer();
        for (const a of ids) for (const b of ids) {
            if (a < b && isAtWar(world, a, b) && !atWarBefore.has(`${a}|${b}`)) {
                const rec = (world as any).aiWar?.factions ?? {};
                const by = rec[a]?.declared?.[b] === world.nowSeconds ? a : rec[b]?.declared?.[a] === world.nowSeconds ? b : '(other)';
                declarations.push({ day: seasonAgeSeconds(world) / DAY, by, on: by === a ? b : a });
            }
        }
        for (const j of (world.combat?.recruitmentJobs ?? []) as any[]) if (j.targetFormationId) recruited.add(j.targetFormationId);
        for (const f of world.movement.fleets.values() as Iterable<any>) {
            if (!fleetsAtBoot.has(f.id) && !humans.includes(f.factionId) && (isWarfleetId(f.id) || /-trap-d+$/.test(f.id))) aiWarships.add(f.id);
        }
        for (const id of ids) {
            const n = [...world.movement.fleets.values()].filter((f: any) => f.factionId === id && isWarfleetId(f.id)).length;
            maxWarfleets = Math.max(maxWarfleets, n);
        }
        for (const r of world.rivalries.values() as Iterable<any>) {
            if ((r.escalationLevel ?? 0) < 7) peakRivalry = Math.max(peakRivalry, r.rivalryScore ?? 0);
        }
        if (i === 1) for (const p of world.construction.planets.values() as Iterable<any>) startOwners.set(p.id, p.ownerId);
    }
    quiet.restore();

    const simDays = ticks / 4;
    console.log(`\nAI war — ${ticks} ticks (${simDays} sim days), seed ${seed}, humans idle: ${humans.join(', ')}`);
    console.log(`Human seats hold a colony each: ${colonies.join(', ') || 'none founded'}`);
    console.log(`Peak non-war rivalry ${peakRivalry.toFixed(0)}; most warfleets one AI held: ${maxWarfleets}; invasion volleys: ${invasionOrders}`);
    console.log(`Fleet tactics queued: ${Object.entries(tacticCounts).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`);
    console.log('Declarations:');
    for (const d of declarations) console.log(`  day ${d.day.toFixed(1).padStart(6)}  ${d.by} → ${d.on}`);
    console.log('Sieges that ended:');
    for (const line of siegeEnds.slice(0, 15)) console.log(`  ${line}`);
    for (const p of world.construction.planets.values() as Iterable<any>) {
        if (p.siege) console.log(`  still under siege: ${p.id} by ${p.siege.attackerEmpireId}, ${p.siege.cycleCount} cycles, phase ${p.siege.phase}`);
    }
    console.log('Worlds taken by AI empires:');
    for (const c of captures) console.log(`  day ${c.day.toFixed(1).padStart(6)}  ${c.by} took ${c.planet} from ${c.from}${c.lastWorld ? ' (their LAST world)' : ''} [${c.motive ?? 'war declared on it'}]`);
    const aiIds = ids.filter(id => !humans.includes(id));
    console.log('Why not (each AI: stance, own power, three worst rivalries with target power and reach):');
    for (const id of aiIds) {
        const c = warCandidates(world, id);
        const stance = StrategicAIService.assessStance(id, world as any);
        const worst = ids.filter(o => o !== id).map(o => {
            const r: any = world.rivalries.get(`rivalry-${id}-${o}`) ?? world.rivalries.get(`rivalry-${o}-${id}`);
            return { o, score: r?.rivalryScore ?? 20 };
        }).sort((a, b) => b.score - a.score).slice(0, 3);
        const posture = (world.movement.empirePostures.get(id) as any)?.current;
        console.log(`  ${id.padEnd(26)} ${stance.stance}${stance.reasons.length ? ` (${stance.reasons.join('; ')})` : ''}, ${posture}, power ${factionFleetPower(world as any, id).toFixed(0)}: `
            + worst.map(w => `${w.o} ${w.score.toFixed(0)} p${factionFleetPower(world as any, w.o).toFixed(0)}`).join(' | ')
            + (c.length ? `  ELIGIBLE → ${c.map(x => `${x.targetId}:${x.motive}`).join(', ')}` : ''));
    }

    const aiDecl = declarations.filter(d => aiIds.includes(d.by));
    check('AI empires declare war', aiDecl.length > 0, `${aiDecl.length} declaration(s)`);
    check(`nobody is declared on by the AI inside the ${WAR.graceDays}-day grace`, aiDecl.every(d => d.day >= WAR.graceDays),
        aiDecl.filter(d => d.day < WAR.graceDays).map(d => `${d.by}@${d.day.toFixed(0)}`).join(', '));
    check('AI empires raise battle groups', maxWarfleets > 0);
    const conjured = [...aiWarships].filter(id => !recruited.has(id));
    check('every AI battle group and picket came off a recruitment job', conjured.length === 0,
        conjured.length ? conjured.join(', ') : `${aiWarships.size} fleet(s)`);
    check('AI battle groups press invasions', invasionOrders > 0, `${invasionOrders} volley(s)`);
    check('AI empires take worlds by siege', captures.length > 0, `${captures.length} world(s)`);
    check(`no empire loses its last world to the AI before day ${WAR.protectLastWorldDays}`,
        captures.every(c => !c.lastWorld || c.day >= WAR.protectLastWorldDays));
    check(`AI battle groups muster ${WAR.musterDays} days before taking anything`, captures.every(c => {
        const d = aiDecl.find(x => x.by === c.by && x.on === c.from && x.day <= c.day);
        return !d || c.day - d.day >= WAR.musterDays;
    }));
    check('a war of opportunity never takes a last world', captures.every(c => !(c.lastWorld && c.motive === 'opportunity')));
    check('no AI starts more wars than maxOwnWars at once', aiIds.every(id => {
        const rec = (world as any).aiWar?.factions?.[id];
        return !rec || Object.keys(rec.declared).filter(t => isAtWar(world, id, t)).length <= WAR.maxOwnWars;
    }));
    check('the galaxy is not one endless war (some AI war ended or never more than 4 run at once)',
        aiDecl.length === 0 || ids.flatMap(a => ids.filter(b => a < b && isAtWar(world, a, b))).length <= 4);

    console.log(`\n${results.join('\n')}`);
    console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
    process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
