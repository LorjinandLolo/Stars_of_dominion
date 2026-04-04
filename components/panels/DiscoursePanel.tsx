"use client";

import * as React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { 
    MessageSquare, 
    Send, 
    User, 
    ChevronRight, 
    Info, 
    TrendingDown, 
    TrendingUp, 
    AlertCircle,
    UserCircle2,
    Loader2
} from 'lucide-react';
import { FACTION_SPEAKERS } from '@/lib/ai/faction-personalities';

export default function DiscoursePanel() {
    const { discourseState, politicsState, updateDiscourse, addDiscourseMessage } = useUIStore();
    const [inputValue, setInputValue] = React.useState('');
    const [summary, setSummary] = React.useState<any>(null);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    const activeFactionId = discourseState.activeFactionId || 'military';
    const activeMessages = discourseState.messages[activeFactionId] || [];
    const activeSpeaker = FACTION_SPEAKERS[activeFactionId] || FACTION_SPEAKERS['senate'];

    // Auto-scroll to bottom of chat
    React.useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [activeMessages]);

    // Fetch faction summary when active faction changes
    React.useEffect(() => {
        const fetchSummary = async () => {
            try {
                const res = await fetch(`/api/discourse?factionId=${encodeURIComponent(activeFactionId)}`);
                if (res.ok) {
                    const data = await res.json();
                    setSummary(data);
                }
            } catch (e) {
                console.error('[DiscoursePanel] Failed to fetch faction summary:', e);
            }
        };
        fetchSummary();
    }, [activeFactionId]);

    const handleSendMessage = async () => {
        if (!inputValue.trim() || discourseState.isGenerating) return;

        const messageText = inputValue.trim();
        setInputValue('');
        updateDiscourse({ isGenerating: true });

        // Add player message optimistically
        const playerMsg = {
            id: `p-${Date.now()}`,
            speaker: 'player' as const,
            content: messageText,
            timestamp: Date.now()
        };
        addDiscourseMessage(activeFactionId, playerMsg);

        try {
            const res = await fetch('/api/discourse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    factionId: activeFactionId,
                    playerMessage: messageText,
                }),
            });

            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error ?? `Server error ${res.status}`);
            }

            const result = await res.json();

            // Add faction response
            addDiscourseMessage(activeFactionId, {
                id: result.factionMessage.id,
                speaker: 'faction',
                content: result.factionMessage.content,
                timestamp: result.factionMessage.timestamp,
            });
        } catch (error) {
            console.error("Discourse connection failed:", error);
            addDiscourseMessage(activeFactionId, {
                id: `err-${Date.now()}`,
                speaker: 'faction',
                content: "[COMMUNICATION INTERFERENCE DETECTED] Failed to relay message to the representative. Please verify regional stability.",
                timestamp: Date.now()
            });
        } finally {
            updateDiscourse({ isGenerating: false });
        }
    };

    return (
        <div className="h-full flex bg-slate-950 overflow-hidden font-sans">
            {/* Faction Sidebar */}
            <div className="w-64 border-r border-slate-800/40 bg-slate-900/20 flex flex-col">
                <div className="p-4 border-b border-slate-800/60 flex items-center gap-2">
                    <MessageSquare size={14} className="text-indigo-400" />
                    <span className="text-[10px] font-display uppercase tracking-widest text-slate-400">Political Blocs</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {politicsState.blocs.map(bloc => {
                        const isActive = activeFactionId === bloc.id;
                        return (
                            <button
                                key={bloc.id}
                                onClick={() => updateDiscourse({ activeFactionId: bloc.id })}
                                className={`
                                    w-full p-4 flex flex-col gap-1 border-b border-slate-800/30 transition-all text-left
                                    ${isActive ? 'bg-indigo-500/10 border-r-2 border-r-indigo-500' : 'hover:bg-slate-800/30'}
                                `}
                            >
                                <div className="flex justify-between items-center">
                                    <span className={`text-[11px] font-display uppercase tracking-wider ${isActive ? 'text-indigo-300' : 'text-slate-400'}`}>
                                        {bloc.name}
                                    </span>
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: bloc.satisfaction > 60 ? '#22c55e' : bloc.satisfaction > 30 ? '#eab308' : '#ef4444' }} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-0.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-slate-500" style={{ width: `${bloc.satisfaction}%` }} />
                                    </div>
                                    <span className="text-[8px] font-mono text-slate-600 uppercase">SAT: {bloc.satisfaction}%</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-slate-950 relative">
                {/* Chat Header */}
                <div className="p-4 border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-md flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg">
                            <UserCircle2 size={20} className="text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-xs font-display tracking-widest text-slate-200 uppercase">{activeSpeaker.name}</h2>
                            <p className="text-[9px] text-slate-500 uppercase tracking-tighter">{activeSpeaker.title}</p>
                        </div>
                    </div>
                    {summary && (
                        <div className="flex items-center gap-4 text-[9px] uppercase tracking-tighter text-slate-500">
                           <div className="flex items-center gap-1.5">
                               <span>Influence</span>
                               <span className="text-slate-300 font-mono">{summary.faction.influence}%</span>
                           </div>
                        </div>
                    )}
                </div>

                {/* Messages List */}
                <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
                >
                    {activeMessages.map((msg, idx) => (
                        <div 
                            key={msg.id} 
                            className={`flex flex-col ${msg.speaker === 'player' ? 'items-end' : 'items-start'}`}
                        >
                            <div className={`
                                max-w-[85%] p-4 rounded-xl border relative
                                ${msg.speaker === 'player' 
                                    ? 'bg-slate-900/60 border-indigo-500/30 text-slate-200 rounded-tr-none' 
                                    : 'bg-indigo-950/20 border-slate-800/60 text-indigo-100 rounded-tl-none'}
                            `}>
                                <p className="text-xs leading-relaxed font-light">{msg.content}</p>
                                <span className="absolute -bottom-4 text-[8px] text-slate-600 font-mono uppercase tracking-tighter">
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ))}
                    {discourseState.isGenerating && (
                        <div className="flex flex-col items-start italic opacity-50">
                            <div className="flex items-center gap-2 p-3 bg-indigo-950/10 rounded-xl rounded-tl-none border border-slate-800/40">
                                <Loader2 size={12} className="animate-spin text-indigo-400" />
                                <span className="text-[10px] text-indigo-300 uppercase tracking-widest">Representative is drafting a formal response...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Context Drawer / Hints (Fixed to bottom above input) */}
                {summary && (
                    <div className="px-6 py-2 bg-slate-900/40 border-t border-slate-800/40 flex gap-4 overflow-x-auto no-scrollbar">
                        {summary.faction.demands.map((demand: string, i: number) => (
                            <div key={i} className="whitespace-nowrap flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-[8px] text-amber-500/80 uppercase font-display tracking-tighter">
                                <AlertCircle size={8} /> DEMAND: {demand}
                            </div>
                        ))}
                    </div>
                )}

                {/* Message Input */}
                <div className="p-4 bg-slate-900/60 border-t border-slate-800/60">
                    <div className="relative flex items-center gap-2">
                        <textarea
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            placeholder={`Address ${activeSpeaker.name.split(' ')[1]}...`}
                            className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-4 py-3 pb-8 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all resize-none h-20"
                        />
                        <button 
                            onClick={handleSendMessage}
                            disabled={!inputValue.trim() || discourseState.isGenerating}
                            className={`
                                absolute bottom-2 right-2 p-1.5 rounded-md transition-all
                                ${!inputValue.trim() || discourseState.isGenerating 
                                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                                    : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.3)]'}
                            `}
                        >
                            <Send size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
