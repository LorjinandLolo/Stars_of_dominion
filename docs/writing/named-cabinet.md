# The named cabinet

Fixed, written characters in the cabinet, Suzerain-style: people with a
name, a past, something they want, and an arc the player can push one way
or the other. This is the design. The office personas and the line sheet
(`character-lines.md`, wired in `lib/government/minister-voices.ts`) stay
as the floor every minister stands on; the named characters stand on top
of it.

## What Suzerain does that we do not

Suzerain works because every minister is one specific person. Lileas Graff
is not "a loyal economist"; she is a reformer who will resign the day you
rig the court. You remember them because they want something, they
remember what you did, and their story ends.

We have the opposite: `leader-generator.ts` draws every minister from a
name list and a seed, `character.ts` gives them a background and a
temperament read off their numbers, `cabinet-service.ts` drifts loyalty
with the government's fortunes. It is an engine for a thousand ministers
and it produces nobody.

So: keep the engine, and put a **cast** in front of it.

## The shape

Every empire's first cabinet is six **written characters**, authored, with
a face, a past, a want and an arc. They sit in the same `Leader` records
the engine uses, with the same numbers, so every system that reads a
minister (advice, plots, loyalty drift, the crisis window, foreign ties,
dismissal, resignation, the brief) keeps working untouched. The character
layer is a `characterId` on the leader and a data file that says who that
is.

When a written character leaves office (dismissed, resigns, dies, exposed,
exiled) the engine's generated people fill the chair as they do today. The
cast is **finite**. That is the point: the second Minister of Defence is a
nobody, and the player feels the difference. Over a season an empire runs
through its cast and ends up governed by the engine, which is the arc of
the empire itself: the founders are gone, the clerks remain.

Six per empire × fourteen empires is 84 characters. Too many to write well.
Instead:

- **A shared pool of 24 characters**, four per office, each written for a
  *kind* of court (martial, mercantile, scholarly, theocratic, frontier,
  old-money) so they fit several civilizations. A character's data lists
  which civilizations it may serve and which it refuses.
- **Each empire draws one per office at founding**, deterministic from the
  faction id, never the same person in two empires in one galaxy. Fourteen
  empires × six seats = 84 draws from 24 people is impossible, so the pool
  is tiered: 24 is season one's *written* cast, drawn first by the human
  players' empires (claimed factions get full casts); AI empires get what
  is left, then the engine. A human always meets written people; an AI
  cabinet nobody looks at does not need them.
- **The friend in the seat** (`FactionSeat`) replaces the written character
  in that chair. The displaced character becomes a **courtier**: they keep
  their arc, lose their office, and can be the one who sounds your friend
  out for a plot, or who warns you about them. The Brutus path gets a
  narrator.

## A character

```ts
interface CabinetCharacter {
    id: string;                     // 'thessaly-vane'
    name: string;
    portfolio: CabinetPortfolio;    // the seat they are written for
    fits: string[];                 // civilizations / court kinds they will serve
    refuses?: string[];             // ones they will not (a pacifist will not serve the Infernoids)
    portrait: string;               // art slot
    age: number;
    background: string;             // a BACKGROUNDS id, so character.ts still works
    numbers: { loyalty: number; competence: number; corruption: number; ambitionDrive: number; politicalSkill: number };
    bio: string;                    // three sentences, what they did before you
    want: string;                   // one sentence, what they are here for
    fear: string;                   // one sentence, what they will not survive
    tells: string[];                // 3–5 lines of how they talk; the office persona is the floor, these are the ceiling
    arc: Arc;
}
```

Numbers are the **starting** numbers. After that the engine drifts them as
it drifts anyone's. The character layer never writes the numbers again;
it reads them. A written character whose loyalty has fallen to 30 is
written as Brutus by the same register picker as a generated one. What is
different is that their arc knows why.

### The arc

An arc is a short state machine over things the simulation already does.
No new mechanics, only **triggers on existing events** and **responses that
are existing orders or existing state changes**.

```ts
interface Arc {
    stages: ArcStage[];
}
interface ArcStage {
    id: string;
    /** What the character says when this stage begins: a brief line, a letter, or a crisis card. */
    opening: { kind: 'brief' | 'letter' | 'card'; text: string };
    /** Triggers that move the arc. All are things the chronicle or the government already records. */
    on: ArcTransition[];
    /** Standing modifiers while in this stage, applied through the engine's own fields. */
    while?: { loyaltyDriftBias?: number; corruptionDriftBias?: number; reliabilityShown?: number };
}
interface ArcTransition {
    when: ArcTrigger;
    to: string;
    /** What they do about it: nothing, a line, resign, start a plot, leak, ask for something. */
    does?: ArcAction;
}
```

Triggers are drawn from a fixed list, each already observable in code:

| Trigger | Where it comes from |
|---|---|
| `ruler_declared_war`, `ruler_made_peace`, `ruler_broke_treaty` | chronicle event types |
| `battle_won`, `battle_lost`, `fleet_destroyed`, `capital_lost` | chronicle |
| `crackdown`, `press_campaign`, `sanctions` | chronicle |
| `approval_below(n)`, `legitimacy_below(n)`, `cohesion_below(n)` | `GovernmentState` |
| `ruler_dismissed_minister(portfolio)` | `dismissMinister` |
| `ruler_ignored_my_advice(n)` | advisor ledger: n lapsed/declined proposals from this office |
| `ruler_took_my_advice(n)` | advisor ledger |
| `colleague_exposed`, `colleague_plotting` | `exposeSeat`, plots |
| `sounded_out` | `soundOut` reached this character |
| `friend_seated_in_my_chair` | `syncHumanMinisters` displaced them |
| `season_day(n)` | the clock |

Actions are drawn from a fixed list, each an existing verb:

| Action | Existing mechanism |
|---|---|
| `say` | brief line / letter / cabinet card (the line sheet, but this character's own text) |
| `resign` | `resignMinister` path at `RESIGNATION_LOYALTY` |
| `ask_for(policy)` | `suggestedPolicyId` on the advice card, and a proposal in the brief |
| `start_plot(kind)` | `startPlot` with this leader as plotter |
| `join_plot` / `report_plot` | `answerInvitation`, loyalty report |
| `leak(to: faction)` | a foreign tie (`foreign-ministers.ts`) created, later exposable |
| `take_bribe` | corruption +n, a chronicle event with `suspected:` attribution |
| `defect(to: faction)` | leaves; appears in that court's cabinet if they have a chair (season two) |
| `stand_by_you` | loyalty floor raised while the stage holds |

That is the whole system: data, a trigger reader on the chronicle and
government state, and a small runner in the strategic tick. The runner is
maybe 200 lines. The writing is the work.

### Where the player meets them

1. **Appointment letter** on day one: six letters in the first brief, one
   per minister, each written. The player learns the cast the way the
   brief already teaches everything else.
2. **The cabinet debate card** (`CabinetAdvice`): a written character's
   `tells` replace the office persona's lines for the routine hooks, and
   the office persona covers hooks the character has no line for. So a
   character needs 15–20 lines, not 60.
3. **Proposals in the brief** carry their name and their stance from the
   arc (a pacifist Foreign Minister proposes peace earlier and in her own
   words).
4. **Letters**: an arc stage opens with a letter in the brief: "I will say
   this once." The brief's messages section already renders letters from
   other players; a minister's letter is the same shape with a portrait.
5. **The crisis window**, plots, exposure, dismissal, resignation all name
   the character and quote their last line. The Brutus path was always
   written for a friend; now it has a face when there is no friend.
6. **The gazette**: a minister resigning or being exposed is a chronicle
   event with their name; the narrator already writes those. A written
   character gets a written obituary line in the data instead of a
   template.

## Season one cast: the twenty-four

Four per office. Each is written for a **court kind**, which maps to
civilizations loosely (a martial character fits the Infernoids, the
Kaer'Ruun and the Aurelians; a mercantile one the Banking Clan, the
Nullward Syndicate and the Gabagoonians; and so on). Names below are
placeholders in the house style of `leader-names.json`; the art slot is
open. Each entry: who, want, fear, arc in three beats.

### Defence

**Admiral Thessaly Vane** (martial, old-money). 61. Commanded the line at
a battle the gazette still names. *Want:* one more war she can win,
fought properly. *Fear:* to be the admiral who lost the fleet to a
politician's map. *Arc:* (1) Loyal while the fleet is used as she advises;
(2) if the ruler loses a battle after ignoring her battle group proposal
twice, she goes to the press ("I warned the cabinet") and her loyalty
floor drops; (3) a second defeat and she resigns with a letter the
gazette prints; dismiss her before that and she starts a *military* plot
instead. Her ending, if she is kept and listened to: she retires after a
victory, and the retirement letter is the best thing in the brief that
month.

**General Oyelaran Mbeki-Holt** (frontier). 44. A ground soldier in a
navy's chair, promoted for a siege nobody else could hold. *Want:* the
army treated as something other than the fleet's cargo. *Fear:* another
world left to starve under a lost orbit. *Arc:* loyal; asks for garrison
policy; if a siege is lost with the orbit abandoned he writes a letter
naming the world and his loyalty halves; if the ruler then makes peace he
forgives, if the ruler presses on he resigns and sits in the recruitment
pool as a governor.

**Marshal Idrenne Kask** (martial, theocratic). 52. Believes the war is
the state's prayer. *Want:* war, always, the next one. *Fear:* peace long
enough for people to ask what the fleet is for. *Arc:* loyal while at
war; at 90 days of peace she proposes war monthly; decline three times
and she is sounded out by any plot going and says yes; take the war and
she is the best minister in the game until it is lost.

**Commodore Pell Arvanitakis** (mercantile). 38. A convoy escort captain
who made admiral by keeping the Clan's freighters alive. *Want:* a navy
that pays for itself. *Fear:* being found out as a shopkeeper in uniform.
*Arc:* venal from the start (corruption 45); takes a yard contract bribe
at the first battle group order (a `suspected:` chronicle event the
intelligence minister may catch); if caught and kept, he is loyal for the
rest of the season out of gratitude; if caught and dismissed, he leaks the
fleet roster to whoever the Foreign Office is sanctioning.

### Economy

**Chancellor Wen Solvay** (mercantile, scholarly). 57. Wrote the tax code
of the previous government and has never stopped editing it. *Want:* a
balanced book, once, before she dies. *Fear:* the Banking Clan's loan
officer in her office. *Arc:* loyal; refuses to sign a Clan loan (she
proposes against it; take it anyway and her loyalty drops 20); if the
empire overextends past her capacity warning three times she sends a
letter listing the worlds she would let go, and resigns if a fourth is
taken; keep within her book for a season and she finds the money for one
thing the player wants, unasked.

**Treasurer Dag Oruun** (frontier, industrialist). 49. Built the first
refinery on a world nobody wanted. *Want:* industry on every rock. *Fear:*
the merchants running the Treasury again. *Arc:* loyal to a builder;
proposes expansion and infrastructure; cooling if the ruler funds the
fleet over the yards twice in a season; a strike he handles well (pay
them); a crackdown on strikers turns him Brutus and he starts talking to
the interior minister's rivals.

**Lady Ilse Brandt-Marrow** (old-money). 63. Her family owned the mint.
*Want:* the family's position preserved. *Fear:* reform. *Arc:* venal and
competent; every civil reform policy she opposes in cabinet; pass two and
she funds a plot (she never joins it; she pays); expose her and she is
the richest exile in the galaxy, which is its own problem for the
Foreign Office next season.

**Comptroller Yusuf Adeyemi-Lark** (theocratic, scholarly). 41. An auditor
by temperament and a believer by upbringing. *Want:* the ledgers clean.
*Fear:* finding the ruler's name in them. *Arc:* loyal; the one minister
whose corruption never rises; reports any colleague's corruption to the
ruler in the brief; if the ruler keeps a corrupt colleague after two such
reports he resigns and the gazette prints why. If the ruler acts, he is
yours for the season and raises the Treasury's competence.

### Science

**Professor Aurelio Nkemdirim** (scholarly). 66. Held the capital chair for
thirty years and treats cabinet as a seminar that has gone on too long.
*Want:* the drive project funded to the end. *Fear:* dying before it
works. *Arc:* content, nearly unplottable; asks for research every brief;
if the programme is cut twice he writes a letter and his health begins to
fall (the engine's own field); fund it through and the completion is an
event with his name on it, and he retires the day after.

**Dr. Sable Quist** (frontier, engineer). 35. Designed yards on a frontier
world and came to the capital angry about how slowly it builds. *Want:*
ships built faster. *Fear:* being made a politician. *Arc:* loyal,
ambitious; proposes industrial research; gets along with Oruun, fights
with Solvay; cooling if an Enlightenment bid is started (she thinks it is
mysticism); Brutus if her yards are sold to a company under host policy.

**Archon Veles Tamar** (theocratic). 58. Science as scripture: the
Enlightenment is the point of the state. *Want:* transcendence. *Fear:*
another empire getting there first. *Arc:* loyal while the programme
exists; proposes the bid; if a rival transcends ahead she proposes war on
them in the same breath; if the ruler sanctions a transcending rival
without war she calls it cowardice and leaks the programme to the rival
out of spite (a foreign tie).

**Magister Corwin Ashby-Dolores** (mercantile, old-money). 50. Patents
instead of papers. *Want:* the Academy's work owned. *Fear:* open
publication. *Arc:* venal; competent; sells research to a charter
company at the first subsidy; caught, he claims the state got its share;
dismissed, he founds a company under the host policy the next season.

### Intelligence

**Director Halvard Ness** (martial, intelligence). 54. The service nobody
names for twenty years. *Want:* to never be surprised again. *Fear:* a
ruler who tells enemies the plan at dinner. *Arc:* loyal, cold; reports
every sounding-out; if the ruler ignores a loyalty report naming a
plotter and the plot strikes, Ness is on the plotters' side in the crisis
window ("I told you. Twice."); if the ruler acts on his reports he is
the best insurance in the game.

**Madame Ottilie Ferrand** (old-money, diplomat turned spy). 59. Ran the
embassy in a rival court for a decade and ran its secrets longer. *Want:*
the rival court humbled. *Fear:* her own file. *Arc:* loyal, grudge-led;
proposes operations against one specific rival empire (the one nearest
at founding); if the ruler makes peace with that empire she cools; a
treaty with them and she leaks it to their rebels (a foreign tie with
the breakaway).

**Brother Tomasz Ilyen** (theocratic). 46. Confessor to the previous ruler;
hears everything. *Want:* the court's souls in order. *Fear:* sin at the
top. *Arc:* loyal; refuses crackdowns (proposes against, loyalty drops
on each); a press campaign of lies turns him cooling; he never plots, but
he reports the ruler's own foreign ties to the interior minister, which
is how the crisis window opens with a priest in it.

**"Jace"** (frontier, no surname given). 33. A smuggler turned informant
turned director, because nobody else knew the belt. *Want:* a pardon that
sticks. *Fear:* the old crew. *Arc:* venal, competent, loyal to whoever
holds the pardon; a pirate marque or covert sponsorship raises her
competence (she knows the people); sanction the Nullward Syndicate and
she takes a bribe from them the same week; keep her clear of the belt and
she stays clean and grateful.

### Interior

**Minister Rosalind Achebe-Marr** (party organiser). 48. Carried the
founding vote district by district. *Want:* the provinces loved. *Fear:*
losing a world to secession on her watch. *Arc:* loyal; proposes welfare
and governors; cohesion under 40 and she sends a letter with a plan;
ignore it and a world secedes, she resigns with the gazette's sympathy;
take it and the world stays, and she is the one minister whose approval
the people track.

**Prefect Gaius Vorne** (martial, magistrate). 55. Order first. *Want:*
quiet. *Fear:* a crowd. *Arc:* loyal to a strong hand; proposes
crackdowns; each crackdown the ruler approves makes him more loyal and
the provinces less; each refused makes him cooling; at Brutus he does
not plot, he simply stops reporting the provinces honestly, and the
first the ruler hears of the secession is the chronicle.

**Dame Henrike Ostrova** (old-money, governor). 62. Governed the richest
world for twenty years before the founding; believes the capital is a
guest in her provinces. *Want:* the provinces to run themselves. *Fear:*
a centraliser. *Arc:* cooling from the start (loyalty 50); proposes
devolution; admin capacity built in the capital turns her Brutus and
she starts a *secession* plot on her home world; build it in the
provinces and she is loyal for life.

**Citizen Ade Lumumba-Tarn** (frontier, theocratic). 39. A preacher who
became a governor who became a minister by being the only one the
frontier trusts. *Want:* the frontier represented. *Fear:* becoming the
capital. *Arc:* loyal; the one minister who answers outpost crises in
the brief with a line; a camp world or forced labour turns him cooling,
a second one Brutus, and his plot is a *breakaway* with the frontier
worlds, which is the one plot the player might want to lose.

### Foreign

**Ambassador Celeste Marrow-Ngata** (diplomat). 53. Envoy to three courts,
on speaking terms with all of them, trusted by none. *Want:* a treaty
that outlives her. *Fear:* a ruler who breaks one. *Arc:* loyal; proposes
treaties; one broken treaty and she is cooling with a letter; a second
and she resigns in a letter the rival court quotes back at the player
forever (the narrator stores it as precedent).

**Lord Anselm Vey** (old-money). 67. A name older than the state and a
wine cellar older than the name. *Want:* the old courts kept sweet.
*Fear:* a vulgar war. *Arc:* venal-adjacent (corruption 35, rising); takes
gifts from every ambassador; proposes peace always; war on an old-money
court turns him Brutus and he leaks the war plan to them in the first
week, which Ness catches if he is still in post.

**Envoy Tariq Sol-Benedek** (frontier, mercantile). 42. Negotiated the
Clan's first loan to a frontier world and got the world a better rate.
*Want:* trade over treaties. *Fear:* sanctions. *Arc:* loyal; proposes
company host policy and trade; sanctions on anyone turn him cooling, a
second set Brutus; he never plots, he defects to the sanctioned court if
they have a vacant chair (season two) or resigns and founds a company.

**Sister Maren Oduya** (theocratic). 45. A missionary in a rival court for
ten years; came back fluent and unforgiving. *Want:* the faith's enemies
isolated. *Fear:* a treaty with them. *Arc:* loyal, proposes sanctions on
the court she lived in; a treaty with them turns her Brutus and she
*reports the ruler to the interior minister* as a heretic, which is a
plot of kind `coup` with the Interior minister as the recruit.

## How it sits in the code

- `data/leaders/cabinet-cast.json`: the twenty-four, in the shape above.
- `lib/leadership/cast.ts`: `drawCast(world, factionId)` at founding
  (`ensureCabinets` calls it before generating anyone) and
  `characterOf(leader)`; writes `characterId` and the starting numbers on
  the `Leader`, keeps a `world.cast` map of who is drawn where, so no
  character is in two courts.
- `lib/government/arcs.ts`: the runner. Once per strategic tick, for each
  active character, read the chronicle events since the last tick and the
  government state, evaluate the stage's transitions, apply actions
  through existing services, write `stage` on the leader's history. The
  arc state is `{ stage, since }` on the leader record (shard, so it is
  the owner's and scrubbed from foreign views like plots).
- `minister-voices.ts` gains a lookup: a written character's `tells`
  and stage `opening` texts are tried before the office persona's line for
  the same hook. Same `ministerLine` signature, same register picker.
- The brief gets `letter` as a decision kind with a portrait and no
  buttons; the appointment letters on day one are six of them.
- `human-ministers.ts`: when a seat displaces a character, mark them
  `courtier` (status active, no portfolio, `seatDisplaced: true`); the
  plots runner may use a courtier as a sounder-out or a reporter.
- Fog: a character is public knowledge by name and office; their arc
  stage and numbers are the owner's (shard). The narrator writes about
  them only through chronicle events, as now.

Probe: `scripts/cast-probe.ts`: a claimed faction draws six written
characters, no duplicates across fourteen draws, a seat displaces one
into courtier, each arc's triggers fire from a planted chronicle event,
each action resolves through its service, and a character who leaves is
replaced by the engine's generated person.

## What this is not

- Not a dialogue tree. Suzerain's conversations are the one thing we do
  not copy: the game has no conversation surface and should not grow one
  for this. A character talks through the brief, the card, letters and
  the gazette, all of which exist.
- Not a cast per civilization. The pool is written for court kinds; the
  civilizations' own flavour stays in the rites and policies they already
  have. A Sarrak Admiral Vane is still Vane.
- Not new mechanics. Every trigger is an existing event; every action an
  existing verb. If an arc needs something the game cannot do, the arc is
  wrong, not the game.

## Order of work

Step 1 landed 2026-10-27: `data/leaders/cabinet-cast.json` (six people, one per
office), `lib/leadership/cast.ts` (`drawCast` on claim from `ensureCabinets`
and `tickCabinets`, `characterOf`, `world.cast` records the draw), the voice
lookup in `minister-voices.ts`, probe `scripts/cast-probe.ts`. Displaced
generated ministers retire rather than entering the pool.

Step 2 landed 2026-10-27: `lib/government/arcs.ts` (the runner, called from the
worker right before the chronicle flush with `peekBuffer()`, so each cycle's
events are read once; triggers event / stat / advice_ignored / advice_taken /
dismissed / day; actions say (letter or card line) / resign / ask_for /
stand_by_you), `lib/government/letters.ts` (`world.ministerLetters`, shard only,
scrubbed for seats, the brief's Letters section), arcs and appointment letters
on all six characters. Offices that share the 'government' delegated system
count only proposals made in their own name. Probe `scripts/arc-probe.ts`.

1. Data shape, the cast file with six characters (one per office), the
   draw, `characterOf`, the voice lookup. The card and proposals show
   written people. One day.
2. The arc runner with the trigger reader and the `say`, `resign`,
   `ask_for`, `stand_by_you` actions. Appointment letters. One day.
3. The plot actions (`start_plot`, `join_plot`, `report_plot`, `leak`,
   `take_bribe`) and the courtier state. One day.
4. The other eighteen characters, written against the probe. The writing
   is most of the time; the code is already there by then.
5. Portraits: twenty-four art slots. Placeholder initials until then.
