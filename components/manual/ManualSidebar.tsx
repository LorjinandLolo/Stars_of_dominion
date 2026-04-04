// components/manual/ManualSidebar.tsx
'use client';

import React from 'react';
import { MANUAL_DATA } from '@/lib/manual/manual-data';
import { useUIStore } from '@/lib/store/ui-store';
import * as Icons from 'lucide-react';

export default function ManualSidebar() {
    const { activeManualSectionId, setActiveManualSection } = useUIStore();

    return (
        <div className="w-72 flex-shrink-0 bg-slate-900/40 border-r border-slate-800/50 flex flex-col h-full">
            <div className="p-6 border-b border-white/5 bg-gradient-to-br from-slate-900 to-slate-950">
                <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-blue-500 font-bold mb-1">
                    Imperial Archive
                </h2>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-display">
                    Tactical Manual v4.02.1
                </p>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                {MANUAL_DATA.map((section) => {
                    const IconComponent = (Icons as any)[section.icon || 'Book'] || Icons.Book;
                    const isActive = activeManualSectionId === section.id;

                    return (
                        <button
                            key={section.id}
                            onClick={() => setActiveManualSection(section.id)}
                            className={`
                                w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group
                                ${isActive 
                                    ? 'bg-blue-600/10 border border-blue-500/30 text-blue-100 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                                    : 'hover:bg-white/[0.03] border border-transparent text-slate-400 hover:text-white'}
                            `}
                        >
                            <IconComponent className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400/50'}`} />
                            <span className="text-[11px] font-display uppercase tracking-widest text-left line-clamp-1">
                                {section.title.split(': ')[1] || section.title}
                            </span>
                            {isActive && (
                                <div className="ml-auto w-1 h-3 bg-blue-500 rounded-full animate-pulse" />
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="p-4 bg-slate-950/80 border-t border-white/5">
                <div className="text-[9px] font-mono text-slate-600 uppercase tracking-tighter">
                    Authorised Personnel Only
                </div>
            </div>
        </div>
    );
}
