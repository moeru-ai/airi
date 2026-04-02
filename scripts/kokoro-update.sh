#!/usr/bin/env bash

set -euo pipefail

REMOTE_HOST="${KOKORO_REMOTE_HOST:-atom}"
REMOTE_DIR="${KOKORO_REMOTE_DIR:-/home/ben/AI_PROJECTS/Kokoro-FastAPI}"
CONTAINER_NAME="${KOKORO_CONTAINER_NAME:-kokoro-tts}"
IMAGE_NAME="${KOKORO_IMAGE_NAME:-kokoro-fastapi-gpu-local}"
PORT="${KOKORO_PORT:-8880}"

ssh -o BatchMode=yes -o ConnectTimeout=8 "$REMOTE_HOST" "
  set -euo pipefail

  cd '${REMOTE_DIR}'

  git pull --ff-only
  docker build -f docker/gpu/Dockerfile -t '${IMAGE_NAME}' .
  docker rm -f '${CONTAINER_NAME}' >/dev/null 2>&1 || true
  docker run -d \
    --name '${CONTAINER_NAME}' \
    --restart unless-stopped \
    --gpus all \
    -p '${PORT}:8880' \
    '${IMAGE_NAME}' >/dev/null

  echo 'Updated source, rebuilt ${IMAGE_NAME}, and restarted ${CONTAINER_NAME}.'
"
