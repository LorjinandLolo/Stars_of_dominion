// lib/time/tests.ts
// Stars of Dominion — Time System Unit Tests
// Pure synchronous tests, no test framework required. Run via ts-node.

import {
    getNextStrategicTick,
    getLastStrategicTick,
    getTicksRemaining,
    getProgressPercent,
    isExpired,
    formatCountdown,
    estimateCompletionTime,
    getCrisisExpiry,
    getCrisisTimeRemaining,
} from './time-helpers';
import { selectAutoResponse, calculateCrisisOutcome } from './auto-resolve';
import { createCrisis, respondToCrisis, getAllActiveCrises } from './crisis-engine';
import { getCurrentTickState } from './tick-scheduler';
import type { CrisisEvent } from './time-types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ FAILED: ${label}`);
        failed++;
    }
}

function section(name: string): void {
    console.log(`\n── ${name} ─────────────────────────────────────────────────`);
}

// ─── 1. Next Tick Timing ─────────────────────────────────────────────────────

section('1. Next Strategic Tick Timing');
{
    // At 03:00 UTC, next tick should be 06:00 UTC
    const t1 = new Date('2025-01-01T03:00:00Z');
    const next1 = getNextStrategicTick(t1);
    assert(next1.getUTCHours() === 6, 'Next tick at 03:00 is 06:00');

    // At 07:30 UTC, next tick should be 12:00 UTC
    const t2 = new Date('2025-01-01T07:30:00Z');
    const next2 = getNextStrategicTick(t2);
    assert(next2.getUTCHours() === 12, 'Next tick at 07:30 is 12:00');

    // At 20:00 UTC, next tick should be 00:00 UTC next day
    const t3 = new Date('2025-01-01T20:00:00Z');
    const next3 = getNextStrategicTick(t3);
    assert(next3.getUTCHours() === 0 && next3.getUTCDate() === 2, 'Next tick at 20:00 is 00:00 next day');

    // Exactly at tick time (06:00), next tick should be 12:00
    const t4 = new Date('2025-01-01T06:00:00Z');
    const next4 = getNextStrategicTick(t4);
    assert(next4.getUTCHours() === 12, 'Exactly at 06:00, next tick is 12:00');
}

// ─── 2. Ticks Remaining ───────────────────────────────────────────────────────

section('2. Ticks Remaining');
{
    const now = new Date('2025-01-01T01:00:00Z');
    const target = new Date('2025-01-01T13:00:00Z'); // 12h from now
    const ticks = getTicksRemaining(now, target);
    assert(ticks === 2, 'Ticks remaining for 12h = 2');

    const target2 = new Date('2025-01-01T00:30:00Z'); // in the past
    assert(getTicksRemaining(now, target2) === 0, 'Expired target gives 0 ticks remaining');
}

// ─── 3. Progress Calculation ──────────────────────────────────────────────────

section('3. Progress Percent');
{
    const start = new Date('2025-01-01T00:00:00Z');
    const end   = new Date('2025-01-01T12:00:00Z');
    const mid   = new Date('2025-01-01T06:00:00Z');
    assert(getProgressPercent(start, end, mid) === 50, 'Midpoint is 50%');
    assert(getProgressPercent(start, end, start) === 0, 'Start is 0%');
    assert(getProgressPercent(start, end, end) === 100, 'End is 100%');

    const past = new Date('2025-01-01T15:00:00Z');
    assert(getProgressPercent(start, end, past) === 100, 'Past end is clamped to 100%');
}

// ─── 4. Crisis Expiry ─────────────────────────────────────────────────────────

section('4. Crisis Expiry');
{
    const now = new Date('2025-01-01T10:00:00Z');
    const expiry6h  = getCrisisExpiry(6, now);
    const expiry12h = getCrisisExpiry(12, now);

    assert(new Date(expiry6h).getUTCHours() === 16, '6h crisis expires at 16:00');
    assert(new Date(expiry12h).getUTCHours() === 22, '12h crisis expires at 22:00');

    assert(isExpired(new Date('2025-01-01T17:00:00Z'), expiry6h), 'Crisis is expired after window');
    assert(!isExpired(new Date('2025-01-01T12:00:00Z'), expiry6h), 'Crisis not yet expired during window');

    const remaining = getCrisisTimeRemaining(expiry6h, now);
    assert(remaining === 6 * 60 * 60 * 1000, 'Remaining ms is exactly 6h');
}

// ─── 5. Countdown Formatting ──────────────────────────────────────────────────

section('5. Countdown Formatting');
{
    assert(formatCountdown(0) === '00:00:00', '0ms formats as 00:00:00');
    assert(formatCountdown(3661000) === '01:01:01', '3661s formats as 01:01:01');
    assert(formatCountdown(24 * 60 * 60 * 1000) === '24:00:00', '24h formats as 24:00:00');
}

// ─── 6. Project Completion Time ───────────────────────────────────────────────

section('6. Estimated Completion Time');
{
    const now = new Date('2025-01-01T03:00:00Z'); // 3 ticks until midnight next day
    const est1 = estimateCompletionTime(1, now);
    assert(new Date(est1).getUTCHours() === 5, '1 tick from 03:00 = 06:00 - 1s = 05:59:59');
}

// ─── 7. Auto-Resolve Doctrine ────────────────────────────────────────────────

section('7. Auto-Resolve Doctrine Fallback');
{
    const mockCrisis: CrisisEvent = {
        id: 'test-crisis-1',
        attackerEmpireId: 'faction-vektori',
        defenderEmpireId: 'faction-aurelian',
        targetId: 'system-1',
        targetType: 'system',
        crisisType: 'sabotage',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        severity: 'minor',
        visibleToDefender: true,
        defenderResponse: null,
        autoResolvePolicy: 'use_doctrine',
        resolutionStatus: 'pending',
        availableResponses: ['fortify', 'deceive', 'sacrifice'],
    };

    const autoResponse = selectAutoResponse(mockCrisis);
    const validOptions = mockCrisis.availableResponses;
    assert(validOptions.includes(autoResponse), `Auto-response "${autoResponse}" is a valid option`);
}

// ─── 8. Outcome Calculation ───────────────────────────────────────────────────

section('8. Crisis Outcome Calculation');
{
    const mockCrisis: CrisisEvent = {
        id: 'test-crisis-2',
        attackerEmpireId: 'faction-vektori',
        defenderEmpireId: 'faction-aurelian',
        targetId: 'system-2',
        targetType: 'system',
        crisisType: 'blockade',
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        severity: 'major',
        visibleToDefender: true,
        attackerPrediction: 'negotiate',
        defenderResponse: null,
        autoResolvePolicy: 'use_doctrine',
        resolutionStatus: 'pending',
        availableResponses: ['escalate', 'fortify', 'negotiate', 'sacrifice'],
    };

    // Test prediction match
    const matchOutcome = calculateCrisisOutcome(mockCrisis, 'negotiate');
    assert(matchOutcome.predictionMatched === true, 'Prediction match detected when guess is correct');
    assert(matchOutcome.attackerEffectMultiplier > 1.0, 'Attacker gets bonus on correct prediction');

    // Test prediction miss
    const missOutcome = calculateCrisisOutcome(mockCrisis, 'escalate');
    assert(missOutcome.predictionMatched === false, 'Prediction miss detected when guess is wrong');
    assert(missOutcome.attackerEffectMultiplier < 1.0, 'Attacker weakened on failed prediction');
}

// ─── 9. Crisis Create & Respond ──────────────────────────────────────────────

section('9. Crisis Create & Respond');
{
    const crisis = createCrisis({
        attackerEmpireId: 'faction-vektori',
        defenderEmpireId: 'faction-covenant',
        targetId: 'planet-covenant-prime',
        targetType: 'planet',
        crisisType: 'propaganda_strike',
        attackerPrediction: 'deceive',
        nowOverride: new Date('2025-01-01T10:00:00Z'),
    });

    assert(crisis.resolutionStatus === 'pending', 'Newly created crisis is pending');
    assert(crisis.defenderResponse === null, 'No response set initially');
    assert(getAllActiveCrises().some(c => c.id === crisis.id), 'Crisis appears in active list');

    const result = respondToCrisis(crisis.id, 'negotiate', 'faction-covenant');
    assert(result.success === true, 'Defender can respond to crisis');
    assert(result.crisis?.defenderResponse === 'negotiate', 'Response recorded on crisis');
}

// ─── 10. Duplicate Tick Prevention ───────────────────────────────────────────

section('10. Tick State Query');
{
    const state = getCurrentTickState();
    assert(typeof state.tickIndex === 'number', 'Tick index is a number');
    assert(typeof state.nextTickAt === 'string', 'nextTickAt is a string');
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n═══════════════════════════════════════════════`);
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log(`═══════════════════════════════════════════════`);
if (failed > 0) {
    process.exit(1);
}
