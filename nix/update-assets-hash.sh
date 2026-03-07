#! /usr/bin/env bash

set -eux

cd "$(dirname "${BASH_SOURCE[0]}")"
# Set fake hash to trigger rebuild
echo -n "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" > assets-hash.txt
BUILD_LOG="$(mktemp)"
nix build -L ..#airi.assets |& tee "$BUILD_LOG"
grep -oP 'got: +\K\S+' "$BUILD_LOG" > assets-hash.txt
