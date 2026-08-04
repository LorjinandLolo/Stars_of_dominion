// ===== file: lib/press-system/tests.ts =====
// Run: npx tsx lib/press-system/tests.ts
import assert from 'assert';
import {
    SimulationState,
    EmpireState,
    PlanetState,
    PressFactionState,
    PressFactionType,
    StorySource,
    StoryTruth,
    CrisisChoice,
    MediaCrisis,
    Story
} from './types';
import { tickPressSystem } from './simulation';
import { resolveCrisis } from './crisis';
import { PressConfig } from './config';
import {
    tickInvestigations,
    respondCooperate,
    respondObstruct,
    respondPublishFirst,
} from './investigations';
import { Investigation, InvestigationStage, MediaCampaign, CampaignObjective } from './types';
import {
    tickCampaigns,
    counterCampaign,
    traceCampaign,
    accuseCampaign,
} from './campaigns';
import { reactToCrisis, applyPredictionPayouts, expireCrises } from './crisis';
import { calculateViralSpread, propagateEffects } from './propagation';
import { RNG } from './utils';

console.log("Running Press System Tests...");

// --- Helpers ---
function createEmpire(id: string): EmpireState {
    return {
        id,
        publicTrust: 60,
        informationPressure: 20,
        activeCrises: new Set(),
        credibility: 60,
        mediaFreedom: 50,
        narrativeInfluence: 30
    };
}

function createMockState(): SimulationState {
    const empires = new Map<string, EmpireState>();
    empires.set('EMP1', createEmpire('EMP1'));

    const planets = new Map<string, PlanetState>();
    planets.set('planet_S1', { id: 'planet_S1', ownerId: 'EMP1', stability: 80, happiness: 70, fear: 10, radicalization: 5, position: { x: 0, y: 0 } });
    planets.set('planet_S2', { id: 'planet_S2', ownerId: 'EMP1', stability: 80, happiness: 70, fear: 10, radicalization: 5, position: { x: 1, y: 0 } });

    const pressFactions = new Map<string, PressFactionState>();
    pressFactions.set('STATE_MEDIA', { id: 'STATE_MEDIA', type: PressFactionType.STATE_MEDIA, affiliatedEmpireId: 'EMP1', credibility: 80, bias: 50, cooldowns: new Map() });
    pressFactions.set('PIRATE_PRESS', { id: 'PIRATE_PRESS', type: PressFactionType.PIRATE_PRESS, credibility: 40, bias: -50, cooldowns: new Map() });

    return {
        tick: 0,
        empires,
        planets,
        pressFactions,
        activeStories: new Map(),
        publishedStories: [],
        crises: new Map(),
        investigations: new Map(),
        campaigns: new Map(),
        quarantinedPlanets: new Set(),
        jammedSystems: new Set(),
        counterNarratives: new Map()
    };
}

function seedInvestigation(state: ReturnType<typeof createMockState>, evidence = 40): Investigation {
    const inv: Investigation = {
        id: 'INV_T',
        targetEmpireId: 'EMP1',
        investigatorId: 'STATE_MEDIA',
        subject: 'Test Probe',
        stage: InvestigationStage.RUMOUR,
        progress: 0,
        evidence,
        startedTick: 0,
        updatedTick: 0,
        resolved: false
    };
    state.investigations.set(inv.id, inv);
    return inv;
}

function mockCrisis(): MediaCrisis {
    return { id: 'C1', storyId: 'S1', targetEmpireId: 'EMP1', deadlineTick: 100, severity: 80, resolved: false };
}

function mockStory(evidence: number): Story {
    return {
        id: 'S1',
        source: StorySource.ESPIONAGE_LEAK,
        truth: StoryTruth.TRUE,
        targetEmpireId: 'EMP1',
        subject: 'Test Leak',
        baseMagnitude: 70,
        evidenceStrength: evidence,
        tickCreated: 0
    };
}

// --- A: Leak generation + publication ---
function testLeakPublication() {
    console.log("Test A: Espionage leak generates + gets published");
    let state = createMockState();
    const adj = new Map<string, string[]>([['S1', ['S2']], ['S2', ['S1']]]);
    const triggers = [{ factionId: 'EMP1', espionageSuccess: true }];

    const res = tickPressSystem(state, 1, 1001, adj, triggers);
    state = res.newState;

    const leak = Array.from(state.activeStories.values()).find(s => s.source === StorySource.ESPIONAGE_LEAK);
    assert.ok(leak, "Espionage leak story should be generated");
    assert.ok(leak!.evidenceStrength >= 60 && leak!.evidenceStrength <= 90, "Leak evidence should be high (60-90)");
    console.log("PASS: leak generated with evidence", leak!.evidenceStrength);
}

// --- B: Suppression backlash at low trust ---
function testSuppressionBacklash() {
    console.log("Test B: Suppression backlash");
    const empire = createEmpire('EMP1');
    empire.informationPressure = 90;
    empire.publicTrust = 20; // Low trust -> backlash

    const result = resolveCrisis(mockCrisis(), CrisisChoice.SUPPRESS, empire);
    assert.ok(result.outcome.includes("Failed"), "Should fail due to low trust");
    assert.strictEqual(result.empireDelta.informationPressure, 100, "Pressure should explode");
    assert.ok((result.empireDelta.credibility ?? 100) < empire.credibility, "Failed suppression should burn credibility");
    assert.ok((result.empireDelta.mediaFreedom ?? 100) < empire.mediaFreedom, "Suppression should erode media freedom");
    console.log("PASS: backlash verified.");
}

// --- C: Denial holds vs weak evidence ---
function testDenialHolds() {
    console.log("Test C: Denial holds against weak evidence");
    const empire = createEmpire('EMP1');
    empire.informationPressure = 80;

    const result = resolveCrisis(mockCrisis(), CrisisChoice.DENY, empire, mockStory(20));
    assert.ok(result.outcome.includes("Holds"), "Weak evidence: denial should hold");
    assert.ok((result.empireDelta.informationPressure ?? 100) < 80, "Pressure should drop");
    assert.ok((result.empireDelta.credibility ?? 0) > empire.credibility, "Held denial should gain credibility");
    console.log("PASS: denial held.");
}

// --- D: Denial exposed vs strong evidence ---
function testDenialExposed() {
    console.log("Test D: Denial exposed by strong evidence");
    const empire = createEmpire('EMP1');
    empire.informationPressure = 50;

    const result = resolveCrisis(mockCrisis(), CrisisChoice.DENY, empire, mockStory(85));
    assert.ok(result.outcome.includes("Exposed"), "Strong evidence: denial should be exposed");
    assert.ok((result.empireDelta.credibility ?? 100) <= empire.credibility + PressConfig.denial.exposedCredibilityPenalty + 1, "Credibility should collapse");
    assert.ok((result.empireDelta.informationPressure ?? 0) > 50, "Pressure should spike");
    console.log("PASS: denial exposed.");
}

// --- E: Distract relieves pressure, mild trust cost ---
function testDistract() {
    console.log("Test E: Distract");
    const empire = createEmpire('EMP1');
    empire.informationPressure = 80;

    const result = resolveCrisis(mockCrisis(), CrisisChoice.DISTRACT, empire, mockStory(50));
    assert.ok((result.empireDelta.informationPressure ?? 100) < 80, "Pressure should drop");
    assert.ok(result.outcome.includes("Flooded"), "Outcome should signal the story survives");
    console.log("PASS: distract verified.");
}

// --- F: Admit/reform builds credibility ---
function testAdmitReform() {
    console.log("Test F: Admit & reform credibility gain");
    const empire = createEmpire('EMP1');
    const result = resolveCrisis(mockCrisis(), CrisisChoice.ADMIT_REFORM, empire);
    assert.strictEqual(result.empireDelta.credibility, empire.credibility + PressConfig.credibility.admitReformBonus, "Reform should raise credibility");
    console.log("PASS: reform credibility verified.");
}

// --- G: Investigation advances to scandal and burns the empire ---
function testInvestigationLifecycle() {
    console.log("Test G: Investigation lifecycle to scandal");
    const state = createMockState();
    const inv = seedInvestigation(state, 50);
    const empire = state.empires.get('EMP1')!;
    const trustBefore = empire.publicTrust;
    const credBefore = empire.credibility;

    const rng = new RNG(42);
    let sawPublication = false;
    for (let t = 1; t <= 200 && !inv.resolved; t++) {
        tickInvestigations(state, t, rng);
        if (inv.stage === InvestigationStage.PUBLICATION) sawPublication = true;
    }

    assert.ok(inv.resolved, "Investigation should run to completion");
    assert.ok(sawPublication, "Should pass through PUBLICATION");
    assert.ok(state.activeStories.has(`EXPOSE_${inv.id}`), "Publication should inject an exposé story");
    assert.ok(empire.publicTrust < trustBefore, "Scandal should cost trust");
    assert.ok(empire.credibility < credBefore, "Scandal should cost credibility");
    console.log(`PASS: scandal after full track (trust ${trustBefore}->${empire.publicTrust}).`);
}

// --- H: Cooperate ends the dig cheaply, publish-first preempts ---
function testInvestigationResponses() {
    console.log("Test H: Investigation responses");
    const s1 = createMockState();
    const i1 = seedInvestigation(s1);
    const e1 = s1.empires.get('EMP1')!;
    const r1 = respondCooperate(i1, e1);
    assert.ok(i1.resolved && r1.ok, "Cooperate should close the investigation");
    assert.strictEqual(e1.credibility, 65, "Cooperate should gain credibility");

    const s2 = createMockState();
    const i2 = seedInvestigation(s2, 60);
    const e2 = s2.empires.get('EMP1')!;
    respondPublishFirst(i2, e2, s2, 5);
    assert.ok(i2.resolved, "Publish-first should close the investigation");
    const preempt = s2.activeStories.get(`PREEMPT_${i2.id}`);
    assert.ok(preempt, "Publish-first should inject the controlled story");
    assert.strictEqual(preempt!.evidenceStrength, 30, "Preempt story should carry halved evidence");
    console.log("PASS: cooperate + publish-first verified.");
}

// --- I: Obstruction stalls, or blows up into cover-up evidence ---
function testObstruction() {
    console.log("Test I: Obstruction outcomes");
    const state = createMockState();
    const inv = seedInvestigation(state, 40);
    inv.progress = 60;
    const empire = state.empires.get('EMP1')!;

    const alwaysFail = { check: () => true } as unknown as RNG;
    const r = respondObstruct(inv, empire, alwaysFail);
    assert.ok(!r.ok, "Forced-fail rng: obstruction should backfire");
    assert.strictEqual(inv.evidence, 60, "Backfire should add cover-up evidence");

    const alwaysHold = { check: () => false } as unknown as RNG;
    const inv2 = seedInvestigation(createMockState(), 40);
    inv2.progress = 60;
    const r2 = respondObstruct(inv2, empire, alwaysHold);
    assert.ok(r2.ok, "Held obstruction should stall the dig");
    assert.strictEqual(inv2.progress, 20, "Stall should knock back progress");
    console.log("PASS: obstruction both branches verified.");
}

function createTwoEmpireState() {
    const state = createMockState();
    state.empires.set('EMP2', { ...createMockState().empires.get('EMP1')!, id: 'EMP2' });
    return state;
}

function seedCampaign(state: ReturnType<typeof createMockState>, objective = CampaignObjective.UNDERMINE_TRUST): MediaCampaign {
    const camp: MediaCampaign = {
        id: 'CAMP_T',
        attackerId: 'EMP2',
        targetEmpireId: 'EMP1',
        objective,
        strength: 10,
        exposure: 0,
        signaled: false,
        tickStarted: 0,
        active: true
    };
    state.campaigns.set(camp.id, camp);
    return camp;
}

// --- J: Campaign drains target, leaks exposure, signals, and starves without funding ---
function testCampaignLifecycle() {
    console.log("Test J: Campaign drain + signal + starvation");
    const state = createTwoEmpireState();
    const camp = seedCampaign(state);
    const target = state.empires.get('EMP1')!;
    const attacker = state.empires.get('EMP2')!;
    const trustBefore = target.publicTrust;

    const rng = new RNG(7);
    for (let t = 1; t <= 20; t++) tickCampaigns(state, t, rng);

    assert.ok(target.publicTrust < trustBefore, "Campaign should drain target trust");
    assert.ok(camp.signaled, "Exposure should cross the signal threshold within 20 ticks");
    assert.ok(state.activeStories.has(`SIGNAL_${camp.id}`), "Signal story should be injected");
    assert.ok(attacker.narrativeInfluence < 30, "Upkeep should bill the attacker");

    attacker.narrativeInfluence = 0.3; // next tick drains to zero
    tickCampaigns(state, 21, rng);
    assert.ok(!camp.active, "Broke attacker's campaign should shut down");
    console.log(`PASS: trust ${trustBefore}->${target.publicTrust.toFixed(1)}, starved out.`);
}

// --- K: Counter blunts, trace attributes, accusation sticks/backfires ---
function testCampaignResponses() {
    console.log("Test K: Counter / trace / accuse");
    const state = createTwoEmpireState();
    const camp = seedCampaign(state);
    camp.strength = 50; camp.exposure = 40; camp.signaled = true;
    const target = state.empires.get('EMP1')!;
    const attacker = state.empires.get('EMP2')!;

    const r1 = counterCampaign(camp, target);
    assert.ok(r1.ok && camp.strength === 25, "Counter should knock strength down 25");

    const alwaysHit = { check: () => true, nextInt: () => 2 } as unknown as RNG;
    const r2 = traceCampaign(camp, 'EMP1', alwaysHit);
    assert.ok(r2.ok && camp.discoveredBy === 'EMP1', "Trace should attribute the campaign");

    const credBefore = attacker.credibility;
    const r3 = accuseCampaign(camp, target, 'EMP2', attacker);
    assert.ok(r3.ok, "Accusation with traced origin should stick");
    assert.ok(attacker.credibility < credBefore && !camp.active, "Stuck accusation burns attacker + ends campaign");

    // Backfire: fresh campaign, wrong suspect.
    const s2 = createTwoEmpireState();
    const c2 = seedCampaign(s2);
    c2.exposure = 50;
    const accuser = s2.empires.get('EMP1')!;
    const accuserCredBefore = accuser.credibility;
    const r4 = accuseCampaign(c2, accuser, 'EMP_WRONG', undefined);
    assert.ok(!r4.ok && accuser.credibility < accuserCredBefore, "Wrong accusation should burn the accuser");
    console.log("PASS: counter/trace/accuse verified.");
}

// --- L: Foreign reactions shift severity; predictions pay out; deadlines expire as IGNORE ---
function testCrisisMultiplayer() {
    console.log("Test L: Reactions, predictions, expiry");
    const state = createTwoEmpireState();
    const target = state.empires.get('EMP1')!;
    const foreign = state.empires.get('EMP2')!;
    const crisis = { id: 'C1', storyId: 'S1', targetEmpireId: 'EMP1', deadlineTick: 5, severity: 50, resolved: false } as any;
    state.crises.set(crisis.id, crisis);

    const r = reactToCrisis(crisis, 'EMP2', foreign, target, 'AMPLIFY');
    assert.ok(r.ok && crisis.severity === 60, "Amplify should raise severity");
    const dup = reactToCrisis(crisis, 'EMP2', foreign, target, 'DEFEND');
    assert.ok(!dup.ok, "Second stance from the same faction should be rejected");

    crisis.predictions = { EMP2: CrisisChoice.IGNORE };
    const credBefore = target.credibility;
    const influenceBefore = foreign.narrativeInfluence;

    expireCrises(state, 6); // past deadline → auto-IGNORE → prediction pays out
    assert.ok(crisis.resolved && crisis.choiceMade === CrisisChoice.IGNORE, "Expiry should resolve as IGNORE");
    assert.ok(target.credibility < credBefore, "Correct prediction should cost the target extra credibility");
    assert.ok(foreign.narrativeInfluence > influenceBefore, "Correct predictor should gain influence");

    const winners = applyPredictionPayouts(crisis, CrisisChoice.SUPPRESS, state.empires);
    assert.strictEqual(winners.length, 0, "Mismatched predictions should not pay");
    console.log("PASS: multiplayer crisis loop verified.");
}

// --- M: Publication is deduped and epicenters on a real planet ---
function testPublicationHygiene() {
    console.log("Test M: Publication dedup + real epicenter");
    let state = createMockState();
    const adj = new Map<string, string[]>([['S1', ['S2']], ['S2', ['S1']]]);
    const triggers = [{ factionId: 'EMP1', espionageSuccess: true }];

    state = tickPressSystem(state, 1, 1001, adj, triggers).newState;
    const firstCount = state.publishedStories.length;
    assert.ok(firstCount > 0, "Story should be published");
    for (const pub of state.publishedStories) {
        assert.ok(state.planets.has(pub.originPlanetId),
            `Epicenter ${pub.originPlanetId} must be a real planet`);
    }

    // The story stays in the active pool; further ticks must not re-run it.
    for (let t = 2; t <= 5; t++) state = tickPressSystem(state, 1, 1001, adj).newState;
    const ids = state.publishedStories.map(p => p.id);
    assert.strictEqual(new Set(ids).size, ids.length, "No duplicate publication ids");
    console.log(`PASS: ${firstCount} publications, no duplicates after 5 ticks.`);
}

// --- N: Decay direction, quarantine decay, and pressure feedback ---
function testPropagationAndPressure() {
    console.log("Test N: Decay direction + quarantine decay + pressure feedback");
    const planets = new Map(createMockState().planets);
    const adj = new Map<string, string[]>([['S1', ['S2']], ['S2', ['S1']]]);

    const mkPub = (viral: number): any => ({
        id: `P${viral}`, storyId: 'S', publisherId: 'X', tickPublished: 0,
        viralFactor: viral, originPlanetId: 'planet_S1',
        transmissionMap: new Map([['planet_S1', 100]]), jammedSystems: new Set()
    });

    const low = calculateViralSpread(mkPub(0.2), planets, adj, new Set(), new Set(), new Map(), 1);
    const high = calculateViralSpread(mkPub(1.0), planets, adj, new Set(), new Set(), new Map(), 1);
    assert.ok(high.get('planet_S1')! > low.get('planet_S1')!,
        "A more viral story must decay SLOWER, not faster");

    const quarantined = calculateViralSpread(
        mkPub(0.5), planets, adj, new Set(['planet_S1']), new Set(), new Map(), 1);
    assert.ok(quarantined.get('planet_S1')! < 100, "Quarantined planets must still decay");
    assert.ok(!quarantined.has('planet_S2'), "Quarantine must block outward spread");

    const empires = new Map(createMockState().empires);
    const before = empires.get('EMP1')!.informationPressure;
    const { empirePressure } = propagateEffects(1, [mkPub(1.0)], planets, empires);
    assert.ok((empirePressure.get('EMP1') ?? 0) > 0,
        "Circulating stories must raise the owning empire's information pressure");
    assert.strictEqual(before, 20, "sanity: mock starts at 20 pressure");
    console.log("PASS: propagation + pressure feedback verified.");
}

// --- O: A landed accusation cannot be replayed ---
function testAccusationReplayBlocked() {
    console.log("Test O: Accusation replay blocked");
    const state = createTwoEmpireState();
    const camp = seedCampaign(state);
    camp.exposure = 50; camp.signaled = true; camp.discoveredBy = 'EMP1';
    const target = state.empires.get('EMP1')!;
    const attacker = state.empires.get('EMP2')!;

    const first = accuseCampaign(camp, target, 'EMP2', attacker);
    assert.ok(first.ok, "First accusation should land");
    const credAfterFirst = attacker.credibility;

    const second = accuseCampaign(camp, target, 'EMP2', attacker);
    assert.ok(!second.ok, "Replay against a closed campaign must be rejected");
    assert.strictEqual(attacker.credibility, credAfterFirst, "Replay must not drain more credibility");
    console.log("PASS: replay exploit closed.");
}

// --- P: Repeated obstruction becomes self-defeating ---
function testObstructionEscalates() {
    console.log("Test P: Obstruction escalation");
    const state = createMockState();
    const inv = seedInvestigation(state, 0);
    const empire = state.empires.get('EMP1')!;
    // A coin that always lands "hold" at base odds but fails once odds exceed 0.6.
    const pickyRng = { check: (p: number) => p > 0.6 } as unknown as RNG;

    inv.progress = 100;
    const r1 = respondObstruct(inv, empire, pickyRng);
    assert.ok(r1.ok, "First stonewall should hold at base odds");
    inv.progress = 100;
    respondObstruct(inv, empire, pickyRng);
    inv.progress = 100;
    const r3 = respondObstruct(inv, empire, pickyRng);
    assert.ok(!r3.ok, "Repeated stonewalling must eventually leak");
    console.log("PASS: obstruction spam self-defeats.");
}

// --- Q: Narrative influence regenerates toward its ceiling ---
function testInfluenceRegen() {
    console.log("Test Q: Narrative influence regeneration");
    let state = createMockState();
    const adj = new Map<string, string[]>([['S1', ['S2']], ['S2', ['S1']]]);
    state.empires.get('EMP1')!.narrativeInfluence = 0; // spent to nothing

    state = tickPressSystem(state, 1, 2024, adj).newState;
    const after = state.empires.get('EMP1')!.narrativeInfluence;
    assert.ok(after > 0, "Influence must regenerate from zero, or info warfare stalls forever");

    // ...but not past the mediaFreedom-derived ceiling.
    state.empires.get('EMP1')!.narrativeInfluence = 99;
    state = tickPressSystem(state, 1, 2024, adj).newState;
    const ceiling = 30 + (state.empires.get('EMP1')!.mediaFreedom ?? 50) * 0.4;
    assert.ok(state.empires.get('EMP1')!.narrativeInfluence >= ceiling,
        "Influence above the ceiling should not be regenerated further");
    assert.strictEqual(state.empires.get('EMP1')!.narrativeInfluence, 99,
        "Regen must not reduce an empire already above the ceiling");
    console.log(`PASS: 0 -> ${after.toFixed(2)}, ceiling respected.`);
}

try {
    testLeakPublication();
    testSuppressionBacklash();
    testDenialHolds();
    testDenialExposed();
    testDistract();
    testAdmitReform();
    testInvestigationLifecycle();
    testInvestigationResponses();
    testObstruction();
    testCampaignLifecycle();
    testCampaignResponses();
    testCrisisMultiplayer();
    testPublicationHygiene();
    testPropagationAndPressure();
    testAccusationReplayBlocked();
    testObstructionEscalates();
    testInfluenceRegen();
    console.log("ALL TESTS PASSED");
} catch (e) {
    console.error("TEST FAILED", e);
    process.exit(1);
}
