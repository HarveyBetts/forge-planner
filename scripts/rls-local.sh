#!/usr/bin/env bash
# Runs supabase/schema.sql + supabase/tests/rls.sql against a throwaway local PostgreSQL with a Supabase stub.
# Usage: PGHOST=… PGPORT=… PGUSER=postgres bash scripts/rls-local.sh   (needs psql; creates and drops a database "forge_rls")
set -euo pipefail
cd "$(dirname "$0")/.."
psql -v ON_ERROR_STOP=1 -qtA -c 'drop database if exists forge_rls' -c 'create database forge_rls' >/dev/null
psql -v ON_ERROR_STOP=1 -qtA -d forge_rls -f supabase/tests/supabase-stub.sql >/dev/null
psql -v ON_ERROR_STOP=1 -qtA -d forge_rls -f supabase/schema.sql >/dev/null
psql -v ON_ERROR_STOP=1 -qtA -d forge_rls -f supabase/schema.sql >/dev/null   # idempotent: second run must also succeed
OUT="$(psql -v ON_ERROR_STOP=1 -qtA -F ' | ' -d forge_rls -f supabase/tests/rls.sql)"
echo "$OUT"
psql -qtA -c 'drop database forge_rls' >/dev/null 2>&1 || true   # cleanup only; never decides the result
echo "$OUT" | grep -q '| FAIL |' && { echo "RLS CHECK FAILED"; exit 1; }
echo "$OUT" | grep -c '| PASS |' | xargs -I{} echo "RLS: {} checks passed"
