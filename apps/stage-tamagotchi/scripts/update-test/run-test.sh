#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PORT="${PORT:-8787}"
CHANNEL="${CHANNEL:-stable}"
TARGET="${TARGET:-x86_64-pc-windows-msvc}"
VERSION="${VERSION:-9.9.9-update-test.1}"

bash "${SCRIPT_DIR}/setup.sh"

pnpm exec tsx "${SCRIPT_DIR}/generate-manifest.ts" \
  --root "${SCRIPT_DIR}/fixtures/server" \
  --channel "${CHANNEL}" \
  --target "${TARGET}" \
  --version "${VERSION}"

echo
echo "Start the local update server in another terminal:"
echo "pnpm exec tsx ${SCRIPT_DIR}/start-server.ts --port ${PORT} --root ${SCRIPT_DIR}/fixtures/server"
echo
echo "Launch AIRI against the mocked update server:"
echo "cd ${APP_DIR}"
echo "UPDATE_SERVER_URL=http://127.0.0.1:${PORT}/${CHANNEL} pnpm run dev"
echo
echo "Verify:"
echo "1. About page shows an available update."
echo "2. Download reaches the downloaded state."
echo "3. Settings > System > Developer enables updater diagnostics."
echo "4. Devtools > Updater shows overrideActive=true and the local feed URL."
