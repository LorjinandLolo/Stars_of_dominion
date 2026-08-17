# Running Stars of Dominion on the home server

Target machine: the Ubuntu 24.04 laptop with Docker + Docker Compose already
installed. Everything runs as containers from `compose.prod.yaml`; the only
things that live on the server itself are a git clone of this repo and a `.env`
file with secrets.

Architecture:

```
Players (LAN browsers)
        │  http://<server-ip>:3000
        ▼
   stardom-app      (Next.js — UI + API routes, port 3000)
   stardom-worker   (game loop — ticks the universe; game is frozen without it)
        │
        ▼
   stardom-postgres (PostgreSQL 17, source of truth, Docker volume `pgdata`)
```

## 1. One-time setup

### 1.1 Stop the hand-made Postgres from the earlier tutorial

The prod compose file manages its own Postgres with the same container name,
so the old one must go first. `-v` also deletes its data volume — important,
because Postgres only reads user/password from the environment when it
initializes an empty volume; a leftover volume would ignore the credentials in
your new `.env`. The old database is still empty, so nothing is lost:

```bash
cd ~/servers/stardom
docker compose down -v
```

### 1.2 Clone the repo

```bash
cd ~/servers/stardom
git clone https://github.com/LorjinandLolo/Stars_of_dominion.git
cd Stars_of_dominion
```

(If the repo is private, create a GitHub fine-grained personal access token
with read-only access to this repo and use it as the password when git asks.)

### 1.3 Create the .env file

```bash
cp .env.server.example .env
nano .env
```

Fill in:

- `POSTGRES_PASSWORD` — generate with `openssl rand -hex 16`
- `BETTER_AUTH_SECRET` — generate with `openssl rand -hex 32`
- `BETTER_AUTH_URL` — `http://<server-ip>:3000` (the address players type in
  their browser; find the server IP with `ip -4 addr show`)
- `LLM_PROVIDER` — leave as `template` unless you want live Gemini AI factions,
  in which case set `gemini` and paste your `GOOGLE_API_KEY`
- `NARRATOR_LLM` — who writes the gazette. Leave `template` for now; see §6.

Do not reuse the dev secrets from your Windows machine's `.env.local` — those
have been sitting in plain text on a dev box; generate fresh ones.

### 1.4 Build and start

```bash
docker compose -f compose.prod.yaml up -d --build
```

First build downloads the base image, installs npm dependencies, and runs
`next build` — expect 5–15 minutes on the laptop. Watch progress with
`docker compose -f compose.prod.yaml logs -f` if you're curious.

### 1.5 Create the database schema

```bash
docker compose -f compose.prod.yaml run --rm app npx prisma migrate deploy
```

`migrate deploy` applies the committed migrations exactly as-is (unlike
`migrate dev`, which is for authoring new migrations on the dev machine).

### 1.6 Seed the universe

```bash
docker compose -f compose.prod.yaml run --rm app npx tsx scripts/push-init-state.ts
docker compose -f compose.prod.yaml run --rm app npx tsx scripts/setup-dev-duel.ts
```

The first pushes the world snapshot (systems, planets, factions). The second
creates the dev accounts and faction claims — skip it if you'd rather register
real accounts through the UI.

### 1.7 Verify

```bash
docker compose -f compose.prod.yaml ps
```

All four services should be `Up` (postgres `healthy`):

| Container | What it does | Game dies without it? |
|---|---|---|
| `stardom-postgres` | every persistent thing | yes |
| `stardom-app` | the UI and its API routes | yes |
| `stardom-worker` | the game loop — advances the universe | yes, silently: the UI works, nothing ever changes |
| `stardom-narrator` | writes the gazette from the chronicle | no, the galaxy just has no newspaper |

Then from any device on the LAN, open `http://<server-ip>:3000`, register, and
check that the tick counter advances (proves the worker is alive). The gazette
lives under COMMS → PRESS, and the archive of everything ever written under
COMMS → ARCHIVE. Both are empty until something historic happens — a war, a
capture, a coup — which is correct, not a fault.

## 2. Day-to-day operations

All commands from `~/servers/stardom/Stars_of_dominion`.

| Task | Command |
|---|---|
| Status | `docker compose -f compose.prod.yaml ps` |
| App logs | `docker compose -f compose.prod.yaml logs -f app` |
| Worker logs | `docker compose -f compose.prod.yaml logs -f worker` |
| Narrator logs | `docker compose -f compose.prod.yaml logs -f narrator` |
| Restart everything | `docker compose -f compose.prod.yaml restart` |
| Stop (data survives) | `docker compose -f compose.prod.yaml down` |
| psql shell | `docker exec -it stardom-postgres psql -U stars -d stars_dominion` |

### Deploying a new version

```bash
git pull
docker compose -f compose.prod.yaml up -d --build
docker compose -f compose.prod.yaml run --rm app npx prisma migrate deploy
```

Rebuild is incremental (npm install layer is cached unless package.json
changed). Players see a brief interruption while the app container swaps.

## 3. Backups

The entire universe lives in one Postgres database — accounts, the world, and
now its written history, which cannot be regenerated. `scripts/backup-db.sh`
dumps it.

The script is deliberately suspicious of its own output, because the failure
that makes backups worthless is the one that looks like success: it writes to a
temporary file, checks gzip integrity, checks the size, checks the dump
actually contains the game's tables, and only then replaces today's file. A bad
run leaves yesterday's good copy untouched and records why in
`~/backups/backup.log`.

Test it once by hand first:

```bash
./scripts/backup-db.sh && ls -lh ~/backups
```

Then schedule it:

```bash
crontab -e
```

Add (one line, absolute path — cron has no notion of your shell or `~`):

```
0 4 * * * /home/logo/servers/stardom/Stars_of_dominion/scripts/backup-db.sh
```

Nightly at 04:00, one file per day, pruning anything older than 14 days.
Adjust with `KEEP_DAYS=30` in front of the path if you want longer.

Check it ran:

```bash
tail -5 ~/backups/backup.log
```

### Restoring

```bash
gzip -dc ~/backups/stardom-2026-08-14.sql.gz | docker exec -i stardom-postgres psql -U stars -d stars_dominion
```

Restore into a scratch database first if you only want to inspect a backup
rather than replace the live galaxy:

```bash
docker exec -i stardom-postgres psql -U stars -d postgres -c 'create database restore_test;'
gzip -dc ~/backups/stardom-2026-08-14.sql.gz | docker exec -i stardom-postgres psql -U stars -d restore_test
docker exec -i stardom-postgres psql -U stars -d restore_test -c 'select id, length(snapshot) from multiplayer_sessions;'
```

A healthy restore shows `default-session` with a snapshot of several megabytes.
Drop the scratch database afterwards with
`docker exec -i stardom-postgres psql -U stars -d postgres -c 'drop database restore_test;'`.

**A backup you have never restored is a rumour.** The round trip above was run
against a real dump of this game before this was written; do it yourself once
on the server, so the first time you restore is not the night you need it.

### Off the laptop

Everything above still lives on one disk. When you care enough, copy the
dumps somewhere else — from your Windows PC:

```bash
scp logo@<server-ip>:~/backups/stardom-*.sql.gz .
```

or schedule the same in reverse. A second copy on a machine that can fail
independently is what makes it a backup rather than a convenience.

## 4. Troubleshooting

- **Build dies with a heap/memory error** — the laptop may not have enough RAM
  for `next build`. Fallback: build the image on the Windows PC
  (`docker build -t stardom-app .`), then ship it over SSH:
  `docker save stardom-app | ssh <user>@<server-ip> docker load`, and on the
  server start without building: `docker compose -f compose.prod.yaml up -d --no-build`.
- **Auth errors from other devices** — `BETTER_AUTH_URL` in `.env` must match
  the URL in the players' address bar exactly, scheme and port included.
  Changed it? `docker compose -f compose.prod.yaml up -d` to recreate.
- **Game state frozen** — worker is down. `docker compose -f compose.prod.yaml logs worker`.
- **Gazette stays empty** — first check whether anything has actually happened:
  `docker exec -it stardom-postgres psql -U stars -d stars_dominion -c 'select type, importance, "narratedAt" from chronicle_events order by "createdAt" desc limit 10;'`
  (the double quotes are required — Prisma's columns are camelCase, and
  unquoted identifiers get folded to lower case by Postgres)
  No rows means the simulation has been quiet, not that the narrator is broken —
  only events scoring 15 or higher are ever written up. Rows with a
  `narrated_at` but no article on the front page is normal too: the front page
  is capped per day, and everything else goes to the archive.
- **Laptop lid** — closing it suspends the machine by default. Disable:
  in `/etc/systemd/logind.conf` set `HandleLidSwitch=ignore`, then
  `sudo systemctl restart systemd-logind`. Also disable sleep in the Ubuntu
  power settings.

## 5. The narrator (optional)

The `stardom-narrator` container turns recorded events into gazette articles.
It reads what the simulation writes and writes only its own tables, so it can
be stopped, restarted or left broken without the game noticing —
`docker compose -f compose.prod.yaml stop narrator` costs you a newspaper,
nothing else.

Out of the box it writes from templates: no model, no network, no API key, and
it always works. Two ways to make the prose better, in increasing order of
commitment.

### 5.1 Ollama on the server itself (self-hosted, nothing leaves the house)

The laptop has 14 GiB of RAM and six cores — enough for an 8B model alongside
Postgres, the app and the worker.

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

```bash
ollama pull qwen3:8b
```

Then in `.env`:

```
NARRATOR_LLM=ollama
OLLAMA_MODEL=qwen3:8b
```

```bash
docker compose -f compose.prod.yaml up -d narrator
```

The compose file already maps `host.docker.internal` to the host, so the
container reaches the daemon without any further networking. Expect roughly a
minute for the first article while the model loads, then a few seconds each —
irrelevant, because nothing waits on the narrator.

A caution from testing this on an 8B model: small models invent sourcing
("officials say", "sources confirm") when the record gives them nothing. The
narrator rejects that output and falls back to a template, which is safe but
wasteful — roughly half of one 8B model's output was thrown away. A stronger
instruction-following model wastes less.

### 5.2 Gemini (better prose, leaves the house)

```
NARRATOR_LLM=gemini
GOOGLE_API_KEY=...
```

Volume is small — only events scoring 40 or higher reach the model, capped at
40 calls an hour and 300 a day by default — so cost is pennies. The trade-off
is that event summaries go to Google.

### 5.3 Reading what it produced

```bash
docker compose -f compose.prod.yaml logs -f narrator
```

Each published article logs a line. In the game, COMMS → PRESS is the front
page and COMMS → ARCHIVE is everything ever written, filterable by news,
exposés, obituaries and named eras.

## 6. Later roadmap (in sensible order)

1. **Static IP / DHCP reservation** for the server in the Ziggo router — so the
   IP in `BETTER_AUTH_URL` never changes.
2. **Nginx + HTTPS** — only worth it once the game is exposed beyond the LAN
   (port forwarding or a Cloudflare Tunnel). At that point `BETTER_AUTH_URL`
   becomes the public https URL.
3. **Monitoring (Grafana/Prometheus)** — nice to have, after backups.
4. **Redis** — not until the code actually uses it. Nothing in the app speaks
   Redis today; adding the container now would do nothing.
