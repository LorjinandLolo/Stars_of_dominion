// scripts/infernoid-probe.ts
// Are the Infernoid mechanics LIVE, and is the already-shipped half still ONE
// copy rather than two?
//
// Covers Fireblood Detonation (ground + fleet), Pain is Honor, "They Are Not
// Taken Alive", and Diplomatic Pariah.
//
//   npx tsx scripts/infernoid-probe.ts
//
// No database, no worker. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { ensureFactionTraits, districtTraitsFor } from '../lib/factions/traits-service';
import {
    FIREBLOOD_GROUND_COEFF,
    NOT_TAKEN_ALIVE,
    PAIN_MAX,
    PARIAH_BIAS,
    captureResistance,
    pariahBiasFor,
    painMultiplier,
    woundedness,
    canRaiseElder,
    chargeElder,
    countLivingElders,
    ELDER_COST,
    ELDER_MAX_LIVING,
    ELDER_UNIT_TYPE,
    heatTerrainCostForCiv,
} from '../lib/factions/infernoid';
import { terrainCostForCiv } from '../lib/factions/terrain-affinity';
import { FACTION_CAPITALS } from '../lib/galaxy/faction-capitals';
import { legalMoves } from '../lib/combat/siege/formations';
import { getTechModifier } from '../lib/tech/modifiers';
import { resolveDistrictBattle } from '../lib/combat/siege/district-battle';
import { capturedFromLosses } from '../lib/combat/siege/prisoners';
import { createOffer } from '../lib/diplomacy/offer-service';
import { tickPressureDrift } from '../lib/diplomacy/pressure-service';
import { generateSurface } from '../lib/planet-surface/generator';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';

const INF = 'faction-infernoids';
const OTHER = 'faction-movanites';
const THIRD = 'faction-sarrak';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};

const world = getGameWorldState();
ensureFactionTraits(world);
// tickPressureDrift only considers factions whose posture carries an ideology.
ensureEmpirePostures(world);
world.nowSeconds = 7_000_000;

// ── 1. What is already live must not have been rebuilt ──────────────────────
console.log('\n[1] Already-shipped weaknesses (civ pipeline)');
{
    check('Resource Gluttons: upkeep is higher', getTechModifier(world, INF, 'eco_upkeep_mult') > 1,
        `${getTechModifier(world, INF, 'eco_upkeep_mult')}`);
    check('Tech Limitations: research is slower', getTechModifier(world, INF, 'research_speed') < 1);
    check('and espionage is worse', getTechModifier(world, INF, 'esp_op_success_add') < 0);
    check('a neutral faction has none of that',
        getTechModifier(world, OTHER, 'eco_upkeep_mult') === 1
        && getTechModifier(world, OTHER, 'esp_op_success_add') === 0);

    const src = fs.readFileSync(path.resolve(process.cwd(), 'lib/factions/infernoid.ts'), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check('infernoid.ts adds no second copy of the upkeep/research/espionage penalties',
        !/eco_upkeep_mult|research_speed|esp_op_success_add/.test(src));
}

// ── 2. Fireblood Detonation — ground ────────────────────────────────────────
console.log('\n[2] Fireblood Detonation (ground)');
{
    const surface = generateSurface('probe-planet', 'standard', []);
    const idx = surface.sectors.findIndex(s => s.terrain !== 'ocean');

    const mkWar = (): any => ({
        control: { [idx]: 'defender' },
        landingZones: [idx],
        contested: [idx],
        formations: [],
        plans: [],
    });
    const mkForms = (): any[] => ([
        { id: 'a1', side: 'attacker', unitType: 'INFANTRY', strength: 900, maxStrength: 900, sectorIndex: idx, supply: 100 },
        { id: 'd1', side: 'defender', unitType: 'INFANTRY', strength: 700, maxStrength: 700, sectorIndex: idx, supply: 100 },
    ]);
    const stances: any = { attacker: 'DEFENSIVE_HOLD', defender: 'DEFENSIVE_HOLD' };
    const morale: any = { attacker: 50, defender: 50 };
    const seeded = () => { let s = 42; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; };

    // Identical fights; only the DEFENDER's detonation differs.
    const plainWar = mkWar(); plainWar.formations = mkForms();
    const plain = resolveDistrictBattle(surface, plainWar, plainWar.formations, idx, stances, morale, seeded(),
        { attacker: 0, defender: 0 },
        { attacker: { dealt: 1, taken: 1, detonation: 0 }, defender: { dealt: 1, taken: 1, detonation: 0 } });

    const blastWar = mkWar(); blastWar.formations = mkForms();
    const blast = resolveDistrictBattle(surface, blastWar, blastWar.formations, idx, stances, morale, seeded(),
        { attacker: 0, defender: 0 },
        { attacker: { dealt: 1, taken: 1, detonation: 0 }, defender: { dealt: 1, taken: 1, detonation: FIREBLOOD_GROUND_COEFF } });

    const attackersLeft = (forms: any[]) => forms.filter(f => f.side === 'attacker').reduce((s, f) => s + Math.max(0, f.strength), 0);
    check('the detonating side kills MORE of the enemy',
        attackersLeft(blastWar.formations) < attackersLeft(plainWar.formations),
        `${attackersLeft(plainWar.formations)} -> ${attackersLeft(blastWar.formations)}`);

    // The no-double-count decision: detonation kills must NOT become prisoners.
    check('detonation kills are NOT folded into lossesBySide',
        JSON.stringify(plain?.lossesBySide) === JSON.stringify(blast?.lossesBySide),
        'folding them in would mint POWs out of men killed by an explosion');
    check('the log reports the blast', /ignite/.test(blast?.log ?? ''), blast?.log);

    // THE live-vs-decoration assertion: the blast must be able to ANNIHILATE a
    // force that would otherwise have walked away.
    //
    // Note what is deliberately NOT asserted here. A same-cycle flip of
    // `holder` is structurally unreachable, and that is a property of the
    // holder rule rather than a weakness of the mechanic: the ground only
    // changes hands when a side is wiped out, while the blast scales with the
    // DYING side's losses. A defender weak enough to die leaves too small a
    // corpse pile to finish a strong attacker; one big enough to leave a lethal
    // pile does not die. The two conditions exclude each other in one exchange.
    // Searched exhaustively — three terrains, ~2,400 strength pairs, four
    // coefficients — and no flip exists. Asserting one would have been
    // asserting a bug.
    //
    // What IS load-bearing, and is asserted: the blast reaches the annihilation
    // threshold the holder rule keys on. A siege runs many cycles over many
    // districts, so a force that is wiped instead of withdrawing decides it.
    let annihilated = false;
    let annihilatedAt = '';
    outer:
    for (const atk of [200, 300, 440, 600]) {
        for (const def of [70, 90, 120, 160]) {
            const build = (detonation: number) => {
                const w: any = mkWar();
                w.formations = mkForms();
                w.formations[0].strength = atk; w.formations[0].maxStrength = atk;
                w.formations[1].strength = def; w.formations[1].maxStrength = def;
                resolveDistrictBattle(surface, w, w.formations, idx, stances, morale, seeded(),
                    { attacker: 0, defender: 0 },
                    {
                        attacker: { dealt: 1, taken: 1, detonation: 0 },
                        defender: { dealt: 1, taken: 1, detonation },
                    });
                return w.formations
                    .filter((f: any) => f.side === 'attacker')
                    .reduce((s: number, f: any) => s + Math.max(0, f.strength), 0);
            };
            const survived = build(0);
            for (const d of [1.0, 2.0, 5.0, 8.0]) {
                if (survived > 0 && build(d) <= 0) {
                    annihilated = true;
                    annihilatedAt = `attacker ${atk} vs defender ${def}: ${survived} survivors -> 0 at coefficient ${d}`;
                    break outer;
                }
            }
        }
    }
    check('the blast can annihilate a force that would otherwise have survived', annihilated,
        annihilatedAt || 'the detonation never reached a lethal threshold at any ratio');
    if (annihilated) console.log(`        (${annihilatedAt})`);

    // Faction routing.
    check('the dispatcher gives Infernoids a detonation',
        (districtTraitsFor(world, INF, 'plains', undefined) as any).detonation > 0);
    check('and gives nobody else one',
        (districtTraitsFor(world, OTHER, 'plains', undefined) as any).detonation === 0);
}

// ── 3. Pain is Honor ────────────────────────────────────────────────────────
console.log('\n[3] Pain is Honor');
{
    const forms: any[] = [
        { side: 'attacker', sectorIndex: 3, strength: 50, maxStrength: 100 },
        { side: 'defender', sectorIndex: 3, strength: 100, maxStrength: 100 },
    ];
    check('a half-dead stack reads as half wounded',
        Math.abs(woundedness(forms, 'attacker', 3) - 0.5) < 1e-9, `${woundedness(forms, 'attacker', 3)}`);
    check('a fresh stack reads as unwounded', woundedness(forms, 'defender', 3) === 0);
    check('woundedness is per district',
        woundedness(forms, 'attacker', 9) === 0, 'a different district must not leak in');

    check('an Infernoid stack hits harder as it dies',
        painMultiplier(world, INF, forms, 'attacker', 3) > 1);
    check('and the bonus is bounded',
        painMultiplier(world, INF, forms, 'attacker', 3) <= 1 + PAIN_MAX + 1e-9);
    check('nobody else gets it',
        painMultiplier(world, OTHER, forms, 'attacker', 3) === 1);

    // The back-fill failure mode: no maxStrength must not read as wounded.
    const noMax: any[] = [{ side: 'attacker', sectorIndex: 1, strength: 60 }];
    check('a formation with no maxStrength reads as unwounded, not as fully wounded',
        woundedness(noMax, 'attacker', 1) === 0,
        'the back-fill in processSieges is what makes this correct rather than permanently zero');
}

// ── 4. They Are Not Taken Alive ─────────────────────────────────────────────
console.log('\n[4] They are not taken alive');
{
    const losses = { INFANTRY: 100 } as any;
    const normal = capturedFromLosses(losses, 0);
    const resisted = capturedFromLosses(losses, 0, NOT_TAKEN_ALIVE);
    const normalTotal = Object.values(normal).reduce((s: number, n: any) => s + n, 0);
    const resistedTotal = Object.values(resisted).reduce((s: number, n: any) => s + n, 0);

    check('an ordinary force yields prisoners', normalTotal > 0, `${normalTotal}`);
    check('the Infernoids yield far fewer', resistedTotal < normalTotal, `${normalTotal} -> ${resistedTotal}`);
    check('default behaviour is unchanged when no resistance is passed',
        JSON.stringify(capturedFromLosses(losses, 0)) === JSON.stringify(normal));
    check('the resistance is faction-scoped',
        captureResistance(world, INF) > 0 && captureResistance(world, OTHER) === 0);
}

// ── 5. Diplomatic Pariah ────────────────────────────────────────────────────
console.log('\n[5] Diplomatic Pariah');
{
    check('a pair involving the Infernoids carries extra friction',
        pariahBiasFor(world, INF, OTHER) === PARIAH_BIAS);
    check('in either direction', pariahBiasFor(world, OTHER, INF) === PARIAH_BIAS);
    check('and an ordinary pair carries none', pariahBiasFor(world, OTHER, THIRD) === 0);

    // The dead rule must be gone, not merely bypassed.
    const cw = fs.readFileSync(path.resolve(process.cwd(), 'lib/politics/cold-war-service.ts'), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check('the dead infernoid_crusade rule is deleted', !/infernoid_crusade/.test(cw),
        'two rules writing the same RivalryState is how this went wrong the first time');

    // The live path: one tick must seed a hostile rivalry, not crawl toward one.
    world.rivalries.clear();
    tickPressureDrift(world);
    const r = world.rivalries.get(`rivalry-${INF}-${OTHER}`) ?? world.rivalries.get(`rivalry-${OTHER}-${INF}`);
    check('one tick creates the rivalry', !!r, 'no record means every reader falls back to the friendly ?? 20 default');
    check('both directions exist', !!world.rivalries.get(`rivalry-${INF}-${OTHER}`) && !!world.rivalries.get(`rivalry-${OTHER}-${INF}`));
    check('and it is hostile after ONE tick, not fifty', (r?.rivalryScore ?? 0) >= 60, `score=${r?.rivalryScore}`);
    check('but not at war — drift must never trip the war threshold',
        (r?.escalationLevel ?? 0) < 7, `escalation=${r?.escalationLevel}`);

    check('nobody will ally with them',
        createOffer(world, OTHER, { kind: 'treaty', treatyType: 'mutual_defense', toFactionId: INF }).success === false);
    check('and they will ally with nobody',
        createOffer(world, INF, { kind: 'treaty', treatyType: 'mutual_defense', toFactionId: OTHER }).success === false);
}

// ── 6. Persistence ──────────────────────────────────────────────────────────
console.log('\n[6] Persistence');
{
    const round = deserializeWorld(serializeWorld(world));
    check('rivalries survive a save/load round trip',
        (round.rivalries?.size ?? 0) > 0);
}

// ── 7. Wiring ───────────────────────────────────────────────────────────────
console.log('\n[7] Wiring');
{
    const src = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
    check('the district engine detonates',
        src('lib/combat/siege/district-battle.ts').includes('const attackerBlast = detonate('));
    check('combat-manager detonates dying Infernoid fleets',
        src('lib/combat/combat-manager.ts').includes('isInfernoid(world, fleet.factionId)'));
    check('the worker back-fills maxStrength',
        src('scripts/game-loop.ts').includes('(f as any).maxStrength = f.strength'));
    check('the worker folds woundedness into dealt',
        src('scripts/game-loop.ts').includes('painMultiplier(world, updatedSiege.attackerEmpireId'));
    check('the worker passes capture resistance',
        src('scripts/game-loop.ts').includes('captureResistance(world, ownerEmpireId)'));
    check('pressure drift passes the pariah bias',
        src('lib/diplomacy/pressure-service.ts').includes('pariahBias: pariahBiasFor(world, aId, bId)'));
    check('and seeds a new rivalry at its baseline',
        src('lib/diplomacy/pressure-service.ts').includes('getOrCreateRivalry(world, aId, bId, baseline)'));
    check('the dispatcher routes Infernoid district traits',
        src('lib/factions/traits-service.ts').includes('case INFERNOID_CIV_ID'));
    check('seedFormations stamps maxStrength',
        src('lib/combat/siege/formations.ts').includes('maxStrength: strength'));
}

// ── 8. Elder Infernoids ─────────────────────────────────────────────────────
console.log('\n[8] Elder Infernoids (tripods)');
{
    const surface = generateSurface('probe-elder', 'standard', []);
    const idx = surface.sectors.findIndex(s => s.terrain !== 'ocean');
    const stances: any = { attacker: 'DEFENSIVE_HOLD', defender: 'DEFENSIVE_HOLD' };
    const morale: any = { attacker: 50, defender: 50 };
    const neutral: any = {
        attacker: { dealt: 1, taken: 1, detonation: 0 },
        defender: { dealt: 1, taken: 1, detonation: 0 },
    };
    const seeded = () => { let s = 7; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; };

    /** One district, Elders defending, `attack` doing the shooting. */
    const fight = (attack: { unitType: string; strength: number }[], escort = 0, cycles = 1) => {
        const war: any = { control: { [idx]: 'defender' }, landingZones: [idx], contested: [idx], formations: [], plans: [] };
        const elder: any = { id: 'e1', side: 'defender', unitType: ELDER_UNIT_TYPE, strength: 3, maxStrength: 3, sectorIndex: idx, supply: 100 };
        const guard: any[] = escort > 0
            ? [{ id: 'g1', side: 'defender', unitType: 'INFANTRY', strength: escort, maxStrength: escort, sectorIndex: idx, supply: 100 }]
            : [];
        const rng = seeded();
        for (let c = 0; c < cycles; c++) {
            // Fresh attackers each cycle: the point of the multi-cycle runs is
            // that repeated SMALL blows never add up, not that the attacker dies.
            const atk = attack.map((a, i) => ({
                id: `a${i}`, side: 'attacker', unitType: a.unitType, strength: a.strength,
                maxStrength: a.strength, sectorIndex: idx, supply: 100,
            }));
            war.formations = [...atk, ...guard.filter(g => g.strength > 0), elder];
            resolveDistrictBattle(surface, war, war.formations, idx, stances, morale, rng, { attacker: 0, defender: 0 }, neutral);
        }
        return { elders: Math.max(0, elder.strength), escort: guard[0] ? Math.max(0, guard[0].strength) : 0 };
    };

    // 1. Massed small arms do NOTHING. This is the headline clause.
    const swarm = fight([{ unitType: 'INFANTRY', strength: 8000 }]);
    check('an army of 8000 infantry kills zero Elders', swarm.elders === 3, `${swarm.elders}/3 left`);

    const militiaSwarm = fight([{ unitType: 'MILITIA', strength: 20000 }], 0, 6);
    check('20000 militia over six cycles still kills zero', militiaSwarm.elders === 3, `${militiaSwarm.elders}/3 left`);

    // 2. Anti-armor is the honest answer.
    const aa = fight([{ unitType: 'ANTI_ARMOR', strength: 1000 }]);
    check('anti-armor kills Elders', aa.elders < 3, `${aa.elders}/3 left`);

    // 3. The floor: sub-threshold heavy fire is DISCARDED, not accumulated.
    //    Twelve cycles of it must be exactly as harmless as one.
    const chipOnce = fight([{ unitType: 'ANTI_ARMOR', strength: 18 }], 0, 1);
    const chipMany = fight([{ unitType: 'ANTI_ARMOR', strength: 18 }], 0, 12);
    check('a blow too small to land whole kills nothing', chipOnce.elders === 3);
    check('and twelve such blows still kill nothing — chip damage is discarded, not banked',
        chipMany.elders === 3, `${chipMany.elders}/3 left after 12 cycles`);

    //    The threshold has to be a real edge, not a slope. Measured curve:
    //    18 and 40 anti-armor kill nothing, 100 kills one, 260 kills all three.
    //    If this ever degrades into "more damage always kills a bit more", the
    //    floor has been lost and the mechanic is just a big health pool.
    const below = fight([{ unitType: 'ANTI_ARMOR', strength: 40 }]);
    const above = fight([{ unitType: 'ANTI_ARMOR', strength: 100 }]);
    check('the threshold is an EDGE: 40 anti-armor kills none, 100 kills one',
        below.elders === 3 && above.elders < 3, `40 -> ${below.elders}, 100 -> ${above.elders}`);

    //    And the swarm is not merely being ignored — the titan is fighting.
    //    A test where nothing happens at all would pass clause 1 for the wrong
    //    reason, so assert the infantry are actually dying.
    const swarmWar: any = { control: { [idx]: 'defender' }, landingZones: [idx], contested: [idx], formations: [], plans: [] };
    const swarmElder: any = { id: 'e1', side: 'defender', unitType: ELDER_UNIT_TYPE, strength: 3, maxStrength: 3, sectorIndex: idx, supply: 100 };
    const swarmInf: any = { id: 'a0', side: 'attacker', unitType: 'INFANTRY', strength: 8000, maxStrength: 8000, sectorIndex: idx, supply: 100 };
    swarmWar.formations = [swarmInf, swarmElder];
    const swarmRes = resolveDistrictBattle(surface, swarmWar, swarmWar.formations, idx, stances, morale, seeded(), { attacker: 0, defender: 0 }, neutral);
    check('the swarm is being killed while it fails to kill — three Elders hold off 8000 men',
        (swarmRes?.lossesBySide.attacker?.INFANTRY ?? 0) > 0 && swarmElder.strength === 3,
        `${swarmRes?.lossesBySide.attacker?.INFANTRY ?? 0} infantry dead, ${swarmElder.strength}/3 Elders`);

    // 4. Escorts soak first: the titan is not what the fire lands on.
    const escorted = fight([{ unitType: 'ANTI_ARMOR', strength: 260 }], 4000);
    const naked = fight([{ unitType: 'ANTI_ARMOR', strength: 260 }], 0);
    check('an escorted Elder survives fire that kills a naked one',
        escorted.elders > naked.elders, `escorted ${escorted.elders} vs naked ${naked.elders}`);

    // 5. Never taken alive — CAPTURE_RATE must exist and be zero, not absent.
    const pow = capturedFromLosses({ [ELDER_UNIT_TYPE]: 3, INFANTRY: 100 } as any, 0, 0);
    check('a destroyed Elder is never a prisoner', !(ELDER_UNIT_TYPE in pow));
    check('but ordinary losses still are', (pow as any).INFANTRY > 0);

    // 6. The cap is a live census, and the price is real.
    const inf = (world as any).economy.factions.get(INF);
    inf.reserves = inf.reserves ?? {};
    inf.reserves.CREDITS = 500_000;
    inf.reserves.METALS = 50_000;
    const beforeCredits = inf.reserves.CREDITS;

    check('a faction with no Elders may raise one', canRaiseElder(world, INF, 1).ok);
    check('a non-Infernoid may not', !canRaiseElder(world, OTHER, 1).ok);

    chargeElder(world, INF, 1);
    check('raising one debits exactly the authored price',
        beforeCredits - inf.reserves.CREDITS === ELDER_COST.CREDITS,
        `${beforeCredits} -> ${inf.reserves.CREDITS}`);

    // Plant the cap's worth on an owned world and confirm the census sees them.
    const owned = Array.from((world as any).construction.planets.values() as any[])
        .find((p: any) => p.ownerId === INF);
    check('the Infernoids own a world to garrison', !!owned);
    if (owned) {
        (owned as any).garrison = { ...(owned as any).garrison, unitComposition: { [ELDER_UNIT_TYPE]: ELDER_MAX_LIVING } };
        check('the census counts garrisoned Elders', countLivingElders(world, INF) >= ELDER_MAX_LIVING,
            `${countLivingElders(world, INF)}`);
        const capped = canRaiseElder(world, INF, 1);
        check('and the cap refuses a fourth', !capped.ok, capped.reason);
        // A poor empire is refused even under the cap.
        (owned as any).garrison.unitComposition = {};
        inf.reserves.CREDITS = 1;
        check('an empire that cannot pay is refused', !canRaiseElder(world, INF, 1).ok);
        inf.reserves.CREDITS = 500_000;
    }

    // 7. The silent-fail tables. A unit type missing from a casualty-order array
    //    takes literally zero casualties — that is invincibility, not toughness,
    //    and nothing reports it. These assertions exist to catch exactly that.
    const src = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
    const db = src('lib/combat/siege/district-battle.ts');
    const orderLine = db.split('\n').find(l => l.includes('const order: GroundUnitType[]')) ?? '';
    check('district-battle casualty order includes Elders', orderLine.includes(ELDER_UNIT_TYPE), orderLine.trim());
    check('and lists them LAST, so escorts soak first',
        orderLine.lastIndexOf(ELDER_UNIT_TYPE) > orderLine.lastIndexOf('SPECIAL_OPS'));
    const se = src('lib/combat/siege/siege-engine.ts');
    check('both siege-engine unit arrays include Elders',
        se.split('\n').filter(l => l.includes('const types: GroundUnitType[]')).every(l => l.includes(ELDER_UNIT_TYPE)));
    check('the runtime unit config has an Elder entry',
        ELDER_UNIT_TYPE in JSON.parse(src('data/combat/ground-units.json')));

    // 8. Invasion composition — the blocker that is now fixed.
    const gl = src('scripts/game-loop.ts');
    check('the landing force is derived from what is aboard',
        gl.includes('const landing = landingComposition(world, fleet)'));
    check('landed armies are consumed, so nothing lands twice',
        gl.includes('consumeLandedArmies(world, fleet, landing.consumedArmyIds)'));
    check('reinforcements reach the district board, not just the ledger',
        gl.includes("seedFormations(\n                        surf, war, 'attacker',"));
    check('the fleet-power fallback is PRESERVED — the AI never embarks armies',
        gl.includes('INFANTRY: fleet.basePower * 4'));
    check('the recruit handler gates Elders',
        gl.includes('canRaiseElder(world, factionId, payload.count)')
        && gl.includes('chargeElder(world, factionId, verdict.granted)'));

    // 9. The client. The button must exist for the Infernoids and for nobody
    //    else, and its price copy must still describe the real price — a UI
    //    that advertises a stale cost is how a player learns to distrust it.
    const rp = src('components/combat/ReviewPanel.tsx');
    check('the recruit menu offers Elders only to the Infernoid civilization',
        rp.includes("civilizationId === 'civ-infernoid'")
        && rp.includes("...(isInfernoidCiv ? ['ELDER_INFERNOID'] : [])"));
    check('the client sends a count of 1, so the pending label cannot lie',
        rp.includes("unitType === 'ELDER_INFERNOID' ? 1 : 10"));
    const costCopy = rp.split('\n').find(l => l.includes('credits ·')) ?? '';
    check('the advertised price still matches ELDER_COST and the cap',
        costCopy.includes(`${ELDER_COST.CREDITS / 1000}k credits`)
        && costCopy.includes(`${ELDER_COST.METALS / 1000}k metals`)
        && costCopy.includes(`max ${ELDER_MAX_LIVING}`),
        costCopy.trim());
}

// ── 9. Heat Immunity ────────────────────────────────────────────────────────
console.log('\n[9] Heat Immunity');
{
    const home = FACTION_CAPITALS['faction-infernoids'];
    const planet: any = [...(world as any).construction.planets.values()]
        .find((p: any) => p.ownerId === INF && p.systemId === home.systemId && p.planetType === 'capital');
    check('the Infernoids have a capital planet', !!planet);

    const surface = generateSurface(planet.id, planet.planetType, planet.tags);
    const terrainCount = (t: string) => surface.sectors.filter((s: any) => s.terrain === t).length;
    const hotDistricts = terrainCount('volcanic') + terrainCount('toxic');

    // The precondition. This mechanic was deferred for exactly one reason: every
    // capital generated `continental`, so there was no hot ground to be immune
    // on. If the archetype regresses, this fails FIRST and explains why.
    check('Pyrothar actually has hot ground to be immune on',
        hotDistricts > 0, `volcanic ${terrainCount('volcanic')} + toxic ${terrainCount('toxic')} of 64`);

    // ── movement: immunity to a real, server-authoritative penalty ──
    const hot = heatTerrainCostForCiv('civ-infernoid');
    check('an Infernoid gets a terrain-cost override', !!hot);
    check('everyone else gets undefined, so legalMoves keeps its original path',
        heatTerrainCostForCiv('civ-sarrak') === undefined && heatTerrainCostForCiv(undefined) === undefined);
    check('the override only touches HOT ground',
        hot!('volcanic', 2) === 1 && hot!('toxic', 1.8) === 1
        && hot!('mountains', 2.2) === 2.2 && hot!('plains', 1) === 1 && hot!('jungle', 2) === 2);
    // Never a penalty: min(), so a hypothetical cheap hot tile stays cheap.
    check('it can only ever reduce a cost', hot!('volcanic', 0.5) === 0.5);

    const war: any = { control: {}, landingZones: [], contested: [], formations: [], plans: [] };
    for (const s of surface.sectors) war.control[s.index] = 'defender';
    const meanReach = (unitType: string, override?: any) => {
        let total = 0, n = 0;
        for (const s of surface.sectors) {
            if (s.terrain === 'ocean') continue;
            const f: any = { id: 'f', side: 'defender', unitType, strength: 10, sectorIndex: s.index, supply: 100 };
            total += legalMoves(surface, war, f, undefined, override).length;
            n++;
        }
        return total / Math.max(1, n);
    };
    const plainInf = meanReach('INFANTRY');
    const hotInf = meanReach('INFANTRY', hot);
    check('Infernoid infantry manoeuvres further on its own ground',
        hotInf > plainInf, `${plainInf.toFixed(2)} -> ${hotInf.toFixed(2)} districts`);
    const plainArm = meanReach('ARMOR');
    const hotArm = meanReach('ARMOR', hot);
    check('and heavy formations gain the most — sensitivity multiplies the cost they no longer pay',
        (hotArm / plainArm) > (hotInf / plainInf), `armor x${(hotArm / plainArm).toFixed(2)} vs infantry x${(hotInf / plainInf).toFixed(2)}`);
    check('a neutral faction is completely unaffected', meanReach('INFANTRY', undefined) === plainInf);

    // ── combat half ──
    const dealtOn = (t: string) => districtTraitsFor(world, INF, t).dealt;
    check('they hit harder on volcanic and toxic ground', dealtOn('volcanic') > 1 && dealtOn('toxic') > 1);
    check('and worse on ice — their own authored cold weakness', dealtOn('frozen') < 1);
    check('temperate ground is neutral', dealtOn('plains') === 1);
    check('a neutral faction gets nothing on volcanic', districtTraitsFor(world, OTHER, 'volcanic').dealt === 1);
    check('fireblood still rides the same traits object', districtTraitsFor(world, INF, 'volcanic').detonation! > 0);

    // ── the empty-set guard ──
    // habitability was the obvious hook and is DECORATIVE: SectorInspector.tsx
    // is its only reader in the repo. Keying on it would have been Chemical
    // Immunity all over again — a number nobody reads.
    const infSrc = fs.readFileSync(path.resolve(process.cwd(), 'lib/factions/infernoid.ts'), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check('heat immunity is NOT keyed on decorative habitability', !/habitability/.test(infSrc));

    // ── client/server parity ──
    // legalMoves is authoritative in the worker AND draws the client's reach
    // overlay. An override applied in only one of them shows the player moves
    // the server then refuses.
    const src = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
    // Resolved through lib/factions/terrain-affinity.ts since the Movanites
    // gained a terrain rule of their own — one dispatcher, so the worker and the
    // client cannot drift apart. The heat rule itself is asserted above.
    check('the worker passes the override to its authoritative check',
        src('scripts/game-loop.ts').includes('legalMoves(surf, siege.districts, formation, undefined, terrainCostFor(world, factionId))'));
    const up = src('components/planet/UnitPieces.tsx');
    check('and every client legalMoves call passes it too',
        up.split('\n').filter(l => l.includes('legalMoves(')).filter(l => !l.includes('import'))
            .every(l => l.includes('terrainCostOverride')));
    check('the surface view resolves it from the civilization',
        src('components/planet/PlanetSurfaceView.tsx').includes('terrainCostForCiv('));
    check('and the shared dispatcher still returns the heat rule for the Infernoids',
        terrainCostForCiv('civ-infernoid')?.('volcanic', 2) === 1);
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ Infernoid mechanics are live\n`);
process.exit(failures ? 1 : 0);
