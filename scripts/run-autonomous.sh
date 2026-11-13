#!/usr/bin/env bash
# Runs Claude Code headless, in a loop, until docs/TASKS.md has no open tasks left.
# Open task = "- [ ]". Done = "- [x]". Blocked (needs Harvey) = "- [~]".
# UNTESTED against a live `claude` install — run `claude --help` once to confirm the flags exist.
#
# Usage:   bash scripts/run-autonomous.sh
# Tune:    MAX_ITERS=60 MAX_TURNS=60 BUDGET_USD=5 SLEEP_SECS=20 bash scripts/run-autonomous.sh
# Best run inside tmux/screen on an always-on machine or a disposable VM/container.
set -uo pipefail
cd "$(dirname "$0")/.."

MAX_ITERS="${MAX_ITERS:-60}"
MAX_TURNS="${MAX_TURNS:-60}"
BUDGET_USD="${BUDGET_USD:-5}"
SLEEP_SECS="${SLEEP_SECS:-20}"
RETRY_SECS="${RETRY_SECS:-900}"   # wait this long if Claude exits non-zero (e.g. usage limit)
STALL_LIMIT="${STALL_LIMIT:-3}"   # stop after this many iterations with no new commit

mkdir -p logs
stalls=0
for i in $(seq 1 "$MAX_ITERS"); do
  remaining=$(grep -c '^- \[ \]' docs/TASKS.md || true)
  if [ "${remaining:-0}" -eq 0 ]; then
    echo "[$(date -Is)] No open tasks. Check docs/HUMAN_TODO.md for anything blocked on you."
    exit 0
  fi
  before=$(git rev-parse HEAD 2>/dev/null || echo none)
  echo "[$(date -Is)] iteration $i/$MAX_ITERS — $remaining open task(s)"
  if ! claude -p "$(cat .claude/prompts/autonomous.md)" \
      --permission-mode acceptEdits \
      --max-turns "$MAX_TURNS" \
      --max-budget-usd "$BUDGET_USD" \
      --output-format text >> "logs/run-$(date +%F).log" 2>&1; then
    echo "[$(date -Is)] claude exited non-zero (usage limit / error). Sleeping ${RETRY_SECS}s."
    sleep "$RETRY_SECS"
    continue
  fi
  after=$(git rev-parse HEAD 2>/dev/null || echo none)
  if [ "$before" = "$after" ]; then
    stalls=$((stalls + 1))
    echo "[$(date -Is)] no new commit (stall $stalls/$STALL_LIMIT)"
    if [ "$stalls" -ge "$STALL_LIMIT" ]; then
      echo "Stalled. Read docs/PROGRESS.md and docs/HUMAN_TODO.md, then restart."
      exit 2
    fi
  else
    stalls=0
  fi
  sleep "$SLEEP_SECS"
done
echo "Reached MAX_ITERS. Re-run to continue."
