// components/politics/FactionMoodBadge.tsx

'use client';

import React from 'react';
import { DiscourseStance } from '@/lib/politics/faction-discourse-types';

interface Props {
  satisfaction: number;
  stance?: DiscourseStance;
  intensity?: number;
}

export function FactionMoodBadge({ satisfaction, stance, intensity = 1 }: Props) {
  const getSatisfactionBarColor = () => {
    if (satisfaction > 70) return 'bg-emerald-500';
    if (satisfaction > 40) return 'bg-amber-400';
    return 'bg-rose-600';
  };

  const getStanceLabel = () => {
    if (!stance) return satisfaction > 50 ? 'Compliant' : 'Resentful';
    return stance.charAt(0).toUpperCase() + stance.slice(1);
  };

  const getStanceColor = () => {
    switch (stance) {
      case 'supportive': return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      case 'hostile': return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
      case 'demanding': return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      case 'fearful': return 'text-slate-400 border-slate-500/30 bg-slate-500/10';
      default: return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
    }
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-[120px]">
      <div className="flex justify-between items-center text-[10px] uppercase tracking-wider font-bold text-slate-400">
        <span>Satisfaction</span>
        <span className={satisfaction > 50 ? 'text-emerald-400' : 'text-rose-400'}>{satisfaction}%</span>
      </div>
      
      <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-1000 ${getSatisfactionBarColor()}`}
          style={{ width: `${satisfaction}%` }}
        />
      </div>

      <div className={`mt-1 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-tighter text-center ${getStanceColor()}`}>
        {getStanceLabel()} {intensity > 2 && '!!'}
      </div>
    </div>
  );
}
