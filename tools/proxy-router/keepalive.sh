#!/usr/bin/env bash
# Keeps the proxy router's sing-box listener alive on 127.0.0.1:2080.
#
# Runs indefinitely as a launchd agent: every CHECK_INTERVAL seconds it calls
# `router.py ensure`, which starts the engine when the listener is missing.
# This resurrects a silently-died proxy without waiting for the next login or
# for a Hermes process to be restarted.
#
# Backoff: while `ensure` keeps failing (broken config, missing sing-box, ...)
# the wait grows exponentially (INTERVAL, 2x, 4x, ...) up to MAX_BACKOFF
# seconds, so a dead engine is not hammered every INTERVAL; a single
# successful ensure resets the wait back to INTERVAL.
#
# Dead-tunnel self-heal: `ensure` only proves the PROCESS is alive - a
# WireGuard tunnel whose route/handshake is dead still "passes ensure" while
# every request times out upstream. On a slower cadence the loop therefore
# also runs `router.py egress check` (a read-only probe of the ACTIVE exit
# through the running tunnel) and auto-rotates the provider pool when the
# exit is genuinely dead: after PROXY_KEEPALIVE_DEAD_STRIKES consecutive dead
# checks (a single transient blip never rotates), and never more than
# PROXY_KEEPALIVE_MAX_ROTATIONS times per PROXY_KEEPALIVE_STORM_WINDOW
# seconds, so a broken pool cannot storm. A boot self-test runs once on the
# first successful ensure (one early rotation, same storm guard).
#
# Scheduled rotation: when router.json has a "rotation" block, the loop also
# calls `router.py rotate --if-due` on every healthy tick - the CLI reads the
# configured interval/jitter and only rotates once the interval has elapsed
# (exit 3 = not due, nothing logged), so the active exit churns on a cadence
# and upstream rate limits see a fresh egress IP. The verify-then-switch
# rollback path and per-provider cooldowns apply exactly as for a manual
# rotate; `state/<provider>.rotation` tracks the last switch time.
#
# Knobs (env vars, defaults):
#   PROXY_KEEPALIVE_INTERVAL       base wait between ensures           (15)
#   PROXY_KEEPALIVE_MAX_BACKOFF    cap for exponential backoff         (300)
#   PROXY_KEEPALIVE_PROBE_EVERY    egress check per N successful ensures (4)
#   PROXY_KEEPALIVE_DEAD_STRIKES   consecutive dead checks before rotate (2)
#   PROXY_KEEPALIVE_STORM_WINDOW   rotation-guard window in seconds    (600)
#   PROXY_KEEPALIVE_MAX_ROTATIONS  max keepalive rotations per window  (2)
set -uo pipefail

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# The scripts ship under examples/ next to router.py; locate the prefix either
# from the examples dir (parent) or from a standalone copy of the script.
if [ ! -f "$ROOT/router.py" ] && [ -f "$(dirname "$ROOT")/router.py" ]; then
  ROOT="$(dirname "$ROOT")"
fi
INTERVAL="${PROXY_KEEPALIVE_INTERVAL:-15}"
MAX_BACKOFF="${PROXY_KEEPALIVE_MAX_BACKOFF:-300}"
PROBE_EVERY="${PROXY_KEEPALIVE_PROBE_EVERY:-4}"
DEAD_STRIKES="${PROXY_KEEPALIVE_DEAD_STRIKES:-2}"
STORM_WINDOW="${PROXY_KEEPALIVE_STORM_WINDOW:-600}"
MAX_ROTATIONS="${PROXY_KEEPALIVE_MAX_ROTATIONS:-2}"

backoff="$INTERVAL"
boot=1
checks=0
strikes=0
rotations=0
window_start=0

# Allow at most MAX_ROTATIONS keepalive rotations per STORM_WINDOW seconds.
rotation_allowed() {
  now=$(date +%s)
  if [ "$window_start" -eq 0 ] || [ $((now - window_start)) -ge "$STORM_WINDOW" ]; then
    window_start="$now"
    rotations=0
  fi
  [ "$rotations" -lt "$MAX_ROTATIONS" ]
}

# One bounded auto-rotation for the provider `egress check` reported dead.
# `egress check` prints "dead: <provider>" as its last stdout line (and exits
# 1) when an active exit is dead; without that line nothing is rotated.
rotate_dead() {
  provider="$1"
  if [ -z "$provider" ]; then
    # egress check failed before it could name a dead provider (e.g. TUN
    # mode, or the engine itself is down): never rotate on an ambiguous
    # signal - ensure already handles the engine-down case.
    echo "router: egress check dead but no provider identified; skipping rotation" >&2
    strikes=0
    return
  fi
  if ! rotation_allowed; then
    echo "router: rotation skipped (storm guard: $rotations rotations in the last ${STORM_WINDOW}s)" >&2
    strikes=0
    return
  fi
  echo "router: rotating '$provider' after dead tunnel checks" >&2
  if "$ROOT/router.py" rotate "$provider" --reason timeout; then
    :
  else
    echo "router: rotate '$provider' failed; will retry after the next dead check" >&2
  fi
  rotations=$((rotations + 1))
  strikes=0
}

while true; do
  # Manual disconnect (tray Disconnect / `router.py stop`) writes
  # state/manual-off; while it exists the user wants the engine DOWN, so
  # skip ensure entirely instead of resurrecting it 15s later. `router.py
  # start` (tray Connect) removes the marker.
  if [ -f "$ROOT/state/manual-off" ]; then
    sleep "$INTERVAL"
    continue
  fi
  if "$ROOT/router.py" ensure >/dev/null 2>&1; then
    backoff="$INTERVAL"
    if [ "$boot" -eq 1 ]; then
      boot=0
      # Boot self-test: one live egress check on the first successful ensure.
      # A dead tunnel gets ONE early rotation (storm guard applies); a
      # healthy one is logged and the normal loop continues.
      if out=$("$ROOT/router.py" egress check 2>&1); then
        echo "router: boot self-test ok"
      else
        echo "router: boot self-test: active tunnel is dead - rotating once ($(printf '%s\n' "$out" | tail -n 1))" >&2
        rotate_dead "$(printf '%s\n' "$out" | sed -n 's/^dead: //p')"
      fi
    else
      checks=$((checks + 1))
      if [ "$checks" -ge "$PROBE_EVERY" ]; then
        checks=0
        if out=$("$ROOT/router.py" egress check 2>&1); then
          strikes=0
        else
          strikes=$((strikes + 1))
          echo "router: egress check: dead exit ($strikes/$DEAD_STRIKES strikes): $(printf '%s\n' "$out" | tail -n 1)" >&2
          if [ "$strikes" -ge "$DEAD_STRIKES" ]; then
            rotate_dead "$(printf '%s\n' "$out" | sed -n 's/^dead: //p')"
          fi
        fi
      fi
      # Scheduled rotation: `rotate --if-due` self-gates on the configured
      # interval (exit 0 = rotated, 3 = not due); never logs when quiet.
      if "$ROOT/router.py" rotate --if-due >/dev/null 2>&1; then
        echo "router: scheduled rotation: rotated provider(s)" >&2
      fi
    fi
  else
    backoff=$((backoff * 2))
    ((backoff < INTERVAL)) && backoff="$INTERVAL"
    ((backoff > MAX_BACKOFF)) && backoff="$MAX_BACKOFF"
  fi
  sleep "$backoff"
done
