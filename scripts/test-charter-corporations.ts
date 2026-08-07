// scripts/test-charter-corporations.ts
// End-to-end smoke test for the VOC/CHOAM Charter Corporation layer:
// charter writing, autonomous growth, remittance, lobbying, crises,
// megaprojects, equity trading, takeovers and foreign-host policy.
// Run: npx tsx scripts/test-charter-corporations.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries } from '../lib/politics/registry';
import { ensureGovernments, getGovernment } from '../lib/government/government-service';
import {
    charterCorporation,
    priceCharter,
    validateCharter,
    ensureCharterFields,
    computeInfluence,
    computeStanding,
    militaryTier,
    ownershipPercent,
    boardControl,
    CHARTER_TECH_ID,
} from '../lib/economy/corporate/charter-service';
import {
    ensureCorporateState,
    getOrCreateFactionState,
    registerCompany,
    tickAllCompanies,
    getForeignCompaniesInEmpire,
    getPendingCorporateBusiness,
} from '../lib/economy/corporate/company-registry';
import { runGrowthCycle, acquireCompany, GROWTH_INTERVAL_SECONDS } from '../lib/economy/corporate/corporate-ai';
import {
    maybeIssueDemand,
    resolveDemand,
    setHostPolicy,
    remitToState,
    DEMAND_INTERVAL_SECONDS,
} from '../lib/economy/corporate/corporate-politics';
import {
    maybeSpawnCrisis,
    resolveCorporateCrisis,
    maybeProposeMegaproject,
    respondToMegaproject,
    tickMegaprojects,
    CRISIS_INTERVAL_SECONDS,
    PROPOSAL_INTERVAL_SECONDS,
} from '../lib/economy/corporate/corporate-events';
import {
    buyShares,
    sellShares,
    hostileTakeover,
    mergeCompanies,
    availableFloat,
} from '../lib/economy/corporate/shareholder-service';
import { CharterPower } from '../lib/economy/corporate/company-types';
import type { CharterTerms, CorporateDemand } from '../lib/economy/corporate/charter-types';

const DAY = 86_400;

function credits(world: any, factionId: string): number {
    return world.economy.factions.get(factionId)?.reserves?.['CREDITS'] ?? 0;
}

function setCredits(world: any, factionId: string, amount: number): void {
    const reserves = world.economy.factions.get(factionId)!.reserves as Record<string, number>;
    reserves['CREDITS'] = amount;
}

function main() {
    initRegistries();

    const world = getGameWorldState() as any;
    ensureEmpirePostures(world);
    ensureGovernments(world);
    const corp = ensureCorporateState(world);

    const founder = 'faction-aurelian';
    const rival = 'faction-vektori';
    world.tech.set(founder, { factionId: founder, unlockedTechIds: [CHARTER_TECH_ID], activeEffects: [], activeSlots: [], maxSlots: 1, globalModifiers: {}, researchPoints: 0, lockedTechIds: [] });
    setCredits(world, founder, 500_000);
    setCredits(world, rival, 500_000);
    const hq = world.economy.factions.get(founder)?.capitalSystemId
        ?? [...world.movement.systems.keys()][0];

    // ── 1. A charter is a document, and illegal documents are refused ────────
    const badTerms: CharterTerms = {
        mission: 'mining', territory: 'domestic', rights: ['govern_colonies'],
        ownership: { government: 50, privateInvestors: 20, foreignInvestors: 20, publicShares: 20 },
        profitShareToState: 0.15,
    };
    assert.ok(validateCharter(badTerms, 'Bad Co', 60_000), 'ownership over 100% must be refused');
    badTerms.ownership.publicShares = 10;
    assert.match(
        validateCharter(badTerms, 'Bad Co', 60_000) ?? '',
        /frontier charter or wider/,
        'political rights must require a frontier charter'
    );
    assert.match(validateCharter(badTerms, 'Bad Co', 1_000) ?? '', /Founding capital/, 'undercapitalised charters must be refused');
    console.log('[1] charter validation rejects illegal clauses');

    // ── 2. Founding a real charter ──────────────────────────────────────────
    const terms: CharterTerms = {
        mission: 'mining',
        territory: 'frontier',
        rights: ['build_infrastructure', 'purchase_land', 'own_stations', 'collect_fees', 'armed_escorts', 'establish_colonies'],
        ownership: { government: 40, privateInvestors: 35, foreignInvestors: 15, publicShares: 10 },
        profitShareToState: 0.15,
    };
    assert.strictEqual(validateCharter(terms, 'Astral Frontier', 120_000), null, 'a legal charter must validate');

    const price = priceCharter(terms, 120_000);
    assert.ok(price.politicalCapital > 0, 'a charter must cost political capital');
    assert.strictEqual(price.stateCapital, 48_000, 'the state subscribes its ownership share of the capital');
    console.log(`[2] charter priced at ${price.politicalCapital} PC and ${price.stateCapital.toLocaleString()}cr state capital`);

    const company = charterCorporation(
        {
            baseName: 'Astral Frontier',
            foundingFactionId: founder,
            headquartersSystemId: hq,
            terms,
            foundingCapital: 120_000,
            nowSeconds: world.nowSeconds,
            unlockedTechIds: new Set([CHARTER_TECH_ID]),
        },
        getOrCreateFactionState(corp, founder)
    );
    registerCompany(corp, company);

    assert.strictEqual(company.charter.fullName, 'Astral Frontier Charter Company');
    assert.ok(company.charter.powers.includes(CharterPower.PARAMILITARY), 'armed escorts must derive the paramilitary power');
    assert.ok(company.charter.powers.includes(CharterPower.GOVERNANCE), 'colony rights must derive the governance power');
    assert.ok(Math.abs(ownershipPercent(company, founder) - 40) < 0.5, 'the state must hold its 40%');
    assert.ok(availableFloat(company) > 0, 'private/foreign/public stakes form the tradable float');
    assert.ok(company.personality, 'a company must have a personality');
    console.log(`[2] founded "${company.charter.fullName}" — personality ${company.personality}, standing ${company.standing}`);

    // ── 3. It grows on its own ──────────────────────────────────────────────
    // Personality is drawn at founding, so pin it here: this step is asserting
    // that the growth machinery spends and builds, not which face the die shows.
    company.personality = 'expansionist';
    const assetsBefore = (company.assets ?? []).length;
    let grew = 0;
    for (let cycle = 0; cycle < 6; cycle++) {
        world.nowSeconds += GROWTH_INTERVAL_SECONDS;
        if (runGrowthCycle(company, world, corp, world.nowSeconds)) grew++;
    }
    assert.strictEqual(grew, 6, 'every growth cycle must produce a decision');
    assert.ok((company.assets ?? []).length > assetsBefore, 'an expansionist mining charter must build holdings');
    assert.ok((company.growthLog ?? []).length > 0, 'growth decisions must be logged for the player');
    console.log(`[3] ${(company.assets ?? []).length} holdings built autonomously; last: "${company.growthLog!.at(-1)!.summary}"`);
    assert.ok(company.autonomyLevel > 10, 'autonomy must drift upward as the company operates');

    // ── 4. The profit share actually reaches the treasury ───────────────────
    const treasuryBefore = credits(world, founder);
    const remitted = remitToState(company, world, 20_000);
    assert.ok(Math.abs(remitted - 3_000) < 1, '15% of 20,000 must be remitted');
    assert.ok(credits(world, founder) - treasuryBefore > 2_999, 'the remittance must land in the treasury');
    assert.ok((company.stateRemittanceTotal ?? 0) > 0, 'remittance must be tracked for the influence model');
    console.log(`[4] remitted ${Math.round(remitted).toLocaleString()}cr to the founding treasury`);

    // ── 5. Influence, standing and the military ladder are derived ──────────
    company.privateFleetSize = 95;
    const tier = militaryTier(company);
    assert.strictEqual(tier.tier, 3, 'without the private-fleet right the ladder caps at trade protection');
    company.rights!.push('private_fleets');
    assert.strictEqual(militaryTier(company).tier, 5, 'the private-fleet right unlocks the top rung');
    company.influence = computeInfluence(company);
    assert.ok(company.influence > 0, 'a company with holdings and arms must have influence');
    console.log(`[5] military tier ${militaryTier(company).label}; influence ${company.influence}%`);

    // ── 6. It lobbies, and refusal has a price ──────────────────────────────
    company.influence = 60;
    company.autonomyLevel = 50;
    company.loyalty = 45;
    company.lastDemandAt = world.nowSeconds - DEMAND_INTERVAL_SECONDS * 4;
    let demand = maybeIssueDemand(company, corp, world, world.nowSeconds);
    for (let attempt = 0; attempt < 12 && !demand; attempt++) {
        world.nowSeconds += DEMAND_INTERVAL_SECONDS;
        company.lastDemandAt = world.nowSeconds - DEMAND_INTERVAL_SECONDS * 4;
        demand = maybeIssueDemand(company, corp, world, world.nowSeconds);
    }
    assert.ok(demand, 'a company with 60% influence must eventually lobby');
    console.log(`[6] demand raised: ${demand!.type} — "${demand!.text}"`);

    const loyaltyBefore = company.loyalty!;
    const refuseResult = resolveDemand(corp, demand!.id, 'reject', world, world.nowSeconds);
    assert.ok(refuseResult.ok, 'the government must be able to refuse');
    assert.ok(company.loyalty! < loyaltyBefore, 'refusal must cost loyalty');
    assert.strictEqual(company.refusedDemands, 1, 'refusals must be counted');
    console.log(`[6] refused — loyalty ${Math.round(loyaltyBefore)}% → ${Math.round(company.loyalty!)}%`);

    // Accepting a sovereignty demand hands over a piece of the charter.
    company.loyalty = 30;
    company.autonomyLevel = 62;
    company.influence = 80;
    let sovereignty: CorporateDemand | null = null;
    for (let attempt = 0; attempt < 25 && !sovereignty; attempt++) {
        world.nowSeconds += DEMAND_INTERVAL_SECONDS;
        company.lastDemandAt = world.nowSeconds - DEMAND_INTERVAL_SECONDS * 4;
        const next = maybeIssueDemand(company, corp, world, world.nowSeconds);
        if (next && ['greater_autonomy', 'senate_representation', 'territorial_administration', 'customs_authority'].includes(next.type)) {
            sovereignty = next;
        } else if (next) {
            // Drop ordinary lobbying off the desk without answering it — an
            // answer would move loyalty and change what the company asks next.
            corp.demands.delete(next.id);
        }
    }
    if (sovereignty) {
        const rightsBefore = company.rights!.length;
        const autonomyBefore = company.autonomyLevel;
        resolveDemand(corp, sovereignty.id, 'accept', world, world.nowSeconds);
        assert.ok(company.autonomyLevel > autonomyBefore, 'granting sovereignty must raise autonomy');
        console.log(`[6] granted "${sovereignty.type}" — autonomy ${Math.round(autonomyBefore)}% → ${Math.round(company.autonomyLevel)}%, rights ${rightsBefore} → ${company.rights!.length}`);
    } else {
        console.log('[6] no sovereignty demand drawn this run (stochastic); ordinary lobbying verified');
    }

    // ── 7. Crises land on the government's desk ─────────────────────────────
    company.corruptionIndex = 70;
    company.lastCrisisAt = world.nowSeconds - CRISIS_INTERVAL_SECONDS * 3;
    let crisis = maybeSpawnCrisis(company, corp, world.nowSeconds);
    for (let attempt = 0; attempt < 15 && !crisis; attempt++) {
        world.nowSeconds += CRISIS_INTERVAL_SECONDS;
        company.lastCrisisAt = world.nowSeconds - CRISIS_INTERVAL_SECONDS * 3;
        crisis = maybeSpawnCrisis(company, corp, world.nowSeconds);
    }
    assert.ok(crisis, 'a large, corrupt company must eventually generate a crisis');
    assert.ok(crisis!.options.length >= 3, 'a crisis must offer real choices');
    const gov = getGovernment(world, founder)!;
    gov.politicalCapital = 100;
    setCredits(world, founder, 500_000);
    const chosen = crisis!.options.find(o => !o.creditCost || o.creditCost <= 500_000)!;
    const crisisResult = resolveCorporateCrisis(corp, crisis!.id, chosen.id, world, world.nowSeconds);
    assert.ok(crisisResult.ok, `crisis resolution must succeed: ${(crisisResult as any).error ?? ''}`);
    assert.strictEqual(corp.crises.get(crisis!.id)!.status, 'resolved');
    console.log(`[7] crisis "${crisis!.headline}" settled by "${chosen.label}"`);

    // ── 8. Megaprojects: proposed, approved, built ──────────────────────────
    company.influence = 70;
    company.treasury = 400_000;
    company.lastProposalAt = world.nowSeconds - PROPOSAL_INTERVAL_SECONDS * 3;
    let proposal = maybeProposeMegaproject(company, corp, world.nowSeconds);
    for (let attempt = 0; attempt < 15 && !proposal; attempt++) {
        world.nowSeconds += PROPOSAL_INTERVAL_SECONDS;
        company.lastProposalAt = world.nowSeconds - PROPOSAL_INTERVAL_SECONDS * 3;
        proposal = maybeProposeMegaproject(company, corp, world.nowSeconds);
    }
    assert.ok(proposal, 'an influential, cash-rich company must propose a megaproject');
    setCredits(world, founder, 500_000);
    const approve = respondToMegaproject(corp, proposal!.id, 'approve', world, world.nowSeconds);
    assert.ok(approve.ok, `approval must succeed: ${(approve as any).error ?? ''}`);
    assert.strictEqual(proposal!.status, 'building');

    const incomeBefore = company.megaprojectIncome ?? 0;
    tickMegaprojects(corp, world, proposal!.durationSeconds + 1, world.nowSeconds + proposal!.durationSeconds + 1);
    assert.strictEqual(proposal!.status, 'complete', 'a fully-elapsed megaproject must complete');
    assert.ok((company.megaprojectIncome ?? 0) > incomeBefore, 'a completed megaproject must pay permanent income');
    console.log(`[8] megaproject "${proposal!.name}" completed — +${company.megaprojectIncome}cr/tick`);

    // ── 9. Equity: buy, sell, and take control by force ─────────────────────
    setCredits(world, rival, 5_000_000);
    const floatBefore = availableFloat(company);
    const buy = buyShares(corp, world, company.id, rival, 50_000, world.nowSeconds);
    assert.ok(buy.ok, `buying from the float must succeed: ${(buy as any).error ?? ''}`);
    assert.strictEqual(availableFloat(company), floatBefore - 50_000, 'bought shares must leave the float');
    assert.strictEqual(company.shareholders[rival], 50_000);

    const sell = sellShares(corp, world, company.id, rival, 20_000, world.nowSeconds);
    assert.ok(sell.ok, 'selling back into the float must succeed');
    assert.strictEqual(company.shareholders[rival], 30_000);

    const loyaltyBeforeRaid = company.loyalty!;
    const takeover = hostileTakeover(corp, world, company.id, rival, world.nowSeconds);
    assert.ok(takeover.ok, `a funded raider must be able to bid: ${(takeover as any).error ?? ''}`);
    const board = boardControl(company);
    assert.strictEqual(board.holderId, rival, 'the raider must now control the board');
    assert.ok(board.majority, 'a successful takeover must be a majority');
    assert.ok(company.loyalty! < loyaltyBeforeRaid, 'losing the company to a rival must cost loyalty to the founder');
    console.log(`[9] hostile takeover: ${rival} holds ${board.percent.toFixed(1)}% for ${Math.round((takeover as any).cost).toLocaleString()}cr`);

    // ── 10. Foreign operations and host policy ──────────────────────────────
    const rivalSystem = [...world.movement.systems.values()].find((s: any) => s.id !== hq);
    rivalSystem.ownerFactionId = rival;
    company.operatingFactionIds = [rival];
    company.presenceSystemIds!.push(rivalSystem.id);
    company.assets!.push({
        id: 'casset-test-foreign', type: 'warehouse', systemId: rivalSystem.id,
        value: 8_000, incomePerTick: 150, upkeepPerTick: 25, builtAt: world.nowSeconds,
    });

    assert.strictEqual(getForeignCompaniesInEmpire(corp, rival).length, 1, 'the host must see the foreign charter');
    const taxed = setHostPolicy(corp, world, rival, company.id, 'taxed', 0.25, world.nowSeconds);
    assert.ok(taxed.ok, 'a host must be able to tariff a foreign company');
    assert.strictEqual(corp.hostPolicies.get(`${rival}:${company.id}`)!.stance, 'taxed');

    const rivalCreditsBefore = credits(world, rival);
    const seized = setHostPolicy(corp, world, rival, company.id, 'nationalized', 0, world.nowSeconds);
    assert.ok(seized.ok, 'a host must be able to seize local holdings');
    assert.ok(credits(world, rival) > rivalCreditsBefore, 'nationalisation must pay the host');
    assert.ok(!company.assets!.some(a => a.systemId === rivalSystem.id), 'seized holdings must leave the company');
    console.log(`[10] host seized foreign holdings for ${Math.round(credits(world, rival) - rivalCreditsBefore).toLocaleString()}cr`);

    // ── 11. Competition: one charter swallows another ───────────────────────
    const smallTerms: CharterTerms = {
        mission: 'mining', territory: 'frontier', rights: ['build_infrastructure'],
        ownership: { government: 100, privateInvestors: 0, foreignInvestors: 0, publicShares: 0 },
        profitShareToState: 0.2,
    };
    const small = charterCorporation(
        {
            baseName: 'Pale Horizon', foundingFactionId: founder, headquartersSystemId: hq,
            terms: smallTerms, foundingCapital: 30_000, nowSeconds: world.nowSeconds,
            unlockedTechIds: new Set([CHARTER_TECH_ID]),
        },
        getOrCreateFactionState(corp, founder)
    );
    registerCompany(corp, small);
    company.treasury = 500_000;
    const acquired = acquireCompany(corp, company, small, world, world.nowSeconds);
    assert.ok(acquired, 'a cash-rich company must be able to buy a smaller rival');
    assert.ok(!corp.companies.has(small.id), 'the acquired charter must be dissolved');
    console.log('[11] acquisition dissolved the smaller charter and transferred its holdings');

    // ── 12. Legacy backfill: a pre-charter company still works ──────────────
    const legacy: any = {
        id: 'company-legacy', charter: { baseName: 'Legacy', fullName: 'Legacy Charter Company', powers: [CharterPower.MONOPOLY, CharterPower.GOVERNANCE] },
        foundingFactionId: founder, headquartersSystemId: hq, foundedAt: world.nowSeconds,
        treasury: 40_000, sharesOutstanding: 1_000_000, sharePrice: 10,
        shareholders: { [founder]: 1_000_000 }, dividendsPaidTotal: 0, pendingProfit: 0,
        monopolyRights: {}, infrastructureOwned: [], corporateColonies: [],
        privateFleetSize: 5, activeTradeRouteIds: [], autonomyLevel: 20, corruptionIndex: 0,
        charterRevocationPending: false,
    };
    corp.companies.set(legacy.id, legacy);
    ensureCharterFields(legacy, world.nowSeconds);
    assert.ok(legacy.mission && legacy.territory && legacy.personality, 'backfill must give a legacy company a charter');
    assert.ok(Array.isArray(legacy.rights) && legacy.rights.length > 0, 'backfill must reconstruct rights from the legacy powers');
    assert.strictEqual(computeStanding(legacy), legacy.standing);
    console.log(`[12] legacy company backfilled as ${legacy.mission}/${legacy.territory}, personality ${legacy.personality}`);

    // ── 13. The full registry tick runs clean ───────────────────────────────
    const ticksBefore = corp.tick;
    for (let i = 0; i < 20; i++) {
        world.nowSeconds += 6 * 3600;
        tickAllCompanies(corp, world, 6 * 3600);
    }
    assert.strictEqual(corp.tick, ticksBefore + 20, 'the registry must advance its own tick counter');
    for (const c of corp.companies.values()) {
        assert.ok(Number.isFinite(c.treasury), `${c.id} treasury must stay finite`);
        assert.ok(c.autonomyLevel >= 0 && c.autonomyLevel <= 100, `${c.id} autonomy must stay in range`);
        assert.ok((c.influence ?? 0) >= 0 && (c.influence ?? 0) <= 100, `${c.id} influence must stay in range`);
        assert.ok((c.loyalty ?? 0) >= 0 && (c.loyalty ?? 0) <= 100, `${c.id} loyalty must stay in range`);
    }
    const business = getPendingCorporateBusiness(corp, founder);
    console.log(`[13] 20 strategic ticks clean — ${corp.companies.size} companies, ${business.demands.length} demands, ${business.crises.length} crises, ${business.proposals.length} proposals pending`);

    console.log('\nAll Charter Corporation checks passed.');
}

main();
