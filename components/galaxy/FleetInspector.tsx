"use client";

// components/galaxy/FleetInspector.tsx
// The card for a fleet that is not yours, as in other RTS games: click it on
// the map, in the system view or in the forces list and see whose it is, how
// they stand with you and what it is made of, with one click through to the
// owner's profile or diplomacy page. Reads only what the sync already sends:
// a rival fleet you can see is one the fog (lib/persistence/shard-privacy.ts)
// let through. Kept apart from selectedFleetId, which is the fleet you command.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { factionColor } from './starVisuals';
import { buildContacts, RELATION_META } from '@/components/panels/diplomacy/contact-model';
import ContactEmblem from '@/components/panels/diplomacy/ContactEmblem';
import { Handshake, User, X } from 'lucide-react';

const shipLabel = (key: string, n: number) => {
    const name = key.replace(/_/g, ' ');
    return `${n} ${n === 1 ? name : `${name}s`}`;
};

export default function FleetInspector() {
    const inspectedFleetId = useUIStore(s => s.inspectedFleetId);
    const setInspectedFleetId = useUIStore(s => s.setInspectedFleetId);
    const setDiplomacyFocusId = useUIStore(s => s.setDiplomacyFocusId);
    const setActiveTab = useUIStore(s => s.setActiveTab);
    const fleets = useUIStore(s => s.fleets) as any[];
    const systems = useUIStore(s => s.systems) as any[];
    const politicsState = useUIStore(s => s.politicsState);
    const diplomacyState = useUIStore(s => s.diplomacyState);
    const playerFactionId = useUIStore(s => s.playerFactionId);

    const fleet = inspectedFleetId ? fleets.find(f => f.id === inspectedFleetId) : null;

    // Gone from sight (the fog closed, it died, it left): the card goes too.
    React.useEffect(() => {
        if (inspectedFleetId && !fleet) setInspectedFleetId(null);
    }, [inspectedFleetId, fleet, setInspectedFleetId]);

    React.useEffect(() => {
        if (!inspectedFleetId) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            e.preventDefault();
            setInspectedFleetId(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [inspectedFleetId, setInspectedFleetId]);

    const contact = React.useMemo(() => {
        if (!fleet) return null;
        return buildContacts({
            allFactions: politicsState.allFactions || [],
            playerFactionId: playerFactionId ?? '',
            diplomacy: diplomacyState,
            breakaways: politicsState.government?.breakaways,
        }).find(c => c.id === fleet.factionId) ?? null;
    }, [fleet, politicsState.allFactions, politicsState.government?.breakaways, diplomacyState, playerFactionId]);

    if (!fleet) return null;

    const open = (tab: 'intel' | 'statecraft') => {
        setDiplomacyFocusId(fleet.factionId, tab);
        setActiveTab('diplomacy' as any);
        setInspectedFleetId(null);
    };

    const ships = Object.entries(fleet.composition ?? {}).filter(([, n]) => Number(n) > 0) as Array<[string, number]>;
    const power = Math.round((Number(fleet.basePower) || 0) * Math.min(1, Number(fleet.strength ?? 1)));
    const whereId = fleet.currentSystemId ?? fleet.destinationSystemId;
    const where = systems.find(s => s.id === whereId)?.name;
    const relation = contact ? RELATION_META[contact.relation] : null;

    return (
        <div className="absolute left-3 top-16 z-[46] w-72 max-w-[calc(100vw-24px)] rounded-lg border bg-slate-950/95 backdrop-blur-md shadow-2xl"
            style={{ borderColor: `${factionColor(fleet.factionId)}80` }}>
            <div className="flex items-center gap-2.5 p-2.5 border-b border-slate-800/70">
                {contact
                    ? <ContactEmblem contact={contact} size={36} />
                    : <span className="w-9 h-9 rounded-full flex-shrink-0" style={{ backgroundColor: factionColor(fleet.factionId) }} />}
                <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-slate-100 truncate">{fleet.name || 'Unknown fleet'}</div>
                    <div className="text-[10px] text-slate-400 truncate">
                        {contact ? contact.empireName : String(fleet.factionId).replace(/^faction-/, '').replace(/[-_]/g, ' ')}
                        {contact?.stewardName ? ` · ${contact.stewardName}` : ''}
                    </div>
                    {relation && <div className="text-[9px] font-bold tracking-wider" style={{ color: relation.color }}>{relation.label}</div>}
                </div>
                <button onClick={() => setInspectedFleetId(null)} aria-label="Close" className="p-1 rounded text-slate-500 hover:text-white hover:bg-white/10">
                    <X size={13} />
                </button>
            </div>

            <div className="px-2.5 py-2 space-y-0.5 text-[10px] text-slate-400">
                {where && <div>{fleet.currentSystemId ? 'At' : 'Heading for'} <span className="text-slate-200">{where}</span></div>}
                <div>Power <span className="font-mono text-slate-200">{power}</span> · strength <span className="font-mono text-slate-200">{Math.round((fleet.strength ?? 1) * 100)}%</span></div>
                {ships.length > 0 && <div className="capitalize">{ships.map(([k, n]) => shipLabel(k, n)).join(', ')}</div>}
            </div>

            {contact ? (
                <div className="flex gap-1.5 p-2.5 pt-0">
                    <button onClick={() => open('intel')}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border border-slate-600/60 bg-slate-800/50 hover:bg-slate-700/60 text-[10px] font-bold text-slate-200 transition-colors">
                        <User size={12} /> PROFILE
                    </button>
                    <button onClick={() => open('statecraft')}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border border-sky-500/40 bg-sky-600/15 hover:bg-sky-600/30 text-[10px] font-bold text-sky-200 transition-colors">
                        <Handshake size={12} /> DIPLOMACY
                    </button>
                </div>
            ) : (
                <div className="px-2.5 pb-2.5 text-[9px] text-slate-500">No one to talk to: they answer to no government.</div>
            )}
        </div>
    );
}
