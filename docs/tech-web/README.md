# Stars of Dominion — Technology Web

This directory is the complete design for the game's technology system: eight domain catalogs holding 124 researchable techs, an integration map that adds 6 bridge techs and derives 9 civilization paths, and a meta-systems document defining emergent technology, diffusion, the knowledge/implementation split, and the engine migration plan. **142 techs in total.**

Start here. Use [index.md](index.md) to look up any tech by id. Read [web-map.md](web-map.md) before adding a cross-domain prerequisite, and [systems.md](systems.md) before touching the engine.

---

## Design philosophy

**Horizontal expansion over vertical stats.** Almost nothing in this web is a percentage. Each tech opens a mechanic, a decision, an order type, a building, a new kind of trouble: compute becomes an allocatable resource, food becomes a chemical industry, hyperlanes become editable, orbit over a defended world becomes something you have to win against the surface. Power comes from having more kinds of moves than your rivals, not bigger numbers on the same moves.

**Web over line.** There is no per-domain ladder to climb. The graph has three roots — `phys_fusion_power`, `mat_advanced_composites`, `plan_closed_ecologies` — and descends along two trunks: energy→compute and matter→interstellar. Everything else hangs off cross-domain prerequisites. Societal forecasting requires signals intelligence; synthetic minds require gene engineering; terraforming requires adapted colonists and a fusion surplus; the entire economy domain past Tier 1 requires a non-economy partner for every step. No domain can be rushed in isolation, and every deep specialization transits at least two others.

**Knowledge vs implementation.** Research completing changes only what you are *allowed* to build and order. Capability is bought separately, colony by colony, in buildings, staffing, upkeep, and construction ticks — and modifier effects scale with implementation coverage rather than applying at unlock. This is the single lever that stops research from transforming an empire overnight, makes conquering a developed world worth more than conquering an empty one, and keeps stolen technology (which carries adaptation debt) below parity with the homegrown kind.

**Consequences.** Every capability arrives welded to a cost that is not a resource cost: a new attack surface (the genome archive, the panopticon grid, the elevator ribbon, the counterintelligence registry), a new constituency (displaced dockworkers, organized labor, a machine bloc, the Adapted), or a new dependence (food downstream of the power grid, sovereignty downstream of a containment ring, a fleet downstream of a biomass lift). The vulnerability section of every entry is design content, not flavor — and in several cases it is the entry's whole point.

**Identity emergence.** Mutually exclusive forks partition who you are at Tier 2 — power doctrine, settlement doctrine, industrial organization, network order, statecraft, capital doctrine, force identity, enhancement path — and what you permanently become at Tier 4: stellar destiny, worlds' purpose, machine sovereignty, sovereignty, market endstate, species destiny, command sovereignty, fabrication endstate. Civilization identity is never picked from a menu. It precipitates out of a route through the web, and the forks guarantee that two committed empires cannot converge.

**Emergent technology.** Conduct is a research program. A per-faction History Ledger counts what a civilization actually does — wars survived, sanctions endured, coups weathered, worlds evacuated, bombardments ordered — and when a trigger fires, the institution the behavior already built is revealed as a crash program at half cost, auto-completing if the behavior continues past twice the threshold. Fifteen triggers exist: twelve standalone `emg_` techs and three catalog reveals that unlock an existing tech early rather than duplicating a design. See [systems.md §1](systems.md).

**Diffusion.** Technology leaks. Nine channels — espionage theft, licensing, research compacts, battlefield salvage, conquest absorption, corporate transfer, migration, archaeology, and simple observation — all produce the same blueprint object, merged by fidelity and assimilated at a discount that grows as a tech commoditizes. The weak survive by stealing, buying, copying, and adapting; the leader pays for its lead in exposure across every channel at once. See [systems.md §2](systems.md).

---

## Tiers: the four eras

- **Tier 1 — Expansion.** Breaking the founding bottlenecks: energy, lift, connectivity, administration, sealed habitability. Tier 1 techs are broad enablers everyone eventually wants, and they already carry teeth — the relay network can be cut, the fuel cycle blockaded, the mass driver aimed at a neighbouring continent. The map opens.
- **Tier 2 — Specialization.** The identity era. Most of the mutex forks live here, and each asks the same question in a different costume: what kind of society are you? Open grid or sovereign mesh, arcologies or microfab swarms, surveillance or federation or plebiscite, germline charter or somatic market. Choices start compounding and start locking rivals' answers out of your reach.
- **Tier 3 — Dominance.** The chosen specialization at full power: autonomous administration, molecular manufacturing, antimatter, counterintelligence lattices, terraforming, pantropy. Tier 3 empires stop reacting and start pre-empting — and every capability is now large enough to be a strategic target and a domestic political problem simultaneously.
- **Tier 4 — Transformation.** No longer "what can we do" but "what are we, permanently." Species destiny, machine sovereignty, market endstates, eating or growing worlds, a capital that never lands. Every Tier 4 commitment is an irreversible civilizational statement that retires an old problem and installs a new one no government has faced before.

---

## Domain catalogs

**[physics-energy-spaceflight.md](physics-energy-spaceflight.md) — 16 techs.** The throttle of the civilization: fusion fuel cycles, energy banking, lift channels, torch drives, antimatter, deep-space navigation, and the Tier 4 stellar-destiny fork (starlifting versus lane forging, with singularity engines outside it). Physics is never a destination in this web; it is the toll bridge every other domain crosses at every tier. **Identity enabled:** the civilization defined by where its power comes from and where its ships can go — the one that ends the game *located differently* from everyone else.

**[planetary-megastructures.md](planetary-megastructures.md) — 16 techs.** The map as a product: sealed ecologies, undercities, benthic districts, climate control, terraforming, orbital habitats, rings, Dyson swarms, and the worlds'-purpose fork (Gaia Transformation versus Planetary Disassembly). **Identity enabled:** gardener, moleman, or nomad. The settlement-doctrine fork at Tier 2 — open sky, hermetic, voidborn — is the deepest identity choice in the web, because it decides what a planet is *for* before the empire has any idea what it will become.

**[infrastructure-materials.md](infrastructure-materials.md) — 16 techs.** Grids, composites, distribution priority, mass drivers, port automation, orbital industry, molecular manufacturing, and the fabrication endstate (The Common Forge versus Licensed Matter). **Identity enabled:** the arsenal civilization — hardest to strangle, its production surviving contact with the enemy — carrying the displaced-labor arc that every automation tech deepens and that Tier 4 must finally resolve, in one direction by abolishing scarcity and in the other by sealing it behind a licence.

**[computing-communications.md](computing-communications.md) — 17 techs.** Compute as a stockpiled resource, relay lattices and dark systems, machine intelligence, societal forecasting, infowar, memetic engineering, the hyperwave backbone, and the machine-sovereignty fork (The Enfranchisement, The Oracle State, The Covenant) plus substrate emigration alongside it. **Identity enabled:** the information civilization, whose weapons are latency, attention, and prediction, and whose central question is eventually constitutional rather than technical.

**[biology-medicine.md](biology-medicine.md) — 14 techs.** The population as the engineered artifact: genome archives, industrial biofabrication, ecological succession, adaptation packages, longevity, pantropy, tailored pathogens, and the species-destiny fork (Radiant Speciation versus The Common Genome), with Gaian Synthesis sitting outside the fork as the living-world layer above a transformed gaia planet. **Identity enabled:** the civilization that outlasts and out-adapts rather than out-shoots — and pays for it in divergence politics, gerontocracy, and a genome archive that is the single most damaging thing an enemy can steal.

**[society-governance.md](society-governance.md) — 14 techs.** The state itself as terrain: civic platforms, provinces, social insurance, the statecraft fork (Surveillance State / Federal Autonomy / Participatory Mandate), constitutional conventions, continuity of government, habitat charters, and the sovereignty fork (Custodial Executive, Perpetual Plebiscite, Covenant of Worlds). **Identity enabled:** the empire that bends where others shatter — and the domain whose branches anchor more Tier 4 techs across other files than any other, because what kind of state you built decides what kind of machine, market, or species is allowed to inherit it.

**[economics-markets.md](economics-markets.md) — 14 techs.** Credits, contracts, and confidence as weapons: sovereign bonds, exchanges, futures, development finance, the capital-doctrine fork (Directed Capital versus Free Port Compact), reserve-currency clearing with its self-depleting sanction, market raids, and the market endstate (Futarchic Mandate versus Great Decommodification). **Identity enabled:** the corporate-mercantile state that can bankrupt a war effort without firing a shot — and that discovers, too late, that open capital runs in both directions.

**[military-espionage.md](military-espionage.md) — 17 techs.** Organized violence and organized knowing, deliberately intertwined in one file: command networks, SIGINT, the force-identity fork (mass mobilization versus elite precision), autonomous warfare, spectral warfare, resident networks, synthetic identities, counterintelligence lattices, consensus engineering, survivable deterrence, and the command-sovereignty fork (Sovereign War Machine versus Covenant of Command). **Identity enabled:** the security state in its many forms — and a society that has, by its own hand, earned its own distrust.

**Supporting documents:**

- **[systems.md](systems.md)** — the meta-systems: emergent technology (History Ledger, metric catalog, 15 triggers), the nine diffusion channels and the shared blueprint model, the knowledge/implementation two-stage model with coverage and adaptation debt, and the phased engine migration plan in §4.
- **[web-map.md](web-map.md)** — the integration map: web topology (three roots, two trunks, cross-domain feed patterns), 22 combination unlocks, the 6 bridge techs, the 9 civilization paths, and the 41-node anchor dependency skeleton.
- **[index.md](index.md)** — the master table of all 142 techs, grouped by domain and tier-ordered, with prerequisites and a one-line mechanic each.

---

## How the nine civilization paths emerge

The paths are not scripted content. They fall out of the topology: three roots feed two trunks, the trunks fan into the domains, and the mutex forks prune what a committed route can still reach. Follow banking and exchanges off the interstellar trunk and you drift toward the Charterhouse League. Follow compute into governance and you arrive at the Delegated State holding the machine-rule question. Take closed ecologies toward habitats and drives and you are already half Unmoored before you have decided to be.

[web-map.md §4](web-map.md) works nine such routes out in full — the Cornucopia Compact, the Charterhouse League, the Concordant Worlds, the Arsenal Ascendancy, the Tailored Lineage, the Delegated State, the Panopticon Mandate, the Gardeners' Covenant, and the Unmoored — each one ordered so that every tech's prerequisites appear earlier in its own route, each flagged with the mutex forks it consumes, and each annotated with the structural weakness it cannot design away. They are illustrations, not a menu. Any committed cross-domain route produces an identity; these nine simply show the shape of the thing.

---

## Two civilizations, unrecognizable

Both begin with the same three roots and the same rules. A century later:

The **Gardeners' Covenant** took closed ecologies into climate control, swore the Open Sky Compact, and terraformed its marginal worlds into gardens that maintain themselves. Its population lives under open sky on habitability-100 planets it can never abandon. Its legitimacy compounds from every wilderness preserve and every completed terraform. Under Gaian Synthesis its oldest worlds have a visible condition — flourishing, stressed, wounded — and refuse rezoning orders when pushed too hard, so its government negotiates with its own territory. Its wars are fought carefully, over worlds neither side will bombard, because wounding a garden is an atrocity the attacker's own public will not forgive. Its weakness is that everything it loves has an address.

The **Unmoored** took the same closed ecologies into orbit, swore the Voidborn Mandate, and left. Its demographic core lives in habitat cylinders and flotillas that move along the hyperlane graph and, with deep-space navigation, off it. Its planets are quarries run by skeleton crews under a declared extraction stance. Under the Wandering Throne its capital is a fleet, and `distanceFromCapital` — the number that decides which provinces feel governed — recomputes every time the court moves. Nothing it values can be invaded, and nothing it rules feels ruled. Its weakness is that everything it is can, in principle, be boarded.

Same roots, same rules, no shared vocabulary: one measures itself in reclaimed ground, the other in delta-v; one cannot leave, the other cannot stay. That distance — reachable from a common start, unbridgeable at the end — is what the web is for.

---

## Relationship to the current code

These documents **replace the placeholder trees in `lib/tech/trees/`** (215 generated stubs across `diplomacy.ts`, `economy.ts`, `espionage.ts`, `infrastructure.ts`, `military.ts`). Tech ids in the catalogs are canonical and final; each domain entry specifies its engine hooks — order types, building ids, `unlockFlags`, `modifierKeys` — against systems that already run in `scripts/game-loop.ts` and `lib/`.

The engine migration plan lives in **[systems.md §4](systems.md)**, sequenced so each phase ships independently and the live game improves at every step:

- **Phase 0** fixes the research-completion bug. `TechEngine.assignResearch` (`lib/tech/engine.ts`) never sets `slot.ticksRequired`, and the worker's completion check in `step4_research` (`lib/time/tick-processor.ts`) requires it — so in the live game research never completes at all. The fix adds a shared `HOURS_PER_TICK` constant, a repair pass that heals worlds already stuck mid-research on the first tick after deploy, and a shared `applyUnlock` path to replace the unlock logic `step4_research` currently re-implements inline.
- **Phase 1** makes `unlockFlags` consumable: a `hasTechFlag` helper plus an `ORDER_TECH_GATES` table checked once at the top of the game-loop switch, wiring the flag consumers that are presently dead or hardcoded (the espionage `'dip_sha_1'` check, the corporate `CHARTER_TECH_ID` gate, treaty-type validation, movement-layer access).
- **Phases 2–3** extend modifier consumption beyond `getFactionEconomyMods` — currently the only consumer in the codebase — via a generic `getTechModifier` with a namespaced key registry, then make `UNLOCK_ACTION` and `UNLOCK_BUILDING` real, and add the implementation/coverage/adaptation-debt layer.
- **Phases 4–5** add the History Ledger and emergent triggers (`step4b_emergentTech`, running immediately after research), then the diffusion orders — `ESP_STEAL_TECHNOLOGY` upgraded from its `console.log` stub, `TECH_ASSIMILATE_BLUEPRINT`, `MIL_SALVAGE_WRECKAGE`, licensing via the existing offer flow — and the persistence they need.

All new state is additive inside aggregates the serializer already carries, so no Prisma migration is required; JSON-bearing columns remain TEXT holding JSON strings per project convention; all faction-state mutation flows through the order queue rather than API routes; and the game-loop worker must be restarted after deploy.
