// scripts/buthari-probe.ts
// Are the Buthari mechanics LIVE, and is Insurgency Funding still the ONE
// espionage bonus rather than two?
//
// Covers No True Alliances, Never Aggressors, Unyielding Defence, the
// already-shipped Insurgency Funding, and the new planet population model.
//
//   npx tsx scripts/buthari-probe.ts
//
// No database, no worker. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { ensureFactionTraits, tickFactionTraits, districtTraitsFor } from '../lib/factions/traits-service';
import {
    BUTHARI_FORBIDDEN_ACTIONS,
    SACRED_TAKEN_MULTIPLIER,
    checkAggressionGate,
    hasGrievanceAgainst,
    isSacredWorld,
    recordGrievance,
} from '../lib/factions/buthari';
import { createOffer, respondToOffer, registerActOfWar, findActiveTreaty, tickDiplomacy } from '../lib/diplomacy/offer-service';
import { emptyCouncilState } from '../lib/factions/faction-traits-types';
import {
    COUNCIL,
    COUNCIL_COST_AMOUNT,
    checkCouncilGate,
    cloakedSystems,
    deployChampion,
    ensureCouncil,
    isPlanetScorched,
    revealedSystems,
} from '../lib/factions/buthari-council';
import { computeVisibility } from '../lib/movement/visibility-service';
import { colonizePlanet } from '../lib/exploration/colonize-service';
import { getTechModifier } from '../lib/tech/modifiers';
import {
    composePopulation,
    diversityIndex,
    ensurePlanetDemographics,
    refreshPlanetDemographics,
    subjugatedShare,
} from '../lib/galaxy/population-composition';

const BT = 'faction-buthari';
const OTHER = 'faction-sarrak';
const THIRD = 'faction-movanites';
const TICK = 6 * 60 * 60;

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};

const world = getGameWorldState();
ensureFactionTraits(world);
world.nowSeconds = 4_000_000;

// ── 1. Insurgency Funding is ALREADY live — assert, do not rebuild ──────────
console.log('\n[1] Insurgency Funding (already shipped by the civilization pipeline)');
{
    const success = getTechModifier(world, BT, 'esp_op_success_add');
    const exposure = getTechModifier(world, BT, 'esp_exposure_mult');
    check('the Buthari carry a large operation-success bonus', success > 0.5, `got ${success}`);
    check('and run quieter than anyone else', exposure < 1, `got ${exposure}`);
    check('a neutral faction carries neither',
        getTechModifier(world, THIRD, 'esp_op_success_add') === 0
        && getTechModifier(world, THIRD, 'esp_exposure_mult') === 1);

    // The anti-duplication assertion: nothing may add a SECOND Buthari bonus.
    // Comments are stripped first — the module header discusses these keys at
    // length precisely to explain why it must not touch them.
    const src = fs.readFileSync(path.resolve(process.cwd(), 'lib/factions/buthari.ts'), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    check('buthari.ts defines no rival espionage bonus in CODE',
        !/esp_op_success_add|esp_exposure_mult|espionage_power/.test(src),
        'a second espionage bonus would be arithmetically invisible against the 0.95 clamp');
}

// ── 2. No True Alliances ────────────────────────────────────────────────────
console.log('\n[2] No True Alliances');
{
    world.diplomacy.offers.clear();
    world.diplomacy.cooldowns.clear();
    world.treaties.clear();
    world.rivalries.clear();

    check('the Buthari cannot propose a mutual-defence treaty',
        createOffer(world, BT, { kind: 'treaty', treatyType: 'mutual_defense', toFactionId: OTHER }).success === false);
    check('and cannot be offered one either — the refusal is symmetric',
        createOffer(world, OTHER, { kind: 'treaty', treatyType: 'mutual_defense', toFactionId: BT }).success === false);
    check('two other factions may still ally',
        createOffer(world, OTHER, { kind: 'treaty', treatyType: 'mutual_defense', toFactionId: THIRD }).success === true);

    // Non-aggression is still open — this is a refusal to ALLY, not to talk.
    world.diplomacy.offers.clear();
    world.diplomacy.cooldowns.clear();
    const nap = createOffer(world, BT, { kind: 'treaty', treatyType: 'non_aggression', toFactionId: OTHER });
    check('a non-aggression pact is still allowed', nap.success === true, nap.message);

    const offer = [...world.diplomacy.offers.values()].find(o => o.kind === 'treaty' && o.status === 'pending')!;
    respondToOffer(world, OTHER, offer.id, 'accept');
    const treaty = findActiveTreaty(world, BT, OTHER, 'non_aggression');
    check('the pact is signed', !!treaty);
    check('and it is TEMPORARY — a Buthari accord always carries an expiry',
        Number.isFinite(treaty?.expiresAtTick) && (treaty!.expiresAtTick as number) > world.nowSeconds,
        `expiresAtTick=${treaty?.expiresAtTick}`);

    // The expiry must actually fire.
    world.nowSeconds = (treaty!.expiresAtTick as number) + TICK;
    tickDiplomacy(world);
    check('the pact lapses on its own',
        world.treaties.get(treaty!.id)?.status === 'suspended',
        `status=${world.treaties.get(treaty!.id)?.status}`);
    check('and a lapsed pact no longer counts as active',
        !findActiveTreaty(world, BT, OTHER, 'non_aggression'));

    // Anti-dormancy: prove the thing they are denied is real.
    world.treaties.clear();
    world.rivalries.clear();
    world.nowSeconds = 4_000_000;
    createOffer(world, OTHER, { kind: 'treaty', treatyType: 'mutual_defense', toFactionId: THIRD });
    const allyOffer = [...world.diplomacy.offers.values()].find(o => o.treatyType === 'mutual_defense' && o.status === 'pending')!;
    respondToOffer(world, THIRD, allyOffer.id, 'accept');
    registerActOfWar(world, BT, OTHER);
    const dragged = world.rivalries.get(`rivalry-${THIRD}-${BT}`) ?? world.rivalries.get(`rivalry-${BT}-${THIRD}`);
    check('a real mutual-defence treaty drags the ally into the war',
        (dragged?.escalationLevel ?? 0) >= 7,
        'the thing the Buthari are denied must itself be live, or the drawback is free');
}

// ── 3. Never Aggressors ─────────────────────────────────────────────────────
console.log('\n[3] Never Aggressors');
{
    world.rivalries.clear();
    const traits = world.factionTraits!.get(BT)!;
    traits.buthari = { grievances: {}, purityDisputes: 0, lastEvaluatedSeconds: 0, council: emptyCouncilState() };

    for (const action of Object.keys(BUTHARI_FORBIDDEN_ACTIONS)) {
        const res = checkAggressionGate(world, BT, action);
        if (res.allowed) { failures++; console.log(`  FAIL  ${action} was permitted unprovoked`); }
    }
    console.log(`  ok    all ${Object.keys(BUTHARI_FORBIDDEN_ACTIONS).length} kinetic verbs refused unprovoked`);
    check('the refusal carries a reason',
        !!checkAggressionGate(world, BT, 'MIL_INVASION_PLANET').reason);

    // THE anti-overreach assertion. Their subversion must stay open — copying
    // the Bloodmoon list would forbid the one thing they exist to do.
    for (const action of ['ESP_LAUNCH_OP', 'ESP_INCITE_UNREST', 'ESP_SABOTAGE_FACILITY', 'DIP_IMPOSE_SANCTIONS', 'PIR_SPONSOR_ORG']) {
        check(`${action} stays ALLOWED — subversion is the whole point`,
            checkAggressionGate(world, BT, action).allowed === true);
    }
    check('another faction is never gated',
        checkAggressionGate(world, OTHER, 'MIL_INVASION_PLANET').allowed === true);

    // A grievance unlocks retaliation — against that faction only.
    registerActOfWar(world, OTHER, BT);
    check('being attacked records a grievance', hasGrievanceAgainst(world, BT, OTHER));
    check('and unlocks retaliation against the aggressor',
        checkAggressionGate(world, BT, 'MIL_INVASION_PLANET', OTHER).allowed === true);
    check('but NOT against an uninvolved third party',
        checkAggressionGate(world, BT, 'MIL_INVASION_PLANET', THIRD).allowed === false);

    // Persistence — this is the assertion that catches a Map in the state shape.
    const round = deserializeWorld(serializeWorld(world));
    ensureFactionTraits(round);
    check('grievances survive a save/load round trip',
        hasGrievanceAgainst(round, BT, OTHER));
}

// ── 4. Unyielding Defence ───────────────────────────────────────────────────
console.log('\n[4] Unyielding Defence');
{
    const home: any = [...world.construction.planets.values()]
        .find((p: any) => p.ownerId === BT && (p.tags ?? []).includes('homeworld'));
    // Factions start capital-only now — found an ordinary colony the way the
    // live game does, on one of the home system's unowned bodies.
    {
        const body = [...world.construction.planets.values()]
            .find((p: any) => !p.ownerId && p.systemId === home?.systemId && (p.tags ?? []).includes('colonizable'));
        if (body) {
            const res = colonizePlanet(world, BT, body.id);
            if (!res.ok) console.error(`  (colonize for probe failed: ${res.reason})`);
        }
    }
    const plain: any = [...world.construction.planets.values()]
        .find((p: any) => p.ownerId === BT && !(p.tags ?? []).includes('homeworld') && !(p.tags ?? []).includes('fortified'));

    check('the Buthari hold a homeworld', !!home);
    check('and an ordinary colony', !!plain);
    check('the homeworld is sacred', isSacredWorld(home, BT));
    check('an ordinary colony is not', !isSacredWorld(plain, BT));
    check('a world they do not own is never sacred to them',
        !isSacredWorld({ ...home, ownerId: OTHER }, BT));

    const onSacred = districtTraitsFor(world, BT, 'mountains', home);
    const onColony = districtTraitsFor(world, BT, 'mountains', plain);
    check('they bleed less on sacred ground',
        onSacred.taken < 1 && onSacred.taken === SACRED_TAKEN_MULTIPLIER, `taken=${onSacred.taken}`);
    check('but not everywhere', onColony.taken === 1, `taken=${onColony.taken}`);
    check('it is defensive only — no offensive bonus', onSacred.dealt === 1);
    check('another faction gets nothing from a Buthari homeworld',
        districtTraitsFor(world, THIRD, 'mountains', home).taken === 1);

    // The dispatcher must still serve the Sarrak.
    const sarrakJungle = districtTraitsFor(world, OTHER, 'jungle', plain);
    check('the dispatcher still routes Sarrak biome affinity', sarrakJungle.dealt > 1,
        `dealt=${sarrakJungle.dealt} — the layering move must not have dropped Sarrak`);
}

// ── 5. Population composition ───────────────────────────────────────────────
console.log('\n[5] Planet population composition');
{
    const seeded = ensurePlanetDemographics(world);
    console.log(`  composed ${seeded} world(s)`);

    const owned: any[] = [...world.construction.planets.values()].filter((p: any) => p.ownerId);
    check('every owned world has a census', owned.every(p => (p.demographics?.length ?? 0) > 0));
    check('every census sums to 100%',
        owned.every(p => Math.abs(p.demographics.reduce((s: number, b: any) => s + b.percentage, 0) - 100) < 0.01),
        'a band list that does not sum to 100 renders as a broken bar chart');
    check('no world still carries the placeholder species',
        !owned.some(p => p.demographics.some((b: any) => b.speciesId === 'species-human' || b.speciesId === 'species-colonist')));

    // Different civilizations must read differently — the whole point.
    const btHome: any = owned.find(p => p.ownerId === BT && (p.tags ?? []).includes('homeworld'));
    const skHome: any = owned.find(p => p.ownerId === OTHER && (p.tags ?? []).includes('homeworld'));
    check('a Buthari homeworld is populated by Buthari',
        btHome?.demographics?.[0]?.name === 'Buthari', btHome?.demographics?.[0]?.name);
    check('a Sarrak homeworld is populated by Sarrak',
        skHome?.demographics?.[0]?.name === 'Sarrak', skHome?.demographics?.[0]?.name);
    check('a homeworld is more homogeneous than a colony',
        diversityIndex(btHome?.demographics) < 0.5, `diversity=${diversityIndex(btHome?.demographics).toFixed(2)}`);

    // Deterministic.
    const before = JSON.stringify(btHome.demographics);
    refreshPlanetDemographics(world, btHome);
    check('composition is deterministic in the planet id', JSON.stringify(btHome.demographics) === before);

    // Conquest leaves the conquered population in place.
    const victim: any = owned.find(p => p.ownerId === THIRD && !(p.tags ?? []).includes('homeworld'));
    if (victim) {
        const previous = victim.ownerId;
        victim.ownerId = OTHER;
        refreshPlanetDemographics(world, victim, previous);
        const conquered = victim.demographics.find((b: any) => b.name === 'Movanite');
        check('a conquered people remain on the ground under the new flag', !!conquered,
            victim.demographics.map((b: any) => b.name).join(', '));
        check('the world remembers who held it', victim.conqueredFrom === previous);

        // And a Sarrak slave world renders them as unfree.
        const traits = world.factionTraits!.get(OTHER)!;
        traits.sarrak!.slaveWorlds[victim.id] = { conqueredAtSeconds: world.nowSeconds, previousOwnerId: previous };
        refreshPlanetDemographics(world, victim, previous);
        check('a Sarrak slave world shows its population as unfree',
            subjugatedShare(victim.demographics) > 0,
            victim.demographics.map((b: any) => `${b.name}:${b.socialClass}`).join(', '));
    }

    const round = deserializeWorld(serializeWorld(world));
    const rp: any = [...round.construction.planets.values()].find((p: any) => p.id === btHome.id);
    check('a census survives a save/load round trip', (rp?.demographics?.length ?? 0) > 0);
}

// ── 5b. The Council of Five ─────────────────────────────────────────────────
console.log('\n[5b] The Council of Five');
{
    world.nowSeconds = 6_000_000;
    ensureCouncil(world, BT);
    const council = world.factionTraits!.get(BT)!.buthari!.council;
    council.cooldowns = {}; council.cloakedSystems = {}; council.revealedSystems = {}; council.scorchedPlanets = {};

    check('all five champions are catalogued', Object.keys(COUNCIL).length === 5);
    check('the Buthari hold sacred flora to pay with',
        ((world.economy.factions.get(BT)!.reserves as any).SACRED_FLORA ?? 0) >= COUNCIL_COST_AMOUNT);
    check('and the Gabagoonians hold their own luxury',
        ((world.economy.factions.get('faction-gabagoonians')!.reserves as any).CAPACOLA ?? 0) > 0);
    check('nobody else holds sacred flora',
        (world.economy.factions.get(THIRD)!.reserves as any).SACRED_FLORA === undefined);

    check('only Jabal may call the Five',
        checkCouncilGate(world, THIRD, 'zughra_flame').allowed === false);
    check('an unknown champion is refused',
        checkCouncilGate(world, BT, 'not_a_champion').allowed === false);
    check('a rested champion may be called',
        checkCouncilGate(world, BT, 'zughra_flame').allowed === true);

    // Zughra — the one with a live engine consumer.
    const besieged: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === BT);
    const zughra = deployChampion(world, BT, 'zughra_flame', besieged.id);
    check('Zughra answers', zughra.success === true, zughra.message);
    check('the world is scorched', isPlanetScorched(world, besieged.id));
    check('and she is now in seclusion',
        checkCouncilGate(world, BT, 'zughra_flame').allowed === false);
    check('but her sisters are not — the cooldown is per champion',
        checkCouncilGate(world, BT, 'barra_shadow').allowed === true);

    // Barra and Rahla — the two that needed the visibility hook.
    const sysId = besieged.systemId;
    check('Barra veils a system', deployChampion(world, BT, 'barra_shadow', sysId).success === true);
    check('the veil is recorded', cloakedSystems(world).has(sysId));

    const otherSys = [...world.movement.systems.keys()][7];
    check('Rahla opens a system to Jabal', deployChampion(world, BT, 'rahla_vision', otherSys).success === true);
    check('the sight is recorded', revealedSystems(world, BT).has(otherSys));
    check('and is granted to the Buthari alone', !revealedSystems(world, THIRD).has(otherSys));

    // THE assertion that proves the visibility hook works: a rival must lose a
    // system it can otherwise see, and the never-downgrade rule must not undo it.
    const rivalSees = computeVisibility(THIRD, world.movement);
    const rivalBlind = computeVisibility(THIRD, world.movement, { hidden: new Set([sysId]) });
    check('a veiled system vanishes for a rival even if previously seen',
        rivalBlind[sysId] === undefined,
        'pickHigherStage would otherwise reassert a stage seen last week');
    check('the veil is surgical — other systems are untouched',
        Object.keys(rivalBlind).length >= Object.keys(rivalSees).length - 1);

    const butSees = computeVisibility(BT, world.movement, { revealed: new Set([otherSys]) });
    check('a revealed system is fully surveyed regardless of sensors',
        butSees[otherSys]?.revealStage === 'surveyed', butSees[otherSys]?.revealStage);
    check('default behaviour is unchanged when no override is passed',
        JSON.stringify(computeVisibility(THIRD, world.movement)) === JSON.stringify(rivalSees));

    // Thamir — refuses to strike Jabal's own works.
    check('the Serpent will not strike a Buthari world',
        deployChampion(world, BT, 'thamir_sabotage', besieged.id).success === false);

    // Effects lapse — advance past the LONGEST of them, not the first.
    const longest = Math.max(...Object.values(COUNCIL).map(c => c.durationSeconds));
    world.nowSeconds += longest + TICK;
    world.factionTraits!.get(BT)!.buthari!.lastEvaluatedSeconds = world.nowSeconds - TICK;
    tickFactionTraits(world);
    check('Zughra\'s fire burns out', !isPlanetScorched(world, besieged.id));
    check('and Barra\'s veil lifts', !cloakedSystems(world).has(sysId));

    // Persistence.
    const round = deserializeWorld(serializeWorld(world));
    check('council state survives a save/load round trip',
        !!round.factionTraits?.get(BT)?.buthari?.council,
        'a nested Map here would deserialise as a bare object and read as undefined');
    check('cooldowns survive too',
        Object.keys(round.factionTraits!.get(BT)!.buthari!.council.cooldowns).length > 0);

    check('the dead hero-actions.ts is gone',
        !fs.existsSync(path.resolve(process.cwd(), 'lib/mechanics/hero-actions.ts')),
        'leaving it means the next person wires up the wrong catalog');
}

// ── 6. Wiring ───────────────────────────────────────────────────────────────
console.log('\n[6] Wiring');
{
    const src = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
    check('the dispatcher runs tickButhari',
        /case BUTHARI_CIV_ID:[\s\S]{0,120}tickButhari\(world, traits\)/.test(src('lib/factions/traits-service.ts')));
    check('executeOrder applies the aggression gate',
        /checkAggressionGate\(\s*world, factionId, actionId/.test(src('scripts/game-loop.ts')));
    check('invasion records a grievance — it bypasses registerActOfWar',
        /case 'MIL_INVASION_PLANET'[\s\S]{0,900}recordGrievance\(world, planet\.ownerId, factionId/.test(src('scripts/game-loop.ts')));
    check('bombardment records one too',
        /case 'MIL_BOMBARD_PLANET'[\s\S]{0,900}recordGrievance\(world, planet\.ownerId, factionId/.test(src('scripts/game-loop.ts')));
    check('registerActOfWar records the aggressor before discarding the roles',
        /recordGrievanceLocal\(world, defenderId, aggressorId, 'attacked'\)/.test(src('lib/diplomacy/offer-service.ts')));
    check('createOffer refuses Buthari alliances in both directions',
        /isButhari\(world, fromFactionId\) \|\| isButhari\(world, toFactionId\)/.test(src('lib/diplomacy/offer-service.ts')));
    check('the worker composes demographics at boot',
        /ensurePlanetDemographics\(world\)/.test(src('scripts/game-loop.ts')));
    check('and recomposes them on conquest',
        /refreshPlanetDemographics\(world, planet, previousOwnerId\)/.test(src('scripts/game-loop.ts')));
    check('the worker handles the champion order',
        /case 'BUT_DEPLOY_CHAMPION'/.test(src('scripts/game-loop.ts')));
    check('the siege tick applies Zughra attrition',
        src('scripts/game-loop.ts').includes('isPlanetScorched(world, planet.id)'));
    check('the visibility tick passes the Council override',
        src('lib/time/tick-processor.ts').includes('computeVisibility(factionId, world.movement, override)'));
    check('the SOCIETY tab reports diversity',
        /Diversity/.test(src('components/construction/PlanetConstructionPanel.tsx')));
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ Buthari mechanics live; population composition is real\n`);
process.exit(failures ? 1 : 0);
