#!/usr/bin/env bash
set -euo pipefail
VERSION="${GODOT_VERSION:?}"
CHANNEL=stable
VARIANT=mono
NAME="${VERSION}.${CHANNEL}.${VARIANT}"
case "${RUNNER_OS}" in
  macOS) DEST="${HOME}/Library/Application Support/Godot/export_templates/${NAME}" ;;
  *) DEST="${HOME}/.local/share/godot/export_templates/${NAME}" ;;
esac
[ -d "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null || true)" ] && exit 0
URL="https://github.com/godotengine/godot-builds/releases/download/${VERSION}-${CHANNEL}/Godot_v${VERSION}-${CHANNEL}_${VARIANT}_export_templates.tpz"
TMP="$(mktemp -d)"
curl -fsSL -o "$TMP/templates.tpz" "$URL"
mkdir -p "$TMP/extracted" "$(dirname "$DEST")"
unzip -q "$TMP/templates.tpz" -d "$TMP/extracted"
rm -rf "$DEST"
mv "$TMP/extracted/templates" "$DEST"
