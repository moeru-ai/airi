#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_HOST="${OPENCLAW_REMOTE_HOST:-atom}"
OPENCLAW_SERVICE_NAME="${OPENCLAW_SERVICE_NAME:-openclaw-gateway.service}"

cd "$ROOT_DIR"

echo '[1/3] Stopping AIRI web dev server...'
if pkill -f "pnpm dev" >/dev/null 2>&1; then
  echo 'Stopped AIRI web dev server.'
else
  echo 'AIRI web dev server was not running.'
fi

echo '[2/3] Stopping Kokoro on atom...'
pnpm kokoro:stop

echo '[3/3] Stopping OpenClaw on atom...'
ssh -o BatchMode=yes -o ConnectTimeout=8 "$REMOTE_HOST" "
  set -euo pipefail
  systemctl --user stop '${OPENCLAW_SERVICE_NAME}'
  if systemctl --user is-active '${OPENCLAW_SERVICE_NAME}' >/dev/null 2>&1; then
    echo '${OPENCLAW_SERVICE_NAME} is still running.'
    exit 1
  fi
  echo '${OPENCLAW_SERVICE_NAME} stopped.'
"
