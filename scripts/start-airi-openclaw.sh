#!/usr/bin/env bash

set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-web}"

SERVER_PORT="${AIRI_SERVER_PORT:-6121}"
WEB_PORT="${AIRI_WEB_PORT:-5173}"
WEB_URL="${AIRI_WEB_URL:-http://localhost:${WEB_PORT}}"
WEB_HEALTH_TIMEOUT="${AIRI_WEB_HEALTH_TIMEOUT:-5}"

LOG_DIR="${AIRI_LOG_DIR:-${ROOT_DIR}/.logs/airi-openclaw}"
SERVER_LOG="${AIRI_SERVER_LOG:-${LOG_DIR}/airi-server-runtime.log}"
BRIDGE_LOG="${OPENCLAW_BRIDGE_LOG:-${LOG_DIR}/openclaw-bridge-runtime.log}"
WEB_LOG="${AIRI_WEB_LOG:-${LOG_DIR}/airi-stage-web.log}"
TAMAGOTCHI_LOG="${AIRI_TAMAGOTCHI_LOG:-${LOG_DIR}/airi-stage-tamagotchi.log}"

BRIDGE_ENV_FILE="${OPENCLAW_BRIDGE_ENV_FILE:-${ROOT_DIR}/services/openclaw-bridge/.env.local}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '找不到必要指令：%s\n' "$1" >&2
    exit 1
  fi
}

is_listening() {
  lsof -iTCP:"$1" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

http_is_healthy() {
  curl --silent --show-error --fail --max-time "$WEB_HEALTH_TIMEOUT" "$1" >/dev/null 2>&1
}

is_bridge_running() {
  pgrep -f 'pnpm -F @proj-airi/openclaw-bridge start' >/dev/null 2>&1 \
    || pgrep -f '@proj-airi/openclaw-bridge exec tsx src/main.ts' >/dev/null 2>&1
}

is_tamagotchi_running() {
  pgrep -f '@proj-airi/stage-tamagotchi' >/dev/null 2>&1 \
    || pgrep -f 'electron-vite' >/dev/null 2>&1
}

stop_web_processes() {
  local listener_pids
  listener_pids="$(lsof -tiTCP:"$WEB_PORT" -sTCP:LISTEN -n -P || true)"

  if [[ -n "$listener_pids" ]]; then
    kill $listener_pids >/dev/null 2>&1 || true
    sleep 2

    if lsof -tiTCP:"$WEB_PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      kill -9 $listener_pids >/dev/null 2>&1 || true
      sleep 2
    fi
  fi

  pkill -f '@proj-airi/stage-web' >/dev/null 2>&1 || true
  pkill -9 -f '@proj-airi/stage-web' >/dev/null 2>&1 || true
  pkill -f 'vite/bin/vite.js --host' >/dev/null 2>&1 || true
  pkill -9 -f 'vite/bin/vite.js --host' >/dev/null 2>&1 || true
  sleep 2
}

start_server() {
  if is_listening "$SERVER_PORT"; then
    printf 'AIRI server 已在 %s 埠啟動。\n' "$SERVER_PORT"
    return
  fi

  nohup bash -lc "cd \"$ROOT_DIR\" && pnpm dev:server" > "$SERVER_LOG" 2>&1 &
  sleep 3

  if ! is_listening "$SERVER_PORT"; then
    printf 'AIRI server 啟動失敗，請查看 %s\n' "$SERVER_LOG" >&2
    exit 1
  fi

  printf 'AIRI server 已啟動，日誌：%s\n' "$SERVER_LOG"
}

start_bridge() {
  if [[ ! -f "$BRIDGE_ENV_FILE" ]]; then
    printf '找不到 OpenClaw bridge 設定檔：%s\n' "$BRIDGE_ENV_FILE" >&2
    exit 1
  fi

  if is_bridge_running; then
    printf 'OpenClaw bridge 已在背景執行。\n'
    return
  fi

  nohup bash -lc "cd \"$ROOT_DIR\" && pnpm -F @proj-airi/openclaw-bridge start" > "$BRIDGE_LOG" 2>&1 &
  sleep 3

  if ! is_bridge_running; then
    printf 'OpenClaw bridge 啟動失敗，請查看 %s\n' "$BRIDGE_LOG" >&2
    exit 1
  fi

  printf 'OpenClaw bridge 已啟動，日誌：%s\n' "$BRIDGE_LOG"
}

start_web() {
  if is_listening "$WEB_PORT"; then
    if http_is_healthy "$WEB_URL"; then
      printf 'stage-web 已在 %s 埠啟動。\n' "$WEB_PORT"
      return
    fi

    printf '偵測到 %s 埠已有無回應的 stage-web，正在重啟。\n' "$WEB_PORT"
    stop_web_processes
    sleep 2
  fi

  nohup bash -lc "cd \"$ROOT_DIR\" && pnpm dev:web" > "$WEB_LOG" 2>&1 &
  sleep 5

  if ! is_listening "$WEB_PORT" || ! http_is_healthy "$WEB_URL"; then
    printf 'stage-web 啟動失敗，請查看 %s\n' "$WEB_LOG" >&2
    exit 1
  fi

  printf 'stage-web 已啟動，日誌：%s\n' "$WEB_LOG"
}

start_tamagotchi() {
  if is_tamagotchi_running; then
    printf 'stage-tamagotchi 已在背景執行。\n'
    return
  fi

  nohup bash -lc "cd \"$ROOT_DIR\" && pnpm dev:tamagotchi" > "$TAMAGOTCHI_LOG" 2>&1 &
  sleep 5

  if ! is_tamagotchi_running; then
    printf 'stage-tamagotchi 啟動失敗，請查看 %s\n' "$TAMAGOTCHI_LOG" >&2
    exit 1
  fi

  printf 'stage-tamagotchi 已啟動，日誌：%s\n' "$TAMAGOTCHI_LOG"
}

main() {
  require_command pnpm
  require_command nohup
  require_command pgrep
  require_command lsof
  require_command curl

  mkdir -p "$LOG_DIR"

  start_server
  start_bridge

  case "$TARGET" in
    web)
      start_web
      printf 'AIRI Web 已就緒： http://localhost:%s\n' "$WEB_PORT"
      ;;
    tamagotchi)
      start_tamagotchi
      printf 'AIRI Tamagotchi 已就緒。\n'
      ;;
    *)
      printf '用法：bash scripts/start-airi-openclaw.sh [web|tamagotchi]\n' >&2
      exit 1
      ;;
  esac

  printf '目前使用的 OpenClaw bridge 設定檔：%s\n' "$BRIDGE_ENV_FILE"
}

main "$@"
