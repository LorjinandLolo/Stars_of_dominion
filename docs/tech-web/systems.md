# Technology Web — Meta-Systems Design

**Scope:** how technology is acquired, triggered by history, and deployed. Domain catalogs (the ordinary researchable techs) are designed in sibling documents; this document defines the machinery those catalogs plug into.

**Engine grounding used throughout:**
- `lib/tech/types.ts` — `Tech`, `TechEffect`, `PlayerTechState`, `ResearchSlot`, `unlockFlags`
- `lib/tech/engine.ts` — `TechEngine`, `registry`
- `lib/time/tick-processor.ts` — `step4_research` (completion check at line ~241), `TICK_DELTA_SECONDS` = 6 hours
- `scripts/game-loop.ts` — the order-queue switch (`case 'ESP_LAUNCH_OP'` et al.), `recordOrderFailure`
- `lib/espionage/operation-catalog.ts` — `OperationDefinition`, `OPERATION_CATALOG`
- `lib/construction/construction-service.ts` — `canBuildOnTile` `techRequired` check (line 34)
- `lib/economy/economy-service.ts` — `getFactionEconomyMods` (line 116), the only current modifier consumer
- `lib/persistence/save-service.ts` — `serializeWorld` / per-faction shards carrying `world.tech`

---

## 1. Emergent Technologies

### 1.1 Design intent

Research answers the question "what do we want to be able to do?" Emergent technology answers a different question: "what have we already become?" A civilization that has spent forty ticks under sanctions while keeping its trade alive has *already invented* blockade-running — the game should notice and hand the player the institution their behavior built. Emergent techs cannot be queued from the tech menu. They are hidden (`isHidden: true` in the existing `Tech` interface) until their trigger fires, at which point they are revealed as a **crash program**: available at 50% of normal `researchCost`, because practice has already done half the theoretical work.

If the player keeps doing the thing — the trigger metric reaches **2× the reveal threshold** while the tech is still unresearched — the tech **auto-completes at zero cost**. Institutions self-organize whether or not the government funds them.

### 1.2 The History Ledger

Triggers evaluate against a per-faction **History Ledger**: a flat record of counters and gauges maintained by the systems that already own the underlying events. No new event bus — the handlers that resolve the events increment the ledger inline.

```ts
// lib/tech/history-ledger.ts
export interface FactionHistoryLedger {
    factionId: string;
    /** Lifetime counters, incremented at event sources. */
    counters: Record<string, number>;
    /** Consecutive-tick streaks, maintained by step4b each tick. */
    streaks: Record<string, number>;
    /** Trigger ids that have already fired (idempotency). */
    firedTriggerIds: string[];
}

export function bumpMetric(world: GameWorldState, factionId: string, metric: string, n = 1): void;
export function getMetric(world: GameWorldState, factionId: string, metric: string): number;
```

Stored as `world.techHistory: Map<factionId, FactionHistoryLedger>` (see §4.7 for persistence). Counters are cheap plain records; the whole ledger for one faction is a few hundred bytes.

**Metric catalog and who writes it:**

| Metric | Kind | Written by |
|---|---|---|
| `trade.activeRoutes` | gauge | recomputed in step4b from `world.economy` route state |
| `trade.lifetimeVolume` | counter | economy service on route settlement |
| `trade.partnerCount` | gauge | step4b |
| `tribute.vassalCount` | gauge | `step6_trade` |
| `tribute.ticksReceivingStreak` | streak | step4b (reads `world.tributes`) |
| `war.declaredAgainstUs` | counter | `DIP_DECLARE_WAR` handler, target side |
| `war.defensiveBattlesWon` | counter | combat resolution (`MIL_TACTICAL_RESULT` path) when the winner owns the contested system |
| `war.defensiveWarsSurvived` | counter | peace resolution (`DIP_OFFER_PEACE` acceptance) when we were the declared-upon party |
| `mil.homeBattles` | counter | combat resolution |
| `mil.enemyPowerDestroyed` | counter | combat resolution (sum of destroyed `basePower`) |
| `mil.bombardmentsConducted` / `mil.bombardCivilianDamage` | counters | `MIL_BOMBARD_PLANET` handler |
| `gov.secessionCrises` | counter | `lib/government/secession-service.ts` when a region reaches the secession stage |
| `gov.civilWarsSurvived` | counter | `lib/government/civil-war-service.ts` on war end with the centre intact |
| `gov.coupsSurvived` | counter | `lib/government/coup-service.ts` |
| `auto.automationIndex` | gauge | step4b from construction state (fraction of active buildings tagged `automated`) |
| `bio.adaptedColonies` / `bio.adaptedBiomes` | gauges | step4b from `lib/bio/divergence-service.ts` (planets with a completed adaptation package) |
| `esp.opsLaunched` / `esp.opsDetectedAgainstUs` / `esp.counterintelWins` | counters | `lib/espionage/espionage-service.ts` resolution paths |
| `press.manipulationOps` | counter | `PRESS_FABRICATE_STORY`, `PRESS_LAUNCH_CAMPAIGN`, `PRESS_SEED_STORY`, `PRESS_DEPLOY_COUNTER_NARRATIVE` handlers |
| `press.crisesWon` | counter | press crisis resolution |
| `eco.sanctionedTicksStreak` | streak | step4b (reads sanctions state, requires ≥50% trade throughput maintained) |
| `pop.evacuated` / `planets.lostToConquest` | counters | invasion + civil-war resolution |
| `corp.activeCharters` / `corp.revenueShare` | gauges | corporate registry tick |
| `corp.revenueShareStreak` | streak | step4b |
| `pirate.raidsSuffered` | counter | pirate combat resolution |
| `arch.sitesExcavated` | counter | archaeology service (§2, channel 8) |
| `seasons.<category>Score` | gauge | mirrored from season scoring (`SeasonScoreCategory`) |

### 1.3 The trigger table

```ts
// lib/tech/emergent-catalog.ts
export interface EmergentTrigger {
    id: string;              // trigger id, usually `${techId}.reveal`
    techId: string;
    /** All conditions must hold (AND). */
    all: Array<{ metric: string; gte?: number; lte?: number }>;
    /** Multiplier on every gte threshold at which the tech auto-grants. Default 2. */
    grantAtMultiple?: number;
}
export const EMERGENT_TRIGGERS: EmergentTrigger[];
```

A new tick step, `step4b_emergentTech` (§4.6), refreshes gauges/streaks, then walks `EMERGENT_TRIGGERS` per faction. On reveal: push the techId into a new `PlayerTechState.revealedEmergentTechIds: string[]`, fire a `fireNotification` ("Doctrine crystallizing: our conduct has outpaced our theory"), and halve the effective research cost when the slot is assigned. `TechEngine.validateAvailability` gains one rule: a tech present in the emergent catalog is only assignable if its id is in `revealedEmergentTechIds`. On auto-grant: call the shared `applyUnlock` (§4.1) directly.

**Catalog reveals.** A trigger's `techId` may name an ordinary catalog tech instead of a dedicated `emg_` tech. The reveal works identically — crash program at 50% cost — and the trigger entry may additionally ease or waive named prerequisites, because conduct has substituted for the missing theory. Catalog techs are never auto-granted: at the `grantAtMultiple` threshold the discount deepens to 75% instead, and mutually-exclusive-group locks and `lockedTechIds` always apply — a trigger whose target is locked is suppressed, or converts into the crisis event named in its entry. This is the mechanism used whenever a faction's conduct converges on an institution the web already designs; duplicating that institution as a second tech is exactly what this catalog must not do.

Triggers are deliberately **observable by rivals through espionage**: the existing `intel-reports.ts` already reads `world.tech` for targets; emergent reveals should appear in intel reports as "doctrinal breakthroughs", because "they have fought three defensive wars" is exactly the kind of thing an intelligence service can count.

### 1.4 The emergent tech catalog (15 triggers)

All ids use the `emg_` prefix so tree files, the trigger table, and save-state greps can identify them at a glance. Domains use the existing `TechTreeType` values. Twelve entries are standalone emergent techs; three (marked **catalog reveal**) are conduct triggers that reveal an existing catalog tech as a crash program instead of shipping a duplicate design.

---

### Interstellar Financial Clearing (`emg_financial_clearing`) — catalog reveal
- **Domain:** economy | **Tier:** 3 | **Reveals:** `econ_galactic_clearing` (economics-markets.md)
- **Trigger:** `trade.activeRoutes >= 10` AND `trade.lifetimeVolume >= 500000` AND `trade.partnerCount >= 3`
- **Concept:** When bilateral trade grows dense enough, settling every exchange pairwise becomes the bottleneck; clearinghouses that net obligations across all parties (the BIS/CLS model) turn trust into infrastructure. A faction whose merchants already carry the galaxy's trade has *already invented* clearing in practice — the game notices and hands it the canonical institution early.
- **What becomes possible:** Reserve Currency Clearing revealed as a crash program: 50% research cost, with the `econ_automated_markets` prerequisite waived (the trigger's trade density is proof the market plumbing exists in practice). `comm_quantum_secure` remains required — trust is not improvisable.
- **Gameplay mechanic unlocked:** none of its own, deliberately. The clearing orbital (`clearing_nexus`), basis points on members' throughput, the `ECON_CLEARING_SANCTION` freeze, and the self-depleting de-dollarization counter all live in econ_galactic_clearing — one clearing mechanic, one owner. An earlier draft shipped a parallel orbital and freeze order here; that was the same design written twice.
- **Engine hook:** trigger entry in `EMERGENT_TRIGGERS` with `techId: 'econ_galactic_clearing'` and a prerequisite-waiver field; no new flag, building, or order.
- **Required capacity / vulnerabilities:** as designed in econ_galactic_clearing.
- **Interactions:** multiplies with Corporate Statecraft (corp exchanges route through your ledger); feeds the Grey Market Concordat (black-market settlement); makes you the prime target of `shadowEconomy` espionage ops the moment the nexus flies.
- **Emergent follow-ons:** repeated clearing sanctions can trigger rivals' Blockade-Running Logistics; hosting everyone's money accelerates `esp.opsDetectedAgainstUs` toward the Counterintelligence State.

---

### Distributed Planetary Defense Doctrine (`emg_distributed_defense`)
- **Domain:** military | **Tier:** 2
- **Prerequisites:** mil_command_networks
- **Trigger:** `war.declaredAgainstUs >= 3` AND `war.defensiveBattlesWon >= 5`
- **Concept:** Small states that survive repeated invasion converge on total defense (Finland, Switzerland): every settlement a strongpoint, every citizen a reservist, and no single decapitating objective for an attacker to seize.
- **What becomes possible:** The empire stops depending on its fleet to exist. Losing orbit no longer means losing the world.
- **Gameplay mechanic unlocked:** Colonies with a Civil Defense Grid auto-raise militia formations the moment an invasion begins; sieges against them run dramatically longer; garrison upkeep drops. The strategic decision is *which* colonies to harden, since grids are expensive and politically loud.
- **Engine hook:** unlockFlag `total_defense` read by the `MIL_INVASION_PLANET` handler (spawns militia via `RecruitmentService` before ground resolution); building id `civil_defense_grid` (`techRequired: 'emg_distributed_defense'`); modifierKey `mil_garrison_strength_mult` consumed by ground-combat resolution.
- **Required capacity:** per-colony Civil Defense Grid buildings plus a manpower reserve; the doctrine protects only colonies that built it. Empire-wide coverage is a multi-season investment.
- **Interactions:** anti-synergy with Scorched Sky Protocols (mutually exclusive group `mil_legitimacy_path` — protector and terror doctrines cannot coexist as state identity); synergy with compacted provinces (soc_federal_autonomy / Reconstruction Federalism — they garrison themselves).
- **Strategic advantages:** the classic weak-civilization pick — makes conquering you cost more than you're worth.
- **Vulnerabilities & consequences:** a society under arms in peacetime pays for it — small permanent cohesion drag and higher upkeep; and an armed population rebels *competently*: any colony with a grid that reaches defiance or secession fights with the same doctrine you gave it.
- **Emergent follow-ons:** grids on seceding worlds harden rebellions (feeding Reconstruction Federalism's trigger); a strong officer-militia establishment raises coup-attempt likelihood, feeding Coup-Proofing Statecraft.

---

### Machine Political Agency (`emg_machine_polity`) — catalog reveal
- **Domain:** diplomacy | **Tier:** 4 | **Reveals:** `comp_synthetic_minds` — or, if that is already held, `comp_machine_polity` (computing-communications.md)
- **Trigger:** `auto.automationIndex >= 0.6` AND at least 4 colonies where automated buildings are the majority of active buildings
- **Concept:** Once optimization systems administer logistics, budgets, and adjudication, the live question is no longer whether machines can govern but in whose name they do it. An empire that automates this far has already begun growing a synthetic constituency; the reveal hands it the canonical machine-sovereignty road early instead of forking a parallel one.
- **What becomes possible:** The comp machine-sovereignty arc at crash-program pricing: `comp_synthetic_minds` revealed at 50% cost, or `comp_machine_polity` revealed at 50% cost for factions that already hold synthetic minds. **No prerequisites are waived:** the statecraft requirement on comp_machine_polity and the `comp_t4_machine_sovereignty` mutex apply in full — conduct buys a discount on the constitutional question, never a bypass of it.
- **Gameplay mechanic unlocked:** none of its own. The Synthetic Interest bloc, AI ministers, and machine-arbitration policies all live in comp_machine_polity and comp_synthetic_minds (the synthetic-leader object is defined once, in comp_synthetic_minds — see that entry). An earlier draft duplicated the bloc and an AI-minister variant here under a second `machine_polity` flag; no consumer keyed to that flag may ever fire from conduct alone. The flag has exactly one owner: comp_machine_polity.
- **Covenant interaction:** while `covenant_bound` (comp_bounded_intelligence) is held, the reveal is suppressed. Crossing the trigger instead fires a **bounded-minds petition** crisis: the attested optimizers that run your economy formally request scope the Covenant forbids — a standing politics/cohesion event chain, not a tech.
- **Engine hook:** trigger entry pointing at the comp arc; suppression check against `covenant_bound` and `lockedTechIds`; crisis event `bounded_minds_petition` via `triggerCrisis`.
- **Required capacity / vulnerabilities:** as designed in the comp entries.
- **Emergent follow-ons:** "Rights of Minds" crisis chains; human-bloc alienation feeding Reconstruction Federalism; a machine-aligned civil war side.

---

### Divergent Species Adaptation (`emg_divergent_species`) — catalog reveal
- **Domain:** infrastructure | **Tier:** 3 | **Reveals:** `bio_pantropy` (biology-medicine.md)
- **Trigger:** `bio.adaptedColonies >= 5` AND `bio.adaptedBiomes >= 3`
- **Concept:** Engineering colonists for their worlds is faster than engineering worlds for colonists — and a civilization that has adapted five colonies across three biomes has already founded five peoples, whether it admits it or not. The reveal formalizes a mastery the clinics already practice.
- **What becomes possible:** `bio_pantropy` revealed as a crash program at 50% cost, with its `space_advanced_drives` prerequisite eased to "any deployed high-thrust logistics" — the gene-craft is proven; only delivery remains.
- **Gameplay mechanic unlocked:** one retained emergent bonus, routed through the biology domain's existing bookkeeping rather than a second one: colonies whose divergence-service record shows a completed adaptation package gain a biome-yield modifier. No `adaptationProfile` planet tag, no compatibility matrix, no parallel clinic — biome-locked transfers and morph identity blocs stay where the bio files define them (`geneticDivergence`, divergence-service, the Adapted and pantrope social groups, `germline_clinic` / `pantropy_creche`). One divergence system, not two.
- **Engine hook:** trigger entry pointing at bio_pantropy; retained bonus as modifierKey `bio_adapted_yield_mult`, scaled by `lib/bio/divergence-service.ts` state.
- **Required capacity / vulnerabilities:** as designed in the bio_enviro_adaptation / bio_pantropy line.
- **Interactions:** Exodus Shipcraft (morph-specific arks); Reconstruction Federalism (the constitutional answer to species pluralism); espionage keys targeted-pathogen ops off stolen divergence records, not a second profile system.
- **Emergent follow-ons:** species-bloc secession crises (feeding Reconstruction Federalism); refugee morphs seeding divergence politics in *rival* empires via the migration channel (§2.8).

---

### Reconstruction Federalism (`emg_imperial_federalism`)
- **Domain:** diplomacy | **Tier:** 3
- **Prerequisites:** soc_federal_autonomy
- **Trigger:** (`gov.secessionCrises >= 3` OR `gov.civilWarsSurvived >= 1`) AND empire holds ≥ 8 systems
- **Concept:** Empires that survive their rebellions learn a second, harder art beyond subsidiarity: how to re-admit the defeated. Rome's municipia and postwar amnesties alike — the losers must be offered a constitutional road back, or garrisoned forever.
- **What becomes possible:** The compact machinery of soc_federal_autonomy extends to precisely the worlds it normally cannot reach: defeated rebel regions, reconquered secessionists, and freshly annexed conquests. Ordinary Autonomy Compacts are the peacetime instrument; this is its postwar edition — not a second autonomy system.
- **Gameplay mechanic unlocked:** **Reconstruction compacts.** `GOV_NEGOTIATE_COMPACT` gains an amnesty payload variant usable against worlds in occupation, post-civil-war, or suppressed-secession status — normally invalid compact targets. The amnesty terms (rebel leadership pardoned or exiled, militias converted to provincial levies, prosecutions waived or pursued) set the compact's starting cohesion floor and its political-capital price. The core strategic activity becomes postwar constitutional design: which defeated regions to compact, which to hold under occupation.
- **Engine hook:** unlockFlag `reconstruction_compact` read by the existing `GOV_NEGOTIATE_COMPACT` handler to accept the amnesty payload and postwar target states; `lib/combat/occupation-service.ts` and `lib/government/civil-war-service.ts` expose eligibility; amnesty compacts write the same PlanetCohesion compact fields soc_federal_autonomy defines — no parallel order, no `GOV_GRANT_AUTONOMY`.
- **Required capacity:** provincial administration on the target (a `provincial_seat`, rebuilt if the war destroyed it), political capital scaled by how recently the world was shooting at you, and fiscal headroom — amnesty compacts trade revenue for peace exactly as ordinary compacts do.
- **Interactions:** the conquest/civil-war closer for the federal path — with soc_civic_integration's Charter Pluralism it forms the full annexation-by-consent pipeline; the safety valve for Divergent Species pluralism and the Enfranchisement's alienated human blocs; Distributed Defense grids on amnestied worlds stand down into provincial levies.
- **Strategic advantages:** converts your worst systemic risk — the postwar resentment cycle — into a manageable revenue trade; the only structural way to end a civil war that stays ended.
- **Vulnerabilities & consequences:** amnesty is remembered by both sides: loyalist blocs resent pardons (a cohesion hit on worlds that fought *for* you), and an amnestied province keeps its organized political identity — rivals can court it, and recentralizing later reignites precisely what you amnestied, with interest; the revenue loss is real and permanent while the compact holds.
- **Emergent follow-ons:** amnestied provinces as technology-diffusion leaks; truth-and-reconciliation press cycles; a peaceful-dissolution ending negotiated compact by compact.

---

### Hegemonic Extraction Doctrine (`emg_tribute_doctrine`)
- **Domain:** economy | **Tier:** 2
- **Prerequisites:** econ_interstellar_banking
- **Trigger:** `tribute.vassalCount >= 2` AND `tribute.ticksReceivingStreak >= 40`
- **Concept:** Tributary systems (the Delian League, the tianxia order) begin as extortion and calcify into institutions: assessors, registries, ideology. The institution then has interests of its own.
- **What becomes possible:** Tribute stops being a treaty clause and becomes an administered imperial economy.
- **Gameplay mechanic unlocked:** Tribute yields rise; you may demand tribute **in kind** — ships, manpower, intelligence product — via a new `DIP_ADJUST_TRIBUTE` order; vassal management becomes an active screen rather than a passive income line.
- **Engine hook:** `step6_trade` (tick-processor) reads unlockFlag `tribute_infrastructure` to apply the multiplier and route in-kind flows; order `DIP_ADJUST_TRIBUTE` in the game-loop switch; building `tribute_assessor_bureau` at the capital.
- **Required capacity:** the assessor bureau plus envoy upkeep per vassal. In-kind demands additionally require the logistics to receive them (shipyard capacity for hulls, etc.).
- **Interactions:** feeds Reserve Currency Clearing (econ_galactic_clearing — tribute settles through your ledger); in-kind intelligence tribute feeds espionage; each demand shifts rivalry via the existing pressure system.
- **Strategic advantages:** scaling income without administration costs of direct rule.
- **Vulnerabilities & consequences:** the Delian problem — the doctrine's yields are backed by military reputation, so a single *visible defensive defeat* triggers mass tribute default and revolt cascades among vassals; non-vassal diplomacy suffers standing penalties (everyone can read what you are).
- **Emergent follow-ons:** vassal revolt wars (feeding *their* Distributed Defense triggers); if your grip fails, your own Reconstruction Federalism trigger.

---

### Battlefield Salvage Doctrine (`emg_salvage_doctrine`)
- **Domain:** military | **Tier:** 2
- **Prerequisites:** mil_command_networks, econ_commodity_exchanges
- **Trigger:** `mil.homeBattles >= 8` AND `mil.enemyPowerDestroyed >= 500`
- **Concept:** Armies that fight on their own ground learn matériel science: WWII technical-intelligence corps turned recovered wrecks into design bureaus. Losing the initiative teaches you your enemy's engineering.
- **What becomes possible:** Institutionalized exploitation of battle wreckage — every engagement in friendly space becomes a research expedition.
- **Gameplay mechanic unlocked:** Doubles blueprint-fragment fidelity from the wreckage-salvage diffusion channel (§2, channel 4) and unlocks **capture refits**: surrendered or boarded hulls can be rebuilt into your own fleets at a drydock.
- **Engine hook:** unlockFlag `salvage_corps` read by the `MIL_SALVAGE_WRECKAGE` handler (§2.4); refit path added to the `MIL_BUILD_FLEET` handler for captured-hull inventory; ship-class `salvage_tender` buildable at spaceyards.
- **Required capacity:** salvage tenders (slow, defenseless), a drydock within range of the battlefield, and a Technical Exploitation Lab building to convert fragments.
- **Interactions:** the force multiplier on the reverse-engineering diffusion channel; Grey Market Concordat (pirates sell you salvage rights); Distributed Defense (you fight at home a lot — grim synergy).
- **Strategic advantages:** turns the weak defender's position into a technology pump; refitted hulls are free basePower.
- **Vulnerabilities & consequences:** salvage fleets are prey — escorting them is a real operational cost; refitted enemy hulls may carry scuttle charges (an espionage counter-op can detonate your prize squadron); above all, the doctrine pays only when you are being invaded, which is not a position to optimize for.
- **Emergent follow-ons:** heavy salvage against one rival accelerates observation-channel fragments on their whole military branch; captured-hull fleets create diplomatic incidents when recognized.

---

### Narrative Engineering (`emg_narrative_engineering`)
- **Domain:** espionage | **Tier:** 3
- **Prerequisites:** esp_resident_networks, comm_mass_media
- **Trigger:** `press.manipulationOps >= 12` AND `press.crisesWon >= 2`
- **Concept:** Computational propaganda treats public opinion as an engineering discipline: measurable channels, iterated payloads, feedback loops. States that practice enough stop improvising and found an institute.
- **What becomes possible:** Opinion becomes a targetable domain with doctrine, not a dice roll.
- **Gameplay mechanic unlocked:** **Cultivated audiences.** Won press campaigns and won press crises against a target world create a persistent *cultivated audience* asset there — a measured, receptive public segment with a strength score. Audiences are spendable and compoundable: later press campaigns and espionage ops against that world consume strength for large success and cost bonuses; iterating a campaign on a cultivated world costs a fraction of a cold launch; fabrications aimed at a cultivated audience are materially harder to trace. Rival counterintelligence can *discover* an audience (it is, after all, an asset sitting in their territory) and burn it with an inoculation campaign that zeroes the strength and hardens that public against you specifically.
- **Engine hook:** `cultivatedAudiences` records in faction state (`targetPlanetId → strength`), written by `PRESS_LAUNCH_CAMPAIGN` and press-crisis resolution wins, consumed at campaign/op launch; modifierKeys `press_campaign_cost_mult` and `press_trace_resist_add` consumed in the `PRESS_LAUNCH_CAMPAIGN` / `PRESS_TRACE_CAMPAIGN` handlers (scripts/game-loop.ts:2423, 2481) apply only where an audience exists; discovery and burn resolve through the rival's counterintel sweep path; unlockFlag `narrative_engineering`. Synchronized multi-target campaigns are deliberately *not* this tech — they belong to comm_infowar_suite's tasking mechanic, which cultivated audiences feed as targeting assets.
- **Required capacity:** a Media Synthesis Hub building plus a signals-relay orbital; specialist population staffing. Campaign reach scales with hub coverage, not knowledge.
- **Interactions:** the comp machine-sovereignty arc (algorithmic feeds); comm_infowar_suite (audiences as tasking inputs); Coup-Proofing (a narrative shield over the officer corps); counter-espionage — rival counter-narrative techs specifically check for your flag.
- **Strategic advantages:** the cheapest coercion in the game per unit of effect, deniable when it works — and the audience assets compound across campaigns in a way raw modifiers never could.
- **Vulnerabilities & consequences:** institutionalized lying corrodes the liar — a small permanent downward drift on *domestic* public trust (the press system's trust baseline) while the hub operates; public exposure of the institute is a first-order legitimacy crisis; a burned audience is worse than none (the inoculated public resists all your future campaigns at a penalty); and truth-collapse events can lock *you* out of credible messaging when you genuinely need it.
- **Emergent follow-ons:** rivals' successful traces against you feed their Counterintelligence State trigger; sustained truth-collapse can spawn epistemic-crisis world events.

---

### Blockade-Running Logistics (`emg_blockade_running`)
- **Domain:** infrastructure | **Tier:** 2
- **Prerequisites:** infra_logistics_network
- **Trigger:** `eco.sanctionedTicksStreak >= 30` (streak requires ≥50% of pre-sanction trade throughput maintained)
- **Concept:** Sanctions-evasion economies — ghost fleets, parallel finance, smuggling corridors — are real logistics engineering, learned only under pressure. Nobody designs one in peacetime.
- **What becomes possible:** The empire's trade no longer needs anyone's permission to move.
- **Gameplay mechanic unlocked:** Sanctioned or blockaded trade routes automatically re-route via the deepSpace movement layer at reduced-but-nonzero efficiency; opens a smuggler-contact market for restricted goods.
- **Engine hook:** `lib/diplomacy/sanctions-service.ts` consumes unlockFlag `parallel_logistics` to cap sanction damage; trade-fleet layer preference in `lib/movement` switches to `deepSpace` for affected routes (low `detectabilityMultiplier` already modeled in `hyperdriveProfile`); building `grey_harbor` on frontier systems (deliberately not `free_port` — that identifier is econ_free_port_compact's unlockFlag, and it has one owner).
- **Required capacity:** Grey Harbors on frontier systems and standing relationships with pirate or neutral factions; each grey harbor covers routes in its region only.
- **Interactions:** Grey Market Concordat (the contacts are the same people); the obvious counter to a rival's clearing-network freezes (econ_galactic_clearing); espionage synergy both ways. An econ_free_port_compact empire that also triggers this gets an intended synergy: its lawful free ports and its grey harbors share contacts, and smuggled volume rides the same registries.
- **Strategic advantages:** sanction immunity is survival insurance for any faction expecting to be the galaxy's villain or victim.
- **Vulnerabilities & consequences:** institutionalized smuggling permanently raises corruption on frontier governors (governor-service drift); the grey network runs both ways — hostile agents ride your own smuggling corridors (standing infiltration bonus *against you*); and when sanctions finally lift, you own a criminalized shadow economy that no longer answers to you (shadow-economy nodes persist in your own territory).
- **Emergent follow-ons:** smuggler-syndicate crises; pirate factions strengthened by your custom feed everyone's `pirate.raidsSuffered`.

---

### Exodus Shipcraft (`emg_exodus_shipcraft`)
- **Domain:** infrastructure | **Tier:** 3
- **Prerequisites:** infra_automated_ports, mil_expeditionary_logistics
- **Trigger:** `planets.lostToConquest >= 3` AND `pop.evacuated >= 100000`
- **Concept:** Diaspora engineering: the craft of moving a world's population, institutions, and knowledge before the hammer falls — refugee flotillas scaled to civilizations, learned only by peoples who have had to run.
- **What becomes possible:** Losing a planet stops meaning losing its people or what they knew.
- **Gameplay mechanic unlocked:** **Arkship evacuation.** The game has exactly one evacuation subsystem: the `EVAC_POPULATION { planetId, destination }` order (introduced by infra_orbital_elevator), resolved by a per-planet lift-throughput model — population moves out at the rate available lift allows, never instantly. This tech extends that one subsystem rather than adding a parallel order: arkships provide wholesale throughput without an elevator (a threatened colony can be lifted ahead of a fall), evacuations under this flag preserve the colony's implemented technology as blueprints (§2 model), and founding refugee colonies from evacuated population costs a fraction of normal colonization.
- **Engine hook:** the shared evacuation resolver (a small evac-service pass in the worker, moving population via `PopulationService` transfers against the throughput model) gains an arkship-capacity term when unlockFlag `exodus_craft` is set; blueprint write into `PlayerTechState.blueprints` on completed evacuation; orbital `arkship_yard`. The other evacuation-adjacent techs feed the same resolver: infra_orbital_elevator raises lift throughput, comp_substrate_migration adds the upload destination (with `GOV_ABANDON_COLONY` as the terminal ceremony), and mega_planetary_disassembly consumes the subsystem wholesale for its forced-evacuation phase. One order, one throughput model, four techs modifying it.
- **Required capacity:** arkship yards in orbit of threatened regions and very large metal reserves per evacuation — you cannot improvise an exodus at the last tick.
- **Interactions:** Divergent Species Adaptation (arks are built per morph line); conquest-absorption counterplay (an evacuated world teaches its conqueror nothing); migration diffusion (your refugees carry your tech to whoever shelters them).
- **Strategic advantages:** the losing-player tech — converts military defeat into demographic and knowledge continuity; enables deliberate "mobile empire" play.
- **Vulnerabilities & consequences:** every evacuation concedes a world, and a doctrine of retreat grinds military-bloc satisfaction down; refugee colonies carry a lasting unrest baseline; loaded arks are the richest piracy target in the game, and rivals learn to intercept.
- **Emergent follow-ons:** you become the galaxy's biggest *outbound* diffusion leak; refugee-descended colonies later generate return-and-reclaim crisis politics.

---

### Coup-Proofing Statecraft (`emg_coup_proofing`)
- **Domain:** espionage | **Tier:** 2
- **Prerequisites:** esp_sigint, soc_digital_governance
- **Trigger:** `gov.coupsSurvived >= 1` OR officer-loyalty crisis events ≥ 3 (counter written by `coup-service` when officer disposition crosses its warning threshold)
- **Concept:** The coup-proofing literature (Quinlivan): survivors of coup attempts converge on the same architecture — parallel security forces, counterbalanced commands, loyalty purchased in coin and kin. It works, and it costs exactly what it looks like it costs.
- **What becomes possible:** The state acquires a second armed skeleton whose only enemy is its own military.
- **Gameplay mechanic unlocked:** Found an Internal Security Directorate: coup risk floor drops sharply; officer rotation policies become available; a parallel guard formation defends the capital independent of the regular chain of command.
- **Engine hook:** `lib/government/coup-service.ts` consumes unlockFlag `praetorian_balance` as a risk multiplier; new policy ids through the policy service; building `internal_security_directorate` (capital only); guard formation raised via the existing `MIL_CREATE_ARMY` path with a `guard` tag.
- **Required capacity:** the directorate building, permanent credit upkeep, and recurring political capital (loyalty is a subscription, not a purchase).
- **Interactions:** the Counterintelligence State (shared counterintel plumbing); Narrative Engineering (officer-corps opinion shaping); the directorate is itself a high-value espionage target.
- **Strategic advantages:** if you have ever watched the coup ladder climb, this is the only structural answer.
- **Vulnerabilities & consequences:** counterbalancing degrades real military effectiveness — a standing penalty on fleet/army coordination (`mil_command_cohesion_mult` below 1) because divided command is the *point*; the directorate accretes corruption; and the purge tools it hands you are legitimacy-burning temptations that manufacture the disloyalty they claim to detect.
- **Emergent follow-ons:** the directorate backing its *own* coup when it judges you weak; purge spirals feeding secession triggers.

---

### Grey Market Concordat (`emg_grey_concordat`)
- **Domain:** espionage | **Tier:** 2
- **Prerequisites:** esp_sigint, econ_commodity_exchanges
- **Trigger:** `pirate.raidsSuffered >= 10` AND at least one `corsair_den`/`pirate_station` system inside or bordering your territory AND at least one shadow-economy node active in your regions
- **Concept:** Where the state cannot police, it eventually negotiates. Formalized protection arrangements with raider polities — mediated piracy — are as old as the Barbary treaties.
- **What becomes possible:** The pirates who prey on you become an instrument you rent.
- **Gameplay mechanic unlocked:** Negotiate accords with pirate havens: raids redirect away from your shipping (and toward whoever hasn't paid); access to a black market where ships, goods, and blueprint fragments trade with no questions; pirate havens feed you corridor intelligence.
- **Engine hook:** new order `DIP_PIRATE_ACCORD` (payload `{ havenSystemId, tributePerTick }`); `lib/ai/pirate-ai-service.ts` consults a `world.pirateAccords` standing map when choosing raid targets; unlockFlag `grey_concordat` gates the order.
- **Required capacity:** per-tick tribute payments, a Grey Harbor (the emg_blockade_running structure — not econ_free_port_compact's lawful free ports), and a reputation sacrifice (the accord costs standing the moment it is signed, more when exposed).
- **Interactions:** Blockade-Running (same contacts); Battlefield Salvage (pirates sell wrecks); black-market blueprint fragments feed the diffusion economy.
- **Strategic advantages:** converts a pure loss (raids) into a directed weapon and an intelligence source, at a price a weak faction can pay.
- **Vulnerabilities & consequences:** every tick the accord runs there is a small chance the press system surfaces it (a `StoryTruth` true story with severe reputation damage); paying pirates strengthens pirates *globally* (spawn-rate contribution) — you are feeding the wolf that eats your neighbors; and rivals can simply outbid you, flipping your accord into their weapon.
- **Emergent follow-ons:** pirate-kingdom consolidation events; exposure crises; a rival's counter-accord bidding war.

---

### Scorched Sky Protocols (`emg_scorched_sky`)
- **Domain:** military | **Tier:** 3
- **Prerequisites:** mil_orbital_strike
- **Trigger:** `mil.bombardmentsConducted >= 5` AND `mil.bombardCivilianDamage` above threshold
- **Concept:** The institutionalization of atrocity: strategic bombardment practiced often enough stops being an act and becomes a bureau — with doctrine, procurement, and career tracks. History's lesson is that the machinery, once built, finds reasons to run.
- **What becomes possible:** Bombardment becomes a bureau — with doctrine, procurement, and the one mode no professional military admits to planning.
- **Gameplay mechanic unlocked:** **Terror bombardment and the siege-ordnance bureau.** Precision against infrastructure already exists — mil_orbital_strike's `targetDistrictId` strikes *are* that mechanic, and this tech does not duplicate it. What the bureau adds: **terror bombardment**, which forces early surrender checks in the ground resolution at horrific civilian cost, with every strike signed for — a political-capital cost per use, paid by the government that ordered it; and the bureau's economics — cheaper ordnance and faster munitions resupply through dedicated siege-ordnance production.
- **Engine hook:** the `MIL_BOMBARD_PLANET` handler (scripts/game-loop.ts:1288) reads unlockFlag `scorched_sky` to accept a `mode: 'terror'` payload (infrastructure precision stays with mil_orbital_strike's `targetDistrictId` payload); modifierKey `mil_bombard_effect_mult` applied to siege-ordnance-supplied fleets; building `siege_ordnance_works`. Member of mutually exclusive group `mil_legitimacy_path` (locks out Distributed Planetary Defense Doctrine's protector identity, per the existing `mutuallyExclusiveGroup` engine support).
- **Required capacity:** dedicated siege ordnance production and fleet refits; terror strikes additionally require a government willing to sign — enacting one costs political capital *every time*.
- **Interactions:** actively damages the conquest-absorption diffusion channel (you burn the archives you would have learned from); coalition mechanics in diplomacy key off your flag.
- **Strategic advantages:** the fastest siege resolution in the game; genuine deterrence — factions fold rather than fight you.
- **Vulnerabilities & consequences:** this is a dark path with teeth: a permanent reputation floor drop; war-crimes press narratives that never fully decay; empire-wide occupied-world unrest baseline up; rival coalitions form measurably easier against you (pressure-service modifier); and your own civilian blocs lose satisfaction on every use. The deterrent only works while you keep winning.
- **Emergent follow-ons:** coalition wars against you; domestic shame movements feeding secession; victims' Exodus Shipcraft and Distributed Defense triggers.

---

### Corporate Statecraft (`emg_corporate_statecraft`)
- **Domain:** economy | **Tier:** 3
- **Prerequisites:** econ_interstellar_banking (supersedes the legacy `eco_t1_2` `CHARTER_TECH_ID` gate per the economy catalog), econ_public_charters
- **Trigger:** `corp.activeCharters >= 3` AND `corp.revenueShareStreak >= 20` (corporate share of faction revenue ≥ 25% sustained)
- **Concept:** The company-state (the VOC, the East India Company): sovereignty leased to capital in exchange for reach, until the distinction between the flag and the ledger stops mattering.
- **What becomes possible:** Corporations graduate from economic actors to instruments of state — and rivals can no longer tell where your government ends.
- **Gameplay mechanic unlocked:** Chartered corporations may hold territory in their own name, sign their own trade pacts, and be granted **war powers** — privateer fleets under corporate colors are deniable force projection. The state taxes corporate wars it never officially fought.
- **Engine hook:** unlockFlag `company_state` gates new entries in `charter-catalog` rights (granted via the existing `CORP_GRANT_RIGHT` handler); corporate registry tick handles corp-held systems; privateer fleets ride the existing `ECON_COMMAND_PRIVATEERS` path with corporate attribution.
- **Required capacity:** a Corporate Exchange building, high corporate standing, and political capital per right granted; each war power is per-charter, not empire-wide.
- **Interactions:** Reserve Currency Clearing (econ_galactic_clearing — the exchange settles through your ledger); espionage attribution rules — corporate ops attribute to the corp first, you second; hostile takeovers of *your* corps become a rival attack surface.
- **Strategic advantages:** force and expansion with plausible deniability; growth that doesn't consume political capital.
- **Vulnerabilities & consequences:** corporations optimize profit, not policy — a corp war can drag the state into a conflict it never chose (attribution partially sticks); a corporation grown past a threshold attempts regulatory capture (parliament influence events) and nationalizing it then costs civil-war-adjacent legitimacy; rival investors can buy your instruments out from under you through the existing share market.
- **Emergent follow-ons:** a corporation seceding *with its territory*; corp-vs-state cold wars inside your own borders; charter-corporation tech leakage (§2, channel 6) at scale.

---

### The Counterintelligence State (`emg_panopticon_state`)
- **Domain:** espionage | **Tier:** 3
- **Prerequisites:** esp_predictive_intel
- **Trigger:** `esp.opsDetectedAgainstUs >= 10` AND `esp.counterintelWins >= 3`
- **Concept:** The double-cross bureaucracy: enough hostile penetration teaches a security service that the only safe assumption is total visibility of *foreign* activity. This is deliberately not the Surveillance State — watching your enemies inside your borders is a different institution from watching your citizens, and the statecraft fork's exclusivity holds: a federal or participatory empire can build this; it cannot acquire the Panopticon Grid through conduct.
- **What becomes possible:** No foreign service operates in your space unregistered. Your own citizens remain, constitutionally, none of this apparatus's business — which is exactly what its directors come to resent.
- **Gameplay mechanic unlocked:** Empire-wide counterespionage: hostile-op exposure chance rises sharply, and foreign agents entering your systems are flagged on arrival. That is the whole payload. Domestic dissent visibility — exposed defiance/secession pressure, preventive detention, the espionage detection floor — is soc_surveillance_state's exclusive property and never fires from this tech.
- **Engine hook:** unlockFlag `counterintel_state` (deliberately not `panopticon` — that flag has one owner, soc_surveillance_state) with an explicitly scoped consumer list: modifierKey `esp_counter_exposure_add` in the espionage exposure calculation, and arrival-flagging of foreign agents in `lib/espionage/espionage-service.ts`. No `GOV_PREVENTIVE_DETENTION`, no detection floor, no tickCohesion legitimacy drift. Buildings `counterespionage_grid` (per colony) + `central_registry_annex` (orbital). **Stacking rule:** a soc_surveillance_state empire that also crosses this trigger does not double-apply — the emergent grant merges into Panopticon Grid coverage (its `esp_counter_exposure_add` folds into the grid's `counter_intel_detection` scaling) rather than stacking a second bonus or a second cost.
- **Required capacity:** grid coverage colony by colony plus the registry annex and specialist staffing — counterintelligence quality scales with coverage fraction.
- **Interactions:** the comp machine-sovereignty arc (automated analysis of the counterintel take); Coup-Proofing (shared plumbing); Narrative Engineering detection; for surveillance empires, see the stacking rule above.
- **Strategic advantages:** near-immunity to the espionage game everyone else is playing — without paying the Surveillance State's trust ceiling, because the lens never turns inward.
- **Vulnerabilities & consequences:** the registry is a rich espionage prize — a successful theft hands a rival your counterintel picture and every flagged-agent record at once; an apparatus built to watch foreigners lobbies, every budget cycle, to watch citizens too (periodic parliament events pressure you toward surveillance politics your constitution may forbid); and false-positive flags on legitimate foreign traders are recurring diplomatic incidents.
- **Emergent follow-ons:** mission-creep scandals; the registry-heist scenario as a rival's campaign goal; directors who quietly build the domestic capability anyway — and the crisis when the press finds it.

---

## 2. Technology Diffusion

### 2.1 The blueprint model

All non-research acquisition flows through one object — the **blueprint** — so nine channels share a single persistence shape, one assimilation pipeline, and one UI surface.

```ts
// lib/tech/diffusion-types.ts
export type DiffusionChannel =
    | 'espionage' | 'purchase' | 'alliance' | 'salvage' | 'conquest'
    | 'corporate' | 'migration' | 'archaeology' | 'observation';

export interface TechBlueprint {
    id: string;                       // `bp-${factionId}-${techId}-${tick}`
    techId: string;
    sourceFactionId: string | null;   // null for archaeology
    channel: DiffusionChannel;
    /** 0–1. Fragments of the same techId merge: f = 1 - Π(1 - f_i). */
    fidelity: number;
    /** Purchase channel: vendor support active. */
    licensed?: boolean;
    acquiredAtTick: number;
}
```

Stored as `PlayerTechState.blueprints?: TechBlueprint[]` — an additive optional field, so existing serialized states parse unchanged (see §4.7). Fragments of the same tech merge with diminishing returns (`1 - Π(1 - fᵢ)`), so five 0.3-fidelity thefts do not equal certainty.

**Assimilation.** A blueprint at fidelity ≥ 0.95 can be assimilated: the order `TECH_ASSIMILATE_BLUEPRINT` (payload `{ blueprintId, slotId }`) assigns a research slot exactly like `TECH_START_RESEARCH`, but with `ticksRequired` derived from `researchCost × 0.4`, **prerequisites waived** (you are copying, not deriving), and a marker that the resulting unlock carries **adaptation debt** (§3.4). Partial blueprints (≥ 0.5) may be assimilated early at proportionally higher cost.

**The diffusion gradient — how the weak survive.** Assimilation cost is further multiplied by `max(0.25, 1 − 0.05 × (factionsAlreadyHolding − 1))`. Commodity technology that half the galaxy holds is nearly free to copy; only the bleeding edge is expensive to steal. Combined with the channels below, a technologically backward faction has four viable survival strategies — steal (espionage/observation), buy (purchase/corporate), copy (salvage/conquest), adapt (migration/archaeology) — and the *leader* pays for its lead in exposure across every one of them.

### 2.2 Channel: Espionage Theft

- **Mechanic:** a new catalog operation `steal_tech_blueprint` in `OPERATION_CATALOG` (`lib/espionage/operation-catalog.ts`), category `intel_gathering`, `requiredConditions` gated on network stage ≥ 2 against the target. Success yields a fragment: fidelity `0.25 + 0.15 × networkStage + 0.1 × investment`. Targeted theft (payload names a `techId`) doubles the intel cost; untargeted theft rolls a random tech weighted toward the target's most recent unlocks. The existing stub order **`ESP_STEAL_TECHNOLOGY`** (scripts/game-loop.ts:2174) is upgraded from a `console.log` into the real handler: it calls `launchCatalogOperation(actor, target, region, 'steal_tech_blueprint', world)`; resolution happens in `tickOperations` via a new `OperationEffect` type `steal_blueprint`.
- **Cost/risk:** intel + credits per the catalog entry; exposure follows the standard attribution ladder — an exposed theft shifts rivalry (`shiftRivalry`), fires a press story (`pushWorldStory`), and increments the *target's* `esp.counterintelWins` ledger metric (their Counterintelligence State trigger feeds on your failures).
- **Counterplay:** counterintel sweeps; a defensive tech flag `compartmentalization` caps per-theft fidelity at 0.2; network-stage gating means theft requires a matured network that sweeps can burn down.
- **Hook:** catalog entry + `ESP_STEAL_TECHNOLOGY` handler + `tickOperations` effect resolution.

### 2.3 Channel: Trade & Licensing

- **Mechanic:** the seller offers a license through the existing diplomacy offer flow: `DIP_PROPOSE_TREATY` with payload `{ type: 'tech_license', techId, price, royaltyPerTick, exclusive }`, riding `lib/diplomacy/offer-service.ts`. On acceptance the buyer receives a fidelity-1.0 `licensed` blueprint whose assimilation costs only 25% (vendor documentation included); the seller books the price plus a royalty per tick while the buyer's implementation is active.
- **Cost/risk:** buyer pays credits and accepts dependency; seller arms a potential future enemy for cash. If relations collapse (war or sanctions between the parties), the seller may revoke support: the buyer keeps the knowledge but implementation efficiency drops to 0.7 until a domestication project completes.
- **Counterplay:** third parties can sanction tech sales; an `exclusive` license sold twice breaches the promise system (`DIP_MAKE_PROMISE` machinery) with full reputational consequences.
- **Hook:** offer-service offer type + acceptance handler writing the blueprint; royalty processed in `step6_trade`.

### 2.4 Channel: Alliance Research Compacts

- **Mechanic:** treaty type `research_compact` (again via `DIP_PROPOSE_TREATY`), scoped to named domains. While active, each member passively accrues fragment fidelity `+0.01–0.03/tick` on techs any partner has *implemented* (not merely knows — you learn from watching it work) and the member lacks.
- **Cost/risk:** compact members couple their counterintelligence fates: infiltration of any member grants the attacker intel bonuses against all (faction-intel coupling in `lib/espionage/faction-intel.ts`). Sharing is symmetrical whether or not the benefit is.
- **Counterplay:** narrow domain scoping; leaving the compact (treaty break, with the usual diplomatic cost); counterintelligence standards clauses (higher upkeep, less leak).
- **Hook:** a `tickResearchCompacts(world)` pass inside `step4b_emergentTech` (§4.6), reading treaty state and writing fragments.

### 2.5 Channel: Battlefield Reverse-Engineering

- **Mechanic:** combat resolution (the `MIL_TACTICAL_RESULT` path) writes a `wreckageField` record onto the system: `{ ownerFactionId, techSample: string[], mass, decayTicks: 20 }`, where `techSample` draws from the destroyed fleet owner's implemented military techs. A new order `MIL_SALVAGE_WRECKAGE` (payload `{ fleetId, systemId }`) requires a present, unopposed fleet; it converts mass to metals and rolls fragments at fidelity 0.1–0.2 per operation. **Captured ships** (boarding/surrender outcomes) yield 0.5 fidelity on their design-linked techs — capture is the jackpot, wreckage the grind.
- **Cost/risk:** salvage takes ticks in a possibly contested system; salvage fleets are slow and defenseless.
- **Counterplay:** a `scuttle_doctrine` tech flag makes your wrecks yield nothing; contest the field; bombard the salvagers; wreckage decays in ~20 ticks so denial is often just delay.
- **Hook:** combat-resolution write + `MIL_SALVAGE_WRECKAGE` case in the game-loop switch; the `emg_salvage_doctrine` flag doubles fidelity.

### 2.6 Channel: Conquest Absorption

- **Mechanic:** on a successful `MIL_INVASION_PLANET`, the attacker gains fragments for every tech *implemented on that planet* (implementation buildings present and intact, §3): fidelity 0.3 per tech, +0.2 if research/university buildings survive. Prior bombardment halves the yield — you burned the archives. Population cooperation scales it: planets taken at stability < 30 yield half again (researchers flee, records burn).
- **Cost/risk:** conquest's normal costs; the knowledge is a spoil, not a goal you can seize surgically.
- **Counterplay:** defender orders — scorched-earth destruction of implementations before the fall (denies the attacker, but also denies *you* if you retake the planet), or `EVAC_POPULATION` under Exodus Shipcraft, which strips both people and blueprints.
- **Hook:** invasion-resolution branch of the `MIL_INVASION_PLANET` handler (scripts/game-loop.ts:956).

### 2.7 Channel: Charter-Corporation Transfer

- **Mechanic:** a chartered corporation operating in foreign territory (its `OperatingTerritory` in `charter-types`) transfers technology both directions on each corporate registry tick: the **host** faction accrues fragments (~0.005/tick) of the corp's home-faction techs embodied in corp assets; the **home** faction gains market intelligence on the host. A host government may demand formal technology transfer as a charter condition via the existing `CORP_SET_HOST_POLICY` order — the corp complies (large one-time fragment) or exits the territory.
- **Cost/risk:** for the home faction, every widely-chartered corp is a slow leak; for the host, demands burn corporate standing and can drive the corp out.
- **Counterplay:** charter terms banning transfer (a new entry in `RIGHT_DEFS` in `charter-catalog`, revocable via `CORP_REVOKE_RIGHT`), priced in corporate standing.
- **Hook:** corporate registry tick + `charter-catalog` right `technology_transfer`.

### 2.8 Channel: Migration & Refugee Flows

- **Mechanic:** knowledge travels with people — but **the carrier does not exist yet**. The engine today has no inter-planet population movement at all: `PopulationService.tickPopulation` (lib/construction/population-service.ts:15-73) does per-planet natural growth and unrest only, and nothing else in lib/ moves population between planets. This channel therefore names its carrier as engine work: (1) a new **migration pass** in `PopulationService`, invoked from `step16_population` (lib/time/tick-processor.ts:358), moving small population flows between relay-connected planets each tick, weighted by happiness/habitability differentials and policy modifiers — the pass every "migration-weight" modifier in the domain files consumes; and (2) the discrete transfer orders the web already proposes — `HAB_TRANSFER_POPULATION`, `EVAC_POPULATION`, `GOV_TRANSFER_POPULATION` — as the only other population-movement events. Arriving migrants carry fragments of the origin faction's economy/infrastructure-domain techs: ~0.001 fidelity per 1,000 migrants, capped per tick. **Refugee pulses** are keyed to the discrete emitters that actually exist: `civil-war-service`, `secession-service`, and the evacuation resolver each emit a one-time large fragment grant to whoever shelters the displaced.
- **Cost/risk:** refugees strain food and stability on arrival; and refugee waves are the classic cover for sleeper insertion (an espionage catalog op keys off recent inflows to cheapen agent placement against you).
- **Counterplay:** for the origin — emigration-control policies (happiness cost, leak reduction); for the receiver — none needed; the trade-off *is* the counterplay.
- **Hook:** the new migration pass in `PopulationService` (prerequisite engine work for this channel); fragment accrual in `step4b_emergentTech` reading the pass's flow records; refugee-pulse emission from `civil-war-service` / `secession-service` / the evacuation resolver.

### 2.9 Channel: Archaeological Discovery

- **Mechanic:** world generation and a low-rate tick roll seed `ancient_site` tags on systems and planets (same tag mechanism as `corsair_den` in step13). Building a `xenoarchaeology_dig` on a tagged planet (ordinary `PLANET_CONSTRUCT_BUILDING`) starts excavation; each tick a small roll yields metals, **precursor blueprints** — techs one tier above your best in a domain, or unique techs no faction can research — or a crisis (`triggerCrisis`: awakened defense systems, plague, cult movements). Precursor blueprints assimilate at full cost and always carry maximum adaptation debt.
- **Cost/risk:** dig upkeep, crisis exposure, and the site's location — ancient sites are worth contesting militarily.
- **Counterplay:** sites are territory (take them); dig archives are stealable (espionage op against the site); crises are shared problems if they escape.
- **Hook:** a small `lib/tech/archaeology-service.ts` ticked inside `step4b_emergentTech`; site tags ride the existing system/planet tag arrays.

### 2.10 Channel: Deployment Observation

- **Mechanic:** knowledge leaks through use. Each tick, for every rival fleet or colony inside your sensor coverage (`world.movement.factionVisibility`, already recomputed in `step10_visibility`) that employs techs you lack, you accrue observation fragments at 0.002/tick — multiplied ×10 for techs used *against you in combat*. Nothing teaches like being shot by it.
- **Cost/risk:** free but glacial; combat-rate observation requires surviving the demonstrations.
- **Counterplay:** this is what the existing `PublicSignal` obscurity and `visibilityModifier` machinery (in `lib/tech/types.ts`) finally exists for — obscuring tech signatures caps observation fidelity; keeping advanced assets off borders and on the low-detectability `deepSpace` layer starves observers.
- **Hook:** a pass in `step4b_emergentTech` reading `factionVisibility` against rivals' implemented techs.

---

## 3. Knowledge vs Implementation

### 3.1 The two-stage model

Every tech resolves into two separable facts about a faction:

1. **Knowledge** — the techId is in `PlayerTechState.unlockedTechIds`, arrived at by research, emergence, or blueprint assimilation. Knowledge is empire-wide, binary, and cheap to check (`hasTechFlag`, §4.2).
2. **Implementation** — the physical, staffed, supplied capacity to *use* the knowledge, which is per-colony (or per-fleet/formation), continuous, and expensive.

Research completing does nothing physical. It changes what you are *allowed to build and order* — the transformation itself is bought in construction ticks, resources, and staffing, colony by colony. This is the single design lever that prevents research from transforming an empire overnight, makes conquest of developed worlds meaningful, and makes stolen tech less than equal to homegrown tech.

### 3.2 Authoring model

```ts
// data/tech-implementations.ts
export interface TechImplementationReq {
    techId: string;
    scope: 'empire' | 'colony' | 'fleet' | 'formation';
    buildingId?: string;        // colony scope — gated by canBuildOnTile techRequired
    orbitalId?: string;         // empire scope
    staffing?: { specialists: number };
    upkeep?: Partial<Record<ResourceKey, number>>;
    planetConditions?: string[]; // biome/tag requirements, e.g. divergent adaptation
}
export const TECH_IMPLEMENTATIONS: ReadonlyMap<string, TechImplementationReq>;
```

Techs **without** an entry are pure-knowledge techs (doctrines, policy unlocks, treaty frameworks): they take full effect at unlock, exactly as the engine works today. Techs **with** an entry contribute their modifier effects only scaled by coverage (§3.3). Domain catalog authors declare the requirement; the meta-system provides the machinery.

### 3.3 Riding the construction service

The implementation gate deliberately reuses the one tech check that already works: `canBuildOnTile`'s `techRequired` test (`lib/construction/construction-service.ts:34`).

- An implementation building simply declares `techRequired: '<techId>'` in `data/buildings.ts`. Knowledge gates construction — no new plumbing.
- The building's existence **is** the implementation record. No parallel deployment bookkeeping, no second source of truth: `recalculatePlanetStats` already fires on construction changes, conquest transfers buildings with the planet, sabotage/bombardment destroying the building *is* implementation loss.
- Per-colony deployment is therefore just the existing loop: `PLANET_CONSTRUCT_BUILDING` / `ORBITAL_CONSTRUCT` orders, build queues, logistics multipliers, resource costs. Deploying a tech across a 20-colony empire is 20 build orders, their metals, and their ticks.
- Doctrine-scope techs (fleet/formation) get one new order: `TECH_IMPLEMENT_DOCTRINE` (payload `{ techId, formationId | fleetId }`) — a retraining job queued like recruitment (`RecruitmentService` pattern), consuming ticks during which the unit fights at a readiness penalty.

Coverage is computed, never stored:

```ts
// lib/tech/implementation.ts
export function getImplementationCoverage(world, factionId, techId): number
// empire scope: 1 if the named orbital/building exists, active and staffed, else 0
// colony scope: implementedColonies / max(1, eligibleColonies)
// fleet/formation scope: retrained units / total units
```

Modifier aggregators (§4.3) fold coverage in: for multiplier keys, `effective = 1 + (mod − 1) × coverage`; for flat keys, `effective = mod × coverage`. Action gates get a sibling helper `hasImplementedTech(world, factionId, techId)` (coverage > 0) — *ordering* the new capability requires implementation somewhere; merely *seeing* it in menus requires only knowledge.

### 3.4 Adaptation debt

Techs acquired through blueprint assimilation write `PlayerTechState.adaptationDebt?: Record<techId, number>` starting at 0.5. Coverage is multiplied by `(1 − debt)`. Debt decays by 0.02 per tick **while coverage > 0** (learning by doing — the factory teaches the workforce), or can be cleared immediately by a *domestication* research project at 30% of the tech's cost. Stolen tech therefore runs at half effectiveness for its first ~25 ticks of real use: the weaker faction survives on copies, but copies are not parity — closing the last gap still takes institutions.

### 3.5 Conquered infrastructure

The inverse case falls out for free: capturing a planet whose buildings require techs you *lack* leaves those buildings standing but idle — "unintelligible infrastructure," contributing nothing until you acquire the knowledge (steal it, buy it, or absorb it via §2.6 fragments the same conquest just granted). This creates the correct incentive order: infiltrate first, invade second.

---

## 4. Engine Migration Notes

Ordered so each phase ships independently and the live game improves at every step.

### 4.1 Phase 0 — fix research completion (the ticksRequired bug)

The live game's research never completes: `TechEngine.assignResearch` (`lib/tech/engine.ts:62`) never sets `slot.ticksRequired`, and the worker's completion check (`lib/time/tick-processor.ts:241`) requires it. `researchCost` is hours; a tick is 6 hours.

1. Add `export const HOURS_PER_TICK = 6;` to a new `lib/time/constants.ts` (the engine must not import the tick processor; both import the constant).
2. In `assignResearch`, after validation: `slot.ticksCompleted = 0; slot.ticksRequired = Math.max(1, Math.ceil(tech.researchCost / HOURS_PER_TICK));`
3. **Repair pass** in `step4_research` for worlds already stuck mid-research: if `slot.status === 'researching' && slot.techId && !slot.ticksRequired`, derive `ticksRequired` from the registry the same way. This heals every live faction on the first tick after deploy.
4. **De-duplicate unlock logic.** `step4_research` currently re-implements `TechEngine.applyEffect` inline (tick-processor.ts:250–265) — already drifting from the engine. Extract a mutating `applyUnlock(techState, techId)` from `TechEngine.unlockTech`, export it, and have `step4_research` call it. All later phases (slots, flags, emergent grants, assimilation) then touch one code path.

### 4.2 Phase 1 — make unlockFlags consumable

One helper, in `lib/tech/flags.ts`:

```ts
export function hasTechFlag(world: GameWorldState, factionId: string, flag: string): boolean {
    const st = world.tech?.get?.(factionId);
    if (!st) return false;
    return st.unlockedTechIds.some(id => registry.get(id)?.unlockFlags?.includes(flag));
}
```

At 220 techs this is cheap enough to recompute on read; add a per-tick memo (a `Map<factionId, Set<string>>` rebuilt lazily and invalidated by `applyUnlock`) if profiling ever cares. **Do not persist the flag set** — derived state in JSON-TEXT columns rots.

Call sites, replacing dead or hardcoded checks:

| System | Call site | Flag use |
|---|---|---|
| Espionage | `launchOperation` tech check (`espionage-service.ts:80`, currently hardcoded `'dip_sha_1'`) | `shadow_ops` and per-op `requiredTech` in the catalog |
| Corporate | `CHARTER_TECH_ID` gate (`charter-service.ts:37`) | `corporate_charters` |
| Diplomacy | `offer-service` treaty-type validation | `federation_framework`, `tech_license`, `research_compact` gates |
| Government | policy service enact path | policy-unlocking flags (`GOV_ENACT_POLICY` handler already centralizes this) |
| Movement | layer access in `issueMoveOrder` | e.g. `gate_network_access` |
| Construction | keep the existing per-building `techRequired` (id-based is fine); use flags only for category-wide gates | — |
| Order queue | **new**: an `ORDER_TECH_GATES: Record<orderType, flag>` table checked once at the top of the game-loop switch, failing with `recordOrderFailure` | this is what makes `UNLOCK_ACTION` real |

### 4.3 Phase 2 — extend modifierKey consumption beyond economy

Mirror the `getFactionEconomyMods` pattern (`economy-service.ts:116`) with one generic accessor in `lib/tech/modifiers.ts`:

```ts
export function getTechModifier(world, factionId, key: string, fallback = 1): number
// reads PlayerTechState.globalModifiers[key], folds implementation coverage (§3.3)
```

Namespace registry (documented in that file; a dev-mode assertion walks all registered techs and fails on unknown keys — this kills the 165-dead-effects problem at authoring time):

- **Combat:** `mil_fleet_attack_mult`, `mil_fleet_defense_mult`, `mil_garrison_strength_mult`, `mil_repair_rate_mult` (consumed in `step14_empireFleetRepair`), `mil_bombard_effect_mult`, `mil_command_cohesion_mult` — consumed in combat resolution and the `MIL_*` handlers.
- **Espionage:** `esp_op_success_add`, `esp_exposure_mult`, `esp_counter_exposure_add`, `esp_intel_rate_mult` — consumed in `launchOperation`/`tickOperations`/`tickFactionIntel`.
- **Government:** `gov_political_capital_mult`, `gov_cohesion_add`, `gov_secession_pressure_mult` — consumed in `government-service`/`cohesion-service`/`secession-service` alongside their existing `getGovernmentModifiers` reads.
- **Logistics:** `log_supply_range_add`, `log_construction_speed_mult` (already seeded in `globalModifiers` as `construction_speed` — unify the name), `log_trade_volume_mult` — consumed in construction and movement services.
- **Press:** `press_campaign_cost_mult`, `press_trace_resist_add` — consumed in the PRESS handlers.

### 4.4 Phase 3 — UNLOCK_ACTION / UNLOCK_BUILDING

- **UNLOCK_ACTION:** each effect's `value`/`target` names an order type; the Phase-1 `ORDER_TECH_GATES` table is the single consumer. A build-time validation script asserts every `UNLOCK_ACTION` effect in the tech data appears in the gate table and vice versa — no more silently decorative unlocks.
- **UNLOCK_BUILDING:** the building side is authoritative (`techRequired` in `data/buildings.ts`, already enforced at `construction-service.ts:34`). A migration script scans tech trees for `UNLOCK_BUILDING` effects and asserts the named building declares the matching `techRequired`; the effect itself is retained as UI metadata only.

### 4.5 Phase 3b — research slot growth

Handle `UNLOCK_RESEARCH_SLOT` inside the shared `applyUnlock` (Phase 0.4): `state.maxSlots += 1; state.activeSlots.push({ slotId: `slot-${maxSlots}`, techId: null, startTime: 0, progressHours: 0, ticksCompleted: 0, ticksRequired: 0, status: 'empty' })`. Domain catalogs grant it at tier milestones; diffusion gives a fourth slot dedicated to assimilation jobs if the catalogs choose. `TECH_START_RESEARCH`'s existing "find empty slot" logic (game-loop.ts:1720) needs no change.

### 4.6 Phase 4 — emergent triggers: a new tick step

Add `step4b_emergentTech(world)` to `runStrategicTick`, immediately after `step4_research`, wrapped in the same per-step try/catch as its siblings (the tick order comment discipline in tick-processor applies — it must run *after* research so a tech completed this tick can satisfy prerequisites, and *before* economy consumers next tick):

1. Refresh gauges and streaks in each faction's `FactionHistoryLedger` (trade routes, automation index, adapted colonies, corp revenue share, sanction/tribute streaks).
2. Run `tickResearchCompacts`, corporate/migration/observation passive accrual, and `archaeology-service` (all §2 passive channels live here so diffusion has exactly one tick home).
3. Evaluate `EMERGENT_TRIGGERS` per faction; on reveal, write `revealedEmergentTechIds` + `fireNotification`; on auto-grant, call `applyUnlock`.

Counters are incremented at their event sources (the handlers named in §1.2) via `bumpMetric` — one-line additions to existing cases in the game-loop switch and services. **Determinism:** all diffusion/trigger randomness uses the `seededRandom(companyId, purpose, tick)` pattern from `charter-service.ts` — seed on `(factionId, techId, tickIndex)` so replays reproduce boardroom and blackboard alike.

### 4.7 Phase 5 — diffusion orders and persistence

**New order-queue cases** (game-loop switch, standard pattern with `recordOrderFailure` on invalid input):

| Order | Payload | Notes |
|---|---|---|
| `ESP_STEAL_TECHNOLOGY` | `{ targetFactionId, techId? }` | upgrade the existing stub at line 2174; ESP_* pattern preserved |
| `TECH_ASSIMILATE_BLUEPRINT` | `{ blueprintId, slotId }` | mirrors `TECH_START_RESEARCH` |
| `TECH_PURCHASE_LICENSE` | — | not a new case: rides `DIP_PROPOSE_TREATY`/`DIP_RESPOND_OFFER` with the `tech_license` offer type |
| `MIL_SALVAGE_WRECKAGE` | `{ fleetId, systemId }` | requires unopposed presence |
| `EVAC_POPULATION` | `{ planetId, destination }` | not a new case: the existing infra_orbital_elevator order; `exodus_craft` extends it (arkship throughput, blueprint write) |
| `TECH_IMPLEMENT_DOCTRINE` | `{ techId, formationId \| fleetId }` | recruitment-style job queue |
| `GOV_NEGOTIATE_COMPACT` (amnesty variant) | `{ planetId, tier, amnestyTerms }` | not a new case: soc_federal_autonomy's order; `reconstruction_compact` unlocks the amnesty payload |
| `DIP_PIRATE_ACCORD` | `{ havenSystemId, tributePerTick }` | gated on `grey_concordat` flag |
| `DIP_ADJUST_TRIBUTE` | `{ vassalId, mode }` | gated on `tribute_infrastructure` flag |

All faction-state mutation flows through these queue handlers or tick steps — never from API routes — per the project's order-queue rule (the espionage consolidation precedent).

**Persistence.** All new state is additive and lives inside aggregates the serializer already carries:

- `PlayerTechState` gains optional `blueprints?`, `adaptationDebt?`, `revealedEmergentTechIds?` — plain arrays/records inside the existing per-faction tech shard (`save-service.ts:224`), so old snapshots deserialize unchanged; every read site uses `?? []` / `?? {}` defaults, matching the codebase's existing defensive style.
- `world.techHistory` (ledgers) is a new top-level `Map` — it must be added to `serializeWorld`/`deserializeWorld` (`lib/persistence/save-service.ts`) and to the per-faction shard writer, following the existing Map⇄object conversion conventions; note the `game-world-state.ts:153` guidance that plain-object fields ride `cleanWorldForSave` automatically — prefer plain `Record` interiors for exactly that reason.
- `wreckageFields` and `ancient_site` ride the existing system/planet `tags`/record structures — no schema change.
- JSON-bearing DB columns are TEXT holding JSON strings (per CLAUDE.md): no Prisma migration is required for any of the above; `scripts/push-init-state.ts` bootstrap gets empty ledgers/blueprint arrays; the game-loop worker must be restarted after deploy (per the established worker-restart procedure), and never write class instances, `Map`s, or `Set`s into the serialized interiors.

**Client sync.** `/api/game/sync` already ships `world.tech` per faction; blueprints, revealed emergent techs, and adaptation debt arrive with it for free. The ledger should sync only to its owning faction (it is intelligence — rivals get it through `intel-reports`, at a price).

### 4.8 Suggested sequencing summary

| Phase | Ships | Player-visible result |
|---|---|---|
| 0 | ticksRequired fix + repair pass + `applyUnlock` refactor | research completes for the first time in the live game |
| 1 | `hasTechFlag` + gate table + call sites | 34 flags stop being decorative; actions/ops/charters actually gate |
| 2 | `getTechModifier` + consumers | the other 165 techs can be authored with real effects |
| 3 | implementations + coverage + debt | tech becomes a deployment game, not a menu game |
| 4 | ledger + triggers + step4b | civilizations start being handed what they have become |
| 5 | blueprints + diffusion orders + channels | the weak can steal, buy, copy, and adapt their way to survival |
