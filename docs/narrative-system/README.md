# Stars of Dominion — The Narrative System

This is the design for the galaxy's memory: a system that watches the simulation, records what actually happened, and pays an unreliable press to tell everyone what it *thinks* happened. Players generate the raw material; this system turns it into a history they lived through.

The one-sentence architecture:

```
Simulation → ChronicleEvent (facts) → importance gate → press interpretation → Narrator (prose) → Gazette
                     │                                                              ▲
                     └────────── memory queries (feuds, eras, precedent) ───────────┘
```

---

## Design philosophy

**The simulation is the author; the narrative system is the historian.** No LLM ever decides what happens. Every mechanical outcome — battle results, operation success, treaty state — is resolved by the deterministic engine before the narrative layer hears about it. The narrator's only power is interpretation. This is an absolute, load-bearing rule (see Invariants).

**Two truths, two tables.** What happened and what the galaxy believes happened are different data. `ChronicleEvent` records the facts, including who *really* did it. The press layer only ever sees the *public attribution* — which the espionage system's existing `AttributionState` ladder (`invisible → suspected → exposed`) already computes. A successful covert op doesn't hide the event; it corrupts the byline. Players manipulate the story by manipulating attribution and evidence, not by editing prose.

**Memory is a query, not a context window.** The galaxy "remembers" through indexed Postgres queries over the chronicle — not by stuffing 200 hours of history into a prompt. A rivalry is a count of hostile events between a faction pair. A famous battle is a high-importance event. A war that references an old feud gets that flavor because a three-line SQL-derived summary was placed in the prompt, deterministically. The prose is generated; the memory is structured.

**Most events deserve no prose.** A tick produces dozens of events; the gazette that reports all of them is spam nobody reads. A deterministic importance score gates what reaches the narrator, and coalescing merges related events (one battle = one report, not five district actions). The LLM is a scarce, budgeted resource; the filter in front of it is where editorial judgment lives — in code.

**The press is a character, not a pipe.** The press system already models publishers with `credibility`, `bias`, and type (`STATE_MEDIA`, `INDEPENDENT_MEDIA`, `PIRATE_PRESS`). The narrator writes *in the voice of the publisher*: state media flatters its empire, pirate press assumes the worst of everyone, independents follow evidence. The same ChronicleEvent can produce two contradictory articles — that is a feature, and the existing `evidenceStrength` mechanics decide which one the population believes.

**The game must run with the narrator dead.** The narrator is a separate process that reads events and writes articles. If it crashes, rate-limits, or the LLM bill runs out, the simulation ticks on untouched and prose catches up later. The fallback chain already exists in `lib/ai/llm-provider.ts`: `gemini → template → mock`. Template output is worse prose, never a broken game.

---

## What already exists in the code

This design absorbs, rather than replaces, three running systems and one orphan:

**The press simulation** (`lib/press-system/`, ~2,200 lines) — the interpretation machinery is largely built:
- `Story` with `truth: TRUE|FALSE|UNKNOWN`, `evidenceStrength`, `baseMagnitude`, and sources (`ESPIONAGE_LEAK`, `WAR_REPORT`, `ECONOMIC_DATA`, `RUMOR_MILL`).
- `PressFactionState` — per-publisher `credibility` and `bias`; three press types.
- `MediaCrisis` with ten response choices (`SUPPRESS`, `DENY`, `BLAME_FOREIGN`, `COUNTER_LEAK`, `DISTRACT`, …), foreign reactions, and hidden predictions with payouts.
- `Investigation` — the Rumour → Inquiry → Evidence → Publication → Scandal ladder, with obstruction risk.
- `MediaCampaign` — covert foreign information warfare with exposure and tracing.
- Propagation — stories physically spread planet-to-planet; jamming and quarantine block them.

**Espionage attribution** (`lib/espionage/`) — `AttributionState` and `AttributionRecord` already model who-can-know-what for covert acts.

**The LLM stack** (`lib/ai/`) — provider abstraction with fallback (`gemini | ollama | template | mock`), `faction-personalities.ts` for voice material, `discourse-memory.ts` (an in-memory thread store explicitly marked as needing a real backing store — the chronicle is that store).

**The orphan:** a `Gazette` Prisma model (`day`, `headline`, `lede`, `tone`, `image`), a read API at `app/api/gazette/route.ts`, and `components/Newspaper.tsx` — with **no writer anywhere in the codebase**. The newspaper is plumbed and empty. The narrator is the missing writer.

**What did not exist before phase 0:** any persistent event log (press `SimulationState` lives inside the world snapshot and remembers only active/published stories), any notion of rivalry/feud/era, and any writer for the gazette.

> **Warning from history:** the press system's tick-order and propagation invariants were silently broken once by a well-meaning integration. This design's answer is structural: the narrator *never* holds a reference to mutable world state. It reads committed rows, writes to its own tables, and nothing the simulation reads is ever written by the narrator.

---

## The chronicle — the galaxy's factual memory

Append-only; rows are never updated after creation except the `narratedAt` marker. Defined in `prisma/schema.prisma`, migration `narrative_phase0`:

```prisma
model ChronicleEvent {
  id          String    @id @default(cuid())
  tick        Int
  day         Int
  type        String
  importance  Int
  actorIds    String // JSON array — who REALLY acted; never exposed to the press layer
  targetIds   String // JSON array
  location    String?
  facts       String // JSON — type-specific mechanical outcome
  attribution String // 'exposed' | 'suspected:<factionId>' | 'invisible'
  coalesceKey String?
  narratedAt  DateTime?
  createdAt   DateTime  @default(now())

  @@index([narratedAt, importance])
  @@index([type, tick])
  @@map("chronicle_events")
}
```

Conventions match the repo: JSON-bearing columns are TEXT holding JSON strings; call sites parse.

**Emission.** Call sites invoke `chronicle.record(world, draft)` — synchronous, allocation-only, and unable to throw into a tick. Drafts buffer in memory; `flushChronicle()` writes them in one batch **after** the world snapshot and faction shards commit, so a mid-tick crash never leaves the chronicle claiming things the saved world doesn't show. A caller with no valid sim clock is dropped rather than filed on day 0, because the chronicle is append-only and a junk row at the front of history is permanent.

**Importance scoring** is a pure function of `(type, facts)` in `lib/narrative/chronicle-importance.ts` — a static table with modifiers, testable, no I/O and no randomness:

| Band | Examples |
|---|---|
| 90–100 | capital falls, empire eliminated, civil war starts |
| 70–89 | war declared/ended, coup, secession, treaty betrayed |
| 40–69 | major battle, exposed espionage op, sanctions, famous leader dies |
| 15–39 | skirmish, trade route lost, cabinet reshuffle, suspected op |
| 0–14 | routine — recorded for memory queries, never narrated |

Fact modifiers: casualty scale, capital/homeworld involvement, decisiveness, and war outcome. Context modifiers that need the chronicle itself (feuds, reversals, galactic firsts) belong to the narrator's context pass in phase 2, not to this pure function.

---

## Derived memory — feuds, eras, precedent

No new authored state; everything below is a query or a cached query.

**Feuds.** Hostile-event count between an ordered faction pair over a sliding window. Above a threshold, a `Feud` row is created (pair, startedTick, topEventIds, epithet). The epithet — "the Varesh Question", "the Ten-Day Betrayal" — is generated once by the narrator and cached; the *existence* of the feud is pure arithmetic. Feuds cool: no qualifying events for a long window → status `dormant`. Later hostilities between the pair get the feud summary injected into their narration prompt — that is the entire mechanism behind "this war is a continuation of an old rivalry".

**Eras.** A background job in the narrator segments history at cluster boundaries of 90+ importance events: "the Founding Peace", "the First Corsair War". Purely presentational — eras exist so retrospectives and new-player catch-up have chapters.

**Precedent.** When narrating an event, the narrator queries the top-3 prior events sharing actors or location with importance ≥ 70. Their already-generated headlines are offered to the prompt as "prior coverage". This is how the gazette keeps continuity of tone about a place without any long-term LLM memory.

---

## The narrator — a fourth container

A standalone loop (`scripts/narrator.ts`), same Docker image as the app, deployed as its own compose service. It is to prose what the game-loop worker is to ticks.

```
loop:
  events   = SELECT ... WHERE narratedAt IS NULL AND importance >= THRESHOLD
             ORDER BY importance DESC LIMIT batch        (coalesce by coalesceKey)
  for each event group:
    voice    = pick publisher (press-system state: type, credibility, bias, active crises)
    memory   = feud summary + precedent headlines + faction personalities   (SQL, ~15 lines)
    visible  = facts filtered through attribution      (the LLM never receives hidden actors)
    prose    = generateText(prompt(voice, memory, visible))   // existing llm-provider fallback chain
    write NarrativeArticle + Gazette row; mark narratedAt
  sleep(interval)
```

```prisma
model NarrativeArticle {
  id          String   @id @default(cuid())
  eventIds    String // JSON array of ChronicleEvent ids this article covers
  publisherId String
  kind        String // 'news' | 'investigation' | 'propaganda' | 'retrospective' | 'obituary' | 'rumor'
  headline    String
  body        String
  stance      String? // JSON — claims made vs facts, for later contradiction plays
  day         Int
  createdAt   DateTime @default(now())

  @@index([day])
  @@map("narrative_articles")
}
```

The existing `Gazette` table stays as the *front page* — the narrator writes the day's top articles into it, which lights up the already-built read API and UI for free. `NarrativeArticle` is the full archive behind it.

**Perception in output.** Because the prompt receives attribution-filtered facts, a successful covert op yields state media reporting "spontaneous unrest on Varesh" while — if an `Investigation` later reaches `PUBLICATION` with enough evidence — an independent outlet publishes the exposé *referencing the original article's claim*. The `stance` column exists so the narrator can be told what each publisher previously claimed, making later contradictions and credibility collapses land.

**Retrospectives.** On a slow cadence, the narrator runs one extra job: highest-importance events of the closing period plus era and feud state → one historical retrospective. This is the cheapest feature per unit of "I lived through a historical period" in the whole design.

**Budget.** Hard caps in config: max LLM calls per hour and per day. Beyond cap, events queue (they're durable rows). Template output is used for low-band events even when a good model is available — spend the good prose on history, not on skirmishes.

---

## Invariants (the list that keeps this system safe)

1. **The narrator never writes anything the simulation reads.** Its write set is exactly: `NarrativeArticle`, `Gazette`, `Feud` epithets, `narratedAt` markers.
2. **The tick processor never awaits an LLM.** Chronicle emission is a synchronous in-memory buffer plus one batch insert after the snapshot commits.
3. **LLM output is never parsed for game effect.** Prose is display-only. Mechanical consequences of press activity stay in the deterministic press system.
4. **The chronicle is append-only.** History is not edited. Cover-ups change *attribution and articles*, never facts.
5. **Narration is idempotent and crash-safe.** `narratedAt IS NULL` is the queue; marking happens in the same transaction as the article insert.
6. **The press layer receives only attribution-filtered facts.** Hidden actors never appear in any prompt — an LLM cannot leak what it was never shown.

---

## Server deployment

One service added to `compose.prod.yaml`:

```yaml
  narrator:
    image: stardom-app
    pull_policy: never
    container_name: stardom-narrator
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment: *app-env      # includes LLM_PROVIDER
    command: ["npx", "tsx", "scripts/narrator.ts"]
```

Sizing for the home server (Ryzen 5 4500U, 6 cores, 14 GiB RAM, 422 GB free): the narrator idles 99% of the time; its own cost is one Node process. The LLM behind it is a free choice — generation latency is irrelevant because nothing waits on it, and post-gating volume is a handful of calls per game-day. All options ride the existing `LLM_PROVIDER` switch:

- **`template`** — zero cost, zero network, worst prose. Phase 1 runs entirely on this, and it is the permanent fallback: the game must always be playable here.
- **`ollama`** (self-hosted) — everything stays on your hardware. A quantized 4–8B model wants ~3–6 GB alongside Postgres and Next, which this machine has. Expect roughly 5–8 tokens/sec on CPU: a gazette article in one to two minutes, invisible to an asynchronous narrator. Also viable on a different machine over LAN or Tailscale; the durable queue tolerates that machine being offline.
- **`gemini`** or another API (each is one small file in `lib/ai/providers/`) — best prose per effort, cents per month at this volume; the trade-off is an external dependency and event summaries leaving the server.

Recommended sequence: ship on `template`, trial `ollama` with an 8B model, read a week of gazette output, and only then decide whether the prose gap is worth an API. The provider can be flipped any day; nothing downstream changes.

Backups: the chronicle and articles live in the same Postgres, so the existing nightly `pg_dump` already covers the galaxy's entire history.

---

## Phased plan

Each phase ships alone, is testable alone (tsx scripts, per repo convention — jest is unconfigured), and the game is playable after every phase.

**Phase 0 — Chronicle. ✅ Done.** Prisma models (`ChronicleEvent`, `NarrativeArticle`, `Feud`) with migration `narrative_phase0`; `lib/narrative/chronicle.ts` (buffer plus post-commit batch flush) and `chronicle-importance.ts` (the scoring table). The flush runs in `scripts/game-loop.ts` after the snapshot and shards commit.

Emission is live at these decision points — each is the line where the outcome becomes final:

| Event | Where |
|---|---|
| `war_declared` | `lib/diplomacy/offer-service.ts` — `registerActOfWar`, after the already-at-war guard so a running war is not re-declared |
| `war_ended` | same file — the `peace_offer` branch of the accepted-offer handler |
| `treaty_broken` | same file — `breakTreaty` |
| `operation_resolved` / `operation_exposed` | `lib/espionage/espionage-service.ts` — both resolution paths, via `recordOperationToChronicle`, carrying the real actor and the public attribution separately |
| `coup_attempted` / `government_changed` | `lib/government/coup-service.ts` — at the success roll |
| `secession_declared` | `lib/government/secession-service.ts` — when the crisis is registered |
| `civil_war_started` | `lib/government/civil-war-service.ts` — after fission completes |
| `leader_died` / `leader_rose` | `lib/government/succession-service.ts` — `resolveSuccession`, coalesced so one succession is one story |
| `system_captured` / `capital_captured` / `colony_founded` | `scripts/game-loop.ts` — `recalculateSystemControl`, the only place system ownership is decided |
| `battle_resolved` | `scripts/game-loop.ts` — both siege capture paths, via `recordSiegeCapture` |
| `planet_bombarded` | `scripts/game-loop.ts` — the `MIL_BOMBARD` order handler |

Tests:

```bash
npx tsx scripts/test-narrative-phase0.ts
```

covers scoring, buffering, persistence, and the diplomacy and succession call sites.

```bash
npx tsx scripts/test-narrative-phase0-live.ts
```

flips a system's owner in the dev world, runs the real worker, asserts the row appears, and restores the world. It mutates and then repairs the dev database — never point it at the server.

**Phase 1 — Narrator walks.** `scripts/narrator.ts` loop with the `template` provider only; coalescing; Gazette rows written. The empty newspaper UI comes alive. Test: seed chronicle events, run the narrator once, assert articles plus idempotency.

**Phase 2 — Memory.** Feud derivation and injection; precedent queries; importance modifiers that read the chronicle; era segmentation. Test: manufacture a feud, assert the next war's prompt contains it.

**Phase 3 — Voices and truth.** Publisher voice selection from press-system state; attribution filtering; `stance` recording; investigations produce exposés that cite prior coverage; a real LLM wired in behind the budget caps.

**Phase 4 — History features.** Retrospectives, obituaries for major leaders, era naming, and a History UI panel reading `NarrativeArticle` — the archive players browse to relive the war their grandparents started.

---

## Open questions (decide before phase 3)

- **One gazette or one per empire?** Propagation already tracks per-planet story intensity; a player arguably should only read articles that reached their planets. Phase 1 ships a single galactic gazette; scoping by propagation is a filter on the read API later, not a schema change — but the decision affects how much the front page can "know".
- **Player-written statements.** Letting players publish official statements would feed the narrator first-party material and make `DENY` and `COUNTER_NARRATIVE` feel authored. Cheap once phase 3 exists; deliberately out of scope before it.
- **Name generation for epithets and eras** — narrator-generated and cached, but needs a length and profanity guard even on the template path.
