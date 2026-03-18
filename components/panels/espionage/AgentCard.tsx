'use client';

import React from 'react';
import { SpyAgent, AgentStatus } from '@/types/ui-state';
import { Shield, User, MapPin, Zap, AlertTriangle } from 'lucide-react';

interface AgentCardProps {
    agent: SpyAgent;
    onDeploy?: (agentId: string) => void;
    onRecall?: (agentId: string) => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent, onDeploy, onRecall }) => {
    const statusConfig: Record<AgentStatus, { label: string; color: string }> = {
        available: { label: 'AVAILABLE', color: '#10b981' },
        deployed: { label: 'DEPLOYED', color: '#3b82f6' },
        on_cooldown: { label: 'RESTING', color: '#f59e0b' },
        burned: { label: 'BURNED', color: '#ef4444' },
        captured: { label: 'CAPTURED', color: '#8b5cf6' },
        turned: { label: 'TRAITOR', color: '#dc2626' },
    };

    const sc = statusConfig[agent.status];

    return (
        <div className="bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-lg overflow-hidden hover:border-slate-700 transition-colors flex flex-col">
            <div className="p-4 pb-2 border-b border-slate-800/40">
                <div className="flex justify-between items-start mb-1">
                    <div>
                        <div className="text-lg font-mono tracking-wider text-slate-100 uppercase leading-none">
                            {agent.codename}
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-tighter">{agent.name}</p>
                    </div>
                    <span 
                        className="text-[9px] font-display px-1.5 py-0.5 rounded leading-none border"
                        style={{ color: sc.color, backgroundColor: `${sc.color}11`, borderColor: `${sc.color}33` }}
                    >
                        {sc.label}
                    </span>
                </div>
            </div>
            
            <div className="p-4 pt-3 flex-1 space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="flex items-center gap-1.5 text-slate-300 bg-slate-800/30 p-1.5 rounded border border-slate-700/20">
                        <Zap size={11} className="text-blue-400" />
                        <span className="font-mono">LVL {Math.floor(agent.experienceLevel / 10)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-300 bg-slate-800/30 p-1.5 rounded border border-slate-700/20">
                        <MapPin size={11} className="text-orange-400" />
                        <span className="truncate font-mono">
                            {agent.deployedToSystemId ? agent.deployedToSystemId.slice(0, 8) : 'ORBIT'}
                        </span>
                    </div>
                </div>

                {/* Cover Strength */}
                <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] uppercase font-bold tracking-tight text-slate-500">
                        <span>Cover Status</span>
                        <span className={agent.coverStrength < 0.3 ? 'text-red-400' : 'text-slate-300'}>
                            {Math.round(agent.coverStrength * 100)}%
                        </span>
                    </div>
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full transition-all duration-500" 
                            style={{ 
                                width: `${agent.coverStrength * 100}%`, 
                                backgroundColor: agent.coverStrength < 0.3 ? '#ef4444' : agent.coverStrength < 0.6 ? '#f59e0b' : '#3b82f6' 
                            }} 
                        />
                    </div>
                </div>

                {/* Traits */}
                <div className="flex flex-wrap gap-1">
                    {agent.traitIds.map((trait) => (
                        <span key={trait} className="text-[9px] bg-slate-800 text-slate-400 border border-slate-700/30 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                            {trait}
                        </span>
                    ))}
                </div>

                {/* Actions */}
                <div className="pt-2">
                    {agent.status === 'available' ? (
                        <button
                            className="w-full bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 py-1.5 rounded text-[10px] font-display tracking-widest transition-colors uppercase"
                            onClick={() => onDeploy?.(agent.id)}
                        >
                            Assign to Sector
                        </button>
                    ) : agent.status === 'deployed' ? (
                        <button
                            className="w-full bg-slate-800/40 hover:bg-slate-700/60 text-slate-300 border border-slate-600/30 py-1.5 rounded text-[10px] font-display tracking-widest transition-colors uppercase"
                            onClick={() => onRecall?.(agent.id)}
                        >
                            Exfiltrate
                        </button>
                    ) : (
                        <button disabled className="w-full bg-slate-900 text-slate-600 border border-slate-800 py-1.5 rounded text-[10px] font-display tracking-widest uppercase cursor-not-allowed">
                            Busy
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
