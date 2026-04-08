"use client";

import React, { useState } from 'react';
import { getAvailableStrategies } from '@/lib/crisis-shared';
import { submitDefense } from '@/app/actions/combat';
import { buildResolutionSummary } from '@/lib/integration/resolution-summary';
import { getPredictionHints } from '@/lib/integration/doctrine-bias';
import ResolutionSummaryCard from '@/components/notifications/ResolutionSummaryCard';
import type { ResolutionSummary } from '@/lib/integration/types';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';

export default function CrisisDashboard({ crises, currentFactionId }: { crises: any[], currentFactionId: string }) {
    const router = useRouter();
    const [selectedCrisis, setSelectedCrisis]     = useState<any>(null);
    const [selectedStrategy, setSelectedStrategy] = useState<string>('');
    const [predictedStrategy, setPredictedStrategy] = useState<string>('');
    const [resolution, setResolution]             = useState<ResolutionSummary | null>(null);

    const myDefenses = crises.filter(c => c.defender_id === currentFactionId && c.status === 'active');
    const myAttacks  = crises.filter(c => c.attacker_id === currentFactionId && c.status === 'active');

    if (myDefenses.length === 0 && myAttacks.length === 0 && !resolution) return null;

    const defenseStrategies = getAvailableStrategies('defense');
    const attackStrategies  = getAvailableStrategies('attack');

    // Get prediction hints from opponent doctrine (if known — currently unknown, so no bias)
    const predictionHints = getPredictionHints(null, attackStrategies);

    const handleDefend = async () => {
        if (!selectedCrisis || !selectedStrategy) return;
        try {
            // Include prediction in the backend response
            const res: any = await submitDefense(selectedCrisis.$id, selectedStrategy, predictedStrategy || undefined);

            // Determine opponent's actual strategy from crisis document
            const opponentActionId = selectedCrisis.attacker_strategy ?? 'unknown';

            const { summary, predictionBonus } = buildResolutionSummary({
                crisisId:        selectedCrisis.$id,
                yourActionId:    selectedStrategy,
                opponentActionId,
                predictedActionId: predictedStrategy || undefined,
                winner:          res.winner ?? 'attacker',
                message:         res.message ?? 'Engagement resolved.',
                // TODO: pull active doctrine modifiers from empireIdentity.doctrines
                doctrineEffectsApplied: [],
                reputationSignals: opponentActionId !== 'unknown'
                    ? [`Enemy used ${opponentActionId.replace(/_/g, ' ')} — intel updated.`]
                    : [],
            });

            // TODO: Apply predictionBonus credits via economy service when available.
            // predictionBonus > 0 && awardCreditsAction(currentFactionId, predictionBonus);

            setResolution(summary);

        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleCloseResolution = () => {
        setResolution(null);
        setSelectedCrisis(null);
        setSelectedStrategy('');
        setPredictedStrategy('');
        router.refresh();
    };

    const HINT_COLORS = {
        likely:   'border-emerald-500/50 bg-emerald-500/5 text-emerald-300',
        possible: 'border-white/10 bg-white/5 text-slate-300',
        unlikely: 'border-white/5 bg-transparent text-slate-500',
    };

    return (
        <>
            {/* Notification Stack */}
            <div className="absolute top-24 right-4 z-40 flex flex-col gap-3 w-80 pointer-events-auto items-end">
                {myDefenses.map(c => (
                    <div key={c.$id} className="bg-black/80 backdrop-blur-md border border-red-500/50 p-4 rounded shadow-lg w-full animate-in slide-in-from-right duration-300">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-red-500 font-bold text-sm uppercase flex items-center gap-2">
                                <span className="animate-pulse">⚠️</span> Invasion Alert
                            </h3>
                            <button
                                onClick={() => setSelectedCrisis(c)}
                                className="text-xs bg-red-900/50 hover:bg-red-800 text-red-100 px-2 py-1 rounded border border-red-500 transition-colors"
                            >
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
                isOpen={!!selectedCrisis && !resolution}
                onClose={() => { setSelectedCrisis(null); setSelectedStrategy(''); setPredictedStrategy(''); }}
                title="Tactical Response Required"
            >
                <div className="space-y-8">

                    {/* Step 1: Choose defense */}
                    <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3 font-display">
                            Step 1 — Select Counter-Measure
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {defenseStrategies.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => setSelectedStrategy(s.id)}
                                    className={`p-4 rounded border text-left transition-all ${
                                        selectedStrategy === s.id
                                            ? 'bg-red-900/20 border-red-500 ring-1 ring-red-500'
                                            : 'bg-neutral-800/50 border-neutral-700 hover:border-neutral-500'
                                    }`}
                                >
                                    <div className="font-bold text-white mb-1 text-sm flex justify-between">
                                        {s.name}
                                        {selectedStrategy === s.id && <span className="text-red-400 text-[10px]">SELECTED</span>}
                                    </div>
                                    <div className="text-xs text-neutral-400">{s.description}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Step 2: Prediction (shown once defense is selected) */}
                    {selectedStrategy && (
                        <div className="border-t border-white/5 pt-6">
                            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-display">
                                Step 2 — Strategic Prediction <span className="text-slate-600 normal-case">(optional)</span>
                            </div>
                            <p className="text-[10px] text-slate-600 italic mb-4">
                                What attack strategy did they use? A correct prediction earns +100 credits.
                                {' '}Intel suggests patterns — not certainties.
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                                {predictionHints.map(hint => (
                                    <button
                                        key={hint.id}
                                        onClick={() => setPredictedStrategy(prev => prev === hint.id ? '' : hint.id)}
                                        className={`p-3 rounded border text-left transition-all ${
                                            predictedStrategy === hint.id
                                                ? 'bg-indigo-900/20 border-indigo-500 ring-1 ring-indigo-500/50'
                                                : HINT_COLORS[hint.weightHint]
                                        } border`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <span className="text-xs font-display font-bold uppercase tracking-wide">{hint.label}</span>
                                                <span className="text-[9px] text-slate-500 ml-3">{hint.description}</span>
                                            </div>
                                            <span className={`text-[8px] uppercase font-mono px-1.5 py-0.5 rounded ${
                                                hint.weightHint === 'likely' ? 'bg-emerald-500/20 text-emerald-400' :
                                                hint.weightHint === 'unlikely' ? 'bg-slate-800 text-slate-600' :
                                                'bg-slate-800 text-slate-500'
                                            }`}>
                                                {hint.weightHint}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                                <button
                                    onClick={() => setPredictedStrategy('')}
                                    className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors text-center py-1"
                                >
                                    Skip prediction
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2 border-t border-neutral-800">
                        <button
                            onClick={() => { setSelectedCrisis(null); setSelectedStrategy(''); setPredictedStrategy(''); }}
                            className="px-4 py-2 text-neutral-400 hover:text-white transition-colors text-sm"
                        >
                            Ignore (For Now)
                        </button>
                        <button
                            onClick={handleDefend}
                            disabled={!selectedStrategy}
                            className="px-6 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded shadow-[0_0_15px_rgba(220,38,38,0.5)] transition-all text-sm"
                        >
                            COMMIT DEFENSE
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Resolution Result */}
            {resolution && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] backdrop-blur-sm animate-in fade-in p-6">
                    <ResolutionSummaryCard summary={resolution} onClose={handleCloseResolution} />
                </div>
            )}
        </>
    );
}
