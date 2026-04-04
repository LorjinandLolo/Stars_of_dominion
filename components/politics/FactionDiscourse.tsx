// components/politics/FactionDiscourse.tsx

'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  FactionContextSummary,
  DiscourseMessage,
  FactionDiscourseResponse
} from '@/lib/politics/faction-discourse-types';
import { FactionMoodBadge } from './FactionMoodBadge';
import { FactionSpeakerCard } from './FactionSpeakerCard';

interface Props {
  factionId: string;
}

export function FactionDiscourse({ factionId }: Props) {
  const [context, setContext] = useState<FactionContextSummary | null>(null);
  const [messages, setMessages] = useState<DiscourseMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial load: Fetch context and existing thread history
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`/api/discourse?factionId=${encodeURIComponent(factionId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ctx: FactionContextSummary = await res.json();
        setContext(ctx);
        setMessages(ctx.conversation.recentMessages);
      } catch (err) {
        console.error('Failed to load discourse context:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [factionId]);

  // Handle auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputMessage.trim() || isSending) return;

    const currentInput = inputMessage;
    setInputMessage('');
    setIsSending(true);

    try {
      const res = await fetch('/api/discourse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factionId, playerMessage: currentInput }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `Server error ${res.status}`);
      }

      const result = await res.json();

      // Update local message list
      setMessages(prev => [...prev, result.playerMessage, result.factionMessage]);
    } catch (err) {
      console.error('Message send failure:', err);
    } finally {
      setIsSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20 animate-pulse">
        <div className="text-blue-500 font-black tracking-widest uppercase italic">Establishing Secure Channel...</div>
      </div>
    );
  }

  if (!context) return <div>Failed to initialize discourse terminal.</div>;

  return (
    <div className="flex flex-col h-[600px] border border-slate-700/50 bg-slate-900/40 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl">
      {/* Header Area */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
            Diplomatic Terminal // <span className="text-slate-100">{context.faction.name}</span>
          </h2>
        </div>
        
        <div className="flex items-center gap-6">
          <FactionMoodBadge 
            satisfaction={context.faction.satisfaction} 
            stance={messages.length > 0 ? (messages[messages.length-1] as any).stance : undefined}
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Speaker Profile & Context */}
        <div className="w-72 border-r border-slate-800 p-4 space-y-4 overflow-y-auto bg-slate-950/20">
          <FactionSpeakerCard speaker={context.speaker} />
          
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <div>
              <h4 className="text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-widest">Active Demands</h4>
              <div className="space-y-1.5">
                {context.faction.demands.length > 0 ? context.faction.demands.map((d, i) => (
                  <div key={i} className="text-[9px] text-amber-500 bg-amber-500/5 border border-amber-500/20 px-2 py-1 rounded">
                    {d}
                  </div>
                )) : <div className="text-[9px] italic text-slate-600">No active formal demands</div>}
              </div>
            </div>

            <div>
              <h4 className="text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-widest">Empire Context</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500">Stability</span>
                  <span className="text-slate-300">{context.empire.stability}%</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500">Narrative</span>
                  <span className="text-slate-400 truncate ml-4 italic">{context.empire.narrativeTone}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-slate-950/10">
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800"
          >
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                <div className="text-4xl mb-2">📡</div>
                <div className="text-xs font-bold uppercase tracking-widest text-blue-400">Communication established</div>
                <div className="text-[10px] text-slate-500 mt-1 max-w-[200px]">
                  Initiate political discourse with the {context.faction.name}.
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.speaker === 'player' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] group`}>
                  <div className={`text-[9px] uppercase tracking-tighter mb-1.5 font-black flex items-center gap-2 ${msg.speaker === 'player' ? 'justify-end text-blue-500' : 'text-slate-500'}`}>
                    {msg.speaker === 'player' ? 'Consul Protocol' : context.speaker.name}
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  <div className={`p-4 rounded-lg text-sm leading-relaxed ${
                    msg.speaker === 'player' 
                      ? 'bg-blue-600/10 border border-blue-500/20 text-blue-50 shadow-[0_0_15px_rgba(59,130,246,0.05)]' 
                      : 'bg-slate-800/40 border border-slate-700/30 text-slate-200'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex justify-start animate-in fade-in slide-in-from-left-4">
                <div className="bg-slate-800/40 border border-slate-700/30 p-4 rounded-lg flex items-center gap-3">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500/60 animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500/60 animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500/60 animate-bounce [animation-delay:0.4s]" />
                  </div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Encrypting Reply...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-slate-800/50 bg-slate-950/40">
            <form onSubmit={handleSendMessage} className="relative">
              <input
                type="text"
                placeholder="Enter formal communication or political demand..."
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg pl-4 pr-16 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                disabled={isSending}
              />
              <button 
                type="submit"
                disabled={!inputMessage.trim() || isSending}
                className="absolute right-2 top-2 bottom-2 px-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-[10px] font-black uppercase tracking-widest rounded transition-all active:scale-95"
              >
                Send
              </button>
            </form>
            <div className="mt-2 flex justify-between px-1">
              <div className="text-[8px] uppercase font-bold text-slate-600 tracking-tighter">Secure High-Priority Channel [256-bit]</div>
              <div className="text-[8px] uppercase font-bold text-slate-600 tracking-tighter">Ollama-Qwen3 Active</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
