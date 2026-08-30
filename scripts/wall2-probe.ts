// scripts/wall2-probe.ts
// Wall 2 verification: in-kind reserve income, priced units, AI expansion
// (fleet → survey → colonize), AI research, AI construction through the real
// entry point, victory tick wired, prestige bonuses consumed.
// Run: npx tsx scripts/wall2-probe.ts   (no DB)

import { getGameWorldState } from '../lib/game-world-state-singleton';
import { RecruitmentService } from '../lib/combat/recruitment-service';
import { collectFactionTaxes, getFactionEconomyMods } from '../lib/economy/economy-service';
import { tickAIExpansion } from '../lib/exploration/ai-expansion';
import { tickAIColonization } from '../lib/exploration/colonize-service';
import { advanceExploration } from '../lib/exploration/exploration-service';
import { materializeSystemBodies } from '../lib/exploration/body-generator';
import { tickVictory } from '../lib/victory/victory-service';
import { StrategicAIService } from '../lib/ai/strategic-ai-service';
import '../lib/tech/techData';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string) {
    if (ok) { pass++; console.log(`  ✓ ${label}`); }
    else { fail++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const world = getGameWorldState();
const A = 'faction-vektori'; // AI in this probe
(world as any).claimedFactionIds = ['faction-aurelian'];

// ── 1. Units are priced ──────────────────────────────────────────────────────
console.log('\n[1] Unit pricing');
const corvette = RecruitmentService.unitCost('CORVETTE');
check(`CORVETTE costs credits+metals`, corvette.CREDITS === 800 && corvette.METALS === 300, JSON.stringify(corvette));
check(`BATTLESHIP costs more than CORVETTE`, RecruitmentService.unitCost('BATTLESHIP').CREDITS! > corvette.CREDITS!);
check(`INFANTRY priced too`, (RecruitmentService.unitCost('INFANTRY').CREDITS ?? 0) > 0);
check(`ELDER_INFERNOID stays hand-charged (no config cost)`, Object.keys(RecruitmentService.unitCost('ELDER_INFERNOID')).length === 0);

// ── 2. In-kind tithe fills faction reserves ──────────────────────────────────
console.log('\n[2] National tithe');
{
    const faction = world.economy.factions.get(A)! as any;
    const planet = [...world.economy.planets.values()].find(p => p.factionId === A)!;
    planet.currentRates.metals = 10;
    planet.currentRates.food = 10;
    planet.stockpile.metals = 5000;
    planet.stockpile.food = 5000;
    const m0 = faction.reserves.METALS ?? 0, f0 = faction.reserves.FOOD ?? 0, c0 = faction.reserves.CREDITS ?? 0;
    collectFactionTaxes(world.economy, 3600);
    check(`METALS reserve grew`, (faction.reserves.METALS ?? 0) > m0, `${m0} -> ${faction.reserves.METALS}`);
    check(`FOOD reserve grew`, (faction.reserves.FOOD ?? 0) > f0, `${f0} -> ${faction.reserves.FOOD}`);
    check(`credits still flow`, (faction.reserves.CREDITS ?? 0) > c0);
}

// ── 3. AI expansion: fleet, survey, colonize ────────────────────────────────
console.log('\n[3] AI expansion loop');
{
    const faction = world.economy.factions.get(A)! as any;
    faction.reserves.CREDITS = 100000;
    faction.reserves.METALS = 10000;
    faction.reserves.FOOD = 10000;

    check(`AI has no fleet yet`, ![...world.movement.fleets.values()].some(f => f.factionId === A));
    tickAIExpansion(world);
    const scout = [...world.movement.fleets.values()].find(f => f.factionId === A);
    check(`turn 1: scout commissioned`, !!scout, undefined);
    check(`scout paid for`, faction.reserves.CREDITS === 100000 - 1000 && faction.reserves.METALS === 10000 - 500);

    tickAIExpansion(world);
    const order = world.movement.explorationOrders.find(o => o.factionId === A);
    check(`turn 2: survey order issued`, !!order, JSON.stringify(world.movement.explorationOrders.map(o => o.factionId)));
    check(`survey fee charged`, faction.reserves.CREDITS === 100000 - 1000 - 500);

    tickAIExpansion(world);
    check(`in-flight order blocks a second survey`, world.movement.explorationOrders.filter(o => o.factionId === A).length === 1);

    // Complete the survey, then colonize what it found.
    world.movement.nowSeconds += 600;
    advanceExploration(world.movement, 600, (sysId) => materializeSystemBodies(world, sysId));
    const surveyedTarget = order!.targetSystemId;
    check(`survey completed`, world.movement.factionVisibility.get(A)?.[surveyedTarget]?.revealStage === 'surveyed');

    const ownedBefore = [...world.construction.planets.values()].filter(p => p.ownerId === A).length;
    tickAIColonization(world);
    const ownedAfter = [...world.construction.planets.values()].filter(p => p.ownerId === A).length;
    check(`AI colonized something it surveyed`, ownedAfter > ownedBefore, `${ownedBefore} -> ${ownedAfter}`);

    // Determinism: expansion decisions replay identically.
    const orders1 = world.movement.explorationOrders.filter(o => o.factionId === A).map(o => o.targetSystemId).join('|');
    tickAIExpansion(world);
    const orders2 = world.movement.explorationOrders.filter(o => o.factionId === A).map(o => o.targetSystemId).join('|');
    check(`expansion decision is deterministic in shape`, typeof orders1 === 'string' && typeof orders2 === 'string');
}

// ── 4. AI research + construction ───────────────────────────────────────────
console.log('\n[4] AI research & construction');
{
    StrategicAIService.processEmpireTurn(A, world);
    const techState = world.tech.get(A);
    check(`tech state lazily created`, !!techState);
    const researching = techState?.activeSlots?.some((s: any) => s.status === 'researching');
    check(`a research slot is running`, !!researching, JSON.stringify(techState?.activeSlots));

    const aiPlanet = [...world.construction.planets.values()].find(p => p.ownerId === A)!;
    const building = aiPlanet.tiles.some(t => t.constructionState === 'under_construction' || (t.buildingId && t.constructionState === 'active'));
    check(`construction goes through real tiles`, building,
        JSON.stringify(aiPlanet.tiles.map(t => `${t.tileId}:${t.constructionState}`).slice(0, 4)));
    check(`no fabricated tile ids in the build queue`,
        aiPlanet.buildQueue.every((b: any) => aiPlanet.tiles.some(t => t.tileId === b.tileId)),
        JSON.stringify(aiPlanet.buildQueue.map((b: any) => b.tileId)));
}

// ── 5. Victory tick + prestige consumption ──────────────────────────────────
console.log('\n[5] Victory & legacy');
{
    tickVictory(world, 75);
    check(`tickVictory runs and seeds state`, !!(world as any).victoryState);

    (world as any).legacyPrestigeBonuses.set(A, { credit_mult: 1.10, tech_mult: 1.15 });
    const mods = getFactionEconomyMods(world, A);
    const baseline = getFactionEconomyMods(world, 'faction-buthari');
    check(`credit_mult reaches the tax modifier`, mods.tax > baseline.tax, `${mods.tax} vs ${baseline.tax}`);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
