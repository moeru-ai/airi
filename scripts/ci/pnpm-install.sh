#!/usr/bin/env bash
set -euo pipefail

attempts="${CI_PNPM_INSTALL_RETRIES:-3}"
base_delay_sec="${CI_PNPM_INSTALL_DELAY_SEC:-10}"

# CI only needs package metadata for these jobs; skipping heavyweight downloads
# makes installs less flaky when upstream mirrors return transient 5xx responses.
export ELECTRON_SKIP_BINARY_DOWNLOAD="${ELECTRON_SKIP_BINARY_DOWNLOAD:-1}"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD="${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-1}"
export npm_config_fetch_retries="${npm_config_fetch_retries:-5}"
export npm_config_fetch_retry_factor="${npm_config_fetch_retry_factor:-2}"
export npm_config_fetch_retry_mintimeout="${npm_config_fetch_retry_mintimeout:-10000}"
export npm_config_fetch_retry_maxtimeout="${npm_config_fetch_retry_maxtimeout:-120000}"

for attempt in $(seq 1 "$attempts"); do
  echo "[ci-install] pnpm install attempt ${attempt}/${attempts}"
  if pnpm install --frozen-lockfile; then
    exit 0
  fi

  if [ "$attempt" -eq "$attempts" ]; then
    echo "[ci-install] pnpm install failed after ${attempts} attempts" >&2
    exit 1
  fi

  sleep_sec=$((base_delay_sec * attempt))
  echo "[ci-install] retrying in ${sleep_sec}s"
  sleep "$sleep_sec"
done
