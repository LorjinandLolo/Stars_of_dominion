import React from 'react';
import { DefeatState } from '@/types/defeat';
import { AlertTriangle, Skull, ShieldAlert } from 'lucide-react';

interface DoomTrackerProps {
    defeatState: DefeatState | null;
}

export const DoomTracker: React.FC<DoomTrackerProps> = ({ defeatState }) => {
    if (!defeatState) return null;

    const { doom_score, active_defeats, status } = defeatState;

    // Determine color based on doom score
    let color = 'text-green-500';
    let barColor = 'bg-green-500';

    if (doom_score > 30) { color = 'text-yellow-500'; barColor = 'bg-yellow-500'; }
    if (doom_score > 60) { color = 'text-orange-500'; barColor = 'bg-orange-500'; }
    if (doom_score > 80) { color = 'text-red-500'; barColor = 'bg-red-500'; }

    return (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl w-64 backdrop-blur-md bg-opacity-90">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stability</span>
                <span className={`text-sm font-bold ${color}`}>{100 - doom_score}%</span>
            </div>

            {/* Doom Bar */}
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-3">
                <div
                    className={`h-full ${barColor} transition-all duration-500`}
                    style={{ width: `${100 - doom_score}%` }}
                />
            </div>

            {/* Active Warnings */}
            {active_defeats.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                    {active_defeats.map((defect) => (
                        <div key={defect.condition_id} className="flex items-start gap-2 text-xs bg-slate-800 p-2 rounded border border-slate-600">
                            {defect.severity === 'CRITICAL' ? <Skull size={14} className="text-red-500 min-w-[14px] mt-0.5" /> : <AlertTriangle size={14} className="text-yellow-500 min-w-[14px] mt-0.5" />}
                            <div>
                                <div className="font-bold text-slate-200">{defect.condition_id.replace(/_/g, ' ')}</div>
                                <div className="text-slate-400">{defect.message}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {status === 'DYING' && (
                <div className="mt-2 text-center animate-pulse">
                    <span className="text-red-500 font-bold uppercase text-xs">Collapse Imminent</span>
                </div>
            )}
        </div>
    );
};
