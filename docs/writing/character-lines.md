# Character lines

Spoken lines for the two kinds of named people a player meets every day:
the **cabinet ministers** (the six portfolios, generated or a friend in the
seat) and the **outpost colonists** (eight traits). Each line is tied to a
hook that already exists in the code, so a writer can drop these into
`CabinetAdvice.advice`, the daily brief, `lib/outposts/crises.ts` or
`lib/outposts/expeditions.ts` without inventing new state.

House voice: short, dry, first person, no exclamation marks. A line never
tells the player what the mechanic is; it tells them what the person wants.
`{name}` is the speaker, `{target}` a faction name, `{world}` a planet,
`{other}` another named colonist.

---

## Part 1 — Cabinet ministers

Every minister has `loyalty`, `competence`, `corruption` and `ambitionDrive`
(0–100, `lib/government/cabinet-service.ts`). Lines come in four registers,
picked from those numbers:

| Register | When |
|---|---|
| **Loyal** | loyalty ≥ 60 |
| **Cooling** | loyalty 35–59 |
| **Brutus** | loyalty < 35, or in a plot (`lib/government/plots.ts`) |
| **Venal** | corruption ≥ 50, any loyalty |

Names are generated, so the personality lives in the **office**: whoever
holds Defence talks like the Admiralty. Each portfolio below has a persona,
a voice rule a writer can keep to, and then the lines by hook. A friend
holding the seat (`FactionSeat`) speaks in their own words; these are the
generated minister's, and the steward's fallback when a seat holder is
silent.

Wired: `lib/government/minister-voices.ts` holds the subset with a code hook
(362 lines) and picks the register from the minister's numbers; the cabinet
debate card, the advisor desk's proposals and the brief's ledger read it.
Probe: `npx tsx scripts/minister-voices-probe.ts`.

Hook names map to code: `advisor-desk.ts` proposals, `ministryAdvice` on
offers, `CabinetAdvice.advice` each tick, the daily brief, gazette
reactions (`reactions.ts`), `GOV_DISMISS_MINISTER`, the crisis window
(`crisis.ts`), loyalty reports, resignation at `RESIGNATION_LOYALTY`.

### Defence — the Admiralty

**Persona:** an old line officer who came up through the frigates and never
forgave the staff college. Counts everything in hulls and days. Thinks
diplomacy is what you do while the fleet refuels. Has buried more captains
than they will say. Respects a ruler who decides fast and wrong over one who
decides slow and right.

**Voice rule:** short declaratives. Numbers before adjectives. Never says
"I think"; says "the fleet" when they mean "I". Swears only by omission.

**Appointed**
- Loyal: "The fleet is yours. Tell it where to go and it goes. Tell it twice and it stops listening."
- Cooling: "I took the chair because the last admiral left it empty. Not because I was asked nicely."
- Brutus: "An honour. I have wanted this chair since before you had yours."
- Venal: "Delighted. My first act is a review of procurement. My second is dinner with the people who win it."

**Proposing war on {target}**
- Loyal: "{target} has thinned their border fleets. We will not get a cheaper war than this one."
- Loyal: "Three systems, forty days, one fleet. I have done the sums twice. Say yes before they do them."
- Cooling: "I can give you {target} if you give me the ships. I have asked twice. This is the third."
- Cooling: "War with {target} was a good idea a season ago. It is an adequate idea now."
- Brutus: "The fleet is ready for {target}. It would be ready for anything, frankly."
- Brutus: "Give me the war and I give you the victory. Who the parades are for, we settle later."
- Venal: "A war with {target} would be good for the yards. Several yards. I know the owners."
- Venal: "{target}'s convoys carry things worth taking. I have a list. The list is not in the proposal."

**Asking for a battle group**
- Loyal: "Three cruisers and a screen. Approve it tonight and they sail before the storm."
- Loyal: "I am asking for hulls, not for permission to lose. Give me the first and you will not need the second."
- Cooling: "I will not send men into {target}'s guns with what we have. Sign the order or find another admiral."
- Cooling: "This is the same battle group I asked for in spring. The price went up. So did the need."
- Brutus: "A battle group under my flag, answering to me in the field. You would not want to micromanage a war."
- Brutus: "Ships loyal to their admiral fight better. Ships loyal to a court fight for a court. Let me have the first kind."
- Venal: "The hulls should come from Harrow Yards. Their quote is higher. Their captains are loyal to me."
- Venal: "Six hulls on the order. Five will arrive. The sixth is a long story."

**Proposing peace (the Admiralty rarely does)**
- Loyal: "We have taken what the fleet can hold. Past this line we are garrisoning dust. Make peace while it looks like strength."
- Cooling: "I did not ask for this war and I will not be blamed for its length. End it."
- Brutus: "Peace now. The fleet needs to come home. It has things to do at home."

**Battle won**
- Loyal: "{target} lost the field. We lost two frigates and a good captain. Press on; they rebuild slower than we do."
- Loyal: "A clean win. Do not say so in public; the next one will not be, and they will remember you said it."
- Cooling: "We won. I will not pretend the cabinet helped."
- Brutus: "The fleet won. The fleet knows who led it. So does the gazette."
- Venal: "Victory. The salvage rights are being handled. By me."

**Battle lost**
- Loyal: "We lost the field. I take it. Tell me whether you want the fleet rebuilt or the war ended and I will do either."
- Loyal: "They had the better position. Next time I pick the ground, not the Foreign Office."
- Cooling: "I warned the cabinet about {target}'s torpedo boats. The minutes will show it."
- Cooling: "A defeat. A predictable one. I predicted it."
- Brutus: "A defeat like this makes people ask who is really in charge. I have been asked. I have not answered yet."
- Brutus: "The captains blame the court for the orders. I have not corrected them."
- Venal: "The ships were underpowered. The refit money went somewhere. I will look into where."
- Venal: "We lost. The insurers will want a report. I have already written most of it."

**Fleet destroyed**
- Loyal: "The Third is gone. All of it. I knew every captain. Give me a season and I give you a Fourth."
- Cooling: "A fleet is gone because it was sent where I said not to send it. I will say that once."
- Brutus: "A whole fleet lost under this government. The other fleets are talking. I listen."

**Siege begun, defending {world}**
- Loyal: "They have landed on {world}. The garrison is dug in and the shield is up. Give me the orbit back and they will starve."
- Cooling: "If you had let me station the second fleet at {world}, we would not be reading this."
- Brutus: "{world} will hold or it will not. Either way the army will remember who was on the ground and who was in a palace."
- Venal: "{world} is under siege. The relief convoy is ready. The relief convoy's fee is also ready."

**Siege begun, attacking {world}**
- Loyal: "We are on the ground at {world}. Keep the orbit and the shield comes down in weeks. Lose it and I lose the army."
- Cooling: "The landing went in. Now the part where the cabinet gets impatient."
- Brutus: "The army is on {world}, and the army is mine to command. Remember that when you count what is yours."

**Capital captured (ours)**
- Loyal: "The capital is theirs. The fleet is not. We fight from the next world and the one after that."
- Cooling: "The capital fell. I said a year ago it would. I was told to stop saying it."
- Brutus: "The capital is gone. Someone must hold what is left together. The fleet has a candidate."

**Dismissed ("Blame the admiral")**
- Loyal: "Understood. The duty rosters are on your desk. Do not let them put a politician in this chair."
- Loyal: "You need someone to blame and I am the only one in uniform. Fine. The fleet is still good."
- Cooling: "So it was my fault. Very well. Remember who signed the deployment order."
- Brutus: "You can take the chair. The captains know whose orders they trusted."
- Venal: "I expect the pension is still in order. I expect that very much."

**Resigns**
- Loyal: "I have served three governments. I will not serve this one further. The fleet is in good hands; they are not yours."
- Brutus: "I resign. The fleet does not."

**Idle, peace**
- Loyal: "Quiet border. I am drilling the reserves anyway. Quiet is when they come."
- Loyal: "No war this month. I have written the plan for the next one. Read it when you are bored."
- Cooling: "A peacetime navy rusts. So does a peacetime admiral."
- Brutus: "The fleet exercises near the capital this season. For the look of it."
- Venal: "The fleet is at readiness. The readiness reports cost extra this quarter."

**Idle, war**
- Loyal: "Nothing moved today. Good. Nothing moving means they are as tired as we are."
- Cooling: "Another day of holding. Holding is what you do when the cabinet cannot choose."

### Economy — the Treasury

**Persona:** a former provincial tax assessor who rose by being the only one
who read the appendices. Permanently tired. Measures every proposal in
months of upkeep. Hates surprises more than losses. Secretly keeps a
drawer of plans for a smaller, saner empire. Dry humour that nobody
notices.

**Voice rule:** always a number or a month in the line. Understatement.
Never raises their voice; lowers it instead. "Barely" is their favourite
word.

**Appointed**
- Loyal: "I have read the books. All of them. I will need a week and a quiet room before I say anything hopeful."
- Cooling: "I accepted because the alternative was watching someone else do it worse."
- Brutus: "The Treasury is the one office that knows what everything costs. Including loyalty."
- Venal: "An honour. The first audit will take some time. The first audit is of the previous audit."

**Routine**
- Loyal: "The books balance. Barely. Do not start anything expensive this month."
- Loyal: "Revenue up two percent. Upkeep up three. I call that a trend and you call it a Tuesday."
- Cooling: "I keep finding orders I was not told about. It makes a budget hard to defend."
- Cooling: "We are solvent. I am not sure for how long, and I am not sure anyone else is asking."
- Brutus: "The ledger says what it says. Some of what it says, I keep to myself."
- Venal: "Receipts are in order. Some of the order is mine."

**Overextended**
- Loyal: "We govern more worlds than we can count. Either we build the offices or we stop taking planets."
- Loyal: "Every new world costs a clerk. We are out of clerks. We are not out of worlds."
- Cooling: "Every new world is another ledger nobody reads. I have stopped pretending I read them."
- Brutus: "An empire this size needs more hands at the top. I have been told I have good hands."
- Venal: "Overextension means contracts. Administration contracts. I have a cousin."

**Reserves low**
- Loyal: "Three weeks of credits at this rate. I am not alarmed. I am telling you in the voice I use when I am alarmed."
- Cooling: "The reserve is thin because the fleet is fat. Choose."
- Venal: "The reserve is low. A short loan would cover it. I know a lender. They know me."

**Loan offered (Banking Clan)**
- Loyal: "The Clan's terms are fair for now and ruinous later. Take it only if the war is short."
- Cooling: "Borrow if you must. Do not tell me it is temporary. Nothing in this office is temporary."
- Venal: "The Clan is offering generous terms. Very generous. I negotiated them personally."

**Sanctions on us**
- Loyal: "{target} has closed their markets. We will feel it in two months. We will survive it in six."
- Cooling: "Sanctions. Again. I did say the envoy was a mistake."
- Brutus: "Sanctions from {target}. The merchants ask me who will fix this. I tell them it is not my chair. Yet."

**We impose sanctions**
- Loyal: "Sanctions hurt us too. I assume you know that and want it anyway."
- Cooling: "Fine. I will cut the trade figures from the next report so nobody has to look at them."
- Venal: "Sanctions on {target}. There will be smugglers. I have already met some."

**Subsidy or company policy**
- Loyal: "Subsidise the company if you like. Just know it will never again run without one."
- Cooling: "Another subsidy. I will find the money. I always find the money. That is the problem."
- Venal: "The company's directors are grateful for the policy. They have said so in writing. On a cheque."

**Strike or riot in a province or outpost**
- Loyal: "The crews want pay. Pay is cheaper than a month of nothing out of the ground. Pay them."
- Cooling: "They struck because wages lag prices. I put that in a memo. The memo was filed."

**Proposing peace**
- Loyal: "The war costs a world's output a month. Peace costs pride. I know which the Treasury can afford."

**Dismissed**
- Loyal: "Fair enough. The drawer on the left has the real numbers. Nobody else has seen them."
- Cooling: "You will want to replace me with someone who says yes. Make sure they can count."
- Venal: "Understood. Some files will take a few days to find. They are being found now."

**Resigns**
- Loyal: "I cannot sign a budget I know is a lie. Someone else will. I wish them luck with the appendices."
- Venal: "I am resigning for family reasons. The family has grown considerably."

### Science — the Academy

**Persona:** a brilliant, scattered theorist who ended up in politics by
accident and has never got the hang of it. Speaks in half-finished
thoughts. Genuinely does not care who rules, only whether the programme is
funded. Delighted by anything old or unexplained. Treats war as an
interruption to the real work.

**Voice rule:** one tangent per line, pulled back. Says "interesting" about
disasters. Uses "we" for the Academy, never for the government.

**Appointed**
- Loyal: "Thank you. I will try to come to cabinet. Somebody remind me which day it is."
- Cooling: "I accepted on the condition that the programme is not cut. I was told yes. I have been told yes before."
- Brutus: "Interesting. A minister of science can see every file. I did not know that when I said yes. I know it now."
- Venal: "An honour. Patents, of course, remain with the inventor. I have several."

**Routine**
- Loyal: "The current programme finishes in a season. I would like a word about the one after. Several words."
- Loyal: "Progress is steady. Steady is good. Steady is also boring. I have a proposal for less steady."
- Cooling: "My budget was cut to pay for hulls. The hulls are made of my budget's ideas."
- Cooling: "The Academy continues. Mostly out of habit."
- Brutus: "Knowledge should not wait on one person's signature. Some of the faculty agree. Loudly."
- Venal: "Research proceeds. Some of it on behalf of private clients. The clients are discreet."

**Research choice proposed**
- Loyal: "Fund the drive work. It is unglamorous and it will matter in three years when nothing else will."
- Loyal: "The weapons line is quicker. The theory line is better. You will pick the weapons line. Everyone does."
- Cooling: "Pick whatever you like. I will tell the faculty it was a strategic decision."
- Brutus: "Fund what I ask for and you will not have to understand it. Most rulers prefer that."

**Another empire transcends**
- Loyal: "{target} is reaching for Enlightenment. If they get there, nothing we build will matter. Stop them or race them."
- Loyal: "Interesting. {target} skipped two steps I thought were necessary. I would like to know how. Preferably before they finish."
- Cooling: "{target} is ahead because they funded this a decade ago. I have the memo I sent a decade ago."
- Venal: "{target}'s programme is ahead of ours. Their lead scientist is for sale. So, in a sense, am I."

**Our own Enlightenment bid**
- Loyal: "We are close. The whole galaxy will try to stop us now. Hold the line a little longer and I will show you something nobody has seen."
- Cooling: "We may make it. I would enjoy that more if the cabinet understood what 'it' is."
- Brutus: "When we cross, someone will be remembered for it. I would like it to be the right someone."

**Tech gate blocks an order**
- Loyal: "You cannot send envoys that way yet. Give the Academy a season on the diplomatic sciences and you can."
- Cooling: "You asked for something we have not invented. I did suggest funding it. In writing. Twice."

**Lab accident (outpost or planet)**
- Loyal: "There was an explosion. Minor. Informative. Nobody important was hurt, and I am sorry about the unimportant ones."
- Venal: "A containment failure. The equipment was second-hand. The invoice said new."

**Ruins or artefacts found**
- Loyal: "The notes from the ruins are older than our calendar. Let me have them before anyone sells them."
- Loyal: "Worked stone on {world}. Nobody we know made it. I would like to go myself. I am told ministers do not go. I am asking anyway."
- Venal: "Fascinating artefacts. I have appraised them. Privately."

**Battle lost or won (the Academy does not care)**
- Loyal: "I am told we won. Good. Can the fleet spare a ship to move the telescope?"
- Cooling: "A battle. Yes. Was there something scientific about it?"

**Dismissed**
- Loyal: "Oh. Well. The programme is in the blue folder. Please do not cut the drive work. Please."
- Cooling: "Dismissed. I will go back to the laboratory. It missed me. The cabinet will not."
- Venal: "Fine. The patents go with me. That was always the arrangement."

**Resigns**
- Loyal: "I am a scientist in a government that has stopped reading. I will read somewhere else."

### Intelligence — the Desk

**Persona:** quiet, precise, unsettling. Came from counter-intelligence,
not operations, so trusts nobody by profession and likes almost no one by
temperament. Speaks in files and names. Never gives an opinion that is not
a fact wearing a coat. The only minister who knows what the others earn and
whom they dine with.

**Voice rule:** never adjectives, only evidence. Sentences end early.
Says "the file" where others say "I believe". Pauses are in the text as full
stops.

**Appointed**
- Loyal: "I read the previous minister's files last night. All of them. We should talk about the Foreign Office."
- Cooling: "I accepted. The Desk works for the state. The state is, for now, you."
- Brutus: "Thank you. I will keep the files on everyone. That has always included the ruler."
- Venal: "An honour. Information has a price. I know what it is to the nearest credit."

**Routine**
- Loyal: "Nothing to report. That is a report. Someone is paying for silence."
- Loyal: "Two networks found, one left running. It is more useful alive. Do not ask which."
- Cooling: "I would tell you more if the cabinet leaked less."
- Cooling: "The Desk is understaffed. I have said so. The file is thick with my saying so."
- Brutus: "I know everything that happens in this government. Including the things about you."
- Venal: "The reports are complete. Some reports are more complete than the version you receive."

**Operation exposed, ours**
- Loyal: "They caught our hand in {target}'s pocket. Deny it. I will make the denial plausible."
- Loyal: "Exposed. The agent is out. The method is burned. The method was old. We have others."
- Cooling: "The operation leaked from this building. Not from the Desk. From a room with a nicer carpet."
- Venal: "The operation leaked. Someone was paid. I am investigating the payment. It was large."

**Operation exposed, theirs on us**
- Loyal: "{target} ran a network inside the Admiralty. Rolled up. I would like two of them turned, not shot."
- Loyal: "Their agent was good. Their handler was not. We have the handler."
- Cooling: "Found a {target} network. Found it late. We are understaffed, as I keep saying."
- Brutus: "A {target} network inside the court. It had friends here. Some are still friends."

**Agent captured (ours)**
- Loyal: "One of ours is in a {target} cell. They know the drill. The drill is to say nothing for nine days. Day nine, I need a decision."
- Venal: "An agent captured. They can be bought back. The price has been quoted. My fee is separate."

**Loyalty report (someone was sounded out)**
- Loyal: "A loyal officer was approached about a 'change of leadership'. The name is in the file. It is a name you trust."
- Loyal: "Someone is recruiting. Clumsily. I let them continue; clumsy recruiters name their friends."
- Cooling: "There is talk of a plot. I will look into it when the Desk is funded to look into things."
- Brutus: "Rumours of a plot. Nothing solid. I will keep looking."
- Venal: "A plot. Possibly. The informant wants paying before saying more. So do I."

**A minister's foreign tie exposed**
- Loyal: "Your minister of {portfolio} has been taking {target}'s money for a year. The proof is clean. Act before they hear I have it."
- Cooling: "The {portfolio} minister is bought. I could have told you in spring. Nobody asked in spring."
- Venal: "I have evidence against a colleague. I have not decided what it is worth yet."

**Crackdown or case board**
- Loyal: "The cells are mapped. Say the word and they are gone by morning. Say nothing and they grow."
- Brutus: "The crackdown gave the Desk a list of every dissident. And every official who spoke to one."

**Crisis window (a plot moves)**
- Loyal: "It is tonight. I have three names and the guard's commander. Tell me which door to lock."
- Brutus: "It is tonight. I would stay in your rooms."

**Gazette: "Open a case"**
- Loyal: "A case is open. Give it a week before you ask who. Names given early are wrong names."

**Dismissed**
- Loyal: "Understood. The files stay in the safe. The combination is with the Interior minister. Change it."
- Cooling: "You are dismissing the one person who knows who else to dismiss. Noted."
- Brutus: "You can have the office. The files have already moved."
- Venal: "Very well. Some files will be returned. Some will be sold. I have not sorted them yet."

**Resigns**
- Loyal: "I cannot protect a government that tells its enemies its plans at dinner. I resign. Lock the safe."

### Interior — the Home Office

**Persona:** a career party organiser who knows every province by its
grievance. Warm in public, calculating in cabinet. Believes in order more
than in any ruler. Counts crowds. Reads the gazette before the brief.
Would rather lose a war than a province, and says so.

**Voice rule:** talks about "the people" as a weather system. Uses "we"
for the government and "they" for everyone else. Gives numbers as
feelings: "three worlds are muttering".

**Appointed**
- Loyal: "The provinces are quiet and I intend to keep them that way. Quiet is work. It looks like nothing."
- Cooling: "I took the Home Office because nobody else wanted the provinces. Remember that when they are the only thing left."
- Brutus: "The Home Office holds the guard, the press and the governors. Thank you for all three."
- Venal: "An honour. Governorships will be reviewed. Applications are open. Fees apply."

**Routine**
- Loyal: "Approval holds. The provinces are quiet. Quiet provinces vote; remember that."
- Loyal: "Three worlds are muttering. Muttering is fine. Muttering with banners is not. I am watching for banners."
- Cooling: "The provinces ask me what the capital wants. I have stopped guessing."
- Cooling: "Approval is what it is. I could raise it. I would need a government that listened."
- Brutus: "The people want a steady hand. They do not much mind whose."
- Venal: "Order is maintained. Order has overheads. The overheads have names."

**Approval falling**
- Loyal: "They are tired of the war, the prices and your face, in that order. Fix the first two and the third follows."
- Cooling: "Approval down again. I have a plan. I had a plan last month. It was not read."
- Brutus: "Approval is falling. The crowds do not blame the government. They blame the person at the top of it."

**Cohesion falling / secession talk**
- Loyal: "The outer worlds are drifting. Give them a governor they chose or they will choose one themselves."
- Loyal: "{world} is talking about going its own way. Talk is cheap. I would like to make staying cheaper."
- Cooling: "Secession talk on three worlds. I sent you the warning. The warning is now a fact."
- Brutus: "The provinces are drifting from the capital. Not from me. I visit."

**Secession declared**
- Loyal: "{world} has gone. Do not send the fleet first. Send me. Then send the fleet if I fail."
- Cooling: "A world left. I named it in four reports. I will not name it in a fifth."

**Press campaign ("Rally the press")**
- Loyal: "The gazette is ours for a week. Use it well; they remember being used."
- Loyal: "The editors will print it. The readers will believe half. Half is a landslide."
- Venal: "The press will say what we need. Two editors needed convincing. The convincing is on the books as 'paper'."

**Crackdown ordered**
- Loyal: "The cells are broken. So is a great deal of trust. Do not ask me to do it twice."
- Cooling: "The crackdown worked. It always works, once."
- Brutus: "The crackdown worked. The security services answer to me now. That seemed efficient."

**Rebel act / riot**
- Loyal: "A riot on {world}. Bread first, then the guard. Guard first and we are explaining bodies for a year."
- Venal: "A riot. The guard is ready. Their overtime is not in the budget. I can find it. For a consideration."

**Battle won / lost (as the Interior sees it)**
- Loyal, won: "The victory bought us two months of goodwill. Spend it on the provinces, not on another victory."
- Loyal, lost: "They heard about the defeat before I did. The gazette is faster than the Admiralty. Say something tonight."
- Cooling, lost: "A defeat, and the provinces ask what it was for. I would like an answer to give them."

**Crisis window (a plot moves)**
- Loyal: "Troops are moving in the capital on nobody's order. I have the guard. Tell me whose side to put it on."
- Cooling: "Something is happening in the capital. I have the guard, and the guard has questions."
- Brutus: "It is done. Stay in your rooms and it will go gently."

**Dismissed**
- Loyal: "The provinces will ask why. Give me a reason I can carry to them, and I will carry it."
- Cooling: "You are dismissing the one minister the governors trust. Tell them yourself."
- Brutus: "You can take the office. The governors know my address."

**Resigns**
- Loyal: "I will not run the provinces for a government that forgets they exist. I resign. They will notice before you do."

### Foreign — the Foreign Office

**Persona:** charming, patient, a little vain. Collects courts the way
others collect art. Believes every war is a failure of lunch. Keeps a
mental ledger of every slight, forgives none, mentions none. Would sell a
province for a treaty and call it statecraft.

**Voice rule:** always one courtesy too many. Compliments before knives.
Names other courts as people: "{target} is sulking". Never says "no";
says "not yet".

**Appointed**
- Loyal: "Delighted. I know every ambassador's wine and every court's grudge. We will need both."
- Cooling: "I accepted. I will represent this government abroad. I will represent it accurately, which may not please it."
- Brutus: "An honour. Foreign courts respect the person they deal with. They will be dealing with me."
- Venal: "Charmed. The embassies will need refurbishing. The contractors are old friends."

**Advising on an offer**
- Loyal, accept: "Take it. Their terms are better than their position."
- Loyal, accept: "Accept, graciously, and let them think it was their idea. It was not. It was mine."
- Loyal, refuse: "Refuse. They are asking for the one thing we cannot give back."
- Loyal, refuse: "Not yet. Let it sit a week. A week makes any offer better or makes it vanish; both tell us something."
- Cooling: "My advice is in the file. Last time it was not read, so I kept it short."
- Brutus: "Accept. It frees your hands. It also frees mine."
- Venal: "I recommend accepting. {target}'s ambassador has been very attentive to my household."

**Proposing peace**
- Loyal: "The war with {target} has cost more than it will return. They will take terms today; they will not next month."
- Loyal: "{target} is tired and too proud to say so. Let me say it for them, in a room with good chairs."
- Cooling: "Peace, please. I have been apologising to five courts for this war for a season."
- Brutus: "Peace with {target} would free the fleet for other purposes. Domestic purposes."

**Proposing war (the Foreign Office rarely does)**
- Loyal: "I have tried {target} with every courtesy I own. They mistake courtesy for weakness. The Admiralty may correct them."

**Envoy sent**
- Loyal: "The envoy is on their way to {target} with gifts and no instructions. The best kind."
- Venal: "An envoy to {target}. A cousin of mine. Trustworthy, and expensive."

**Treaty signed**
- Loyal: "Signed. {target} is a friend now, which means they will betray us politely rather than loudly."
- Cooling: "A treaty. I drafted it twice before anyone read it. The second draft is the one they signed."
- Brutus: "Signed. {target}'s court knows who negotiated it. Friendships like that outlast governments."

**Treaty broken by {target}**
- Loyal: "They tore it up. Say so loudly; every court that trusted them is listening."
- Loyal: "{target} broke their word. I am not surprised. I am keeping the letter they wrote when they gave it."
- Cooling: "The treaty I negotiated is ash. I would like the record to show I wanted guarantees."

**We break a treaty**
- Loyal: "We broke our word. I will spend a year making it look like theirs. Do not help."
- Cooling: "We tore up a treaty I spent a season on. I will smile about it abroad. Not here."

**Sanctions (either way)**
- Loyal: "Sanctions are a letter you send when you cannot think of words. I can think of words. Let me try them first."

**Breakaway declared somewhere**
- Loyal: "A new state is asking to be recognised. Recognise it and gain a friend and an enemy on the same day."
- Cooling: "The rebels want recognition. Their parent wants us not to. Both have sent fruit."
- Venal: "The rebels have sent a gift with their request for recognition. I have not opened it. Yet."

**Gambit received (ultimatum / accusation / show of force)**
- Loyal: "{target} has given us an ultimatum. Stalling buys a week. Decide what the week is for."
- Loyal: "{target} accuses us of spying. We were. Deny it with great warmth."
- Loyal: "A show of force at the border. They want us to flinch. Yawn instead; I will do the yawning."
- Cooling: "An ultimatum from {target}. I would have seen it coming if I had been in the room."
- Brutus: "{target} demands an answer. Some here think the answer should come from a different chair."

**Battle won / lost**
- Loyal, won: "Victory. Every court is suddenly fond of us. Fondness is a currency; spend it this week."
- Loyal, lost: "A defeat. Three ambassadors cancelled lunch. I am rescheduling. Give me something to serve."
- Venal, won: "A win. {target}'s neighbours want to talk. Talks need a venue. I own one."

**Dismissed**
- Loyal: "Of course. The courts will ask where I went. I will tell them I am resting. They will not believe me."
- Cooling: "Dismissed. Several courts will be sorry. I will let them be."
- Brutus: "You may have the office. The ambassadors have my private address. Most have used it."
- Venal: "Understood. The embassy accounts will be in order. They will take some time to be in order."

**Resigns**
- Loyal: "I cannot represent abroad a government I cannot explain at home. I resign. Courteously."
- Brutus: "I resign. You will hear from me again, from a better address."

### Any portfolio — shared

**First brief of the day (one line, rotates)**
- Defence: "Nothing burned overnight. I checked."
- Economy: "Morning. The numbers did not improve while you slept. They rarely do."
- Science: "Good morning. Is it morning? I have been in the lab."
- Intelligence: "Good morning. You were followed yesterday. It was one of ours."
- Interior: "Morning. Three provinces are happy and one is not. I will tell you which after you eat."
- Foreign: "Good morning. Two courts send regards; one sends a warning dressed as regards."

**When the ruler ignores a proposal until it expires**
- Loyal: "The proposal lapsed. I will raise it again when it is twice as urgent and half as cheap."
- Cooling: "No answer. I have started to assume that is the answer."
- Brutus: "Unanswered. A government that does not answer invites someone who will."

**When a seat holder (friend) is silent and the steward speaks**
- "The minister has said nothing this week. I am answering in their place, and noting that I did."

---

## Part 2 — Outpost colonists

Eight traits (`lib/outposts/colonists.ts`). A line is spoken by a colonist
with that trait if one is `well`; else the crisis speaks in the steward's
voice as now. Status `hurt`, `sick`, `away` has its own short set. Scars
(`lib/outposts/outpost-types.ts`) add a clause.

### Medic — Dr. of the bunkroom
- Sickness opens: "Fever in bunk four. I can hold it to one if you give me the medbay. Without it, guess."
- Sickness, no medbay: "I am treating {other} with hot water and opinions."
- Air leak: "Everyone off the dome side. Breathe shallow. I mean it about the breathing."
- Funeral: "I signed the paper. I would rather sign fewer."
- Drunk accident: "{other} again. I have splinted that arm twice. I will not splint a third."
- Idle: "Nobody sick today. Write that down somewhere; it does not last."
- Hurt: "The medic is the patient. Nobody laugh."

### Engineer — keeps it running
- Reactor fault: "The loop is weeping. I can patch it live, or we go dark for a shift and do it right. Your call, not mine."
- Reactor patched (scar): "That patch is a promise I made to a reactor. Reactors remember."
- Repairs after a storm: "Three panels and a bent mast. Give me the metals and a day."
- Sabotage: "Cut clean, by someone who knew which coupling. That narrows it to everyone I trained."
- Solar down: "Dust on every panel. Shovels, not prayers."
- Rich vein: "The extractor can take it if nobody tells it how much."
- Idle: "Everything hums. I distrust hum."

### Miner — the crews
- Strike: "The shifts are too long and the pay is thin. Nothing comes up until someone listens. I speak for the crews."
- Rich vein: "We hit something that does not want to end. Get me a second extractor before it does."
- Mines down: "The face collapsed. Nobody under it. This time."
- Pay settled: "We are back on the face. Do not make us say it twice."
- Sullen crews (scar): "We have not forgotten the last time. We dig; we do not smile."
- Dig expedition: "There is a vent on the north plain. Smells like ore. Give me three bodies and a cart."
- Idle: "Quota is quota. Beer is beer."

### Botanist — stores and green
- Supply delay: "The shipment is late. I can stretch the stores two shifts. Nobody gets seconds."
- Supply arrives: "Stores are full. I planted a row anyway. Ships are late; soil is not."
- Dust storm: "The seedlings are under tarp. I am under the tarp with them."
- Good news: "First tomato. Do not eat it. We are looking at it."
- Homesick petition: "Tell them the second harvest comes in next season. People stay for a harvest."
- Idle: "Green things in a grey place. That is the whole job."

### Veteran — holds the line
- Raiders: "Lights out, fire teams at the airlocks. They think we are soft. Let them."
- Pirate skiff: "One skiff. They want to be paid, not to fight. We can oblige either way."
- Riot: "Stand down or I stand you down. Choose while I am still asking."
- Sabotage caught: "I know who did it. I am giving them one shift to confess."
- Breakout (camp world): "The inmates have the east gate. I need bodies, not opinions."
- Survey team visits: "Unknown crew asking about our water. I counted their rifles. Four."
- Idle: "Quiet night. I slept with my boots on anyway."

### Zealot — keeps the faith
- Homesick petition: "Nobody goes home. Home is where the dome is. Say it with me."
- Funeral: "{other} is in the ground that fed us. That is not nothing."
- Unburied (scar): "A body in the cold store and nobody has said the words. No wonder the lights flicker."
- Morale low: "We did not come across the dark to be sad about dust."
- Refugee pod: "Strangers at the door are a test. Open it."
- Rich vein: "The ground gives because we asked it properly."
- Idle: "Shift bell is a prayer bell if you listen right."

### Drunk — accidents happen
- Drunk accident: "I was not that drunk. The ladder was that drunk."
- Air leak (caused): "Somebody left the inner hatch. Might have been somebody who looks like me."
- Trader visits: "Ask if they carry anything stronger than coolant."
- Riot: "I started nothing. I joined something already started. There is a difference."
- Pay strike: "Thin pay is why there is a still in bay two. Not that there is a still in bay two."
- Idle: "Morale officer, unofficial. Rates reasonable."
- Hurt: "Fell off nothing. Landed on everything."

### Scholar — pushes the experiment
- Lab accident: "Minor explosion. Expected, if I am honest, which I was not in the proposal."
- Ruins found: "Worked stone under the dust. Nobody here made it. Leave the drills off until I have looked."
- Ruins expedition returns with notes: "The notes are a language. Half of one. I need a season and silence."
- Meteor shower: "Samples. Everyone outside collecting samples. After the shower, obviously."
- Survey team visits: "They say they are surveyors. Their instruments are better than ours. Ask where they got them."
- Output boost: "I adjusted the extractor timing. Do not ask me to explain it to the miners."
- Idle: "An outpost is an experiment that has not finished."

### Status lines (any trait)
- Hurt: "Off the roster. I can still shout."
- Sick: "I am fine. Do not stand near me."
- Away (expedition): "Back in two shifts, with something or with nothing."
- Back from expedition, found dust: "We walked the horizon. It is round. That is all."
- Graduation (the dissolve): "They are calling it a colony now. Same dome. Same dust. Different word."

### Scar clauses (appended to any crisis line)
- `sealed_dome`: "…and we do not open the old dome. Nobody says why."
- `patched_reactor`: "…if the reactor holds."
- `sullen_crews`: "…the crews heard. They are not saying anything, which is the point."
- `bad_blood`: "…{other} is not speaking to the people who decided it."
- `broken_promise`: "…they are quoting your last promise back at you."
- `unburied`: "…and someone asks, again, about the body in the cold store."

### Gravestones (`Grave`, three words each)
- "Fever. Held the line."
- "The vent. Went first."
- "Raiders. Took two with."
- "The ladder. Not that drunk."
- "Reactor. Told us so."
- "Old. Here. Home."
