/**
 * scripts/test-tech-phase5.ts
 *
 * Tech migration Phase 5 — technology diffusion.
 *
 * Technology acquired by means other than research: one blueprint object shared
 * by every channel, one assimilation pipeline, and adaptation debt so that a
 * copy is never immediately as good as the original.
 *
 * Asserts:
 *   1. fragments merge with diminishing returns
 *   2. the diffusion gradient makes commodity tech cheap and bleeding edge dear
 *   3. assimilation waives prerequisites and costs a fraction of research
 *   4. adaptation debt withholds effect strength, then repays it exactly
 *   5. conquest absorption yields spoils scaled by how wrecked the world is
 *   6. observation accrues slowly against infiltrated rivals
 *   7. blueprints and debt survive a save round trip
 *
 * Run: npx tsx scripts/test-tech-phase5.ts
 */
import { TechEngine, applyUnlock, registry } from '../lib/tech/engine';
import {
    addBlueprint, getBlueprint, canAssimilate, assimilationTicks,
    assimilationCostMultiplier, assimilateBlueprint, tickAdaptationDebt,
    getAdaptationDebt, holdersOfTech, absorbConqueredTechnology,
    accrueObservationFragments,
} from '../lib/tech/diffusion-service';
import { INITIAL_ADAPTATION_DEBT, ADAPTATION_DEBT_DECAY } from '../lib/tech/diffusion-types';
import { getTechModifier } from '../lib/tech/modifiers';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
    if (cond) console.log(`  PASS  ${label}`);
    else { console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

/** eco_t1_1 — Automated Mining Systems, +5% eco_production_mult, 50h. */
const TECH = 'eco_t1_1';
/** esp_t3_5 — Sabotage Cells, has prerequisites. */
const GATED = 'esp_t3_5';

function makeWorld(ids: string[]) {
    const world: any = { tech: new Map(), nowSeconds: 0 };
    for (const id of ids) world.tech.set(id, TechEngine.initPlayerState(id));
    return world;
}

function main() {
    // ── 1. Fragment merging ─────────────────────────────────────────────────
    console.log('\n[1] fragments merge with diminishing returns');
    const w1 = makeWorld(['thief']);
    const thief = w1.tech.get('thief');

    addBlueprint(thief, { techId: TECH, sourceFactionId: 'victim', channel: 'espionage', fidelity: 0.3, tick: 0 });
    check('first fragment stored at 0.3', near(getBlueprint(thief, TECH)!.fidelity, 0.3));

    addBlueprint(thief, { techId: TECH, sourceFactionId: 'victim', channel: 'espionage', fidelity: 0.3, tick: 1 });
    check('two 0.3 fragments merge to 0.51', near(getBlueprint(thief, TECH)!.fidelity, 0.51),
        `got ${getBlueprint(thief, TECH)!.fidelity}`);
    check('one blueprint per tech, not two', thief.blueprints!.length === 1);

    for (let i = 0; i < 8; i++) {
        addBlueprint(thief, { techId: TECH, sourceFactionId: 'victim', channel: 'espionage', fidelity: 0.3, tick: 2 + i });
    }
    const many = getBlueprint(thief, TECH)!.fidelity;
    check('ten thefts approach but never reach certainty', many < 1 && many > 0.9, `got ${many}`);

    const owned = TechEngine.initPlayerState('owner');
    applyUnlock(owned, TECH);
    check('no blueprint for a tech already researched',
        addBlueprint(owned, { techId: TECH, sourceFactionId: 'x', channel: 'espionage', fidelity: 0.9, tick: 0 }) === null);

    // ── 2. Diffusion gradient ───────────────────────────────────────────────
    console.log('\n[2] the gradient — commodity tech is cheap to copy');
    const w2 = makeWorld(['copier', 'a', 'b', 'c', 'd', 'e']);
    const copier = w2.tech.get('copier');
    addBlueprint(copier, { techId: TECH, sourceFactionId: 'a', channel: 'espionage', fidelity: 1, tick: 0 });
    const bp2 = getBlueprint(copier, TECH)!;

    check('nobody else holds it yet', holdersOfTech(w2, TECH) === 0);
    const rare = assimilationCostMultiplier(w2, bp2);
    check('a full copy of rare tech costs the 0.4 base', near(rare, 0.4), `got ${rare}`);

    for (const id of ['a', 'b', 'c', 'd', 'e']) applyUnlock(w2.tech.get(id), TECH);
    check('five holders now', holdersOfTech(w2, TECH) === 5);
    const common = assimilationCostMultiplier(w2, bp2);
    check('widely-held tech is cheaper to copy', common < rare, `rare=${rare} common=${common}`);
    check('gradient is 5% per extra holder', near(common, 0.4 * 0.8), `got ${common}`);

    const partial = { ...bp2, fidelity: 0.5 };
    check('a half blueprint costs more than a full one',
        assimilationCostMultiplier(w2, partial as any) > common);
    check('licensed copies are cheapest',
        assimilationCostMultiplier(w2, { ...bp2, licensed: true } as any) < common);

    check('too-fragmentary blueprints are refused', !canAssimilate({ ...bp2, fidelity: 0.3 } as any).ok);
    check('half-fidelity is assimilable', canAssimilate(partial as any).ok);

    // ── 3. Assimilation is cheaper than research, and skips the chain ────────
    console.log('\n[3] copying beats deriving');
    const w3 = makeWorld(['student']);
    const student = w3.tech.get('student');
    const gatedDef = registry.get(GATED)!;
    addBlueprint(student, { techId: GATED, sourceFactionId: 'master', channel: 'conquest', fidelity: 1, tick: 0 });

    const copyTicks = assimilationTicks(w3, getBlueprint(student, GATED)!, gatedDef);
    const researchTicks = Math.ceil(gatedDef.researchCost / 6);
    check('assimilation is far faster than research', copyTicks < researchTicks,
        `copy=${copyTicks} research=${researchTicks}`);
    check('cost is 40% of the original', copyTicks === Math.ceil(gatedDef.researchCost * 0.4 / 6),
        `got ${copyTicks}`);
    check('the tech genuinely has prerequisites', gatedDef.prerequisites.length > 0);

    // ── 4. Adaptation debt ──────────────────────────────────────────────────
    console.log('\n[4] a copy runs at half strength until it is understood');
    const w4 = makeWorld(['pirate']);
    const pirate = w4.tech.get('pirate');
    addBlueprint(pirate, { techId: TECH, sourceFactionId: 'victim', channel: 'salvage', fidelity: 1, tick: 0 });

    const honest = TechEngine.initPlayerState('honest');
    applyUnlock(honest, TECH);
    const honestValue = honest.globalModifiers['eco_production_mult'];
    check('researched normally gives the full 1.05', near(honestValue, 1.05), `got ${honestValue}`);

    assimilateBlueprint(pirate, TECH);
    check('the tech is unlocked', pirate.unlockedTechIds.includes(TECH));
    check('the blueprint is consumed', getBlueprint(pirate, TECH) === undefined);
    check('debt starts at 0.5', getAdaptationDebt(pirate, TECH) === INITIAL_ADAPTATION_DEBT);
    check('only half the bonus applies (1.025)',
        near(getTechModifier(w4, 'pirate', 'eco_production_mult'), 1.025),
        `got ${getTechModifier(w4, 'pirate', 'eco_production_mult')}`);

    tickAdaptationDebt(pirate);
    check('debt repays 0.02 per tick',
        near(getAdaptationDebt(pirate, TECH), INITIAL_ADAPTATION_DEBT - ADAPTATION_DEBT_DECAY),
        `got ${getAdaptationDebt(pirate, TECH)}`);

    let ticks = 1;
    while (getAdaptationDebt(pirate, TECH) > 0 && ticks < 200) { tickAdaptationDebt(pirate); ticks++; }
    check('debt clears in ~25 ticks', ticks === 25, `took ${ticks}`);
    check('the copy ends exactly at parity with a researched original',
        near(pirate.globalModifiers['eco_production_mult'], honestValue),
        `copy=${pirate.globalModifiers['eco_production_mult']} original=${honestValue}`);
    check('debt entry removed once paid', pirate.adaptationDebt?.[TECH] === undefined);
    check('further ticks are harmless', tickAdaptationDebt(pirate).length === 0);

    // ── 5. Conquest absorption ──────────────────────────────────────────────
    console.log('\n[5] taking a world takes its archives');
    const w5 = makeWorld(['victor', 'loser']);
    applyUnlock(w5.tech.get('loser'), TECH);
    applyUnlock(w5.tech.get('loser'), 'mil_t1_1');

    const spoils = absorbConqueredTechnology(w5, 'victor', 'loser', { stability: 60 }, 0);
    check('spoils cover what the loser knew', spoils.length === 2, spoils.join(', '));
    check('intact world yields 0.3 fidelity',
        near(getBlueprint(w5.tech.get('victor'), TECH)!.fidelity, 0.3));

    const w5b = makeWorld(['victor2', 'loser2']);
    applyUnlock(w5b.tech.get('loser2'), TECH);
    absorbConqueredTechnology(w5b, 'victor2', 'loser2', { stability: 10 }, 0);
    check('a wrecked world yields half as much',
        near(getBlueprint(w5b.tech.get('victor2'), TECH)!.fidelity, 0.15),
        `got ${getBlueprint(w5b.tech.get('victor2'), TECH)!.fidelity}`);

    check('self-conquest yields nothing', absorbConqueredTechnology(w5, 'victor', 'victor', {}, 0).length === 0);
    check('unknown previous owner yields nothing',
        absorbConqueredTechnology(w5, 'victor', undefined, {}, 0).length === 0);

    // ── 6. Observation ──────────────────────────────────────────────────────
    console.log('\n[6] watching technology work teaches a little');
    const w6 = makeWorld(['watcher', 'watched']);
    applyUnlock(w6.tech.get('watched'), TECH);
    w6.espionage = {
        factionIntel: new Map([['watcher', { infiltrationLevels: { watched: 50 } }]]),
    };

    accrueObservationFragments(w6, 0);
    const observed = getBlueprint(w6.tech.get('watcher'), TECH);
    check('a fragment accrues', !!observed);
    check('it is feeble', (observed?.fidelity ?? 1) < 0.01, `got ${observed?.fidelity}`);

    for (let i = 0; i < 50; i++) accrueObservationFragments(w6, i);
    check('fifty ticks of watching still falls short of assimilable',
        getBlueprint(w6.tech.get('watcher'), TECH)!.fidelity < 0.5,
        `got ${getBlueprint(w6.tech.get('watcher'), TECH)!.fidelity}`);

    const w6b = makeWorld(['blind', 'target']);
    applyUnlock(w6b.tech.get('target'), TECH);
    w6b.espionage = { factionIntel: new Map() };
    accrueObservationFragments(w6b, 0);
    check('no presence means no learning', getBlueprint(w6b.tech.get('blind'), TECH) === undefined);

    // ── 7. Persistence ──────────────────────────────────────────────────────
    console.log('\n[7] diffusion state survives the save round trip');
    const w7 = makeWorld(['saver']);
    const saver = w7.tech.get('saver');
    addBlueprint(saver, { techId: GATED, sourceFactionId: 'v', channel: 'espionage', fidelity: 0.7, tick: 3 });
    assimilateBlueprint(saver, TECH); // no blueprint needed to exercise the debt path
    const round = deserializeWorld(serializeWorld(w7 as any)) as any;
    const back = round.tech.get('saver');

    check('blueprints survive', getBlueprint(back, GATED)?.fidelity === 0.7);
    check('blueprint provenance survives', getBlueprint(back, GATED)?.channel === 'espionage');
    check('adaptation debt survives', getAdaptationDebt(back, TECH) === INITIAL_ADAPTATION_DEBT);
    check('debt keeps repaying after a reload',
        (() => { tickAdaptationDebt(back); return near(getAdaptationDebt(back, TECH), 0.48); })(),
        `got ${getAdaptationDebt(back, TECH)}`);

    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
    process.exit(failures === 0 ? 0 : 1);
}

main();
