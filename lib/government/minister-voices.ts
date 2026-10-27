// lib/government/minister-voices.ts
// Stars of Dominion — how a minister talks.
//
// Names are generated, so the personality lives in the office: whoever holds
// Defence talks like the Admiralty. Each portfolio has lines per HOOK (what
// just happened or is being proposed) in four REGISTERS picked from the
// minister's own numbers — loyal, cooling, Brutus (disloyal or plotting),
// venal (corrupt, any loyalty). The full sheet with personas and voice rules
// is docs/writing/character-lines.md; this file is the subset that has a
// code hook today. Pure and client-safe: callers pass the minister and a
// seed, nothing here reads the world.
//
// Consumers: generateCabinetAdvice (the cabinet debate card), the advisor
// desk (proposal detail in the brief), the brief's advisor ledger (what the
// minister says when you answered or did not).

import type { CabinetPortfolio } from './types';
import castData from '../../data/leaders/cabinet-cast.json';

export type Register = 'loyal' | 'cooling' | 'brutus' | 'venal';

/** Loyalty below this reads as Brutus; from here to LOYAL_FROM as cooling. */
export const BRUTUS_BELOW = 35;
export const LOYAL_FROM = 60;
/** Corruption from here reads as venal, whatever the loyalty. */
export const VENAL_FROM = 50;

export interface MinisterLike {
    name: string;
    loyalty?: number;
    corruption?: number;
    ambitionDrive?: number;
    /** A written character (lib/leadership/cast.ts): their own lines are tried first. */
    characterId?: string;
}

/** The register a minister speaks in; `plotting` forces Brutus. */
export function registerOf(m: MinisterLike | undefined, plotting = false): Register {
    if (!m) return 'loyal';
    if ((m.corruption ?? 0) >= VENAL_FROM) return 'venal';
    if (plotting || (m.loyalty ?? 50) < BRUTUS_BELOW) return 'brutus';
    if ((m.loyalty ?? 50) < LOYAL_FROM) return 'cooling';
    return 'loyal';
}

export type Hook =
    | 'appointed' | 'idle_peace' | 'idle_war' | 'routine'
    | 'war_proposal' | 'battle_group' | 'peace_proposal'
    | 'battle_won' | 'battle_lost' | 'fleet_destroyed' | 'siege_defending' | 'siege_attacking' | 'capital_captured'
    | 'dismissed' | 'resigned' | 'lapsed' | 'declined' | 'approved'
    | 'overextended' | 'reserves_low' | 'loan' | 'sanctions_on_us' | 'sanctions_by_us' | 'subsidy' | 'strike'
    | 'research_choice' | 'rival_transcending' | 'our_transcending' | 'tech_gate' | 'lab_accident' | 'ruins'
    | 'op_exposed_ours' | 'op_exposed_theirs' | 'agent_captured' | 'loyalty_report' | 'foreign_tie' | 'crackdown' | 'crisis_window' | 'case_opened' | 'networks_inside'
    | 'approval_falling' | 'cohesion_falling' | 'secession' | 'press_campaign' | 'riot'
    | 'offer_accept' | 'offer_refuse' | 'envoy' | 'treaty_signed' | 'treaty_broken_them' | 'treaty_broken_us' | 'breakaway' | 'gambit'
    | 'morning' | 'seat_silent';

type Lines = Partial<Record<Register, string[]>>;
type Sheet = Partial<Record<Hook, Lines>>;

const L = (loyal: string[], cooling: string[] = [], brutus: string[] = [], venal: string[] = []): Lines => ({ loyal, cooling, brutus, venal });

export const MINISTER_LINES: Record<CabinetPortfolio, Sheet> = {
    defence: {
        appointed: L(
            ['The fleet is yours. Tell it where to go and it goes. Tell it twice and it stops listening.'],
            ['I took the chair because the last admiral left it empty. Not because I was asked nicely.'],
            ['An honour. I have wanted this chair since before you had yours.'],
            ['Delighted. My first act is a review of procurement. My second is dinner with the people who win it.']),
        war_proposal: L(
            ['{target} has thinned their border fleets. We will not get a cheaper war than this one.', 'Three systems, forty days, one fleet. I have done the sums twice. Say yes before they do them.'],
            ['I can give you {target} if you give me the ships. I have asked twice. This is the third.', 'War with {target} was a good idea a season ago. It is an adequate idea now.'],
            ['The fleet is ready for {target}. It would be ready for anything, frankly.', 'Give me the war and I give you the victory. Who the parades are for, we settle later.'],
            ['A war with {target} would be good for the yards. Several yards. I know the owners.', '{target}\'s convoys carry things worth taking. I have a list. The list is not in the proposal.']),
        battle_group: L(
            ['Three cruisers and a screen. Approve it tonight and they sail before the storm.', 'I am asking for hulls, not for permission to lose. Give me the first and you will not need the second.'],
            ['I will not send men into the guns with what we have. Sign the order or find another admiral.', 'This is the same battle group I asked for in spring. The price went up. So did the need.'],
            ['A battle group under my flag, answering to me in the field. You would not want to micromanage a war.', 'Ships loyal to their admiral fight better. Ships loyal to a court fight for a court. Let me have the first kind.'],
            ['The hulls should come from Harrow Yards. Their quote is higher. Their captains are loyal to me.', 'Six hulls on the order. Five will arrive. The sixth is a long story.']),
        peace_proposal: L(
            ['We have taken what the fleet can hold. Past this line we are garrisoning dust. Make peace while it looks like strength.'],
            ['I did not ask for this war and I will not be blamed for its length. End it.'],
            ['Peace now. The fleet needs to come home. It has things to do at home.']),
        battle_won: L(
            ['{target} lost the field. We lost two frigates and a good captain. Press on; they rebuild slower than we do.', 'A clean win. Do not say so in public; the next one will not be, and they will remember you said it.'],
            ['We won. I will not pretend the cabinet helped.'],
            ['The fleet won. The fleet knows who led it. So does the gazette.'],
            ['Victory. The salvage rights are being handled. By me.']),
        battle_lost: L(
            ['We lost the field. I take it. Tell me whether you want the fleet rebuilt or the war ended and I will do either.', 'They had the better position. Next time I pick the ground, not the Foreign Office.'],
            ['I warned the cabinet about {target}\'s torpedo boats. The minutes will show it.', 'A defeat. A predictable one. I predicted it.'],
            ['A defeat like this makes people ask who is really in charge. I have been asked. I have not answered yet.', 'The captains blame the court for the orders. I have not corrected them.'],
            ['The ships were underpowered. The refit money went somewhere. I will look into where.', 'We lost. The insurers will want a report. I have already written most of it.']),
        fleet_destroyed: L(
            ['The Third is gone. All of it. I knew every captain. Give me a season and I give you a Fourth.'],
            ['A fleet is gone because it was sent where I said not to send it. I will say that once.'],
            ['A whole fleet lost under this government. The other fleets are talking. I listen.']),
        siege_defending: L(
            ['They have landed on {world}. The garrison is dug in and the shield is up. Give me the orbit back and they will starve.'],
            ['If you had let me station the second fleet at {world}, we would not be reading this.'],
            ['{world} will hold or it will not. Either way the army will remember who was on the ground and who was in a palace.'],
            ['{world} is under siege. The relief convoy is ready. The relief convoy\'s fee is also ready.']),
        siege_attacking: L(
            ['We are on the ground at {world}. Keep the orbit and the shield comes down in weeks. Lose it and I lose the army.'],
            ['The landing went in. Now the part where the cabinet gets impatient.'],
            ['The army is on {world}, and the army is mine to command. Remember that when you count what is yours.']),
        capital_captured: L(
            ['The capital is theirs. The fleet is not. We fight from the next world and the one after that.'],
            ['The capital fell. I said a year ago it would. I was told to stop saying it.'],
            ['The capital is gone. Someone must hold what is left together. The fleet has a candidate.']),
        dismissed: L(
            ['Understood. The duty rosters are on your desk. Do not let them put a politician in this chair.', 'You need someone to blame and I am the only one in uniform. Fine. The fleet is still good.'],
            ['So it was my fault. Very well. Remember who signed the deployment order.'],
            ['You can take the chair. The captains know whose orders they trusted.'],
            ['I expect the pension is still in order. I expect that very much.']),
        resigned: L(
            ['I have served three governments. I will not serve this one further. The fleet is in good hands; they are not yours.'],
            [], ['I resign. The fleet does not.']),
        idle_peace: L(
            ['Quiet border. I am drilling the reserves anyway. Quiet is when they come.', 'No war this month. I have written the plan for the next one. Read it when you are bored.'],
            ['A peacetime navy rusts. So does a peacetime admiral.'],
            ['The fleet exercises near the capital this season. For the look of it.'],
            ['The fleet is at readiness. The readiness reports cost extra this quarter.']),
        idle_war: L(
            ['Nothing moved today. Good. Nothing moving means they are as tired as we are.'],
            ['Another day of holding. Holding is what you do when the cabinet cannot choose.'],
            ['The war drags. The captains ask me when it ends. I tell them that is not my decision. Yet.'],
            ['The war continues. So do the contracts.']),
        approved: L(['Approved. The fleet moves tonight.'], ['Approved. Late, but approved.'], ['Approved. The fleet will remember who asked.'], ['Approved. The invoices follow.']),
        declined: L(['Declined. The fleet stands where it is. I will not ask again until the ground changes.'], ['Declined. I will put it in writing so the record has it.'], ['Declined. The captains will hear it was declined.'], ['Declined. A pity for the yards.']),
        lapsed: L(['The proposal lapsed. I will raise it again when it is twice as urgent and half as cheap.'], ['No answer. I have started to assume that is the answer.'], ['Unanswered. A government that does not answer invites someone who will.'], ['Unanswered. The yards are patient. Their lawyers are not.']),
        morning: L(['Nothing burned overnight. I checked.']),
    },
    economy: {
        appointed: L(
            ['I have read the books. All of them. I will need a week and a quiet room before I say anything hopeful.'],
            ['I accepted because the alternative was watching someone else do it worse.'],
            ['The Treasury is the one office that knows what everything costs. Including loyalty.'],
            ['An honour. The first audit will take some time. The first audit is of the previous audit.']),
        routine: L(
            ['The books balance. Barely. Do not start anything expensive this month.', 'Revenue up two percent. Upkeep up three. I call that a trend and you call it a Tuesday.'],
            ['I keep finding orders I was not told about. It makes a budget hard to defend.', 'We are solvent. I am not sure for how long, and I am not sure anyone else is asking.'],
            ['The ledger says what it says. Some of what it says, I keep to myself.'],
            ['Receipts are in order. Some of the order is mine.']),
        overextended: L(
            ['We govern more worlds than we can count. Either we build the offices or we stop taking planets.', 'Every new world costs a clerk. We are out of clerks. We are not out of worlds.'],
            ['Every new world is another ledger nobody reads. I have stopped pretending I read them.'],
            ['An empire this size needs more hands at the top. I have been told I have good hands.'],
            ['Overextension means contracts. Administration contracts. I have a cousin.']),
        reserves_low: L(
            ['Three weeks of credits at this rate. I am not alarmed. I am telling you in the voice I use when I am alarmed.'],
            ['The reserve is thin because the fleet is fat. Choose.'],
            ['The reserve is low. People notice. People ask who could manage it better.'],
            ['The reserve is low. A short loan would cover it. I know a lender. They know me.']),
        loan: L(
            ['The Clan\'s terms are fair for now and ruinous later. Take it only if the war is short.'],
            ['Borrow if you must. Do not tell me it is temporary. Nothing in this office is temporary.'],
            [], ['The Clan is offering generous terms. Very generous. I negotiated them personally.']),
        sanctions_on_us: L(
            ['{target} has closed their markets. We will feel it in two months. We will survive it in six.'],
            ['Sanctions. Again. I did say the envoy was a mistake.'],
            ['Sanctions from {target}. The merchants ask me who will fix this. I tell them it is not my chair. Yet.']),
        sanctions_by_us: L(
            ['Sanctions hurt us too. I assume you know that and want it anyway.'],
            ['Fine. I will cut the trade figures from the next report so nobody has to look at them.'],
            [], ['Sanctions on {target}. There will be smugglers. I have already met some.']),
        subsidy: L(
            ['Subsidise the company if you like. Just know it will never again run without one.'],
            ['Another subsidy. I will find the money. I always find the money. That is the problem.'],
            [], ['The company\'s directors are grateful for the policy. They have said so in writing. On a cheque.']),
        strike: L(
            ['The crews want pay. Pay is cheaper than a month of nothing out of the ground. Pay them.'],
            ['They struck because wages lag prices. I put that in a memo. The memo was filed.']),
        peace_proposal: L(['The war costs a world\'s output a month. Peace costs pride. I know which the Treasury can afford.']),
        dismissed: L(
            ['Fair enough. The drawer on the left has the real numbers. Nobody else has seen them.'],
            ['You will want to replace me with someone who says yes. Make sure they can count.'],
            ['Take the office. The ledgers I keep are not in it.'],
            ['Understood. Some files will take a few days to find. They are being found now.']),
        resigned: L(['I cannot sign a budget I know is a lie. Someone else will. I wish them luck with the appendices.'], [], [], ['I am resigning for family reasons. The family has grown considerably.']),
        approved: L(['Approved. I have moved the money. Do not ask from where.'], ['Approved. I will find it. I always find it.'], ['Approved. Noted in a ledger of my own.'], ['Approved. The fees are modest.']),
        declined: L(['Declined. The money stays where it is, which is nowhere much.'], ['Declined. I will stop costing it, then.'], ['Declined. The merchants will ask me why. I will say I do not know.'], ['Declined. My cousin will be disappointed.']),
        lapsed: L(['The proposal lapsed. The cost did not.'], ['No answer. I have budgeted for no answer.'], ['Unanswered. Money does not wait for governments.'], ['Unanswered. The interest, however, accrued.']),
        morning: L(['Morning. The numbers did not improve while you slept. They rarely do.']),
    },
    science: {
        appointed: L(
            ['Thank you. I will try to come to cabinet. Somebody remind me which day it is.'],
            ['I accepted on the condition that the programme is not cut. I was told yes. I have been told yes before.'],
            ['Interesting. A minister of science can see every file. I did not know that when I said yes. I know it now.'],
            ['An honour. Patents, of course, remain with the inventor. I have several.']),
        routine: L(
            ['The current programme finishes in a season. I would like a word about the one after. Several words.', 'Progress is steady. Steady is good. Steady is also boring. I have a proposal for less steady.'],
            ['My budget was cut to pay for hulls. The hulls are made of my budget\'s ideas.', 'The Academy continues. Mostly out of habit.'],
            ['Knowledge should not wait on one person\'s signature. Some of the faculty agree. Loudly.'],
            ['Research proceeds. Some of it on behalf of private clients. The clients are discreet.']),
        research_choice: L(
            ['Fund the drive work. It is unglamorous and it will matter in three years when nothing else will.', 'The weapons line is quicker. The theory line is better. You will pick the weapons line. Everyone does.'],
            ['Pick whatever you like. I will tell the faculty it was a strategic decision.'],
            ['Fund what I ask for and you will not have to understand it. Most rulers prefer that.']),
        rival_transcending: L(
            ['{target} is reaching for Enlightenment. If they get there, nothing we build will matter. Stop them or race them.', 'Interesting. {target} skipped two steps I thought were necessary. I would like to know how. Preferably before they finish.'],
            ['{target} is ahead because they funded this a decade ago. I have the memo I sent a decade ago.'],
            [], ['{target}\'s programme is ahead of ours. Their lead scientist is for sale. So, in a sense, am I.']),
        our_transcending: L(
            ['We are close. The whole galaxy will try to stop us now. Hold the line a little longer and I will show you something nobody has seen.'],
            ['We may make it. I would enjoy that more if the cabinet understood what \'it\' is.'],
            ['When we cross, someone will be remembered for it. I would like it to be the right someone.']),
        tech_gate: L(['You cannot do that yet. Give the Academy a season on it and you can.'], ['You asked for something we have not invented. I did suggest funding it. In writing. Twice.']),
        lab_accident: L(['There was an explosion. Minor. Informative. Nobody important was hurt, and I am sorry about the unimportant ones.'], [], [], ['A containment failure. The equipment was second-hand. The invoice said new.']),
        ruins: L(['The notes from the ruins are older than our calendar. Let me have them before anyone sells them.', 'Worked stone on {world}. Nobody we know made it. I would like to go myself. I am told ministers do not go. I am asking anyway.'], [], [], ['Fascinating artefacts. I have appraised them. Privately.']),
        battle_won: L(['I am told we won. Good. Can the fleet spare a ship to move the telescope?'], ['A battle. Yes. Was there something scientific about it?']),
        battle_lost: L(['I am told we lost. I am sorry. Is the observatory still ours?'], ['A battle. Yes. Was there something scientific about it?']),
        dismissed: L(['Oh. Well. The programme is in the blue folder. Please do not cut the drive work. Please.'], ['Dismissed. I will go back to the laboratory. It missed me. The cabinet will not.'], ['Dismissed. The faculty will want to know why. So, in time, will you.'], ['Fine. The patents go with me. That was always the arrangement.']),
        resigned: L(['I am a scientist in a government that has stopped reading. I will read somewhere else.']),
        approved: L(['Approved. I will start before you change your mind.'], ['Approved. I had stopped expecting it.'], ['Approved. The faculty will note who signed.'], ['Approved. The equipment supplier is a friend.']),
        declined: L(['Declined. I will keep the proposal. Ideas keep better than governments.'], ['Declined. Of course.'], ['Declined. Interesting. The faculty will find that interesting too.'], ['Declined. The private clients will not be.']),
        lapsed: L(['The proposal lapsed. I nearly did not notice. I have been in the lab.'], ['No answer. Science is used to that.'], ['Unanswered. The faculty draws its own conclusions. It is good at that.'], ['Unanswered. The supplier charged a holding fee.']),
        morning: L(['Good morning. Is it morning? I have been in the lab.']),
    },
    intelligence: {
        appointed: L(
            ['I read the previous minister\'s files last night. All of them. We should talk about the Foreign Office.'],
            ['I accepted. The Desk works for the state. The state is, for now, you.'],
            ['Thank you. I will keep the files on everyone. That has always included the ruler.'],
            ['An honour. Information has a price. I know what it is to the nearest credit.']),
        routine: L(
            ['Nothing to report. That is a report. Someone is paying for silence.', 'Two networks found, one left running. It is more useful alive. Do not ask which.'],
            ['I would tell you more if the cabinet leaked less.', 'The Desk is understaffed. I have said so. The file is thick with my saying so.'],
            ['I know everything that happens in this government. Including the things about you.'],
            ['The reports are complete. Some reports are more complete than the version you receive.']),
        networks_inside: L(
            ['Foreign networks are inside our institutions. I need authority to sweep. Tonight, not after cabinet.'],
            ['Foreign networks inside the ministries. Found late. We are understaffed, as I keep saying.'],
            ['Foreign networks inside the court. They had friends here. Some are still friends.'],
            ['Foreign networks. Several. One has made an offer. I am considering the counter-offer.']),
        op_exposed_ours: L(
            ['They caught our hand in {target}\'s pocket. Deny it. I will make the denial plausible.', 'Exposed. The agent is out. The method is burned. The method was old. We have others.'],
            ['The operation leaked from this building. Not from the Desk. From a room with a nicer carpet.'],
            [], ['The operation leaked. Someone was paid. I am investigating the payment. It was large.']),
        op_exposed_theirs: L(
            ['{target} ran a network inside the Admiralty. Rolled up. I would like two of them turned, not shot.', 'Their agent was good. Their handler was not. We have the handler.'],
            ['Found a {target} network. Found it late. We are understaffed, as I keep saying.'],
            ['A {target} network inside the court. It had friends here. Some are still friends.']),
        agent_captured: L(['One of ours is in a {target} cell. They know the drill. The drill is to say nothing for nine days. Day nine, I need a decision.'], [], [], ['An agent captured. They can be bought back. The price has been quoted. My fee is separate.']),
        loyalty_report: L(
            ['A loyal officer was approached about a \'change of leadership\'. The name is in the file. It is a name you trust.', 'Someone is recruiting. Clumsily. I let them continue; clumsy recruiters name their friends.'],
            ['There is talk of a plot. I will look into it when the Desk is funded to look into things.'],
            ['Rumours of a plot. Nothing solid. I will keep looking.'],
            ['A plot. Possibly. The informant wants paying before saying more. So do I.']),
        foreign_tie: L(
            ['Your minister of {portfolio} has been taking {target}\'s money for a year. The proof is clean. Act before they hear I have it.'],
            ['The {portfolio} minister is bought. I could have told you in spring. Nobody asked in spring.'],
            [], ['I have evidence against a colleague. I have not decided what it is worth yet.']),
        crackdown: L(['The cells are mapped. Say the word and they are gone by morning. Say nothing and they grow.'], [], ['The crackdown gave the Desk a list of every dissident. And every official who spoke to one.']),
        crisis_window: L(['It is tonight. I have three names and the guard\'s commander. Tell me which door to lock.'], ['Something is moving tonight. I have names. I am not sure I have the guard.'], ['It is tonight. I would stay in your rooms.']),
        case_opened: L(['A case is open. Give it a week before you ask who. Names given early are wrong names.']),
        dismissed: L(['Understood. The files stay in the safe. The combination is with the Interior minister. Change it.'], ['You are dismissing the one person who knows who else to dismiss. Noted.'], ['You can have the office. The files have already moved.'], ['Very well. Some files will be returned. Some will be sold. I have not sorted them yet.']),
        resigned: L(['I cannot protect a government that tells its enemies its plans at dinner. I resign. Lock the safe.']),
        approved: L(['Approved. It is already under way. It was under way before you approved it.'], ['Approved. Good. I had begun without you.'], ['Approved. The file notes that you approved it.'], ['Approved. The informants will be paid. Through me.']),
        declined: L(['Declined. The file stays open. Files do.'], ['Declined. I will note it. I note everything.'], ['Declined. Noted. In the file that is about you.'], ['Declined. The informant will sell elsewhere.']),
        lapsed: L(['Unanswered. Silence is also an answer. I have filed it as one.'], ['No answer. The Desk proceeds on assumptions. It usually has to.'], ['Unanswered. A ruler who does not answer is a ruler the files describe as absent.'], ['Unanswered. Information not acted on is information resold.']),
        morning: L(['Good morning. You were followed yesterday. It was one of ours.']),
    },
    interior: {
        appointed: L(
            ['The provinces are quiet and I intend to keep them that way. Quiet is work. It looks like nothing.'],
            ['I took the Home Office because nobody else wanted the provinces. Remember that when they are the only thing left.'],
            ['The Home Office holds the guard, the press and the governors. Thank you for all three.'],
            ['An honour. Governorships will be reviewed. Applications are open. Fees apply.']),
        routine: L(
            ['Approval holds. The provinces are quiet. Quiet provinces vote; remember that.', 'Three worlds are muttering. Muttering is fine. Muttering with banners is not. I am watching for banners.'],
            ['The provinces ask me what the capital wants. I have stopped guessing.', 'Approval is what it is. I could raise it. I would need a government that listened.'],
            ['The people want a steady hand. They do not much mind whose.'],
            ['Order is maintained. Order has overheads. The overheads have names.']),
        approval_falling: L(
            ['They are tired of the war, the prices and your face, in that order. Fix the first two and the third follows.'],
            ['Approval down again. I have a plan. I had a plan last month. It was not read.'],
            ['Approval is falling. The crowds do not blame the government. They blame the person at the top of it.'],
            ['Approval is falling. A festival would help. I know a festival contractor.']),
        cohesion_falling: L(
            ['The outer worlds are drifting. Give them a governor they chose or they will choose one themselves.', '{world} is talking about going its own way. Talk is cheap. I would like to make staying cheaper.'],
            ['Secession talk on three worlds. I sent you the warning. The warning is now a fact.'],
            ['The provinces are drifting from the capital. Not from me. I visit.'],
            ['The provinces are restless. Governors can be persuaded to calm them. Persuasion has a rate.']),
        secession: L(['{world} has gone. Do not send the fleet first. Send me. Then send the fleet if I fail.'], ['A world left. I named it in four reports. I will not name it in a fifth.'], ['{world} has left. Others watch to see what you do. So do I.']),
        press_campaign: L(['The gazette is ours for a week. Use it well; they remember being used.', 'The editors will print it. The readers will believe half. Half is a landslide.'], [], [], ['The press will say what we need. Two editors needed convincing. The convincing is on the books as \'paper\'.']),
        crackdown: L(['The cells are broken. So is a great deal of trust. Do not ask me to do it twice.'], ['The crackdown worked. It always works, once.'], ['The crackdown worked. The security services answer to me now. That seemed efficient.']),
        riot: L(['A riot on {world}. Bread first, then the guard. Guard first and we are explaining bodies for a year.'], [], [], ['A riot. The guard is ready. Their overtime is not in the budget. I can find it. For a consideration.']),
        battle_won: L(['The victory bought us two months of goodwill. Spend it on the provinces, not on another victory.']),
        battle_lost: L(['They heard about the defeat before I did. The gazette is faster than the Admiralty. Say something tonight.'], ['A defeat, and the provinces ask what it was for. I would like an answer to give them.'], ['A defeat. The provinces ask who is responsible. I have not told them it is not me.']),
        crisis_window: L(['Troops are moving in the capital on nobody\'s order. I have the guard. Tell me whose side to put it on.'], ['Something is happening in the capital. I have the guard, and the guard has questions.'], ['It is done. Stay in your rooms and it will go gently.']),
        dismissed: L(['The provinces will ask why. Give me a reason I can carry to them, and I will carry it.'], ['You are dismissing the one minister the governors trust. Tell them yourself.'], ['You can take the office. The governors know my address.'], ['Understood. The governors I appointed will want to know whether their arrangements stand.']),
        resigned: L(['I will not run the provinces for a government that forgets they exist. I resign. They will notice before you do.']),
        approved: L(['Approved. The governors will hear it tonight, from me.'], ['Approved. I will tell the provinces it was my idea. It was.'], ['Approved. The provinces will know who made it happen.'], ['Approved. The arrangements are in hand.']),
        declined: L(['Declined. I will tell the provinces to wait. They are good at waiting. Until they are not.'], ['Declined. I will stop bringing it, then.'], ['Declined. The governors asked. I will tell them who said no.'], ['Declined. Someone else will be disappointed too.']),
        lapsed: L(['Unanswered. The provinces noticed before you did.'], ['No answer. The governors have stopped asking me what the capital wants.'], ['Unanswered. A capital that does not answer is a capital the provinces stop asking.'], ['Unanswered. Some arrangements lapsed with it.']),
        morning: L(['Morning. Three provinces are happy and one is not. I will tell you which after you eat.']),
    },
    foreign: {
        appointed: L(
            ['Delighted. I know every ambassador\'s wine and every court\'s grudge. We will need both.'],
            ['I accepted. I will represent this government abroad. I will represent it accurately, which may not please it.'],
            ['An honour. Foreign courts respect the person they deal with. They will be dealing with me.'],
            ['Charmed. The embassies will need refurbishing. The contractors are old friends.']),
        routine: L(
            ['Our word still carries. Treaties signed now cost nothing and buy years.', 'Two courts send regards. One means it. I will tell you which when I am sure.'],
            ['I keep five courts warm with no instructions. It is a skill. It is not a policy.'],
            ['Foreign courts ask me who speaks for this empire. I tell them I do. It saves time.'],
            ['Relations are cordial. Cordiality is maintained by gifts. The gifts are reciprocal.']),
        idle_war: L(['Every month of this war costs us a friend abroad. Find me terms to offer.'], ['Peace, please. I have been apologising to five courts for this war for a season.'], ['The war goes on. Abroad, they ask me whether it is your war or the empire\'s. I have not decided what to say.']),
        offer_accept: L(['Take it. Their terms are better than their position.', 'Accept, graciously, and let them think it was their idea. It was not. It was mine.'], ['My advice is in the file. Last time it was not read, so I kept it short: accept.'], ['Accept. It frees your hands. It also frees mine.'], ['I recommend accepting. {target}\'s ambassador has been very attentive to my household.']),
        offer_refuse: L(['Refuse. They are asking for the one thing we cannot give back.', 'Not yet. Let it sit a week. A week makes any offer better or makes it vanish; both tell us something.'], ['My advice is in the file. Last time it was not read, so I kept it short: refuse.'], ['Refuse. A weak government accepts everything. Let them see this one is not. Yet.'], ['Refuse, for now. A better offer is coming. I have arranged for it to come.']),
        peace_proposal: L(
            ['The war with {target} has cost more than it will return. They will take terms today; they will not next month.', '{target} is tired and too proud to say so. Let me say it for them, in a room with good chairs.'],
            ['Peace, please. I have been apologising to five courts for this war for a season.'],
            ['Peace with {target} would free the fleet for other purposes. Domestic purposes.'],
            ['Peace with {target}. Their envoy has been generous. I would like to be generous back.']),
        war_proposal: L(['I have tried {target} with every courtesy I own. They mistake courtesy for weakness. The Admiralty may correct them.']),
        envoy: L(['The envoy is on their way to {target} with gifts and no instructions. The best kind.'], [], [], ['An envoy to {target}. A cousin of mine. Trustworthy, and expensive.']),
        treaty_signed: L(['Signed. {target} is a friend now, which means they will betray us politely rather than loudly.'], ['A treaty. I drafted it twice before anyone read it. The second draft is the one they signed.'], ['Signed. {target}\'s court knows who negotiated it. Friendships like that outlast governments.']),
        treaty_broken_them: L(['They tore it up. Say so loudly; every court that trusted them is listening.', '{target} broke their word. I am not surprised. I am keeping the letter they wrote when they gave it.'], ['The treaty I negotiated is ash. I would like the record to show I wanted guarantees.']),
        treaty_broken_us: L(['We broke our word. I will spend a year making it look like theirs. Do not help.'], ['We tore up a treaty I spent a season on. I will smile about it abroad. Not here.']),
        sanctions_by_us: L(['Sanctions are a letter you send when you cannot think of words. I can think of words. Let me try them first.']),
        breakaway: L(['A new state is asking to be recognised. Recognise it and gain a friend and an enemy on the same day.'], ['The rebels want recognition. Their parent wants us not to. Both have sent fruit.'], [], ['The rebels have sent a gift with their request for recognition. I have not opened it. Yet.']),
        gambit: L(['{target} has given us an ultimatum. Stalling buys a week. Decide what the week is for.', '{target} accuses us of spying. We were. Deny it with great warmth.', 'A show of force at the border. They want us to flinch. Yawn instead; I will do the yawning.'], ['An ultimatum from {target}. I would have seen it coming if I had been in the room.'], ['{target} demands an answer. Some here think the answer should come from a different chair.']),
        battle_won: L(['Victory. Every court is suddenly fond of us. Fondness is a currency; spend it this week.'], [], [], ['A win. {target}\'s neighbours want to talk. Talks need a venue. I own one.']),
        battle_lost: L(['A defeat. Three ambassadors cancelled lunch. I am rescheduling. Give me something to serve.'], ['A defeat, and I am the one who explains it abroad. Give me something to explain.']),
        dismissed: L(['Of course. The courts will ask where I went. I will tell them I am resting. They will not believe me.'], ['Dismissed. Several courts will be sorry. I will let them be.'], ['You may have the office. The ambassadors have my private address. Most have used it.'], ['Understood. The embassy accounts will be in order. They will take some time to be in order.']),
        resigned: L(['I cannot represent abroad a government I cannot explain at home. I resign. Courteously.'], [], ['I resign. You will hear from me again, from a better address.']),
        approved: L(['Approved. I will have it said in the right rooms by tonight.'], ['Approved. I will make it sound as if it was always the plan.'], ['Approved. The courts will know whose hand drafted it.'], ['Approved. The embassy will host something to mark it.']),
        declined: L(['Declined. I will tell the courts we are considering. We can consider for years.'], ['Declined. I will stop asking and start apologising abroad.'], ['Declined. Abroad they will ask why. I may tell them.'], ['Declined. A pity; the venue was booked.']),
        lapsed: L(['No answer. Abroad, silence reads as weakness or as cunning. I have told them it is cunning.'], ['No answer. I have run out of ways to say \'soon\' in six languages.'], ['Unanswered. The courts ask me who decides here. I am beginning to wonder.'], ['Unanswered. The ambassador\'s gift went unthanked. I thanked them myself.']),
        morning: L(['Good morning. Two courts send regards; one sends a warning dressed as regards.']),
    },
};

/** The written characters' own lines, by character id: hook → register → sentences. */
const CHARACTER_LINES: Record<string, Record<string, Partial<Record<Register, string[]>>>> = Object.fromEntries(
    ((castData as unknown as { characters: Array<{ id: string; lines: Record<string, Partial<Record<Register, string[]>>> }> }).characters).map(c => [c.id, c.lines]),
);

export type Vars = Partial<Record<'target' | 'world' | 'portfolio', string>>;

function fill(line: string, vars: Vars): string {
    return line.replace(/\{(target|world|portfolio)\}/g, (_, k: keyof Vars) => vars[k] ?? (k === 'target' ? 'them' : k === 'world' ? 'the world' : 'that office'));
}

/** Deterministic pick: the same seed gives the same line, so a card does not flicker between syncs. */
function pick<T>(arr: T[], seed: number): T {
    const n = arr.length;
    const i = Math.abs(Math.floor(seed)) % n;
    return arr[i];
}

/**
 * A line for this office, hook and register, with placeholders filled.
 * Falls back to the loyal register when the sheet has nothing for the
 * register (a venal Treasury still answers a strike), and to '' when the
 * hook has no lines for this office at all.
 */
export function ministerLine(portfolio: CabinetPortfolio, hook: Hook, register: Register, vars: Vars = {}, seed = 0, characterId?: string): string {
    // A written person speaks in their own words where they have them; the
    // office persona covers the hooks they do not.
    const own = characterId ? CHARACTER_LINES[characterId]?.[hook] : undefined;
    const ownPool = own ? (own[register]?.length ? own[register] : own.loyal) ?? [] : [];
    if (ownPool.length) return fill(pick(ownPool, seed), vars);
    const lines = MINISTER_LINES[portfolio]?.[hook];
    if (!lines) return '';
    const pool = (lines[register]?.length ? lines[register] : lines.loyal) ?? [];
    if (!pool.length) return '';
    return fill(pick(pool, seed), vars);
}

/** ` Name: “line”` for appending to a card, or '' when the minister has nothing to say. */
export function ministerSays(m: MinisterLike | undefined, portfolio: CabinetPortfolio, hook: Hook, vars: Vars = {}, seed = 0, plotting = false): string {
    if (!m) return '';
    const line = ministerLine(portfolio, hook, registerOf(m, plotting), vars, seed, m.characterId);
    return line ? ` ${m.name}: “${line}”` : '';
}

/** A small stable hash for seeds built from ids. */
export function seedOf(...parts: Array<string | number>): number {
    let h = 2166136261;
    for (const p of parts) for (const ch of String(p)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
