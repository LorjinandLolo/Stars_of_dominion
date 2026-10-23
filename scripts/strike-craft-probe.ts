// scripts/strike-craft-probe.ts
// How much damage carrier squadrons deal, and how they fly.
//
//   npx tsx scripts/strike-craft-probe.ts
//
// One player carrier against one enemy cruiser that is held still with its
// guns cold, so only the strike craft fight. Reports damage dealt by bombers
// and by interceptors over 60 battle seconds, the share of time each squadron
// spends firing, and how far it ranges from its target (a hovering squadron
// shows a tiny spread; a strafing one sweeps in and out).

import { createBattle, setSquadronOrder, update } from '../lib/tactical/sim';
import type { BattleState, SquadronType, TacticalShip } from '../lib/tactical/types';

const SECONDS = 60;
const STEP = 1 / 30;

function run(type: SquadronType) {
    const state: BattleState = createBattle({
        playerReserves: [{ classId: 'carrier', sourceKey: 'carrier', count: 1 }],
        enemyReserves: [{ classId: 'cruiser', sourceKey: 'cruiser', count: 1 }],
        playerCapacity: 6,
        enemyCapacity: 4,
        enemyPlan: { posture: 'defensive', retreatBelowFleetStrength: 0 },
        timeLimit: 999,
    });
    const target = state.ships.find(s => s.side === 'enemy') as TacticalShip;
    const carrier = state.ships.find(s => s.side === 'player') as TacticalShip;
    // Park the target mid-field, the carrier well back, both frozen.
    const tx = 800, ty = 500;
    const freeze = () => {
        target.x = tx; target.y = ty; target.speed = 0; target.moveOrder = null;
        target.weaponCooldowns.fill(999);
        carrier.x = 300; carrier.y = 500; carrier.speed = 0; carrier.moveOrder = null;
        carrier.weaponCooldowns.fill(999);
    };
    freeze();
    const startPool = target.hull + target.shields.reduce((a, b) => a + b, 0);

    let firingTime = 0;
    let samples = 0;
    let distSum = 0;
    let distMin = Infinity;
    let distMax = 0;
    let headingFlips = 0;
    let lastBearingSign = 0;
    let killTime: number | null = null;
    for (let t = 0; t < SECONDS; t += STEP) {
        freeze();
        // Keep target shields from regenerating so damage adds up cleanly.
        target.lastHitAt = state.time;
        for (const sq of state.squadrons) {
            if (sq.side !== 'player') continue;
            if (sq.type === type) {
                if (sq.order !== 'attack' || sq.targetShipId !== target.id) setSquadronOrder(state, [sq.id], 'attack', target.id);
            } else if (sq.order !== 'return') {
                setSquadronOrder(state, [sq.id], 'return');
            }
        }
        const before = target.hull + target.shields.reduce((a, b) => a + b, 0);
        update(state, STEP);
        const after = target.hull + target.shields.reduce((a, b) => a + b, 0);
        const sq = state.squadrons.find(q => q.side === 'player' && q.type === type);
        if (sq) {
            const d = Math.hypot(sq.x - tx, sq.y - ty);
            distSum += d; samples++;
            distMin = Math.min(distMin, d);
            distMax = Math.max(distMax, d);
            const sign = Math.sign(sq.x - tx);
            if (lastBearingSign && sign && sign !== lastBearingSign) headingFlips++;
            if (sign) lastBearingSign = sign;
            if (after < before - 1e-9) firingTime += STEP;
        }
        if (target.status === 'destroyed') { killTime = state.time; break; }
    }
    const endPool = target.status === 'destroyed' ? 0 : target.hull + target.shields.reduce((a, b) => a + b, 0);
    return {
        type,
        damage: Math.round(startPool - endPool),
        firingShare: +(firingTime / SECONDS).toFixed(2),
        meanDist: Math.round(distSum / Math.max(1, samples)),
        minDist: Math.round(distMin),
        maxDist: Math.round(distMax),
        passesOverTarget: headingFlips,
        killSeconds: killTime === null ? null : Math.round(killTime),
    };
}

for (const type of ['bomber', 'interceptor'] as const) console.log(JSON.stringify(run(type)));
