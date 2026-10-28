#!/usr/bin/env bash
set -euo pipefail
ARTIFACT_NAME="${1:?}"
GODOT="$(bash scripts/ci-godot.sh)"
OUT_DIR="dist/kirie/ios"
mkdir -p "$OUT_DIR"
"$GODOT" --headless --export-debug "iOS" "$OUT_DIR/debug.xcodeproj"
BUNDLE_DIR="bundle/${ARTIFACT_NAME}"
mkdir -p "$BUNDLE_DIR"
cp -a "$OUT_DIR"/. "$BUNDLE_DIR"/
( cd bundle && zip -r "${ARTIFACT_NAME}.zip" "${ARTIFACT_NAME}" )
