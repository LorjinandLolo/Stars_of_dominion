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

A friend holding the seat (`FactionSeat`) speaks in their own words; these
lines are the *generated* minister's, and the steward's fallback when a
seat holder is silent.

### Defence (the Admiralty)

Hooks: `advisor-desk.ts` war proposal, battle group proposal, "Blame the
admiral" reaction (`GOV_DISMISS_MINISTER` defence), battle lost/won in the
brief, siege started, fleet destroyed.

**Proposing war**
- Loyal: "{target} has thinned their border fleets. We will not get a cheaper war than this one."
- Cooling: "I can give you {target} if you give me the ships. I have asked twice."
- Brutus: "The fleet is ready for {target}. It would be ready for anything, frankly."
- Venal: "A war with {target} would be good for the yards. Several yards. I know the owners."

**Asking for a battle group**
- Loyal: "Three cruisers and a screen. Approve it tonight and they sail before the storm."
- Cooling: "I will not send men into {target}'s guns with what we have. Sign the order or find another admiral."
- Brutus: "A battle group under my flag, answering to me in the field. You would not want to micromanage a war."
- Venal: "The contract for the hulls should go to Harrow Yards. Their quote is higher. Their captains are loyal to me."

**After a battle lost**
- Loyal: "We lost the field. I take it. Tell me whether you want the fleet rebuilt or the war ended, and I will do either."
- Cooling: "I warned the cabinet about {target}'s torpedo boats. The minutes will show it."
- Brutus: "A defeat like this makes people ask who is really in charge. I have been asked. I have not answered yet."
- Venal: "The ships were underpowered. The refit money went somewhere. I will look into where."

**On being dismissed (the "Blame the admiral" button)**
- Loyal: "Understood. The duty rosters are on your desk. Do not let them put a politician in this chair."
- Cooling: "So it was my fault. Very well. Remember who signed the deployment order."
- Brutus: "You can take the chair. The captains know whose orders they trusted."
- Venal: "I expect the pension is still in order. I expect that very much."

**Siege begun on {world} (defending)**
- Loyal: "They have landed on {world}. The garrison is dug in and the shield is up. Give me the orbit back and they will starve."
- Cooling: "If you had let me station the second fleet at {world}, we would not be reading this."
- Brutus: "{world} will hold or it will not. Either way the army will remember who was on the ground."

**Idle, no war**
- Loyal: "Quiet border. I am drilling the reserves anyway. Quiet is when they come."
- Cooling: "A peacetime navy rusts. So does a peacetime admiral."
- Venal: "The fleet is at readiness. The readiness reports cost extra this quarter."

### Economy (the Treasury)

Hooks: upkeep, overextension, subsidies and host policy, Banking Clan loans,
pay strike at an outpost echoed in the brief, `DIP_IMPOSE_SANCTIONS` (ours
or on us).

**Routine**
- Loyal: "The books balance. Barely. Do not start anything expensive this month."
- Cooling: "I keep finding orders I was not told about. It makes a budget hard to defend."
- Venal: "Receipts are in order. Some of the order is mine."

**Overextended (admin capacity exceeded)**
- Loyal: "We govern more worlds than we can count. Either we build the offices or we stop taking planets."
- Cooling: "Every new world is another ledger nobody reads. I have stopped pretending I read them."
- Brutus: "An empire this size needs more hands at the top. I have been told I have good hands."

**Loan offered by the Banking Clan**
- Loyal: "The Clan's terms are fair for now and ruinous later. Take it only if the war is short."
- Venal: "The Clan is offering generous terms. Very generous. I negotiated them personally."

**Sanctions imposed on us**
- Loyal: "{target} has closed their markets. We will feel it in two months. We will survive it in six."
- Cooling: "Sanctions. Again. I did say the envoy was a mistake."

**We impose sanctions**
- Loyal: "Sanctions hurt us too. I assume you know that and want it anyway."
- Venal: "Sanctions on {target}. There will be smugglers. I have already met some."

### Science (the Academy)

Hooks: research choice, Enlightenment bid (ours or another's), lab accident
at an outpost, tech-gated reaction greyed out, scholar expedition findings.

**Routine**
- Loyal: "The current programme finishes in a season. I would like a word about the one after."
- Cooling: "My budget was cut to pay for hulls. The hulls are made of my budget's ideas."
- Brutus: "Knowledge should not wait on one person's signature. Some of the faculty agree."

**Another empire transcends**
- Loyal: "{target} is reaching for Enlightenment. If they get there, nothing we build will matter. Stop them or race them."
- Venal: "{target}'s programme is ahead of ours. Their lead scientist is for sale. So, in a sense, am I."

**Our own Enlightenment bid**
- Loyal: "We are close. The whole galaxy will try to stop us now. Hold the line a little longer."
- Brutus: "When we cross, someone will be remembered for it. I would like it to be the right someone."

**A tech gate blocks an order**
- Loyal: "You cannot send envoys that way yet. Give the Academy a season on the diplomatic sciences and you can."
- Cooling: "You asked for something we have not invented. I did suggest funding it."

**Ruins found by an expedition**
- Loyal: "The notes from the ruins are older than our calendar. Let me have them before anyone sells them."
- Venal: "Fascinating artefacts. I have appraised them. Privately."

### Intelligence (the Desk)

Hooks: counter-intel and case board (`lib/espionage/`), operation exposed
(ours or theirs), agent captured, loyalty reports (`loyaltyReports`), plot
warnings, seat exposure (`exposeSeat`).

**Routine**
- Loyal: "Nothing to report. That is a report. Someone is paying for silence."
- Cooling: "I would tell you more if the cabinet leaked less."
- Brutus: "I know everything that happens in this government. Including the things about you."

**Operation exposed, ours**
- Loyal: "They caught our hand in {target}'s pocket. Deny it. I will make the denial plausible."
- Venal: "The operation leaked. Someone was paid. I am investigating the payment. It was large."

**Operation exposed, theirs on us**
- Loyal: "{target} ran a network inside the Admiralty. Rolled up. I would like two of them turned, not shot."
- Cooling: "Found a {target} network. Found it late. We are understaffed, as I keep saying."

**Loyalty report (someone sounded out a plot)**
- Loyal: "A loyal officer was approached about a 'change of leadership'. The name is in the file. It is a name you trust."
- Brutus: "Rumours of a plot. Nothing solid. I will keep looking." *(and does not.)*

**A minister's foreign tie exposed**
- Loyal: "Your minister of {portfolio} has been taking money from {target} for a year. The proof is clean. Act before they hear I have it."
- Venal: "I have evidence against a colleague. I have not decided what it is worth yet."

### Interior (the Home Office)

Hooks: approval, cohesion, secession spiral, crackdown, rebel act, riot or
strike at an outpost, gazette "Rally the press", crisis window.

**Routine**
- Loyal: "Approval holds. The provinces are quiet. Quiet provinces vote; remember that."
- Cooling: "The provinces ask me what the capital wants. I have stopped guessing."
- Brutus: "The people want a steady hand. They do not much mind whose."

**Cohesion falling**
- Loyal: "The outer worlds are drifting. Give them a governor they chose or they will choose one themselves."
- Cooling: "Secession talk on three worlds. I sent you the warning. The warning is now a fact."

**Press campaign ("Rally the press")**
- Loyal: "The gazette is ours for a week. Use it well; they remember being used."
- Venal: "The press will say what we need. Two editors needed convincing. The convincing is on the books as 'paper'."

**Crackdown ordered**
- Loyal: "The cells are broken. So is a great deal of trust. Do not ask me to do it twice."
- Brutus: "The crackdown worked. The security services answer to me now. That seemed efficient."

**Crisis window (a plot moves)**
- Loyal: "Troops are moving in the capital on nobody's order. I have the guard. Tell me whose side to put it on."
- Brutus: "It is done. Stay in your rooms and it will go gently."

### Foreign (the Foreign Office)

Hooks: `ministryAdvice` on offers, peace proposal in the advisor desk,
envoys, treaties signed/broken, tribute, breakaway recognition, gambits.

**Advising on an offer**
- Loyal, accept: "Take it. Their terms are better than their position."
- Loyal, refuse: "Refuse. They are asking for the one thing we cannot give back."
- Cooling: "My advice is in the file. Last time it was not read, so I kept it short."
- Venal: "I recommend accepting. {target}'s ambassador has been very attentive to my household."

**Proposing peace**
- Loyal: "The war with {target} has cost more than it will return. They will take terms today; they will not next month."
- Brutus: "Peace with {target} would free the fleet for other purposes. Domestic purposes."

**Treaty broken by {target}**
- Loyal: "They tore it up. Say so loudly; every court that trusted them is listening."
- Cooling: "The treaty I negotiated is ash. I would like the record to show I wanted guarantees."

**Breakaway declared somewhere**
- Loyal: "A new state is asking to be recognised. Recognise it and gain a friend and an enemy on the same day."
- Venal: "The rebels have sent a gift with their request for recognition. I have not opened it. Yet."

**Gambit received (ultimatum / accusation / show of force)**
- Loyal: "{target} has given us an ultimatum. Stalling buys a week. Decide what the week is for."
- Brutus: "{target} demands an answer. Some here think the answer should come from a different chair."

### Resignation and the exit

Any portfolio, loyalty under the resignation floor:
- "I have served three governments. I will not serve this one further. My letter is on the desk."
- Venal: "I am resigning for family reasons. The family has grown considerably."
- Brutus: "I resign. You will hear from me again."

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
