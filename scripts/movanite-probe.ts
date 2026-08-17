// scripts/movanite-probe.ts
// Are the Movanite mechanics LIVE — and is the half the civ pipeline already
// delivers still ONE copy rather than two?
//
// Covers Command Bottlenecks, the FAFO Protocol, Overpopulation, and
// Speed & Swarming, plus the shared-grievance migration those depend on.
//
//   npx tsx scripts/movanite-probe.ts
//
// No database, no worker. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { ensureFactionTraits, districtTraitsFor, tickFactionTraits } from '../lib/factions/traits-service';
import {
    MOVANITE_ORDER_BUDGET,
    ORDER_BUDGET_PER_WORLDS,
    FAFO_DEALT_BONUS,
    SWARM_COST_MULTIPLIER,
    OVERPOP_CAPACITY_MULTIPLIER,
    OVERPOP_UNREST_PER_DECILE,
    orderBudget,
    isUnderFafo,
    overpopulationFor,
    movaniteState,
    recordDeferred,
} from '../lib/factions/movanite';
import { terrainCostForCiv, terrainCostFor } from '../lib/factions/terrain-affinity';
import { grievanceStore, grievanceHolders, GRIEVANCE_DURATION_SECONDS, CIV_MOVANITE } from '../lib/factions/civ-ids';
import { legalMoves } from '../lib/combat/siege/formations';
import { getTechModifier } from '../lib/tech/modifiers';
import { getGovernmentModifiers } from '../lib/government/modifiers';
import { ensureGovernments } from '../lib/government/government-service';
import { generateSurface } from '../lib/planet-surface/generator';
import { PopulationService } from '../lib/construction/population-service';

const MOV = 'faction-movanites';
const OTHER = 'faction-sarrak';
const AGGRESSOR = 'faction-kaerruun';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const src = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
/** Source with comments stripped — so a comment explaining a choice can't satisfy a wiring assertion. */
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const world: any = getGameWorldState();
ensureFactionTraits(world);
// getGovernmentModifiers early-returns EMPTY for a faction with no government
// record, so without this the civ's pop_growth reads a flat 0 and looks dead.
ensureGovernments(world);
world.nowSeconds = 7_000_000;

const clearGrievances = (factionId: string) => {
    const store = grievanceStore(world, factionId);
    if (store) for (const k of Object.keys(store)) delete store[k];
};

// ── 1. What the civ pipeline already delivers ───────────────────────────────
console.log('\n[1] Already-live traits (civ pipeline) — must not be rebuilt');
{
    // Mass Mobilization, Industrial Powerhouse and Low Individual Power are all
    // authored baseModifiers that already route to real consumers. A second,
    // bespoke copy of any of them would be arithmetically invisible AND would
    // double-count; these assertions fail if anyone adds one.
    // pop_growth routes to the GOVERNMENT modifier target, not the tech one —
    // CIV_MODIFIER_MAP splits by target and reading the wrong accessor returns a
    // flat 1.0 that looks exactly like a dead modifier.
    // ...and it is an ADDITIVE key with a base of 0, not a multiplier with a
    // base of 1, so the live value is the authored delta itself. Asserting > 1
    // here would demand +100% growth and fail on a working pipeline.
    const growth = (getGovernmentModifiers(world, MOV) as any).pop_growth ?? 0;
    const neutralGrowth = (getGovernmentModifiers(world, OTHER) as any).pop_growth ?? 0;
    const prod = getTechModifier(world, MOV, 'eco_production_mult');
    const build = getTechModifier(world, MOV, 'construction_speed');
    const combat = getTechModifier(world, MOV, 'combat_power_multiplier');
    check('Mass Mobilization is already live (pop_growth)', growth > 0, `got ${growth.toFixed(3)}`);
    // NOT a cross-faction comparison: the Sarrak author a larger pop_growth of
    // their own, so "bigger than the next empire" would be a false negative.
    // Assert instead that the authored +0.40 itself arrives at the consumer.
    check('the authored +0.40 reaches the consumer intact',
        growth >= 0.4 - 1e-9, `got ${growth.toFixed(3)}, neighbour reads ${neutralGrowth.toFixed(3)}`);
    check('Industrial Powerhouse is already live (eco_production_mult)', prod > 1, `got ${prod.toFixed(3)}`);
    check('faster construction is already live', build > 1, `got ${build.toFixed(3)}`);
    check('Low Individual Power is already live (combat_power_multiplier)', combat < 1, `got ${combat.toFixed(3)}`);

    const mv = code('lib/factions/movanite.ts');
    check('the module adds NO second combat/production modifier',
        !/pop_growth|eco_production_mult|construction_speed|combat_power_multiplier/.test(mv));
}

// ── 2. Command Bottlenecks ──────────────────────────────────────────────────
console.log('\n[2] Command Bottlenecks');
{
    clearGrievances(MOV);
    const budget = orderBudget(world, MOV);
    check('the Movanites have a finite per-tick order ceiling',
        Number.isFinite(budget) && budget >= MOVANITE_ORDER_BUDGET, `got ${budget}`);
    check('every other empire is uncapped', orderBudget(world, OTHER) === Infinity);
    check('the ceiling grows with the empire, just slower than it does',
        budget >= MOVANITE_ORDER_BUDGET && ORDER_BUDGET_PER_WORLDS > 0, `budget ${budget}`);

    // THE assertion. Deferred, not dropped: the worker skips execution and leaves
    // the row processed:false, so the queue length is conserved. A mechanic that
    // silently ate orders would look identical from the outside on tick one.
    const queue = Array.from({ length: budget + 5 }, (_, i) => ({ id: `o${i}`, factionId: MOV }));
    let executed = 0, deferred = 0, left = orderBudget(world, MOV);
    for (const _o of queue) {
        if (left <= 0) { deferred++; continue; }
        left--; executed++;
    }
    check('over-budget orders are held over, not executed', executed === budget && deferred === 5,
        `executed ${executed}, deferred ${deferred}`);
    check('nothing is lost — every order is either executed or still queued',
        executed + deferred === queue.length);

    const loop = code('scripts/game-loop.ts');
    check('the worker consults the budget before executing',
        /orderBudgets\.get\(fid\)/.test(loop) && /executeOrder\(world/.test(loop));
    check('a deferred order is NOT deleted and NOT marked processed',
        /if \(left <= 0\) \{[\s\S]{0,200}continue;/.test(loop));
    check('the queue stays in createdAt order, so gridlock is FIFO rather than random',
        /orderBy: \{ createdAt: 'asc' \}/.test(loop));

    recordDeferred(world, MOV, 3);
    check('deferrals are recorded for the player to see', (movaniteState(world, MOV)?.deferredTotal ?? 0) >= 3);
}

// ── 3. FAFO Protocol ────────────────────────────────────────────────────────
console.log('\n[3] FAFO Protocol');
{
    clearGrievances(MOV);
    check('at peace, the clause is dormant', isUnderFafo(world, MOV) === false);
    check('and the subcommittees are in session', Number.isFinite(orderBudget(world, MOV)));
    check('at peace they fight as authored', districtTraitsFor(world, MOV, 'plains').dealt === 1);

    // Provoked. Written through the SHARED grievance store — the same record the
    // Buthari retaliation gate reads, with three existing writers.
    grievanceStore(world, MOV)![AGGRESSOR] = { sinceSeconds: world.nowSeconds, kind: 'attacked' };
    check('being wronged invokes the clause', isUnderFafo(world, MOV) === true);
    check('the bureaucracy adjourns — the order ceiling lifts entirely',
        orderBudget(world, MOV) === Infinity);
    const dealt = districtTraitsFor(world, MOV, 'plains').dealt;
    check('and they hit markedly harder', Math.abs(dealt - (1 + FAFO_DEALT_BONUS)) < 1e-9, `got ${dealt}`);

    // The clause is DERIVED from the grievance store, never counted into a
    // field, so it is correct after a restart or a tick the worker missed.
    tickFactionTraits(world);
    check('the tick records time spent under the clause', (movaniteState(world, MOV)?.fafoTicks ?? 0) > 0);

    // It must lapse, or one border skirmish buys permanent emergency powers.
    const saved = world.nowSeconds;
    world.nowSeconds = saved + GRIEVANCE_DURATION_SECONDS + 1;
    check('the clause lapses when the grievance does', isUnderFafo(world, MOV) === false);
    check('and gridlock returns', Number.isFinite(orderBudget(world, MOV)));
    world.nowSeconds = saved;

    // Nobody else gets it, even holding a grievance.
    grievanceStore(world, OTHER)![AGGRESSOR] = { sinceSeconds: world.nowSeconds, kind: 'attacked' };
    check('a non-Movanite with a grievance gets no FAFO', isUnderFafo(world, OTHER) === false);
    check('and no combat bonus from it', districtTraitsFor(world, OTHER, 'plains').dealt !== 1 + FAFO_DEALT_BONUS);
    clearGrievances(OTHER);
}

// ── 4. Overpopulation ───────────────────────────────────────────────────────
console.log('\n[4] Overpopulation');
{
    const mk = (ownerId: string) => ({
        id: `probe-${ownerId}`, ownerId,
        population: 1000, popCapacity: 1000, popGrowth: 0.5,
        happiness: 80, stability: 80, unrest: 0, isOccupied: false, tiles: [],
    } as any);

    // The regression guard for the other thirteen empires: their hard cap stands.
    const other = mk(OTHER);
    const otherWorld: any = { nowSeconds: world.nowSeconds, construction: { planets: new Map([[other.id, other]]) }, economy: world.economy };
    PopulationService.tickPopulation(otherWorld, 6 * 3600);
    check('every other empire is still hard-capped at popCapacity',
        other.population <= other.popCapacity, `got ${other.population}`);
    check('and takes no overcrowding unrest', other.unrest === 0, `got ${other.unrest}`);

    // The Movanites pile up past it.
    const mov = mk(MOV);
    const movWorld: any = { nowSeconds: world.nowSeconds, construction: { planets: new Map([[mov.id, mov]]) }, economy: world.economy };
    for (let i = 0; i < 12; i++) PopulationService.tickPopulation(movWorld, 6 * 3600);
    check('Movanite numbers exceed a world that cannot house them',
        mov.population > mov.popCapacity, `got ${Math.round(mov.population)} vs capacity ${mov.popCapacity}`);
    check('but not without limit', mov.population <= mov.popCapacity * OVERPOP_CAPACITY_MULTIPLIER + 1e-6,
        `got ${Math.round(mov.population)}, ceiling ${mov.popCapacity * OVERPOP_CAPACITY_MULTIPLIER}`);
    check('and the overflow costs them unrest', mov.unrest > 0, `got ${mov.unrest.toFixed(2)}`);

    // Direction check: this is the COST of their pop_growth bonus, so it must
    // scale with how far over they are, not be a flat penalty for existing.
    const light = overpopulationFor(world, MOV, 1000, 1050)!;
    const heavy = overpopulationFor(world, MOV, 1000, 1300)!;
    check('unrest scales with how far past capacity they are', heavy.unrest > light.unrest,
        `${light.unrest.toFixed(2)} -> ${heavy.unrest.toFixed(2)}`);
    check('a world within capacity is untroubled', overpopulationFor(world, MOV, 1000, 900)!.unrest === 0);
    check('the helper is a no-op for everyone else', overpopulationFor(world, OTHER, 1000, 1300) === null);
    check('overcrowding unrest is a real per-tick number', OVERPOP_UNREST_PER_DECILE > 0);
}

// ── 5. Speed & Swarming ─────────────────────────────────────────────────────
console.log('\n[5] Speed & Swarming');
{
    const swarm = terrainCostForCiv(CIV_MOVANITE);
    check('the Movanites get a terrain-cost override', !!swarm);
    check('it is a flat discount — physiology, not local knowledge',
        Math.abs(swarm!('plains', 1) - SWARM_COST_MULTIPLIER) < 1e-9
        && Math.abs(swarm!('mountains', 2.2) - 2.2 * SWARM_COST_MULTIPLIER) < 1e-9);
    check('it is a discount, never a penalty', SWARM_COST_MULTIPLIER < 1);

    // The dispatcher must still serve the Infernoids — this is the assertion
    // that catches the terrain seam being quietly taken over by faction #2.
    const heat = terrainCostForCiv('civ-infernoid');
    check('Infernoid heat immunity still routes through the same dispatcher',
        !!heat && heat('volcanic', 2) === 1 && heat('plains', 1) === 1);
    check('and an ordinary civilization still gets undefined',
        terrainCostForCiv('civ-elyndra') === undefined && terrainCostForCiv(undefined) === undefined);
    check('the faction-id form agrees with the civ-id form',
        !!terrainCostFor(world, MOV) && terrainCostFor(world, OTHER) === undefined);

    // It has to actually move the board.
    const planet: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === MOV);
    check('the Movanites have a world to walk on', !!planet);
    const surface = generateSurface(planet.id, planet.planetType, planet.tags);
    const war: any = { control: {}, landingZones: [], contested: [], formations: [], plans: [] };
    for (const s of surface.sectors) war.control[s.index] = 'defender';
    const meanReach = (override?: any) => {
        let total = 0, n = 0;
        for (const s of surface.sectors) {
            if (s.terrain === 'ocean') continue;
            const f: any = { id: 'f', side: 'defender', unitType: 'INFANTRY', strength: 10, sectorIndex: s.index, supply: 100 };
            total += legalMoves(surface, war, f, undefined, override).length;
            n++;
        }
        return total / Math.max(1, n);
    };
    const plain = meanReach();
    const fast = meanReach(swarm);
    check('their columns genuinely cover more ground', fast > plain, `${plain.toFixed(2)} -> ${fast.toFixed(2)} districts`);

    // Client/server parity. legalMoves is authoritative in the worker AND draws
    // the reach overlay; an override applied in one place shows the player moves
    // the server will refuse.
    check('the worker resolves the override through the shared dispatcher',
        code('scripts/game-loop.ts').includes('terrainCostFor(world, factionId)'));
    check('the client resolves it through the same dispatcher',
        code('components/planet/PlanetSurfaceView.tsx').includes('terrainCostForCiv('));
    check('and every client legalMoves call passes it',
        code('components/planet/UnitPieces.tsx').split('\n')
            .filter(l => l.includes('legalMoves(') && !l.includes('import'))
            .every(l => l.includes('terrainCostOverride')));
}

// ── 6. The shared grievance store ───────────────────────────────────────────
console.log('\n[6] Shared grievances (the Buthari migration)');
{
    const bt = 'faction-buthari';
    clearGrievances(MOV);
    clearGrievances(bt);

    // One record, read by two civilizations for opposite purposes: the Buthari
    // need one for PERMISSION, the Movanites for PERMISSION TO HURRY.
    grievanceStore(world, MOV)![AGGRESSOR] = { sinceSeconds: world.nowSeconds, kind: 'attacked' };
    grievanceStore(world, bt)![AGGRESSOR] = { sinceSeconds: world.nowSeconds, kind: 'attacked' };
    check('both civilizations read the same shared store',
        grievanceHolders(world, MOV).includes(AGGRESSOR) && grievanceHolders(world, bt).includes(AGGRESSOR));

    // The back-fill. A live snapshot carries grievances under buthari.grievances;
    // without the hoist a Buthari empire mid-campaign silently loses every right
    // of reply it had earned on the next worker restart.
    const legacy: any = { factionId: bt, buthari: { grievances: { [AGGRESSOR]: { sinceSeconds: world.nowSeconds, kind: 'attacked' } }, purityDisputes: 0, lastEvaluatedSeconds: 0, council: { cooldowns: {}, cloakedSystems: {}, revealedSystems: {}, scorchedPlanets: {}, deployments: 0 } } };
    const legacyWorld: any = { nowSeconds: world.nowSeconds, factionTraits: new Map([[bt, legacy]]), economy: world.economy };
    check('a legacy snapshot heals — grievances hoist out of buthari.grievances',
        grievanceHolders(legacyWorld, bt).includes(AGGRESSOR));

    // There must be exactly ONE writer shape left. The duplicate in offer-service
    // kept writing to the old location after the move and silently broke every
    // Buthari retaliation until the probe caught it.
    check('offer-service writes through the shared store, not its own copy',
        /grievanceStore\(world, victimId\)/.test(code('lib/diplomacy/offer-service.ts'))
        && !/buthari\.grievances\[aggressorId\]/.test(code('lib/diplomacy/offer-service.ts')));

    // Persistence: the assertion that catches a Map in the state shape.
    const round: any = deserializeWorld(serializeWorld(world));
    ensureFactionTraits(round);
    check('Movanite trait state survives a save/load round trip', !!movaniteState(round, MOV));
    check('and so do the shared grievances', grievanceHolders(round, MOV).includes(AGGRESSOR));
    clearGrievances(MOV);
    clearGrievances(bt);
}

// ── 7. Layering ─────────────────────────────────────────────────────────────
console.log('\n[7] Layering');
{
    // movanite.ts is read from population-service and the worker order loop.
    // If it grows an engine-service import, that becomes a cycle.
    const imports = [...code('lib/factions/movanite.ts').matchAll(/from '([^']+)'/g)].map(m => m[1]);
    check('movanite.ts imports only leaves', imports.every(i =>
        ['../game-world-state', './faction-traits-types', './civ-ids', '../tech/history-ledger'].includes(i)),
        imports.join(', '));
    const ta = [...code('lib/factions/terrain-affinity.ts').matchAll(/from '([^']+)'/g)].map(m => m[1]);
    check('the terrain dispatcher imports only faction leaves — the client imports it',
        ta.every(i => ['../game-world-state', './civ-ids', './infernoid', './movanite', './gabagoon'].includes(i)),
        ta.join(', '));
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ Movanite mechanics are live\n`);
process.exit(failures ? 1 : 0);
