// scripts/campaign-probe.ts
// The staged raid and the skip, through the real worker paths: the raider jumps
// in only when the goal is reached, fights a warship in the home system, and the
// goal closes whether it dies or leaves. The first warship is rushed, the second
// is not. Skipping stamps the campaign and no raid comes.
//
// Run:  npx tsx scripts/campaign-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { executeOrder } from './game-loop';
import { RAID_PATIENCE, tickCampaignRaids } from '../lib/goals/campaign-raid';
import { FIRST_WEEK_GOALS, currentGoal, tickFirstWeekGoals } from '../lib/goals/first-week-goals';
import { processSectorCombats } from '../lib/combat/combat-manager';
import { grantStarterKits } from '../lib/start/starter-kit';
import { QUICK_BUILD_SECONDS } from '../lib/construction/build-time';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    seedSimulation('campaign');
    const realLog = console.log;
    quietConsole();
    const world: any = bootSoakWorld();
    const [human, other] = empireIds(world);
    world.claimedFactionIds = [human];
    grantStarterKits(world);

    const home = world.economy.factions.get(human).capitalSystemId;
    const capital: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === human && p.systemId === home);
    const reserves = world.economy.factions.get(human).reserves;
    for (const k of Object.keys(reserves)) reserves[k] = 10_000_000;
    const before = (id: string) => Object.fromEntries(FIRST_WEEK_GOALS.slice(0, FIRST_WEEK_GOALS.findIndex(g => g.id === id)).map(g => [g.id, 1]));
    const raiders = () => [...world.movement.fleets.values()].filter((f: any) => f.campaignRaidOf === human) as any[];

    // ── The rushed first warship ─────────────────────────────────────────────
    world.firstWeekGoals = new Map([[human, { index: 0, completedAt: before('commission_ships') }]]);
    tickCampaignRaids(world);
    check('no raid before its goal', raiders().length === 0);
    const jobs = () => world.combat?.recruitmentJobs ?? [];
    world.combat.recruitmentJobs = [];
    executeOrder(world, 'MIL_BUILD_FLEET', { planetId: capital.id, systemId: home, reserve: true, recruitUnitType: 'CORVETTE' }, human);
    const rushed = jobs()[0];
    check('the first warship lands in two minutes', rushed && rushed.completesAt - world.nowSeconds <= QUICK_BUILD_SECONDS, `${rushed?.completesAt - world.nowSeconds}`);
    world.firstWeekGoals = new Map([[human, { index: 0, completedAt: before('repel_raid') }]]);
    executeOrder(world, 'MIL_BUILD_FLEET', { planetId: capital.id, systemId: home, reserve: true, recruitUnitType: 'CORVETTE' }, human);
    const later = jobs()[1];
    check('the next one takes its normal time', later && later.completesAt - world.nowSeconds > QUICK_BUILD_SECONDS, `${later?.completesAt - world.nowSeconds}`);
    world.combat.recruitmentJobs = [];

    // ── The raid ─────────────────────────────────────────────────────────────
    check('the goal is the raid', currentGoal(world, human)?.goal.id === 'repel_raid');
    tickCampaignRaids(world);
    check('a raider jumps in at home', raiders().length === 1 && raiders()[0].currentSystemId === home);
    tickCampaignRaids(world);
    check('only one', raiders().length === 1);

    const reserve: any = [...world.movement.fleets.values()].find((f: any) => f.reserveOf === capital.id);
    Object.assign(reserve, { composition: { corvette: 4 }, basePower: 48, strength: 1 });
    processSectorCombats(world);
    const battle: any = [...world.activeCombats.values()].find((c: any) => c.target?.systemId === home);
    check('the home fleet fights it unasked', !!battle);
    check('no one else is dragged in', !battle || [battle.attacker.factionId, battle.defender.factionId].every((id: string) => id === human || id === raiders()[0]?.factionId));
    world.activeCombats.clear();

    world.movement.fleets.delete(raiders()[0].id);
    tickCampaignRaids(world);
    tickFirstWeekGoals(world);
    check('a dead raider closes the goal', currentGoal(world, human)?.goal.id === 'first_op', currentGoal(world, human)?.goal.id);

    // ── A player who never answers still moves on ────────────────────────────
    capital.campaignRaid = undefined;
    world.firstWeekGoals = new Map([[human, { index: 0, completedAt: before('repel_raid') }]]);
    tickCampaignRaids(world);
    world.nowSeconds += RAID_PATIENCE + 1;
    tickCampaignRaids(world);
    tickFirstWeekGoals(world);
    check('the raider leaves in the end', raiders().length === 0);
    check('and the goal closes', currentGoal(world, human)?.goal.id === 'first_op');

    // ── Skip ─────────────────────────────────────────────────────────────────
    capital.campaignRaid = undefined;
    world.firstWeekGoals = new Map([[human, { index: 0, completedAt: {} }]]);
    executeOrder(world, 'CAMPAIGN_SKIP', {}, human);
    tickCampaignRaids(world);
    check('skip lands on the first next step', currentGoal(world, human)?.goal.phase === 'next', currentGoal(world, human)?.goal.id);
    check('and no raid comes', raiders().length === 0);
    void other;

    console.log = realLog;
    console.log(results.join('\n'));
    console.log(`\n${results.length - failures} passed, ${failures} failed.`);
    process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
