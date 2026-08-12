# Stars of Dominion — The Narrative System

This is the design for the galaxy's memory: a system that watches the simulation, records what actually happened, and pays an unreliable press to tell everyone what it *thinks* happened. Players generate the raw material; this system turns it into a history they lived through.

The one-sentence architecture:

```
Simulation → ChronicleEvent (facts) → importance gate → press interpretation → Narrator (LLM prose) → Gazette
                     │                                                              ▲
                     └────────── memory queries (feuds, eras, precedent) ───────────┘
```

---

## Design philosophy

**The simulation is the author; the narrative system is the historian.** No LLM ever decides what happens. Every mechanical outcome — battle results, operation success, treaty state — is resolved by the deterministic engine before the narrative layer hears about it. The narrator's only power is interpretation. This is an absolute, load-bearing rule (see Invariants).

**Two truths, two tables.** What happened and what the galaxy believes happened are different data. `ChronicleEvent` records the facts, including who *really* did it. The press layer only ever sees the *public attribution* — which the espionage system's existing `AttributionState` ladder (`invisible → suspected → exposed`) already computes. A successful covert op doesn't hide the event; it corrupts the byline. Players manipulate the story by manipulating attribution and evidence, not by editing prose.

**Memory is a query, not a context window.** The galaxy "remembers" through indexed Postgres queries over the chronicle — not by stuffing 200 hours of history into an LLM prompt. A rivalry is a count of hostile events between a faction pair. A famous battle is a high-importance event. A war that references an old feud gets that flavor because a three-line SQL-derived summary was placed in the prompt, deterministically. The prose is generated; the memory is structured.

**Most events deserve no prose.** A tick produces dozens of events; the gazette that reports all of them is spam nobody reads. A deterministic importance score gates what reaches the narrator, and coalescing merges related events (one battle = one report, not five district actions). The LLM is a scarce, budgeted resource; the filter in front of it is where editorial judgment lives — in code.

**The press is a character, not a pipe.** The press system already models publishers with `credibility`, `bias`, and type (`STATE_MEDIA`, `INDEPENDENT_MEDIA`, `PIRATE_PRESS`). The narrator writes *in the voice of the publisher*: state media flatters its empire, pirate press assumes the worst of everyone, independents follow evidence. The same ChronicleEvent can produce two contradictory articles — that is a feature, and the espionage `evidenceStrength` mechanics decide which one the population believes.

**The game must run with the narrator dead.** The narrator is a separate process that reads events and writes articles. If it crashes, rate-limits, or the LLM bill runs out, the simulation ticks on untouched and prose catches up later. Fallback chain already exists in `lib/ai/llm-provider.ts`: `gemini → template → mock`. Template output is worse prose, never a broken game.

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

**Espionage attribution** (`lib/espionage/`) — `AttributionState` and `AttributionRecord` already model who-can-know-what for covert acts, and `espionage-service.ts` already has a `buildNarrative(domain, success, attribution)` sketch.

**The LLM stack** (`lib/ai/`) — provider abstraction with fallback (`gemini | ollama | template | mock`), `faction-personalities.ts` for voice material, `discourse-memory.ts` (in-memory thread store, explicitly marked "in production this would be backed by a real store" — the chronicle is that store).

**The orphan:** a `Gazette` Prisma model (`day`, `headline`, `lede`, `tone`, `image`) and a read API at `app/api/gazette/route.ts` — with **no writer anywhere in the codebase**. The UI's newspaper is plumbed and empty. The narrator is the missing writer.

**What does not exist:** any persistent event log (press `SimulationState` lives inside the world snapshot and remembers only active/published stories), any notion of rivalry/feud/era, any LLM involvement in the press output, and any writer for the gazette.

> **Warning from history** (project memory): the press system's tick-order and propagation invariants were silently broken once by a well-meaning integration. This design's answer is structural: the narrator *never* holds a reference to mutable world state. It reads committed rows, writes to its own tables, and nothing the simulation reads is ever written by the narrator.

---

## The chronicle — the galaxy's factual memory

New Prisma model. Append-only; rows are never updated after creation except the `narratedAt` marker.

```prisma
model ChronicleEvent {
  id            String   @id @default(cuid())
  tick          Int
  day           Int
  type          String   // 'war_declared' | 'battle' | 'treaty_broken' | 'op_resolved' | 'leader_rose' | ...
  importance    Int      // 0-100, computed at emission, deterministic
  actorIds      String   // JSON array — who REALLY acted (never shown to press layer)
  targetIds     String   // JSON array
  location      String?  // system/planet id
  facts         String   // JSON — type-specific mechanical outcome (casualties, sums, terms)
  attribution   String   // 'invisible' | 'suspected:<factionId>' | 'exposed' — public knowledge ceiling
  coalesceKey   String?  // events sharing a key within a window merge into one narration
  narratedAt    DateTime? // null = not yet processed by narrator
  createdAt     DateTime @default(now())

  @@index([narratedAt, importance])
  @@index([type, tick])
  @@map("chronicle_events")
}
```

Conventions (matching the repo): JSON-bearing columns are TEXT holding JSON strings; call sites parse.

**Emission.** The tick processor (`lib/time/tick-processor.ts`) and order handlers (`scripts/game-loop.ts`) call a tiny synchronous helper — `chronicle.record(type, {...})` — at the moments they already log to console today. The helper buffers in-memory during the tick and flushes to Postgres in one batch write after the world snapshot commits, so a mid-tick crash never leaves the chronicle claiming things the saved world doesn't show.

**Importance scoring** is a pure function of `(type, facts)` — a static table with modifiers, in code, testable:

| Band | Examples |
|---|---|
| 90–100 | capital falls, empire eliminated, civil war starts, galactic first (first war, first coup) |
| 70–89 | war declared/ended, coup, secession, leader assassinated, treaty betrayed mid-war |
| 40–69 | major battle, exposed espionage op, sanctions, crisis resolved, famous leader dies |
| 15–39 | skirmish, trade route opened/lost, cabinet reshuffle, suspected op |
| 0–14 | routine — recorded for memory queries, never narrated |

Modifiers: `+10` if actors are in an active feud, `+10` if it reverses a prior event (retaking a lost system), `+15` for a "first" in this galaxy's history. All computed from chronicle queries at emission time — cheap, indexed.

---

## Derived memory — feuds, eras, precedent

No new authored state; everything below is a query or a cached query.

**Feuds.** Hostile-event count between an ordered faction pair over a sliding window. Above a threshold, a `Feud` row is created (pair, startedTick, topEventIds, epithet). The epithet — "the Varesh Question", "the Ten-Day Betrayal" — is generated once by the narrator and cached; the *existence* of the feud is pure arithmetic. Feuds cool: no qualifying events for a long window → status `dormant`, and a retrospective may mark its end. Later hostilities between the pair get the feud summary injected into their narration prompt — that is the entire mechanism behind "this war is a continuation of an old rivalry".

**Eras.** A background job (in the narrator, not the game loop) segments history at cluster boundaries of 90+ importance events: "the Founding Peace", "the First Corsair War". Purely presentational — eras exist so retrospectives and new-player catch-up have chapters.

**Precedent.** When narrating an event, the narrator queries: top-3 prior events sharing actors or location with importance ≥ 70. Their headlines (already-generated prose, cached in `NarrativeArticle`) are offered to the prompt as "prior coverage". This is how the gazette gets continuity of tone about a place without any long-term LLM memory.

---

## The narrator — a fourth container

A standalone loop (`scripts/narrator.ts`), same Docker image as the app, deployed as its own compose service. It is to prose what the game-loop worker is to ticks.

```
loop:
  events   = SELECT ... WHERE narratedAt IS NULL AND importance >= THRESHOLD
             ORDER BY importance DESC LIMIT batch        (coalesce by coalesceKey)
  for each event group:
    voice    = pick publisher (press-system state: type, credibility, bias, active crises)
    memory   = feud summary + precedent headlines + faction personalities   (SQL, ~15 lines of text)
    visible  = facts filtered through attribution      (the LLM never receives hidden actors)
    prose    = generateText(prompt(voice, memory, visible))   // existing llm-provider fallback chain
    write NarrativeArticle + Gazette row; mark narratedAt
  sleep(interval)
```

```prisma
model NarrativeArticle {
  id          String   @id @default(cuid())
  eventIds    String   // JSON array — chronicle events this covers
  publisherId String   // press faction id — whose voice
  kind        String   // 'news' | 'investigation' | 'propaganda' | 'retrospective' | 'obituary' | 'rumor'
  headline    String
  body        String
  stance      String?  // JSON: claims made vs. actual facts — kept for later contradiction plays
  day         Int
  createdAt   DateTime @default(now())

  @@index([day])
  @@map("narrative_articles")
}
```

The existing `Gazette` table stays as the *front page* — the narrator writes the day's top articles into it (`headline`, `lede`, `tone`), which lights up the already-built read API and UI for free. `NarrativeArticle` is the full archive behind it.

**Perception in output.** Because the prompt receives attribution-filtered facts, a successful covert op yields state media reporting "spontaneous unrest on Varesh" while — if an `Investigation` later reaches `PUBLICATION` with enough evidence — an independent outlet publishes the exposé *referencing the original article's claim*. The `stance` column exists so the narrator can be told what each publisher previously claimed, making later contradictions and credibility collapses land. The press system's existing crisis choices (`DENY`, `COUNTER_LEAK`, `SUPPRESS`) then have visible narrative consequences, not just stat changes.

**Retrospectives.** On a slow cadence (game-weekly), the narrator runs one extra job: highest-importance events of the closing period + era/feud state → one "historical retrospective" article. This is the cheapest feature per unit of "I lived through a historical period" in the whole design.

**Budget.** Hard caps in config: max LLM calls per hour, max per day. Beyond cap, events queue (they're durable rows). `template` provider output is used for low-band (40–69) events even when Gemini is available — spend the good prose on history, not on skirmishes.

---

## Invariants (the list that keeps this system safe)

1. **The narrator never writes anything the simulation reads.** Its write set is exactly: `NarrativeArticle`, `Gazette`, `Feud` epithets, `narratedAt` markers. Enforced by code review and by never importing world-state mutators into `scripts/narrator.ts`.
2. **The tick processor never awaits an LLM.** Chronicle emission is a synchronous in-memory buffer + one batch insert post-commit. Total tick overhead: one INSERT.
3. **LLM output is never parsed for game effect.** Prose is display-only. Mechanical consequences of press activity stay in the deterministic press system.
4. **The chronicle is append-only.** History is not edited — not even by admins. Cover-ups change *attribution and articles*, never facts.
5. **Narration is idempotent and crash-safe.** `narratedAt IS NULL` is the queue; marking happens in the same transaction as the article insert. Narrator can die at any line and rerun.
6. **The press layer receives only attribution-filtered facts.** Hidden actors never appear in any prompt — an LLM can't leak what it was never shown.

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
    environment: *app-env      # includes LLM_PROVIDER / GOOGLE_API_KEY
    command: ["npx", "tsx", "scripts/narrator.ts"]
```

Sizing for the IdeaPad: the narrator is idle-waiting 99% of the time; RAM cost is one Node process. The LLM behind it is a free choice — the narrator is asynchronous, so generation latency is irrelevant, and post-gating volume is a handful of calls per game-day. All options ride the existing `LLM_PROVIDER` switch:

- **`template`** — zero cost, zero network, worst prose. Phase 1 runs entirely on this, and it is the permanent fallback: the game must always be playable here.
- **`ollama`** (self-hosted) — everything stays on your hardware. Constraint is RAM, not speed: a quantized 4–8B model wants ~3–6 GB alongside Postgres and Next; check `free -h` before committing. Also viable on a *different* machine over LAN/Tailscale (a desktop with a GPU runs bigger models) — the durable queue tolerates that machine being offline; articles simply catch up.
- **`gemini`** (or any API provider — each is one small file in `lib/ai/providers/`) — best prose per effort, cents/month at this volume; trade-off is an external dependency and event summaries leaving the server.

Recommended sequence: ship on `template`, trial `ollama` with a small model, read a week of gazette output, and only then decide whether the prose gap is worth an API. Provider can be flipped any day; nothing downstream changes.

Backups: chronicle and articles live in the same Postgres — the existing nightly `pg_dump` already covers the galaxy's entire history. Fitting, since losing the backups would itself be a historical event.

---

## Phased plan

Each phase ships alone, is testable alone (tsx scripts, per repo convention — jest is unconfigured), and the game is playable after every phase.

**Phase 0 — Chronicle.** Prisma models (`ChronicleEvent`, `NarrativeArticle`, `Feud`) + migration; `chronicle.record()` helper with buffer/flush; emission calls at ~15 sites in tick-processor and order handlers; importance table. Test: run ticks, assert events land with sane scores. No narrator, no UI change.

**Phase 1 — Narrator walks.** `scripts/narrator.ts` loop with `template` provider only; coalescing; Gazette rows written. The empty newspaper UI comes alive. Test: seed chronicle events, run narrator once, assert articles + idempotency.

**Phase 2 — Memory.** Feud derivation + injection; precedent queries; importance modifiers that read the chronicle; era segmentation job. Test: manufacture a feud, assert the next war's prompt contains it.

**Phase 3 — Voices and truth.** Publisher voice selection from press-system state; attribution filtering; `stance` recording; investigations produce exposé articles that cite prior coverage; Gemini wired in behind the budget caps.

**Phase 4 — History features.** Retrospectives, obituaries for major leaders (leadership system already generates them), era naming, and a "History" UI panel reading `NarrativeArticle` — the archive players browse to relive the war their grandparents started.

---

## Open questions (decide before phase 3)

- **One gazette or one per empire?** Propagation already tracks per-planet story intensity; a player arguably should only read articles that reached their planets. Phase 1 ships a single galactic gazette; scoping by propagation is a filter on the read API later, not a schema change — but the decision affects how much the front page can "know".
- **Player-written statements.** Letting players publish official statements (a press-release order) would feed the narrator first-party material and make `DENY`/`COUNTER_NARRATIVE` feel authored. Cheap once phase 3 exists; deliberately out of scope before it.
- **Name generation for epithets/eras** — narrator-generated and cached, but needs a profanity/length guard even on the template path.
