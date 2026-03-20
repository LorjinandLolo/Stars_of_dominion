// components/civilization/CivilizationIdentity.tsx

"use client";

import React from 'react';
import { 
  Sprout, 
  Coins, 
  Shield, 
  VenetianMask, 
  Sun, 
  Factory, 
  Users, 
  Cpu,
  Info
} from 'lucide-react';
import { CivilizationRegistry } from '@/lib/civilization/registry';
import { useUIStore } from '@/lib/store/ui-store';

const CIV_ICONS: Record<string, React.ReactNode> = {
  'civ-mycelari': <Sprout size={18} className="text-emerald-400" />,
  'civ-auraxian': <Coins size={18} className="text-amber-400" />,
  'civ-velkori': <Shield size={18} className="text-rose-400" />,
  'civ-nythari': <VenetianMask size={18} className="text-slate-400" />,
  'civ-solari': <Sun size={18} className="text-sky-400" />,
  'civ-grakkar': <Factory size={18} className="text-orange-400" />,
  'civ-elyndra': <Users size={18} className="text-indigo-400" />,
  'civ-xalthuun': <Cpu size={18} className="text-yellow-600" />,
};

export const CivilizationIdentity: React.FC = () => {
  const { playerState } = useUIStore();
  
  if (!playerState || !playerState.civilizationId) return null;

  const civ = CivilizationRegistry.getCivilization(playerState.civilizationId);
  const ideology = playerState.ideologyId ? CivilizationRegistry.getIdeology(playerState.ideologyId) : null;

  if (!civ) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-1 bg-slate-900/40 border border-slate-800/50 rounded-md group hover:border-[var(--color-primary)]/30 transition-all duration-300 cursor-help relative">
      <div className="flex items-center justify-center p-1.5 bg-slate-950/50 rounded border border-slate-800 group-hover:bg-slate-900 transition-colors">
        {CIV_ICONS[civ.id] || <Info size={18} />}
      </div>
      
      <div className="flex flex-col">
        <span className="text-[10px] font-display font-bold tracking-wider text-slate-100 uppercase">
          {civ.name}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-display text-slate-400 tracking-widest uppercase">
            {civ.speciesType}
          </span>
          {ideology && (
            <>
              <span className="text-[8px] text-slate-700">•</span>
              <span className="text-[8px] font-display text-[var(--color-primary)]/70 tracking-widest uppercase">
                {ideology.name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Hover Tooltip */}
      <div className="absolute top-full left-0 mt-2 w-72 p-4 bg-slate-950/98 border border-slate-700/50 rounded-lg shadow-2xl opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 z-[100] backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-3 pb-2 border-b border-slate-800/50">
           {CIV_ICONS[civ.id] || <Info size={18} />}
           <div>
             <h3 className="text-sm font-display font-black tracking-widest text-[var(--color-primary)]">{civ.name}</h3>
             <p className="text-[9px] text-slate-500 uppercase tracking-tighter">{civ.shortDescription}</p>
           </div>
        </div>

        <p className="text-[10px] text-slate-400 mb-4 leading-relaxed font-light italic">"{civ.lore}"</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <h4 className="text-[9px] font-bold text-slate-500 uppercase mb-1 tracking-widest">Strengths</h4>
            <div className="flex flex-wrap gap-1">
              {civ.playstyleTags.map(tag => (
                <span key={tag} className="text-[8px] px-1.5 py-0.5 bg-emerald-950/30 text-emerald-400 border border-emerald-800/30 rounded lowercase">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div>
             <h4 className="text-[9px] font-bold text-slate-500 uppercase mb-1 tracking-widest">Weaknesses</h4>
             <div className="flex flex-wrap gap-1">
              {civ.weaknesses.map(w => (
                <span key={w} className="text-[8px] px-1.5 py-0.5 bg-rose-950/30 text-rose-400 border border-rose-800/30 rounded lowercase">
                  {w}
                </span>
              ))}
            </div>
          </div>
        </div>

        {ideology && (
          <div className="pt-3 border-t border-slate-800/50">
            <h4 className="text-[9px] font-bold text-[var(--color-primary)] uppercase mb-1 tracking-widest">Ideology: {ideology.name}</h4>
            <p className="text-[9px] text-slate-400 leading-tight">{ideology.description}</p>
          </div>
        )}
      </div>
    </div>
  );
};
