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
so the old one must go first (its database is still empty, nothing is lost):

```bash
cd ~/servers/stardom
docker compose down
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

All three services should be `Up` (postgres `healthy`). Then from any device
on the LAN, open `http://<server-ip>:3000`, register, and check that the tick
counter advances (proves the worker is alive).

## 2. Day-to-day operations

All commands from `~/servers/stardom/Stars_of_dominion`.

| Task | Command |
|---|---|
| Status | `docker compose -f compose.prod.yaml ps` |
| App logs | `docker compose -f compose.prod.yaml logs -f app` |
| Worker logs | `docker compose -f compose.prod.yaml logs -f worker` |
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

The entire universe lives in one Postgres database — one `pg_dump` cron line
covers it:

```bash
mkdir -p ~/backups
crontab -e
```

Add:

```
0 4 * * * docker exec stardom-postgres pg_dump -U stars stars_dominion | gzip > ~/backups/stardom-$(date +\%F).sql.gz
```

Nightly 04:00 dump, one file per day. Restore with:

```bash
gunzip -c ~/backups/stardom-2026-08-01.sql.gz | docker exec -i stardom-postgres psql -U stars -d stars_dominion
```

Prune old dumps occasionally, or add a second cron line:
`0 5 * * * find ~/backups -name 'stardom-*.sql.gz' -mtime +14 -delete`

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
- **Laptop lid** — closing it suspends the machine by default. Disable:
  in `/etc/systemd/logind.conf` set `HandleLidSwitch=ignore`, then
  `sudo systemctl restart systemd-logind`. Also disable sleep in the Ubuntu
  power settings.

## 5. Later roadmap (in sensible order)

1. **Static IP / DHCP reservation** for the server in the Ziggo router — so the
   IP in `BETTER_AUTH_URL` never changes.
2. **Nginx + HTTPS** — only worth it once the game is exposed beyond the LAN
   (port forwarding or a Cloudflare Tunnel). At that point `BETTER_AUTH_URL`
   becomes the public https URL.
3. **Monitoring (Grafana/Prometheus)** — nice to have, after backups.
4. **Redis** — not until the code actually uses it. Nothing in the app speaks
   Redis today; adding the container now would do nothing.
