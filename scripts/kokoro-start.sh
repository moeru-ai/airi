#!/usr/bin/env bash

set -euo pipefail

REMOTE_HOST="${KOKORO_REMOTE_HOST:-atom}"
CONTAINER_NAME="${KOKORO_CONTAINER_NAME:-kokoro-tts}"
IMAGE_NAME="${KOKORO_IMAGE_NAME:-kokoro-fastapi-gpu-local}"
PORT="${KOKORO_PORT:-8880}"

ssh -o BatchMode=yes -o ConnectTimeout=8 "$REMOTE_HOST" "
  set -euo pipefail

  if docker ps --filter name=^/${CONTAINER_NAME}\$ --format '{{.Names}}' | grep -qx '${CONTAINER_NAME}'; then
    echo '${CONTAINER_NAME} is already running.'
    exit 0
  fi

  if docker ps -a --filter name=^/${CONTAINER_NAME}\$ --format '{{.Names}}' | grep -qx '${CONTAINER_NAME}'; then
    docker start '${CONTAINER_NAME}' >/dev/null
    echo 'Started existing container ${CONTAINER_NAME}.'
    exit 0
  fi

  if ! docker image inspect '${IMAGE_NAME}' >/dev/null 2>&1; then
    echo 'Image ${IMAGE_NAME} not found on ${REMOTE_HOST}. Build it first.'
    exit 1
  fi

  docker run -d \
    --name '${CONTAINER_NAME}' \
    --restart unless-stopped \
    --gpus all \
    -p '${PORT}:8880' \
    '${IMAGE_NAME}' >/dev/null

  echo 'Created and started ${CONTAINER_NAME} on port ${PORT}.'
"
