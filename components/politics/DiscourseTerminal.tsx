"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { 
    MessageSquare, 
    Send, 
    User, 
    Bot, 
    X, 
    Zap, 
    Heart, 
    Shield, 
    Terminal,
    Loader2
} from 'lucide-react';
import { sendDiscourseMessageAction, getFactionStatusSummary } from '@/app/actions/discourse';
import { DiscourseMessage } from '@/lib/politics/faction-discourse-types';

interface DiscourseTerminalProps {
    factionId: string;
    onClose: () => void;
}

export default function DiscourseTerminal({ factionId, onClose }: DiscourseTerminalProps) {
    const { playerState } = useUIStore();
    const [messages, setMessages] = useState<DiscourseMessage[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [context, setContext] = useState<any>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const init = async () => {
            const ctx = await getFactionStatusSummary(factionId);
            setContext(ctx);
            if (ctx.conversation?.recentMessages) {
                setMessages(ctx.conversation.recentMessages);
            } else {
                // Initial greeting
                setMessages([{
                    id: 'init',
                    speaker: 'faction',
                    content: ctx.speaker.greetings[0] || "Channel open. State your business.",
                    timestamp: Date.now()
                }]);
            }
        };
        init();
    }, [factionId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isTyping) return;

        const playerMsg: DiscourseMessage = {
            id: `m_${Date.now()}`,
            speaker: 'player',
            content: input,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, playerMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const result = await sendDiscourseMessageAction({
                factionId,
                playerMessage: input
            });
            setMessages(prev => [...prev, result.factionMessage]);
        } catch (error) {
            console.error("Discourse error:", error);
        } finally {
            setIsTyping(false);
        }
    };

    if (!context) return null;

    const speaker = context.speaker;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-2xl h-[600px] bg-slate-950 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden relative">
                <div className="absolute inset-0 bg-[url('/grid-dark.svg')] bg-repeat opacity-10 pointer-events-none" />
                
                {/* Header */}
                <div className="p-6 border-b border-white/5 bg-slate-900/40 flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center relative overflow-hidden group">
                            <Bot className="w-6 h-6 text-indigo-400 relative z-10" />
                            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-display uppercase tracking-wider text-white">{speaker.name}</h3>
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-tighter animate-pulse">Live Uplink</span>
                            </div>
                            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{speaker.title}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Info Bar */}
                <div className="px-6 py-3 bg-black/40 border-b border-white/5 flex gap-6 overflow-x-auto no-scrollbar relative z-10">
                    <div className="flex items-center gap-2 shrink-0">
                        <Zap size={12} className="text-amber-400" />
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-tighter">Style:</span>
                        <span className="text-[9px] font-mono text-slate-300 uppercase">{speaker.politicalStyle}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Heart size={12} className="text-rose-400" />
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-tighter">Satisfaction:</span>
                        <span className={`text-[9px] font-mono uppercase ${context.faction.satisfaction > 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {context.faction.satisfaction}%
                        </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Shield size={12} className="text-blue-400" />
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-tighter">Tone:</span>
                        <span className="text-[9px] font-mono text-slate-300 uppercase italic truncate max-w-[120px]">{speaker.tone}</span>
                    </div>
                </div>

                {/* Messages area */}
                <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative z-10"
                >
                    {messages.map((msg, i) => (
                        <div 
                            key={msg.id} 
                            className={`flex ${msg.speaker === 'player' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}
                        >
                            <div className={`max-w-[80%] flex flex-col ${msg.speaker === 'player' ? 'items-end' : 'items-start'}`}>
                                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                                    msg.speaker === 'player' 
                                    ? 'bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-900/20' 
                                    : 'bg-slate-900 text-slate-200 border border-white/5 rounded-tl-none'
                                }`}>
                                    {msg.content}
                                </div>
                                <span className="text-[8px] font-mono text-slate-600 uppercase mt-1 tracking-widest">
                                    {msg.speaker === 'player' ? 'Hegemon Output' : `${speaker.name} Transmission`}
                                </span>
                            </div>
                        </div>
                    ))}
                    {isTyping && (
                        <div className="flex justify-start">
                            <div className="bg-slate-900 border border-white/5 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                                <Loader2 size={14} className="text-indigo-400 animate-spin" />
                                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Processing response...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input area */}
                <div className="p-6 border-t border-white/5 bg-slate-900/20 relative z-10">
                    <form onSubmit={handleSend} className="flex gap-4">
                        <div className="flex-1 relative group">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                <Terminal size={14} className="text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                            </div>
                            <input 
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Enter diplomatic transmission..."
                                className="w-full bg-black/60 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={!input.trim() || isTyping}
                            className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-xl transition-all shadow-lg shadow-indigo-900/20"
                        >
                            <Send size={20} />
                        </button>
                    </form>
                    <div className="mt-3 flex justify-between items-center px-1">
                        <span className="text-[8px] font-mono text-slate-700 uppercase tracking-widest">Secure Quantum Channel L5</span>
                        <div className="flex gap-2">
                            {speaker.coreValues.slice(0, 2).map((val: string) => (
                                <span key={val} className="text-[8px] font-mono text-slate-500 uppercase border border-white/5 px-1.5 py-0.5 rounded italic">#{val}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
