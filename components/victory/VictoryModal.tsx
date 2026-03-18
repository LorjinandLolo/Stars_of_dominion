
import { VictoryState } from '@/types/victory';
import { Trophy, Crown, TrendingUp, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface VictoryModalProps {
    victoryState: VictoryState;
}

export function VictoryModal({ victoryState }: VictoryModalProps) {
    const [isOpen, setIsOpen] = useState(true);

    if (!victoryState || victoryState.status !== 'VICTORIOUS' || !isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-500">
            <div className="relative w-full max-w-2xl bg-slate-900 border-2 border-amber-500 shadow-[0_0_50px_rgba(245,158,11,0.5)] p-8 text-center rounded-lg">

                {/* Header */}
                <div className="flex justify-center mb-6">
                    <div className="relative">
                        <div className="absolute inset-0 bg-amber-500 blur-xl opacity-50 rounded-full animate-pulse"></div>
                        <Crown size={80} className="text-amber-400 relative z-10" strokeWidth={1} />
                    </div>
                </div>

                <h1 className="text-5xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-amber-600 mb-2 uppercase tracking-widest drop-shadow-lg">
                    Victory Achieved
                </h1>

                <h2 className="text-2xl font-bold text-amber-100 mb-8 tracking-wide">
                    {victoryState.type === 'CONQUEST' && 'GALACTIC CONQUEST'}
                    {victoryState.type === 'ECONOMIC_HEGEMONY' && 'ECONOMIC HEGEMONY'}
                    {victoryState.type === 'DIPLOMATIC_ANNEXATION' && 'DIPLOMATIC ANNEXATION'}
                </h2>

                <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-md mb-8">
                    <p className="text-lg text-slate-300 leading-relaxed italic">
                        "{victoryState.message}"
                    </p>
                </div>

                <div className="flex justify-center gap-4">
                    <button
                        onClick={() => window.location.reload()}
                        className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-slate-900 font-bold uppercase tracking-wider rounded transition-all shadow-lg hover:shadow-amber-500/25"
                    >
                        Play Again
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold uppercase tracking-wider rounded transition-all"
                    >
                        Continue Playing
                    </button>
                </div>
            </div>
        </div>
    );
}
