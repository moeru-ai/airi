#!/usr/bin/env bash
set -euo pipefail
ARTIFACT_NAME="${1:?}"
mise x -- pnpm kirie export android --no-build
BUNDLE_DIR="bundle/${ARTIFACT_NAME}"
mkdir -p "$BUNDLE_DIR"
found="$(find dist/kirie/android -type f \( -name '*.apk' -o -name '*.aab' \) 2>/dev/null | head -n 1 || true)"
[ -n "$found" ] || { find dist -type f | head -n 100 || true; exit 1; }
cp -a "$found" "$BUNDLE_DIR/${ARTIFACT_NAME}.apk"
( cd bundle && zip -r "${ARTIFACT_NAME}.zip" "${ARTIFACT_NAME}" )
