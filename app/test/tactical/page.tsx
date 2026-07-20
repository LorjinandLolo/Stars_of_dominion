"use client";

// app/test/tactical/page.tsx
// Dev harness for the tactical battle view: mock strategic fleets in, JSON
// result out. Not linked from the game UI — visit /test/tactical directly.

import React from 'react';
import TacticalBattleView from '@/components/tactical/TacticalBattleView';
import type { BattleResult } from '@/lib/tactical/types';
import type { StrategicFleetLike } from '@/lib/tactical/fleet-adapter';

const PLAYER_FLEETS: StrategicFleetLike[] = [
    {
        id: 'fleet-test-player',
        factionId: 'PLAYER_FACTION',
        name: 'First Strike Group',
        composition: { interceptor: 4, destroyer: 2, cruiser: 1 },
        strength: 1,
    },
];

const ENEMY_FLEETS: StrategicFleetLike[] = [
    {
        id: 'fleet-test-raiders',
        factionId: 'CRIMSON_RAIDERS',
        name: 'Crimson Raider Vanguard',
        composition: { interceptor: 6, destroyer: 4, cruiser: 2 },
        strength: 1,
    },
];

type Done =
    | { kind: 'finished'; result: BattleResult }
    | { kind: 'aborted' };

export default function TacticalTestPage() {
    const [done, setDone] = React.useState<Done | null>(null);
    const [runId, setRunId] = React.useState(0);

    if (done) {
        return (
            <main className="min-h-screen bg-slate-950 text-slate-200 p-8">
                <h1 className="text-sm font-display font-bold tracking-widest text-indigo-300 uppercase">
                    Tactical Sim Test — {done.kind === 'aborted' ? 'Aborted' : 'Battle Result'}
                </h1>
                <pre className="mt-4 max-w-3xl overflow-x-auto rounded border border-indigo-700/30 bg-slate-900/60 p-4 text-[11px] font-mono text-slate-300">
                    {JSON.stringify(done.kind === 'finished' ? done.result : { aborted: true }, null, 2)}
                </pre>
                <button
                    onClick={() => {
                        setDone(null);
                        setRunId(r => r + 1);
                    }}
                    className="mt-4 px-4 py-2 rounded bg-indigo-600/40 hover:bg-indigo-500/50 border border-indigo-400/50 text-indigo-100 text-[11px] font-bold tracking-widest uppercase transition-colors"
                >
                    Run Again
                </button>
            </main>
        );
    }

    return (
        <TacticalBattleView
            key={runId}
            title="TACTICAL SIM TEST"
            playerFleets={PLAYER_FLEETS}
            enemyFleets={ENEMY_FLEETS}
            enemyName="Crimson Raider Vanguard"
            onFinish={result => setDone({ kind: 'finished', result })}
            onAbort={() => setDone({ kind: 'aborted' })}
        />
    );
}
