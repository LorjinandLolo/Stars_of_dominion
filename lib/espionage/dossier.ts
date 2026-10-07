/**
 * lib/espionage/dossier.ts
 * Shared vocabulary for suspect dossiers and the clues that feed them
 * (spec item 12b-2). Worker and page both import this, so it must stay a
 * leaf: types and plain data only, nothing that reaches lib/government (see
 * the bundle note in lib/espionage/counter-intel.ts).
 */

import { IDEOLOGIES } from '../civilization/data/ideologies';

// ─── Species ─────────────────────────────────────────────────────────────────

/**
 * A species is keyed by civilization id: every empire carries one
 * (`economy.factions[].civilizationId`, public), and a breakaway inherits its
 * parent's, which is what a species ought to do.
 *
 * Labels are written out rather than derived from the civilization registry:
 * the four founding empires borrow another civilization's modifier bundle
 * (Aurelian runs on civ-elyndra), and that civilization's name is not theirs.
 */
export const SPECIES_LABEL: Record<string, string> = {
    // The founding four, by the civilization they borrow.
    'civ-elyndra': 'Aurelian',
    'civ-velkori': 'Vektori',
    'civ-auraxian': 'Nullward',
    'civ-solari': 'Altaris',
    // Everyone else, by their own civilization.
    'civ-nexulan': 'Nexulan',
    'civ-intergalactic': 'Banking Clan',
    'civ-rhimetals': 'Rhimetal',
    'civ-gabagoon': 'Gabagoonian',
    'civ-infernoid': 'Infernoid',
    'civ-movanite': 'Movanite',
    'civ-leopantheri': 'Leo-pantheri',
    'civ-buthari': 'Buthari',
    'civ-sarrak': 'Sarrak',
    'civ-kaerruun': 'Kaer’Ruun',
    'civ-mycelari': 'Mycelari',
    'civ-nythari': 'Nythari',
    'civ-grakkar': 'Grakkar',
    'civ-xalthuun': 'Xal’thuun',
};

export function speciesLabel(civId: string | null | undefined): string {
    if (!civId) return 'unknown';
    return SPECIES_LABEL[civId] ?? civId.replace(/^civ-/, '').replace(/(^|-)([a-z])/g, (_, s, c) => `${s ? ' ' : ''}${c.toUpperCase()}`);
}

/** "a Grakkar", "an Infernoid". */
export function withArticle(label: string): string {
    return /^[aeiou]/i.test(label) ? `an ${label}` : `a ${label}`;
}

/** Is this a species key we know (a civilization id)? */
export function isKnownSpecies(civId: unknown): civId is string {
    return typeof civId === 'string' && /^civ-[a-z0-9-]+$/.test(civId);
}

type FactionLike = { civilizationId?: string | null } | undefined | null;

export function speciesOf(faction: FactionLike): string | null {
    return faction?.civilizationId ?? null;
}

/** Every empire of this species, from any id → faction lookup. */
export function empiresOfSpecies(factions: Iterable<[string, FactionLike]>, civId: string): string[] {
    const out: string[] = [];
    for (const [id, f] of factions) if (f?.civilizationId === civId) out.push(id);
    return out.sort();
}

// ─── Ideology ────────────────────────────────────────────────────────────────

export function ideologyLabel(ideologyId: string | null | undefined): string {
    if (!ideologyId) return 'unknown';
    return IDEOLOGIES.find(i => i.id === ideologyId)?.name ?? ideologyId.replace(/^ideo-/, '');
}

// ─── Relations log ───────────────────────────────────────────────────────────

/**
 * How a line of the relations log (RivalryState.recentEvents) reads in a
 * dossier or a motive clue. The log does not record who did what to whom, so
 * phrases name the incident, not the culprit.
 */
const RELATION_PHRASE: Record<string, string> = {
    sanctions_imposed: 'sanctions',
    sanctions_lifted: 'sanctions lifted',
    treaty_broken: 'a broken treaty',
    treaty_signed: 'a treaty signed',
    trade_pact_signed: 'a trade pact',
    promise_broken: 'a broken promise',
    promise_kept: 'a promise kept',
    promise_made: 'a promise made',
    spy_exposed: 'a spy scandal',
    false_accusation: 'a false accusation',
    accusation_proved: 'a proved accusation',
    accusation_baseless: 'a baseless accusation',
    accusation_admitted: 'an admitted accusation',
    interference_exposed: 'exposed interference',
    rumor_exposed: 'a rumour exposed',
    show_of_force_launched: 'a show of force',
    show_of_force_defied: 'a show of force, defied',
    show_of_force_submitted: 'a show of force, yielded to',
    ultimatum_rejected: 'a rejected ultimatum',
    ultimatum_conceded: 'an ultimatum conceded',
    ultimatum_stalled: 'a stalled ultimatum',
    tribute_accepted: 'tribute',
    offer_rejected: 'a rejected offer',
    envoy_received: 'an envoy received',
    condemned_war: 'a war condemned',
    endorsed_war: 'a war endorsed',
    recognised_breakaway: 'a breakaway recognised',
    guaranteed_breakaway: 'a breakaway guaranteed',
    refused_backed_demand: 'a refused demand',
    mercenary_contract_signed: 'a mercenary contract',
    war_declared: 'a declaration of war',
};

export function relationPhrase(kind: string): string {
    if (RELATION_PHRASE[kind]) return RELATION_PHRASE[kind];
    if (kind.startsWith('prisoners_')) return 'a prisoner dispute';
    return kind.replace(/_/g, ' ');
}

/** Events that soured things (positive delta raises rivalry). */
export function isGrievance(e: { scoreDelta: number }): boolean {
    return e.scoreDelta > 0;
}

// ─── Clue tags ───────────────────────────────────────────────────────────────

/**
 * What a clue speaks to. The grid (12b-3) and the assessment line read these.
 * `testimony` is what someone says rather than what was found.
 */
export type ClueTag = 'motive' | 'means' | 'opportunity' | 'testimony';

/**
 * One line, from what the player can see: the clues they pinned to this
 * suspect, by tag, and whether any clue clears them. Never reads hidden weights.
 */
export function assessmentLine(pinned: { tag?: ClueTag }[], cleared: boolean): string {
    const count = (t: ClueTag) => pinned.filter(c => c.tag === t).length;
    const word = (n: number) => n === 0 ? 'none established' : n === 1 ? 'one finding' : `${n} findings`;
    const parts = [
        `Motive: ${word(count('motive'))}`,
        `means: ${word(count('means'))}`,
        `opportunity: ${word(count('opportunity'))}`,
    ];
    const testimony = count('testimony');
    const tail = testimony ? ` ${testimony} witness${testimony > 1 ? 'es' : ''} name${testimony > 1 ? '' : 's'} them.` : '';
    return `${parts.join(', ')}.${tail}${cleared ? ' One finding points away from them.' : ''}`;
}
