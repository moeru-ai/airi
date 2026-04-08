#!/usr/bin/env bash
set -euo pipefail

PORT="${AIRI_WEB_PORT:-4173}"
HOST="${AIRI_WEB_HOST:-127.0.0.1}"
RUNTIME_DIR="${AIRI_WEB_RUNTIME_DIR:-$HOME/.cache/airi/stage-web}"
PID_FILE="$RUNTIME_DIR/pid"
LOG_FILE="$RUNTIME_DIR/server.log"

mkdir -p "$RUNTIME_DIR"

log() {
  printf '[AIRI Web] %s\n' "$*"
}

is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

cleanup_stale_pid() {
  if [[ -f "$PID_FILE" ]] && ! is_running; then
    rm -f "$PID_FILE"
  fi
}

port_in_use() {
  ss -ltn "( sport = :$PORT )" 2>/dev/null | tail -n +2 | grep -q .
}

start() {
  cleanup_stale_pid

  if is_running; then
    log "already running on http://$HOST:$PORT (pid $(cat "$PID_FILE"))"
    return 0
  fi

  if port_in_use; then
    log "port $PORT is already in use"
    return 1
  fi

  log "starting on http://$HOST:$PORT"
  (
    cd /home/faramix/airi
    exec pnpm -F @proj-airi/stage-web exec vite --host "$HOST" --port "$PORT" --strictPort
  ) >>"$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_FILE"

  for _ in {1..30}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      log "failed to start; check $LOG_FILE"
      rm -f "$PID_FILE"
      return 1
    fi

    if port_in_use; then
      log "ready on http://$HOST:$PORT"
      return 0
    fi

    sleep 1
  done

  log "timed out waiting for port $PORT; check $LOG_FILE"
  return 1
}

stop() {
  cleanup_stale_pid

  if ! is_running; then
    log "not running"
    return 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  log "stopping pid $pid"
  kill "$pid" 2>/dev/null || true

  for _ in {1..10}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      log "stopped"
      return 0
    fi
    sleep 1
  done

  log "process did not stop cleanly"
  return 1
}

status() {
  cleanup_stale_pid

  if is_running; then
    log "running on http://$HOST:$PORT (pid $(cat "$PID_FILE"))"
    return 0
  fi

  if port_in_use; then
    log "port $PORT is busy, but not owned by this launcher"
    return 1
  fi

  log "stopped"
}

logs() {
  if [[ -f "$LOG_FILE" ]]; then
    tail -n 200 "$LOG_FILE"
  else
    log "no log file yet"
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  logs) logs ;;
  restart)
    stop || true
    start
    ;;
  *)
    log "usage: $0 {start|stop|status|logs|restart}"
    exit 1
    ;;
esac
