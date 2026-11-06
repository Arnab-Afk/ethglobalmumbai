#!/usr/bin/env bash
# Run the CRE workflow simulation on a timer, like the deployed workflow's cron would.
#
# The workflow is not deployed to the Chainlink DON, so it only runs when someone calls
# `cre workflow simulate`. This loop does that every INTERVAL seconds (default 300), so each run reads
# the live Chainlink feed and venue prices again.
#
#   npm run cre:watch                         # dry run every 300 s (no transactions)
#   INTERVAL=30 npm run cre:watch             # every 30 s
#   BROADCAST=1 npm run cre:watch             # also write each curve to QuoteOracle on Sepolia
#   MAX_RUNS=3 INTERVAL=5 npm run cre:watch   # stop after 3 runs (for testing)
#
# Stop with Ctrl-C. Full output of every run goes to logs/live/<start time>.log (gitignored);
# the terminal shows the workflow's own log lines.
set -uo pipefail

cd "$(dirname "$0")/.."

INTERVAL="${INTERVAL:-300}"
BROADCAST="${BROADCAST:-0}"
TARGET="${TARGET:-sepolia-settings}"
MAX_RUNS="${MAX_RUNS:-0}" # 0 = run until stopped

if ! command -v cre >/dev/null 2>&1; then
  echo "cre CLI not found. Install it: https://docs.chain.link/cre" >&2
  exit 1
fi
if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || [ "$INTERVAL" -lt 1 ]; then
  echo "INTERVAL must be a whole number of seconds (got '$INTERVAL')" >&2
  exit 1
fi

flags=(-T "$TARGET" --non-interactive --trigger-index 0)
mode="dry run (no transactions)"
if [ "$BROADCAST" = "1" ]; then
  # The key may come from ./.env or the shell. Check the format without printing it.
  key="${CRE_ETH_PRIVATE_KEY:-}"
  if [ -z "$key" ] && [ -f .env ]; then
    key="$(grep -E '^CRE_ETH_PRIVATE_KEY=' .env | tail -1 | cut -d= -f2-)"
  fi
  if ! [[ "$key" =~ ^[0-9a-fA-F]{64}$ ]]; then
    echo "BROADCAST=1 needs CRE_ETH_PRIVATE_KEY (64 hex chars, no 0x) in ./.env or the environment." >&2
    exit 1
  fi
  unset key
  flags+=(--broadcast)
  mode="BROADCAST: each run sends a Sepolia transaction to QuoteOracle"
fi

mkdir -p logs/live
logfile="logs/live/$(date -u +%Y%m%dT%H%M%SZ).log"

echo "cre-watch: target=$TARGET every ${INTERVAL}s, $mode"
echo "cre-watch: full output → $logfile   (Ctrl-C to stop)"
trap 'echo; echo "cre-watch: stopped after $run run(s). Log: $logfile"; exit 0' INT TERM

run=0
while :; do
  run=$((run + 1))
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "── run $run · $started ──"
  echo "=== run $run · $started · $mode ===" >>"$logfile"

  output="$(cre workflow simulate ./workflow "${flags[@]}" 2>&1)"
  status=$?
  printf '%s\n' "$output" >>"$logfile"

  # Show the workflow's own log lines, without the timestamp/prefix noise.
  printf '%s\n' "$output" | grep -E '\[USER LOG\]' | sed -E 's/^.*\[USER LOG\] (cre-workflow: )?//'
  if [ "$status" -ne 0 ] || printf '%s' "$output" | grep -q '✗'; then
    echo "!! run $run failed (exit $status):"
    printf '%s\n' "$output" | grep -E '✗|rror' | tail -5
  fi

  if [ "$MAX_RUNS" -gt 0 ] && [ "$run" -ge "$MAX_RUNS" ]; then
    echo
    echo "cre-watch: done ($run run(s)). Log: $logfile"
    exit 0
  fi
  sleep "$INTERVAL"
done
