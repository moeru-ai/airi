#!/usr/bin/env bash

set -euo pipefail

REMOTE_HOST="${KOKORO_REMOTE_HOST:-atom}"
CONTAINER_NAME="${KOKORO_CONTAINER_NAME:-kokoro-tts}"

ssh -o BatchMode=yes -o ConnectTimeout=8 "$REMOTE_HOST" "
  set -euo pipefail
  docker ps -a --filter name=^/${CONTAINER_NAME}\$ --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
"
