// components/politics/FactionSpeakerCard.tsx

'use client';

import React from 'react';
import { FactionSpeakerProfile } from '@/lib/politics/faction-discourse-types';

interface Props {
  speaker: FactionSpeakerProfile;
  compact?: boolean;
}

export function FactionSpeakerCard({ speaker, compact = false }: Props) {
  return (
    <div className={`relative group overflow-hidden border border-slate-700/50 bg-slate-900/40 backdrop-blur-md rounded-lg p-4 transition-all duration-300 hover:border-blue-500/30 ${compact ? 'py-3' : ''}`}>
      {/* Decorative scanning line */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent animate-scan" />
      
      <div className="flex gap-4 items-start">
        <div className="relative">
          <div className="w-16 h-16 rounded border border-blue-500/20 bg-slate-950 flex items-center justify-center overflow-hidden">
             {/* Placeholder for avatar generation */}
             <div className="text-2xl font-black text-blue-500/40 select-none">
               {speaker.name.charAt(0)}
             </div>
             {/* Subtle static overlay */}
             <div className="absolute inset-0 bg-static opacity-10 pointer-events-none" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest truncate">
            {speaker.name}
          </h3>
          <p className="text-[10px] text-blue-400 font-bold uppercase tracking-tight truncate opacity-80">
            {speaker.title}
          </p>
          
          {!compact && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="px-1.5 py-0.5 rounded-sm bg-slate-800 border border-slate-700 text-[9px] text-slate-400 font-medium">
                {speaker.politicalStyle}
              </span>
              <span className="px-1.5 py-0.5 rounded-sm bg-slate-800 border border-slate-700 text-[9px] text-slate-400 font-medium italic">
                "{speaker.tone}"
              </span>
            </div>
          )}
        </div>
      </div>

      {!compact && (
        <div className="mt-4 pt-3 border-t border-slate-800/50 space-y-2">
          <div className="flex justify-between text-[9px] uppercase tracking-tighter text-slate-500 font-bold">
            <span>Primary Concerns</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {speaker.primaryConcerns.map((concern, idx) => (
              <span key={idx} className="text-[9px] text-blue-300 bg-blue-500/5 px-1.5 py-0.5 rounded-sm border border-blue-500/10">
                {concern}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
