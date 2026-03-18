import React, { useState } from 'react';
import { getAvailableStrategies } from '@/lib/crisis-shared';
import { submitDefense } from '@/app/actions/combat';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';

export default function CrisisDashboard({ crises, currentFactionId }: { crises: any[], currentFactionId: string }) {
    const router = useRouter();
    const [selectedCrisis, setSelectedCrisis] = useState<any>(null);
    const [selectedStrategy, setSelectedStrategy] = useState<string>('');
    const [result, setResult] = useState<any>(null);

    // Filter for active crises where I am the defender
    const myDefenses = crises.filter(c => c.defender_id === currentFactionId && c.status === 'active');

    // Filter for active crises where I am the attacker (status check)
    const myAttacks = crises.filter(c => c.attacker_id === currentFactionId && c.status === 'active');

    if (myDefenses.length === 0 && myAttacks.length === 0 && !result) return null;

    const strategies = getAvailableStrategies('defense');

    const handleDefend = async () => {
        if (!selectedCrisis || !selectedStrategy) return;
        try {
            const res = await submitDefense(selectedCrisis.$id, selectedStrategy);
            setResult(res);
            // Wait then refresh
            setTimeout(() => {
                setResult(null);
                setSelectedCrisis(null);
                router.refresh(); // Refresh to update map/army status
            }, 3000);
        } catch (e: any) {
            alert(e.message);
        }
    };

    // ... imports

    // ... imports

    return (
        <>
            {/* Notification Stack (Right Side) */}
            <div className="absolute top-24 right-4 z-40 flex flex-col gap-3 w-80 pointer-events-auto items-end">
                {myDefenses.map(c => (
                    <div key={c.$id} className="bg-black/80 backdrop-blur-md border border-red-500/50 p-4 rounded shadow-lg w-full animate-in slide-in-from-right duration-300">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-red-500 font-bold text-sm uppercase flex items-center gap-2">
                                <span className="animate-pulse">⚠️</span> Invasion Alert
                            </h3>
                            <button onClick={() => setSelectedCrisis(c)} className="text-xs bg-red-900/50 hover:bg-red-800 text-red-100 px-2 py-1 rounded border border-red-500 transition-colors">
                                Respond
                            </button>
                        </div>
                        <p className="text-neutral-400 text-xs mb-2 leading-relaxed">
                            Hostile fleet detected in Sector {c.target_id}. Command awaits your orders.
                        </p>
                    </div>
                ))}

                {myAttacks.map(c => (
                    <div key={c.$id} className="bg-black/80 backdrop-blur-md border border-blue-500/50 p-4 rounded shadow-lg w-full">
                        <div className="flex justify-between items-center text-blue-400">
                            <h3 className="font-bold text-sm uppercase">Assault in Progress</h3>
                            <div className="text-xs animate-pulse">Engaging...</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tactical Response Modal */}
            <Modal
                isOpen={!!selectedCrisis && !result}
                onClose={() => setSelectedCrisis(null)}
                title="Tactical Response Required"
            >
                <div>
                    <p className="text-neutral-400 mb-6">Select a counter-measure to deploy against the incoming fleet.</p>

                    <div className="grid grid-cols-1 gap-3 mb-6">
                        {strategies.map(s => (
                            <button
                                key={s.id}
                                onClick={() => setSelectedStrategy(s.id)}
                                className={`p-4 rounded border text-left transition-all ${selectedStrategy === s.id
                                    ? 'bg-red-900/20 border-red-500 ring-1 ring-red-500'
                                    : 'bg-neutral-800/50 border-neutral-700 hover:bg-neutral-800 hover:border-neutral-500'
                                    }`}
                            >
                                <div className="font-bold text-white mb-1 flex justify-between">
                                    {s.name}
                                    {selectedStrategy === s.id && <span className="text-red-500">SELECTED</span>}
                                </div>
                                <div className="text-xs text-neutral-400">{s.description}</div>
                            </button>
                        ))}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                        <button
                            onClick={() => setSelectedCrisis(null)}
                            className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
                        >
                            Ignore (For Now)
                        </button>
                        <button
                            onClick={handleDefend}
                            disabled={!selectedStrategy}
                            className="px-6 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded shadow-[0_0_15px_rgba(220,38,38,0.5)] transition-all"
                        >
                            COMMIT DEFENSE
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Result Modal (Reuse generic modal or keep custom for impact?) -> Custom is fine for result impact */}
            {result && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] backdrop-blur-sm animate-in fade-in">
                    <div className="bg-zinc-900 border border-zinc-700 p-8 rounded-lg max-w-md text-center shadow-2xl">
                        <h2 className={`text-3xl font-bold mb-4 ${result.winner === 'defender' ? 'text-green-500' : 'text-red-500'}`}>
                            {result.winner === 'defender' ? 'DEFENSE SUCCESSFUL' : 'SECTOR LOST'}
                        </h2>
                        <p className="text-lg text-white mb-6">{result.message}</p>
                        <button onClick={() => {
                            setResult(null);
                            setSelectedCrisis(null);
                            router.refresh();
                        }} className="bg-neutral-800 hover:bg-neutral-700 text-white px-6 py-2 rounded">
                            Close Report
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
