// components/panels/diplomacy/contact-model.ts
// Stars of Dominion — the diplomacy screen's view of "who am I talking to".
//
// Pure derivation, no React and no store: takes the synced faction list plus
// the diplomacy/government slices and returns one `Contact` per foreign empire
// with everything the header, the quick-switch rail and the tooltips need —
// name split into empire + steward, civilization lineage, a single colour
// shared with the galaxy map, the friend/foe relation, sovereignty standing
// and the accords in force. The panel used to mix "SARRAK / SIL" (the raw
// faction name), "faction-sarrak" (the id) and "SOVEREIGN STATE" (a fallback
// trait) in one header with nothing saying which was which; this file names
// each piece once so the UI can label it.

import { factionColor } from '@/components/galaxy/starVisuals';
import { CIVILIZATIONS } from '@/lib/civilization/data/civilizations';
import { IDEOLOGIES } from '@/lib/civilization/data/ideologies';
import type { TreatyType } from '@/lib/politics/cold-war-types';
import type { DiplomacyState, BreakawaySnapshot } from '@/types/ui-state';

export type ContactRelation = 'war' | 'hostile' | 'tense' | 'ally' | 'neutral';

export const RELATION_META: Record<ContactRelation, { label: string; color: string }> = {
    war:     { label: 'AT WAR',  color: '#ef4444' },
    hostile: { label: 'HOSTILE', color: '#f97316' },
    tense:   { label: 'TENSE',   color: '#f59e0b' },
    ally:    { label: 'ALLIED',  color: '#38bdf8' },
    neutral: { label: 'NEUTRAL', color: '#94a3b8' },
};

export const ESCALATION_LABELS: Record<number, string> = {
    0: 'CALM',
    1: 'RIVALRY',
    2: 'TENSE',
    3: 'CONFRONTATION',
    4: 'COVERT WAR',
    5: 'COLD WAR',
    6: 'NEAR-HOT',
    7: 'AT WAR',
};

export const TREATY_LABELS: Record<TreatyType, string> = {
    non_aggression:    'Non-Aggression Pact',
    mutual_defense:    'Mutual Defense Treaty',
    research_share:    'Research Sharing Agreement',
    intelligence_pact: 'Intelligence Cooperation',
    open_borders:      'Open Borders Access',
};

export type ContactStanding = 'sovereign' | 'breakaway' | 'tributary' | 'overlord';

export interface Contact {
    id: string;
    /** Raw faction name as the world stores it, e.g. "Sarrak / Sil". */
    name: string;
    /** The empire proper: "Sarrak". */
    empireName: string;
    /** Whoever runs it — the friend's name after the slash, if any: "Sil". */
    stewardName?: string;
    civilizationId?: string;
    /** Lineage the empire belongs to: "Sarrak of Gor’Zhul". */
    civilizationName: string;
    ideologyName?: string;
    /** One colour per empire, identical to the galaxy map's. */
    color: string;
    /** Two-letter emblem text for the tile. */
    initials: string;
    relation: ContactRelation;
    relationLabel: string;
    relationColor: string;
    escalationLevel: number;
    escalationLabel: string;
    rivalryScore: number | null;
    standing: ContactStanding;
    standingLabel: string;
    standingDetail?: string;
    /** Active treaties between us and them, human labels. */
    accords: string[];
    accordTypes: TreatyType[];
    /** Proposals and gambits awaiting someone's answer, either direction. */
    pendingCount: number;
    sanctionedByUs: boolean;
    sanctioningUs: boolean;
    traits: string[];
    description: string;
}

interface BuildInput {
    /** politicsState.allFactions — economy faction records. */
    allFactions: any[];
    playerFactionId: string;
    diplomacy: Partial<DiplomacyState> | undefined;
    breakaways?: BreakawaySnapshot[];
}

/** "Sarrak / Sil" → { empire: "Sarrak", steward: "Sil" }; no slash → whole name. */
export function splitFactionName(raw: string): { empire: string; steward?: string } {
    const parts = raw.split(/\s+\/\s+/);
    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
        return { empire: parts[0].trim(), steward: parts.slice(1).join(' / ').trim() };
    }
    return { empire: raw.trim() };
}

export function initialsOf(empireName: string): string {
    const words = empireName.replace(/[’'`]/g, '').split(/[\s-]+/).filter(Boolean);
    if (words.length === 0) return '??';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

export function buildContacts({ allFactions, playerFactionId, diplomacy, breakaways }: BuildInput): Contact[] {
    const dip = diplomacy ?? {};
    const civById = new Map(CIVILIZATIONS.map(c => [c.id, c]));
    const ideoById = new Map(IDEOLOGIES.map(i => [i.id, i]));
    const nameOf = (id: string) => {
        const f = allFactions.find(x => x?.id === id);
        return f?.name ? splitFactionName(f.name).empire : id.replace(/^faction-/, '');
    };

    return (allFactions || [])
        .filter(f => f && f.id && f.id !== playerFactionId)
        .map((f): Contact => {
            const id: string = f.id;
            const rawName: string = f.name || id;
            const { empire, steward } = splitFactionName(rawName);
            const civ = f.civilizationId ? civById.get(f.civilizationId) : undefined;
            const ideo = f.ideologyId ? ideoById.get(f.ideologyId) : undefined;

            const rivalry = (dip.rivalries || []).find(r =>
                (r.empireAId === playerFactionId && r.empireBId === id) ||
                (r.empireBId === playerFactionId && r.empireAId === id));
            const escalationLevel = rivalry?.escalationLevel ?? 0;

            const activeTreaties = (dip.treaties || []).filter(t =>
                t.status === 'active' &&
                t.signatories.includes(playerFactionId) &&
                t.signatories.includes(id));
            const accordTypes = activeTreaties.map(t => t.type);

            // Same thresholds the galaxy map uses for friend/foe rings, with two
            // intermediate steps so the rail can show more than red/grey/blue.
            let relation: ContactRelation = 'neutral';
            if (escalationLevel >= 7) relation = 'war';
            else if (escalationLevel >= 5 && !(rivalry as any)?.detenteActive) relation = 'hostile';
            else if (accordTypes.includes('mutual_defense')) relation = 'ally';
            else if (escalationLevel >= 3) relation = 'tense';

            const breakaway = (breakaways || []).find(b => b.factionId === id);
            const tributeToUs = (dip.tributes || []).find(t =>
                t.status === 'active' && t.vassalId === id && t.overlordId === playerFactionId);
            const tributeFromUs = (dip.tributes || []).find(t =>
                t.status === 'active' && t.vassalId === playerFactionId && t.overlordId === id);

            let standing: ContactStanding = 'sovereign';
            let standingLabel = 'Sovereign State';
            let standingDetail: string | undefined;
            if (breakaway) {
                standing = 'breakaway';
                standingLabel = 'Breakaway State';
                standingDetail = breakaway.isOurRebel
                    ? 'Seceded from your empire'
                    : `Seceded from ${nameOf(breakaway.parentFactionId)}`;
            } else if (tributeToUs) {
                standing = 'tributary';
                standingLabel = 'Your Tributary';
                standingDetail = `Pays ${tributeToUs.amountPerTick} ${tributeToUs.resourceType}/tick`;
            } else if (tributeFromUs) {
                standing = 'overlord';
                standingLabel = 'Your Overlord';
                standingDetail = `You pay ${tributeFromUs.amountPerTick} ${tributeFromUs.resourceType}/tick`;
            }

            const pendingOffers = (dip.offers || []).filter(o => o.status === 'pending' &&
                ((o.fromFactionId === playerFactionId && o.toFactionId === id) ||
                 (o.toFactionId === playerFactionId && o.fromFactionId === id)));
            const pendingGambits = (dip.gambits || []).filter(g => g.status === 'pending' &&
                ((g.initiatorId === playerFactionId && g.targetId === id) ||
                 (g.targetId === playerFactionId && g.initiatorId === id)));

            const traits: string[] = civ?.playstyleTags?.length
                ? civ.playstyleTags.map(t => t.replace(/[_-]/g, ' '))
                : ideo ? [ideo.name] : [];

            return {
                id,
                name: rawName,
                empireName: empire,
                stewardName: steward,
                civilizationId: f.civilizationId,
                civilizationName: civ?.name ?? 'Unknown lineage',
                ideologyName: ideo?.name,
                color: factionColor(id),
                initials: initialsOf(empire),
                relation,
                relationLabel: RELATION_META[relation].label,
                relationColor: RELATION_META[relation].color,
                escalationLevel,
                escalationLabel: ESCALATION_LABELS[escalationLevel] ?? 'CALM',
                rivalryScore: rivalry ? rivalry.rivalryScore : null,
                standing,
                standingLabel,
                standingDetail,
                accords: accordTypes.map(t => TREATY_LABELS[t] ?? t),
                accordTypes,
                pendingCount: pendingOffers.length + pendingGambits.length,
                sanctionedByUs: (dip.sanctions || []).some(s => s.imposerId === playerFactionId && s.targetId === id),
                sanctioningUs: (dip.sanctions || []).some(s => s.targetId === playerFactionId && s.imposerId === id),
                traits,
                description: civ?.shortDescription ?? 'Data on this empire is restricted or unavailable.',
            };
        });
}

/** Case-insensitive match on empire, steward, lineage or relation. */
export function contactMatches(c: Contact, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [c.empireName, c.stewardName ?? '', c.civilizationName, c.relationLabel, c.standingLabel]
        .some(s => s.toLowerCase().includes(q));
}
