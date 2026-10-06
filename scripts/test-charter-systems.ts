// scripts/test-charter-systems.ts
// Charter companies, part three: terms and renewal, concessions with real
// effects, mission services, raidable works, foreign board control, and the
// Commerce map overlay.
// Run: npx tsx scripts/test-charter-systems.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries } from '../lib/politics/registry';
import { ensureGovernments, getGovernment } from '../lib/government/government-service';
import { computeParties } from '../lib/government/parliament-service';
import { GALACTIC_DAY_SIM_SECONDS } from '../lib/time/time-config';
import {
    CHARTER_TECH_ID,
    REFLAG_HOLD_SECONDS,
    activeAssets,
    creditLineAvailable,
    ownershipPercent,
    stateTermsCost,
    validateCharter,
} from '../lib/economy/corporate/charter-service';
import { ensureCorporateState, tickAllCompanies } from '../lib/economy/corporate/company-registry';
import { grantCharter } from '../lib/economy/corporate/charter-orders';
import {
    RENEWAL_WINDOW_SECONDS,
    resolveRenewal,
    tickCharterRenewals,
    wouldDefyLapse,
} from '../lib/economy/corporate/charter-renewal';
import { resolveDemand } from '../lib/economy/corporate/corporate-politics';
import { drawStateLoan, serviceRate, tickMissionServices } from '../lib/economy/corporate/mission-services';
import { raidExposure, tickAssetRaids } from '../lib/economy/corporate/asset-raids';
import { reflagCharter, tickBoardControl } from '../lib/economy/corporate/foreign-control';
import { findPatron } from '../lib/economy/corporate/rogue-service';
import { issueDividends } from '../lib/economy/corporate/company-service';
import { GROWTH_INTERVAL_SECONDS, runGrowthCycle } from '../lib/economy/corporate/corporate-ai';
import { MAX_WORKS_PER_SYSTEM } from '../lib/economy/corporate/charter-catalog';
import { hostileTakeover } from '../lib/economy/corporate/shareholder-service';
import { leakCompanyBooks } from '../lib/economy/corporate/corporate-events';
import { foundOrganization } from '../lib/piracy/organization-service';
import { createRaiderFleet } from '../lib/piracy/emergence-service';
import { RNG, seedFromString } from '../lib/trade-system/rng';
import { resetChronicleBuffer, drainBuffer } from '../lib/narrative/chronicle';
import { computeOverlayStyles } from '../lib/galaxy/overlays';
import type { CharterTerms, CorporateAsset, CorporateAssetType, CorporateDemandType } from '../lib/economy/corporate/charter-types';

const TICK = 6 * 3600;
const GD = GALACTIC_DAY_SIM_SECONDS;

function reserves(world: any, factionId: string): Record<string, number> {
    return world.economy.factions.get(factionId)!.reserves as Record<string, number>;
}

function terms(mission: CharterTerms['mission'], extra: Partial<CharterTerms> = {}): CharterTerms {
    return {
        mission,
        territory: 'frontier',
        rights: ['build_infrastructure', 'purchase_land', 'own_stations'],
        ownership: { government: 40, privateInvestors: 30, foreignInvestors: 20, publicShares: 10 },
        profitShareToState: 0.15,
        ...extra,
    };
}

function main() {
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
        world.tech.set(id, {
            factionId: id, unlockedTechIds: [CHARTER_TECH_ID], activeEffects: [],
            activeSlots: [{ slotId: 's1', techId: 'x', status: 'researching', ticksCompleted: 0, ticksRequired: 100, progressHours: 0 }],
            maxSlots: 1, globalModifiers: {}, researchPoints: 0, lockedTechIds: [],
        });
        reserves(world, id)['CREDITS'] = 5_000_000;
        getGovernment(world, id)!.legitimacy = 80;
    }
    const refillCapital = (id = founder) => { getGovernment(world, id)!.politicalCapital = 400; };
    const capital = world.economy.factions.get(founder).capitalSystemId;
    world.movement.systems.get(capital).ownerFactionId = founder;
    const capitals = new Set([...world.economy.factions.values()].map((f: any) => f.capitalSystemId));
    const free = [...world.movement.systems.values()].filter((s: any) => !capitals.has(s.id) && !s.ownerFactionId);
    const [sysA, sysB, sysC] = free as any[];

    let assetSeq = 0;
    const addAsset = (company: any, type: CorporateAssetType, systemId: string): CorporateAsset => {
        const asset: CorporateAsset = {
            id: `casset-test-${assetSeq++}`, type, systemId, value: 10_000,
            incomePerTick: 300, upkeepPerTick: 50, builtAt: world.nowSeconds,
        };
        company.assets.push(asset);
        if (!company.presenceSystemIds.includes(systemId)) company.presenceSystemIds.push(systemId);
        return asset;
    };
    const charter = (name: string, t: CharterTerms, by = founder) => {
        refillCapital(by);
        const result = grantCharter(world, by, { baseName: name, headquartersSystemId: capital, terms: t, foundingCapital: 100_000 });
        assert.ok(result.ok, `charter ${name}: ${(result as any).error}`);
        return (result as any).company;
    };

    // ── 1. The seal is no longer free, and a term is a clause ────────────────
    const freeRide = terms('trade', { ownership: { government: 0, privateInvestors: 60, foreignInvestors: 30, publicShares: 10 } });
    assert.match(validateCharter(freeRide, 'Free Ride', 100_000) ?? '', /at least 10%/, 'a charter the state owns none of is refused');
    assert.match(validateCharter(terms('trade', { termDays: 4 }), 'Odd Term', 100_000) ?? '', /Galactic Days/, 'terms come in fixed lengths');
    const shortCo = charter('Short Leash', terms('trade', { termDays: 3 }));
    const longCo = charter('Long Grant', terms('trade', { termDays: 8 }));
    assert.strictEqual(shortCo.charterExpiresAt, world.nowSeconds + 3 * GD);
    assert.ok(longCo.loyalty > shortCo.loyalty, 'a long grant buys goodwill a short one costs');
    console.log('[1] minimum state stake enforced; term written into the charter');

    // ── 2. Renewal: the board comes back to the table ────────────────────────
    const mining = charter('Iron Meridian', terms('mining'));
    mining.influence = 0;
    tickCharterRenewals(world);
    assert.strictEqual(corp.renewals.size, 0, 'nothing is due yet');

    world.nowSeconds = shortCo.charterExpiresAt - RENEWAL_WINDOW_SECONDS + TICK;
    tickCharterRenewals(world);
    const renewal = [...corp.renewals.values()].find(r => r.companyId === shortCo.id)!;
    assert.ok(renewal && renewal.status === 'pending', 'a renewal reaches the desk a day before expiry');
    assert.ok(renewal.expiresAt - world.nowSeconds >= RENEWAL_WINDOW_SECONDS - TICK, 'with a day to answer it');

    refillCapital();
    const shareBefore = shortCo.profitShareToState;
    const loyaltyBefore = shortCo.loyalty;
    const capitalBefore = getGovernment(world, founder)!.politicalCapital;
    const dictated = resolveRenewal(world, renewal.id, 'state_terms');
    assert.ok(dictated.ok, (dictated as any).error);
    assert.ok(Math.abs(shortCo.profitShareToState - (shareBefore + 0.05)) < 1e-9, 'dictating terms raises the state share');
    assert.ok(shortCo.loyalty < loyaltyBefore, 'and costs loyalty');
    assert.ok(getGovernment(world, founder)!.politicalCapital < capitalBefore, 'and political capital');
    assert.ok(shortCo.charterExpiresAt > world.nowSeconds + 2 * GD, 'the grant runs again');
    assert.strictEqual(shortCo.renewalCount, 1);

    // Silence renews on the board's terms.
    world.nowSeconds = shortCo.charterExpiresAt - RENEWAL_WINDOW_SECONDS + TICK;
    // Influence is derived from what the company holds and remits, so make it
    // heavy enough to ask for something the honest way.
    shortCo.stateRemittanceTotal = 1_000_000;
    for (let i = 0; i < 10; i++) addAsset(shortCo, 'warehouse', capital);
    tickCharterRenewals(world);
    const second = [...corp.renewals.values()].find(r => r.companyId === shortCo.id && r.status === 'pending')!;
    assert.ok(second, 'second renewal opened');
    assert.notStrictEqual(second.ask.kind, 'none', 'a company with weight asks for something');
    world.nowSeconds = second.expiresAt + TICK;
    const autonomyBefore = shortCo.autonomyLevel;
    const termsBefore = { share: shortCo.profitShareToState, rights: shortCo.rights.length, territory: shortCo.territory };
    tickCharterRenewals(world);
    assert.strictEqual(second.status, 'renewed');
    assert.strictEqual(second.resolvedAs, 'company_terms', 'unanswered, it renews as the board asked');
    assert.ok(shortCo.autonomyLevel > autonomyBefore, 'and the board draws its conclusion');
    assert.ok(
        shortCo.profitShareToState < termsBefore.share
        || shortCo.rights.length > termsBefore.rights
        || shortCo.territory !== termsBefore.territory,
        'and what it asked for is now in the charter'
    );
    console.log(`[2] renewal negotiated, then auto-renewed on the board's terms (it asked: ${second.ask.kind})`);

    // Letting a charter lapse: a weak company is wound up, a strong bitter one refuses.
    const doomed = charter('Pale Horizon', terms('trade'));
    doomed.charterExpiresAt = world.nowSeconds + TICK;
    const defiant = charter('Blackfall', terms('trade', { rights: ['build_infrastructure', 'armed_escorts'] }));
    defiant.charterExpiresAt = world.nowSeconds + TICK;
    defiant.autonomyLevel = 70; defiant.loyalty = 20;
    assert.ok(wouldDefyLapse(defiant) && !wouldDefyLapse(doomed));
    tickCharterRenewals(world);
    const pending = (id: string) => [...corp.renewals.values()].find(r => r.companyId === id && r.status === 'pending')!;
    const founderCredits = reserves(world, founder)['CREDITS'];
    assert.ok(resolveRenewal(world, pending(doomed.id).id, 'lapse').ok);
    assert.ok(!corp.companies.has(doomed.id), 'the company is struck from the register');
    assert.ok(reserves(world, founder)['CREDITS'] > founderCredits, 'and the state is paid out for its stock');
    assert.ok(!corp.factionStates.get(founder)!.charteredCompanyIds.includes(doomed.id));
    assert.ok(resolveRenewal(world, pending(defiant.id).id, 'lapse').ok);
    assert.ok(corp.companies.has(defiant.id) && defiant.hasGoneRogue, 'a company strong enough to object goes rogue instead');
    defiant.nationalized = true; defiant.hasGoneRogue = false; // park it
    console.log('[3] lapse winds a weak company up; a strong one refuses and goes rogue');

    // ── 4. Concessions change the world, not just the mood ──────────────────
    const lobby = charter('Thousand Ports', terms('trade', { rights: ['build_infrastructure', 'own_stations', 'armed_escorts'] }));
    lobby.influence = 70;
    const concede = (type: CorporateDemandType) => {
        const id = `d-${type}-${world.nowSeconds}`;
        corp.demands.set(id, {
            id, companyId: lobby.id, factionId: founder, type, text: '', severity: 2,
            issuedAt: world.nowSeconds, expiresAt: world.nowSeconds + GD, status: 'pending', concession: '', threat: '',
        });
        refillCapital();
        const result = resolveDemand(corp, id, 'accept', world, world.nowSeconds);
        assert.ok(result.ok, (result as any).error);
        lobby.influence = 70; // resolveDemand recomputes from holdings; keep the test's weight
    };

    const seatsBefore = computeParties(world, founder);
    concede('senate_representation');
    assert.ok((lobby.senateSeats ?? 0) >= 8, 'the company is seated');
    const parties = computeParties(world, founder);
    const bloc = parties.find(p => p.id === `corp:${lobby.id}`);
    assert.ok(bloc && bloc.seats > 0, 'as a real party in the chamber');
    assert.strictEqual(parties.length, seatsBefore.length + 1);
    assert.ok(Math.abs(parties.reduce((s, p) => s + p.seats, 0) - 100) < 1e-6, 'the chamber still sums to 100');
    lobby.loyalty = 10;
    assert.ok(computeParties(world, founder).find(p => p.id === `corp:${lobby.id}`)!.stance < -0.5, 'and votes as the company feels');
    lobby.loyalty = 70;

    const fleetBefore = lobby.privateFleetSize;
    concede('military_spending');
    assert.strictEqual(lobby.privateFleetSize, fleetBefore + 10, 'the escort programme actually sails');

    const rateBefore = serviceRate(lobby, world.nowSeconds);
    concede('state_contract');
    assert.ok((lobby.contractUntil ?? 0) > world.nowSeconds + GD, 'a contract runs for a term');
    lobby.loyalty = 70;
    assert.ok(Math.abs(serviceRate(lobby, world.nowSeconds) / 0.7 - 1.5) < 1e-9 && rateBefore > 0, 'and the company serves at half again its rate');

    lobby.autonomyLevel = 50;
    concede('greater_autonomy');
    assert.ok(lobby.boardIndependent, 'the board is its own');
    lobby.charterExpiresAt = world.nowSeconds + TICK;
    tickCharterRenewals(world);
    refillCapital();
    const refused = resolveRenewal(world, pending(lobby.id).id, 'state_terms');
    assert.ok(!refused.ok && /dictated/.test((refused as any).error), 'and can no longer be dictated to');
    assert.ok(resolveRenewal(world, pending(lobby.id).id, 'company_terms').ok);
    console.log(`[4] concessions: ${lobby.senateSeats} seats, +10 escorts, state contract, independent board`);

    // ── 5. Each mission serves the state in kind ─────────────────────────────
    mining.loyalty = 80;
    const outpost1 = addAsset(mining, 'mining_outpost', sysA.id);
    addAsset(mining, 'mining_outpost', sysA.id);
    const metalsBefore = reserves(world, founder)['METALS'] ?? 0;
    tickMissionServices(world);
    const delivered = (reserves(world, founder)['METALS'] ?? 0) - metalsBefore;
    assert.ok(Math.abs(delivered - 2 * 6 * 0.8) < 1e-6, `two outposts at 80% loyalty deliver 9.6 metals (got ${delivered})`);
    assert.match(mining.lastService.summary, /metals/);

    outpost1.disruptedUntil = world.nowSeconds + 10 * TICK;
    const mid = reserves(world, founder)['METALS'];
    tickMissionServices(world);
    assert.ok(Math.abs(reserves(world, founder)['METALS'] - mid - 6 * 0.8) < 1e-6, 'a raided outpost delivers nothing');
    outpost1.disruptedUntil = undefined;

    mining.loyalty = 30;
    const low = reserves(world, founder)['METALS'];
    tickMissionServices(world);
    assert.strictEqual(reserves(world, founder)['METALS'], low, 'a disloyal company renders no service');
    mining.loyalty = 80;

    const labs = charter('Concord Assay', terms('research'));
    labs.loyalty = 100;
    addAsset(labs, 'research_lab', capital);
    const slot = world.tech.get(founder).activeSlots[0];
    const progress = slot.ticksCompleted;
    tickMissionServices(world);
    assert.ok(slot.ticksCompleted > progress, 'laboratories advance the state programme');

    const bank = charter('Coreward', terms('banking', { rights: ['collect_fees'] }));
    bank.loyalty = 90;
    bank.treasury = 200_000;
    const line = creditLineAvailable(bank);
    assert.strictEqual(line, 100_000, 'a bank lends half its vault');
    assert.ok(!drawStateLoan(world, founder, bank.id, line + 1).ok, 'and no more');
    assert.ok(!drawStateLoan(world, rival, bank.id, 1_000).ok, 'and only to its own government');
    const before = reserves(world, founder)['CREDITS'];
    const drawn = drawStateLoan(world, founder, bank.id, 50_000);
    assert.ok(drawn.ok);
    assert.strictEqual(reserves(world, founder)['CREDITS'], before + 50_000);
    assert.ok(Math.abs(bank.stateLoan - 55_000) < 1e-6, 'interest is written on at once');
    // (150,000 vault + 55,000 owed) × 0.5 − 55,000: a drawing in parts leaves
    // the rest of the line, less the interest — not nothing.
    assert.ok(Math.abs(creditLineAvailable(bank) - 47_500) <= 1, `the rest of the line is still on offer (${creditLineAvailable(bank)})`);
    tickMissionServices(world);
    assert.ok(bank.stateLoan < 55_000 && reserves(world, founder)['CREDITS'] < before + 50_000, 'and the state services the debt every tick');

    // A colony seed becomes a real colony.
    const settlers = charter('Outer Reach', terms('colonization', { rights: ['build_infrastructure', 'establish_colonies'] }));
    settlers.loyalty = 90;
    const template = [...world.construction.planets.values()][0] as any;
    const site = { ...template, id: 'planet-test-free-world', name: 'New Landing', systemId: sysB.id, ownerId: undefined, tags: ['colonizable'], buildQueue: [], population: 0 };
    world.construction.planets.set(site.id, site);
    addAsset(settlers, 'colony_seed', sysB.id);
    tickMissionServices(world);
    assert.notStrictEqual(site.ownerId, founder, 'no charts, no colony');
    const vis = world.movement.factionVisibility.get(founder) ?? {};
    vis[sysB.id] = { revealStage: 'surveyed', visibleTags: [] };
    world.movement.factionVisibility.set(founder, vis);
    const settlerTreasury = settlers.treasury;
    tickMissionServices(world);
    assert.strictEqual(site.ownerId, founder, 'the settlement is a real colony under the founder flag');
    assert.ok(settlers.treasury < settlerTreasury, 'paid for by the company');
    assert.ok(settlers.corporateColonies.includes(sysB.id), 'and a corporate colony — which a rogue company could take with it');
    console.log('[5] missions serve: metals delivered, research advanced, loan drawn and serviced, colony founded');

    // ── 6. Works can be raided, and defended ─────────────────────────────────
    const works = addAsset(mining, 'mining_outpost', sysC.id);
    const open = raidExposure(world, mining, works);
    mining.rights.push('security_forces');
    const guarded = raidExposure(world, mining, works);
    assert.ok(guarded < open, 'security forces cut the odds');
    const stateFleet = createRaiderFleet(sysC, world, new RNG(seedFromString('test-state-fleet')));
    stateFleet.id = 'fleet-test-state'; stateFleet.factionId = founder; stateFleet.strength = 1;
    world.movement.fleets.set(stateFleet.id, stateFleet);
    assert.ok(raidExposure(world, mining, works) < guarded * 0.5, 'a state fleet on station cuts them much further');
    world.movement.fleets.delete(stateFleet.id);
    mining.rights = mining.rights.filter((r: string) => r !== 'security_forces');

    const raider = createRaiderFleet(sysC, world, new RNG(seedFromString('test-raider')));
    raider.id = 'pirate-raider-test'; raider.strength = 1;
    world.movement.fleets.set(raider.id, raider);
    const band = foundOrganization(world, sysC.id, [raider.id], 'frontier_desperation');
    mining.treasury = 100_000;
    let raid = null as any;
    for (let i = 0; i < 40 && !raid; i++) {
        world.nowSeconds += TICK;
        raid = tickAssetRaids(world).find(r => r.assetId === works.id);
    }
    assert.ok(raid, 'a band sitting on undefended works raids them');
    assert.strictEqual(raid.by, band.id);
    assert.ok(raid.loot > 0 && mining.treasury < 100_000 && band.treasury >= raid.loot, 'the loot moves from the company to the band');
    assert.ok(!activeAssets(mining, world.nowSeconds).includes(works), 'and the works go dark');
    assert.ok(drainBuffer().rows.some(r => r.type === 'pirate_raid'), 'and it is on the record');

    // The band a company's own squadrons became does not rob that company.
    mining.pirateOrganizationId = band.id;
    works.disruptedUntil = undefined;
    for (let i = 0; i < 40; i++) {
        world.nowSeconds += TICK;
        assert.strictEqual(tickAssetRaids(world).filter(r => r.companyId === mining.id).length, 0,
            'a company is never raided by its own former fleet');
    }
    mining.pirateOrganizationId = undefined;
    world.movement.fleets.delete(raider.id);

    // An enemy fleet occupies what it sits on.
    world.rivalries.set(`rivalry-${founder}-${rival}`, {
        id: `rivalry-${founder}-${rival}`, empireAId: founder, empireBId: rival, rivalryScore: 100,
        escalationLevel: 7, activeSanctionIds: [], proxyConflictsInvolved: [], detenteActive: false,
    });
    const enemy = createRaiderFleet(sysA, world, new RNG(seedFromString('test-enemy')));
    enemy.id = 'fleet-test-enemy'; enemy.factionId = rival; enemy.strength = 1;
    world.movement.fleets.set(enemy.id, enemy);
    const occupied = tickAssetRaids(world).filter(r => r.kind === 'occupation');
    assert.strictEqual(occupied.length, 2, 'both outposts in the occupied system go dark');
    assert.strictEqual(activeAssets(mining, world.nowSeconds).filter(a => a.systemId === sysA.id).length, 0);
    world.movement.fleets.delete(enemy.id);
    world.rivalries.delete(`rivalry-${founder}-${rival}`);
    console.log(`[6] raid took ${Math.round(raid.loot)}cr; enemy fleet occupied ${occupied.length} works`);

    // ── 7. Commerce overlay: your works always, foreign works only where you can see ──
    const systems = [...world.movement.systems.values()].map((s: any) => ({ id: s.id, q: s.q, r: s.r, ownerId: s.ownerFactionId, hyperlaneNeighbors: s.hyperlaneNeighbors }));
    const overlay = (me: string, visibility: any) => computeOverlayStyles('commerce', {
        systems, visibility, fleets: [], planets: [], factions: {}, diplomacy: null, shipyardSystemIds: [],
        explorationOrders: [], systemCohesion: {}, contestedSystemIds: [], playerFactionId: me,
        corporateSites: [{ systemId: sysA.id, mine: me === founder ? 2 : 0, foreign: me === founder ? 0 : 2, disrupted: 2 }],
    });
    assert.strictEqual(overlay(founder, {}).styles.get(sysA.id)?.bucket, 'mine', 'your own company reports to you');
    assert.strictEqual(overlay(founder, {}).counts.disrupted, 1);
    assert.strictEqual(overlay(rival, {}).styles.size, 0, 'a rival sees nothing in a system it has not scanned');
    assert.strictEqual(overlay(rival, { [sysA.id]: { revealStage: 'scanned' } }).styles.get(sysA.id)?.bucket, 'foreign');
    console.log('[7] Commerce overlay honours the fog gate');

    // ── 8. A company can be taken through its share register ────────────────
    const prize = charter('Halcyon Freight', terms('logistics', { ownership: { government: 10, privateInvestors: 30, foreignInvestors: 40, publicShares: 20 } }));
    addAsset(prize, 'warehouse', capital);
    tickBoardControl(world);
    assert.strictEqual(prize.boardControl, undefined, 'nobody commands the board yet');
    assert.ok(hostileTakeover(corp, world, prize.id, rival, world.nowSeconds).ok);
    tickBoardControl(world);
    assert.strictEqual(prize.boardControl?.holderId, rival, 'the raider commands the board');
    refillCapital(rival);
    const early = reflagCharter(world, rival, prize.id);
    assert.ok(!early.ok && /Galactic Day/.test((early as any).error), 'but must hold it a day first — the founder gets to answer');
    world.nowSeconds += REFLAG_HOLD_SECONDS;
    tickBoardControl(world);
    const moved = reflagCharter(world, rival, prize.id);
    assert.ok(moved.ok, (moved as any).error);
    assert.strictEqual(prize.foundingFactionId, rival, 'the charter changes flags');
    assert.ok(prize.operatingFactionIds.includes(founder), "and its works in the old founder's space become foreign operations");
    // The old founder still holds stock and hosts its works — the two things
    // that make a patron. It is never one again: a company does not go back.
    assert.ok((ownershipPercent(prize, founder) > 0) && prize.formerFounderIds.includes(founder));
    assert.notStrictEqual(findPatron(world, prize), founder, 'a company never defects back to a government it left');
    assert.ok(corp.factionStates.get(rival)!.charteredCompanyIds.includes(prize.id));
    const reflagRow = drainBuffer().rows.find(r => r.type === 'company_broke_away');
    assert.ok(reflagRow && JSON.parse(reflagRow.facts).byTakeover === true, 'and the press hears how');
    console.log('[8] foreign majority, held a day, moved the charter to its own flag');

    // ── 9. Somebody mails the real ledgers ───────────────────────────────────
    const priceBefore = mining.sharePrice;
    for (const crisis of corp.crises.values()) crisis.status = 'resolved';
    const hit = leakCompanyBooks(world, founder);
    assert.ok(hit, 'a leak finds a company');
    assert.ok([...corp.crises.values()].some(c => c.companyId === hit!.id && c.type === 'accounting_fraud' && c.status === 'pending'));
    if (hit!.id === mining.id) assert.ok(mining.sharePrice < priceBefore);
    assert.strictEqual(leakCompanyBooks(world, 'faction-nobody'), null);
    console.log(`[9] leaked books opened a fraud inquiry at ${hit!.charter.fullName}`);

    // ── 9b. What a season-long soak turned up (scripts/charter-soak-probe.ts) ──
    // Dividends come out of the treasury; they used to be paid from nowhere
    // while the retained share was banked a second time.
    const payer = charter('Cygnet', terms('trade'));
    payer.treasury = 50_000;
    payer.pendingProfit = 10_000;
    let paidOut = 0;
    issueDividends(payer, corp.factionStates, [], world.nowSeconds, (_id, amount) => { paidOut += amount; });
    assert.strictEqual(payer.treasury, 44_000, 'a 60% payout on 10,000 profit leaves the treasury 6,000 lighter');
    assert.strictEqual(payer.pendingProfit, 0);
    assert.ok(Math.abs(paidOut - 6_000) < 1e-6, 'and every credit of it reaches a shareholder');
    payer.treasury = 1_000; payer.pendingProfit = 10_000;
    issueDividends(payer, corp.factionStates, [], world.nowSeconds);
    assert.strictEqual(payer.treasury, 0, 'a company cannot pay out more than it holds');

    // A system only takes so many works: reach bounds how much, not just where.
    const builder = charter('Vela Deepwater', terms('trade', { territory: 'domestic' }));
    builder.personality = 'expansionist';
    builder.treasury = 5_000_000;
    builder.presenceSystemIds = [capital];
    builder.assets = [];
    // Nowhere new to go: a domestic charter reaches only the founder's systems.
    for (const sys of world.movement.systems.values() as Iterable<any>) {
        if (sys.ownerFactionId === founder && sys.id !== capital) sys.ownerFactionId = undefined;
    }
    for (let i = 0; i < 30; i++) {
        world.nowSeconds += GROWTH_INTERVAL_SECONDS;
        runGrowthCycle(builder, world, corp, world.nowSeconds);
    }
    assert.strictEqual(builder.assets.length, MAX_WORKS_PER_SYSTEM,
        `thirty growth cycles with one system in reach build ${MAX_WORKS_PER_SYSTEM} works, not thirty`);
    console.log(`[9b] dividends leave the treasury; a full system stops at ${MAX_WORKS_PER_SYSTEM} works`);

    // ── 10. Everything survives ordinary ticking ─────────────────────────────
    for (let i = 0; i < 12; i++) {
        world.nowSeconds += TICK;
        tickAllCompanies(corp, world, TICK);
        tickMissionServices(world);
        tickCharterRenewals(world);
        tickBoardControl(world);
        tickAssetRaids(world);
    }
    assert.ok(stateTermsCost(mining) >= 15);
    console.log(`[10] 12 ticks clean — ${corp.companies.size} companies, ${corp.renewals.size} renewals on file`);

    console.log('\nAll charter term/service/raid/control checks passed.');
}

main();
