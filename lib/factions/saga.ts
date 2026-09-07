// lib/factions/saga.ts
//
// The faction saga: everything a player's civilization is DOING and has DONE,
// as one serializable view model.
//
// Ten factions of bespoke mechanics run entirely server-side, and until this
// module none of it was visible: no surge timer, no loan book, no honour
// standing, no Bloodmoon countdown. A mechanic the player cannot see does not
// exist for them. The state was already on the client — useGameSync
// deserializes the whole session snapshot, and cleanWorldForSave deliberately
// clears neither factionTraits nor techHistory — nothing ever READ it.
//
// A pure function on GameWorldState, deliberately not a React component:
// - the probe drives it with tsx and no DOM, which is this repo's test idiom;
// - the panel stays a dumb renderer that cannot get the derivations wrong;
// - every LIVE number comes from the same reader the ENGINE uses (isDosed,
//   hiveCoherence, orderBudget…), so the panel can never disagree with the
//   worker about whether a window is open. No arithmetic is re-derived here.
//
// Top-of-stack like traits-service: imports every faction module, is imported
// only by the client and the probe. Engine services must never import it.
//
// EVERY empire has a saga, not only the ten. The founding four used to get a
// grey box saying "no bespoke mechanics"; now the model carries three things
// any faction can answer: who you are (the lobby card you chose, your ideology,
// and — for the ten — the civilization authored for you), the edge your people
// bring (the civilization/ideology modifiers, marked live or dormant by whether
// the engine actually reads them — never a number the worker would disagree
// with), and the deeds every empire accrues under the common rules
// (lib/tech/deed-metrics.ts). Bespoke statuses and records sit on top.

import type { GameWorldState } from '../game-world-state';
import { civilizationOf } from './civ-ids';
import { getMetric } from '../tech/history-ledger';
import { DEED_DEFS } from '../tech/deed-metrics';
import { CivilizationRegistry } from '../civilization/registry';
import { getCivilizationModifiers, getAuthoredBundles, UNCONSUMED_KEYS } from '../civilization/modifiers';
import { lobbyFactionById } from '../../data/factions/lobby-factions';
import combatConfig from '../combat/combat-config.json';
import {
    KAERRUUN_CIV_ID, TROPHY_METRIC, VIOLATION_METRIC,
    isInBloodmoonCeasefire, bloodmoonSecondsRemaining, getBrutalityBonus, activeContracts,
} from './kaerruun';
import { SARRAK_CIV_ID, DOSES_METRIC, CONQUEST_METRIC, isDosed, isWithdrawing } from './sarrak';
import { BUTHARI_CIV_ID, GRIEVANCE_METRIC } from './buthari';
import { COUNCIL, DEPLOY_METRIC, cooldownRemaining, type ChampionId } from './buthari-council';
import { grievanceHolders, readsGrievances, CIV_MOVANITE, CIV_LEOPANTHERI, CIV_RHIMETALS, CIV_GABAGOON, CIV_NEXULAN, CIV_BANKING } from './civ-ids';
import { DEFERRED_METRIC, FAFO_METRIC, orderBudget, isUnderFafo, movaniteState } from './movanite';
import { UNJUSTIFIED_WAR_METRIC, HONOR_LOCK_METRIC, honorStanding } from './leopantheri';
import { ReputationService } from '../reputation/reputation-service';
import { NODE_LOSS_METRIC, MEDIATION_METRIC, hiveCoherence, isHiveFrayed } from './rhimetals';
import { SURGE_METRIC, VENDETTA_METRIC, isSurgingNow, isCrashed, surgeIntensity, gabagoonState } from './gabagoon';
import { STARVATION_METRIC, starvation, biomassOf } from './nexulan';
import { CIV_INFERNOID } from './civ-ids';
import { DETONATION_METRIC, ELDER_RAISED_METRIC, ELDER_MAX_LIVING, countLivingElders } from './infernoid';
import {
    LOANS_METRIC, DEFAULTS_METRIC, FORECLOSURE_METRIC,
    bankingState, totalOutstanding, badDebtRatio,
} from './banking-clan';

/** One live gauge: a mechanic's current state, ready to render. */
export interface SagaStatus {
    /** Stable id for keys and tests. */
    id: string;
    label: string;
    /** Short state word: 'active' | 'dormant' | 'warning' — drives the colour. */
    tone: 'active' | 'dormant' | 'warning';
    /** The value, already formatted. */
    value: string;
    /** One sentence of what this means, in the faction's own voice. */
    detail: string;
}

/** One ledger line: a lifetime count with a story-shaped label. */
export interface SagaRecord {
    id: string;
    label: string;
    value: number;
}

/** Who you are: the lobby card, the ideology, and (for the ten) the civilization authored for you. */
export interface SagaIdentity {
    name: string;
    leader?: string;
    tagline?: string;
    description?: string;
    playstyle?: string;
    traits: string[];
    species?: string;
    ideology?: { name: string; description: string };
    weaknesses: string[];
    preferredVictories: string[];
}

/** One civilization/ideology modifier, as the engine sees it. */
export interface SagaEdge {
    id: string;
    label: string;
    /** Already formatted: '+15%', '-0.15/day', '+5 pts'. */
    value: string;
    /** 'active' = a consumer reads it today; 'dormant' = authored, not yet wired. */
    tone: 'active' | 'dormant';
    detail: string;
}

export interface FactionSaga {
    factionId: string;
    civilizationId?: string;
    /** False for the founding four and anyone else without bespoke mechanics. */
    hasBespokeMechanics: boolean;
    identity: SagaIdentity;
    /** The civilization's numbers — what the engine reads and what it does not yet. */
    edges: SagaEdge[];
    /** Bespoke live gauges (the ten). */
    statuses: SagaStatus[];
    /** Bespoke lifetime ledger (the ten). */
    records: SagaRecord[];
    /** Common-rules lifetime ledger — every empire. */
    deeds: SagaRecord[];
}

const TICK_SECONDS = 6 * 60 * 60;

const ticks = (seconds: number) => Math.max(0, Math.ceil(seconds / TICK_SECONDS));

/** Push a record only when it has ever happened — an all-zero ledger is noise. */
function record(out: SagaRecord[], id: string, label: string, value: number): void {
    if (value > 0) out.push({ id, label, value });
}

// ─── Identity ────────────────────────────────────────────────────────────────

/**
 * The civilizations authored FOR their faction. The founding four borrow one
 * of the eight legacy definitions for their numbers (Aurelian runs on
 * civ-elyndra's bundle), but that definition's name and lore are not theirs —
 * the lobby card is — so only these ten surface the registry's prose. A
 * breakaway state (civil-war-service copies the parent's civilizationId onto
 * a fresh faction with no lobby card) inherits the same rule: numbers yes,
 * prose no.
 */
const AUTHORED_CIV_IDS = new Set([
    'civ-kaerruun', 'civ-sarrak', 'civ-buthari', 'civ-infernoid', 'civ-movanite',
    'civ-leopantheri', 'civ-rhimetals', 'civ-gabagoon', 'civ-nexulan', 'civ-intergalactic',
]);

export function buildSagaIdentity(world: GameWorldState, factionId: string): SagaIdentity {
    const faction = world?.economy?.factions?.get?.(factionId) as { name?: string; civilizationId?: string; ideologyId?: string } | undefined;
    const lobby = lobbyFactionById(factionId);
    const civ = faction?.civilizationId ? CivilizationRegistry.getCivilization(faction.civilizationId) : undefined;
    const ideology = faction?.ideologyId ? CivilizationRegistry.getIdeology(faction.ideologyId) : undefined;
    const civIsTheirs = !!civ && AUTHORED_CIV_IDS.has(civ.id);

    const identity: SagaIdentity = {
        name: faction?.name ?? lobby?.name ?? factionId,
        traits: [],
        weaknesses: civIsTheirs ? [...(civ!.weaknesses ?? [])] : [],
        preferredVictories: civIsTheirs ? [...(civ!.preferredVictories ?? [])] : [],
    };
    if (lobby) {
        identity.leader = lobby.leader;
        identity.tagline = lobby.tagline;
        identity.description = lobby.description;
        identity.playstyle = lobby.playstyle;
        identity.traits = [...lobby.traits];
    } else if (civIsTheirs) {
        identity.tagline = civ!.shortDescription;
        identity.description = civ!.lore;
        identity.traits = [...(civ!.playstyleTags ?? [])];
    }
    if (civIsTheirs) identity.species = civ!.speciesType;
    if (ideology) identity.ideology = { name: ideology.name, description: ideology.description };
    return identity;
}

// ─── The edge ────────────────────────────────────────────────────────────────

type EdgeUnit = 'pct' | 'points' | 'pctPoints' | 'perDay';
interface EdgeDef { label: string; unit: EdgeUnit; detail: string }

/** Consumer keys (lib/tech/modifiers.ts and lib/government/modifiers.ts vocabularies) → how to read them. */
const EDGE_DEFS: Record<string, EdgeDef> = {
    'tech:eco_tax_mult': { label: 'Tax income', unit: 'pct', detail: 'Credits raised from every world you hold.' },
    'tech:eco_production_mult': { label: 'Resource output', unit: 'pct', detail: 'Raw extraction on every world.' },
    'tech:eco_manufacturing_mult': { label: 'Manufacturing', unit: 'pct', detail: 'Manufactured goods output.' },
    'tech:eco_upkeep_mult': { label: 'Upkeep', unit: 'pct', detail: 'Service upkeep — lower is cheaper.' },
    'tech:construction_speed': { label: 'Construction speed', unit: 'pct', detail: 'Buildings rise faster.' },
    'tech:research_speed': { label: 'Research speed', unit: 'pct', detail: 'Research throughput.' },
    'tech:combat_power_multiplier': { label: 'Combat power', unit: 'pct', detail: 'Every engagement, every layer.' },
    'tech:ground_power_multiplier': { label: 'Ground assault', unit: 'pct', detail: 'Ground combat only.' },
    'tech:orbital_power_multiplier': { label: 'Fleet power', unit: 'pct', detail: 'Orbital combat only.' },
    'tech:esp_op_success_add': { label: 'Covert op success', unit: 'pctPoints', detail: 'Added to every operation roll.' },
    'tech:esp_exposure_mult': { label: 'Exposure risk', unit: 'pct', detail: 'How often your operations are caught — lower is quieter.' },
    'government:approval': { label: 'Approval', unit: 'points', detail: 'Baseline approval, on the 0–100 scale.' },
    'government:legitimacy_drift': { label: 'Legitimacy', unit: 'perDay', detail: 'Legitimacy drift, per day.' },
    'government:pop_growth': { label: 'Population growth', unit: 'pct', detail: 'Every world grows faster.' },
};

/**
 * Authored and routed, but the consumer named in the registry does not read
 * the composed value: getFactionEconomyMods reads the researched bundle
 * straight off world.tech (economy-service.ts), and the research tick reads
 * only the government vocabulary (tick-processor step4). Listed here so the
 * Saga says "dormant" instead of promising income the treasury never pays.
 * Remove a key the day its consumer switches to getTechModifiers.
 */
export const DORMANT_EDGE_KEYS = new Set([
    'tech:eco_tax_mult', 'tech:eco_production_mult', 'tech:eco_manufacturing_mult', 'tech:eco_upkeep_mult',
    'tech:research_speed',
]);

/**
 * Authored keys the modifier map knowingly drops (UNCONSUMED_KEYS) — shown as
 * dormant, by name. Most are authored as fractions; diplomatic_trust_cap is a
 * point-scale cap (civ-mycelari authors -50), so it carries its own unit.
 */
const DECORATIVE_DEFS: Record<string, { label: string; unit: EdgeUnit }> = {
    diplomatic_trust_cap: { label: 'Trust ceiling', unit: 'points' },
    diplomatic_influence: { label: 'Diplomatic influence', unit: 'pct' },
    treaty_trust_gain: { label: 'Treaty trust', unit: 'pct' },
    autonomy_boost: { label: 'Autonomy', unit: 'pct' },
    leader_xp_gain: { label: 'Leader experience', unit: 'pct' },
    unit_experience_gain: { label: 'Unit veterancy', unit: 'pct' },
    manpower_upkeep: { label: 'Manpower upkeep', unit: 'pct' },
};

const DORMANT_DETAIL = 'Authored for your people; the engine does not read it yet.';

/**
 * combat-engine multiplies base power by (1 + combat_power + layer bonus) and
 * then clamps the WHOLE multiplier to ±maxVarianceCap. Three of the ten are
 * authored past that ceiling (Infernoids +55%, Sarrak +50%, Kaer'Ruun +45%),
 * so the Saga shows the number the engine lands on, and says why.
 */
const COMBAT_EDGE_KEYS = new Set(['tech:combat_power_multiplier', 'tech:ground_power_multiplier', 'tech:orbital_power_multiplier']);
export const COMBAT_POWER_CAP: number = combatConfig.constants.maxVarianceCap;

function capCombatEdge(id: string, value: number, def: EdgeDef): { value: number; detail: string } {
    if (!COMBAT_EDGE_KEYS.has(id)) return { value, detail: def.detail };
    const capPct = `±${Math.round(COMBAT_POWER_CAP * 100)}%`;
    if (Math.abs(value) <= COMBAT_POWER_CAP) {
        return { value, detail: `${def.detail} The engine caps the whole multiplier at ${capPct}.` };
    }
    const capped = Math.sign(value) * COMBAT_POWER_CAP;
    return {
        value: capped,
        detail: `Authored ${formatEdgeValue(value, def.unit)}; the engine caps the whole multiplier at ${capPct}, so this is what lands.`,
    };
}

function trimNumber(n: number): string {
    return String(Math.round(n * 100) / 100);
}

export function formatEdgeValue(value: number, unit: EdgeUnit): string {
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    const abs = Math.abs(value);
    switch (unit) {
        case 'pct': return `${sign}${Math.round(abs * 100)}%`;
        case 'pctPoints': return `${sign}${Math.round(abs * 100)} pts`;
        case 'points': return `${sign}${trimNumber(abs)} pts`;
        case 'perDay': return `${sign}${trimNumber(abs)}/day`;
    }
}

export function buildSagaEdges(world: GameWorldState, factionId: string): SagaEdge[] {
    const edges: SagaEdge[] = [];
    for (const target of ['tech', 'government'] as const) {
        const mods = getCivilizationModifiers(world, factionId, target);
        for (const key of Object.keys(mods).sort()) {
            const value = mods[key];
            if (!Number.isFinite(value) || value === 0) continue;
            const id = `${target}:${key}`;
            const def = EDGE_DEFS[id] ?? { label: key, unit: 'pct' as EdgeUnit, detail: '' };
            const dormant = DORMANT_EDGE_KEYS.has(id);
            const shown = capCombatEdge(id, value, def);
            edges.push({
                id,
                label: def.label,
                value: formatEdgeValue(shown.value, def.unit),
                tone: dormant ? 'dormant' : 'active',
                detail: dormant ? DORMANT_DETAIL : shown.detail,
            });
        }
    }
    // The decorative half: authored, mapped nowhere, still part of who you are.
    const decorative = new Map<string, number>();
    for (const bundle of getAuthoredBundles(world, factionId)) {
        for (const [key, value] of Object.entries(bundle)) {
            if (!UNCONSUMED_KEYS.has(key) || typeof value !== 'number' || !Number.isFinite(value) || value === 0) continue;
            decorative.set(key, (decorative.get(key) ?? 0) + value);
        }
    }
    for (const key of [...decorative.keys()].sort()) {
        const value = decorative.get(key)!;
        // Unknown decorative keys: anything past ±1 cannot be a fraction.
        const def = DECORATIVE_DEFS[key] ?? { label: key, unit: (Math.abs(value) > 1 ? 'points' : 'pct') as EdgeUnit };
        edges.push({
            id: `authored:${key}`,
            label: def.label,
            value: formatEdgeValue(value, def.unit),
            tone: 'dormant',
            detail: DORMANT_DETAIL,
        });
    }
    // Live first, then dormant — the player reads what counts before what waits.
    return edges.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'active' ? -1 : 1));
}

// ─── Deeds ───────────────────────────────────────────────────────────────────

/** The common-rules ledger: every counter every empire can earn, plus the tech shelf. */
export function buildSagaDeeds(world: GameWorldState, factionId: string): SagaRecord[] {
    const deeds: SagaRecord[] = [];
    for (const def of DEED_DEFS) {
        record(deeds, def.metric, def.label, getMetric(world as any, factionId, def.metric));
    }
    const techs = world?.tech?.get?.(factionId)?.unlockedTechIds?.length ?? 0;
    record(deeds, 'tech.mastered', 'Technologies mastered', techs);
    return deeds;
}

// ─── The saga ────────────────────────────────────────────────────────────────

export function buildFactionSaga(world: GameWorldState, factionId: string): FactionSaga {
    const civilizationId = civilizationOf(world, factionId);
    const statuses: SagaStatus[] = [];
    const records: SagaRecord[] = [];
    const traits = world.factionTraits?.get?.(factionId);

    // Shared: grievances, for the five civilizations that read them.
    if (readsGrievances(world, factionId)) {
        const holders = grievanceHolders(world, factionId);
        statuses.push({
            id: 'grievances',
            label: 'Grievances held',
            tone: holders.length ? 'active' : 'dormant',
            value: holders.length ? holders.join(', ') : 'none',
            detail: holders.length
                ? 'These powers have wronged you. The response is yours to choose.'
                : 'No power currently owes you an answer.',
        });
    }

    switch (civilizationId) {
        case KAERRUUN_CIV_ID: {
            const ceasefire = isInBloodmoonCeasefire(world, factionId);
            statuses.push({
                id: 'bloodmoon',
                label: 'Bloodmoon',
                tone: ceasefire ? 'warning' : 'dormant',
                value: ceasefire ? `sacred ceasefire — ${ticks(bloodmoonSecondsRemaining(world, factionId))} turns remain` : 'the hunt is open',
                detail: ceasefire
                    ? 'The rite forbids the opening of hostilities until the moon sets.'
                    : 'The next Bloodmoon will ground every offensive for its duration.',
            });
            const brutality = getBrutalityBonus(world, factionId);
            statuses.push({
                id: 'brutality',
                label: 'Ritual Brutality',
                tone: brutality > 0 ? 'active' : 'dormant',
                value: `+${Math.round(brutality * 100)}% melee`,
                detail: 'Trophies taken feed the war-trance. It saturates; it never resets.',
            });
            const contracts = activeContracts(world, factionId);
            statuses.push({
                id: 'contracts',
                label: 'Retainers',
                tone: contracts.length ? 'active' : 'dormant',
                value: contracts.length ? `${contracts.length} active` : 'none',
                detail: contracts.length ? 'Someone pays for your blades.' : 'No employer currently holds your oath.',
            });
            record(records, 'trophies', 'Trophies taken', getMetric(world as any, factionId, TROPHY_METRIC));
            record(records, 'violations', 'Bloodmoons violated', getMetric(world as any, factionId, VIOLATION_METRIC));
            break;
        }

        case SARRAK_CIV_ID: {
            const dosed = isDosed(world, factionId);
            const crashing = isWithdrawing(world, factionId);
            statuses.push({
                id: 'serum',
                label: 'Divine Serum',
                tone: dosed ? 'active' : crashing ? 'warning' : 'dormant',
                value: dosed ? 'the legions run hot' : crashing ? 'withdrawal' : 'clean',
                detail: dosed ? 'Blessed, and burning.' : crashing ? 'The blessing always collects its price.' : 'Vorr’Thul waits.',
            });
            const slaveWorlds = Object.keys(traits?.sarrak?.slaveWorlds ?? {}).length;
            statuses.push({
                id: 'slaves',
                label: 'Slave worlds',
                tone: slaveWorlds ? 'active' : 'dormant',
                value: String(slaveWorlds),
                detail: slaveWorlds ? 'Distance from the capital breeds defiance. Watch the far ones.' : 'No conquered population labours for the Legion.',
            });
            record(records, 'doses', 'Doses administered', getMetric(world as any, factionId, DOSES_METRIC));
            record(records, 'enslaved', 'Worlds enslaved', getMetric(world as any, factionId, CONQUEST_METRIC));
            break;
        }

        case BUTHARI_CIV_ID: {
            for (const champion of Object.values(COUNCIL)) {
                const remaining = cooldownRemaining(world, factionId, champion.id as ChampionId);
                statuses.push({
                    id: `council-${champion.id}`,
                    label: champion.name,
                    tone: remaining > 0 ? 'warning' : 'active',
                    value: remaining > 0 ? `in seclusion — ${ticks(remaining)} turns` : 'may be called',
                    detail: `${champion.beast}. ${champion.description}`,
                });
            }
            record(records, 'grievances', 'Wrongs recorded', getMetric(world as any, factionId, GRIEVANCE_METRIC));
            record(records, 'deployments', 'Champions called', getMetric(world as any, factionId, DEPLOY_METRIC));
            break;
        }

        case CIV_MOVANITE: {
            const fafo = isUnderFafo(world, factionId);
            const budget = orderBudget(world, factionId);
            statuses.push({
                id: 'fafo',
                label: 'FAFO Protocol',
                tone: fafo ? 'warning' : 'dormant',
                value: fafo ? 'INVOKED — the subcommittees have adjourned' : 'peace is our policy',
                detail: fafo ? 'Total retaliation is constitutionally authorised.' : 'But so is trampling.',
            });
            statuses.push({
                id: 'gridlock',
                label: 'Order throughput',
                tone: Number.isFinite(budget) ? 'dormant' : 'active',
                value: Number.isFinite(budget) ? `${budget} per turn` : 'unlimited',
                detail: Number.isFinite(budget)
                    ? `Excess orders queue for the next session. ${movaniteState(world, factionId)?.deferredLastTick || 0} held over last turn.`
                    : 'Nothing slows the stampede now.',
            });
            record(records, 'deferred', 'Orders held in committee', getMetric(world as any, factionId, DEFERRED_METRIC));
            record(records, 'fafoTicks', 'Turns under the clause', getMetric(world as any, factionId, FAFO_METRIC));
            break;
        }

        case CIV_LEOPANTHERI: {
            const honor = ReputationService.getReputation(world, factionId).scores.honor ?? 50;
            const standing = honorStanding(world, factionId);
            statuses.push({
                id: 'honor',
                label: 'Honour',
                tone: standing > 0 ? 'active' : standing < 0 ? 'warning' : 'dormant',
                value: `${Math.round(honor)} / 100`,
                detail: standing > 0
                    ? 'Your word carries. Approval, legitimacy and the temples’ research rise with it.'
                    : standing < 0
                        ? 'Broken oaths cost more than battles. The people notice.'
                        : 'Every treaty kept and promise honoured moves this.',
            });
            record(records, 'unjustified', 'Unjustified wars', getMetric(world as any, factionId, UNJUSTIFIED_WAR_METRIC));
            record(records, 'breaches', 'Dishonourable acts', getMetric(world as any, factionId, HONOR_LOCK_METRIC));
            break;
        }

        case CIV_RHIMETALS: {
            const coherence = hiveCoherence(world, factionId);
            statuses.push({
                id: 'hive',
                label: 'Hive coherence',
                tone: isHiveFrayed(world, factionId) ? 'warning' : 'active',
                value: `${Math.round(coherence * 100)}%`,
                detail: coherence >= 1
                    ? 'The node is seated. Every wing moves as one will.'
                    : coherence > 0.5
                        ? 'A new node is being established. Command efficiency is impaired.'
                        : 'The office is empty. The collective drifts.',
            });
            record(records, 'collapses', 'Nodes lost', getMetric(world as any, factionId, NODE_LOSS_METRIC));
            record(records, 'corrections', 'Wars corrected', getMetric(world as any, factionId, MEDIATION_METRIC));
            break;
        }

        case CIV_GABAGOON: {
            const surging = isSurgingNow(world, factionId);
            const crashed = isCrashed(world, factionId);
            statuses.push({
                id: 'capacola',
                label: 'Capacola',
                tone: surging ? 'active' : crashed ? 'warning' : 'dormant',
                value: surging
                    ? `SURGING — ${Math.round(surgeIntensity(world, factionId) * 100)}% of a full serving`
                    : crashed ? 'the crash' : 'the pantry waits',
                detail: surging ? 'Shimmering with oily power.' : crashed ? 'Slower, softer, and profoundly grumpy.' : 'Eat when it matters.',
            });
            const vendettas = gabagoonState(world, factionId)?.vendettas ?? 0;
            statuses.push({
                id: 'vendetta',
                label: 'The broadcast',
                tone: vendettas ? 'warning' : 'dormant',
                value: vendettas ? `${vendettas} vendetta(s) sworn` : 'unsullied',
                detail: 'Touch The Sopranos and find out.',
            });
            record(records, 'eaten', 'Capacola consumed', getMetric(world as any, factionId, SURGE_METRIC));
            record(records, 'vendettas', 'Vendettas declared', getMetric(world as any, factionId, VENDETTA_METRIC));
            break;
        }

        case CIV_INFERNOID: {
            const elders = countLivingElders(world, factionId);
            statuses.push({
                id: 'elders',
                label: 'Elder Infernoids',
                tone: elders > 0 ? 'active' : 'dormant',
                value: `${elders} of ${ELDER_MAX_LIVING} walk`,
                detail: elders > 0
                    ? 'Tripods on the field. They ignore the small arms of small peoples.'
                    : 'None currently raised. The Cinder Yards wait.',
            });
            statuses.push({
                id: 'pariah',
                label: 'Diplomatic standing',
                tone: 'warning',
                value: 'pariah',
                detail: 'Purity is flame. The rest is ash — and the galaxy knows it. Every rivalry runs hotter against you.',
            });
            record(records, 'detonations', 'Fireblood detonations', getMetric(world as any, factionId, DETONATION_METRIC));
            record(records, 'elders', 'Elders raised', getMetric(world as any, factionId, ELDER_RAISED_METRIC));
            break;
        }

        case CIV_NEXULAN: {
            const starve = starvation(world, factionId);
            statuses.push({
                id: 'cores',
                label: 'Organic cores',
                tone: starve > 0.5 ? 'warning' : starve > 0 ? 'warning' : 'active',
                value: starve > 0 ? `FAILING — ${Math.round(starve * 100)}% starved` : `fed (${Math.round(biomassOf(world, factionId))} biomass)`,
                detail: starve > 0
                    ? 'The laboratory is dying of hunger. Production, approval and calculation all degrade.'
                    : 'Nutrient paste flows. The Protocol proceeds.',
            });
            record(records, 'famine', 'Turns of core starvation', getMetric(world as any, factionId, STARVATION_METRIC));
            break;
        }

        case CIV_BANKING: {
            const outstanding = totalOutstanding(world, factionId);
            const bad = badDebtRatio(world, factionId);
            statuses.push({
                id: 'book',
                label: 'The book',
                tone: outstanding > 0 ? 'active' : 'dormant',
                value: outstanding > 0 ? `${Math.round(outstanding).toLocaleString()} outstanding` : 'no paper written',
                detail: outstanding > 0 ? 'Other people’s promises, collecting interest.' : 'Capital idle is capital wasted.',
            });
            statuses.push({
                id: 'cascade',
                label: 'Bad debt',
                tone: bad > 0 ? 'warning' : 'dormant',
                value: `${Math.round(bad * 100)}% of the book`,
                detail: bad > 0
                    ? 'Defaulted paper drags on tax and confidence. Foreclose, or absorb it.'
                    : 'Every debtor is current. The terms are being met.',
            });
            const st = bankingState(world, factionId);
            record(records, 'loans', 'Loans written', getMetric(world as any, factionId, LOANS_METRIC));
            record(records, 'defaults', 'Defaults suffered', getMetric(world as any, factionId, DEFAULTS_METRIC));
            record(records, 'foreclosures', 'Foreclosures executed', getMetric(world as any, factionId, FORECLOSURE_METRIC));
            record(records, 'collected', 'Credits collected', Math.round(st?.totalCollected ?? 0));
            break;
        }
    }

    return {
        factionId,
        civilizationId,
        hasBespokeMechanics: statuses.length > 0,
        identity: buildSagaIdentity(world, factionId),
        edges: buildSagaEdges(world, factionId),
        statuses,
        records,
        deeds: buildSagaDeeds(world, factionId),
    };
}
