// scripts/charter-soak-probe.ts
// A season of the real strategic tick with every empire AI-run and able to
// charter companies — the closest a probe gets to a live worker without a
// database. It answers two questions the unit tests cannot:
//
//   1. Does anything in the charter layer throw, or stop surviving the
//      serialize → deserialize round trip the worker does after every tick?
//   2. Left alone for a season, does the layer stay sane — companies founded,
//      renewed, raided, nationalised — or does it run away with the galaxy?
//
// Run:  npx tsx scripts/charter-soak-probe.ts            (a full season, 1260 ticks)
//       npx tsx scripts/charter-soak-probe.ts 300        (shorter)
//       npx tsx scripts/charter-soak-probe.ts 1260 off   (control: nobody may charter)
//       npx tsx scripts/charter-soak-probe.ts 1260 on b  (a different seed)
//
// The control run is what makes the numbers readable: compare open secession
// crises, pirate fleets and treasuries with and without companies in the world.

import { getGameWorldState } from '../lib/game-world-state-singleton';
import { runStrategicTick } from '../lib/time/tick-processor';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { initRegistries } from '../lib/politics/registry';
import { ensureDiplomacyState } from '../lib/diplomacy/offer-service';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { ensurePressState } from '../lib/press-system/integration';
import { ensureGovernments } from '../lib/government/government-service';
import { ensureHeadsOfState } from '../lib/government/succession-service';
import { ensureCabinets } from '../lib/government/cabinet-service';
import { ensureGovernors } from '../lib/government/governor-service';
import { ensureCohesion } from '../lib/government/cohesion-service';
import { ensureFactionTraits } from '../lib/factions/traits-service';
import { ensurePlanetDemographics } from '../lib/galaxy/population-composition';
import { ensureLaneGraph } from '../lib/movement/lane-graph';
import { advanceFleet } from '../lib/movement/movement-service';
import { ensureCorporateState } from '../lib/economy/corporate/company-registry';
import { CHARTER_TECH_ID, seededRandom } from '../lib/economy/corporate/charter-service';
import { TechEngine, applyUnlock, registry } from '../lib/tech/engine';
import '../lib/tech/techData';
import { drainBuffer, resetChronicleBuffer } from '../lib/narrative/chronicle';
import { StrategicAIService } from '../lib/ai/strategic-ai-service';

const TICK = 6 * 3600;
const SEASON_TICKS = 1260;
/** Fleet movement lives inline in the worker; this is its stand-in. */
const MOVE_SUBSTEPS = 12;

const ticks = Math.max(1, Number(process.argv[2]) || SEASON_TICKS);
const chartersOn = process.argv[3] !== 'off';

// ── Quiet the simulation, but keep everything it complains about ────────────
const realLog = console.log;
const realWarn = console.warn;
const realError = console.error;
const complaints = new Map<string, number>();
const note = (args: unknown[]) => {
    const line = args.map(a => (a instanceof Error ? `${a.message}` : String(a))).join(' ');
    // Collapse ids and numbers so one fault repeated all season is one line.
    const key = line.replace(/[0-9a-f]{12,}/g, '#').replace(/\d+/g, 'N').slice(0, 200);
    complaints.set(key, (complaints.get(key) ?? 0) + 1);
};
/** What the AI governments and the companies did, as the worker would log it. */
const corporateLog: string[] = [];
console.log = (...args: unknown[]) => {
    const line = args.map(String).join(' ');
    if ((line.startsWith('[AI]') && line.includes(' corporate: ')) || line.startsWith('[Corporate]')) corporateLog.push(line);
};
console.warn = () => {};
console.error = (...args: unknown[]) => note(args);

function tally<T extends string>(values: T[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const v of values) out[v] = (out[v] ?? 0) + 1;
    return out;
}

function credits(world: any, factionId: string): number {
    return world.economy.factions.get(factionId)?.reserves?.['CREDITS'] ?? 0;
}

function reading(world: any) {
    const corp = world.corporate;
    const companies = [...corp.companies.values()] as any[];
    const empires = [...world.economy.factions.keys()].filter((id: string) => id !== 'faction-pirates' && id !== 'faction-neutral');
    const fleets = [...world.movement.fleets.values()] as any[];
    const treasuries = companies.map(c => c.treasury);
    const empireCredits = empires.map((id: string) => credits(world, id));
    return {
        companies: companies.length,
        standing: tally(companies.map(c => c.standing ?? 'instrument')),
        rogue: companies.filter(c => c.hasGoneRogue).length,
        nationalized: companies.filter(c => c.nationalized).length,
        assets: companies.reduce((s, c) => s + (c.assets ?? []).length, 0),
        dark: companies.reduce((s, c) => s + (c.assets ?? []).filter((a: any) => (a.disruptedUntil ?? 0) > world.nowSeconds).length, 0),
        renewalsPending: [...corp.renewals.values()].filter((r: any) => r.status === 'pending').length,
        treasuryMin: treasuries.length ? Math.round(Math.min(...treasuries)) : 0,
        treasuryMax: treasuries.length ? Math.round(Math.max(...treasuries)) : 0,
        secessionOpen: [...(world.secessionCrises?.values?.() ?? [])].filter((c: any) => c.status === 'open').length,
        pirateBands: [...(world.piracy?.organizations?.values?.() ?? [])].filter((o: any) => !o.dissolvedAtSeconds).length,
        corporateBands: [...(world.piracy?.organizations?.values?.() ?? [])].filter((o: any) => o.origin === 'corporate_deniable').length,
        pirateFleets: fleets.filter(f => f.factionId === 'faction-pirates').length,
        fleets: fleets.length,
        empires: empires.length,
        creditsMin: Math.round(Math.min(...empireCredits)),
        creditsMax: Math.round(Math.max(...empireCredits)),
        snapshotKb: 0,
    };
}

/**
 * System ownership is derived from planet ownership by the worker every cycle
 * (recalculateSystemControl in scripts/game-loop.ts, which cannot be imported
 * without starting a worker). Company expansion, AI expansion and piracy all
 * read it, so the soak derives it the same way.
 */
function recalculateSystemControl(world: any): void {
    const owners = new Map<string, Set<string>>();
    for (const planet of world.construction.planets.values()) {
        if (!planet.ownerId || planet.ownerId === 'faction-neutral') continue;
        const set = owners.get(planet.systemId) ?? new Set<string>();
        set.add(planet.ownerId);
        owners.set(planet.systemId, set);
    }
    for (const [sysId, system] of world.movement.systems as Map<string, any>) {
        const set = owners.get(sysId);
        system.ownerFactionId = set && set.size === 1 ? [...set][0] : undefined;
        system.isContested = !!set && set.size > 1;
    }
}

function finiteEverywhere(world: any): string[] {
    const bad: string[] = [];
    for (const c of world.corporate.companies.values() as Iterable<any>) {
        for (const key of ['treasury', 'sharePrice', 'autonomyLevel', 'loyalty', 'influence', 'corruptionIndex', 'privateFleetSize', 'debt', 'stateLoan', 'profitShareToState']) {
            const v = c[key];
            if (v !== undefined && !Number.isFinite(v)) bad.push(`${c.id}.${key}=${v}`);
        }
        if ((c.autonomyLevel ?? 0) < 0 || (c.autonomyLevel ?? 0) > 100) bad.push(`${c.id}.autonomyLevel=${c.autonomyLevel}`);
        if ((c.loyalty ?? 0) < 0 || (c.loyalty ?? 0) > 100) bad.push(`${c.id}.loyalty=${c.loyalty}`);
    }
    for (const [id, f] of world.economy.factions as Map<string, any>) {
        for (const [res, v] of Object.entries(f.reserves ?? {})) {
            if (!Number.isFinite(v as number)) bad.push(`${id}.reserves.${res}=${v}`);
        }
    }
    for (const gov of world.government?.values?.() ?? []) {
        if (!Number.isFinite(gov.politicalCapital)) bad.push(`${gov.factionId}.politicalCapital=${gov.politicalCapital}`);
    }
    return bad;
}

async function main() {
    // Parts of the simulation still roll Math.random (share-price noise, AI
    // espionage, unrest notices). Seeding it removes most of the run-to-run
    // noise. Not all of it: a few systems read the wall clock (survey and scan
    // timers, ids), so two runs of one seed agree on the shape of a season —
    // how many companies, whether anything threw — not on every event.
    Math.random = seededRandom(`charter-soak:${process.argv[4] ?? 'a'}`);

    initRegistries();
    let world = getGameWorldState() as any;

    // The same bootstrap the worker runs after loading a snapshot.
    if (!world.activeCombats) world.activeCombats = new Map();
    if (!world.rivalries) world.rivalries = new Map();
    if (!(world.secessionCrises instanceof Map)) world.secessionCrises = new Map();
    ensureDiplomacyState(world);
    ensureEmpirePostures(world);
    ensurePressState(world);
    ensureGovernments(world);
    ensureHeadsOfState(world);
    ensureCabinets(world);
    ensureGovernors(world);
    ensureCohesion(world);
    ensureCorporateState(world);
    ensureFactionTraits(world);
    ensurePlanetDemographics(world);
    ensureLaneGraph(world.movement.systems);
    if (!world.nowSeconds || world.nowSeconds <= 0) world.nowSeconds = 1_000_000;
    resetChronicleBuffer();

    // Nobody is human: every empire is played by the AI.
    world.claimedFactionIds = [];

    const empires = [...world.economy.factions.keys()].filter((id: string) => id !== 'faction-pirates' && id !== 'faction-neutral');
    if (chartersOn) {
        for (const id of empires) {
            const state = world.tech.get(id) ?? TechEngine.initPlayerState(id);
            if (!state.unlockedTechIds.includes(CHARTER_TECH_ID)) applyUnlock(state, CHARTER_TECH_ID);
            world.tech.set(id, state);
        }
    }

    // Where chartering sits in the order an AI researches things (tier, then id).
    const order = registry.getAll().slice().sort((a, b) => (a.tier - b.tier) || a.id.localeCompare(b.id));
    const position = order.findIndex(t => t.id === CHARTER_TECH_ID);
    const hoursBefore = order.slice(0, Math.max(0, position)).reduce((s, t) => s + (t.researchCost ?? 0), 0);

    const events: Record<string, number> = {};
    const started = Date.now();
    const checkpoints: Array<{ tick: number } & ReturnType<typeof reading>> = [];
    let peakCompanies = 0;
    let firstCharterTick = -1;
    const nonFinite = new Set<string>();
    const known = new Map<string, string>();
    const departures: string[] = [];
    let unexplained = 0;

    for (let i = 1; i <= ticks; i++) {
        const now = world.nowSeconds + TICK;

        // Fleets in transit advance between strategic ticks in the worker.
        for (let s = 0; s < MOVE_SUBSTEPS; s++) {
            for (const [fleetId, fleet] of world.movement.fleets as Map<string, any>) {
                if (!fleet.destinationSystemId) continue;
                world.movement.fleets.set(fleetId, advanceFleet(fleet, TICK / MOVE_SUBSTEPS, world.movement));
            }
        }

        recalculateSystemControl(world);

        await runStrategicTick(new Date(now * 1000), i, world);

        // The worker round-trips the world through JSON after every strategic
        // tick. Anything the charter layer keeps that does not survive that is
        // a bug no in-memory test can see.
        const blob = serializeWorld(world);
        world = deserializeWorld(blob);

        const rows = drainBuffer().rows;
        for (const row of rows) events[row.type] = (events[row.type] ?? 0) + 1;
        for (const bad of finiteEverywhere(world)) nonFinite.add(bad.replace(/=.*/, ''));

        // Every company that leaves the register must leave by a door the
        // galaxy can see: bought out, wound up, or liquidated.
        const alive = new Set<string>(world.corporate.companies.keys());
        for (const [id, name] of known) {
            if (alive.has(id)) continue;
            known.delete(id);
            const explained = rows.some(r => (r.type === 'company_acquired' || r.type === 'charter_revoked')
                && JSON.parse(r.facts).companyName === name);
            departures.push(`tick ${i}: ${name} ${explained ? 'left the register (chronicled)' : 'VANISHED with no chronicle entry'}`);
            if (!explained) unexplained++;
        }
        for (const c of world.corporate.companies.values() as Iterable<any>) known.set(c.id, c.charter.fullName);

        const count = world.corporate.companies.size;
        peakCompanies = Math.max(peakCompanies, count);
        if (firstCharterTick < 0 && count > 0) firstCharterTick = i;

        if (i % Math.max(1, Math.floor(ticks / 6)) === 0 || i === ticks) {
            checkpoints.push({ tick: i, ...reading(world), snapshotKb: Math.round(blob.length / 1024) });
        }
    }
    const seconds = (Date.now() - started) / 1000;

    console.log = realLog; console.warn = realWarn; console.error = realError;

    console.log(`\nCharter soak — ${ticks} strategic ticks (${(ticks * 24 / 60 / 24).toFixed(1)} real days of play), charters ${chartersOn ? 'ON' : 'OFF (control)'}, ${empires.length} AI empires`);
    console.log(`  ${seconds.toFixed(1)}s wall, ${(seconds / ticks * 1000).toFixed(0)} ms per tick`);
    console.log(`  chartering tech is #${position + 1} of ${order.length} in the AI's research order — about ${Math.round(hoursBefore / 6)} ticks (${(hoursBefore / 6 * 24 / 60 / 24).toFixed(1)} real days) of research before it`);

    console.log('\n  tick  cos  assets dark  rogue natl  renew  secOpen bands(corp) pFleets fleets  co.treasury           empire credits        snapKB');
    for (const c of checkpoints) {
        console.log(
            `  ${String(c.tick).padStart(4)}  ${String(c.companies).padStart(3)}  ${String(c.assets).padStart(6)} ${String(c.dark).padStart(4)}  ${String(c.rogue).padStart(5)} ${String(c.nationalized).padStart(4)}  ${String(c.renewalsPending).padStart(5)}  ${String(c.secessionOpen).padStart(7)} ${`${c.pirateBands}(${c.corporateBands})`.padStart(11)} ${String(c.pirateFleets).padStart(7)} ${String(c.fleets).padStart(6)}  ${`${c.treasuryMin}..${c.treasuryMax}`.padEnd(20)}  ${`${c.creditsMin}..${c.creditsMax}`.padEnd(20)}  ${c.snapshotKb}`
        );
    }
    const last = checkpoints[checkpoints.length - 1];
    console.log(`\n  standing at the end: ${JSON.stringify(last.standing)}`);
    console.log(`  first charter on tick ${firstCharterTick}; peak ${peakCompanies} companies`);

    // Why each empire did or did not charter: the AI's own reading of itself.
    console.log('\n  empire                      worlds   credits    PC  legit  stance (why)                              companies');
    for (const id of [...world.economy.factions.keys()].filter((f: string) => f !== 'faction-pirates' && f !== 'faction-neutral').sort()) {
        const worlds = [...world.construction.planets.values()].filter((p: any) => p.ownerId === id).length;
        const gov = world.government?.get?.(id);
        const read = StrategicAIService.assessStance(id, world);
        const owned = [...world.corporate.companies.values()].filter((c: any) => c.foundingFactionId === id).length;
        console.log(
            `  ${id.padEnd(27)} ${String(worlds).padStart(6)} ${String(Math.round(credits(world, id))).padStart(9)} ${String(Math.round(gov?.politicalCapital ?? 0)).padStart(5)} ${String(Math.round(gov?.legitimacy ?? 0)).padStart(6)}  ${`${read.stance} (${read.reasons.join('; ') || 'in good order'})`.padEnd(42)} ${owned}`
        );
    }

    const corporateEvents = ['charter_granted', 'charter_revoked', 'company_nationalized', 'company_went_rogue', 'company_broke_away', 'company_acquired', 'corporate_crisis', 'megaproject_completed', 'pirate_raid', 'secession_declared', 'civil_war_started', 'colony_founded'];
    console.log('  chronicle: ' + corporateEvents.map(t => `${t}=${events[t] ?? 0}`).join('  '));

    // What governments did about their companies, by kind.
    const verbs: Record<string, number> = {};
    for (const line of corporateLog) {
        const verb = line.startsWith('[Corporate]')
            ? (/\] (raid|occupation) /.exec(line)?.[1] ?? (line.includes('broke from') ? 'break' : 'other'))
            : (/ corporate: ([a-z_]+(?: [a-z_]+)?)/i.exec(line)?.[1] ?? 'other');
        verbs[verb] = (verbs[verb] ?? 0) + 1;
    }
    console.log('  worker log: ' + Object.entries(verbs).sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}=${n}`).join('  '));
    for (const line of corporateLog.filter(l => /nationalised|chartered|broke from|reflagged|renewal lapse|wound up/.test(l)).slice(-12)) {
        console.log('    ' + line.slice(0, 190));
    }

    for (const line of departures) console.log('    ' + line);

    const sorted = [...complaints.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`\n  console.error lines: ${sorted.length} distinct`);
    for (const [line, n] of sorted.slice(0, 25)) console.log(`   ×${n}  ${line}`);

    const failures: string[] = [];
    const charterFaults = sorted.filter(([line]) => /Corporate|corporate|charter|Charter|tickMissionServices|tickAssetRaids|tickRogueCompanies|tickCharterRenewals|tickBoardControl/.test(line));
    if (charterFaults.length) failures.push(`${charterFaults.length} error line(s) from the charter layer`);
    if (nonFinite.size) failures.push(`non-finite or out-of-range values: ${[...nonFinite].slice(0, 8).join(', ')}`);
    if (chartersOn && peakCompanies === 0) failures.push('no AI empire ever chartered a company');
    if (peakCompanies > empires.length * 3) failures.push(`company count ran away (${peakCompanies})`);
    if (unexplained) failures.push(`${unexplained} company(ies) vanished from the register without a chronicle entry`);

    if (failures.length) {
        console.log('\nFAIL');
        for (const f of failures) console.log('  - ' + f);
        process.exit(1);
    }
    console.log('\nPASS — a season of chartering with nothing thrown and nothing out of range.');
}

main().catch(e => {
    console.log = realLog;
    realError('THREW:', e);
    process.exit(1);
});
