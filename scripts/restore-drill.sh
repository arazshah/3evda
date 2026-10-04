#!/usr/bin/env bash
# The restore drill: back the stack up, destroy its data volumes, restore from the backup, and prove that
# the rows, the files, a client gallery link and the admin sign-in are exactly as before.
#
# Only the three data volumes are removed, by name. Never `down --volumes`: the backup repository lives in
# its own `backups` volume and has to survive.
set -euo pipefail

COMPOSE=(docker compose -f docker-compose.yml -f compose.dev.yml)
step() { printf '\n=== %s\n' "$*"; }

step "start the stack"
"${COMPOSE[@]}" up --build --wait --wait-timeout 300 -d

PROJECT="$("${COMPOSE[@]}" config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"
ADMIN_PASSWORD="$(openssl rand -hex 16)"
echo "::add-mask::${ADMIN_PASSWORD}"

step "a job sent while the worker is paused waits, then runs"
"${COMPOSE[@]}" exec -T api python manage.py drill_data pause-check

step "create sample data (enquiry, gallery with photos, admin)"
"${COMPOSE[@]}" exec -T api python manage.py drill_data create --admin-user drill-admin --admin-password "$ADMIN_PASSWORD" > manifest.json
python3 -c 'import json; m=json.load(open("manifest.json")); print(sum(m["tables"].values()), "rows,", len(m["objects"]), "files")'

step "take a backup"
"${COMPOSE[@]}" exec -T backup python manage.py run_backup --once
"${COMPOSE[@]}" exec -T backup restic snapshots --tag nightly

step "the site writes again after the backup (the window closed)"
"${COMPOSE[@]}" exec -T api python - <<'PY'
import redis, os
assert not redis.Redis.from_url(os.environ["REDIS_URL"]).exists("threevda:backup-window"), "window left open"
print("window closed")
PY

step "destroy the data volumes (and only those)"
"${COMPOSE[@]}" stop gateway web api worker postgres redis storage
"${COMPOSE[@]}" rm -f gateway web api worker postgres redis storage
docker volume rm "${PROJECT}_pgdata_v2" "${PROJECT}_objects_v2" "${PROJECT}_redisdata"

step "the backup repository must still be there"
docker volume inspect "${PROJECT}_backups" > /dev/null || { echo "::error::the backups volume is gone — the drill failed"; exit 1; }
"${COMPOSE[@]}" run --rm --no-deps backup test -f /backups/repo/config \
  || { echo "::error::no backup repository after the volumes were destroyed — the drill failed"; exit 1; }

step "bring the empty data services back and restore"
"${COMPOSE[@]}" up -d --wait postgres redis storage
"${COMPOSE[@]}" run --rm --no-deps backup restore latest --yes

step "start the application on the restored data"
"${COMPOSE[@]}" up -d --wait

step "verify everything is as before"
"${COMPOSE[@]}" exec -T api python manage.py drill_data verify < manifest.json | tee drill-result.txt
