// scripts/test-piracy-phase0.ts
// Pirate system Phase 0 verification — determinism and the unification of the
// two pirate populations (docs/pirate-system/systems.md §10).
// Run: npx tsx scripts/test-piracy-phase0.ts

import {
    derivePiracyFleets,
    suppressRaider,
    tickPiracyInterdiction,
    PiracyFleet,
    RaiderSnapshot,
} from '../lib/trade-system/piracy-service';
import { RNG, seedFromString } from '../lib/trade-system/rng';
import { TradeRoute } from '../lib/trade-system/types';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = '') {
    if (condition) {
        passed++;
        console.log(`  PASS  ${label}`);
    } else {
        failed++;
        console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function raider(fleetId: string, systemId: string, strength: number): RaiderSnapshot {
    return { fleetId, systemId, strength, organizationId: null, sponsorFactionId: null };
}

function route(id: string, path: string[], escortLevel = 0): TradeRoute {
    return {
        id,
        agreementId: `agr-${id}`,
        path,
        theatreId: 'theatre-1',
        exposureScore: 0,
        piracyRisk: 0,
        blockadeRisk: 0,
        deepSpaceRisk: 0,
        escortLevel,
        routePriority: 10,
    };
}

/** The spawn decision as step11_pirateSpawning now makes it. */
function spawnRoll(systemId: string, nowSeconds: number): number {
    return new RNG(seedFromString(`piracy|spawn|${systemId}|${nowSeconds}`)).next();
}

// ─── 1. Seeded RNG is reproducible ───────────────────────────────────────────

console.log('\n[1] determinism');
{
    const a = spawnRoll('sys-alpha', 3600);
    const b = spawnRoll('sys-alpha', 3600);
    check('same (system, clock) gives the same spawn roll', a === b, `${a} vs ${b}`);

    const other = spawnRoll('sys-beta', 3600);
    check('a different system gives a different roll', a !== other, `${a} vs ${other}`);

    const later = spawnRoll('sys-alpha', 7200);
    check('a different tick gives a different roll', a !== later, `${a} vs ${later}`);

    const seqA = Array.from({ length: 5 }, () => new RNG(seedFromString('piracy|escape|fleet-1|100')).next());
    check('re-seeding reproduces the same value', new Set(seqA).size === 1);

    check('seedFromString is stable', seedFromString('piracy|spawn|sys-alpha|3600') === seedFromString('piracy|spawn|sys-alpha|3600'));
}

// ─── 2. One interdiction record per occupied system ──────────────────────────

console.log('\n[2] derived interdiction registry');
{
    const raiders = [
        raider('pirate-1', 'sys-alpha', 0.4),
        raider('pirate-2', 'sys-alpha', 0.5),
        raider('pirate-3', 'sys-beta', 0.3),
    ];
    const derived = derivePiracyFleets(raiders, new Map());

    check('two raiders in one system produce ONE record', derived.size === 2, `size ${derived.size}`);
    check('record id is derived from the system, not a clock', derived.has('piracy-sys-alpha'));

    const alpha = derived.get('piracy-sys-alpha')!;
    check('strength sums the raiders present', Math.abs(alpha.interdictionStrength - 0.45) < 1e-6, `${alpha.interdictionStrength}`);
    check('record tracks the fleets it came from', alpha.raiderFleetIds?.length === 2);

    const empty = derivePiracyFleets([], derived);
    check('no raiders means no interdiction records', empty.size === 0, `size ${empty.size}`);
}

// ─── 3. Loot survives the rebuild ────────────────────────────────────────────

console.log('\n[3] loot carry-over');
{
    const raiders = [raider('pirate-1', 'sys-alpha', 0.4)];
    const first = derivePiracyFleets(raiders, new Map());
    first.get('piracy-sys-alpha')!.lootAccumulated = 4200;
    first.get('piracy-sys-alpha')!.isDetected = true;

    const second = derivePiracyFleets(raiders, first);
    const camp = second.get('piracy-sys-alpha')!;
    check('loot pool carries into the next tick', camp.lootAccumulated === 4200, `${camp.lootAccumulated}`);
    check('detection flag carries into the next tick', camp.isDetected === true);

    const moved = derivePiracyFleets([raider('pirate-1', 'sys-beta', 0.4)], second);
    check('an abandoned system drops out of the registry', !moved.has('piracy-sys-alpha'));
    check('the new camp starts with an empty pool', moved.get('piracy-sys-beta')!.lootAccumulated === 0);
}

// ─── 4. A route is taxed once per camp, not once per raider ──────────────────

console.log('\n[4] no double taxation');
{
    const lane = route('route-1', ['sys-alpha', 'sys-gamma']);
    const raiders = [
        raider('pirate-1', 'sys-alpha', 0.9),
        raider('pirate-2', 'sys-alpha', 0.9),
        raider('pirate-3', 'sys-alpha', 0.9),
    ];
    const derived = derivePiracyFleets(raiders, new Map());
    // interdictionStrength is capped at 0.95, so at this size every camp hits.
    const results = tickPiracyInterdiction([...derived.values()], [lane], new RNG(1));

    check('three raiders in one system hit the route once', results.length === 1, `${results.length} hits`);
    check('the hit is attributed to the camp record', results[0]?.fleetId === 'piracy-sys-alpha');
    check('the route risk ratchets', lane.piracyRisk > 0, `${lane.piracyRisk}`);
}

// ─── 5. Interdiction is deterministic under a fixed seed ─────────────────────

console.log('\n[5] interdiction determinism');
{
    const run = () => {
        const lane = route('route-1', ['sys-alpha']);
        const derived = derivePiracyFleets([raider('pirate-1', 'sys-alpha', 1.2)], new Map());
        return tickPiracyInterdiction([...derived.values()], [lane], new RNG(99))
            .map(r => `${r.routeId}:${r.resource}:${r.volumeLost}`)
            .join('|');
    };
    const a = run();
    const b = run();
    check('the same seed replays the same raids', a === b, `${a} vs ${b}`);
}

// ─── 6. Suppression damages the physical raider ──────────────────────────────

console.log('\n[6] suppression');
{
    const fleet = { strength: 0.6 };
    const survived = suppressRaider(fleet, 0.25);
    check('a glancing engagement does not destroy the raider', survived === false);
    check('raider strength falls', Math.abs(fleet.strength - 0.35) < 1e-6, `${fleet.strength}`);

    const destroyed = suppressRaider(fleet, 0.5);
    check('enough damage destroys the raider', destroyed === true);

    // A destroyed raider leaving the system must empty the registry, which is
    // what makes fighting the raiders on the map actually stop the trade losses.
    const after = derivePiracyFleets([], derivePiracyFleets([raider('pirate-1', 'sys-alpha', 0.6)], new Map()));
    check('killing the last raider ends interdiction in that system', after.size === 0);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
