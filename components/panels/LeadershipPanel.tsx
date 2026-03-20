"use client";

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { 
    Users, 
    Ship, 
    Shield, 
    Globe, 
    Target, 
    Send, 
    TrendingUp, 
    Briefcase, 
    UserPlus, 
    Star, 
    Activity, 
    History,
    ChevronRight,
    Search,
    Sword
} from 'lucide-react';
import { recruitLeaderAction, assignLeaderAction } from '@/app/actions/leadership';

const ROLE_ICONS: Record<string, React.ReactNode> = {
    'Admiral': <Ship size={16} />,
    'General': <Sword size={16} />,
    'Governor': <Globe size={16} />,
    'IntelligenceDirector': <Target size={16} />,
    'DiplomaticEnvoy': <Send size={16} />,
    'EconomicMinister': <TrendingUp size={16} />,
    'CharterCompanyExecutive': <Briefcase size={16} />,
};

const ROLE_COLORS: Record<string, string> = {
    'Admiral': 'text-blue-400 border-blue-500/30 bg-blue-500/5',
    'General': 'text-red-400 border-red-500/30 bg-red-500/5',
    'Governor': 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
    'IntelligenceDirector': 'text-purple-400 border-purple-500/30 bg-purple-500/5',
    'DiplomaticEnvoy': 'text-cyan-400 border-cyan-500/30 bg-cyan-500/5',
    'EconomicMinister': 'text-amber-400 border-amber-500/30 bg-amber-500/5',
    'CharterCompanyExecutive': 'text-slate-400 border-slate-500/30 bg-slate-500/5',
};

export default function LeadershipPanel() {
    const { playerFactionId, empireIdentity } = useUIStore();
    const { leadership } = empireIdentity;
    const [activeSection, setActiveSection] = React.useState<'roster' | 'recruitment'>('roster');
    const [isProcessing, setIsProcessing] = React.useState<string | null>(null);

    const activeLeaders = Array.from(leadership.leaders.values()).filter(l => l.factionId === playerFactionId && l.status === 'active');
    const pool = leadership.recruitmentPool;

    const handleRecruit = async (leaderId: string) => {
        if (!playerFactionId) return;
        setIsProcessing(leaderId);
        const res = await recruitLeaderAction(playerFactionId, leaderId);
        if (!res.success) alert(res.error);
        setIsProcessing(null);
    };

    const handleAssign = async (leaderId: string, assignmentId: string) => {
        if (!playerFactionId) return;
        setIsProcessing(leaderId);
        const res = await assignLeaderAction(playerFactionId, leaderId, assignmentId);
        if (!res.success) alert(res.error);
        setIsProcessing(null);
    };

    return (
        <div className="flex flex-col h-full bg-slate-900/40 backdrop-blur-md border-l border-slate-700/50 text-slate-200">
            {/* Header */}
            <div className="p-6 border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent flex justify-between items-end">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Users className="w-5 h-5 text-indigo-500" />
                        <h1 className="text-xl font-display tracking-widest uppercase">Personnel & Leadership</h1>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">Strategic Command & Executive Assignments</p>
                </div>
                <div className="flex bg-slate-900/80 p-0.5 rounded-lg border border-slate-700/50">
                    <button 
                        onClick={() => setActiveSection('roster')}
                        className={`px-4 py-1.5 rounded-md text-[10px] font-display uppercase tracking-widest transition-all ${activeSection === 'roster' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-[0_0_10px_rgba(79,70,229,0.2)]' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Active Roster ({activeLeaders.length})
                    </button>
                    <button 
                        onClick={() => setActiveSection('recruitment')}
                        className={`px-4 py-1.5 rounded-md text-[10px] font-display uppercase tracking-widest transition-all ${activeSection === 'recruitment' ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Recruitment Pool ({pool.length})
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {activeSection === 'roster' ? (
                    <div className="grid grid-cols-1 gap-4">
                        {activeLeaders.length === 0 ? (
                            <div className="h-48 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/20">
                                <Users className="w-8 h-8 text-slate-700 mb-2" />
                                <span className="text-xs text-slate-500 font-display uppercase tracking-widest">No active leaders deployed</span>
                                <button 
                                    onClick={() => setActiveSection('recruitment')}
                                    className="mt-4 text-[10px] text-amber-500 hover:text-amber-400 underline decoration-amber-500/30 underline-offset-4 uppercase tracking-widest"
                                >
                                    Open Recruitment Pool
                                </button>
                            </div>
                        ) : (
                            activeLeaders.map(leader => (
                                <LeaderCard 
                                    key={leader.id} 
                                    leader={leader} 
                                    isProcessing={isProcessing === leader.id}
                                    onAssign={handleAssign}
                                />
                            ))
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {pool.map(leader => (
                            <RecruitmentCard 
                                key={leader.id} 
                                leader={leader} 
                                isProcessing={isProcessing === leader.id}
                                onRecruit={handleRecruit}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function LeaderCard({ leader, isProcessing, onAssign }: { leader: any, isProcessing: boolean, onAssign: (lid: string, tid: string) => void }) {
    const colorClass = ROLE_COLORS[leader.role] || 'text-slate-400 border-slate-700 bg-slate-800/20';

    return (
        <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl overflow-hidden shadow-xl hover:border-slate-500/40 transition-all group">
            <div className={`px-4 py-2 border-b border-slate-700/30 flex items-center justify-between ${colorClass.replace('border-', 'border-b-')}`}>
                <div className="flex items-center gap-2">
                    {ROLE_ICONS[leader.role]}
                    <span className="text-[10px] font-display uppercase tracking-widest">{leader.role}</span>
                </div>
                <div className="flex items-center gap-1">
                    <Star className="text-amber-400" size={12} />
                    <span className="text-[10px] font-mono text-white">LVL {leader.level}</span>
                </div>
            </div>

            <div className="p-4 space-y-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-sm font-display text-white group-hover:text-blue-400 transition-colors uppercase tracking-wider">{leader.name}</h3>
                        <p className="text-[10px] text-slate-500 mt-1 uppercase font-mono">ID: {leader.id.toUpperCase()}</p>
                    </div>
                    <div className="text-right">
                        <span className="block text-[9px] text-slate-500 uppercase tracking-tighter">Loyalty</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <Heart size={10} className={leader.loyalty > 70 ? 'text-rose-500' : 'text-rose-900'} />
                            <span className="text-xs font-mono font-bold">{leader.loyalty}%</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-[9px] uppercase tracking-tighter text-slate-500">
                        <span>XP Progress</span>
                        <span>{leader.xp} / {leader.level * 1000}</span>
                    </div>
                    <div className="h-1 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-blue-500/80 shadow-[0_0_5px_rgba(59,130,246,0.3)]"
                            style={{ width: `${(leader.xp / (leader.level * 1000)) * 100}%` }}
                        />
                    </div>
                </div>

                {leader.traits.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {leader.traits.map((t: string) => (
                            <span key={t} className="px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded text-[9px] uppercase tracking-wide">
                                {t.replace(/_/g, ' ')}
                            </span>
                        ))}
                    </div>
                )}

                <div className="pt-2 border-t border-slate-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_4px_rgba(96,165,250,0.5)]" />
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest truncate max-w-[120px]">
                            {leader.assignmentId ? `Assigned: ${leader.assignmentId}` : 'Unassigned'}
                        </span>
                    </div>
                    
                    <button 
                        onClick={() => onAssign(leader.id, 'EMPIRE_WIDE')}
                        disabled={isProcessing}
                        className="px-4 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded text-[9px] font-display uppercase tracking-widest transition-all disabled:opacity-50"
                    >
                        {isProcessing ? 'Updating...' : 'Reassign'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function RecruitmentCard({ leader, isProcessing, onRecruit }: { leader: any, isProcessing: boolean, onRecruit: (lid: string) => void }) {
    const colorClass = ROLE_COLORS[leader.role] || 'text-slate-400 border-slate-700 bg-slate-800/20';

    return (
        <div className="bg-slate-900/40 border border-slate-800 hover:border-amber-500/50 rounded-xl p-4 transition-all group flex items-center gap-4">
            <div className={`w-12 h-12 rounded-lg border flex items-center justify-center shrink-0 ${colorClass}`}>
                {ROLE_ICONS[leader.role]}
            </div>
            
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xs font-display text-slate-200 uppercase tracking-widest">{leader.name}</h3>
                    <span className="text-[9px] px-1.5 py-0.5 bg-slate-800 text-slate-500 border border-slate-700 rounded uppercase">{leader.role}</span>
                </div>
                <div className="flex gap-2 text-[9px] uppercase text-slate-500 tracking-tighter">
                    <span>Loyalty: {leader.loyalty}%</span>
                    <span>•</span>
                    <span>Trainee</span>
                </div>
                {leader.traits.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {leader.traits.map((t: string) => (
                            <span key={t} className="text-[8px] text-amber-500/70 uppercase font-mono">+{t.replace(/_/g, ' ')}</span>
                        ))}
                    </div>
                )}
            </div>

            <div className="text-right space-y-2">
                <div className="text-[9px] text-slate-500 uppercase tracking-widest">Hiring Fee</div>
                <div className="flex items-center gap-1 justify-end">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-xs font-mono font-bold text-amber-500">500</span>
                </div>
                <button 
                    onClick={() => onRecruit(leader.id)}
                    disabled={isProcessing}
                    className="w-full py-1.5 bg-amber-600/10 hover:bg-amber-600/20 border border-amber-500/30 text-amber-400 rounded text-[9px] font-display uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                    {isProcessing ? 'Hiring...' : <><UserPlus size={10} /> Contract</>}
                </button>
            </div>
        </div>
    );
}

function Heart({ size, className }: { size: number, className: string }) {
    return (
        <svg 
            width={size} 
            height={size} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={className}
        >
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
    );
}
