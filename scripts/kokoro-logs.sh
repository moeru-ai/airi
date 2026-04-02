#!/usr/bin/env bash

set -euo pipefail

REMOTE_HOST="${KOKORO_REMOTE_HOST:-atom}"
CONTAINER_NAME="${KOKORO_CONTAINER_NAME:-kokoro-tts}"
TAIL_LINES="${KOKORO_TAIL_LINES:-120}"

ssh -o BatchMode=yes -o ConnectTimeout=8 "$REMOTE_HOST" "
  set -euo pipefail
  docker logs --tail '${TAIL_LINES}' '${CONTAINER_NAME}' 2>&1
"
