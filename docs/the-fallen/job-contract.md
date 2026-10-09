# The job contract

Item 14g of `docs/casual-play-build-spec.md`. A design document; nothing here is built yet.

## Why a contract

A fallen leader's crew plays jobs (heists, prison breaks, hijackings) as a text choose-your-own-adventure (Items 14b to 14f). A separate action game, first person and fast, is planned for later. It should be able to play the same jobs against the same galaxy without the server trusting it any more than it trusts the text pages.

The seam between them is a **contract**: the server writes down what a job is, who is on it, what it may yield at most, and how long it may take. The client plays it however it likes. When the client is done it posts an **outcome report**, which the server accepts only if:

- the report is signed with the token issued for that contract;
- it arrives in time;
- it stays inside the contract's limits.

The text resolver (`lib/fallen/job-service.ts`) is the reference player of the contract: everything it does today can be described as "fill in a report, then apply it". Each section below says what that means for the code that exists.

The rule all of this follows: **a client reports what happened; it never says how much.** It picks an ending, says who came back and in what state, and lists what it left behind. The server works out every credit, every ship and every clue itself, with the same functions the text jobs use, so the most a lying client can get is the best ending an honest crew could have played.

## Lifecycle

```
plan (14c)  ──►  claim  ──►  contracted  ──►  report  ──►  applied
                                   │
                                   └──►  expired  ──►  abandoned
```

1. **Plan.** Exactly as today: target, approach, crew, roles, watches, gear (`setPlan`, `startRecon`, `buyGear`). A joint job (14f) needs every party leader's commitment first.
2. **Claim.** The leader chooses "play it in the action game" instead of "Go". A new order, say `REB_JOB_CONTRACT`, runs every check `startJob` runs today:
   - the job's blockers;
   - the minimum number of watches;
   - the crew is free and not busy with an ally;
   - every party leader has committed.

   It then creates the run with status `contracted` instead of `running`. From here, everything a running job does applies:
   - the crew is busy;
   - the cooldown starts now (see "Time");
   - the plan is consumed.

   The worker issues the contract and its token. The page fetches them from an authenticated route (for example `/api/rebel/contract`), which answers only the account that holds the seat. For a joint job, any party leader may fetch the contract, but there is only one contract and one token.
3. **Contracted.** The text player is closed for this run, so one job cannot be played twice. Nothing in the galaxy moves because of it yet.
4. **Report.** The client posts the outcome report with the token. The worker validates it (see "Keeping a foreign client honest") and applies it. The run's status becomes the reported ending.
5. **Expired.** If no valid report arrives before `expiresAt`, the job is **abandoned**:
   - no act happens and nobody is hurt;
   - the crew comes home;
   - the cell pays the cost of a failed job in cover only (`FAILURE_COVER_LOSS`), because people were seen getting ready;
   - the cooldown still applies.

   A client that crashes costs the player a job, never a companion.

A contract can be fetched again until it is reported or expired: the same contract and the same token every time. Re-fetching never re-rolls anything.

## The contract

Built by the worker from the run and the plan; served as JSON. It carries **only what the leader's page already shows** (`refreshSeatView`): the same crew list after `crewForLeader` (nobody learns who has turned), odds as words, the officer's name. It carries nothing of the conqueror's: no case files, no heat as a number, no prisoner list beyond our own people.

```jsonc
{
  "contractVersion": 1,
  "contractId": "jc-<opaque>",
  "issuedAtSeconds": 1234567,             // sim seconds
  "expiresAtRealSeconds": 1790000000,     // wall clock; see "Time"
  "minPlaySeconds": 120,                  // a report sooner than this is refused

  "job": {
    "id": "vault",                        // JOB_BY_ID key
    "title": "The vault at Aldhani",
    "act": "heist",                       // CellActKind it lands as
    "approach": "quiet",                  // JobApproach
    "seed": "<run seed>"                  // the same seed the text resolver would use
  },

  "target": {                             // null for target 'none'
    "kind": "world",                      // 'world' | 'fleet'
    "label": "Barjern II",
    "conqueror": "Kaerruun",
    "officer": "Inspector Mara Voss"      // null without a living hunter
  },

  "crew": [
    {
      "id": "<companion id>",
      "name": "Renn Thorne",
      "role": "pilot",
      "species": "civ-elyndra",
      "skills": { "infiltration": 2, "violence": 1, "piloting": 5, "talk": 2, "tech": 3 },
      "part": "piloting",                 // the role they hold in the plan, or null
      "ownerSeat": "self",                // 14f: "self" or "ally" (never an id)
      "wounded": false
    }
  ],

  "intel": { "watches": 2 },              // recon levels: what the crew knows of the routine
  "gear": ["papers", "slicer"],           // GEAR ids bought for the plan

  "objectives": [
    { "id": "primary", "text": "Take the garrison's pay from the vault", "required": true },
    { "id": "quiet",   "text": "Nobody raises the alarm", "required": false }
  ],

  "limits": {
    "endings": ["success", "partial", "failure"],
    "maxNoise": 12,
    "maxTraces": 6,
    "fates": ["wound", "capture", "death"],
    "maxFates": 5,                        // at most one per crew member
    "loot": {
      "creditsCap": 54000,                // informative only: the server recomputes
      "ships": 1                          // hijack only
    }
  }
}
```

### Field notes

- **seed.** The action game may use it to lay out its level, so that the same contract always plays the same map and the same patrols. It must not be the only thing that decides an outcome, because a client could search seeds offline. That is why the seed is handed out openly and nothing on the server trusts a roll the client claims.
- **objectives.** These are derived from the job's act, not written per level:

  | Act | Primary objective |
  |---|---|
  | heist | take the money |
  | prison_break | get the prisoners out |
  | propaganda | get the broadcast on air |
  | hijack | leave with the ship |
  | ambush | the officer dies |

  The optional "quiet" objective is the partial/success line the text endings draw: success is the act done quietly, partial is the act done loudly.
- **limits.loot.creditsCap.** This is what `commitAct` would take today:

  ```
  min(1% of the conqueror's treasury, 1500 + strength × 40) × takeMultiplier
  ```

  It is shown so the action game can put a number on the vault door. The report never sends an amount.
- **ownerSeat.** Never another seat's id. The contract is readable by whoever holds it, and a party member's seat id is a secret of the same kind as the seat itself.
- **What is left out on purpose:**
  - loyalty and bond (the leader sees them, but nothing in an action level should turn on them);
  - `turned`;
  - exact chances;
  - the conqueror's counter-intelligence;
  - the hideout's concealment as a number;
  - other cells.

## The outcome report

```jsonc
{
  "contractVersion": 1,
  "contractId": "jc-<opaque>",
  "token": "<the contract token>",
  "ending": "partial",                    // one of limits.endings
  "objectivesMet": ["primary"],           // ids from the contract
  "noise": 7,                             // 0..limits.maxNoise
  "crew": [
    { "id": "<companion id>", "fate": "ok" },        // 'ok' | 'wound' | 'capture' | 'death'
    { "id": "<companion id>", "fate": "wound" }
  ],
  "traces": [                             // what the conqueror's people will find
    { "kind": "camera" },
    { "kind": "witness", "companionId": "<companion id>" },
    { "kind": "weapon",  "companionId": "<companion id>" }
  ],
  "epitaphs": { "<companion id>": "Held the stairs so the rest could go." },  // death only, ≤ 160 chars, plain text
  "playedRealSeconds": 734,
  "client": { "name": "stars-action", "version": "0.1.0" }
}
```

### What the server does with it

The worker turns a valid report into exactly what `finishJob` does today. The planned refactor is to split `finishJob` into "the text resolver builds a report" and "`applyOutcome(world, cell, run, report)` applies it". `applyOutcome` then becomes the only way any job ends, played as text or elsewhere:

- **ending.** It picks the act:
  - Success or partial runs `commitAct` with the plan's `takeMultiplier` and target world. That moves the credits, frees the prisoners, puts the broadcast on air, and so on.
  - A hijack moves the smallest ship (`takeShip`).
  - An ambush kills the officer (`killHunter`).
  - These are the same calls a text job makes, against the galaxy as it is when the report arrives. A fleet that has moved on turns a hijack into a failure, as it already does in text.
- **objectivesMet.** It must agree with the ending:
  - success requires "primary" and "quiet";
  - partial requires "primary" and not "quiet";
  - failure requires no "primary".

  A report that disagrees is refused.
- **noise.** Costs cover exactly as in text (`COVER_PER_NOISE`), plus the failure and partial cover losses.
- **crew.** Each fate goes through `applyFate`, so it lands exactly as in text:
  - a wound is the 3-day wound;
  - a capture puts the companion in the conqueror's prisons, where interrogation can break them;
  - a death is permanent, goes on the memorial, and the press reports it.

  Then `crewAfterJob` runs as in text: loyalty, threads settled by the right job, a traitor perhaps found out, and a prison break bringing our own home.
- **traces.** They become clues on the conqueror's file through `leaveTraces`, the same text, kin and weights as in text.
- **epitaphs.** Stored as written, after trimming and stripping markup. The memorial is the only place the client's words reach the galaxy, and only the leader and the press (which never prints them) ever see them.

## Keeping a foreign client honest

The action game runs on the player's machine, and anything it sends can be forged. The design does not try to make forging impossible. It makes forging pointless beyond a bound, and it makes it visible.

1. **A token per contract.** `token = HMAC-SHA256(server secret, contractId | seatId | jobId | seed | expiresAt)`.
   - The secret is a dedicated server-only environment variable, for example `JOB_CONTRACT_SECRET`. It should not reuse `BETTER_AUTH_SECRET`: a leak of one should not compromise the other. `lib/server/server-env.ts` checks it, as it checks the auth secret.
   - The token is single-use: the run records `reportedAt`, and a second report is refused even with a valid token.
   - The report must also come from the authenticated account that holds a party seat, so a token copied off someone's screen is useless.
2. **Amounts are never reported.** Credits, ships and freed prisoners are computed by the server at apply time. The worst a forged report can do is claim the best ending the job has. That is exactly what an honest player with a good crew, two watches and the right gear can reach in text anyway.
3. **Everything is inside the limits, or nothing is.** A report breaking any rule is refused whole:
   - an ending not in `limits.endings`;
   - noise above `maxNoise`;
   - more fates than crew;
   - a companion id not on the contract;
   - a trace kind that does not exist;
   - objectives that disagree with the ending;
   - a report earlier than `minPlaySeconds`;
   - a report after expiry.

   It is not clamped: clamping rewards probing for the edges. A refused report leaves the contract open until it expires, so a bug in an honest client costs a retry, not a job.
4. **The text economy sets the pace, not the client.** The pacing that makes an extra success cheap for a cheater to claim is still there:
   - jobs need planning on the sim clock (watches take a sim day each);
   - the cooldown starts at claim;
   - only one job runs at a time;
   - the officer's heat rises with every act.

   A perfect client still gets about one job a real day (Item 14, decision 9).
5. **Audit trail.** Every report is kept with its contract (client name and version, played time, ending). A telemetry check can flag any client whose success rate on hard jobs is far above the text players'. Nothing acts on that automatically.
6. **Later, not now: replay checks.** The action game could send an input log for the seeded level, and a headless re-simulation could verify it. That is a project of its own; the contract's `seed` and `contractVersion` leave room for it without changing the format.

## Time

The sim runs at 15 times real time. A contract's expiry is in **wall-clock** seconds, because a player who sits down to play a ten-minute level should not find it expired after forty real seconds of sim time.

Suggested defaults:
- `expiresAtRealSeconds` is the claim time plus 24 real hours, matching the one-job-a-day pacing;
- `minPlaySeconds` is 120.

The sim-time cooldown starts at claim. A text job sets it when the job ends, which in text is minutes later; for a contract that could be a day later, so it starts at claim to keep the one-job-a-day pace.

## Joint jobs (14f)

One contract, owned by the lead cell. Its crew lists people from every party cell (`ownerSeat: "ally"` for theirs). Any party leader may fetch it and post the report; the token is the same.

Fates apply to each companion on their own cell's record, exactly as in a text joint job:
- a death goes on their own leader's memorial;
- a capture is held by the lead cell's conqueror.

Every party cell gets the cooldown.

## Sanctuary (14f)

Nothing in the contract changes. Staging from sanctuary already made the watches and the cooldown longer before the claim. A quiet sanctuary leaks evidence per job when the report is applied, exactly as in text (`jobTravelEvidence`).

## What the code needs, when the action game comes

None of this is built. In order:

1. **Split `finishJob`.** Build the report in the text resolver and apply it in `applyOutcome`. This is pure refactoring, provable by `scripts/fallen-probe.ts` staying green; after it, the text resolver is literally the reference player.
2. **Contract status.** Add `contracted` and `abandoned` to `JobRun['status']`, plus `contractId`, `expiresAtRealSeconds` and `reportedAt`.
3. **Orders.** `REB_JOB_CONTRACT` (claim) and `REB_JOB_REPORT` (the report as the payload), both handled in `scripts/game-loop.ts` like every other `REB_JOB_*` order, and an expiry sweep in `refreshSeatViews`.
4. **Routes and secret.**
   - `/api/rebel/contract` serves the contract, and only to the seat holder or a party member.
   - The secret is checked in `lib/server/server-env.ts`.
   - Contract and token stay off every wire except that route: scrub them with the rest of `job` in `lib/persistence/shard-privacy.ts`.
5. **A "Play it in the action game" button** next to "Go" on the plan, shown only when an action client is configured.
6. **Probe.**
   - A report with a forged token, a reused token, an unknown companion, an ending that disagrees with its objectives, or a late report changes nothing.
   - A valid report changes the world exactly as the same text ending does.
   - An expired contract hurts nobody.

## Open questions for the user

- **Whose words?** Should the action game be allowed to write epitaphs? The draft allows them, short and plain, because a death the player played through deserves their own line on the memorial.
- **Who plays a joint job?** Can two friends play the same contract in one co-op session? The format allows it (one report, either may post it); the action game decides whether it supports co-op.
- **What is the fastest legitimate level?** The `minPlaySeconds` floor of two minutes is a guess until levels exist.
