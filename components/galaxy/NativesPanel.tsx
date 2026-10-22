"use client";

// components/galaxy/NativesPanel.tsx
// A native people on a world (lib/natives/natives.ts): who they are, how they
// feel about us, and what we can do. Rendered inside the planet card.

import React from 'react';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { useUIStore } from '@/lib/store/ui-store';
import { CIVILIZATIONS } from '@/lib/civilization/data/civilizations';
import {
    describeNatives, attitudeOf, attitudeWord, GIFT_LABEL, GIFT_COST, UPLIFT_COST,
    SETTLE_CONSENT, UPLIFT_ATTITUDE, WELCOME_ATTITUDE, FORCED_LABOUR_TAGS, type NativeCivilization, type NativeAction,
} from '@/lib/natives/natives';

const TONE = {
    emerald: 'bg-emerald-600/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30',
    sky: 'bg-sky-600/15 border-sky-500/40 text-sky-300 hover:bg-sky-600/30',
    amber: 'bg-amber-600/15 border-amber-500/40 text-amber-300 hover:bg-amber-600/30',
    rose: 'bg-rose-600/15 border-rose-500/40 text-rose-300 hover:bg-rose-600/30',
} as const;

const STATUS_LABEL: Record<NativeCivilization['status'], string> = {
    free: 'Free', at_war: 'At war', pacified: 'Beaten', neighbours: 'Neighbours', uplifted: 'Uplifted, members of an empire',
    integrated: 'Subjects of an empire', enslaved: 'In forced labour', displaced: 'Driven into reserves',
};

export default function NativesPanel({ planet, playerFactionId }: { planet: any; playerFactionId: string | null }) {
    const n: NativeCivilization | undefined = planet?.natives;
    const [busy, setBusy] = React.useState<string | null>(null);
    const civId = useUIStore(s => (s.factions as any)?.[playerFactionId ?? '']?.civilizationId);
    // Only the harshest civilizations may put a people to forced labour (worker: mayForceLabour).
    const canForceLabour = !!CIVILIZATIONS.find(c => c.id === civId)?.playstyleTags?.some((t: string) => FORCED_LABOUR_TAGS.includes(t));
    if (!n || !playerFactionId) return null;

    const known = n.relations[playerFactionId] !== undefined;
    const a = attitudeOf(n, playerFactionId);
    const watching = n.observers[playerFactionId] !== undefined;
    const act = async (action: NativeAction, label: string) => {
        setBusy(action);
        try { await dispatchOrder({ actionId: 'NATIVE_ACTION', factionId: playerFactionId, payload: { planetId: planet.id, action }, label }); }
        finally { setBusy(null); }
    };
    const Btn = ({ action, label, title, tone = 'emerald', disabled = false }: { action: NativeAction; label: string; title: string; tone?: 'emerald' | 'sky' | 'amber' | 'rose'; disabled?: boolean }) => (
        <button
            disabled={disabled || busy === action}
            onClick={(e) => { e.stopPropagation(); act(action, `${label}: ${n.speciesName}`); }}
            title={title}
            className={`px-2 py-1 rounded border text-[9px] font-bold tracking-wider transition-colors disabled:opacity-40 ${TONE[tone]}`}
        >
            {label}
        </button>
    );

    return (
        <div className="mt-2 rounded-lg border border-lime-500/30 bg-lime-950/20 p-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-bold text-lime-200 tracking-wide">The {n.speciesName}</span>
                <span className="text-[9px] text-lime-400/70">{STATUS_LABEL[n.status]}</span>
            </div>
            <div className="text-[9px] text-slate-400 leading-snug">{describeNatives(n)}</div>
            <div className="text-[9px] text-slate-500">
                {n.population}k people · {n.techLevel} age · {n.warriors.toLocaleString()} fighters · gift: {GIFT_LABEL[n.gift]}
            </div>
            {known && <div className="text-[9px]" style={{ color: a >= 60 ? '#86efac' : a >= 40 ? '#fde68a' : '#fca5a5' }}>Towards us: {attitudeWord(a)} ({a})</div>}
            {watching && !n.contacted && <div className="text-[9px] text-sky-300">Our ship watches them from orbit (research).</div>}

            <div className="flex flex-wrap gap-1">
                {n.status === 'free' && !n.contacted && !watching && (
                    <Btn action="observe" tone="sky" label="OBSERVE" title="Study them unseen from a ship in the system: research every strategic tick, until anyone makes contact." />
                )}
                {(n.status === 'free' || n.status === 'neighbours') && !known && (
                    <Btn action="contact" label="CONTACT" title="Send envoys down. Ends everyone's observation. Friendly peoples trade with you." />
                )}
                {known && (n.status === 'free' || n.status === 'neighbours') && (
                    <Btn action="gift" label={`GIFT · ${GIFT_COST.CREDITS}`} title="Gifts raise their attitude. At 50+ they trade, at 40+ they let you settle beside them, at 70+ they can be uplifted." />
                )}
                {known && n.status === 'free' && !n.uplift && (
                    <Btn action="uplift" tone="amber" disabled={a < UPLIFT_ATTITUDE} label={`UPLIFT · ${UPLIFT_COST.CREDITS}`}
                        title={a < UPLIFT_ATTITUDE ? `They must be friendly first (${UPLIFT_ATTITUDE}+).` : 'Teach them the stars: about eight hours, then they join your empire as a member people.'} />
                )}
                {n.status === 'pacified' && n.overlordId === playerFactionId && (
                    <>
                        <Btn action="integrate" label="INTEGRATE" title="Make them subjects: a colony with their people, unrest at first, and their gift." />
                        <Btn action="displace" tone="amber" label="DISPLACE" title="Drive them into reserves in the wilds and take the land. Infamy." />
                        {canForceLabour && (
                            <Btn action="enslave" tone="rose" label="FORCED LABOUR" title="Put them to work: production, but steady unrest, revolts, and great infamy." />
                        )}
                    </>
                )}
            </div>
            {n.uplift && <div className="text-[9px] text-amber-300">Uplift under way: {n.uplift.progress}%</div>}
            {n.status === 'free' && (
                <div className="text-[8px] text-slate-500">Settle with consent at {SETTLE_CONSENT}+. Troops landed below {WELCOME_ATTITUDE} start a guerrilla war.</div>
            )}
        </div>
    );
}
