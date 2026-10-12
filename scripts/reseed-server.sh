#!/usr/bin/env bash
# scripts/reseed-server.sh — start a fresh galaxy on the home server.
#
# Run ON THE SERVER, from the repo clone, AFTER scripts/deploy-server.sh (the
# reseed runs the code baked into the current image):
#   bash scripts/reseed-server.sh                      # asks before deleting
#   bash scripts/reseed-server.sh --keep-claims        # players keep their empires
#   bash scripts/reseed-server.sh --drop-dev-accounts  # also delete dev1/dev2
#   bash scripts/reseed-server.sh --yes                # no question (scripts)
#
# What it does, in order:
#   1. its own timestamped pg_dump (backup-db.sh names dumps by date, so a
#      second run on the same day would overwrite the pre-reseed copy)
#   2. stops worker, narrator and app, so nothing writes to the old galaxy
#   3. scripts/reseed-galaxy.ts: clears lease, history, messages, invites,
#      saves and (unless --keep-claims) claims, in one transaction
#   4. scripts/push-init-state.ts: clears shards and orders, writes the new world
#   5. starts everything again and waits for the app
#
# Accounts are kept. To undo, restore the dump from step 1:
#   gunzip -c <file> | docker exec -i stardom-postgres psql -U stars stars_dominion
# (into an emptied database; see SERVER.md for the full restore steps).

set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f compose.prod.yaml"

ASSUME_YES=0
CLEANUP_ARGS=(--yes)
for arg in "$@"; do
    case "$arg" in
        --yes) ASSUME_YES=1 ;;
        --keep-claims) CLEANUP_ARGS+=(--keep-claims) ;;
        --drop-dev-accounts) CLEANUP_ARGS+=(--drop-dev-accounts) ;;
        *) echo "unknown option: $arg" >&2; exit 2 ;;
    esac
done

if ! $COMPOSE run --rm --no-deps -T setup test -f scripts/reseed-galaxy.ts 2>/dev/null; then
    echo "The running image has no scripts/reseed-galaxy.ts. Run scripts/deploy-server.sh first." >&2
    exit 1
fi

if [[ "$ASSUME_YES" != "1" ]]; then
    echo "This ERASES the current galaxy: the world, its history and gazette,"
    echo "messages, invite links$( [[ " ${CLEANUP_ARGS[*]} " == *" --keep-claims "* ]] || echo ", and every faction claim")."
    echo "Accounts are kept. A backup is taken first."
    read -r -p "Type reseed to continue: " ANSWER
    if [[ "$ANSWER" != "reseed" ]]; then
        echo "Nothing changed."
        exit 1
    fi
fi

echo "==> backup"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
mkdir -p "$BACKUP_DIR"
DUMP="$BACKUP_DIR/stardom-pre-reseed-$(date +%F-%H%M%S).sql.gz"
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$DUMP"
if ! gzip -t "$DUMP" || [[ "$(stat -c %s "$DUMP")" -lt 20000 ]]; then
    echo "Backup looks wrong ($DUMP). Stopping before anything is deleted." >&2
    exit 1
fi
echo "    $DUMP ($(du -h "$DUMP" | cut -f1))"

echo "==> stopping worker, narrator, app"
$COMPOSE stop worker narrator app

# From here on, a failure leaves the game stopped. Say how to bring it back.
trap 'echo "Reseed failed. The game is stopped. Backup: $DUMP. Start it again with: $COMPOSE up -d" >&2' ERR

echo "==> clearing the old galaxy"
$COMPOSE run --rm --no-deps -T setup npx tsx scripts/reseed-galaxy.ts "${CLEANUP_ARGS[@]}"

echo "==> seeding the new galaxy"
$COMPOSE run --rm --no-deps -T setup npx tsx scripts/push-init-state.ts

trap - ERR

echo "==> starting"
$COMPOSE up -d

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

$COMPOSE ps --format 'table {{.Name}}\t{{.Status}}'
echo "    fresh galaxy is up. Backup of the old one: $DUMP"
