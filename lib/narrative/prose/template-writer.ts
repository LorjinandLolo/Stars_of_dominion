// lib/narrative/prose/template-writer.ts — prose without a model.
//
// This is the floor the whole narrative system stands on: whatever happens to
// the LLM, the gazette still publishes. Output is deterministic (same event,
// same words) so tests can assert on it, and variety comes from hashing the
// event id into a phrasing bank rather than from randomness.
//
// It writes what it is allowed to know. An unattributed act is reported as an
// effect with no author — the same event with `attribution: 'exposed'` names
// the faction outright. That difference is the whole point of the system.

import type { NarrationRequest, NarrationResult, NarratableEvent, ProseWriter } from './prose-types';
import { humanizeTerm } from '../naming';

/** Stable index into a phrasing bank, derived from the event id. */
function pick<T>(options: T[], seed: string): T {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return options[hash % options.length];
}

function str(e: NarratableEvent, key: string, fallback = ''): string {
    const v = e.facts[key];
    return v === null || v === undefined ? fallback : String(v);
}

/** Engine enums (`shadowEconomy`, `FORTIFICATION`) must not reach print as-is. */
function term(e: NarratableEvent, key: string, fallback = ''): string {
    return humanizeTerm(str(e, key, fallback)) || fallback;
}

function num(e: NarratableEvent, key: string): number | null {
    const v = e.facts[key];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}

/** "A", "A and B", "A, B and C" — the galaxy's press writes in plain English. */
function list(names: string[], fallback = 'an unnamed power'): string {
    const clean = names.filter(Boolean);
    if (clean.length === 0) return fallback;
    if (clean.length === 1) return clean[0];
    return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

function place(e: NarratableEvent): string {
    return str(e, 'planetName') || str(e, 'systemName') || e.location || 'an undisclosed system';
}

interface Draft {
    headline: string;
    body: string;
    tone: string;
}

/**
 * Per-type prose. `actor` is already attribution-filtered: when the galaxy does
 * not know who acted, it reads as an anonymous or suspected party, and the
 * copy is written so that still forms a sentence.
 */
function draftFor(req: NarrationRequest, actor: string): Draft {
    const e = req.lead;
    const target = list(e.targetNames, 'a neighbouring power');
    const where = place(e);
    const hedge = req.speculative ? 'Unconfirmed reports claim ' : '';

    switch (e.type) {
        case 'war_declared': {
            const oathbroken = e.facts.oathbroken === true;
            return {
                headline: oathbroken
                    ? `OATHBREAKERS: ${actor} attacks ${target} through a standing pact`
                    : `${actor} declares war on ${target}`,
                body: oathbroken
                    ? `${hedge}${actor} has opened hostilities against ${target} in defiance of a non-aggression pact still in force. Diplomatic observers describe the timing as calculated; the pact's other signatories have been left to draw their own conclusions about what such promises are worth.`
                    : `${hedge}${actor} has formally declared war on ${target}. ${pick([
                        'Both capitals have begun moving fleets toward the contested frontier.',
                        'Markets across the sector opened lower on the news.',
                        'Neither government has indicated what terms, if any, would end the fighting.',
                    ], e.id)}`,
                tone: oathbroken ? 'alarmed' : 'grave',
            };
        }

        case 'war_ended':
            return {
                headline: `${list(e.actorNames)} agree terms to end the war`,
                body: `The war between ${list(e.actorNames)} has ended by negotiated settlement. ${pick([
                    'Neither side is calling it a victory, which is usually how the longer peaces begin.',
                    'The terms have not been published in full, and both governments are describing the outcome as an honourable one.',
                    'Border garrisons remain in place while the settlement is ratified.',
                ], e.id)}`,
                tone: 'neutral',
            };

        case 'treaty_broken':
            return {
                headline: `${actor} repudiates ${term(e, 'treatyType', 'treaty')} with ${target}`,
                body: `${hedge}${actor} has torn up its ${term(e, 'treatyType', 'agreement')} with ${target}. A treaty broken once is a treaty every other signatory now reads twice.`,
                tone: 'grave',
            };

        case 'capital_captured':
            return {
                headline: `THE CAPITAL FALLS: ${where} taken by ${actor}`,
                body: `${hedge}${actor} has taken ${where} from ${target}. The loss of a seat of government is not merely territorial: the machinery of an empire does not relocate quickly, and what survives of it will be governing from somewhere less comfortable.`,
                tone: 'grave',
            };

        case 'system_captured':
            return {
                headline: `${actor} takes ${where} from ${target}`,
                body: `${hedge}Control of ${where} has passed to ${actor}. ${pick([
                    'The system changed hands with its infrastructure largely intact.',
                    'Refugee traffic out of the system has been heavy since the fighting stopped.',
                    'Whether the new administration can hold it is a separate question from whether it could take it.',
                ], e.id)}`,
                tone: 'neutral',
            };

        case 'colony_founded':
            return {
                headline: `${actor} settles ${where}`,
                body: `${actor} has established a presence in ${where}, previously unclaimed. Every empire's border is someone else's frontier.`,
                tone: 'neutral',
            };

        case 'battle_resolved': {
            // Space battles share the type with ground sieges (feuds and
            // precedent are counted by type); the theatre fact tells them apart.
            if (str(e, 'theatre') === 'space') {
                const reason = str(e, 'reason');
                const winner = str(e, 'winnerName');
                const aLost = num(e, 'attackerFleetsLost') ?? 0;
                const dLost = num(e, 'defenderFleetsLost') ?? 0;
                const structures = num(e, 'structuresLost') ?? 0;
                const decisive = reason === 'destroyed' || reason === 'annihilation';
                const headline = decisive
                    ? `${where}: ${winner || actor} destroys an enemy fleet`
                    : reason === 'rout'
                        ? `${where}: ${winner || actor} drives the enemy off`
                        : winner
                            ? `Fleet action at ${where} goes to ${winner}`
                            : `Inconclusive fleet action at ${where}`;
                const losses = aLost + dLost > 0
                    ? ` ${dLost} ${dLost === 1 ? 'formation was' : 'formations were'} lost by the defenders and ${aLost} by the attackers.`
                    : ' Both fleets came away with their formations intact.';
                return {
                    headline,
                    body: `${hedge}Warships under ${actor} engaged ${target} in orbit at ${where}.${losses}${
                        structures > 0 ? ` ${structures} orbital ${structures === 1 ? 'structure was' : 'structures were'} destroyed in the exchange.` : ''
                    }`,
                    tone: decisive || reason === 'rout' ? 'grave' : 'neutral',
                };
            }
            const devastation = num(e, 'devastation');
            const cycles = num(e, 'siegeCycles');
            return {
                headline: cycles && cycles > 0
                    ? `${where} falls to ${actor} after ${cycles} ${cycles === 1 ? 'cycle' : 'cycles'} of siege`
                    : `${where} falls to ${actor}`,
                body: `${hedge}Ground forces under ${actor} have taken ${where} from ${target}.${
                    devastation && devastation > 20
                        ? ` The surface was heavily damaged in the taking; what the defenders built, the attackers broke getting to it.`
                        : ` The surface came through the fighting in better condition than expected.`
                }`,
                tone: 'grave',
            };
        }

        case 'planet_bombarded': {
            const many = req.events.length > 1;
            return {
                headline: `${where} under orbital bombardment`,
                body: `${hedge}${where} has been struck from orbit${many ? ` in ${req.events.length} separate actions` : ''}${
                    req.visibleActors.length ? ` by ${actor}` : ' by fleets that have not been identified'
                }. Local stability is reported at ${num(e, 'stabilityAfter') ?? 'a reduced level'}${
                    e.facts.orbitHeld === true ? ', with orbital defences still contesting the approach.' : ', with the orbital layer suppressed.'
                }`,
                tone: 'alarmed',
            };
        }

        case 'operation_exposed':
            return {
                headline: `EXPOSED: ${actor} caught running ${term(e, 'domain', 'covert')} operations against ${target}`,
                body: `Evidence has surfaced tying ${actor} to ${term(e, 'domain', 'clandestine')} activity inside ${target}. ${
                    e.facts.succeeded === true
                        ? 'The operation appears to have achieved its objective before it was uncovered, which will not make the diplomatic conversation easier.'
                        : 'The operation failed, and was then discovered — the worst of both outcomes for those who ordered it.'
                }`,
                tone: 'alarmed',
            };

        case 'operation_resolved':
            // Unattributed by construction: report the effect, not the hand.
            return {
                headline: req.speculative
                    ? `${target} points finger at ${actor} over ${term(e, 'domain', 'covert')} incident`
                    : `Unexplained ${term(e, 'domain', 'covert')} disruption inside ${target}`,
                body: req.speculative
                    ? `Officials in ${target} have privately named ${actor} as the source of recent ${term(e, 'domain', 'clandestine')} interference. No evidence has been produced publicly, and ${actor} has offered no comment.`
                    : `${target} is dealing with ${term(e, 'domain', 'clandestine')} disruption for which no party has been identified. Such things rarely happen by themselves, and the absence of a name is itself informative.`,
                tone: 'wry',
            };

        case 'investigation_published': {
            const evidence = num(e, 'evidence') ?? 0;
            const obstructions = num(e, 'obstructions') ?? 0;
            return {
                headline: `INVESTIGATION: ${str(e, 'subject', 'irregularities')} inside ${target}`,
                body: `A published investigation sets out ${
                    evidence >= 70 ? 'a documented case' : evidence >= 40 ? 'a substantial body of evidence' : 'a circumstantial case'
                } concerning ${str(e, 'subject', 'irregularities')} within ${target}.${
                    obstructions > 0
                        ? ` The government declined to answer questions on ${obstructions} occasion${obstructions === 1 ? '' : 's'}, which readers may weigh for themselves.`
                        : ' The government was given the opportunity to respond.'
                }`,
                tone: 'grave',
            };
        }

        case 'scandal_confirmed':
            return {
                headline: `SCANDAL: ${str(e, 'subject', 'the allegations')} confirmed in ${target}`,
                body: `The allegations concerning ${str(e, 'subject', 'the affair')} in ${target} are now established fact. What remains is the question every such confirmation raises: who knew, and how long did they expect it to hold.`,
                tone: 'grave',
            };

        case 'coup_attempted':
            return {
                headline: `Coup attempt fails in ${actor}`,
                body: `An attempt by elements of the officer corps to remove ${str(e, 'deposedLeader', 'the head of state')} has collapsed. The government survives; the question of who ordered it survives with it.`,
                tone: 'alarmed',
            };

        case 'government_changed':
            return {
                headline: `MILITARY COUP: ${str(e, 'deposedLeader', 'the head of state')} removed in ${actor}`,
                body: `The general staff has taken power in ${actor}, removing ${str(e, 'deposedLeader', 'the head of state')}. ${pick([
                    'The new administration has promised a return to civilian rule at an unspecified date.',
                    'Broadcasts from the capital have been running military bulletins on a loop since the announcement.',
                    'Foreign missions have been advised that existing agreements will be honoured, for now.',
                ], e.id)}`,
                tone: 'grave',
            };

        case 'secession_declared':
            return {
                headline: `${str(e, 'crisisName', 'Independence crisis')}: ${num(e, 'worlds') ?? 'several'} worlds demand independence from ${actor}`,
                body: `${num(e, 'worlds') ?? 'Several'} worlds have formally demanded independence from ${actor}, with support for separation measured at ${num(e, 'independenceSupport') ?? 'a substantial level'}%. The stated grievances are ${str(e, 'causes', 'long-standing')}. ${str(e, 'leaderName', 'The movement')} now speaks for the region, and the capital has a decision to make.`,
                tone: 'grave',
            };

        case 'breakaway_claimed': {
            const rebel = str(e, 'rebelName', actor);
            const parent = str(e, 'parentName', target);
            const backers = str(e, 'backers', '');
            return {
                headline: `A new hand takes ${rebel}`,
                body: `${rebel} has a new leader. The movement that broke from ${parent} with ${num(e, 'worlds') ?? 'a handful of'} world${num(e, 'worlds') === 1 ? '' : 's'} is no longer a cause in search of a captain${e.facts.comeback === true ? ' — and the captain it found has already lost an empire once, and learned from it' : ''}. ${backers ? `${backers} ${backers.includes(',') ? 'have' : 'has'} put money behind it, reportedly for the light rules a young state writes.` : 'Private capital is circling, as it does wherever the rules are still being written.'} In ${parent}, the question is no longer whether the rebellion survives the winter but which province is watching it most closely.`,
                tone: 'alarmed',
            };
        }

        case 'civil_war_started':
            return {
                headline: `THE EMPIRE SPLITS: ${str(e, 'rebelName', 'a breakaway state')} declares independence from ${target}`,
                body: `${str(e, 'rebelName', 'A breakaway administration')} has broken from ${target}, taking ${num(e, 'planetsTaken') ?? 'several'} worlds and ${num(e, 'fleetsDefected') ?? 'a number of'} fleets with it. Civil wars are not fought over borders but over legitimacy, and both capitals now claim it.`,
                tone: 'grave',
            };

        case 'leader_died': {
            const years = num(e, 'yearsInOffice');
            const cause = str(e, 'cause', 'departure');
            const died = cause === 'death' || cause === 'illness';

            // An obituary is a career, not a bulletin. When the chronicle can
            // supply what the empire did on their watch, the record speaks;
            // otherwise it falls back to the honest admission that it cannot.
            const career = req.career ?? [];
            const record = career.length
                ? ` Their tenure covered ${career.slice(0, 3).join('; ')}.`
                : ' The record of their tenure is thinner than their supporters would like.';

            // Emission sites vary: some carry a bare surname, some a name that
            // already includes the title. Printing "Chancellor Chancellor Vex"
            // is the kind of detail that makes a paper look automated.
            const title = str(e, 'title', 'The head of state');
            const leaderName = str(e, 'leaderName', '');
            const fullName = leaderName.toLowerCase().startsWith(title.toLowerCase())
                ? leaderName
                : `${title} ${leaderName}`.trim();

            return {
                headline: `${fullName} ${died ? 'is dead' : 'steps down'}`.replace(/\s+/g, ' '),
                body: `${str(e, 'leaderName', 'The head of state')} of ${actor} has ${
                    cause === 'death' ? 'died in office'
                        : cause === 'illness' ? 'been lost to illness'
                            : 'retired from office'
                }${years !== null ? ` after ${years} years` : ''}.${record} ${pick([
                    'The assessments being written now will be rewritten within the decade, as they always are.',
                    'What the administration built and what it cost are already being argued over.',
                    'State broadcasts have suspended regular programming.',
                ], e.id)}`,
                tone: 'grave',
            };
        }

        case 'leader_rose':
            return {
                headline: `${str(e, 'title', 'A new head of state')} ${str(e, 'leaderName', '')} takes office in ${actor}`.replace(/\s+/g, ' '),
                body: `${str(e, 'leaderName', 'A new head of state')} has succeeded ${str(e, 'predecessor', 'the previous administration')} as ${str(e, 'title', 'head of state')} of ${actor}. ${pick([
                    'The new administration inherits its predecessor\'s commitments and, for the moment, its enemies.',
                    'Early signals suggest continuity rather than reversal.',
                    'Foreign governments have sent the customary greetings and are waiting to see what changes.',
                ], e.id)}`,
                tone: 'neutral',
            };

        // ── Charter corporations ─────────────────────────────────────────────
        // The actor is the chartering government; the company is a fact.

        case 'charter_granted': {
            const company = str(e, 'companyName', 'a new company');
            return {
                headline: `${actor} charters ${company}`,
                body: `${actor} has granted a charter to ${company}, licensed for ${term(e, 'mission', 'trade')} in ${term(e, 'territory', 'domestic')} space with ${num(e, 'rights') ?? 'several'} enumerated rights. The government keeps ${num(e, 'stateStake') ?? 'a'}% of the stock. ${pick([
                    'Charters are written by governments and read, later, by boards.',
                    'The ministry describes the company as an instrument of policy. Most of them start that way.',
                    'Subscription was reported as orderly.',
                ], e.id)}`,
                tone: 'neutral',
            };
        }

        case 'charter_revoked': {
            const company = str(e, 'companyName', 'a chartered company');
            if (e.facts.lapsed === true) {
                return {
                    headline: `${actor} lets the charter of ${company} lapse`,
                    body: `${actor} has declined to renew the charter of ${company}. The company has been wound up and its shareholders paid what the works fetched. It is the quiet way to end a company, available only to a government that acts before the company is strong enough to object.`,
                    tone: 'neutral',
                };
            }
            return {
                headline: `${actor} revokes the charter of ${company}`,
                body: `${hedge}${actor} has withdrawn the charter of ${company}. The company's works do not vanish with its licence, and neither do the people who were running them; what the state has cancelled is the paper.`,
                tone: 'grave',
            };
        }

        case 'company_nationalized': {
            const company = str(e, 'companyName', 'a chartered company');
            const paid = num(e, 'compensation');
            return {
                headline: `${actor} nationalises ${company}`,
                body: `${hedge}${actor} has taken ${company} into state ownership${
                    paid && paid > 0 ? `, paying out ${paid.toLocaleString()} credits to the outside shareholders` : ''
                }.${e.facts.wasRogue === true ? ' The company had already repudiated its charter; the seizure ends that argument by ending the company.' : ''} ${pick([
                    'Investors in every other charter the government has written will have noticed.',
                    'The board has been dismissed and the ledgers moved to the ministry.',
                    'It is the cleanest way to win an argument with a company, and the most expensive.',
                ], e.id)}`,
                tone: 'grave',
            };
        }

        case 'company_went_rogue': {
            const company = str(e, 'companyName', 'A chartered company');
            return {
                headline: `${company} repudiates its charter from ${actor}`,
                body: `${company} has stopped remitting to ${actor} and no longer answers to the ministry that created it. It holds ${num(e, 'assets') ?? 'a number of'} works across ${num(e, 'systems') ?? 'several'} systems${
                    e.facts.armed === true ? ' and keeps its own ships' : ''
                }. The government has a short time to bring it to heel before the board decides what it is instead.`,
                tone: 'alarmed',
            };
        }

        case 'company_broke_away': {
            const company = str(e, 'companyName', 'A chartered company');
            const worlds = num(e, 'worldsSeceding') ?? 0;
            const fleets = num(e, 'fleetsDefected') ?? 0;
            const patron = e.targetNames[0];
            const parts: string[] = [];
            if (worlds > 0) parts.push(`${worlds} company ${worlds === 1 ? 'world has' : 'worlds have'} declared for the board rather than the capital`);
            if (fleets > 0) parts.push(`${fleets} of its armed ${fleets === 1 ? 'squadron has' : 'squadrons have'} gone raiding under a new flag`);
            if (patron) parts.push(`the charter itself has been placed under the protection of ${patron}`);
            // Bought out through the share register: no revolt, just a majority.
            if (e.facts.byTakeover === true && patron) {
                return {
                    headline: `${patron} buys ${company} out from under ${actor}`,
                    body: `${patron} has moved the charter of ${company} to its own government, having first bought a majority of its stock. No law was broken: the shares were for sale. What ${actor} wrote into that charter, and built with it, now remits to a foreign treasury.`,
                    tone: 'grave',
                };
            }
            return {
                headline: patron
                    ? `${company} defects from ${actor} to ${patron}`
                    : worlds > 0
                        ? `${company} takes ${worlds} ${worlds === 1 ? 'world' : 'worlds'} out of ${actor}`
                        : `${company} breaks with ${actor}`,
                body: `The break between ${actor} and ${company} is now complete: ${
                    parts.length ? list(parts) : 'its capital has left the jurisdiction and its officers with it'
                }. Every clause that made this possible was written, and paid for, by the government it has just been used against.`,
                tone: 'grave',
            };
        }

        case 'company_acquired': {
            const bought = str(e, 'companyName', 'a rival');
            const buyer = str(e, 'buyerName', 'a larger company');
            const price = num(e, 'price');
            const crossBorder = e.targetNames.length > 0 && e.targetNames[0] !== e.actorNames[0];
            return {
                headline: `${buyer} buys out ${bought}`,
                body: `${buyer} has acquired ${bought}${price ? ` for ${price.toLocaleString()} credits` : ''}, taking its works, its monopolies and its debts.${
                    crossBorder ? ` The purchase moves a company chartered by ${target} into the hands of one chartered by ${actor}.` : ''
                } ${pick([
                    'The galaxy has one fewer company and one larger one.',
                    'Nobody planned a market of three or four very large firms. It is simply where this leads.',
                ], e.id)}`,
                tone: 'neutral',
            };
        }

        case 'corporate_crisis': {
            const company = str(e, 'companyName', 'a chartered company');
            return {
                headline: `${str(e, 'headline', 'Trouble at a chartered company')} — ${company}`,
                body: `${str(e, 'description', `${company} is in difficulty.`)} The matter now sits with ${actor}, which wrote the charter and owns the consequences.`,
                tone: 'alarmed',
            };
        }

        case 'megaproject_completed': {
            const company = str(e, 'companyName', 'a chartered company');
            const project = str(e, 'projectName', 'a major work');
            return {
                headline: `${project} completed by ${company}`,
                body: `${company} has finished the ${project}, underwritten in part by ${actor}. ${str(e, 'benefit')} It is built on corporate paper and answers to a board.`.replace(/\s+/g, ' '),
                tone: 'neutral',
            };
        }

        default:
            return {
                headline: `${actor}: ${e.type.replace(/_/g, ' ')} reported${where ? ` at ${where}` : ''}`,
                body: `${hedge}Reports describe ${e.type.replace(/_/g, ' ')} involving ${actor}${
                    e.targetNames.length ? ` and ${target}` : ''
                }${where ? ` at ${where}` : ''}. Details remain thin.`,
                tone: 'neutral',
            };
    }
}

/**
 * The continuity paragraph — what turns a report into history.
 *
 * Written from derived memory (lib/narrative/memory-service.ts): an active feud
 * gives the story a name and a count, prior coverage gives it a callback, and a
 * galactic first says so outright. Absent history, this returns nothing and the
 * article simply reads as news, which is correct for a young galaxy.
 */
function continuity(request: NarrationRequest): string {
    const { memory } = request;
    const parts: string[] = [];

    if (memory.feud && memory.feud.status === 'active' && memory.feud.eventCount >= 3) {
        parts.push(
            `This is the ${ordinal(memory.feud.eventCount)} such incident between the two powers, ` +
            `in what observers now call ${memory.feud.epithet}.`,
        );
    } else if (memory.feud && memory.feud.status === 'dormant') {
        parts.push(`It revives ${memory.feud.epithet}, quiet since tick ${memory.feud.startedTick}.`);
    }

    if (memory.isReversal) {
        parts.push('The same ground has changed hands before, and the record suggests it will again.');
    }

    if (memory.isGalacticFirst) {
        parts.push('Nothing of the kind has been recorded in this galaxy until now.');
    }

    if (memory.precedents.length) {
        const cited = memory.precedents.slice(0, 2).map(p => `"${p.headline}"`).join(' and ');
        parts.push(`Readers may recall ${cited}.`);
    }

    return parts.join(' ');
}

function ordinal(n: number): string {
    const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th'
        : n % 10 === 1 ? 'st'
            : n % 10 === 2 ? 'nd'
                : n % 10 === 3 ? 'rd' : 'th';
    return `${n}${suffix}`;
}

/**
 * The outlet's fingerprint on the copy.
 *
 * The template writer cannot restructure a story the way a model can, so voice
 * is expressed where it is cheapest and most legible: a closing line in the
 * outlet's register. State media contextualises, the pirate press insinuates,
 * the wire notes what it could not confirm.
 */
function voiceLine(request: NarrationRequest): string {
    const { stance, speculative, visibleActors } = request;

    if (stance.publisher.type === 'PIRATE_PRESS') {
        if (visibleActors.length === 0) {
            return 'Free Signal notes that events of this kind rarely lack an author, whatever the official channels are saying.';
        }
        return 'Free Signal reminds subscribers that every government tells this story to its own advantage.';
    }

    if (stance.publisher.type === 'STATE_MEDIA') {
        if (stance.slant === 'friendly') {
            return `${stance.publisher.masthead} describes the outcome as consistent with long-standing policy.`;
        }
        if (stance.coveringOwnEmpire) {
            return `${stance.publisher.masthead} states that the administration is responding and that there is no cause for alarm.`;
        }
        return `${stance.publisher.masthead} has called for an international response.`;
    }

    if (speculative) {
        return 'The Galactic Wire has been unable to independently verify the accusation.';
    }
    return '';
}

export class TemplateWriter implements ProseWriter {
    async write(request: NarrationRequest): Promise<NarrationResult> {
        // The subject of the sentence is whoever the galaxy is allowed to name.
        const actor = request.visibleActors.length
            ? list(request.visibleActors)
            : 'an unidentified party';

        const { headline, body, tone } = draftFor(request, actor);

        // The lede is the front page's one line: the first sentence of the body,
        // which the drafts above are written to make self-contained. Taken
        // before continuity is appended, so the front page stays about the news.
        const firstSentence = body.split(/(?<=[.!?])\s/)[0] ?? body;

        // Continuity first (what history says), then the outlet's own line.
        const tail = [continuity(request), voiceLine(request)].filter(Boolean).join(' ');
        const fullBody = tail ? `${body}\n\n${tail}` : body;

        return {
            headline: headline.trim(),
            body: fullBody.trim(),
            lede: firstSentence.trim(),
            tone,
            provider: 'template',
        };
    }
}
