#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_HOST="${OPENCLAW_REMOTE_HOST:-atom}"
OPENCLAW_SERVICE_NAME="${OPENCLAW_SERVICE_NAME:-openclaw-gateway.service}"
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
NODE_VERSION="${AIRI_NODE_VERSION:-24.13.0}"
LOG_FILE="${AIRI_DEV_LOG_FILE:-/tmp/airi-pnpm-dev.log}"

cd "$ROOT_DIR"

echo '[1/3] Starting Kokoro on atom...'
pnpm kokoro:start

echo '[2/3] Starting OpenClaw on atom...'
ssh -o BatchMode=yes -o ConnectTimeout=8 "$REMOTE_HOST" "
  set -euo pipefail
  systemctl --user start '${OPENCLAW_SERVICE_NAME}'
  systemctl --user is-active '${OPENCLAW_SERVICE_NAME}'
"

echo '[3/3] Starting AIRI web dev server...'
if lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo 'AIRI web dev server is already listening on port 5173.'
  exit 0
fi

export NVM_DIR
. "$NVM_DIR/nvm.sh"
nvm use "$NODE_VERSION" >/dev/null

nohup pnpm dev >"$LOG_FILE" 2>&1 &

echo "AIRI web dev server started in background. Log: $LOG_FILE"
