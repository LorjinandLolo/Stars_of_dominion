#!/usr/bin/env bash
#
# scripts/backup-db.sh — nightly dump of the Stars of Dominion database.
#
# Run from cron on the server. Everything persistent lives in Postgres — the
# galaxy, its accounts, and now its written history — so this one file is the
# difference between a bad night and starting over.
#
#   crontab -e
#   0 4 * * * /home/logo/servers/stardom/Stars_of_dominion/scripts/backup-db.sh
#
# Deliberately paranoid about the failure mode that makes backups worthless:
# a dump that "succeeds" while producing nothing. The dump goes to a temporary
# file, is checked for gzip integrity and a plausible size, and only then
# replaces today's backup. A failed run leaves yesterday's good copy alone and
# says so in the log.
#
# Overridable from the environment:
#   BACKUP_DIR      where dumps go            (default: $HOME/backups)
#   KEEP_DAYS       prune older than this     (default: 14)
#   PG_CONTAINER    container to dump from    (default: stardom-postgres)
#   MIN_BYTES       reject dumps smaller than (default: 20000)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
PG_CONTAINER="${PG_CONTAINER:-stardom-postgres}"
MIN_BYTES="${MIN_BYTES:-20000}"

# cron runs with a minimal PATH; docker usually lives outside it.
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

LOG="$BACKUP_DIR/backup.log"
mkdir -p "$BACKUP_DIR"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
die() { log "FAILED: $*"; exit 1; }

# Credentials come from the compose .env, so the backup can never drift out of
# step with the database it is backing up.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC2046
    POSTGRES_USER="${POSTGRES_USER:-$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r')}"
    POSTGRES_DB="${POSTGRES_DB:-$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r')}"
fi
POSTGRES_USER="${POSTGRES_USER:-stars}"
POSTGRES_DB="${POSTGRES_DB:-stars_dominion}"

command -v docker >/dev/null 2>&1 || die "docker not on PATH"

docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null | grep -q true \
    || die "container $PG_CONTAINER is not running — nothing dumped, yesterday's backup kept"

STAMP="$(date +%F)"
TARGET="$BACKUP_DIR/stardom-$STAMP.sql.gz"
TMP="$BACKUP_DIR/.stardom-$STAMP.partial.gz"

# No -t: cron has no TTY, and a TTY would corrupt the stream with \r anyway.
if ! docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" 2>>"$LOG" | gzip > "$TMP"; then
    rm -f "$TMP"
    die "pg_dump returned an error"
fi

gzip -t "$TMP" 2>/dev/null || { rm -f "$TMP"; die "dump is not valid gzip"; }

SIZE="$(stat -c%s "$TMP" 2>/dev/null || echo 0)"
[ "$SIZE" -ge "$MIN_BYTES" ] || { rm -f "$TMP"; die "dump is only ${SIZE} bytes — refusing to overwrite a good backup"; }

# Sanity-check the contents: a dump of the wrong database would pass the size
# test but restore into an empty galaxy.
#
# grep -c rather than grep -q on purpose. With `set -o pipefail`, `grep -q`
# exits on the first match, gzip takes SIGPIPE, and the pipeline reports
# failure even though the check passed — a false alarm that would throw away a
# perfectly good backup every night.
FOUND="$(gzip -dc "$TMP" 2>/dev/null | grep -c 'multiplayer_sessions' || true)"
if [ "${FOUND:-0}" -eq 0 ]; then
    rm -f "$TMP"
    die "dump has no multiplayer_sessions table — wrong database?"
fi

mv -f "$TMP" "$TARGET"
log "OK $TARGET ($(numfmt --to=iec "$SIZE" 2>/dev/null || echo "${SIZE}B"))"

DELETED="$(find "$BACKUP_DIR" -name 'stardom-*.sql.gz' -mtime "+$KEEP_DAYS" -print -delete | wc -l)"
[ "$DELETED" -gt 0 ] && log "pruned $DELETED backup(s) older than $KEEP_DAYS days"

exit 0
