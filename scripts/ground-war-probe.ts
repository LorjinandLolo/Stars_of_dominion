// scripts/ground-war-probe.ts
// Does the ground war on the district board actually behave like one?
//
// Two halves. The first exercises the pure battle layer directly: a formation
// ground down to BREAK_ORG falls back to friendly ground, surrenders when it
// has none, morale and stance reads change who wins, orbital fire lands on
// the pieces. The second lands a real invasion through the worker's own
// MIL_INVASION_PLANET handler on a booted soak world and checks the seams
// that were wired-but-dead: the defender's field armies fight, recruits that
// complete mid-siege reach the board, orbital support tracks what is actually
// in orbit, stances persist, reads score and clear, morale neither saturates
// nor sits still, and dug-in defenders dig in.
//
// Run:  npx tsx scripts/ground-war-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { executeOrder, processSieges } from './game-loop';
import { aiCommandGroundWars } from '../lib/ai/war-ai';
import { generateSurface } from '../lib/planet-surface/generator';
import { resolveDistrictBattle, BREAK_ORG, bombardFormations } from '../lib/combat/siege/district-battle';
import { initDistrictWar, computeFront, buildAdjacency, CAPITAL_SECTOR } from '../lib/combat/siege/district-front';
import { nextMorale } from '../lib/combat/siege/army-morale';
import { ensureLedger } from '../lib/combat/siege/prisoners';
import { canEverEnter, type Formation } from '../lib/combat/siege/formations';
import { pacing, cyclesPerRealHour, SIEGE_CYCLE_TICKS } from '../lib/combat/siege/siege-pacing';
import { BLOCKADE_GRACE_CYCLES, STARVE_SURRENDER_CYCLES } from '../lib/combat/siege/orbit-state';
import { computeStrongpoints, SAPPER_CYCLES } from '../lib/combat/siege/strongpoints';
import { processSectorCombats } from '../lib/combat/combat-manager';
import { registerActOfWar } from '../lib/diplomacy/offer-service';
import { peekNotifications } from '../lib/time/notification-hooks';

let failures = 0;
// Written straight to stdout so the worker's quietConsole cannot swallow it.
const say = (line: string) => process.stdout.write(line + '\n');
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { say(`  ok    ${label}${detail ? ` — ${detail}` : ''}`); return; }
    failures++;
    say(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const seeded = (s0 = 42) => { let s = s0; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; };
const sum = (forms: Formation[], side: string, type?: string) =>
    forms.filter(f => f.side === side && (!type || f.unitType === type)).reduce((a, f) => a + Math.max(0, f.strength), 0);
const lossCount = (l: Partial<Record<string, number>>): number => Object.values(l).reduce<number>((a, n) => a + (n ?? 0), 0);

// ── 0. Pacing ───────────────────────────────────────────────────────────────
console.log('\n[0] Pacing');
check('one cycle is five real minutes: twelve cycles an hour', cyclesPerRealHour() === 12 && SIEGE_CYCLE_TICKS === 60,
    `${cyclesPerRealHour()} cycles/h`);
// Every assertion below is in cycles, so run them at the old 4-tick cycle
// (fifteen times fewer ticks). The engine scales per-tick bombardment by the
// cycle length, so per-cycle numbers are identical.
pacing.cycleLengthTicks = 4;

// ── 1. The battle layer ─────────────────────────────────────────────────────
console.log('\n[1] District battle: breaking, retreat, surrender');
{
    const surface = generateSurface('probe-ground', 'standard', []);
    const war = initDistrictWar(surface, 2, null);
    const front = computeFront(surface, war);
    const idx = front[0];
    const adjacency = buildAdjacency(surface);
    const stances: any = { attacker: 'AGGRESSIVE_ASSAULT', defender: 'DEFENSIVE_HOLD' };
    const morale = { attacker: 80, defender: 80 };
    const entrenchBefore = war.entrenchment[idx];

    // A defender one cycle from breaking, with friendly ground behind it.
    {
        const forms: Formation[] = [
            { id: 'a1', side: 'attacker', unitType: 'INFANTRY', strength: 500, maxStrength: 500, sectorIndex: idx, supply: 100, organization: 100 },
            { id: 'd1', side: 'defender', unitType: 'INFANTRY', strength: 400, maxStrength: 400, sectorIndex: idx, supply: 100, organization: BREAK_ORG + 4 },
        ];
        const w = { ...war, control: { ...war.control }, entrenchment: { ...war.entrenchment }, formations: forms };
        const res = resolveDistrictBattle(surface, w as any, forms, idx, stances, morale, seeded())!;
        const d1 = forms.find(f => f.id === 'd1')!;
        check('the broken defender falls back instead of dying where it stands',
            res.retreatedBySide.defender === 1 && d1.strength > 0 && d1.sectorIndex !== idx,
            `now in district ${d1.sectorIndex}, ${d1.strength} men`);
        check('it fell back onto its own ground', (w.control as any)[d1.sectorIndex] === undefined);
        check('the attacker takes the district it was pushed off', res.captured && res.holder === 'attacker');
        check('the captured district keeps only a fraction of its entrenchment',
            (w.entrenchment as any)[idx] < entrenchBefore * 0.5, `${entrenchBefore} → ${(w.entrenchment as any)[idx]}`);
        check('the attacker is still organised enough to keep going', (forms[0].organization ?? 0) > BREAK_ORG);
    }

    // The same defender with every neighbour in enemy hands.
    {
        const forms: Formation[] = [
            { id: 'a1', side: 'attacker', unitType: 'INFANTRY', strength: 500, maxStrength: 500, sectorIndex: idx, supply: 100, organization: 100 },
            { id: 'd1', side: 'defender', unitType: 'INFANTRY', strength: 400, maxStrength: 400, sectorIndex: idx, supply: 100, organization: BREAK_ORG + 4 },
        ];
        const control: any = { ...war.control };
        for (const n of adjacency[idx]) control[n] = 'attacker';
        const w = { ...war, control, entrenchment: { ...war.entrenchment }, formations: forms };
        const res = resolveDistrictBattle(surface, w as any, forms, idx, stances, morale, seeded())!;
        const taken = res.surrenderedBySide.defender.INFANTRY ?? 0;
        const died = res.lossesBySide.defender.INFANTRY ?? 0;
        check('cut off, the broken defender surrenders to the last man',
            taken > 0 && taken + died === 400 && forms[1].strength === 0, `${died} died, ${taken} surrendered`);
        check('the surrendered are not double-counted as casualties', lossCount(res.lossesBySide.defender) === died);
        check('the log says so', /cut off and taken/.test(res.log), res.log);
    }

    // Morale and reads move the needle.
    const fight = (m: { attacker: number; defender: number }, reads = { attacker: 1, defender: 1 }) => {
        const forms: Formation[] = [
            { id: 'a1', side: 'attacker', unitType: 'INFANTRY', strength: 1500, maxStrength: 1500, sectorIndex: idx, supply: 100, organization: 100 },
            { id: 'd1', side: 'defender', unitType: 'INFANTRY', strength: 1500, maxStrength: 1500, sectorIndex: idx, supply: 100, organization: 100 },
        ];
        const w = { ...war, control: { ...war.control }, entrenchment: { ...war.entrenchment }, formations: forms };
        const res = resolveDistrictBattle(surface, w as any, forms, idx, stances, m, seeded(),
            { attacker: 0, defender: 0 },
            { attacker: { dealt: 1, taken: 1 }, defender: { dealt: 1, taken: 1 } }, reads)!;
        return lossCount(res.lossesBySide.defender);
    };
    check('a confident army kills more than a demoralised one', fight({ attacker: 100, defender: 80 }) > fight({ attacker: 10, defender: 80 }),
        `${fight({ attacker: 100, defender: 80 })} vs ${fight({ attacker: 10, defender: 80 })}`);
    check('a correct stance read kills more than no read', fight(morale, { attacker: 1.3, defender: 1 }) > fight(morale),
        `${fight(morale, { attacker: 1.3, defender: 1 })} vs ${fight(morale)}`);

    // Orbital fire lands on the forward pieces, not the pool.
    {
        const rear = surface.sectors.find(s => s.terrain !== 'ocean' && !front.includes(s.index) && !war.landingZones.includes(s.index))!.index;
        const forms: Formation[] = [
            { id: 'a1', side: 'attacker', unitType: 'ARMOR', strength: 400, sectorIndex: war.landingZones[0], supply: 100, organization: 100 },
            { id: 'd1', side: 'defender', unitType: 'INFANTRY', strength: 1000, sectorIndex: idx, supply: 100, organization: 100 },
            { id: 'd2', side: 'defender', unitType: 'INFANTRY', strength: 1000, sectorIndex: rear, supply: 100, organization: 100 },
        ];
        const w = { ...war, entrenchment: { ...war.entrenchment }, formations: forms, contested: front };
        const before = (w.entrenchment as any)[idx];
        const hit = bombardFormations(w as any, forms, 300, front);
        check('orbital fire kills defenders on the front', (hit.losses.INFANTRY ?? 0) > 0 && forms[1].strength < 1000, `${hit.losses.INFANTRY} killed`);
        check('and leaves the rear untouched', forms[2].strength === 1000);
        check('and the invader untouched', forms[0].strength === 400);
        check('and flattens the front\'s entrenchment', (w.entrenchment as any)[idx] < before, `${before} → ${(w.entrenchment as any)[idx].toFixed(1)}`);
        check('and suppresses', (forms[1].organization ?? 100) < 100);
        const none = bombardFormations(w as any, forms, 0, front);
        check('no fleet, no fire', lossCount(none.losses) === 0 && none.districts.length === 0);
    }

    // Morale arithmetic.
    {
        const quiet = nextMorale(60, 100, { captured: 0, lost: 0, lossShare: 0, surrendered: 0, encircledShare: 0, fought: false });
        const routed = nextMorale(60, 100, { captured: 0, lost: 2, lossShare: 0.3, surrendered: 50, encircledShare: 0.5, fought: true });
        const winning = nextMorale(60, 100, { captured: 3, lost: 0, lossShare: 0.02, surrendered: 0, encircledShare: 0, fought: true });
        check('a quiet cycle recovers morale', quiet > 60, `${quiet}`);
        check('a rout costs it', routed < 60 - 20, `${routed.toFixed(1)}`);
        check('taking ground raises it', winning > 60, `${winning.toFixed(1)}`);
        check('it is bounded', nextMorale(99, 100, { captured: 9, lost: 0, lossShare: 0, surrendered: 0, encircledShare: 0, fought: false }) === 100
            && nextMorale(1, 100, { captured: 0, lost: 9, lossShare: 1, surrendered: 9, encircledShare: 1, fought: true }) === 0);
    }
}

// ── 2. A real invasion through the worker ───────────────────────────────────
console.log('\n[2] A real siege through the worker');
{
    seedSimulation('ground-war');
    const quiet = quietConsole(line => /INVASION COLLAPSED|CAPITAL DISTRICT|PLANETARY CAPTURE|ABANDONED|joins the/.test(line));
    const world: any = bootSoakWorld();
    const ids = empireIds(world);
    const A = ids[0];
    const B = ids[1];
    // A is run by the AI (it commands its own invasion); B is a human seat
    // that gives no orders, so its defenders stand and dig in.
    world.claimedFactionIds = [B];

    const planet: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === B);
    // The defender's fleets would contest the orbit; this probe is about the
    // ground, so send them away.
    for (const f of world.movement.fleets.values() as Iterable<any>) {
        if (f.factionId === B && f.currentSystemId === planet.systemId) f.currentSystemId = 'probe-elsewhere';
    }
    const template: any = [...world.movement.fleets.values()].find((f: any) => f.factionId === A);
    const fleet: any = {
        ...(template ?? { activeLayer: null, transitProgress: 0, etaSeconds: 0, plannedPath: [], orders: [], doctrine: 'balanced', postureId: 'balanced' }),
        id: 'probe-invasion-fleet', factionId: A, name: 'Probe Landing Group',
        currentSystemId: planet.systemId, destinationSystemId: null,
        strength: 1, basePower: 400, composition: { cruiser: 6 }, transportedArmyIds: ['probe-army-a'],
    };
    world.movement.fleets.set(fleet.id, fleet);
    if (!world.movement.armies) world.movement.armies = new Map();
    world.movement.armies.set('probe-army-a', {
        id: 'probe-army-a', factionId: A, name: 'Expeditionary Corps', currentPlanetId: null, currentSystemId: planet.systemId,
        transportFleetId: fleet.id, composition: { INFANTRY: 4000, ARMOR: 600, ARTILLERY: 300 }, stance: 'fortified',
        strength: 1, basePower: 100, supplyLevel: 1, morale: 100,
    });
    world.movement.armies.set('probe-army-b', {
        id: 'probe-army-b', factionId: B, name: 'Home Army', currentPlanetId: planet.id, currentSystemId: planet.systemId,
        transportFleetId: null, composition: { INFANTRY: 3000, ANTI_ARMOR: 400 }, stance: 'fortified',
        strength: 1, basePower: 100, supplyLevel: 1, morale: 100,
    });
    const garrisonBefore = Number(planet.garrison?.garrisonTroops ?? 500);

    let tries = 0;
    while (!planet.siege && tries++ < 120) {
        executeOrder(world, 'MIL_INVASION_PLANET', { fleetId: fleet.id, planetId: planet.id, systemId: planet.systemId }, A);
    }
    const siege: any = planet.siege;
    check('the invasion lands', !!siege, `${tries} volley(s) to suppress the orbit`);
    if (!siege) { quiet.restore(); process.exit(1); }
    const forms = (): Formation[] => siege.districts.formations;
    const surface = generateSurface(planet.id, planet.planetType, planet.tags);

    check('the defender\'s field army is on the board',
        sum(forms(), 'defender') >= 3400 + garrisonBefore && !world.movement.armies.has('probe-army-b'),
        `${sum(forms(), 'defender')} defenders (garrison was ${garrisonBefore})`);
    check('the landing force is what was aboard', sum(forms(), 'attacker') === 4900, `${sum(forms(), 'attacker')}`);
    check('the front exists before the first cycle', siege.districts.contested.length > 0);

    const tick = () => { aiCommandGroundWars(world); processSieges(world); world.nowSeconds += 75; };

    // Orbital support follows the fleet.
    tick();
    check('fleet in orbit → orbital support', siege.attackerState.orbitalSupportPower > 0, `${siege.attackerState.orbitalSupportPower}`);
    const frontIdx = siege.districts.contested[0];
    const trenchBefore = siege.districts.entrenchment[frontIdx];
    tick(); tick();
    check('and it flattens the front line\'s entrenchment', siege.districts.entrenchment[frontIdx] < trenchBefore,
        `${trenchBefore} → ${siege.districts.entrenchment[frontIdx].toFixed(1)}`);
    check('the HUD knows what landed', siege.bombardment && siege.bombardment.power > 0);
    fleet.currentSystemId = 'probe-elsewhere';
    tick();
    check('fleet gone → no support', siege.attackerState.orbitalSupportPower === 0 && !siege.bombardment);
    fleet.currentSystemId = planet.systemId;

    // Stances persist; reads score once and clear.
    executeOrder(world, 'MIL_SET_GROUND_TACTIC', { planetId: planet.id, tacticId: 'AGGRESSIVE_ASSAULT' }, B);
    executeOrder(world, 'MIL_SET_GROUND_PREDICTION', { planetId: planet.id, tacticId: siege.attackerState.activeAttackerTactic ?? 'DEFENSIVE_HOLD' }, B);
    const guessed = siege.defenderState.defenderPrediction;
    const cycleBefore = siege.cycleCount;
    while (siege.cycleCount === cycleBefore) tick();
    check('the defender\'s stance survives the cycle', siege.defenderState.activeDefenderTactic === 'AGGRESSIVE_ASSAULT');
    check('the read was scored', siege.reads?.defender === 'hit' || siege.reads?.defender === 'miss',
        `guessed ${guessed}, read ${siege.reads?.defender}`);
    check('and spent', siege.defenderState.defenderPrediction === undefined);

    // Recruits completing mid-siege reach the board, at the capital.
    const militiaBefore = sum(forms(), 'defender', 'MILITIA');
    planet.garrison.unitComposition.MILITIA = (planet.garrison.unitComposition.MILITIA ?? 0) + 800;
    planet.garrison.garrisonTroops += 800;
    const c2 = siege.cycleCount;
    while (siege.cycleCount === c2) tick();
    const fresh = forms().filter(f => f.side === 'defender' && f.unitType === 'MILITIA' && f.id.includes('-m-'));
    // Measured on the new pieces: the militia already on the board can be in
    // this cycle's fighting and die, which says nothing about the recruit.
    const freshMen = fresh.reduce((a, f) => a + Math.max(0, f.strength), 0);
    check('a garrison recruit completing mid-siege becomes a piece',
        freshMen >= 800 - 50 && fresh.length > 0,
        `${freshMen} fresh (militia on the board ${militiaBefore} → ${sum(forms(), 'defender', 'MILITIA')})`);
    check('and musters at the capital', fresh.every(f => f.sectorIndex === CAPITAL_SECTOR || siege.districts.control[CAPITAL_SECTOR] === 'attacker'));

    // Let the war run.
    const capitalTrenchBefore = siege.districts.entrenchment[CAPITAL_SECTOR];
    const log0 = siege.battleLog.length;
    for (let i = 0; i < 160 && planet.siege; i++) tick();
    const live: any = planet.siege;
    const log: string = (live ?? siege).battleLog.slice(log0).map((e: any) => e.message).join(' ');
    check('battles were fought', /Fighting rages|storm|retake/.test(log));
    check('formations broke and fell back rather than fighting to the last man', /fall(s)? back/.test(log));
    if (live) {
        check('morale moved and did not saturate at zero',
            (live.attackerState.morale > 0 || live.defenderState.morale > 0)
            && (live.attackerState.morale !== 100 || live.defenderState.morale !== 100),
            `attacker ${live.attackerState.morale.toFixed(0)}, defender ${live.defenderState.morale.toFixed(0)}`);
        check('HUD supply and cohesion are on the 0-100 scale',
            live.attackerState.supply <= 100 && live.attackerState.cohesion <= 100 && live.defenderState.cohesion <= 100);
        check('the pools equal the pieces',
            live.attackerState.totalLandedTroops === sum(forms(), 'attacker') && live.defenderState.garrisonTroops === sum(forms(), 'defender'));
        if (live.districts.control[CAPITAL_SECTOR] !== 'attacker') {
            check('defenders who stood still dug in', live.districts.entrenchment[CAPITAL_SECTOR] > capitalTrenchBefore,
                `${capitalTrenchBefore} → ${live.districts.entrenchment[CAPITAL_SECTOR]}`);
        }
    } else {
        check('the siege ended by capture or collapse, not by vanishing', planet.ownerId === A || sum(forms(), 'attacker') === 0,
            `owner now ${planet.ownerId}`);
    }
    const ledger = ensureLedger(world.combat);
    check('prisoners were taken', ledger.groups.length > 0, `${ledger.groups.length} group(s)`);
    quiet.restore();
    console.log(`  (after ${siege.cycleCount} cycles: attacker ${sum(forms(), 'attacker')} / defender ${sum(forms(), 'defender')} on the board, ` +
        `${live ? `${live.defenderState.occupationProgress}% held` : `siege over, owner ${planet.ownerId} (${planet.ownerId === A ? 'the invader' : 'the defender'})`})`);
}

// ── 3. Blockade and strongpoints ────────────────────────────────────────────
// A battle for a planet: the defender holds the shield, the barracks and the
// fortress; what happens on the ground follows what happens in orbit.
console.log('\n[3] Blockade and strongpoints');
{
    const world: any = bootSoakWorld();
    const ids = empireIds(world);
    const quiet = quietConsole(line => /relieve|INVASION COLLAPSED|CAPITAL DISTRICT|PLANETARY CAPTURE/.test(line));
    // One invader/defender pair for every scenario. Some civilizations refuse
    // to invade unprovoked (the Buthari need a rite broken first), so the
    // first pair whose landing actually works is kept. Each landing cleans up
    // the previous scenario's probe fleets, armies, tiles and garrison.
    let pairIndex = 2;
    let fixedPair: { A: string; B: string } | null = null;

    type Setup = {
        attackers: Record<string, number>;
        defenders: Record<string, number>;
        fleetPower: number;
        buildings: Array<'shield_generator' | 'barracks' | 'fortress'>;
    };
    const mkFleet = (id: string, factionId: string, systemId: string, power: number, armyIds: string[]) => {
        const template: any = [...world.movement.fleets.values()].find((f: any) => f.factionId === factionId);
        const fleet: any = {
            ...(template ?? { activeLayer: null, transitProgress: 0, etaSeconds: 0, plannedPath: [], orders: [], doctrine: 'balanced', postureId: 'balanced' }),
            id, factionId, name: id, currentSystemId: systemId, destinationSystemId: null, orbitingPlanetId: null,
            strength: 1, basePower: power, composition: { cruiser: Math.max(1, Math.round(power / 45)) }, transportedArmyIds: armyIds,
        };
        delete fleet.aiMission;
        world.movement.fleets.set(id, fleet);
        return fleet;
    };
    const mkArmy = (id: string, factionId: string, composition: Record<string, number>, at: { planetId: string | null; systemId: string; fleetId: string | null }) => {
        if (!world.movement.armies) world.movement.armies = new Map();
        world.movement.armies.set(id, {
            id, factionId, name: id, currentPlanetId: at.planetId, currentSystemId: at.systemId, transportFleetId: at.fleetId,
            composition: { ...composition }, stance: 'fortified', strength: 1, basePower: 100, supplyLevel: 1, morale: 100,
        });
        return world.movement.armies.get(id);
    };
    const tryLanding = (A: string, B: string, s: Setup) => {
        let planet: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === B && !p.siege);
        if (!planet) {
            // A previous scenario let the invader win; hand the world back so
            // the next scenario starts from the same place.
            planet = [...world.construction.planets.values()].find((p: any) => p.probeHomeOf === B);
            if (!planet) return null;
            planet.ownerId = B;
            planet.siege = null;
            const econ = world.economy?.planets?.get(planet.id);
            if (econ) econ.factionId = B;
        }
        planet.probeHomeOf = B;
        // Clean slate: last scenario's probe fleets, armies, tiles and garrison.
        for (const [id, f] of [...world.movement.fleets.entries()] as Array<[string, any]>) {
            if (id.startsWith('probe-')) world.movement.fleets.delete(id);
            else if (f.factionId === B && f.currentSystemId === planet.systemId) f.currentSystemId = 'probe-elsewhere';
        }
        for (const id of [...(world.movement.armies?.keys?.() ?? [])] as string[]) {
            if (id.startsWith('probe-')) world.movement.armies.delete(id);
        }
        planet.tiles = (Array.isArray(planet.tiles) ? planet.tiles : []).filter((t: any) => !String(t.tileId).startsWith('probe-'));
        planet.garrison = undefined;
        // Only the invader is AI-run; the defender gives no orders and digs in.
        world.claimedFactionIds = ids.filter(id => id !== A);
        registerActOfWar(world, A, B);
        // Strongpoint buildings on inner defender districts, off the beachhead.
        const surface = generateSurface(planet.id, planet.planetType, planet.tags);
        // Ground an infantry formation can actually enter (a shield in the
        // mountains is only the fleet's problem — see war-ai's objective filter).
        const inner = surface.sectors
            .filter(sec => sec.terrain !== 'ocean' && sec.ring >= 1 && sec.ring <= 2 && canEverEnter('INFANTRY', sec.terrain))
            .map(sec => sec.index);
        const placed: Record<string, number> = {};
        s.buildings.forEach((buildingId, i) => {
            const sectorIndex = inner[i * 2];
            placed[buildingId] = sectorIndex;
            planet.tiles.push({ tileId: `probe-${buildingId}-${planet.id}`, districtType: 'military', buildingId, constructionState: 'active', sectorIndex });
        });
        const fleet = mkFleet(`probe-fleet-${A}`, A, planet.systemId, s.fleetPower, [`probe-army-${A}`]);
        mkArmy(`probe-army-${A}`, A, s.attackers, { planetId: null, systemId: planet.systemId, fleetId: fleet.id });
        mkArmy(`probe-home-${B}`, B, s.defenders, { planetId: planet.id, systemId: planet.systemId, fleetId: null });
        let tries = 0;
        while (!planet.siege && tries++ < 120) {
            executeOrder(world, 'MIL_INVASION_PLANET', { fleetId: fleet.id, planetId: planet.id, systemId: planet.systemId }, A);
        }
        const siege: any = planet.siege;
        if (!siege) return null;
        const tick = () => { aiCommandGroundWars(world); processSieges(world); world.nowSeconds += 75; };
        const cycle = () => { const c = siege.cycleCount; while (siege.cycleCount === c && planet.siege) tick(); };
        const forms = (): Formation[] => siege.districts.formations;
        return { A, B, planet, fleet, siege, surface, placed, tick, cycle, forms };
    };
    const landInvasion = (s: Setup) => {
        if (fixedPair) {
            const g = tryLanding(fixedPair.A, fixedPair.B, s);
            if (!g) throw new Error(`landing failed for the fixed pair ${fixedPair.A} → ${fixedPair.B}`);
            return g;
        }
        while (pairIndex + 1 < ids.length) {
            const A = ids[pairIndex];
            const B = ids[pairIndex + 1];
            pairIndex += 2;
            const g = tryLanding(A, B, s);
            if (g) { fixedPair = { A, B }; say(`  (invader ${A}, defender ${B})`); return g; }
            say(`  (${A} will not invade ${B} — trying the next pair)`);
        }
        throw new Error('no empire pair could land an invasion');
    };

    // 3.1 — The fleet leaves. The beachhead starves and the invasion collapses.
    {
        const g = landInvasion({ attackers: { INFANTRY: 2200, ARMOR: 200 }, defenders: { INFANTRY: 3500, ANTI_ARMOR: 400 }, fleetPower: 400, buildings: ['shield_generator', 'barracks', 'fortress'] });
        const { A, B, planet, fleet, siege, placed } = g;
        check('3.1 the invasion lands', !!siege);
        const kinds = new Set((siege.districts.strongpoints ?? []).map((p: any) => p.kind));
        check('the strongpoints are on the board', kinds.has('shield') && kinds.has('barracks') && kinds.has('fortress') && kinds.has('capital'),
            [...kinds].join(', '));
        check('the fortress raised the starting entrenchment of its district',
            siege.districts.entrenchment[placed.fortress] > initDistrictWar(g.surface, 0, null).entrenchment[placed.fortress]);
        check('the defender was told', peekNotifications(B).some(n => /INVASION OF/.test(n.title)));
        g.tick();
        check('shield up: the fleet overhead cannot fire', siege.orbit?.shieldUp === true && siege.orbit?.holder === 'attacker' && siege.attackerState.orbitalSupportPower === 0,
            `orbit ${siege.orbit?.holder}, support ${siege.attackerState.orbitalSupportPower}`);
        check('the shield is wearing under the fleet', (siege.districts.strongpointDamage?.[placed.shield_generator] ?? 0) > 0);
        fleet.currentSystemId = 'probe-elsewhere';
        g.tick();
        check('fleet gone: orbit lost', siege.orbit?.holder !== 'attacker');
        check('and the invader hears it', peekNotifications(A).some(n => /ORBIT LOST/.test(n.title)));
        for (let c = 0; c < BLOCKADE_GRACE_CYCLES + 1 && planet.siege; c++) g.cycle();
        check('past the grace every invader is cut off', g.forms().filter(f => f.side === 'attacker').every(f => f.encircled),
            `${g.forms().filter(f => f.side === 'attacker' && !f.encircled).length} still supplied`);
        let cycles = 0;
        while (planet.siege && cycles < STARVE_SURRENDER_CYCLES + 12) { g.cycle(); cycles++; }
        check('the invasion collapses once the beachhead starves', !planet.siege && siege.endReason === 'ATTACKER_COLLAPSE' && siege.winner === B,
            `${cycles} cycles after the grace, reason ${siege.endReason}`);
        check('the world is still the defender\'s', planet.ownerId === B);
        check('the survivors are the defender\'s prisoners', ensureLedger(world.combat).groups.some((p: any) => p.ownerEmpireId === A && p.captorEmpireId === B));
        check('the garrison is what was left standing', planet.garrison?.garrisonTroops === sum(g.forms(), 'defender') && planet.garrison?.isUnderSiege === false,
            `${planet.garrison?.garrisonTroops} vs ${sum(g.forms(), 'defender')}`);
        check('the militia answered the call', (siege.defenderState.leviedTotal ?? 0) > 0, `${siege.defenderState.leviedTotal} levied`);
    }

    // 3.2 — The fleet stays. The shield district falls, the guns open up, the sappers finish it.
    {
        // Enough defenders that the siege outlives the shield district; few
        // enough that the shield district falls.
        const g = landInvasion({ attackers: { INFANTRY: 6000, ARMOR: 800, ARTILLERY: 300 }, defenders: { INFANTRY: 5000 }, fleetPower: 600, buildings: ['shield_generator'] });
        const { B, planet, siege, placed } = g;
        check('3.2 the invasion lands', !!siege);
        let took = -1, ruinedAt = -1, firedAt = -1;
        const trace: string[] = [];
        for (let c = 0; c < 60 && planet.siege; c++) {
            g.cycle();
            const sp = (siege.districts.strongpoints ?? []).find((p: any) => p.kind === 'shield');
            trace.push(`${c}:${sp?.holder?.[0] ?? '-'}${sp?.active ? '' : 'x'}/${siege.districts.strongpointHeldCycles?.[placed.shield_generator] ?? 0}`);
            if (took < 0 && sp?.holder === 'attacker') took = c;
            if (firedAt < 0 && took >= 0 && siege.attackerState.orbitalSupportPower > 0) firedAt = c;
            if (ruinedAt < 0 && sp && !sp.active) ruinedAt = c;
            if (ruinedAt >= 0 && firedAt >= 0) break;
        }
        if (ruinedAt < 0 || took < 0) say(`  (shield trace holder/heldCycles: ${trace.join(' ')})`);
        check('the invader takes the shield district', took >= 0, `cycle ${took}`);
        check('with the shield in enemy hands the fleet fires', firedAt >= 0 && firedAt >= took, `cycle ${firedAt}`);
        check(`the sappers ruin the generator after ${SAPPER_CYCLES} held cycles`, took >= 0 && ruinedAt >= 0 && ruinedAt - took >= SAPPER_CYCLES - 1 && ruinedAt - took <= SAPPER_CYCLES + 1,
            `taken ${took}, ruined ${ruinedAt}`);
        check('the tile is ruined', planet.tiles.find((t: any) => t.buildingId === 'shield_generator')?.constructionState === 'ruined');
        check('both sides heard the shield fail', peekNotifications(B).some(n => /SHIELD DOWN/.test(n.title)));
        void placed;
    }

    // 3.3 — A relief fleet breaks the blockade; the transports land.
    {
        const g = landInvasion({ attackers: { INFANTRY: 3000 }, defenders: { INFANTRY: 3000 }, fleetPower: 300, buildings: ['barracks'] });
        const { A, B, planet, fleet, siege } = g;
        check('3.3 the invasion lands', !!siege);
        g.tick();
        check('the invader holds the orbit', siege.orbit?.holder === 'attacker');
        // The defender's transport, waiting next door with a fresh army, and a
        // second invader army still aboard the blockading fleet.
        const relief = mkFleet(`probe-relief-${B}`, B, 'probe-elsewhere', 1200, [`probe-relief-army-${B}`]);
        mkArmy(`probe-relief-army-${B}`, B, { INFANTRY: 1500 }, { planetId: null, systemId: 'probe-elsewhere', fleetId: relief.id });
        mkArmy(`probe-second-${A}`, A, { INFANTRY: 500 }, { planetId: null, systemId: planet.systemId, fleetId: fleet.id });
        fleet.transportedArmyIds = [...(fleet.transportedArmyIds ?? []), `probe-second-${A}`];
        relief.currentSystemId = planet.systemId;
        executeOrder(world, 'MIL_DISEMBARK_ARMY', { armyId: `probe-relief-army-${B}`, planetId: planet.id }, B);
        check('under blockade the transport cannot land', world.movement.armies.get(`probe-relief-army-${B}`)?.transportFleetId === relief.id);
        // The space battle, tick by tick, until the blockade is gone.
        let rounds = 0;
        while (rounds++ < 60) {
            processSectorCombats(world);
            g.tick();
            const f: any = world.movement.fleets.get(fleet.id);
            if (!f || f.destinationSystemId || f.currentSystemId !== planet.systemId) break;
        }
        const blockader: any = world.movement.fleets.get(fleet.id);
        check('the relief fleet drives the blockade off', !blockader || blockader.destinationSystemId || blockader.currentSystemId !== planet.systemId,
            `${rounds} ticks; blockader ${!blockader ? 'destroyed' : 'routed'}`);
        check('the orbit is the defender\'s', siege.orbit?.holder === 'defender', `${siege.orbit?.holder}`);
        check('the defender hears the blockade is broken', peekNotifications(B).some(n => /ORBIT LOST|blockade/i.test(n.title + n.body)));
        if (!blockader) {
            check('the army aboard the destroyed fleet died with it', !world.movement.armies.has(`probe-second-${A}`));
        } else {
            say('  (blockader routed rather than destroyed — embarked-army loss not exercised here)');
        }
        const before = sum(g.forms(), 'defender');
        executeOrder(world, 'MIL_DISEMBARK_ARMY', { armyId: `probe-relief-army-${B}`, planetId: planet.id }, B);
        check('with the orbit won the transport lands', world.movement.armies.get(`probe-relief-army-${B}`)?.currentPlanetId === planet.id);
        g.cycle();
        check('and the fresh army is on the board next cycle', sum(g.forms(), 'defender') >= before + 1500 - 400,
            `${before} → ${sum(g.forms(), 'defender')}`);
        const musterAt = g.forms().filter(f => f.side === 'defender' && f.id.includes('-m-')).map(f => f.sectorIndex);
        const barracksIdx = (siege.districts.strongpoints ?? []).find((p: any) => p.kind === 'barracks')?.sectorIndex;
        check('it mustered at the barracks', musterAt.length > 0 && musterAt.every(i => i === barracksIdx), `${musterAt.join(',')} vs barracks ${barracksIdx}`);
    }

    // 3.4 — Holding out: the same fight with and without the levy.
    {
        const run = (buildings: Setup['buildings'], attackerScale = 1) => {
            // Equal forces, the invader holding the orbit: the case "a
            // well-held planet lasts hours" is about.
            const g = landInvasion({
                attackers: { INFANTRY: Math.round(3200 * attackerScale), ARMOR: Math.round(300 * attackerScale) },
                defenders: { INFANTRY: 3200, ANTI_ARMOR: 300 }, fleetPower: 400, buildings,
            });
            const { B, planet } = g;
            const trace: number[] = [];
            const enemy: number[] = [];
            let ended = 0;
            for (let c = 1; c <= 40; c++) {
                if (!planet.siege) { trace.push(0); enemy.push(0); continue; }
                g.cycle();
                trace.push(sum(g.forms(), 'defender'));
                enemy.push(sum(g.forms(), 'attacker'));
                if (planet.siege) ended = c;
            }
            return {
                trace, enemy, ended: planet.siege ? 40 : ended,
                held: !!planet.siege || planet.ownerId === B,
                outcome: planet.siege ? 'still fighting' : planet.ownerId === B ? `invasion ${g.siege.endReason}` : 'world lost',
                levied: g.siege.defenderState.leviedTotal ?? 0,
            };
        };
        const every5 = (xs: number[]) => xs.filter((_, i) => i % 5 === 4).join(' → ');
        const hours = (cycles: number) => (cycles / cyclesPerRealHour(SIEGE_CYCLE_TICKS)).toFixed(1);
        const on = run(['barracks', 'fortress']);
        const off = run([]);
        const big = run(['barracks', 'fortress'], 1.5);
        say(`  levy on  — defenders: ${every5(on.trace)}  (levied ${on.levied})`);
        say(`             invaders:  ${every5(on.enemy)}   → ${on.outcome} after ${on.ended} cycles (${hours(on.ended)} h)`);
        say(`  levy off — defenders: ${every5(off.trace)}`);
        say(`             invaders:  ${every5(off.enemy)}   → ${off.outcome} after ${off.ended} cycles (${hours(off.ended)} h)`);
        say(`  1.5× invader, levy on — defenders: ${every5(big.trace)}`);
        say(`             invaders:  ${every5(big.enemy)}   → ${big.outcome} after ${big.ended} cycles (${hours(big.ended)} h)`);
        // Stands = not lost inside two hours. The trace reads 0 once the siege is
        // over either way, so a defence that BEATS the invasion early (the invasion
        // collapses) must count as standing, not as wiped out. Falling AFTER the
        // two hours is the relief window doing its job, not a failure.
        const stood = on.outcome.startsWith('invasion') || on.trace[23] > 0;
        check('with barracks and fortress an equal defence under blockade stands two real hours (cycle 24)', stood, `${on.outcome} after ${on.ended} cycles, ${on.trace[23]} men at cycle 24`);
        check('and outlasts the same defence without them', on.ended > off.ended || (on.held && !off.held), `${on.ended} vs ${off.ended} cycles`);
    }

    // 3.5 — The invader wins. The survivors are the new garrison.
    {
        const g = landInvasion({ attackers: { INFANTRY: 6000, ARMOR: 1000 }, defenders: { MILITIA: 300 }, fleetPower: 800, buildings: [] });
        const { A, B, planet, siege } = g;
        check('3.5 the invasion lands', !!siege);
        for (let c = 0; c < 60 && planet.siege; c++) g.cycle();
        const survivors = sum(g.forms(), 'attacker');
        check('the world falls', planet.ownerId === A && siege.winner === A && siege.endReason === 'OCCUPATION', `owner ${planet.ownerId}, reason ${siege.endReason}`);
        check('the winner\'s survivors are the garrison', planet.garrison?.ownerEmpireId === A && planet.garrison?.garrisonTroops === survivors && survivors > 0,
            `${planet.garrison?.garrisonTroops} vs ${survivors}`);
        check('the beaten defenders are prisoners', ensureLedger(world.combat).groups.some((p: any) => p.ownerEmpireId === B && p.captorEmpireId === A && p.planetId === planet.id));
        check('the loser was told', peekNotifications(B).some(n => /HAS FALLEN/.test(n.title)));
    }
    quiet.restore();
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
