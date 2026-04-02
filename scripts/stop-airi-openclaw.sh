#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-web}"

SERVER_PORT="${AIRI_SERVER_PORT:-6121}"
WEB_PORT="${AIRI_WEB_PORT:-5173}"

stop_by_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN -n -P || true)"

  if [[ -n "$pids" ]]; then
    kill $pids >/dev/null 2>&1 || true
    sleep 2

    if lsof -tiTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      kill -9 $pids >/dev/null 2>&1 || true
      sleep 2
    fi
  fi
}

stop_server() {
  stop_by_port "$SERVER_PORT"
  pkill -f '@proj-airi/server-runtime' >/dev/null 2>&1 || true
  pkill -9 -f '@proj-airi/server-runtime' >/dev/null 2>&1 || true
  printf 'AIRI server 停止完成。\n'
}

stop_bridge() {
  pkill -f 'pnpm -F @proj-airi/openclaw-bridge start' >/dev/null 2>&1 || true
  pkill -f '@proj-airi/openclaw-bridge exec tsx src/main.ts' >/dev/null 2>&1 || true
  pkill -9 -f '@proj-airi/openclaw-bridge exec tsx src/main.ts' >/dev/null 2>&1 || true
  printf 'OpenClaw bridge 停止完成。\n'
}

stop_web() {
  stop_by_port "$WEB_PORT"
  pkill -f '@proj-airi/stage-web' >/dev/null 2>&1 || true
  pkill -9 -f '@proj-airi/stage-web' >/dev/null 2>&1 || true
  pkill -f 'vite/bin/vite.js --host' >/dev/null 2>&1 || true
  pkill -9 -f 'vite/bin/vite.js --host' >/dev/null 2>&1 || true
  printf 'stage-web 停止完成。\n'
}

stop_tamagotchi() {
  pkill -f '@proj-airi/stage-tamagotchi' >/dev/null 2>&1 || true
  pkill -9 -f '@proj-airi/stage-tamagotchi' >/dev/null 2>&1 || true
  pkill -f 'electron-vite' >/dev/null 2>&1 || true
  pkill -9 -f 'electron-vite' >/dev/null 2>&1 || true
  printf 'stage-tamagotchi 停止完成。\n'
}

main() {
  case "$TARGET" in
    web)
      stop_web
      ;;
    tamagotchi)
      stop_tamagotchi
      ;;
    *)
      printf '用法：bash scripts/stop-airi-openclaw.sh [web|tamagotchi]\n' >&2
      exit 1
      ;;
  esac

  stop_bridge
  stop_server

  printf 'AIRI OpenClaw 開發環境已停止。\n'
  printf '專案根目錄：%s\n' "$ROOT_DIR"
}

main "$@"
