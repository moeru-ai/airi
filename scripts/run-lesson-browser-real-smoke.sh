#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WAIT_SCRIPT="${ROOT_DIR}/scripts/wait-for-lesson-backend.sh"
BACKEND_URL="${PEPTUTOR_LESSON_REAL_BACKEND_URL:-http://127.0.0.1:9625}"
WAIT_TIMEOUT="${PEPTUTOR_LESSON_REAL_BACKEND_WAIT_TIMEOUT:-120}"
EXPECT_DEBUG_SIGNALS="${VITE_PEPTUTOR_LESSON_EXPECT_DEBUG_SIGNALS:-1}"
LESSON_API_URL="${VITE_PEPTUTOR_LESSON_API_URL:-${BACKEND_URL}}"
SKIP_BUILD="${PEPTUTOR_LESSON_REAL_SMOKE_SKIP_BUILD:-0}"

if [[ ! -f "${WAIT_SCRIPT}" ]]; then
  echo "Missing lesson-backend wait script: ${WAIT_SCRIPT}" >&2
  exit 1
fi

if [[ "${SKIP_BUILD}" != "1" ]]; then
  (
    cd "${ROOT_DIR}"
    pnpm -r \
      --filter @proj-airi/plugin-protocol \
      --filter @proj-airi/i18n \
      --filter @proj-airi/pipelines-audio \
      --filter @proj-airi/stream-kit \
      --filter @proj-airi/server-shared \
      --filter @proj-airi/server-sdk \
      --filter @proj-airi/server-sdk-shared \
      --filter @proj-airi/server-schema \
      --filter @proj-airi/core-agent \
      --filter @proj-airi/vite-plugin-warpdrive \
      build
  )
fi

bash "${WAIT_SCRIPT}" --url "${BACKEND_URL}" --timeout "${WAIT_TIMEOUT}"

(
  cd "${ROOT_DIR}/apps/stage-web"
  VITE_PEPTUTOR_LESSON_REAL_BACKEND_SMOKE=1 \
  VITE_PEPTUTOR_LESSON_REAL_BACKEND_URL="${BACKEND_URL}" \
  VITE_PEPTUTOR_LESSON_API_URL="${LESSON_API_URL}" \
  VITE_PEPTUTOR_LESSON_EXPECT_DEBUG_SIGNALS="${EXPECT_DEBUG_SIGNALS}" \
  vitest run -c vitest.browser.config.ts src/pages/lesson/index.browser.test.ts --reporter verbose
)
