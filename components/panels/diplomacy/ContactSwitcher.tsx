"use client";

// components/panels/diplomacy/ContactSwitcher.tsx
// The "who am I talking to" block at the top of the diplomacy screen.
//
//   [←] [→]  ACTIVE CONTACT   SARRAK  ▾        ← arrows cycle, name opens a list
//            Empire  · Steward · Lineage · Standing · Relation · Accords
//
// Every row is labelled so "Sarrak", "Sil", "Sarrak of Gor’Zhul" and
// "Sovereign State" each say what they are. The whole block is tinted the
// empire's colour so a glance tells you who is on screen before you read.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Search, Check } from 'lucide-react';
import ContactEmblem from './ContactEmblem';
import { contactMatches, type Contact } from './contact-model';

const SEARCH_THRESHOLD = 8;

export default function ContactSwitcher({
    contacts, selectedId, onSelect,
}: {
    contacts: Contact[];
    selectedId: string;
    onSelect: (id: string, direction: 'next' | 'prev' | 'jump') => void;
}) {
    const index = Math.max(0, contacts.findIndex(c => c.id === selectedId));
    const contact = contacts[index];
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const step = (delta: 1 | -1) => {
        if (contacts.length < 2) return;
        const next = (index + delta + contacts.length) % contacts.length;
        onSelect(contacts[next].id, delta === 1 ? 'next' : 'prev');
    };

    // Close the list on outside click / Escape; focus search when it opens.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        searchRef.current?.focus();
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const filtered = useMemo(() => contacts.filter(c => contactMatches(c, query)), [contacts, query]);

    if (!contact) return null;
    const { color } = contact;

    return (
        <div
            ref={rootRef}
            className="relative rounded-2xl border p-5 transition-colors duration-500"
            style={{
                borderColor: `${color}59`,
                background: `linear-gradient(120deg, ${color}1f 0%, ${color}08 45%, rgba(2,6,23,0.4) 100%)`,
                boxShadow: `0 0 0 1px ${color}14, 0 0 40px ${color}1a, inset 0 1px 0 ${color}26`,
            }}
            onKeyDown={(e) => {
                if (open) return;
                if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
                if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
            }}
        >
            {/* Row 1: arrows · ACTIVE pill · position */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <NavArrow dir="prev" color={color} disabled={contacts.length < 2} onClick={() => step(-1)} />
                    <NavArrow dir="next" color={color} disabled={contacts.length < 2} onClick={() => step(1)} />
                    <span
                        className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-display font-bold tracking-[0.25em] uppercase"
                        style={{ color, background: `${color}26`, border: `1px solid ${color}8c`, boxShadow: `0 0 12px ${color}40` }}
                    >
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                        Active Contact
                    </span>
                </div>
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-[0.3em]">
                    {index + 1} / {contacts.length}
                </span>
            </div>

            {/* Rows 2–3 re-mount per contact so the name visibly changes. */}
            <div key={contact.id} className="animate-contact-swap-fade">
            {/* Row 2: emblem · big name (opens list) · relation */}
            <div className="mt-4 flex items-center gap-4 min-w-0">
                <ContactEmblem contact={contact} size={56} active />
                <div className="min-w-0 flex-1">
                    <button
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={open}
                        onClick={() => setOpen(o => !o)}
                        className="group flex items-center gap-3 max-w-full text-left rounded-lg -mx-2 px-2 py-1 transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2"
                        style={{ ['--tw-ring-color' as any]: `${color}80` }}
                        title="Choose another empire"
                    >
                        <span
                            className="text-3xl lg:text-4xl font-display font-bold uppercase tracking-[0.06em] leading-none break-words"
                            style={{ color, textShadow: `0 0 18px ${color}66, 0 2px 0 rgba(0,0,0,0.5)` }}
                        >
                            {contact.empireName}
                        </span>
                        <ChevronDown
                            className={`w-6 h-6 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
                            style={{ color }}
                        />
                    </button>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <RelationPill contact={contact} />
                        {contact.pendingCount > 0 && (
                            <span className="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300">
                                {contact.pendingCount} awaiting answer
                            </span>
                        )}
                        {contact.sanctioningUs && (
                            <span className="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300">
                                Sanctioning you
                            </span>
                        )}
                        {contact.sanctionedByUs && (
                            <span className="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300">
                                Under your sanctions
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Row 3: labelled facts, one per line */}
            <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5 border-t pt-4" style={{ borderColor: `${color}33` }}>
                <Fact label="Empire" value={contact.empireName} color={color} strong />
                <Fact label="Steward" value={contact.stewardName ?? 'Unattended'} muted={!contact.stewardName} />
                <Fact label="Lineage" value={contact.civilizationName} muted={!contact.civilizationId} />
                <Fact label="Ideology" value={contact.ideologyName ?? 'Unknown'} muted={!contact.ideologyName} />
                <Fact label="Standing" value={contact.standingLabel} hint={contact.standingDetail} />
                <Fact
                    label="Accords"
                    value={contact.accords.length ? contact.accords.join(' · ') : 'No accords in force'}
                    muted={contact.accords.length === 0}
                />
            </dl>

            {contact.traits.length > 0 && (
                <div className="mt-4 flex gap-1.5 flex-wrap">
                    {contact.traits.map(trait => (
                        <span key={trait} className="px-2 py-0.5 rounded bg-black/30 border border-white/10 text-[9px] text-slate-400 uppercase tracking-wider">{trait}</span>
                    ))}
                </div>
            )}
            </div>

            {/* Dropdown list */}
            {open && (
                <div
                    role="listbox"
                    aria-activedescendant={`contact-option-${selectedId}`}
                    className="absolute left-4 right-4 top-[calc(100%-0.5rem)] z-40 rounded-xl border border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-2xl overflow-hidden"
                >
                    {contacts.length >= SEARCH_THRESHOLD && (
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/30">
                            <Search className="w-3.5 h-3.5 text-slate-500" />
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search empire, steward, lineage, relation…"
                                className="flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none"
                            />
                            <span className="text-[9px] font-mono text-slate-600">{filtered.length}</span>
                        </div>
                    )}
                    <ul className="max-h-72 overflow-y-auto custom-scrollbar py-1">
                        {filtered.length === 0 && (
                            <li className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-slate-500">No empire matches</li>
                        )}
                        {filtered.map(c => {
                            const isActive = c.id === selectedId;
                            return (
                                <li key={c.id} id={`contact-option-${c.id}`} role="option" aria-selected={isActive}>
                                    <button
                                        type="button"
                                        onClick={() => { onSelect(c.id, 'jump'); setOpen(false); setQuery(''); }}
                                        className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5"
                                        style={isActive ? { background: `${c.color}1a`, boxShadow: `inset 3px 0 0 ${c.color}` } : undefined}
                                    >
                                        <ContactEmblem contact={c} size={30} active={isActive} />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-2">
                                                <span className={`text-sm font-display uppercase tracking-wider truncate ${isActive ? 'font-bold' : ''}`} style={{ color: isActive ? c.color : '#e2e8f0' }}>
                                                    {c.empireName}
                                                </span>
                                                {c.stewardName && <span className="text-[10px] text-slate-500 truncate">· {c.stewardName}</span>}
                                            </span>
                                            <span className="block text-[9px] text-slate-500 truncate">{c.civilizationName} · {c.standingLabel}</span>
                                        </span>
                                        <span className="text-[9px] font-mono tracking-widest shrink-0" style={{ color: c.relationColor }}>{c.relationLabel}</span>
                                        {isActive && <Check className="w-4 h-4 shrink-0" style={{ color: c.color }} />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}

function NavArrow({ dir, color, disabled, onClick }: { dir: 'prev' | 'next'; color: string; disabled: boolean; onClick: () => void }) {
    const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={dir === 'prev' ? 'Previous empire' : 'Next empire'}
            title={dir === 'prev' ? 'Previous empire (←)' : 'Next empire (→)'}
            className="w-8 h-8 rounded-lg border flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
            style={{ borderColor: `${color}66`, background: `${color}14`, color }}
        >
            <Icon className="w-4 h-4" />
        </button>
    );
}

export function RelationPill({ contact, compact = false }: { contact: Contact; compact?: boolean }) {
    const c = contact.relationColor;
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded font-mono uppercase tracking-widest ${compact ? 'text-[8px] px-1.5 py-0.5' : 'text-[9px] px-2 py-0.5'}`}
            style={{ color: c, background: `${c}1a`, border: `1px solid ${c}55` }}
            title={`Escalation ${contact.escalationLevel}/7 — ${contact.escalationLabel}`}
        >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 5px ${c}` }} />
            {contact.relationLabel}
            {!compact && contact.escalationLabel !== contact.relationLabel && (
                <span className="text-slate-500 normal-case tracking-normal">· {contact.escalationLabel.toLowerCase()}</span>
            )}
        </span>
    );
}

function Fact({ label, value, hint, color, strong, muted }: {
    label: string; value: string; hint?: string; color?: string; strong?: boolean; muted?: boolean;
}) {
    return (
        <div className="flex items-baseline gap-3 min-w-0">
            <dt className="w-16 shrink-0 text-[9px] font-mono uppercase tracking-[0.25em] text-slate-500">{label}</dt>
            <dd className="min-w-0">
                <span
                    className={`block text-xs uppercase tracking-wider truncate ${strong ? 'font-display font-bold' : 'font-medium'} ${muted ? 'text-slate-500 italic' : 'text-slate-100'}`}
                    style={strong && color ? { color } : undefined}
                    title={value}
                >
                    {value}
                </span>
                {hint && <span className="block text-[9px] text-slate-500 normal-case tracking-normal mt-0.5">{hint}</span>}
            </dd>
        </div>
    );
}
