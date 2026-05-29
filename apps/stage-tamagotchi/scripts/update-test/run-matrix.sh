#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
APP_BIN="${APP_DIR}/dist/mac-arm64/airi.app/Contents/MacOS/airi"

PORT="${PORT:-8787}"
RUN_SECONDS="${RUN_SECONDS:-18}"
LOG_DIR="${LOG_DIR:-${SCRIPT_DIR}/artifacts/matrix-$(date +%Y%m%d-%H%M%S)}"
SUMMARY_TSV="${LOG_DIR}/summary.tsv"
SUMMARY_MD="${LOG_DIR}/summary.md"

LANES=(stable beta alpha nightly)
RUNTIME_MODES=(override github)

mkdir -p "${LOG_DIR}"
printf "mode\tlane\tstatus\treason\tsummary\n" > "${SUMMARY_TSV}"

if [[ ! -x "${APP_BIN}" ]]; then
  echo "Packaged app not found: ${APP_BIN}"
  echo "Build first: rm -rf apps/stage-tamagotchi/dist && pnpm -F @proj-airi/stage-tamagotchi build:mac"
  exit 1
fi

cd "${REPO_ROOT}"

echo "==> Running updater matrix unit tests (includes bundle-version matrix)"
pnpm exec vitest run \
  apps/stage-tamagotchi/src/main/services/electron/auto-updater.test.ts \
  apps/stage-tamagotchi/scripts/update-test/generate-manifest.test.ts

echo "==> Preparing fixture directories"
bash "${SCRIPT_DIR}/setup.sh"

echo "==> Generating local update fixtures for lanes: ${LANES[*]}"
for lane in "${LANES[@]}"; do
  pnpm -F @proj-airi/stage-tamagotchi update-test:generate \
    --root scripts/update-test/fixtures/server \
    --channel "${lane}" \
    --target aarch64-apple-darwin \
    --version "9.9.9-${lane}.1" \
    --release-notes "mock ${lane}"
done

echo "==> Starting local update-test server on port ${PORT}"
pnpm -F @proj-airi/stage-tamagotchi update-test:server \
  --port "${PORT}" \
  --root scripts/update-test/fixtures/server \
  > "${LOG_DIR}/server.log" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "${SERVER_PID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for lane in "${LANES[@]}"; do
  for _ in {1..40}; do
    if curl -fsS "http://127.0.0.1:${PORT}/${lane}/latest-arm64-mac.yml" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
done

run_case() {
  local mode="$1"
  local lane="$2"
  local log_file="${LOG_DIR}/${mode}-${lane}.log"
  local app_pid=""

  echo "==> Running mode=${mode}, lane=${lane}"
  if [[ "${mode}" == "override" ]]; then
    UPDATE_SERVER_URL="http://127.0.0.1:${PORT}/${lane}" AIRI_UPDATE_CHANNEL="${lane}" "${APP_BIN}" > "${log_file}" 2>&1 &
    app_pid=$!
  else
    AIRI_UPDATE_CHANNEL="${lane}" "${APP_BIN}" > "${log_file}" 2>&1 &
    app_pid=$!
  fi

  sleep "${RUN_SECONDS}"
  kill "${app_pid}" >/dev/null 2>&1 || true
  for _ in {1..20}; do
    if ! kill -0 "${app_pid}" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
  if kill -0 "${app_pid}" >/dev/null 2>&1; then
    kill -KILL "${app_pid}" >/dev/null 2>&1 || true
  fi
  wait "${app_pid}" 2>/dev/null || true

  local matched
  local status="GREEN"
  local reason="ok"
  matched="$(rg -n "auto-updater|applied generic feed override|checkForUpdates\\(\\) failed|No published versions on GitHub|update-available|update-not-available" "${log_file}" || true)"
  if [[ -z "${matched}" ]]; then
    status="RED"
    reason="no-updater-log"
    echo "  [warn] no updater logs matched in ${log_file}"
  else
    echo "${matched}" > "${LOG_DIR}/${mode}-${lane}.summary.log"
    if rg -q "checkForUpdates\\(\\) failed|No published versions on GitHub|No GitHub release found|Cannot find channel|HttpError: 404|\\[error\\]" "${LOG_DIR}/${mode}-${lane}.summary.log"; then
      status="RED"
      reason="updater-error"
    fi
    echo "  [ok] summary: ${LOG_DIR}/${mode}-${lane}.summary.log"
  fi
  printf "%s\t%s\t%s\t%s\t%s\n" "${mode}" "${lane}" "${status}" "${reason}" "${LOG_DIR}/${mode}-${lane}.summary.log" >> "${SUMMARY_TSV}"
}

for mode in "${RUNTIME_MODES[@]}"; do
  for lane in "${LANES[@]}"; do
    run_case "${mode}" "${lane}"
  done
done

{
  echo "| mode | lane | status | reason | summary |"
  echo "|---|---|---|---|---|"
  tail -n +2 "${SUMMARY_TSV}" | while IFS=$'\t' read -r mode lane status reason summary; do
    echo "| ${mode} | ${lane} | ${status} | ${reason} | ${summary} |"
  done
} > "${SUMMARY_MD}"

echo
echo "Matrix run complete."
echo "Artifacts:"
echo "- ${LOG_DIR}"
echo "- ${LOG_DIR}/server.log"
echo "- ${LOG_DIR}/*.summary.log"
echo "- ${SUMMARY_MD}"
