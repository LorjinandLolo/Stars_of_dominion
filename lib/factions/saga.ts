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

import type { GameWorldState } from '../game-world-state';
import { civilizationOf } from './civ-ids';
import { getMetric } from '../tech/history-ledger';
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

export interface FactionSaga {
    factionId: string;
    civilizationId?: string;
    /** False for the founding four and anyone else without bespoke mechanics. */
    hasBespokeMechanics: boolean;
    statuses: SagaStatus[];
    records: SagaRecord[];
}

const TICK_SECONDS = 6 * 60 * 60;

const ticks = (seconds: number) => Math.max(0, Math.ceil(seconds / TICK_SECONDS));

/** Push a record only when it has ever happened — an all-zero ledger is noise. */
function record(out: SagaRecord[], id: string, label: string, value: number): void {
    if (value > 0) out.push({ id, label, value });
}

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
        statuses,
        records,
    };
}
