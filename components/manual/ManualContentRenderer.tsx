// components/manual/ManualContentRenderer.tsx
'use client';

import React from 'react';
import type { ManualContentBlock } from '@/lib/manual/types';
import { AlertTriangle, Info, Lightbulb, Calculator, BookOpen } from 'lucide-react';

interface Props {
    block: ManualContentBlock;
}

export default function ManualContentBlockRenderer({ block }: Props) {
    switch (block.type) {
        case 'paragraph':
            return (
                <p className="text-sm text-slate-300 leading-relaxed mb-6">
                    {block.content as string}
                </p>
            );

        case 'bullet_list':
            return (
                <ul className="space-y-2 mb-6 list-none">
                    {(block.content as string[]).map((item, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-slate-400">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50 mt-1.5 flex-shrink-0" />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            );

        case 'table':
            const rows = block.content as Record<string, string>[];
            const headers = Object.keys(rows[0] || {});
            return (
                <div className="mb-6 rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-800/50 border-b border-slate-700">
                            <tr>
                                {headers.map(h => (
                                    <th key={h} className="px-4 py-2 font-display uppercase tracking-wider text-slate-500">
                                        {h.replace(/_/g, ' ')}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {rows.map((row, i) => (
                                <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                                    {headers.map(h => (
                                        <td key={h} className="px-4 py-3 text-slate-300">
                                            {row[h]}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );

        case 'strategy_tip':
            return (
                <div className="mb-6 p-4 rounded-xl border border-amber-900/30 bg-gradient-to-br from-amber-950/20 to-amber-900/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 text-amber-500/20 group-hover:text-amber-500/40 transition-colors">
                        <Lightbulb className="w-8 h-8" />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="w-4 h-4 text-amber-500" />
                        <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-500 font-bold">Strategy Insight</h5>
                    </div>
                    {block.title && <h6 className="text-sm font-display text-amber-200 mb-2">{block.title}</h6>}
                    <p className="text-sm text-amber-100/80 leading-relaxed italic">
                        "{block.content as string}"
                    </p>
                </div>
            );

        case 'warning':
            return (
                <div className="mb-6 p-4 rounded-xl border border-red-900/30 bg-gradient-to-br from-red-950/20 to-red-900/10 relative">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-red-500 font-bold">Operational Warning</h5>
                    </div>
                    {block.title && <h6 className="text-sm font-display text-red-200 mb-2">{block.title}</h6>}
                    <p className="text-sm text-red-100/70 leading-relaxed">
                        {block.content as string}
                    </p>
                </div>
            );

        case 'example':
            return (
                <div className="mb-6 p-4 rounded-xl border border-blue-900/30 bg-slate-900/80 border-l-4 border-l-blue-600">
                    <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="w-4 h-4 text-blue-500" />
                        <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-blue-500 font-bold">Tactical Example</h5>
                    </div>
                    {block.title && <h6 className="text-sm font-display text-blue-200 mb-2">{block.title}</h6>}
                    <p className="text-sm text-slate-300 leading-relaxed font-serif italic">
                        {block.content as string}
                    </p>
                </div>
            );

        case 'formula':
            return (
                <div className="mb-6 p-4 rounded-xl border border-emerald-900/30 bg-emerald-950/20 flex flex-col items-center">
                    <div className="flex items-center justify-center gap-2 mb-3 w-full border-b border-emerald-900/20 pb-2">
                        <Calculator className="w-3 h-3 text-emerald-500" />
                        <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-500">{block.title || 'Calculation Formula'}</h5>
                    </div>
                    <code className="text-lg font-mono text-emerald-300 tracking-wider py-2">
                        {block.content as string}
                    </code>
                </div>
            );

        default:
            return null;
    }
}
