"use client";

// app/test/tactical/page.tsx
// Dev harness for the tactical battle view: mock strategic fleets in, JSON
// result out. Not linked from the game UI — visit /test/tactical directly.

import React from 'react';
import TacticalBattleView from '@/components/tactical/TacticalBattleView';
import type { BattleResult, BattleStationConfig, Hazard } from '@/lib/tactical/types';
import type { StrategicFleetLike } from '@/lib/tactical/fleet-adapter';

const PLAYER_FLEETS: StrategicFleetLike[] = [
    {
        id: 'fleet-test-player',
        factionId: 'faction-aurelian',
        name: 'First Strike Group',
        composition: { interceptor: 3, destroyer: 2, cruiser: 1, carrier: 1 },
        strength: 1,
    },
];

const ENEMY_FLEETS: StrategicFleetLike[] = [
    {
        id: 'fleet-test-raiders',
        factionId: 'faction-pirates',
        name: 'Crimson Raider Vanguard',
        composition: { interceptor: 6, destroyer: 4, cruiser: 2, carrier: 1 },
        strength: 1,
    },
];

/**
 * `/test/tactical?roster=new`: every newer hull class on the field, to check
 * models dropped into public/models/ships/ (docs/art/model-specs-new-classes.md).
 */
const NEW_PLAYER_FLEETS: StrategicFleetLike[] = [
    { id: 'fleet-new-a', factionId: 'faction-aurelian', name: 'Light Line', composition: { patrol: 1, scout: 1, torpedo_boat: 1, frigate: 1, minelayer: 1, raider: 1, commando: 1, ewar: 1, assault: 1, tender: 1, supply_ship: 1 }, strength: 1 },
    { id: 'fleet-new-b', factionId: 'faction-aurelian', name: 'Heavy Line', composition: { interdictor: 1, heavy_cruiser: 1, troop_transport: 1, command_ship: 1, siege_ship: 1, mobile_yard: 1, dreadnought: 1 }, strength: 1 },
];
const NEW_ENEMY_FLEETS: StrategicFleetLike[] = [
    { id: 'fleet-new-e', factionId: 'faction-pirates', name: 'Mirror Line', composition: { heavy_cruiser: 2, frigate: 3, torpedo_boat: 3, patrol: 4 }, strength: 1 },
];

const HAZARDS: Hazard[] = [
    { kind: 'asteroid', x: 800, y: 380, r: 110 },
    { kind: 'asteroid', x: 620, y: 700, r: 90 },
    { kind: 'nebula', x: 1050, y: 560, r: 150 },
];

/** The raiders' yard, behind their line on the right, so the station model can be checked here. */
const STATION: BattleStationConfig = { kind: 'shipyard', side: 'enemy' };

type Done =
    | { kind: 'finished'; result: BattleResult }
    | { kind: 'aborted' };

export default function TacticalTestPage() {
    const [done, setDone] = React.useState<Done | null>(null);
    const [runId, setRunId] = React.useState(0);
    // Read after mount (the page also renders on the server); the key below remounts the battle.
    const [roster, setRoster] = React.useState<'default' | 'new'>('default');
    React.useEffect(() => {
        if (new URLSearchParams(window.location.search).get('roster') === 'new') setRoster('new');
    }, []);

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
            key={`${roster}-${runId}`}
            title="TACTICAL SIM TEST"
            playerFleets={roster === 'new' ? NEW_PLAYER_FLEETS : PLAYER_FLEETS}
            enemyFleets={roster === 'new' ? NEW_ENEMY_FLEETS : ENEMY_FLEETS}
            enemyName="Crimson Raider Vanguard"
            hazards={HAZARDS}
            station={STATION}
            playerHasAdmiral
            onFinish={result => setDone({ kind: 'finished', result })}
            onAbort={() => setDone({ kind: 'aborted' })}
        />
    );
}
