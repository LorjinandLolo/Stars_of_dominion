"use client";

// components/panels/diplomacy/ContactRail.tsx
// Quick-switch strip: every foreign empire as a chip — emblem, name, relation
// dot — wrapped into rows so nothing scrolls and hover cards can float above.
// The active chip carries its empire's colour as border and glow; the rest sit
// dim until hovered, so the eye lands on the one that is on screen.

import React from 'react';
import ContactEmblem from './ContactEmblem';
import { RelationPill } from './ContactSwitcher';
import type { Contact } from './contact-model';

export default function ContactRail({
    contacts, selectedId, onSelect,
}: { contacts: Contact[]; selectedId: string; onSelect: (id: string) => void }) {
    if (contacts.length < 2) return null;
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-[0.3em]">Quick Switch</span>
                <span className="flex-1 h-px bg-white/5" />
                <span className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">{contacts.length} empires</span>
            </div>
            <div className="flex flex-wrap gap-2">
                {contacts.map(c => {
                    const active = c.id === selectedId;
                    return (
                        <div key={c.id} className="relative group">
                            <button
                                type="button"
                                onClick={() => onSelect(c.id)}
                                aria-pressed={active}
                                aria-label={`${c.empireName}${c.stewardName ? ` (${c.stewardName})` : ''}, ${c.relationLabel.toLowerCase()}`}
                                className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl border transition-all duration-300 ${
                                    active ? 'scale-[1.03]' : 'opacity-60 hover:opacity-100 hover:scale-[1.02] bg-white/[0.03] border-white/10 hover:border-white/25'
                                }`}
                                style={active ? {
                                    borderColor: c.color,
                                    background: `${c.color}1f`,
                                    boxShadow: `0 0 18px ${c.color}4d, inset 0 0 12px ${c.color}1a`,
                                } : undefined}
                            >
                                <ContactEmblem contact={c} size={26} active={active} />
                                <span
                                    className={`text-[11px] font-display uppercase tracking-wider max-w-[7.5rem] truncate ${active ? 'font-bold' : 'text-slate-300'}`}
                                    style={active ? { color: c.color, textShadow: `0 0 8px ${c.color}66` } : undefined}
                                >
                                    {c.empireName}
                                </span>
                                <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ background: c.relationColor, boxShadow: `0 0 6px ${c.relationColor}` }}
                                />
                                {c.pendingCount > 0 && (
                                    <span className="text-[8px] font-mono px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">{c.pendingCount}</span>
                                )}
                            </button>

                            {/* Hover card */}
                            <div
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 w-56 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-200 z-50"
                            >
                                <div
                                    className="rounded-lg border bg-slate-950/95 backdrop-blur-xl p-3 shadow-2xl text-left"
                                    style={{ borderColor: `${c.color}80`, boxShadow: `0 0 20px ${c.color}33` }}
                                >
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <ContactEmblem contact={c} size={22} />
                                        <div className="min-w-0">
                                            <div className="text-xs font-display font-bold uppercase tracking-wider truncate" style={{ color: c.color }}>{c.empireName}</div>
                                            {c.stewardName && <div className="text-[9px] text-slate-500 truncate">Steward · {c.stewardName}</div>}
                                        </div>
                                    </div>
                                    <div className="text-[9px] text-slate-400 truncate">{c.civilizationName}</div>
                                    <div className="text-[9px] text-slate-500 truncate">{c.standingLabel}{c.standingDetail ? ` · ${c.standingDetail}` : ''}</div>
                                    <div className="mt-1.5 flex items-center justify-between gap-2">
                                        <RelationPill contact={c} compact />
                                        <span className="text-[9px] font-mono text-slate-500 truncate">
                                            {c.accords.length ? `${c.accords.length} accord${c.accords.length === 1 ? '' : 's'}` : 'no accords'}
                                        </span>
                                    </div>
                                </div>
                                <div
                                    className="mx-auto w-2 h-2 rotate-45 -mt-1 border-r border-b bg-slate-950"
                                    style={{ borderColor: `${c.color}80` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
