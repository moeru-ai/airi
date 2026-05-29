#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "${SCRIPT_DIR}/fixtures/server/stable"
mkdir -p "${SCRIPT_DIR}/fixtures/server/beta"
mkdir -p "${SCRIPT_DIR}/fixtures/server/alpha"
mkdir -p "${SCRIPT_DIR}/fixtures/server/nightly"
mkdir -p "${SCRIPT_DIR}/fixtures/server/canary"

chmod +x "${SCRIPT_DIR}/setup.sh" "${SCRIPT_DIR}/run-test.sh" "${SCRIPT_DIR}/run-matrix.sh"

echo "Prepared update-test fixtures in ${SCRIPT_DIR}/fixtures/server"
