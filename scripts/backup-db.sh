#!/usr/bin/env bash
# Dump the live Supabase database to the external SSD.
#
#   npm run backup:db
#
# What it writes: one pg_dump custom-format file (schema + data of every schema the
# `postgres` role can read: public, auth, storage metadata, ...) named
# kakinotes-db-<project-ref>-<UTC timestamp>.dump, plus a .sha256 next to it. It does NOT copy
# storage objects (image files) — only the storage.objects rows that point at them.
#
# Read-only against the database: pg_dump runs in a single read-only transaction.
#
# Settings (all optional):
#   KAKINOTES_BACKUP_DIR   where dumps go
#                          (default: /Volumes/Fred punya/Mac archive/KakiNotes backups/db)
#   KAKINOTES_DB_URL       connection URL WITHOUT the password
#                          (default: supabase/.temp/pooler-url, written by `supabase link`)
#   KAKINOTES_DB_PASSWORD  database password; if unset, read from the macOS Keychain item
#                          with service name "kakinotes-db" (see docs/architecture.md#database-backups)
#   PG_DUMP                path to pg_dump 17+ (default: Homebrew libpq, then PATH)
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
backup_dir="${KAKINOTES_BACKUP_DIR:-/Volumes/Fred punya/Mac archive/KakiNotes backups/db}"
volume_root="$(printf '%s' "$backup_dir" | cut -d/ -f1-3)"

fail() { echo "backup-db: $*" >&2; exit 1; }

# 1. The SSD must be plugged in. Never fall back to the internal disk silently.
if [[ "$backup_dir" == /Volumes/* && ! -d "$volume_root" ]]; then
  fail "$volume_root is not mounted. Plug in the SSD and run again."
fi
mkdir -p "$backup_dir"

# 2. pg_dump must be at least the server's major version (the project runs Postgres 17).
pg_dump_bin="${PG_DUMP:-}"
if [[ -z "$pg_dump_bin" ]]; then
  for candidate in /opt/homebrew/opt/libpq/bin/pg_dump /opt/homebrew/opt/postgresql@18/bin/pg_dump; do
    [[ -x "$candidate" ]] && { pg_dump_bin="$candidate"; break; }
  done
  [[ -z "$pg_dump_bin" ]] && pg_dump_bin="$(command -v pg_dump || true)"
fi
[[ -n "$pg_dump_bin" ]] || fail "pg_dump not found. Install it with: brew install libpq"
pg_major="$("$pg_dump_bin" --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
(( pg_major >= 17 )) || fail "$pg_dump_bin is version $pg_major; need 17 or newer."

# 3. Connection URL (no password in it) and password (env, then Keychain).
db_url="${KAKINOTES_DB_URL:-}"
if [[ -z "$db_url" ]]; then
  [[ -f "$repo_root/supabase/.temp/pooler-url" ]] \
    || fail "No supabase/.temp/pooler-url. Run 'npx supabase link' or set KAKINOTES_DB_URL."
  db_url="$(tr -d '[:space:]' < "$repo_root/supabase/.temp/pooler-url")"
fi
[[ "$db_url" =~ ://[^/@]*:[^/@]*@ ]] && fail "KAKINOTES_DB_URL must not contain the password."

password="${KAKINOTES_DB_PASSWORD:-}"
if [[ -z "$password" ]]; then
  password="$(security find-generic-password -s kakinotes-db -w 2>/dev/null || true)"
fi
[[ -n "$password" ]] || fail "No database password. Store it once in the Keychain:
  security add-generic-password -s kakinotes-db -a postgres -w
(see docs/architecture.md#database-backups)"

project_ref="$(printf '%s' "$db_url" | sed -nE 's#.*//postgres\.([a-z0-9]+)@.*#\1#p')"
project_ref="${project_ref:-unknown}"
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
out="$backup_dir/kakinotes-db-$project_ref-$stamp.dump"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT

echo "backup-db: dumping $project_ref -> $out"
PGPASSWORD="$password" PGCONNECT_TIMEOUT=20 "$pg_dump_bin" \
  --dbname="$db_url" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --file="$tmp"

# 4. Check the archive is readable and holds the tables we care about before keeping it.
pg_restore_bin="$(dirname "$pg_dump_bin")/pg_restore"
listing="$("$pg_restore_bin" --list "$tmp")" || fail "pg_restore could not read the dump."
for table in "public stories" "public story_revisions" "auth users"; do
  grep -qE "TABLE DATA $table " <<<"$listing" || fail "dump is missing data for $table."
done

mv "$tmp" "$out"
trap - EXIT
( cd "$backup_dir" && shasum -a 256 "$(basename "$out")" > "$(basename "$out").sha256" )

size="$(du -h "$out" | cut -f1)"
count="$(ls "$backup_dir"/kakinotes-db-*.dump 2>/dev/null | wc -l | tr -d ' ')"
echo "backup-db: done — $size, $(grep -c 'TABLE DATA' <<<"$listing") tables with data. $count dump(s) in $backup_dir."
