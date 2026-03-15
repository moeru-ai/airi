#! /usr/bin/env bash

set -eux

cd "$(dirname "${BASH_SOURCE[0]}")"
:> pnpm-deps-hash.txt # Clear hash to trigger rebuild
BUILD_LOG="$(mktemp)"
nix build -L ..#airi.pnpmDeps |& tee "$BUILD_LOG"
grep -oP 'got: +\K\S+' "$BUILD_LOG" > pnpm-deps-hash.txt
