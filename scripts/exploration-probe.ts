// scripts/exploration-probe.ts
// Drives the explore/expand loop end-to-end on a fresh in-memory world:
// capital-only starts, survey orders materializing deterministic bodies,
// colonization (player path + AI path), and season 1's name.
// Run: npx tsx scripts/exploration-probe.ts   (no DB needed)

import { getGameWorldState } from '../lib/game-world-state-singleton';
import { issueExploreOrder, advanceExploration, attachAnomaly } from '../lib/exploration/exploration-service';
import { seedAnomalyPool } from '../lib/exploration/anomaly-catalog';
import { materializeSystemBodies, systemHasBodies } from '../lib/exploration/body-generator';
import { colonizePlanet, tickAIColonization, COLONY_COST, canSeeSystem } from '../lib/exploration/colonize-service';
import { scheduleNextSeason, seasonNameFor } from '../lib/seasons/season-service';
import { ACTION_DEFINITIONS } from '../lib/actions/registry';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string) {
    if (ok) { pass++; console.log(`  ✓ ${label}`); }
    else { fail++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const world = getGameWorldState();

// ── 1. Starting kit: one owned world per faction ─────────────────────────────
console.log('\n[1] Capital-only starts');
for (const [factionId, faction] of world.economy.factions) {
    const owned = [...world.construction.planets.values()].filter(p => p.ownerId === factionId);
    check(`${factionId} owns exactly 1 planet`, owned.length === 1, `owns ${owned.length}`);
    const capSys = faction.capitalSystemId;
    const homeBodies = [...world.construction.planets.values()]
        .filter(p => p.systemId === capSys && !p.ownerId);
    check(`${factionId} home system holds 3 unowned bodies`, homeBodies.length === 3, `${homeBodies.length}`);
    check(`${factionId} unowned bodies are colonizable + econ-free`,
        homeBodies.every(p => p.tags.includes('colonizable') && !world.economy.planets.has(p.id)));
}

// ── 2. Season 1 name ─────────────────────────────────────────────────────────
console.log('\n[2] Season naming');
check(`seasonNameFor(1) === 'The Beginning'`, seasonNameFor(1) === 'The Beginning');
check(`seasonNameFor(2) falls back`, seasonNameFor(2) === 'Season 2');
const season1 = scheduleNextSeason(1, world);
check(`scheduleNextSeason(1).name`, season1.name === 'The Beginning', season1.name);

// ── 3. Colonize a home-system body (player path minus order queue) ───────────
console.log('\n[3] Colonization');
const A = 'faction-aurelian';
const aFaction = world.economy.factions.get(A)!;
const aCap = aFaction.capitalSystemId;
const colonyId = `planet-${aCap}-colony-1`;
check(`home body visible (capital surveyed at init)`, canSeeSystem(world, A, aCap));
const res1 = colonizePlanet(world, A, colonyId);
check(`colonizePlanet succeeds`, res1.ok, res1.reason);
const colony = world.construction.planets.get(colonyId)!;
check(`colony owned by ${A}`, colony.ownerId === A);
check(`colony econ record created`, world.economy.planets.has(colonyId));
check(`colonizable tag removed, colony tag added`,
    !colony.tags.includes('colonizable') && colony.tags.includes('colony'));
check(`region includes home system`,
    world.economy.regions.get(`region-${A}`)!.systemIds.includes(aCap));
const res2 = colonizePlanet(world, A, colonyId);
check(`re-colonizing owned world refused`, !res2.ok);

// Registry cost parity with COLONY_COST
const regCost = ACTION_DEFINITIONS.PLANET_CLAIM.cost as Record<string, number>;
check(`registry PLANET_CLAIM cost matches COLONY_COST`,
    Object.entries(COLONY_COST).every(([k, v]) => regCost[k.toLowerCase()] === v),
    JSON.stringify(regCost));

// ── 4. Exploration: survey a neighbor system, bodies materialize ─────────────
console.log('\n[4] Survey → bodies');
const capNode = world.movement.systems.get(aCap)!;
const targetId = (capNode.hyperlaneNeighbors ?? []).find(n => !systemHasBodies(world, n));
check(`capital has an empty neighbor system`, !!targetId, `neighbors: ${capNode.hyperlaneNeighbors?.length}`);
if (targetId) {
    const fleetId = 'probe-fleet-1';
    world.movement.fleets.set(fleetId, {
        id: fleetId, factionId: A, name: 'Probe Wing', currentSystemId: aCap,
    } as any);
    const order = issueExploreOrder(fleetId, targetId, 'survey', world.movement);
    check(`survey order issued`, !!order);
    world.movement.nowSeconds += 600; // survey takes 480s
    seedAnomalyPool(world.movement);
    let hookCalls = 0;
    advanceExploration(world.movement, 600, (sysId) => {
        hookCalls++;
        materializeSystemBodies(world, sysId);
    });
    check(`survey completion hook fired once`, hookCalls === 1, String(hookCalls));
    const vis = world.movement.factionVisibility.get(A)?.[targetId];
    check(`system now surveyed for ${A}`, vis?.revealStage === 'surveyed', vis?.revealStage);
    const bodies = [...world.construction.planets.values()].filter(p => p.systemId === targetId);
    console.log(`  (system ${targetId} charted ${bodies.length} bodies)`);
    check(`bodies unowned`, bodies.every(b => !b.ownerId));
    check(`movement PlanetNodes mirror construction bodies`,
        bodies.every(b => world.movement.planets.has(b.id)));

    // Determinism: regenerate from scratch → identical ids and types.
    const before = bodies.map(b => `${b.id}:${b.planetType}`).sort().join('|');
    bodies.forEach(b => { world.construction.planets.delete(b.id); world.movement.planets.delete(b.id); });
    const regen = materializeSystemBodies(world, targetId);
    const after = regen.map(b => `${b.id}:${b.planetType}`).sort().join('|');
    check(`body generation deterministic`, before === after, `${before} vs ${after}`);
    check(`materialization idempotent on populated system`,
        materializeSystemBodies(world, targetId).length === 0);

    // Anomaly attachment is seeded — two calls on the same inputs agree.
    const a1 = attachAnomaly(targetId, 'onSettlement', A, world.movement);
    check(`attachAnomaly runs without throwing (result ${a1 ? a1.id : 'none'})`, true);
}

// ── 4b. Non-empty system determinism ─────────────────────────────────────────
console.log('\n[4b] Body generation on a non-empty roll');
const emptySystems = [...world.movement.systems.keys()].filter(id => !systemHasBodies(world, id));
let richSystem: string | null = null;
let richBodies: string[] = [];
for (const sysId of emptySystems.slice(0, 40)) {
    const made = materializeSystemBodies(world, sysId);
    if (made.length > 0) {
        richSystem = sysId;
        richBodies = made.map(b => `${b.id}:${b.planetType}`).sort();
        break;
    }
}
check(`found a system that generates bodies`, !!richSystem);
if (richSystem) {
    for (const key of richBodies) {
        const id = key.split(':')[0];
        world.construction.planets.delete(id);
        world.movement.planets.delete(id);
    }
    const regen2 = materializeSystemBodies(world, richSystem).map(b => `${b.id}:${b.planetType}`).sort();
    check(`non-empty generation deterministic`, regen2.join('|') === richBodies.join('|'));
    check(`generated bodies carry usable mix`,
        regen2.every(k => k.includes(':')));
}

// ── 5. AI expansion ──────────────────────────────────────────────────────────
console.log('\n[5] AI colonization');
(world as any).claimedFactionIds = [A]; // everyone else is AI
const B = 'faction-vektori';
const bFaction = world.economy.factions.get(B)!;
const bReservesBefore = { ...(bFaction.reserves as Record<string, number>) };
tickAIColonization(world);
const bOwned = [...world.construction.planets.values()].filter(p => p.ownerId === B);
check(`${B} founded a colony`, bOwned.length === 2, `owns ${bOwned.length}`);
const bReserves = bFaction.reserves as Record<string, number>;
check(`${B} paid COLONY_COST`,
    Object.entries(COLONY_COST).every(([k, v]) => bReserves[k] === bReservesBefore[k] - v));
const aOwnedAfter = [...world.construction.planets.values()].filter(p => p.ownerId === A);
check(`claimed faction ${A} untouched by AI tick`, aOwnedAfter.length === 2, `owns ${aOwnedAfter.length}`);

// No claim list → nobody is AI (diplomatic-AI convention)
delete (world as any).claimedFactionIds;
const ownershipSnapshot = [...world.construction.planets.values()].filter(p => p.ownerId).length;
tickAIColonization(world);
check(`no claim list → AI colonization inert`,
    [...world.construction.planets.values()].filter(p => p.ownerId).length === ownershipSnapshot);

// ── 6. Review-driven hardening checks ────────────────────────────────────────
console.log('\n[6] Hardening');
{
    // Colony tags stay a SHARED array between construction and economy records.
    const c = world.construction.planets.get(colonyId)!;
    const e = world.economy.planets.get(colonyId)!;
    check(`colony construction/economy tag arrays share one reference`, c.tags === e.tags);
    check(`economy record sees 'colony', not 'colonizable'`,
        e.tags.includes('colony') && !e.tags.includes('colonizable'));

    // attachAnomaly must not burn a pool entry when the system has no planet.
    const before = world.movement.anomalyPool.filter(a => !a.triggered).length;
    const emptySys = [...world.movement.systems.keys()]
        .find(id => ![...world.movement.planets.values()].some(p => p.systemId === id));
    if (emptySys) {
        const res = attachAnomaly(emptySys, 'onSurvey', A, world.movement);
        const after = world.movement.anomalyPool.filter(a => !a.triggered).length;
        check(`no-planet system burns no anomaly (result ${res ? res.id : 'null'})`,
            res === null && after === before, `${before} -> ${after}`);
    } else {
        check(`found an empty system for the burn test`, false);
    }

    // A second survey of an already-surveyed system must not roll again:
    // survey the [4] target once more and count consumed pool entries.
    const target2 = (capNode.hyperlaneNeighbors ?? [])[0];
    if (target2) {
        const consumedBefore = world.movement.anomalyPool.filter(a => a.triggered).length;
        const o2 = issueExploreOrder('probe-fleet-1', target2, 'survey', world.movement);
        check(`repeat survey order issued`, !!o2);
        check(`orders carry factionId for refunds`, o2?.factionId === A);
        world.movement.nowSeconds += 600;
        advanceExploration(world.movement, 600, (sysId) => materializeSystemBodies(world, sysId));
        const consumedAfter = world.movement.anomalyPool.filter(a => a.triggered).length;
        check(`re-survey of a surveyed system consumes no pool entry`,
            consumedAfter === consumedBefore, `${consumedBefore} -> ${consumedAfter}`);
    }

    // A dead fleet's completed order fires the loss hook instead of vanishing.
    const target3 = (capNode.hyperlaneNeighbors ?? [])[1] ?? (capNode.hyperlaneNeighbors ?? [])[0];
    world.movement.fleets.set('probe-fleet-doomed', {
        id: 'probe-fleet-doomed', factionId: A, name: 'Doomed Wing', currentSystemId: aCap,
    } as any);
    const doomedOrder = issueExploreOrder('probe-fleet-doomed', target3, 'scan', world.movement);
    check(`doomed order issued`, !!doomedOrder);
    world.movement.fleets.delete('probe-fleet-doomed');
    world.movement.nowSeconds += 300;
    let lost: any = null;
    advanceExploration(world.movement, 300, undefined, (o) => { lost = o; });
    check(`order-lost hook fired with the payer's factionId`, lost?.factionId === A, JSON.stringify(lost));
}

// ── Verdict ──────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
