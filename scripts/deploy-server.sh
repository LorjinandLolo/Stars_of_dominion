#!/usr/bin/env bash
# scripts/deploy-server.sh — deploy the current main to the home server.
#
# Run ON THE SERVER, from the repo clone:
#   bash scripts/deploy-server.sh            # pull, rebuild, migrate, verify
#   bash scripts/deploy-server.sh --backup   # same, with a pg_dump first
#
# What it does, in order:
#   1. optional backup (scripts/backup-db.sh)
#   2. git pull --ff-only (refuses to deploy a diverged tree)
#   3. docker compose -f compose.prod.yaml up -d --build
#   4. prisma migrate deploy (applies committed migrations, never authors new ones)
#   5. waits for the app to answer, then prints the running version fingerprint
#
# Players see a short interruption while the app container swaps. The worker
# hands its lease over cleanly (init + 30s grace in compose.prod.yaml).

set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f compose.prod.yaml"

if [[ "${1:-}" == "--backup" ]]; then
    echo "==> backup"
    bash scripts/backup-db.sh
fi

echo "==> git pull"
git fetch origin
git pull --ff-only origin main
SHA="$(git rev-parse --short HEAD)"
echo "    at $SHA"

echo "==> build + restart"
$COMPOSE up -d --build

echo "==> migrations"
$COMPOSE run --rm app npx prisma migrate deploy

echo "==> waiting for the app"
for i in $(seq 1 60); do
    if curl -fsS -o /dev/null --max-time 3 http://localhost:3000/api/tick; then
        break
    fi
    sleep 2
    if [[ "$i" == "60" ]]; then
        echo "app did not answer on :3000 after 120s" >&2
        $COMPOSE ps
        exit 1
    fi
done

echo "==> status"
$COMPOSE ps --format 'table {{.Name}}\t{{.Status}}'
# /api/music exists only from 2026-09-06 on — a cheap "is the new code live" probe.
MUSIC="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/api/music || true)"
echo "    deployed $SHA · /api/music -> $MUSIC (200 = current code)"
