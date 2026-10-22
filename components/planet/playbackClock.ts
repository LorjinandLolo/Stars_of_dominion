// components/planet/playbackClock.ts
// One shared clock for replaying a cycle's battle: the board effects
// (BattlePlayback) and the ticker (GroundCommandPanel) read the same one, so
// the explosion and the line that explains it land together. A new report
// starts playback by itself; the replay button restarts it.

import React from 'react';
import type { CycleReport, BattleBeat } from '@/lib/combat/siege/battle-beats';
import type { ChaosEvent } from '@/lib/combat/siege/chaos';

/** How long a cycle's fighting takes to replay. */
export const PLAYBACK_MS = 20_000;

/** Where each friction event falls in the replay: mishaps before the fighting, aftermath after. */
const EVENT_T: Record<string, number> = {
    decision: 0.01, comms_jammed: 0.02, lost_unit: 0.03, bogged_down: 0.04,
    officer_killed: 0.82, rally: 0.84, friendly_fire: 0.6, supply_dump: 0.88, partisans: 0.92, deserters: 0.95,
};

export interface TimedLine {
    t: number;
    text: string;
    side: 'attacker' | 'defender';
    sector?: number;
    kind: string;
    killed?: number;
}

/** Every beat and event of a report on one timeline. */
export function reportTimeline(report: CycleReport | undefined): TimedLine[] {
    if (!report) return [];
    const beats: TimedLine[] = report.districts.flatMap(d => d.beats.map((b: BattleBeat) => ({
        // Districts fight at once, but a little stagger reads better than a wall.
        t: Math.min(0.97, b.t + (d.sector % 5) * 0.012),
        text: b.text, side: b.side, sector: b.sector, kind: b.kind, killed: b.killed,
    })));
    const events: TimedLine[] = (report.events ?? []).map((e: ChaosEvent) => ({
        t: EVENT_T[e.kind] ?? 0.5, text: e.text, side: e.side, sector: e.sector, kind: e.kind, killed: e.men,
    }));
    return [...beats, ...events].sort((a, b) => a.t - b.t);
}

let started = { key: '', at: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/** Identifies one cycle of one war: the world time it resolved, and its number. */
export const reportKey = (report: CycleReport | undefined): string | null =>
    report ? `${report.at}:${report.cycle}` : null;

/** Starts (or restarts) the replay of the report identified by `key`. */
export function startPlayback(key: string) {
    started = { key, at: performance.now() };
    emit();
}

/**
 * Progress 0..1 of the replay for `key` (null when it is not playing),
 * re-rendering ~15 times a second while it runs. A report seen for the first
 * time starts itself.
 */
export function usePlayback(key: string | null): number | null {
    const [, force] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => {
        listeners.add(force);
        return () => { listeners.delete(force); };
    }, []);
    React.useEffect(() => {
        if (key && started.key !== key) startPlayback(key);
    }, [key]);
    const playing = !!key && started.key === key && performance.now() - started.at < PLAYBACK_MS;
    React.useEffect(() => {
        if (!playing) return;
        const id = window.setInterval(force, 66);
        return () => window.clearInterval(id);
    }, [playing]);
    if (!playing) return null;
    return Math.min(1, (performance.now() - started.at) / PLAYBACK_MS);
}
