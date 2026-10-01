// scripts/test-charter-rogue.ts
// Charter companies, part two: what a rogue company actually does, that the
// press hears about it, and that AI governments charter companies of their own.
// Run: npx tsx scripts/test-charter-rogue.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries } from '../lib/politics/registry';
import { ensureGovernments, getGovernment } from '../lib/government/government-service';
import { CHARTER_TECH_ID, ROGUE_GRACE_SECONDS } from '../lib/economy/corporate/charter-service';
import { ensureCorporateState, tickAllCompanies } from '../lib/economy/corporate/company-registry';
import { grantCharter, nationalizeCompany } from '../lib/economy/corporate/charter-orders';
import {
    defectableFleets,
    findPatron,
    secedableWorlds,
    tickRogueCompanies,
} from '../lib/economy/corporate/rogue-service';
import { resolveDemand } from '../lib/economy/corporate/corporate-politics';
import { runCharterAI, draftCharter } from '../lib/ai/charter-ai';
import { ensurePiracyState } from '../lib/piracy/organization-service';
import { drainBuffer, resetChronicleBuffer } from '../lib/narrative/chronicle';
import { TemplateWriter } from '../lib/narrative/prose/template-writer';
import type { CharterTerms } from '../lib/economy/corporate/charter-types';

const TICK = 6 * 3600;

function setCredits(world: any, factionId: string, amount: number): void {
    (world.economy.factions.get(factionId)!.reserves as Record<string, number>)['CREDITS'] = amount;
}

function giveTech(world: any, factionId: string): void {
    world.tech.set(factionId, {
        factionId, unlockedTechIds: [CHARTER_TECH_ID], activeEffects: [], activeSlots: [],
        maxSlots: 1, globalModifiers: {}, researchPoints: 0, lockedTechIds: [],
    });
}

function chronicleTypes(): string[] {
    return drainBuffer().rows.map(r => r.type);
}

async function main() {
    initRegistries();
    const world = getGameWorldState() as any;
    ensureEmpirePostures(world);
    ensureGovernments(world);
    const corp = ensureCorporateState(world);
    if (!(world.secessionCrises instanceof Map)) world.secessionCrises = new Map();
    if (!world.nowSeconds || world.nowSeconds <= 0) world.nowSeconds = 1_000_000;
    resetChronicleBuffer();

    const founder = 'faction-aurelian';
    const rival = 'faction-vektori';
    for (const id of [founder, rival]) {
        giveTech(world, id);
        setCredits(world, id, 2_000_000);
        const gov = getGovernment(world, id)!;
        gov.politicalCapital = gov.politicalCapitalCap ?? 100;
        gov.legitimacy = 80;
    }
    const capital = world.economy.factions.get(founder).capitalSystemId
        ?? [...world.movement.systems.keys()][0];

    // A colony world of the founder's, outside the capital system.
    // (Ownership on the system node is derived by the worker; set it here.)
    const capitals = new Set([...world.economy.factions.values()].map((f: any) => f.capitalSystemId));
    world.movement.systems.get(capital).ownerFactionId = founder;
    const colonySystem = [...world.movement.systems.values()].find((s: any) => !capitals.has(s.id) && !s.ownerFactionId)!;
    colonySystem.ownerFactionId = founder;
    const colonyPlanet = [...world.construction.planets.values()].find((p: any) => p.systemId === colonySystem.id)
        ?? (() => {
            const template = [...world.construction.planets.values()][0] as any;
            const planet = { ...template, id: 'planet-test-company-colony', name: 'Company Landing', systemId: colonySystem.id };
            world.construction.planets.set(planet.id, planet);
            return planet;
        })();
    (colonyPlanet as any).ownerId = founder;

    // ── 1. Granting a charter is on the record ───────────────────────────────
    const terms: CharterTerms = {
        mission: 'colonization',
        territory: 'frontier',
        rights: [
            'build_infrastructure', 'establish_colonies', 'govern_colonies', 'own_stations',
            'armed_escorts', 'private_fleets',
        ],
        ownership: { government: 30, privateInvestors: 40, foreignInvestors: 20, publicShares: 10 },
        profitShareToState: 0.15,
    };
    // Six rights and a frontier remit cost more capital than any government
    // holds at once — in play such a charter is written by amendment, over time.
    getGovernment(world, founder)!.politicalCapital = 400;
    const granted = grantCharter(world, founder, {
        baseName: 'Outer Reach', headquartersSystemId: capital, terms, foundingCapital: 200_000,
    });
    assert.ok(granted.ok, `charter must be granted: ${(granted as any).error}`);
    const company = (granted as any).company;
    assert.deepStrictEqual(chronicleTypes(), ['charter_granted'], 'granting a charter must reach the chronicle');
    console.log('[1] charter granted and chronicled');

    // ── 2. Going rogue opens a clock, not a catastrophe ──────────────────────
    company.corporateColonies.push(colonySystem.id);
    company.presenceSystemIds.push(colonySystem.id);
    company.privateFleetSize = 60;
    company.operatingFactionIds = [rival];
    assert.deepStrictEqual(secedableWorlds(world, company), [colonyPlanet.id], 'the colony world is secedable; the capital never is');
    assert.ok(defectableFleets(company) >= 2, 'a 60-strength private fleet yields squadrons');
    assert.strictEqual(findPatron(world, company), rival, 'an empire it operates inside is a patron');

    // A second armed company with nowhere to defect to: no foreign holder, no
    // foreign operations. What it does with its fleet is a different story.
    const armed = grantCharter(world, founder, {
        baseName: 'Blackfall', headquartersSystemId: capital, foundingCapital: 100_000,
        terms: {
            mission: 'shipbuilding', territory: 'domestic', rights: ['build_infrastructure', 'armed_escorts'],
            ownership: { government: 100, privateInvestors: 0, foreignInvestors: 0, publicShares: 0 },
            profitShareToState: 0.15,
        },
    });
    assert.ok(armed.ok, `second charter: ${(armed as any).error}`);
    const outlaw = (armed as any).company;
    outlaw.privateFleetSize = 60;
    outlaw.presenceSystemIds.push(colonySystem.id);
    assert.strictEqual(findPatron(world, outlaw), null, 'a wholly state-owned domestic company has no patron to run to');
    chronicleTypes();

    for (const c of [company, outlaw]) {
        c.autonomyLevel = 90;
        c.lastGrowthAt = world.nowSeconds;   // keep the growth engine out of the way
    }
    tickAllCompanies(corp, world, TICK);
    assert.ok(company.hasGoneRogue && outlaw.hasGoneRogue, 'autonomy past the line latches rogue');
    assert.deepStrictEqual(tickRogueCompanies(world), [], 'no break on the tick it goes rogue');
    assert.strictEqual(company.rogueSince, world.nowSeconds, 'the clock starts');
    assert.ok(chronicleTypes().includes('company_went_rogue'), 'going rogue is news');
    assert.strictEqual(world.secessionCrises.size, 0, 'nothing has been taken yet');
    console.log('[2] rogue company is on the clock');

    // ── 3. The founder can still stop it: a second company, nationalised ─────
    const second = grantCharter(world, founder, {
        baseName: 'Pale Horizon', headquartersSystemId: capital,
        terms: draftCharter('trade'), foundingCapital: 60_000,
    });
    assert.ok(second.ok);
    const tame = (second as any).company;
    tame.hasGoneRogue = true;
    tame.autonomyLevel = 95;
    tickRogueCompanies(world);
    assert.strictEqual(tame.rogueSince, world.nowSeconds);
    getGovernment(world, founder)!.politicalCapital = 200;
    const seized = nationalizeCompany(world, founder, tame.id);
    assert.ok(seized.ok, `nationalisation must succeed: ${(seized as any).error}`);
    assert.strictEqual(tame.rogueSince, undefined, 'seizing a company stops its clock');
    chronicleTypes();

    // ── 4. Time runs out: the company leaves with what the charter gave it ───
    world.nowSeconds += ROGUE_GRACE_SECONDS - TICK;
    assert.deepStrictEqual(tickRogueCompanies(world), [], 'not before the deadline');
    world.nowSeconds += TICK;
    const treasuryBefore = outlaw.treasury;
    const breaks = tickRogueCompanies(world);
    assert.strictEqual(breaks.length, 2, 'exactly the two un-answered companies break; the nationalised one does not');
    const broke = breaks.find(b => b.companyId === company.id)!;
    const brokeOutlaw = breaks.find(b => b.companyId === outlaw.id)!;

    assert.strictEqual(broke.worldsSeceding, 1);
    const crisis = world.secessionCrises.get(broke.secessionCrisisId);
    assert.ok(crisis && crisis.status === 'open', 'the colony opens a real secession crisis');
    assert.strictEqual(crisis.factionId, founder);
    assert.match(crisis.name, /Outer Reach Company Secession/);
    assert.deepStrictEqual(crisis.planetIds, [colonyPlanet.id]);

    // With a patron to go to, the company takes its ships along: no corsairs.
    assert.strictEqual(broke.fleetsDefected, 0, 'a defecting company keeps its fleet');
    assert.strictEqual(company.privateFleetSize, 60);
    assert.strictEqual(company.pirateOrganizationId, undefined);

    // With no flag left to sail under, the squadrons turn corsair instead.
    assert.strictEqual(brokeOutlaw.patronId, null);
    assert.ok(brokeOutlaw.fleetsDefected >= 2, 'the squadrons leave');
    const org = ensurePiracyState(world).organizations.get(brokeOutlaw.pirateOrganizationId ?? '') as any;
    assert.ok(org, 'and found a corsair band');
    assert.strictEqual(org.origin, 'corporate_deniable');
    assert.strictEqual(org.fleetIds.length, brokeOutlaw.fleetsDefected);
    for (const fleetId of org.fleetIds) {
        const fleet = world.movement.fleets.get(fleetId);
        assert.ok(fleet && fleet.factionId === 'faction-pirates', 'as real fleets on the map');
        assert.notStrictEqual(fleet.currentSystemId, capital, 'mustered away from the capital');
    }
    assert.ok(org.treasury > 0 && outlaw.treasury < treasuryBefore, 'they took the payroll');
    assert.ok(outlaw.privateFleetSize < 60, 'the company is left with a rump');
    assert.strictEqual(outlaw.pirateOrganizationId, org.id);
    assert.ok(outlaw.hasGoneRogue && outlaw.foundingFactionId === founder, 'and stays a rogue company on its founder\'s books');

    assert.strictEqual(broke.patronId, rival);
    assert.strictEqual(company.foundingFactionId, rival, 'the charter changed flags');
    assert.ok(!company.hasGoneRogue && company.rogueSince === undefined, 'and is no longer rogue under its new patron');
    assert.ok(!corp.factionStates.get(founder)!.charteredCompanyIds.includes(company.id));
    assert.ok(corp.factionStates.get(rival)!.charteredCompanyIds.includes(company.id));
    assert.ok(company.operatingFactionIds.includes(founder), "its holdings in the old founder's space are now foreign operations");
    assert.ok(!company.corporateColonies.includes(colonySystem.id), 'it no longer governs worlds the old founder owns');

    const rows = drainBuffer().rows;
    const breakRow = rows.find(r => r.type === 'company_broke_away' && JSON.parse(r.facts).defected === true);
    assert.ok(breakRow, 'the break is chronicled');
    assert.strictEqual(rows.filter(r => r.type === 'company_broke_away').length, 2);
    assert.ok(rows.some(r => r.type === 'secession_declared'), 'and so is the secession it caused');
    assert.deepStrictEqual(JSON.parse(breakRow!.targetIds), [rival], 'the patron is named, so the two powers have a grievance');

    assert.deepStrictEqual(tickRogueCompanies(world), [], 'a company breaks once per episode');
    console.log(`[4] one company took ${broke.worldsSeceding} world and its charter to ${broke.patronId}; the other turned ${brokeOutlaw.fleetsDefected} squadrons corsair`);

    // ── 5. The press can write all of it without a model ─────────────────────
    const writer = new TemplateWriter();
    const article = await writer.write({
        lead: {
            id: 'evt-test', type: 'company_broke_away', tick: breakRow!.tick, day: breakRow!.day,
            importance: breakRow!.importance, actorIds: [founder], targetIds: [rival],
            actorNames: JSON.parse(breakRow!.actorNames), targetNames: JSON.parse(breakRow!.targetNames),
            location: breakRow!.location, facts: JSON.parse(breakRow!.facts), attribution: 'exposed',
        },
        events: [], visibleActors: JSON.parse(breakRow!.actorNames), speculative: false,
        memory: { feud: null, precedents: [], isReversal: false, isGalacticFirst: false },
        stance: { publisher: { type: 'WIRE', masthead: 'The Galactic Wire' }, slant: 'neutral', coveringOwnEmpire: false },
    } as any);
    assert.match(article.headline, /Outer Reach Charter Company defects from/);
    assert.ok(!/reported at|Details remain thin/.test(article.body), 'a real template, not the fallback');
    console.log(`[5] "${article.headline}"`);

    // ── 6. A concession cannot write the same right into a charter twice ─────
    tame.nationalized = false;
    tame.rights = ['build_infrastructure', 'purchase_land'];
    corp.demands.set('d-test', {
        id: 'd-test', companyId: tame.id, factionId: founder, type: 'deregulation', text: '', severity: 2,
        issuedAt: world.nowSeconds, expiresAt: world.nowSeconds + 1e6, status: 'pending', concession: '', threat: '',
    });
    assert.ok(resolveDemand(corp, 'd-test', 'accept', world, world.nowSeconds).ok);
    assert.strictEqual(tame.rights.filter((r: string) => r === 'purchase_land').length, 1);
    tame.nationalized = true;
    console.log('[6] deregulation does not duplicate rights');

    // ── 7. AI governments charter, and answer their companies ────────────────
    const ai = [...world.economy.factions.keys()].find((id: any) =>
        id !== founder && id !== rival && id !== 'faction-pirates' && id !== 'faction-neutral') as string | undefined;
    assert.ok(ai, 'the test world needs a third empire');
    giveTech(world, ai);
    setCredits(world, ai!, 1_000_000);
    const aiGov = getGovernment(world, ai!)!;
    aiGov.legitimacy = 80;

    assert.deepStrictEqual(runCharterAI(world, ai!, 'survival'), [], 'a state fighting for its life charters nothing');

    // 'consolidating' on purpose: every empire starts on one world, and the
    // AI reads anything under four worlds as consolidating. Gating chartering
    // on the 'normal' stance meant no AI chartered in a whole simulated season.
    let chartered: any = null;
    for (let i = 0; i < 80 && !chartered; i++) {
        world.nowSeconds += TICK;
        aiGov.politicalCapital = aiGov.politicalCapitalCap ?? 100;
        runCharterAI(world, ai!, 'consolidating');
        chartered = [...corp.companies.values()].find(c => c.foundingFactionId === ai);
    }
    assert.ok(chartered, 'a small AI empire in good order charters a company');
    assert.ok(chartered.rights.length > 0 && chartered.treasury >= 40_000);
    assert.ok(chronicleTypes().includes('charter_granted'));
    const creditsAfter = world.economy.factions.get(ai).reserves['CREDITS'];
    assert.ok(creditsAfter < 1_000_000, 'and pays for its stake like anyone else');

    // One company for a small empire: it does not keep founding them.
    for (let i = 0; i < 40; i++) {
        world.nowSeconds += TICK;
        aiGov.politicalCapital = aiGov.politicalCapitalCap ?? 100;
        runCharterAI(world, ai!, 'normal');
    }
    const worlds = [...world.construction.planets.values()].filter((p: any) => p.ownerId === ai).length;
    const owned = [...corp.companies.values()].filter(c => c.foundingFactionId === ai).length;
    assert.ok(owned <= (worlds >= 6 ? 2 : 1), `AI holds ${owned} companies on ${worlds} worlds`);

    corp.demands.set('d-ai', {
        id: 'd-ai', companyId: chartered.id, factionId: ai!, type: 'lower_taxes', text: '', severity: 1,
        issuedAt: world.nowSeconds, expiresAt: world.nowSeconds + 1e6, status: 'pending', concession: '', threat: '',
    });
    corp.demands.set('d-ai-sov', {
        id: 'd-ai-sov', companyId: chartered.id, factionId: ai!, type: 'senate_representation', text: '', severity: 3,
        issuedAt: world.nowSeconds, expiresAt: world.nowSeconds + 1e6, status: 'pending', concession: '', threat: '',
    });
    aiGov.politicalCapital = aiGov.politicalCapitalCap ?? 100;
    runCharterAI(world, ai!, 'normal');
    assert.strictEqual(corp.demands.get('d-ai')!.status, 'accepted', 'a commercial favour is granted');
    assert.strictEqual(corp.demands.get('d-ai-sov')!.status, 'negotiated', 'a piece of the state is bargained over, not handed out');

    chartered.hasGoneRogue = true;
    chartered.autonomyLevel = 95;
    aiGov.politicalCapital = 200;
    runCharterAI(world, ai!, 'normal');
    assert.ok(chartered.nationalized && !chartered.hasGoneRogue, 'an AI that can afford it seizes a rogue company');
    console.log(`[7] ${ai} chartered ${chartered.charter.fullName} (${chartered.mission}) and governs it`);

    console.log('\nAll charter rogue/AI/chronicle checks passed.');
}

main().catch(e => { console.error(e); process.exit(1); });
