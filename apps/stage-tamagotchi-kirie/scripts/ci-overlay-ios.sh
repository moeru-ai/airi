#!/usr/bin/env bash
set -euo pipefail
VER="$(bash scripts/ci-kirie-ver.sh)"
TMP="$(mktemp -d)"
curl -fsSL "https://github.com/gd-kirie/gd-kirie/releases/download/v${VER}/kirie-addon.zip" -o "$TMP/kirie-addon.zip"
unzip -o "$TMP/kirie-addon.zip" "addons/kirie/ios/*" -d .
test -d addons/kirie/ios/Kirie.release.xcframework
