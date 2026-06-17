#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$REPO_ROOT/.claude/deepsource-loop.log"
INTERVAL_MINUTES="${INTERVAL_MINUTES:-10}"
MAX_RUNS="${MAX_RUNS:-20}"
log() { local msg="[$(date -u +%Y-%m-%dT%H:%M:%Z)] [loop] $*"; echo "$msg" | tee -a "$LOG_FILE"; }
preflight() {
  log "Running pre-flight checks..."
  command -v gh &>/dev/null || { log "ERROR: gh CLI not found"; exit 1; }
  gh auth status &>/dev/null || { log "ERROR: gh CLI not authenticated"; exit 1; }
  [ -d "$REPO_ROOT/.git" ] || { log "ERROR: not a git repo"; exit 1; }
  [ -f "$REPO_ROOT/scripts/deepsource-selfheal.cjs" ] || { log "ERROR: deepsource-selfheal.cjs not found"; exit 1; }
  local branch; branch=$(git -C "$REPO_ROOT" branch --show-current)
  if [ "$branch" != "main" ]; then log "WARNING: on '$branch', switching to main"; git -C "$REPO_ROOT" checkout main; git -C "$REPO_ROOT" pull origin main; fi
  log "Pre-flight OK"
}
run_cycle() {
  local run_num=$1; log "=== Starting run $run_num ==="
  local output exit_code=0
  output=$(node "$SCRIPT_DIR/deepsource-selfheal.cjs" 2>>"$LOG_FILE") || exit_code=$?
  if [ "$exit_code" -ne 0 ]; then log "ERROR: script exited $exit_code"; return 1; fi
  local phase; phase=$(echo "$output" | tail -1 | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');try{console.log(JSON.parse(d).phase)}catch{console.log('?')}" 2>/dev/null || echo "?")
  log "Run $run_num complete — phase: $phase"
  [ "$phase" = "done" ] && return 2
  return 0
}
main() {
  log "========================================="
  log "DeepSource Self-Healing Loop Starting"
  log "  Repo: vi70x4/airiOS | Interval: ${INTERVAL_MINUTES}m | Max: ${MAX_RUNS}"
  log "========================================="
  preflight
  local run_num=0
  while [ "$run_num" -lt "$MAX_RUNS" ]; do
    run_num=$((run_num + 1))
    local result=0; run_cycle "$run_num" || result=$?
    [ "$result" -eq 2 ] && { log "✓ Self-healing complete. Goodbye!"; exit 0; }
    [ "$result" -ne 0 ] && log "Run $run_num had errors, will retry..."
    [ "$run_num" -lt "$MAX_RUNS" ] && { log "Sleeping ${INTERVAL_MINUTES}m..."; sleep $((INTERVAL_MINUTES * 60)); }
  done
  log "✓ Hit max runs ($MAX_RUNS). Stopping."
}
main "$@"
