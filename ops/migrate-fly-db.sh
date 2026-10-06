#!/usr/bin/env bash
# CI twin of ops/migrate-fly-db.ps1: applies the pending migrations of this checkout to the
# production database (Fly Postgres `sala`). Used by .github/workflows/deploy.yml before the API
# deploy. Needs `flyctl` on PATH and FLY_API_TOKEN scoped to the DB app (sala-de-estudio-db).
#   ops/migrate-fly-db.sh          migrate (default)
#   ops/migrate-fly-db.sh lock     only make sala_owner NOLOGIN again (idempotent safety net)
# sala_owner has no login. `migrate` gives it a random one-time password over `fly ssh`, opens
# `fly proxy` to the DB, runs `pnpm db:migrate` with that URL (and without the Fly token), then
# stops the proxy and makes sala_owner NOLOGIN again (also if the migration failed). Nothing secret
# is printed.
set -euo pipefail

DB_APP="sala-de-estudio-db"
PROXY_PORT=15433
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# setup-flyctl installs `flyctl`; a local install may only have `fly`.
FLY="$(command -v flyctl || command -v fly)" || { echo "flyctl not found."; exit 1; }

db_sql() { # $1 = SQL, $2 = marker echoed on success
  local script b64 out
  script=$(printf 'set -euo pipefail\nexport PGPASSWORD="$OPERATOR_PASSWORD"\npsql -h localhost -p 5433 -U postgres -d sala -v ON_ERROR_STOP=1 -q <<'"'"'SQL'"'"'\n%s\nSQL\necho %s\n' "$1" "$2")
  b64=$(printf '%s' "$script" | base64 -w0)
  # The payload can carry the one-time password; keep it out of the Actions log too.
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::add-mask::$b64"; fi
  out=$("$FLY" ssh console -a "$DB_APP" -q -C "sh -c 'echo $b64 | base64 -d | bash'" 2>&1 || true)
  [[ "$out" == *"$2"* ]] && return 0
  # Last lines only: enough to diagnose (auth, psql error), never the script itself.
  printf '%s\n' "$out" | tail -n 3 | sed 's/^/  ssh: /' >&2
  return 1
}

lock() {
  echo "Disabling sala_owner login..."
  if db_sql "ALTER ROLE sala_owner NOLOGIN PASSWORD NULL;" DISABLE_OK; then return 0; fi
  echo "WARNING: could not disable sala_owner. Run: ALTER ROLE sala_owner NOLOGIN PASSWORD NULL; as postgres."
  return 1
}

if [ "${1:-migrate}" = lock ]; then lock; exit $?; fi

PW=$(openssl rand -hex 24)
# Keep the one-time password out of the Actions log even if a tool echoes it.
if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::add-mask::$PW"; fi
PROXY_PID=""
OK=0

cleanup() {
  if [ -n "$PROXY_PID" ]; then kill "$PROXY_PID" 2>/dev/null || true; fi
  lock || OK=0
  if [ "$OK" = 1 ]; then echo "OK: migrations applied."; else echo "failed."; exit 1; fi
}
trap cleanup EXIT
# On cancel/timeout, exit so the EXIT trap re-locks sala_owner before the runner kills the job.
trap 'exit 130' INT TERM

echo "Enabling sala_owner for this run..."
# log_statement off for this session so the one-time password never lands in the Postgres log.
db_sql "SET log_statement = 'none';
ALTER ROLE sala_owner LOGIN PASSWORD '$PW';
GRANT USAGE ON SCHEMA drizzle TO sala_app;
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO sala_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sala_owner IN SCHEMA drizzle GRANT SELECT ON TABLES TO sala_app;" ENABLE_OK \
  || { echo "Could not enable sala_owner."; exit 1; }

echo "Opening proxy to $DB_APP..."
"$FLY" proxy "${PROXY_PORT}:5432" -a "$DB_APP" >/dev/null 2>&1 &
PROXY_PID=$!
for _ in $(seq 1 30); do
  if (exec 3<>"/dev/tcp/127.0.0.1/$PROXY_PORT") 2>/dev/null; then READY=1; break; fi
  kill -0 "$PROXY_PID" 2>/dev/null || { echo "fly proxy exited early."; exit 1; }
  sleep 1
done
[ "${READY:-0}" = 1 ] || { echo "fly proxy did not open port $PROXY_PORT."; exit 1; }

echo "Running migrations..."
cd "$REPO_ROOT"
# The migration process (and every dependency it loads) never sees the Fly token.
env -u FLY_API_TOKEN DATABASE_URL="postgres://sala_owner:${PW}@localhost:${PROXY_PORT}/sala?sslmode=disable" pnpm db:migrate
OK=1
