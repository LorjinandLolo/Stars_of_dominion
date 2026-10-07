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

// ─── Leads (item 12b-3) ──────────────────────────────────────────────────────

export type LeadKind = 'money' | 'prisoner' | 'sources' | 'sensors' | 'method' | 'operative';

export interface LeadDefinition {
    kind: LeadKind;
    label: string;
    description: string;
    /** Intel, before the counter-intelligence discount. */
    baseCost: number;
    /** Sim hours, before the counter-intelligence speed-up. */
    baseHours: number;
    /** Needs a target empire (ask our sources inside X). */
    needsTarget?: boolean;
}

export const LEADS: LeadDefinition[] = [
    { kind: 'money', label: 'Follow the money', description: 'Trace who paid for an operation of this size.', baseCost: 20, baseHours: 8 },
    { kind: 'sensors', label: 'Pull the sensor logs', description: 'Ships logged in and around the system when it happened.', baseCost: 15, baseHours: 6 },
    { kind: 'method', label: 'Check the method', description: 'Who could field what this took, as of now.', baseCost: 15, baseHours: 6 },
    { kind: 'sources', label: 'Ask our sources', description: 'Ask our people inside one empire what they heard. Needs an Embedded Network there.', baseCost: 25, baseHours: 12, needsTarget: true },
    { kind: 'prisoner', label: 'Press a prisoner', description: 'Question a prisoner again, harder. Needs a prisoner in our hands.', baseCost: 10, baseHours: 4 },
    { kind: 'operative', label: 'Trace the operative', description: 'Who trained the operative a witness saw. Needs a witness on file.', baseCost: 20, baseHours: 8 },
];

export const LEAD_BY_KIND: Record<LeadKind, LeadDefinition> =
    Object.fromEntries(LEADS.map(l => [l.kind, l])) as Record<LeadKind, LeadDefinition>;

/** Infiltration our sources need inside an empire before we can ask them (Embedded Network). */
export const SOURCES_LEAD_MIN_INFILTRATION = 35;

/** Intel a lead costs: a strong service works cheaper. Shared by worker and page. */
export function leadCost(kind: LeadKind, counterIntelStrength: number): number {
    const ci = Math.max(0, Math.min(100, counterIntelStrength));
    return Math.max(1, Math.round(LEAD_BY_KIND[kind].baseCost * (1 - ci / 200)));
}

/** Sim seconds a lead takes: a strong service works faster. */
export function leadDurationSeconds(kind: LeadKind, counterIntelStrength: number): number {
    const ci = Math.max(0, Math.min(100, counterIntelStrength));
    return Math.round((LEAD_BY_KIND[kind].baseHours * 3600) / (1 + ci / 100));
}

/** The face-of-the-operative clue on a file (worker writes it; the page and the operative lead look for it). */
export const OPERATIVE_TRACE_PREFIX = 'Witnesses at';

export function hasOperativeTrace(clues: { text: string }[]): boolean {
    return clues.some(c => c.text.startsWith(OPERATIVE_TRACE_PREFIX) && /describe the operative/.test(c.text));
}

// ─── Motives (case theories) ─────────────────────────────────────────────────

/**
 * Why an empire would do this to us, as a theory the player can name.
 * Keys: 'war', 'economic', 'opportunism', or 'grievance:<relation kind>'.
 * The worker fixes the true motive when a file opens (motiveFor in
 * case-board); the page offers these options for a suspect from the same
 * public facts, so the right answer is always among them.
 */
export interface MotiveOption { key: string; label: string }

export function motiveLabel(key: string): string {
    if (key === 'war') return 'To weaken us in the war';
    if (key === 'economic') return 'To get ahead of us economically';
    if (key === 'opportunism') return 'Opportunism: we were exposed and they took the chance';
    if (key.startsWith('grievance:')) return `Retaliation for ${relationPhrase(key.slice('grievance:'.length))}`;
    return key;
}

/** Grievances within this window count as live motives (and as grudges on file). */
/** A week of real time, in sim seconds (the sim runs 15x). */
export const MOTIVE_WINDOW_SECONDS = 7 * 86400 * 15;

export function motiveOptions(
    events: { kind: string; scoreDelta: number; atSeconds: number }[],
    atWar: boolean,
    nowSeconds: number
): MotiveOption[] {
    const keys: string[] = [];
    if (atWar) keys.push('war');
    for (const e of [...events].sort((a, b) => b.atSeconds - a.atSeconds)) {
        if (!isGrievance(e) || nowSeconds - e.atSeconds > MOTIVE_WINDOW_SECONDS) continue;
        const k = `grievance:${e.kind}`;
        if (!keys.includes(k)) keys.push(k);
    }
    keys.push('economic', 'opportunism');
    return keys.map(key => ({ key, label: motiveLabel(key) }));
}
