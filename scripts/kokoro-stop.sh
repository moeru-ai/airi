#!/usr/bin/env bash

set -euo pipefail

REMOTE_HOST="${KOKORO_REMOTE_HOST:-atom}"
CONTAINER_NAME="${KOKORO_CONTAINER_NAME:-kokoro-tts}"

ssh -o BatchMode=yes -o ConnectTimeout=8 "$REMOTE_HOST" "
  set -euo pipefail

  if docker ps --filter name=^/${CONTAINER_NAME}\$ --format '{{.Names}}' | grep -qx '${CONTAINER_NAME}'; then
    docker stop '${CONTAINER_NAME}' >/dev/null
    echo 'Stopped ${CONTAINER_NAME}.'
    exit 0
  fi

  if docker ps -a --filter name=^/${CONTAINER_NAME}\$ --format '{{.Names}}' | grep -qx '${CONTAINER_NAME}'; then
    echo '${CONTAINER_NAME} is already stopped.'
    exit 0
  fi

  echo '${CONTAINER_NAME} does not exist on ${REMOTE_HOST}.'
"
