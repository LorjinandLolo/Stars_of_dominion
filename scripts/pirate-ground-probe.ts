// scripts/pirate-ground-probe.ts
// Pirate ground is dangerous to the weak: pirates resting at a Corsair Den or
// Pirate Station fight a fleet they outgun, seize an unescorted unarmed ship,
// and leave a stronger fleet alone. A lost arrival survey refunds nothing, and
// the move order's warning fires only for unarmed ships headed onto pirate
// ground.
//
// Run:  npx tsx scripts/pirate-ground-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { pirateGroundEngages, seizeCiviliansOnPirateGround } from '../lib/piracy/pirate-ground-strikes';
import { isUnarmedFleet, pirateGroundWarning, PIRATE_FACTION } from '../lib/piracy/pirate-ground';
import { processSectorCombats } from '../lib/combat/combat-manager';
import { advanceExplorationNow } from '../lib/time/tick-processor';
import { peekBuffer, resetChronicleBuffer } from '../lib/narrative/chronicle';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    seedSimulation('pirate-ground');
    const quiet = quietConsole(() => true);
    const world: any = bootSoakWorld();
    const me = empireIds(world)[0];
    const capital = world.economy.factions.get(me).capitalSystemId;
    const ids = [...world.movement.systems.keys()].filter((id: string) => id !== capital);
    const den = ids[0], quietSys = ids[1];
    world.movement.systems.get(den).tags = [...(world.movement.systems.get(den).tags ?? []), 'corsair_den'];
    world.movement.systems.get(quietSys).tags = (world.movement.systems.get(quietSys).tags ?? []).filter((t: string) => t !== 'corsair_den' && t !== 'pirate_station');
    world.activeCombats = new Map();

    const put = (id: string, factionId: string, systemId: string, basePower: number, composition: Record<string, number>) => {
        const f = { id, name: id, factionId, currentSystemId: systemId, destinationSystemId: null, plannedPath: [], transitProgress: 0, basePower, strength: 1, composition, orders: [] };
        world.movement.fleets.set(id, f);
        return f;
    };
    put('pirates', PIRATE_FACTION, den, 60, { destroyer: 3 });
    put('quiet-pirates', PIRATE_FACTION, quietSys, 60, { destroyer: 3 });

    // ── The warning ─────────────────────────────────────────────────────────
    const explorer = { name: 'Scout', composition: { explorer: 1 }, basePower: 0 };
    const warship = { name: 'Line', composition: { destroyer: 4 }, basePower: 80 };
    check('an explorer is unarmed, a destroyer group is not', isUnarmedFleet(explorer) && !isUnarmedFleet(warship));
    check('the warning fires for an unarmed fleet bound for a den', !!pirateGroundWarning(explorer, { name: 'Den', tags: ['corsair_den'] }));
    check('…and for a pirate station', /Pirate Station/.test(pirateGroundWarning(explorer, { name: 'Base', tags: ['pirate_station'] }) ?? ''));
    check('…not for a warship, nor for ordinary ground', pirateGroundWarning(warship, { tags: ['corsair_den'] }) === null && pirateGroundWarning(explorer, { tags: ['nebula'] }) === null);

    // ── Seizure ─────────────────────────────────────────────────────────────
    resetChronicleBuffer();
    put('scout', me, den, 0, { explorer: 1 });
    world.movement.explorationOrders = [{ fleetId: 'scout', factionId: me, targetSystemId: den, mode: 'survey', source: 'arrival', isAutomated: false, issuedAt: new Date(0).toISOString(), completesAt: new Date(9e12).toISOString() }];
    let seized = seizeCiviliansOnPirateGround(world);
    check('an unescorted explorer at a den is seized', seized.some(s => s.fleetId === 'scout') && !world.movement.fleets.has('scout'));
    check('…its survey goes with it', !world.movement.explorationOrders.some((o: any) => o.fleetId === 'scout'));
    check('…and the chronicle records a pirate raid', [...peekBuffer()].some(r => r.type === 'pirate_raid' && JSON.parse(r.targetIds).includes(me)));

    put('scout2', me, quietSys, 0, { explorer: 1 });
    seized = seizeCiviliansOnPirateGround(world);
    check('pirates off their own ground seize nothing', !seized.length && world.movement.fleets.has('scout2'));

    put('scout3', me, den, 0, { explorer: 1 });
    put('escort', me, den, 80, { destroyer: 4 });
    seized = seizeCiviliansOnPirateGround(world);
    check('an armed escort at least as strong covers the explorer', !seized.length && world.movement.fleets.has('scout3'));
    world.movement.fleets.delete('escort'); world.movement.fleets.delete('scout3');

    const moving = put('scout4', me, den, 0, { explorer: 1 });
    (moving as any).destinationSystemId = capital;
    seized = seizeCiviliansOnPirateGround(world);
    check('a ship only passing through is not stopped', !seized.length);
    world.movement.fleets.delete('scout4');

    // ── Combat ──────────────────────────────────────────────────────────────
    put('weak', me, den, 20, { corvette: 2 });
    check('pirates engage an armed fleet they outgun on their ground', pirateGroundEngages(world, den, me, PIRATE_FACTION) && pirateGroundEngages(world, den, PIRATE_FACTION, me));
    processSectorCombats(world);
    check('…and the combat manager opens the fight', [...world.activeCombats.keys()].some((k: string) => k.includes(den)), [...world.activeCombats.keys()].join(','));
    world.movement.fleets.delete('weak'); world.activeCombats = new Map();

    put('strong', me, den, 200, { cruiser: 4 });
    check('a stronger fleet is left alone', !pirateGroundEngages(world, den, me, PIRATE_FACTION));
    world.movement.fleets.delete('strong');
    put('weak2', me, quietSys, 20, { corvette: 2 });
    check('off pirate ground pirates still fight nobody', !pirateGroundEngages(world, quietSys, me, PIRATE_FACTION));
    check('two empires are never pulled in by this rule', !pirateGroundEngages(world, den, me, empireIds(world)[1]));

    // ── A lost arrival survey refunds nothing ───────────────────────────────
    const credits = world.economy.factions.get(me).reserves.CREDITS;
    world.movement.explorationOrders = [{ fleetId: 'gone', factionId: me, targetSystemId: den, mode: 'survey', source: 'arrival', isAutomated: false, issuedAt: new Date(0).toISOString(), completesAt: new Date(0).toISOString() }];
    advanceExplorationNow(world);
    check('a lost free survey refunds nothing', world.economy.factions.get(me).reserves.CREDITS === credits, `${credits} -> ${world.economy.factions.get(me).reserves.CREDITS}`);
    world.movement.explorationOrders = [{ fleetId: 'gone', factionId: me, targetSystemId: den, mode: 'survey', isAutomated: false, issuedAt: new Date(0).toISOString(), completesAt: new Date(0).toISOString() }];
    advanceExplorationNow(world);
    check('a lost paid survey is still refunded', world.economy.factions.get(me).reserves.CREDITS === credits + 500, `${credits} -> ${world.economy.factions.get(me).reserves.CREDITS}`);

    quiet.restore();
    console.log('\npirate ground probe\n' + results.join('\n'));
    console.log(failures ? `\n${failures} FAILED` : '\nall ok');
    process.exit(failures ? 1 : 0);
}

main().catch(e => {
    process.stderr.write(`pirate ground probe crashed: ${e?.stack ?? e}\n`);
    if (results.length) process.stderr.write(results.join('\n') + '\n');
    process.exit(1);
});
