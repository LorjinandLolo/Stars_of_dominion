import React from 'react';
import { Flame, ShieldAlert, Globe, Crosshair } from 'lucide-react';

export default function ColdWarPanel() {
    // Mock Data for the UI demonstration
    const rivalries = [
        { id: '1', enemy: 'Aurelian Combine', score: 85, level: 6, levelName: 'Near-Hot War' },
        { id: '2', enemy: 'Technocratic Accord', score: 45, level: 2, levelName: 'Sanctions & Propaganda' }
    ];

    const blocs = [
        { name: 'Free Systems League', cohesion: 90, members: 4, doctrine: 'Anti-Authoritarian Liberation' },
        { name: 'Order Pact', cohesion: 65, members: 3, doctrine: 'Military Hegemony' }
    ];

    const proxies = [
        { target: 'Kharon-VII', sponsor: 'Aurelian Combine', strength: 75, risk: 40 }
    ];

    return (
        <div className="flex flex-col gap-6 p-4 max-h-[80vh] overflow-y-auto w-[800px] max-w-full">

            {/* Header section */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex flex-col items-center justify-center">
                    <Globe className="text-blue-500 mb-2" size={32} />
                    <div className="text-xl font-bold">Galactic Tension</div>
                    <div className="text-sm text-neutral-400">High Volatility Detected</div>
                </div>
                <div className="bg-neutral-900 border border-red-900/50 rounded-lg p-4 flex flex-col items-center justify-center">
                    <Flame className="text-red-500 mb-2" size={32} />
                    <div className="text-xl font-bold text-red-400">Escalation Level 6</div>
                    <div className="text-sm text-neutral-400">Near-Hot War</div>
                </div>
            </div>

            {/* Rivalries Ledger */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <ShieldAlert size={20} className="text-yellow-500" /> Active Rivalries
                </h3>
                <div className="flex flex-col gap-3">
                    {rivalries.map(r => (
                        <div key={r.id} className="bg-black border border-neutral-800 rounded p-3 flex justify-between items-center">
                            <div>
                                <div className="font-bold text-red-400">{r.enemy}</div>
                                <div className="text-xs text-neutral-500">Rivalry Score: {r.score}/100</div>
                            </div>
                            <div className="text-right">
                                <div className="font-mono font-bold text-yellow-500">Tier {r.level}</div>
                                <div className="text-xs text-neutral-400">{r.levelName}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Blocs Overview */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Globe size={20} className="text-blue-500" /> Galactic Blocs
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    {blocs.map((b, i) => (
                        <div key={i} className="bg-black border border-neutral-800 rounded p-3">
                            <div className="font-bold text-blue-400 mb-1">{b.name}</div>
                            <div className="text-xs text-neutral-300 mb-2">Doctrine: {b.doctrine}</div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-neutral-500">{b.members} Members</span>
                                <span className={b.cohesion > 70 ? 'text-green-500' : 'text-yellow-500'}>
                                    {b.cohesion}% Cohesion
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Proxy Wars */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Crosshair size={20} className="text-green-500" /> Sponsored Proxies
                </h3>
                <div className="flex flex-col gap-3">
                    {proxies.map((p, i) => (
                        <div key={i} className="bg-black border border-neutral-800 rounded p-3 flex justify-between items-center">
                            <div>
                                <div className="font-bold text-green-400">Target: {p.target}</div>
                                <div className="text-xs text-neutral-500">Sponsor: {p.sponsor}</div>
                            </div>
                            <div className="flex gap-4 text-sm text-right">
                                <div>
                                    <div className="text-neutral-400">Rebel Str</div>
                                    <div className="font-mono text-white">{p.strength}</div>
                                </div>
                                <div>
                                    <div className="text-neutral-400">Blowback Risk</div>
                                    <div className="font-mono text-red-400">{p.risk}%</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}
