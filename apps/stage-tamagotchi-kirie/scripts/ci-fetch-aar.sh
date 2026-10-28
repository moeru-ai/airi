#!/usr/bin/env bash
set -euo pipefail
VER="$(bash scripts/ci-kirie-ver.sh)"
DEST="addons/kirie/libraries/android/Kirie-release.aar"
mkdir -p "$(dirname "$DEST")"
curl -fsSL "https://repo1.maven.org/maven2/moe/gdkirie/kirie/core/${VER}/core-${VER}.aar" -o "$DEST"
if [ "$VER" = "0.15.2" ]; then
  echo "e6ea3b04183e57c46ea4e2fd0d8e89e53c5d47c67980b3f33ccacefac7081869  $DEST" | sha256sum -c -
fi
test -f "$DEST"
