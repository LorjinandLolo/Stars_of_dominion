import React from 'react';
import { DefeatState } from '@/types/defeat';
import { Skull } from 'lucide-react';

interface DefeatModalProps {
    defeatState: DefeatState;
}

export const DefeatModal: React.FC<DefeatModalProps> = ({ defeatState }) => {
    if (defeatState.status !== 'ELIMINATED') return null;

    const terminalReason = defeatState.active_defeats.find(d => d.severity === 'TERMINAL') || defeatState.active_defeats[0];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-90 backdrop-blur-sm">
            <div className="max-w-xl w-full bg-slate-900 border-2 border-red-900 p-8 rounded-lg shadow-2xl text-center relative overflow-hidden">

                {/* Background Effect */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/20 via-transparent to-transparent opacity-50 pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center">
                    <Skull size={64} className="text-red-600 mb-6 animate-pulse" />

                    <h1 className="text-4xl font-black text-red-500 mb-2 tracking-widest uppercase">DEFEAT</h1>
                    <div className="w-32 h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent mb-6" />

                    <h2 className="text-xl text-slate-200 font-bold mb-4">
                        {terminalReason?.condition_id?.replace(/_/g, ' ') || 'Empire Collapsed'}
                    </h2>

                    <p className="text-slate-400 mb-8 max-w-md mx-auto">
                        {terminalReason?.message || "Your civilization has fallen into the dustbin of history."}
                    </p>

                    <div className="flex gap-4">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-600 transition-colors"
                        >
                            Return to Menu
                        </button>
                        <button
                            disabled
                            className="px-6 py-2 bg-red-900/50 text-red-400/50 rounded border border-red-900/50 cursor-not-allowed"
                        >
                            Spectate (Coming Soon)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
