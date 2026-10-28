#!/usr/bin/env bash
set -euo pipefail
GODOT="$(bash scripts/ci-godot.sh)"
PLATFORM="${1:?}"
ARCH="${2:?}"
PRESET="${3:?}"
MODE="${4:?}"
ARTIFACT_NAME="${5:?}"
OUT_DIR="dist/kirie/${PLATFORM}-${ARCH}"
mkdir -p "$OUT_DIR"
case "$PLATFORM" in
  windows) OUT_FILE="$OUT_DIR/AIRI-Kirie.exe" ;;
  macos) OUT_FILE="$OUT_DIR/AIRI-Kirie.app" ;;
  linux) OUT_FILE="$OUT_DIR/AIRI-Kirie" ;;
  *) echo "unknown platform $PLATFORM"; exit 1 ;;
esac
FLAG="--export-release"
[ "$MODE" = "debug" ] && FLAG="--export-debug"
"$GODOT" --headless $FLAG "$PRESET" "$OUT_FILE"
BUNDLE_DIR="bundle/${ARTIFACT_NAME}"
mkdir -p "$BUNDLE_DIR"
cp -a "$OUT_DIR"/. "$BUNDLE_DIR"/
(
  cd bundle
  if command -v zip >/dev/null 2>&1; then
    zip -r "${ARTIFACT_NAME}.zip" "${ARTIFACT_NAME}"
  else
    powershell -NoProfile -Command "Compress-Archive -Path '${ARTIFACT_NAME}' -DestinationPath '${ARTIFACT_NAME}.zip' -Force"
  fi
)
