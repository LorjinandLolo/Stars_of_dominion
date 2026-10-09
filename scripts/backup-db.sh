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
#
# Off-disk copies (a dump on the same disk as the database dies with it). Set
# either or both, in the environment or in the compose .env:
#   OFFSITE_DIR        a directory on ANOTHER disk (USB drive, second SSD, NAS
#                      mount). Refused if it sits on the same filesystem as
#                      BACKUP_DIR, because that would only look like a copy.
#   RCLONE_REMOTE      an rclone destination, e.g. "b2:stardom-backups".
#                      Needs `rclone config` run once.
#   OFFSITE_KEEP_DAYS  prune off-disk copies older than this (default: 60)
# With neither set, every run logs a WARN so the gap never goes quiet. The
# Windows-side pull (scripts/pull-backups.ps1) is a third option that needs
# nothing on the server.

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
    # `|| true`: under pipefail a key missing from .env would otherwise kill
    # the script before it can log anything.
    POSTGRES_USER="${POSTGRES_USER:-$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r' || true)}"
    POSTGRES_DB="${POSTGRES_DB:-$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r' || true)}"
    for VAR in OFFSITE_DIR RCLONE_REMOTE OFFSITE_KEEP_DAYS; do
        if [ -z "${!VAR:-}" ]; then
            VAL="$(grep -E "^${VAR}=" "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r' || true)"
            [ -n "$VAL" ] && printf -v "$VAR" '%s' "$VAL"
        fi
    done
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

# ── Off-disk copies ─────────────────────────────────────────────────────────
# Today's local dump is already good here, so an off-disk failure exits 2
# (cron mail, deploy-server.sh stops) without ever touching it.
OFFSITE_KEEP_DAYS="${OFFSITE_KEEP_DAYS:-60}"
OFFSITE_OK=0
OFFSITE_FAIL=0
NAME="$(basename "$TARGET")"

if [ -n "${OFFSITE_DIR:-}" ]; then
    if [ ! -d "$OFFSITE_DIR" ]; then
        log "FAILED off-disk: $OFFSITE_DIR does not exist (drive unplugged or not mounted?)"
        OFFSITE_FAIL=1
    elif [ "$(stat -c %d "$OFFSITE_DIR")" = "$(stat -c %d "$BACKUP_DIR")" ]; then
        log "FAILED off-disk: $OFFSITE_DIR is on the same filesystem as $BACKUP_DIR — not a second copy"
        OFFSITE_FAIL=1
    elif cp -f "$TARGET" "$OFFSITE_DIR/.$NAME.partial" \
        && gzip -t "$OFFSITE_DIR/.$NAME.partial" 2>/dev/null \
        && [ "$(stat -c%s "$OFFSITE_DIR/.$NAME.partial")" = "$SIZE" ]; then
        mv -f "$OFFSITE_DIR/.$NAME.partial" "$OFFSITE_DIR/$NAME"
        log "OK off-disk copy $OFFSITE_DIR/$NAME"
        find "$OFFSITE_DIR" -name 'stardom-*.sql.gz' -mtime "+$OFFSITE_KEEP_DAYS" -delete || true
        OFFSITE_OK=1
    else
        rm -f "$OFFSITE_DIR/.$NAME.partial"
        log "FAILED off-disk: copy to $OFFSITE_DIR did not verify"
        OFFSITE_FAIL=1
    fi
fi

if [ -n "${RCLONE_REMOTE:-}" ]; then
    if ! command -v rclone >/dev/null 2>&1; then
        log "FAILED off-disk: RCLONE_REMOTE is set but rclone is not installed"
        OFFSITE_FAIL=1
    elif rclone copyto "$TARGET" "$RCLONE_REMOTE/$NAME" 2>>"$LOG"; then
        # Believe the remote's own size report, not just rclone's exit code.
        REMOTE_SIZE="$(rclone size --json "$RCLONE_REMOTE/$NAME" 2>/dev/null | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
        if [ "${REMOTE_SIZE:-0}" = "$SIZE" ]; then
            log "OK off-disk upload $RCLONE_REMOTE/$NAME"
            rclone delete --min-age "${OFFSITE_KEEP_DAYS}d" --include 'stardom-*.sql.gz' "$RCLONE_REMOTE" 2>>"$LOG" || true
            OFFSITE_OK=1
        else
            log "FAILED off-disk: remote reports ${REMOTE_SIZE:-no} bytes, local dump is $SIZE"
            OFFSITE_FAIL=1
        fi
    else
        log "FAILED off-disk: rclone upload to $RCLONE_REMOTE returned an error"
        OFFSITE_FAIL=1
    fi
fi

if [ "$OFFSITE_OK" -eq 0 ] && [ "$OFFSITE_FAIL" -eq 0 ]; then
    log "WARN no off-disk copy configured (OFFSITE_DIR / RCLONE_REMOTE) — this dump dies with the disk unless scripts/pull-backups.ps1 fetches it"
fi

[ "$OFFSITE_FAIL" -eq 0 ] || exit 2
exit 0
